from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app import schemas, crud, auth, models
from app import permissions as perms
from app.database import get_db

router = APIRouter(prefix="/etats", tags=["États de référence"])
CATEGORIES_VALIDES = ("actif", "attente", "immobilisation")


@router.get("/", response_model=List[schemas.EtatReference])
def lister_etats(db: Session = Depends(get_db), _user=Depends(auth.get_current_user)):
    return db.query(models.EtatReference).all()


@router.post("/", response_model=schemas.EtatReference)
def creer_etat(payload: schemas.EtatCreate, db: Session = Depends(get_db), _admin=Depends(perms.require_permission("parametres:gerer"))):
    if payload.categorie not in CATEGORIES_VALIDES:
        raise HTTPException(status_code=400, detail=f"Categorie invalide: {CATEGORIES_VALIDES}")
    if db.query(models.EtatReference).filter(models.EtatReference.code == payload.code).first():
        raise HTTPException(status_code=400, detail="Ce code d'état existe déjà.")
    etat = models.EtatReference(**payload.model_dump())
    db.add(etat)
    db.commit()
    db.refresh(etat)
    return etat


@router.patch("/{etat_id}", response_model=schemas.EtatReference)
def modifier_etat(etat_id: int, payload: schemas.EtatUpdate, db: Session = Depends(get_db), _admin=Depends(perms.require_permission("parametres:gerer"))):
    etat = db.query(models.EtatReference).filter(models.EtatReference.id == etat_id).first()
    if not etat:
        raise HTTPException(status_code=404, detail="État introuvable")
    updates = payload.model_dump(exclude_unset=True)
    if "categorie" in updates and updates["categorie"] not in CATEGORIES_VALIDES:
        raise HTTPException(status_code=400, detail=f"Categorie invalide: {CATEGORIES_VALIDES}")
    for champ, valeur in updates.items():
        setattr(etat, champ, valeur)
    db.commit()
    db.refresh(etat)
    return etat