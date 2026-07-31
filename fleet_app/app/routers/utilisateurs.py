from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app import schemas, models, auth
from app.database import get_db

router = APIRouter(prefix="/utilisateurs", tags=["Utilisateurs"])


@router.get("/", response_model=List[schemas.UtilisateurOut])
def lister_utilisateurs(
    db: Session = Depends(get_db),
    _admin=Depends(auth.require_roles("admin")),
):
    return db.query(models.Utilisateur).all()


@router.post("/", response_model=schemas.UtilisateurOut)
def creer_utilisateur(
    payload: schemas.UtilisateurCreate,
    db: Session = Depends(get_db),
    _admin=Depends(auth.require_roles("admin")),
):
    if payload.role not in auth.ROLES_VALIDES:
        raise HTTPException(status_code=400, detail=f"Rôle invalide. Doit être l'un de : {auth.ROLES_VALIDES}")

    existant = db.query(models.Utilisateur).filter(models.Utilisateur.identifiant == payload.identifiant).first()
    if existant:
        raise HTTPException(status_code=400, detail="Cet identifiant est déjà utilisé.")

    utilisateur = models.Utilisateur(
        nom=payload.nom,
        identifiant=payload.identifiant,
        mot_de_passe_hash=auth.hash_password(payload.mot_de_passe),
        role=payload.role,
    )
    db.add(utilisateur)
    db.commit()
    db.refresh(utilisateur)
    return utilisateur


@router.patch("/{utilisateur_id}/desactiver", response_model=schemas.UtilisateurOut)
def desactiver_utilisateur(
    utilisateur_id: int,
    db: Session = Depends(get_db),
    _admin=Depends(auth.require_roles("admin")),
):
    utilisateur = db.query(models.Utilisateur).filter(models.Utilisateur.id == utilisateur_id).first()
    if not utilisateur:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    utilisateur.actif = False
    db.commit()
    db.refresh(utilisateur)
    return utilisateur
