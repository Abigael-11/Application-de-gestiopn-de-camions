"""
Initialise automatiquement les données de base au démarrage du serveur :
- les etats_reference (avec leur groupe et categorie)
- la categorie_dg de chaque etat
- le compte admin par defaut, s'il n'existe aucun utilisateur

Reprend exactement la logique de seed_etats.py / seed_categorie_dg.py /
create_admin.py, mais de façon idempotente (sans rien afficher/planter si
c'est déjà en place) pour pouvoir tourner à chaque démarrage du serveur sans
risque -- utile sur Render (plan gratuit) qui n'offre pas de terminal Shell
pour lancer ces scripts à la main.
"""
from sqlalchemy.orm import Session

from app.models import EtatReference, Utilisateur
from app.auth import hash_password


GROUPE_VERS_CATEGORIE = {
    "Deplacement": "actif",
    "Operation": "actif",
    "Maintenance": "immobilisation",
    "Incident": "immobilisation",
    "Attente": "attente",
    "Douane": "actif",
}

EXCEPTIONS_CATEGORIE = {
    "waiting_to_load": "attente",
    "waiting_to_offload": "attente",
    "underlashing_and_ws": "immobilisation",
    "load_and_ws": "immobilisation",
    "departed_ws_am": "actif",
}

ETATS_INITIAUX = [
    {"code": "ready_for_departure",      "libelle": "Ready for departure",      "groupe": "Deplacement"},
    {"code": "moving_empty",             "libelle": "Moving Empty",             "groupe": "Deplacement"},
    {"code": "backload",                 "libelle": "Backload",                 "groupe": "Deplacement"},
    {"code": "departed_dla",             "libelle": "Departed DLA",             "groupe": "Deplacement"},
    {"code": "arrival_dla",              "libelle": "Arrival DLA",              "groupe": "Deplacement"},
    {"code": "load_and_depart",          "libelle": "Load & Depart",            "groupe": "Deplacement"},
    {"code": "border_crossing",          "libelle": "Border crossing",          "groupe": "Deplacement"},
    {"code": "waiting_to_load",          "libelle": "Waiting to load",          "groupe": "Operation"},
    {"code": "underloading",             "libelle": "Underloading",             "groupe": "Operation"},
    {"code": "waiting_to_offload",       "libelle": "Waiting to offload",       "groupe": "Operation"},
    {"code": "underoffloading",          "libelle": "Underoffloading",          "groupe": "Operation"},
    {"code": "underlashing_and_depart",  "libelle": "Underlashing & Depart",    "groupe": "Operation"},
    {"code": "underlashing_and_ws",      "libelle": "Underlashing & W/S",       "groupe": "Operation"},
    {"code": "load_and_ws",              "libelle": "Load & W/S",               "groupe": "Operation"},
    {"code": "ws_empty",                 "libelle": "W/S empty",                "groupe": "Maintenance"},
    {"code": "ws_loaded",                "libelle": "W/S Loaded",               "groupe": "Maintenance"},
    {"code": "entered_ws_pm",            "libelle": "Entered W/S PM",           "groupe": "Maintenance"},
    {"code": "departed_ws_am",           "libelle": "Departed W/S AM",          "groupe": "Maintenance"},
    {"code": "waiting_tires_ws",         "libelle": "Waiting tires W/S",        "groupe": "Maintenance"},
    {"code": "vor",                      "libelle": "VOR",                      "groupe": "Maintenance"},
    {"code": "breakdown_loaded",         "libelle": "Breakdown loaded",         "groupe": "Incident"},
    {"code": "breakdown_empty",          "libelle": "Breakdown Empty",          "groupe": "Incident"},
    {"code": "accident",                 "libelle": "Accident",                 "groupe": "Incident"},
    {"code": "road_blocked",             "libelle": "Stopped - Road blocked",   "groupe": "Incident"},
    {"code": "waiting_fuel",             "libelle": "Waiting fuel",             "groupe": "Attente"},
    {"code": "waiting_cargo_docs",       "libelle": "Waiting cargo Docs",       "groupe": "Attente"},
    {"code": "waiting_vehicle_docs",     "libelle": "Waiting vehicule docs",    "groupe": "Attente"},
    {"code": "waiting_driver",           "libelle": "Waiting driver",           "groupe": "Attente"},
    {"code": "under_customs_ndj",        "libelle": "Under customs Ndj",        "groupe": "Douane"},
    {"code": "under_customs_bangui",     "libelle": "Under customs Bangui",     "groupe": "Douane"},
    {"code": "under_customs_moundou",    "libelle": "Under customs Moundou",    "groupe": "Douane"},
]
for _etat in ETATS_INITIAUX:
    _etat["categorie"] = EXCEPTIONS_CATEGORIE.get(_etat["code"], GROUPE_VERS_CATEGORIE[_etat["groupe"]])

MAPPING_CATEGORIE_DG = {
    "Driving": ["moving_loaded", "moving_empty", "shunting", "backload", "border_crossing",
                "ready_for_departure", "departed_dla", "arrival_dla", "load_and_depart", "departed_ws_am"],
    "Loading and offloading": ["underoffloading", "underloading", "underlashing_and_depart",
                                "waiting_to_load", "waiting_to_offload"],
    "Breakdown": ["breakdown_loaded", "breakdown_empty", "vor", "road_blocked", "stopped_road_blocked"],
    "Workshop empty/Loaded": ["ws_empty", "ws_loaded", "waiting_tires_ws", "entered_ws_pm",
                               "underlashing_and_ws", "load_and_ws"],
    "Waiting fuel": ["waiting_fuel"],
    "Waiting for documents": ["waiting_cargo_docs", "waiting_vehicle_docs", "waiting_driver",
                               "disponible", "customs_ndj", "customs_bangui",
                               "under_customs_ndj", "under_customs_bangui", "under_customs_moundou"],
    "Accident": ["accident"],
}

IDENTIFIANT_ADMIN_DEFAUT = "admin"
MOT_DE_PASSE_ADMIN_DEFAUT = "admin123"


def _seed_etats(db: Session) -> None:
    for etat in ETATS_INITIAUX:
        existant = db.query(EtatReference).filter_by(code=etat["code"]).first()
        if not existant:
            db.add(EtatReference(**etat))
        elif (existant.categorie != etat["categorie"] or existant.libelle != etat["libelle"]
              or existant.groupe != etat["groupe"]):
            existant.categorie = etat["categorie"]
            existant.libelle = etat["libelle"]
            existant.groupe = etat["groupe"]
    db.commit()


def _seed_categorie_dg(db: Session) -> None:
    for categorie_dg, codes in MAPPING_CATEGORIE_DG.items():
        for code in codes:
            etat = db.query(EtatReference).filter_by(code=code).first()
            if etat and etat.categorie_dg != categorie_dg:
                etat.categorie_dg = categorie_dg
    db.commit()


def _creer_admin_si_absent(db: Session) -> None:
    if db.query(Utilisateur).count() > 0:
        return
    admin = Utilisateur(
        nom="Administrateur",
        identifiant=IDENTIFIANT_ADMIN_DEFAUT,
        mot_de_passe_hash=hash_password(MOT_DE_PASSE_ADMIN_DEFAUT),
        role="super_admin",
    )
    db.add(admin)
    db.commit()
    print(f"[init_donnees] Compte admin créé : identifiant='{IDENTIFIANT_ADMIN_DEFAUT}', "
          f"mot de passe='{MOT_DE_PASSE_ADMIN_DEFAUT}' -- à changer dès la première connexion !")


def initialiser_donnees(db: Session) -> None:
    _seed_etats(db)
    _seed_categorie_dg(db)
    _creer_admin_si_absent(db)