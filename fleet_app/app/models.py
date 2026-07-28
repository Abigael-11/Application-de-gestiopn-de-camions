from sqlalchemy import (
    Column, Integer, String, Numeric, Boolean, ForeignKey, TIMESTAMP, Text, Index
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class Camion(Base):
    __tablename__ = "camions"

    id = Column(Integer, primary_key=True, index=True)
    immatriculation = Column(String(20), unique=True, nullable=False)
    marque = Column(String(50))
    modele = Column(String(50))
    capacite_tonnes = Column(Numeric)
    actif = Column(Boolean, default=True)
    lien_dossier_externe = Column(String(300), nullable=True)  # ex: URL vers le dossier/GPS de l'autre appli
    cree_le = Column(TIMESTAMP(timezone=True), server_default=func.now())

    historique = relationship("HistoriqueEtat", back_populates="camion")


class EtatReference(Base):
    """
    Liste des états possibles pour un camion.
    NOTE: cette liste est volontairement en base de données (pas codée en dur)
    pour qu'on puisse l'ajuster facilement une fois le Google Sheet du DG analysé,
    sans toucher au code ni au schéma.
    """
    __tablename__ = "etats_reference"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(30), unique=True, nullable=False)   # ex: 'panne'
    libelle = Column(String(100), nullable=False)             # ex: 'En panne'
    categorie = Column(String(30))                            # ex: 'immobilisation' / 'operation'

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
