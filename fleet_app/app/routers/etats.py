from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List

from app import schemas, crud
from app.database import get_db

router = APIRouter(prefix="/etats", tags=["États de référence"])


@router.get("/", response_model=List[schemas.EtatReference])
def lister_etats(db: Session = Depends(get_db)):
    """
    Liste des états possibles pour un camion.
    Cette liste vit en base de données -> modifiable sans toucher au code
    une fois qu'on aura confirmé la liste exacte avec le DG (via le Sheet).
    """
    return crud.list_etats_reference(db)
