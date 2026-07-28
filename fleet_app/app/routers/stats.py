from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from app import schemas, crud
from app.database import get_db

router = APIRouter(prefix="/stats", tags=["Statistiques"])


@router.get("/duree-moyenne", response_model=List[schemas.DureeMoyenneParEtat])
def duree_moyenne_par_etat(
    camion_id: Optional[int] = Query(None, description="Filtrer sur un camion précis"),
    derniers_jours: Optional[int] = Query(30, description="Période à analyser, en jours"),
    db: Session = Depends(get_db),
):
    """
    Répond directement au besoin du DG :
    'combien de temps en moyenne un camion passe en panne / garage / chargement / etc.'
    """
    depuis = None
    if derniers_jours:
        depuis = datetime.now(timezone.utc) - timedelta(days=derniers_jours)
    return crud.get_duree_moyenne_par_etat(db, camion_id=camion_id, depuis=depuis)
