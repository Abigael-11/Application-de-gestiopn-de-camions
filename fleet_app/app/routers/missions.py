from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from app import schemas, crud, models
from app import permissions as perms
from app.database import get_db

router = APIRouter(prefix="/missions", tags=["Missions"])


@router.get("/", response_model=List[schemas.MissionOut])
def lister_missions(
    statut: Optional[str] = Query(None, description="Filtrer par statut : planifiee | en_cours | terminee | annulee"),
    db: Session = Depends(get_db),
    _user: models.Utilisateur = Depends(perms.require_permission("missions:lire")),
):
    return crud.list_missions(db, statut=statut)


@router.post("/", response_model=schemas.MissionOut)
def creer_mission(
    mission: schemas.MissionCreate,
    db: Session = Depends(get_db),
    user: models.Utilisateur = Depends(perms.require_permission("missions:creer")),
):
    if not mission.saisi_par:
        mission.saisi_par = user.nom
    return crud.create_mission(db, mission)


@router.patch("/{mission_id}", response_model=schemas.MissionOut)
def modifier_mission(
    mission_id: int,
    updates: schemas.MissionUpdate,
    db: Session = Depends(get_db),
    _user: models.Utilisateur = Depends(perms.require_permission("missions:modifier")),
):
    return crud.update_mission(db, mission_id, updates)


@router.delete("/{mission_id}")
def supprimer_mission(
    mission_id: int,
    db: Session = Depends(get_db),
    _user: models.Utilisateur = Depends(perms.require_permission("missions:supprimer")),
):
    crud.supprimer_mission(db, mission_id)
    return {"detail": "Mission supprimee."}