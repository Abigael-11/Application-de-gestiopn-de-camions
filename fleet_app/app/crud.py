from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta, timezone
from fastapi import HTTPException

def maintenant_utc() -> datetime:
    """Retourne un datetime timezone-aware (UTC) -- cohérent avec les colonnes
    TIMESTAMP(timezone=True) de Postgres. Ne jamais utiliser datetime.utcnow()
    (naive) dans ce fichier, ça casse les soustractions de dates."""
    return datetime.now(timezone.utc)

from app import models, schemas


# ---------- Camions ----------

def create_camion(db: Session, camion: schemas.CamionCreate) -> models.Camion:
    db_camion = models.Camion(**camion.model_dump())
    db.add(db_camion)
    db.commit()
    db.refresh(db_camion)
    return db_camion


def list_camions(db: Session, inclure_inactifs: bool = False):
    query = db.query(models.Camion)
    if not inclure_inactifs:
        query = query.filter(models.Camion.actif == True)  # noqa: E712
    return query.all()


def get_camion(db: Session, camion_id: int) -> models.Camion:
    camion = db.query(models.Camion).filter(models.Camion.id == camion_id).first()
    if not camion:
        raise HTTPException(status_code=404, detail="Camion introuvable")
    return camion


def update_camion(db: Session, camion_id: int, updates: schemas.CamionUpdate) -> models.Camion:
    camion = get_camion(db, camion_id)
    for champ, valeur in updates.model_dump(exclude_unset=True).items():
        setattr(camion, champ, valeur)
    db.commit()
    db.refresh(camion)
    return camion


def supprimer_camion(db: Session, camion_id: int):
    """
    Suppression définitive -- autorisée SEULEMENT si aucun historique n'est
    lié à ce camion (pour ne jamais perdre de traçabilité par accident).
    Sinon, on invite à désactiver le camion à la place (réversible).
    """
    camion = get_camion(db, camion_id)
    nb_historique = db.query(models.HistoriqueEtat).filter(
        models.HistoriqueEtat.camion_id == camion_id
    ).count()
    if nb_historique > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Impossible de supprimer : {nb_historique} ligne(s) d'historique liée(s) à ce camion. "
                   f"Désactivez-le plutôt (l'historique sera conservé).",
        )
    db.delete(camion)
    db.commit()


# ---------- États de référence ----------

def get_etat_by_code(db: Session, code: str) -> models.EtatReference:
    etat = db.query(models.EtatReference).filter(models.EtatReference.code == code).first()
    if not etat:
        raise HTTPException(status_code=400, detail=f"État inconnu: '{code}'")
    return etat


def list_etats_reference(db: Session):
    return db.query(models.EtatReference).all()


# ---------- Le cœur du système : changement d'état ----------

def get_etat_en_cours(db: Session, camion_id: int):
    """Retourne la ligne d'historique actuellement ouverte pour ce camion (ou None)."""
    return (
        db.query(models.HistoriqueEtat)
        .filter(
            models.HistoriqueEtat.camion_id == camion_id,
            models.HistoriqueEtat.date_fin.is_(None),
        )
        .first()
    )


def changer_etat(db: Session, camion_id: int, changement: schemas.ChangementEtat):
    """
    Opération centrale de l'application.
    1) Ferme la ligne d'état en cours (si elle existe)
    2) Ouvre une nouvelle ligne pour le nouvel état
    Le tout dans une seule transaction pour ne jamais avoir de "trou" dans l'historique.
    """
    get_camion(db, camion_id)  # vérifie que le camion existe (404 sinon)
    nouvel_etat = get_etat_by_code(db, changement.etat_code)

    try:
        maintenant = maintenant_utc()

        etat_en_cours = get_etat_en_cours(db, camion_id)
        if etat_en_cours:
            if etat_en_cours.etat_id == nouvel_etat.id:
                raise HTTPException(
                    status_code=400,
                    detail="Le camion est déjà dans cet état.",
                )
            etat_en_cours.date_fin = maintenant

        nouvelle_ligne = models.HistoriqueEtat(
            camion_id=camion_id,
            etat_id=nouvel_etat.id,
            date_debut=maintenant,
            lieu=changement.lieu,
            marchandise=changement.marchandise,
            motif=changement.motif,
            saisi_par=changement.saisi_par,
        )
        db.add(nouvelle_ligne)
        db.commit()
        db.refresh(nouvelle_ligne)
        return nouvelle_ligne

    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Erreur lors du changement d'état: {e}")


def get_historique_camion(db: Session, camion_id: int, depuis: datetime = None):
    query = db.query(models.HistoriqueEtat).filter(models.HistoriqueEtat.camion_id == camion_id)
    if depuis:
        query = query.filter(models.HistoriqueEtat.date_debut >= depuis)
    return query.order_by(models.HistoriqueEtat.date_debut.desc()).all()


def get_statut_actuel(db: Session, camion: models.Camion) -> schemas.CamionStatutActuel:
    ligne_en_cours = get_etat_en_cours(db, camion.id)
    if not ligne_en_cours:
        return schemas.CamionStatutActuel(camion=camion, etat_actuel=None, depuis=None, duree_dans_etat_heures=None)

    duree = (maintenant_utc() - ligne_en_cours.date_debut).total_seconds() / 3600
    return schemas.CamionStatutActuel(
        camion=camion,
        etat_actuel=ligne_en_cours.etat,
        depuis=ligne_en_cours.date_debut,
        duree_dans_etat_heures=round(duree, 1),
    )


def get_camions_disponibles(db: Session, code_etat_disponible: str = "disponible"):
    """Renvoie les camions dont l'état actuel correspond à 'disponible'."""
    etat_dispo = get_etat_by_code(db, code_etat_disponible)
    lignes = (
        db.query(models.HistoriqueEtat)
        .filter(
            models.HistoriqueEtat.date_fin.is_(None),
            models.HistoriqueEtat.etat_id == etat_dispo.id,
        )
        .all()
    )
    return [ligne.camion for ligne in lignes]


# ---------- Statistiques : durée moyenne par état ----------

def get_duree_moyenne_par_etat(db: Session, camion_id: int = None, depuis: datetime = None):
    """
    Calcule la durée moyenne (en heures) passée dans chaque état,
    uniquement sur les périodes déjà terminées (date_fin non nulle).
    Filtrable par camion et/ou par période.
    """
    duree_expr = func.extract(
        "epoch", models.HistoriqueEtat.date_fin - models.HistoriqueEtat.date_debut
    ) / 3600.0

    query = (
        db.query(
            models.EtatReference.code.label("etat_code"),
            models.EtatReference.libelle.label("etat_libelle"),
            func.avg(duree_expr).label("duree_moyenne_heures"),
            func.count(models.HistoriqueEtat.id).label("nombre_occurrences"),
        )
        .join(models.HistoriqueEtat, models.HistoriqueEtat.etat_id == models.EtatReference.id)
        .filter(models.HistoriqueEtat.date_fin.isnot(None))
    )

    if camion_id:
        query = query.filter(models.HistoriqueEtat.camion_id == camion_id)
    if depuis:
        query = query.filter(models.HistoriqueEtat.date_debut >= depuis)

    resultats = query.group_by(models.EtatReference.code, models.EtatReference.libelle).all()

    return [
        schemas.DureeMoyenneParEtat(
            etat_code=r.etat_code,
            etat_libelle=r.etat_libelle,
            duree_moyenne_heures=round(r.duree_moyenne_heures or 0, 1),
            nombre_occurrences=r.nombre_occurrences,
        )
        for r in resultats
    ]
