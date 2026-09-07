from sqlalchemy import (
    Column, Integer, String, Numeric, Boolean, ForeignKey, TIMESTAMP, Text, Index, Date
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
from datetime import date


class Utilisateur(Base):
    """
    Compte permettant de se connecter à l'application.
    Rôles possibles (voir app/permissions.py) : 'super_admin', 'admin_transport',
    'dispatcher', 'maintenance', 'gestionnaire_flotte', 'comptable'.
    """
    __tablename__ = "utilisateurs"

    id = Column(Integer, primary_key=True, index=True)
    nom = Column(String(100), nullable=False)
    identifiant = Column(String(50), unique=True, nullable=False)  # nom d'utilisateur pour se connecter
    mot_de_passe_hash = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False)  # voir app/permissions.py -> ROLES_VALIDES
    actif = Column(Boolean, default=True)
    cree_le = Column(TIMESTAMP(timezone=True), server_default=func.now())

class Camion(Base):
    __tablename__ = "camions"

    id = Column(Integer, primary_key=True, index=True)
    immatriculation = Column(String(20), unique=True, nullable=False)
    unit = Column(String(20), unique=True, nullable=True)  # identifiant court (ex: "083"), utilisé dans le GPS/Sheet d'origine
    marque = Column(String(50))
    modele = Column(String(50))
    capacite_tonnes = Column(Numeric)
    actif = Column(Boolean, default=True)
    lien_dossier_externe = Column(String(300), nullable=True)  # ex: URL vers le dossier/GPS de l'autre appli
    chauffeur_actuel = Column(String(100), nullable=True)  # nom du chauffeur assigné à ce camion
    carte_grise_expiration = Column(Date, nullable=True)
    carte_bleue_expiration = Column(Date, nullable=True)
    visite_technique_expiration = Column(Date, nullable=True)
    assurance_expiration = Column(Date, nullable=True)
    licence_transport_expiration = Column(Date, nullable=True)
    patente_talcsa_expiration = Column(Date, nullable=True)
    cree_le = Column(TIMESTAMP(timezone=True), server_default=func.now())

    historique = relationship("HistoriqueEtat", back_populates="camion")


class Remorque(Base):
    __tablename__ = "remorques"

    id = Column(Integer, primary_key=True, index=True)
    immatriculation = Column(String(20), unique=True, nullable=False)
    unit = Column(String(20), unique=True, nullable=True)
    actif = Column(Boolean, default=True)
    carte_grise_expiration = Column(Date, nullable=True)
    carte_bleue_expiration = Column(Date, nullable=True)
    visite_technique_expiration = Column(Date, nullable=True)
    assurance_expiration = Column(Date, nullable=True)
    licence_transport_expiration = Column(Date, nullable=True)
    patente_talcsa_expiration = Column(Date, nullable=True)
    cree_le = Column(TIMESTAMP(timezone=True), server_default=func.now())


class Chauffeur(Base):
    """
    Fiche chauffeur. Un chauffeur peut être affecté à un camion (camion_id),
    ou non affecté (camion_id = NULL, ex: en congé, en attente d'affectation).
    """
    __tablename__ = "chauffeurs"

    id = Column(Integer, primary_key=True, index=True)
    nom = Column(String(50), nullable=False)
    prenom = Column(String(50), nullable=False)
    telephone = Column(String(30), nullable=True)
    adresse = Column(String(200), nullable=True)
    numero_permis = Column(String(50), nullable=True)
    categorie_permis = Column(String(10), nullable=True)
    date_expiration_permis = Column(TIMESTAMP(timezone=True), nullable=True)
    date_embauche = Column(TIMESTAMP(timezone=True), nullable=True)
    contact_urgence_nom = Column(String(100), nullable=True)
    contact_urgence_telephone = Column(String(30), nullable=True)
    disponibilite = Column(String(20), default="disponible")  # disponible | en_mission | en_conge | indisponible
    camion_id = Column(Integer, ForeignKey("camions.id"), nullable=True)
    actif = Column(Boolean, default=True)
    cree_le = Column(TIMESTAMP(timezone=True), server_default=func.now())

    camion = relationship("Camion")

class EtatReference(Base):
    """
    Liste des états possibles pour un camion.
    Deux catégorisations distinctes et indépendantes :
    - `categorie` (actif/attente/immobilisation) : pilote le calcul du taux
      d'occupation. Ne pas confondre avec `groupe`.
    - `groupe` (Transport, Chargement, Maintenance, Pannes, Attentes admin,
      Douanes...) : catégorisation métier pour l'affichage/organisation,
      définie par l'équipe opération. N'affecte PAS les calculs.
    """
    __tablename__ = "etats_reference"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(30), unique=True, nullable=False)   # ex: 'panne'
    libelle = Column(String(100), nullable=False)             # ex: 'En panne'
    categorie = Column(String(30))                            # 'actif' | 'attente' | 'immobilisation'
    groupe = Column(String(60), nullable=True)                # ex: 'Transport / Déplacement'

    categorie_dg = Column(String(40), nullable=True)  # 7 catégories du DG (Driving, Loading and offloading, Breakdown, Workshop empty/Loaded, Waiting fuel, Waiting for documents, Accident) -- indépendant de categorie/groupe

    historique = relationship("HistoriqueEtat", back_populates="etat")


class HistoriqueEtat(Base):
    """
    Table centrale : chaque ligne = une période pendant laquelle un camion
    est resté dans un état donné. date_fin NULL = état en cours.
    """
    __tablename__ = "historique_etats"

    id = Column(Integer, primary_key=True, index=True)
    camion_id = Column(Integer, ForeignKey("camions.id"), nullable=False)
    etat_id = Column(Integer, ForeignKey("etats_reference.id"), nullable=False)

    date_debut = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    date_fin = Column(TIMESTAMP(timezone=True), nullable=True)

    lieu = Column(String(150), nullable=True)   # zone de chargement / livraison si applicable
    marchandise = Column(String(150), nullable=True)  # nature de la cargaison transportée
    motif = Column(Text, nullable=True)
    saisi_par = Column(String(100), nullable=True)  # nom/identifiant de la personne — pas d'auth complexe au MVP

    cree_le = Column(TIMESTAMP(timezone=True), server_default=func.now())

    camion = relationship("Camion", back_populates="historique")
    etat = relationship("EtatReference", back_populates="historique")


# Index partiel : accélère énormément la recherche de "l'état actuel" d'un camion
# (c'est la requête la plus fréquente de toute l'application)
Index(
    "idx_historique_camion_en_cours",
    HistoriqueEtat.camion_id,
    postgresql_where=(HistoriqueEtat.date_fin.is_(None)),
)



class Mission(Base):
    """
    Une mission = un trajet planifié pour un camion, avec un client et une
    marchandise. Distinct de HistoriqueEtat : une mission peut englober
    plusieurs changements d'état (chargement, trajet, douane, livraison...).
    """
    __tablename__ = "missions"

    id = Column(Integer, primary_key=True, index=True)
    client = Column(String(150), nullable=True)
    marchandise = Column(String(150), nullable=True)
    camion_id = Column(Integer, ForeignKey("camions.id"), nullable=True)
    chauffeur_id = Column(Integer, ForeignKey("chauffeurs.id"), nullable=True)
    lieu_depart = Column(String(150), nullable=True)
    lieu_destination = Column(String(150), nullable=True)
    distance_km = Column(Numeric, nullable=True)
    date_depart_prevue = Column(TIMESTAMP(timezone=True), nullable=True)
    date_arrivee_prevue = Column(TIMESTAMP(timezone=True), nullable=True)
    date_depart_reelle = Column(TIMESTAMP(timezone=True), nullable=True)
    date_arrivee_reelle = Column(TIMESTAMP(timezone=True), nullable=True)
    statut = Column(String(20), default="planifiee")  # planifiee | en_cours | terminee | annulee
    saisi_par = Column(String(100), nullable=True)
    cree_le = Column(TIMESTAMP(timezone=True), server_default=func.now())

    camion = relationship("Camion")
    chauffeur = relationship("Chauffeur")
