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


def get_historique_camion(db: Session, camion_id: int, depuis: datetime = None, jusqu_a: datetime = None):
    query = db.query(models.HistoriqueEtat).filter(models.HistoriqueEtat.camion_id == camion_id)
    if jusqu_a:
        # Plage explicite (date_debut -> date_fin) : utilisé pour croiser une mission
        # précise avec l'historique d'état sur sa fenêtre de trajet réelle.
        query = query.filter(models.HistoriqueEtat.date_debut <= jusqu_a)
        if depuis:
            query = query.filter(
                (models.HistoriqueEtat.date_fin == None) | (models.HistoriqueEtat.date_fin >= depuis)
            )
    elif depuis:
        # Comportement historique inchangé (depuis_jours) — ne pas toucher
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
        lieu=ligne_en_cours.lieu,
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

def get_repartition_categorie_dg(db: Session, camion_id: int = None, depuis: datetime = None):
    """
    Temps total (en heures) passé dans chaque categorie_dg (les 7 catégories
    demandées par le DG : Driving, Loading and offloading, Breakdown, etc.).
    Les périodes en cours (date_fin NULL) comptent jusqu'à maintenant.
    """
    fin_effective = func.coalesce(models.HistoriqueEtat.date_fin, func.now())
    duree_expr = func.extract(
        "epoch", fin_effective - models.HistoriqueEtat.date_debut
    ) / 3600.0

    query = (
        db.query(
            models.EtatReference.categorie_dg.label("categorie_dg"),
            func.sum(duree_expr).label("duree_totale_heures"),
        )
        .join(models.HistoriqueEtat, models.HistoriqueEtat.etat_id == models.EtatReference.id)
        .filter(models.EtatReference.categorie_dg.isnot(None))
    )

    if camion_id:
        query = query.filter(models.HistoriqueEtat.camion_id == camion_id)
    if depuis:
        query = query.filter(models.HistoriqueEtat.date_debut >= depuis)

    resultats = query.group_by(models.EtatReference.categorie_dg).all()

    return [
        schemas.RepartitionCategorieDg(
            categorie_dg=r.categorie_dg,
            duree_totale_heures=round(r.duree_totale_heures or 0, 1),
        )
        for r in resultats
    ]

def list_chauffeurs(db: Session, inclure_inactifs: bool = False):
    query = db.query(models.Chauffeur)
    if not inclure_inactifs:
        query = query.filter(models.Chauffeur.actif == True)  # noqa: E712
    return query.all()


def create_chauffeur(db: Session, chauffeur: schemas.ChauffeurCreate) -> models.Chauffeur:
    db_chauffeur = models.Chauffeur(**chauffeur.model_dump())
    db.add(db_chauffeur)
    db.commit()
    db.refresh(db_chauffeur)
    return db_chauffeur


def update_chauffeur(db: Session, chauffeur_id: int, updates: schemas.ChauffeurUpdate) -> models.Chauffeur:
    chauffeur = db.query(models.Chauffeur).filter(models.Chauffeur.id == chauffeur_id).first()
    if not chauffeur:
        raise HTTPException(status_code=404, detail="Chauffeur introuvable")
    for champ, valeur in updates.model_dump(exclude_unset=True).items():
        setattr(chauffeur, champ, valeur)
    db.commit()
    db.refresh(chauffeur)

    # Si on vient d'affecter ce chauffeur à un camion, on synchronise
    # le champ chauffeur_actuel du camion pour que le tableau de bord reste cohérent
    if chauffeur.camion_id:
        camion = db.query(models.Camion).filter(models.Camion.id == chauffeur.camion_id).first()
        if camion:
            camion.chauffeur_actuel = f"{chauffeur.prenom} {chauffeur.nom}"
            db.commit()
    return chauffeur


def list_missions(db: Session, statut: str = None):
    query = db.query(models.Mission)
    if statut:
        query = query.filter(models.Mission.statut == statut)
    return query.order_by(models.Mission.date_depart_prevue.desc().nullslast()).all()

def _rendre_aware(dt):
    """Ajoute le fuseau UTC à un datetime naïf, sans toucher à ceux déjà avec fuseau."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _verifier_chevauchement_mission(db: Session, mission_data: dict, mission_id_a_ignorer: int = None):
    """
    Vérifie que le camion, la remorque et le chauffeur ne sont pas déjà
    affectés à une autre mission dont la période se chevauche.
    Une mission sans date_arrivee_reelle est considérée comme occupant
    le véhicule indéfiniment à partir de son départ.
    Ignore les missions 'annulee' (jamais eu lieu).
    """
    depart = _rendre_aware(mission_data.get("date_depart_prevue"))
    fin = _rendre_aware(mission_data.get("date_arrivee_reelle"))
    if not depart:
        return

    fin_effective = fin or datetime(9999, 12, 31, tzinfo=timezone.utc)

    champs_a_verifier = {
        "camion_id": "Le tracteur",
        "remorque_id": "La remorque",
        "chauffeur_id": "Le chauffeur",
    }

    query_base = db.query(models.Mission).filter(models.Mission.statut != "annulee")
    if mission_id_a_ignorer:
        query_base = query_base.filter(models.Mission.id != mission_id_a_ignorer)

    for champ, libelle in champs_a_verifier.items():
        valeur = mission_data.get(champ)
        if not valeur:
            continue

        candidates = query_base.filter(getattr(models.Mission, champ) == valeur).all()
        for autre in candidates:
            autre_debut = _rendre_aware(autre.date_depart_prevue)
            if not autre_debut:
                continue
            autre_fin = _rendre_aware(autre.date_arrivee_reelle) or datetime(9999, 12, 31, tzinfo=timezone.utc)

            if depart < autre_fin and autre_debut < fin_effective:
                raise HTTPException(
                    status_code=400,
                    detail=f"{libelle} est déjà affecté à la mission #{autre.id} "
                           f"({autre.client or 'sans client'}, du "
                           f"{autre_debut.strftime('%d/%m/%Y %H:%M')} au "
                           f"{'indéfini' if not autre.date_arrivee_reelle else autre_fin.strftime('%d/%m/%Y %H:%M')}).",
                )
def create_mission(db: Session, mission: schemas.MissionCreate) -> models.Mission:
    mission_data = mission.model_dump()
    _verifier_chevauchement_mission(db, mission_data)
    db_mission = models.Mission(**mission_data)
    db.add(db_mission)
    db.commit()
    db.refresh(db_mission)
    return db_mission


def update_mission(db: Session, mission_id: int, updates: schemas.MissionUpdate) -> models.Mission:
    mission = db.query(models.Mission).filter(models.Mission.id == mission_id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="Mission introuvable")

    updates_dict = updates.model_dump(exclude_unset=True)

    # Fusionne l'état actuel + les nouvelles valeurs pour vérifier avec les données finales
    mission_data_complete = {
        "camion_id": updates_dict.get("camion_id", mission.camion_id),
        "remorque_id": updates_dict.get("remorque_id", mission.remorque_id),
        "chauffeur_id": updates_dict.get("chauffeur_id", mission.chauffeur_id),
        "date_depart_prevue": updates_dict.get("date_depart_prevue", mission.date_depart_prevue),
        "date_arrivee_reelle": updates_dict.get("date_arrivee_reelle", mission.date_arrivee_reelle),
    }
    _verifier_chevauchement_mission(db, mission_data_complete, mission_id_a_ignorer=mission_id)

    for champ, valeur in updates_dict.items():
        setattr(mission, champ, valeur)
    db.commit()
    db.refresh(mission)
    return mission

def supprimer_mission(db: Session, mission_id: int):
    mission = db.query(models.Mission).filter(models.Mission.id == mission_id).first()
    if not mission:
        raise HTTPException(status_code=404, detail="Mission introuvable")
    if mission.statut != "planifiee":
        raise HTTPException(
            status_code=400,
            detail="Seule une mission encore 'planifiée' (pas commencée) peut être supprimée. Annulez-la plutôt.",
        )
    db.delete(mission)
    db.commit()



def get_repartition_categorie_dg(db: Session, camion_id: int = None, depuis: datetime = None):
    """
    Ventile le temps par les 7 categories DG (Driving, Loading and offloading,
    Breakdown, Workshop empty/Loaded, Waiting fuel, Waiting for documents,
    Accident), a partir des memes donnees que get_duree_moyenne_par_etat.
    """
    duree_expr = func.extract(
        "epoch", models.HistoriqueEtat.date_fin - models.HistoriqueEtat.date_debut
    ) / 3600.0

    query = (
        db.query(
            models.EtatReference.categorie_dg.label("categorie_dg"),
            func.sum(duree_expr).label("duree_totale_heures"),
            func.count(models.HistoriqueEtat.id).label("nombre_occurrences"),
        )
        .join(models.HistoriqueEtat, models.HistoriqueEtat.etat_id == models.EtatReference.id)
        .filter(models.HistoriqueEtat.date_fin.isnot(None))
        .filter(models.EtatReference.categorie_dg.isnot(None))
    )

    if camion_id:
        query = query.filter(models.HistoriqueEtat.camion_id == camion_id)
    if depuis:
        query = query.filter(models.HistoriqueEtat.date_debut >= depuis)

    resultats = query.group_by(models.EtatReference.categorie_dg).all()

    return [
        {
            "categorie_dg": r.categorie_dg,
            "duree_totale_heures": round(r.duree_totale_heures or 0, 1),
            "nombre_occurrences": r.nombre_occurrences,
        }
        for r in resultats
    ]


def supprimer_camion_definitif(db: Session, camion_id: int):
    """
    Suppression DÉFINITIVE et IRRÉVERSIBLE d'un camion, réservée à super_admin.
    Supprime tout l'historique lié (perte de traçabilité assumée).
    Détache (camion_id = NULL) les missions et chauffeurs liés plutôt que
    de les supprimer eux aussi.
    """
    camion = get_camion(db, camion_id)
    if not camion:
        raise HTTPException(status_code=404, detail="Camion introuvable")

    db.query(models.HistoriqueEtat).filter(
        models.HistoriqueEtat.camion_id == camion_id
    ).delete()

    db.query(models.Mission).filter(
        models.Mission.camion_id == camion_id
    ).update({"camion_id": None})

    db.query(models.Chauffeur).filter(
        models.Chauffeur.camion_id == camion_id
    ).update({"camion_id": None})

    db.delete(camion)
    db.commit()


def supprimer_utilisateur_definitif(db: Session, utilisateur_id: int):
    """
    Suppression DÉFINITIVE d'un utilisateur, réservée à super_admin.
    saisi_par est un champ texte libre (pas de clé étrangère) : aucune
    cascade n'est nécessaire, l'historique et les missions déjà saisis
    restent inchangés, simplement sans compte actif associé.
    """
    utilisateur = db.query(models.Utilisateur).filter(
        models.Utilisateur.id == utilisateur_id
    ).first()
    if not utilisateur:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    db.delete(utilisateur)
    db.commit()

def supprimer_chauffeur_definitif(db: Session, chauffeur_id: int):
    """
    Suppression DÉFINITIVE d'un chauffeur, réservée à super_admin.
    Détache (chauffeur_id = NULL) les missions liées plutôt que de les supprimer.
    """
    chauffeur = db.query(models.Chauffeur).filter(models.Chauffeur.id == chauffeur_id).first()
    if not chauffeur:
        raise HTTPException(status_code=404, detail="Chauffeur introuvable")

    db.query(models.Mission).filter(
        models.Mission.chauffeur_id == chauffeur_id
    ).update({"chauffeur_id": None})

    db.delete(chauffeur)
    db.commit()


def create_remorque(db: Session, remorque: schemas.RemorqueCreate) -> models.Remorque:
    db_remorque = models.Remorque(**remorque.dict())
    db.add(db_remorque)
    db.commit()
    db.refresh(db_remorque)
    return db_remorque


def list_remorques(db: Session, inclure_inactifs: bool = False):
    query = db.query(models.Remorque)
    if not inclure_inactifs:
        query = query.filter(models.Remorque.actif == True)
    return query.all()


def get_remorque(db: Session, remorque_id: int) -> models.Remorque:
    return db.query(models.Remorque).filter(models.Remorque.id == remorque_id).first()


def update_remorque(db: Session, remorque_id: int, updates: schemas.RemorqueUpdate) -> models.Remorque:
    remorque = get_remorque(db, remorque_id)
    for champ, valeur in updates.model_dump(exclude_unset=True).items():
        setattr(remorque, champ, valeur)
    db.commit()
    db.refresh(remorque)
    return remorque


def supprimer_remorque(db: Session, remorque_id: int):
    """
    Suppression définitive -- bloquée si des missions référencent
    encore cette remorque (pour ne jamais perdre de traçabilité par accident).
    """
    remorque = get_remorque(db, remorque_id)
    if not remorque:
        raise HTTPException(status_code=404, detail="Remorque introuvable")
    nb_missions = db.query(models.Mission).filter(
        models.Mission.remorque_id == remorque_id
    ).count()
    if nb_missions > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Impossible de supprimer : {nb_missions} mission(s) liée(s) à cette remorque. "
                   f"Désactivez-la plutôt (l'historique sera conservé).",
        )
    db.delete(remorque)
    db.commit()

from datetime import date as date_type

TYPES_DOCUMENTS = [
    "carte_grise", "carte_bleue", "visite_technique",
    "assurance", "licence_transport", "patente_talcsa",
]


def _calculer_statut_document(type_document: str, date_expiration, seuils_par_type: dict) -> dict:
    if not date_expiration:
        return {
            "type_document": type_document,
            "date_expiration": None,
            "jours_restants": None,
            "statut": "inconnu",
        }

    jours_restants = (date_expiration - date_type.today()).days
    seuil = seuils_par_type.get(type_document)
    seuil_jaune = seuil.seuil_jaune_jours if seuil else 30
    seuil_rouge = seuil.seuil_rouge_jours if seuil else 7

    if jours_restants <= seuil_rouge:
        statut = "rouge"
    elif jours_restants <= seuil_jaune:
        statut = "jaune"
    else:
        statut = "vert"

    return {
        "type_document": type_document,
        "date_expiration": date_expiration,
        "jours_restants": jours_restants,
        "statut": statut,
    }


def get_documents_vehicule(vehicule, type_vehicule: str, seuils_par_type: dict) -> dict:
    documents = [
        _calculer_statut_document(t, getattr(vehicule, f"{t}_expiration"), seuils_par_type)
        for t in TYPES_DOCUMENTS
    ]
    return {
        "id": vehicule.id,
        "type_vehicule": type_vehicule,
        "unit": vehicule.unit,
        "immatriculation": vehicule.immatriculation,
        "documents": documents,
    }


def get_tableau_bord_documents(db: Session):
    seuils = list_seuils_documents(db)
    seuils_par_type = {s.type_document: s for s in seuils}

    camions = db.query(models.Camion).filter(models.Camion.actif == True).all()
    remorques = db.query(models.Remorque).filter(models.Remorque.actif == True).all()

    resultat = []
    for c in camions:
        resultat.append(get_documents_vehicule(c, "camion", seuils_par_type))
    for r in remorques:
        resultat.append(get_documents_vehicule(r, "remorque", seuils_par_type))
    return resultat


def list_seuils_documents(db: Session):
    return db.query(models.SeuilDocument).all()


def get_seuil_document(db: Session, type_document: str) -> models.SeuilDocument:
    return db.query(models.SeuilDocument).filter(
        models.SeuilDocument.type_document == type_document
    ).first()


def update_seuil_document(db: Session, type_document: str, updates: schemas.SeuilDocumentUpdate) -> models.SeuilDocument:
    seuil = get_seuil_document(db, type_document)
    if not seuil:
        return None
    for champ, valeur in updates.model_dump(exclude_unset=True).items():
        setattr(seuil, champ, valeur)
    db.commit()
    db.refresh(seuil)
    return seuil