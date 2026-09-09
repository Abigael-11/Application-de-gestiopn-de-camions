from fastapi import APIRouter, Depends, HTTPException
from app import schemas, crud, auth, models
from app import permissions as perms
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db

router = APIRouter(prefix="/documents", tags=["Documents"])

LECTURE = Depends(perms.require_permission("documents:lire"))


@router.get("/seuils", response_model=List[schemas.SeuilDocument])
def lister_seuils(db: Session = Depends(get_db), _user=LECTURE):
    return crud.list_seuils_documents(db)


@router.patch("/seuils/{type_document}", response_model=schemas.SeuilDocument)
def modifier_seuil(
    type_document: str,
    updates: schemas.SeuilDocumentUpdate,
    db: Session = Depends(get_db),
    _user: models.Utilisateur = Depends(perms.require_permission("documents:modifier_seuils")),
):
    seuil = crud.update_seuil_document(db, type_document, updates)
    if not seuil:
        raise HTTPException(status_code=404, detail="Type de document inconnu")
    return seuil


@router.get("/tableau-bord", response_model=List[schemas.DocumentsVehicule])
def tableau_bord_documents(db: Session = Depends(get_db), _user=LECTURE):
    return crud.get_tableau_bord_documents(db)