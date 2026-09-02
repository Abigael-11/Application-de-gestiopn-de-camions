from fastapi import APIRouter, Depends, Query, HTTPException
from app import schemas, crud, auth, models
from app import permissions as perms
from sqlalchemy.orm import Session
from datetime import datetime
from typing import List, Optional

from app import schemas, crud, auth, models
from app.database import get_db

router = APIRouter(prefix="/camions", tags=["Camions"])

# Lecture : les 3 rôles peuvent consulter (operation, direction, admin)
LECTURE = Depends(auth.get_current_user)


@router.post("/", response_model=schemas.Camion)
def creer_camion(
    camion: schemas.CamionCreate,
    db: Session = Depends(get_db),
    _user: models.Utilisateur = Depends(perms.require_permission("camions:creer")),
):    
    return crud.create_camion(db, camion)


@router.get("/", response_model=List[schemas.CamionStatutActuel])
def lister_camions_avec_statut(
    inclure_inactifs: bool = Query(False, description="Inclure les camions désactivés (pour la gestion admin/opération)"),
    db: Session = Depends(get_db),
    _user=LECTURE,
):
    """Vue principale du tableau de bord : tous les camions + leur état actuel + durée."""
    camions = crud.list_camions(db, inclure_inactifs=inclure_inactifs)
    return [crud.get_statut_actuel(db, c) for c in camions]


@router.get("/disponibles", response_model=List[schemas.Camion])
def camions_disponibles(db: Session = Depends(get_db), _user=LECTURE):
    return crud.get_camions_disponibles(db)


@router.get("/{camion_id}", response_model=schemas.CamionStatutActuel)
def obtenir_camion(camion_id: int, db: Session = Depends(get_db), _user=LECTURE):
    camion = crud.get_camion(db, camion_id)
    return crud.get_statut_actuel(db, camion)


@router.patch("/{camion_id}", response_model=schemas.Camion)
def modifier_camion(
    camion_id: int,
    updates: schemas.CamionUpdate,
    db: Session = Depends(get_db),
   _user: models.Utilisateur = Depends(perms.require_permission("camions:modifier")),
):
    """
    Modifie les infos d'un camion -- utile notamment pour renseigner
    lien_dossier_externe (lien vers son dossier dans l'autre application :
    GPS, rapport journalier, etc.), sans dupliquer ces données.
    """
    return crud.update_camion(db, camion_id, updates)

@router.get("/{camion_id}/historique", response_model=List[schemas.HistoriqueEtatOut])
def historique_camion(
    camion_id: int,
    depuis_jours: Optional[int] = Query(None),
    date_debut: Optional[datetime] = Query(None),
    date_fin: Optional[datetime] = Query(None),
    db: Session = Depends(get_db),
    _user=LECTURE,
):
    crud.get_camion(db, camion_id)
    depuis = date_debut
    if not depuis and depuis_jours:
        from datetime import timedelta, timezone
        depuis = datetime.now(timezone.utc) - timedelta(days=depuis_jours)
    return crud.get_historique_camion(db, camion_id, depuis, date_fin)

@router.delete("/{camion_id}")
def supprimer_camion(
    camion_id: int,
    db: Session = Depends(get_db),
   _user: models.Utilisateur = Depends(perms.require_permission("camions:supprimer")),
):
    """
    Suppression définitive -- bloquée si le camion a un historique
    (protège contre la perte accidentelle de traçabilité).
    """
    crud.supprimer_camion(db, camion_id)
    return {"detail": "Camion supprimé."}


@router.delete("/{camion_id}/definitif")
def supprimer_camion_definitif_endpoint(
    camion_id: int,
    db: Session = Depends(get_db),
    _user: models.Utilisateur = Depends(perms.require_permission("camions:supprimer_definitif")),
):
    crud.supprimer_camion_definitif(db, camion_id)
    return {"detail": "Camion et tout son historique supprimés définitivement."}


@router.post("/{camion_id}/changer-etat", response_model=schemas.HistoriqueEtatOut)
def changer_etat_camion(
    camion_id: int,
    changement: schemas.ChangementEtat,
    db: Session = Depends(get_db),
    user: models.Utilisateur = Depends(perms.require_permission("etats:changer")),
):
    if user.role == "maintenance":
        etat_cible = crud.get_etat_by_code(db, changement.etat_code)
        if etat_cible.groupe not in ("Maintenance", "Incident"):
            raise HTTPException(
                status_code=403,
                detail="Le rôle Maintenance ne peut changer un camion que vers un état "
                       "de maintenance ou de panne.",
            )
    if not changement.saisi_par:
        changement.saisi_par = user.nom
    return crud.changer_etat(db, camion_id, changement)

@router.get("/{camion_id}/historique", response_model=List[schemas.HistoriqueEtatOut])
def historique_camion(
    camion_id: int,
    depuis_jours: Optional[int] = Query(None, description="Filtrer sur les N derniers jours"),
    db: Session = Depends(get_db),
    _user=LECTURE,
):
    """La 'traçabilité' demandée : timeline complète d'un camion."""
    crud.get_camion(db, camion_id)  # vérifie existence
    depuis = None
    if depuis_jours:
        from datetime import timedelta, timezone
        depuis = datetime.now(timezone.utc) - timedelta(days=depuis_jours)
    return crud.get_historique_camion(db, camion_id, depuis)
