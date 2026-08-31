from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app import schemas, models, auth, crud
from app import permissions as perms
from app.database import get_db

router = APIRouter(prefix="/utilisateurs", tags=["Utilisateurs"])
GERER = Depends(perms.require_permission("utilisateurs:gerer"))


@router.get("/", response_model=List[schemas.UtilisateurOut])
def lister_utilisateurs(db: Session = Depends(get_db), _admin=GERER):
    return db.query(models.Utilisateur).all()


@router.post("/", response_model=schemas.UtilisateurOut)
def creer_utilisateur(payload: schemas.UtilisateurCreate, db: Session = Depends(get_db), _admin=GERER):
    if payload.role not in auth.ROLES_VALIDES:
        raise HTTPException(status_code=400, detail=f"Rôle invalide: {auth.ROLES_VALIDES}")
    if db.query(models.Utilisateur).filter(models.Utilisateur.identifiant == payload.identifiant).first():
        raise HTTPException(status_code=400, detail="Cet identifiant est déjà utilisé.")
    utilisateur = models.Utilisateur(
        nom=payload.nom, identifiant=payload.identifiant,
        mot_de_passe_hash=auth.hash_password(payload.mot_de_passe), role=payload.role,
    )
    db.add(utilisateur)
    db.commit()
    db.refresh(utilisateur)
    return utilisateur


@router.patch("/{utilisateur_id}/role", response_model=schemas.UtilisateurOut)
def changer_role_utilisateur(utilisateur_id: int, payload: schemas.UtilisateurRoleUpdate, db: Session = Depends(get_db), _admin=GERER):
    if payload.role not in auth.ROLES_VALIDES:
        raise HTTPException(status_code=400, detail=f"Rôle invalide: {auth.ROLES_VALIDES}")
    utilisateur = db.query(models.Utilisateur).filter(models.Utilisateur.id == utilisateur_id).first()
    if not utilisateur:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    utilisateur.role = payload.role
    db.commit()
    db.refresh(utilisateur)
    return utilisateur


@router.patch("/{utilisateur_id}/desactiver", response_model=schemas.UtilisateurOut)
def desactiver_utilisateur(utilisateur_id: int, db: Session = Depends(get_db), _admin=GERER):
    utilisateur = db.query(models.Utilisateur).filter(models.Utilisateur.id == utilisateur_id).first()
    if not utilisateur:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    utilisateur.actif = False
    db.commit()
    db.refresh(utilisateur)
    return utilisateur


@router.delete("/{utilisateur_id}/definitif")
def supprimer_utilisateur_definitif_endpoint(
    utilisateur_id: int,
    db: Session = Depends(get_db),
    _user: models.Utilisateur = Depends(perms.require_permission("utilisateurs:supprimer_definitif")),
):
    crud.supprimer_utilisateur_definitif(db, utilisateur_id)
    return {"detail": "Utilisateur supprimé définitivement."}


@router.patch("/{utilisateur_id}/reactiver", response_model=schemas.UtilisateurOut)
def reactiver_utilisateur(utilisateur_id: int, db: Session = Depends(get_db), _admin=GERER):
    utilisateur = db.query(models.Utilisateur).filter(models.Utilisateur.id == utilisateur_id).first()
    if not utilisateur:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    utilisateur.actif = True
    db.commit()
    db.refresh(utilisateur)
    return utilisateur