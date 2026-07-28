from pydantic import BaseModel
from datetime import datetime
from typing import Optional


# ---------- Camions ----------

class CamionBase(BaseModel):
    immatriculation: str
    marque: Optional[str] = None
    modele: Optional[str] = None
    capacite_tonnes: Optional[float] = None
    lien_dossier_externe: Optional[str] = None


class CamionCreate(CamionBase):
    pass


class CamionUpdate(BaseModel):
    """Pour modifier un camion existant -- notamment ajouter/corriger le lien externe."""
    marque: Optional[str] = None
    modele: Optional[str] = None
    capacite_tonnes: Optional[float] = None
    lien_dossier_externe: Optional[str] = None


class Camion(CamionBase):
    id: int
    actif: bool

    class Config:
        from_attributes = True


# ---------- États de référence ----------

class EtatReferenceBase(BaseModel):
    code: str
    libelle: str
    categorie: Optional[str] = None


class EtatReference(EtatReferenceBase):
    id: int

    class Config:
        from_attributes = True


# ---------- Historique / changement d'état ----------

class ChangementEtat(BaseModel):
    """Ce que l'utilisateur envoie quand il déclare un nouvel état pour un camion."""
    etat_code: str          # ex: "panne", "chargement"...
    lieu: Optional[str] = None
    motif: Optional[str] = None
    saisi_par: Optional[str] = None


class HistoriqueEtatOut(BaseModel):
    id: int
    etat: EtatReference
    date_debut: datetime
    date_fin: Optional[datetime] = None
    lieu: Optional[str] = None
    motif: Optional[str] = None
    saisi_par: Optional[str] = None

    class Config:
        from_attributes = True


class CamionStatutActuel(BaseModel):
    """Vue résumée : un camion + son état actuel + depuis combien de temps."""
    camion: Camion
    etat_actuel: Optional[EtatReference] = None
    depuis: Optional[datetime] = None
    duree_dans_etat_heures: Optional[float] = None


class DureeMoyenneParEtat(BaseModel):
    etat_code: str
    etat_libelle: str
    duree_moyenne_heures: float
    nombre_occurrences: int
