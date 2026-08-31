from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List

from app import schemas, crud, models
from app import permissions as perms
from app.database import get_db

router = APIRouter(prefix="/chauffeurs", tags=["Chauffeurs"])


@router.get("/", response_model=List[schemas.ChauffeurOut])
def lister_chauffeurs(
    inclure_inactifs: bool = False,
    db: Session = Depends(get_db),
    _user: models.Utilisateur = Depends(perms.require_permission("chauffeurs:lire")),
):
    return crud.list_chauffeurs(db, inclure_inactifs=inclure_inactifs)


@router.post("/", response_model=schemas.ChauffeurOut)
def creer_chauffeur(
    chauffeur: schemas.ChauffeurCreate,
    db: Session = Depends(get_db),
    _user: models.Utilisateur = Depends(perms.require_permission("chauffeurs:creer")),
):
    return crud.create_chauffeur(db, chauffeur)


@router.patch("/{chauffeur_id}", response_model=schemas.ChauffeurOut)
def modifier_chauffeur(
    chauffeur_id: int,
    updates: schemas.ChauffeurUpdate,
    db: Session = Depends(get_db),
    _user: models.Utilisateur = Depends(perms.require_permission("chauffeurs:modifier")),
):
    return crud.update_chauffeur(db, chauffeur_id, updates)


@router.delete("/{chauffeur_id}/definitif")
def supprimer_chauffeur_definitif_endpoint(
    chauffeur_id: int,
    db: Session = Depends(get_db),
    _user: models.Utilisateur = Depends(perms.require_permission("chauffeurs:supprimer_definitif")),
):
    crud.supprimer_chauffeur_definitif(db, chauffeur_id)
    return {"detail": "Chauffeur supprimé définitivement."}