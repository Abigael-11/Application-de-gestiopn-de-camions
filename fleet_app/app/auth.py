import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app import models

# ⚠️ En production, définissez JWT_SECRET_KEY dans .env avec une vraie valeur secrète.
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "changez-moi-en-production-fleet-ops-2026")
ALGORITHM = "HS256"
DUREE_TOKEN_HEURES = 12

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

ROLES_VALIDES = ("operation", "direction", "admin")


# ---------- Mots de passe ----------

def hash_password(mot_de_passe: str) -> str:
    return bcrypt.hashpw(mot_de_passe.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verifier_password(mot_de_passe: str, hash_stocke: str) -> bool:
    return bcrypt.checkpw(mot_de_passe.encode("utf-8"), hash_stocke.encode("utf-8"))


# ---------- JWT ----------

def creer_access_token(utilisateur: models.Utilisateur) -> str:
    expiration = datetime.now(timezone.utc) + timedelta(hours=DUREE_TOKEN_HEURES)
    payload = {
        "sub": str(utilisateur.id),
        "identifiant": utilisateur.identifiant,
        "role": utilisateur.role,
        "exp": expiration,
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decoder_token(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expirée, reconnectez-vous.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token invalide.")


# ---------- Dépendances FastAPI ----------

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> models.Utilisateur:
    payload = decoder_token(token)
    user_id = payload.get("sub")
    utilisateur = db.query(models.Utilisateur).filter(models.Utilisateur.id == int(user_id)).first()
    if not utilisateur or not utilisateur.actif:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Utilisateur introuvable ou désactivé.")
    return utilisateur


def require_roles(*roles_autorises: str):
    """Dépendance factory : POST /camions/1/changer-etat, dependencies=[Depends(require_roles('operation','admin'))]"""
    def verificateur(utilisateur: models.Utilisateur = Depends(get_current_user)) -> models.Utilisateur:
        if utilisateur.role not in roles_autorises:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Action réservée aux rôles : {', '.join(roles_autorises)}.",
            )
        return utilisateur
    return verificateur
