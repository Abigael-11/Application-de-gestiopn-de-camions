"""
Initialise la table etats_reference avec une première liste d'états,
basée sur ce qui a été décrit jusqu'ici.

⚠️ À AJUSTER après analyse du Google Sheet fourni par le DG.
Il suffit de modifier la liste ETATS_INITIAUX ci-dessous et relancer ce script.

Usage : python seed_etats.py
"""
from app.database import SessionLocal, Base, engine
from app.models import EtatReference

Base.metadata.create_all(bind=engine)

ETATS_INITIAUX = [
    # --- Actif (le camion avance concrètement dans son cycle) ---
    {"code": "moving_loaded",       "libelle": "Moving loaded",          "categorie": "actif"},
    {"code": "moving_empty",        "libelle": "Moving empty",           "categorie": "actif"},
    {"code": "underloading",        "libelle": "Underloading",           "categorie": "actif"},
    {"code": "underoffloading",     "libelle": "Underoffloading",        "categorie": "actif"},
    {"code": "backload",            "libelle": "Backload",               "categorie": "actif"},
    {"code": "shunting",            "libelle": "Shunting",               "categorie": "actif"},
    {"code": "border_crossing",     "libelle": "Border crossing",        "categorie": "actif"},
    {"code": "customs_ndj",         "libelle": "Customs Ndj",             "categorie": "actif"},
    {"code": "customs_bangui",      "libelle": "Customs Bangui",          "categorie": "actif"},
    {"code": "disponible",          "libelle": "Disponible (aucune mission en cours)", "categorie": "actif"},

    # --- Attente (le camion est sur site/engagé, mais ne bouge/charge pas encore) ---
    # NOTE : confirmé par les vraies donnees du DG (Sheet, 2e onglet) que
    # "Waiting for documents" compte comme DEAD TIME, pas comme actif.
    # "Waiting to load/offload" est une hypothese a valider avec l'equipe
    # operation -- classe ici en Attente/dead time par prudence en attendant.
    {"code": "waiting_to_load",     "libelle": "Waiting to load",        "categorie": "attente"},
    {"code": "waiting_to_offload",  "libelle": "Waiting to offload",     "categorie": "attente"},
    {"code": "waiting_cargo_docs",  "libelle": "Waiting cargo docs",      "categorie": "attente"},
    {"code": "waiting_vehicle_docs","libelle": "Waiting vehicle docs",   "categorie": "attente"},

    # --- Immobilisation (le camion est hors service) ---
    {"code": "waiting_fuel",        "libelle": "Waiting fuel",            "categorie": "immobilisation"},
    {"code": "waiting_driver",      "libelle": "Waiting driver",          "categorie": "immobilisation"},
    {"code": "ws_empty",            "libelle": "W/S empty",               "categorie": "immobilisation"},
    {"code": "ws_loaded",           "libelle": "W/S loaded",              "categorie": "immobilisation"},
    {"code": "waiting_tires_ws",    "libelle": "Waiting tires W/S",        "categorie": "immobilisation"},
    {"code": "breakdown_loaded",    "libelle": "Breakdown loaded",        "categorie": "immobilisation"},
    {"code": "breakdown_empty",     "libelle": "Breakdown empty",         "categorie": "immobilisation"},
    {"code": "accident",            "libelle": "Accident",                "categorie": "immobilisation"},
    {"code": "stopped_road_blocked","libelle": "Stopped / road blocked",  "categorie": "immobilisation"},
    {"code": "vor",                 "libelle": "VOR (Vehicle Off Road)",  "categorie": "immobilisation"},
]

# QUESTIONS OUVERTES A VALIDER AVEC LE DG / L'EQUIPE OPERATION :
# 1. "Waiting to load" et "Waiting to offload" -> Actif ou Attente/dead time ?
#    (les vraies donnees ne tranchent pas ce point precis)
# 2. Le "taux d'occupation" affiche doit-il compter Actif seul, ou
#    Actif + Attente, au numerateur ? A definir explicitement avant
#    de coder la formule -- ne pas deviner.

def seed():
    db = SessionLocal()
    try:
        for etat in ETATS_INITIAUX:
            existant = db.query(EtatReference).filter_by(code=etat["code"]).first()
            if not existant:
                db.add(EtatReference(**etat))
                print(f"Ajouté : {etat['code']} ({etat['categorie']})")
            elif existant.categorie != etat["categorie"] or existant.libelle != etat["libelle"]:
                ancienne_cat = existant.categorie
                existant.categorie = etat["categorie"]
                existant.libelle = etat["libelle"]
                print(f"Mis à jour : {etat['code']} ({ancienne_cat} -> {etat['categorie']})")
            else:
                print(f"Déjà à jour : {etat['code']}")
        db.commit()
    finally:
        db.close()

if __name__ == "__main__":
    seed()
    print("Terminé.")
