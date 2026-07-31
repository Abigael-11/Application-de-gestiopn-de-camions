from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import schemas, models, auth
from app.database import get_db

router = APIRouter(prefix="/auth", tags=["Authentification"])


@router.post("/login", response_model=schemas.TokenResponse)
def login(payload: schemas.LoginRequest, db: Session = Depends(get_db)):
    utilisateur = db.query(models.Utilisateur).filter(
        models.Utilisateur.identifiant == payload.identifiant
    ).first()

    if not utilisateur or not auth.verifier_password(payload.mot_de_passe, utilisateur.mot_de_passe_hash):
        # Message volontairement identique dans les deux cas (identifiant
        # inconnu OU mot de passe faux) pour ne pas révéler quels comptes existent
        raise HTTPException(status_code=401, detail="Identifiant ou mot de passe incorrect.")

    if not utilisateur.actif:
        raise HTTPException(status_code=403, detail="Ce compte a été désactivé.")

    token = auth.creer_access_token(utilisateur)
    return schemas.TokenResponse(
        access_token=token,
        role=utilisateur.role,
        nom=utilisateur.nom,
        identifiant=utilisateur.identifiant,
    )
