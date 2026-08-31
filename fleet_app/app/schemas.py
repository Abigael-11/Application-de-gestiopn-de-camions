from pydantic import BaseModel
from datetime import datetime
from typing import Optional


# ---------- Authentification ----------

class LoginRequest(BaseModel):
    identifiant: str
    mot_de_passe: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    nom: str
    identifiant: str


class UtilisateurCreate(BaseModel):
    nom: str
    identifiant: str
    mot_de_passe: str
    role: str  # 'operation' | 'direction' | 'admin'


class UtilisateurRoleUpdate(BaseModel):
    role: str


class UtilisateurOut(BaseModel):
    id: int
    nom: str
    identifiant: str
    role: str
    actif: bool

    class Config:
        from_attributes = True


# ---------- Camions ----------

class CamionBase(BaseModel):
    immatriculation: str
    unit: Optional[str] = None
    marque: Optional[str] = None
    modele: Optional[str] = None
    capacite_tonnes: Optional[float] = None
    lien_dossier_externe: Optional[str] = None
    chauffeur_actuel: Optional[str] = None


class CamionCreate(CamionBase):
    pass


class CamionUpdate(BaseModel):
    """Pour modifier un camion existant -- notamment ajouter/corriger le lien externe."""
    unit: Optional[str] = None
    marque: Optional[str] = None
    modele: Optional[str] = None
    capacite_tonnes: Optional[float] = None
    lien_dossier_externe: Optional[str] = None
    chauffeur_actuel: Optional[str] = None
    actif: Optional[bool] = None


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
    groupe: Optional[str] = None
    categorie_dg: Optional[str] = None


class EtatReference(EtatReferenceBase):
    id: int

    class Config:
        from_attributes = True


class EtatCreate(BaseModel):
    code: str
    libelle: str
    categorie: str  # 'actif' | 'attente' | 'immobilisation'
    groupe: Optional[str] = None
    categorie_dg: Optional[str] = None


class EtatUpdate(BaseModel):
    libelle: Optional[str] = None
    categorie: Optional[str] = None
    groupe: Optional[str] = None
    categorie_dg: Optional[str] = None


# ---------- Historique / changement d'état ----------

class ChangementEtat(BaseModel):
    """Ce que l'utilisateur envoie quand il déclare un nouvel état pour un camion."""
    etat_code: str          # ex: "panne", "chargement"...
    lieu: Optional[str] = None
    marchandise: Optional[str] = None
    motif: Optional[str] = None
    saisi_par: Optional[str] = None


class HistoriqueEtatOut(BaseModel):
    id: int
    etat: EtatReference
    date_debut: datetime
    date_fin: Optional[datetime] = None
    lieu: Optional[str] = None
    marchandise: Optional[str] = None
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


class RepartitionCategorieDg(BaseModel):
    categorie_dg: str
    duree_totale_heures: float


class ChauffeurBase(BaseModel):
    nom: str
    prenom: str
    telephone: Optional[str] = None
    adresse: Optional[str] = None
    numero_permis: Optional[str] = None
    categorie_permis: Optional[str] = None
    date_expiration_permis: Optional[datetime] = None
    date_embauche: Optional[datetime] = None
    contact_urgence_nom: Optional[str] = None
    contact_urgence_telephone: Optional[str] = None
    disponibilite: Optional[str] = "disponible"
    camion_id: Optional[int] = None


class ChauffeurCreate(ChauffeurBase):
    pass


class ChauffeurUpdate(BaseModel):
    nom: Optional[str] = None
    prenom: Optional[str] = None
    telephone: Optional[str] = None
    adresse: Optional[str] = None
    numero_permis: Optional[str] = None
    categorie_permis: Optional[str] = None
    date_expiration_permis: Optional[datetime] = None
    date_embauche: Optional[datetime] = None
    contact_urgence_nom: Optional[str] = None
    contact_urgence_telephone: Optional[str] = None
    disponibilite: Optional[str] = None
    camion_id: Optional[int] = None
    actif: Optional[bool] = None


class ChauffeurOut(ChauffeurBase):
    id: int
    actif: bool

    class Config:
        from_attributes = True


class MissionBase(BaseModel):
    client: Optional[str] = None
    marchandise: Optional[str] = None
    camion_id: Optional[int] = None
    chauffeur_id: Optional[int] = None
    lieu_depart: Optional[str] = None
    lieu_destination: Optional[str] = None
    distance_km: Optional[float] = None
    date_depart_prevue: Optional[datetime] = None
    date_arrivee_prevue: Optional[datetime] = None
    date_depart_reelle: Optional[datetime] = None
    date_arrivee_reelle: Optional[datetime] = None
    statut: Optional[str] = "planifiee"
    saisi_par: Optional[str] = None


class MissionCreate(MissionBase):
    pass


class MissionUpdate(BaseModel):
    client: Optional[str] = None
    marchandise: Optional[str] = None
    camion_id: Optional[int] = None
    chauffeur_id: Optional[int] = None
    lieu_depart: Optional[str] = None
    lieu_destination: Optional[str] = None
    distance_km: Optional[float] = None
    date_depart_prevue: Optional[datetime] = None
    date_arrivee_prevue: Optional[datetime] = None
    date_depart_reelle: Optional[datetime] = None
    date_arrivee_reelle: Optional[datetime] = None
    statut: Optional[str] = None
    saisi_par: Optional[str] = None


class MissionOut(MissionBase):
    id: int
    cree_le: Optional[datetime] = None

    class Config:
        from_attributes = True