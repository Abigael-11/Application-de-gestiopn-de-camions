from fastapi import APIRouter, Depends, Query
from app import schemas, crud, auth, models
from app import permissions as perms
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db

router = APIRouter(prefix="/remorques", tags=["Remorques"])

LECTURE = Depends(auth.get_current_user)


@router.post("/", response_model=schemas.Remorque)
def creer_remorque(
    remorque: schemas.RemorqueCreate,
    db: Session = Depends(get_db),
    _user: models.Utilisateur = Depends(perms.require_permission("remorques:creer")),
):
    return crud.create_remorque(db, remorque)


@router.get("/", response_model=List[schemas.Remorque])
def lister_remorques(
    inclure_inactifs: bool = Query(False, description="Inclure les remorques désactivées"),
    db: Session = Depends(get_db),
    _user=LECTURE,
):
    return crud.list_remorques(db, inclure_inactifs)


@router.get("/{remorque_id}", response_model=schemas.Remorque)
def obtenir_remorque(remorque_id: int, db: Session = Depends(get_db), _user=LECTURE):
    return crud.get_remorque(db, remorque_id)


@router.patch("/{remorque_id}", response_model=schemas.Remorque)
def modifier_remorque(
    remorque_id: int,
    updates: schemas.RemorqueUpdate,
    db: Session = Depends(get_db),
    _user: models.Utilisateur = Depends(perms.require_permission("remorques:modifier")),
):
    return crud.update_remorque(db, remorque_id, updates)


@router.delete("/{remorque_id}")
def supprimer_remorque_endpoint(
    remorque_id: int,
    db: Session = Depends(get_db),
    _user: models.Utilisateur = Depends(perms.require_permission("remorques:supprimer")),
):
    crud.supprimer_remorque(db, remorque_id)
    return {"detail": "Remorque supprimée"}