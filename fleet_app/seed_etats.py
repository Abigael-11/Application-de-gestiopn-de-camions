"""
Initialise/met à jour la table etats_reference.

Deux catégorisations indépendantes par état :
- "groupe"    : catégorisation métier définie par l'équipe opération
                (Deplacement, Operation, Maintenance, Incident, Attente, Douane).
                Purement organisationnel/affichage -- n'affecte aucun calcul.
- "categorie" : 'actif' | 'attente' | 'immobilisation'. C'est CE champ qui pilote
                le calcul du taux d'occupation. Dérivé automatiquement du groupe
                ci-dessous (voir GROUPE_VERS_CATEGORIE), avec quelques exceptions
                explicites pour les états ambigus au sein d'un même groupe.

Usage : python seed_etats.py
"""
from app.database import SessionLocal, Base, engine
from app.models import EtatReference

Base.metadata.create_all(bind=engine)

# Correspondance par défaut groupe -> categorie fonctionnelle
GROUPE_VERS_CATEGORIE = {
    "Deplacement": "actif",
    "Operation": "actif",
    "Maintenance": "immobilisation",
    "Incident": "immobilisation",
    "Attente": "attente",
    "Douane": "actif",
}

# Exceptions explicites : un état dont la categorie fonctionnelle diffère
# de la valeur par défaut de son groupe (ex: dans "Operation", les 2 états
# d'attente ne sont pas "actif" comme le reste du groupe).
# ⚠️ Zones encore ambiguës à valider avec l'équipe opération (voir conversation) :
#   - underlashing_and_ws / load_and_ws : liés à "W/S" (atelier) mais classés
#     dans "Operation" -- mis en immobilisation par prudence, à confirmer.
#   - departed_ws_am : "Departed" suggère un retour en service (actif) même si
#     le groupe est "Maintenance" -- mis en actif, à confirmer.
EXCEPTIONS_CATEGORIE = {
    "waiting_to_load": "attente",
    "waiting_to_offload": "attente",
    "underlashing_and_ws": "immobilisation",  # à confirmer (voir note ci-dessus)
    "load_and_ws": "immobilisation",           # à confirmer (voir note ci-dessus)
    "departed_ws_am": "actif",                 # à confirmer (voir note ci-dessus)
}

ETATS_INITIAUX = [
    # --- Déplacement (le camion avance concrètement dans son cycle) ---
    {"code": "ready_for_departure",      "libelle": "Ready for departure",      "groupe": "Deplacement"},
    {"code": "moving_empty",             "libelle": "Moving Empty",             "groupe": "Deplacement"},
    {"code": "backload",                 "libelle": "Backload",                 "groupe": "Deplacement"},
    {"code": "departed_dla",             "libelle": "Departed DLA",             "groupe": "Deplacement"},
    {"code": "arrival_dla",              "libelle": "Arrival DLA",              "groupe": "Deplacement"},
    {"code": "load_and_depart",          "libelle": "Load & Depart",            "groupe": "Deplacement"},
    {"code": "border_crossing",          "libelle": "Border crossing",          "groupe": "Deplacement"},

    # --- Opérations logistiques (chargement, déchargement et préparation) ---
    {"code": "waiting_to_load",          "libelle": "Waiting to load",          "groupe": "Operation"},
    {"code": "underloading",             "libelle": "Underloading",             "groupe": "Operation"},
    {"code": "waiting_to_offload",       "libelle": "Waiting to offload",       "groupe": "Operation"},
    {"code": "underoffloading",          "libelle": "Underoffloading",          "groupe": "Operation"},
    {"code": "underlashing_and_depart",  "libelle": "Underlashing & Depart",    "groupe": "Operation"},
    {"code": "underlashing_and_ws",      "libelle": "Underlashing & W/S",       "groupe": "Operation"},
    {"code": "load_and_ws",              "libelle": "Load & W/S",               "groupe": "Operation"},

    # --- Maintenance / Atelier ---
    {"code": "ws_empty",                 "libelle": "W/S empty",                "groupe": "Maintenance"},
    {"code": "ws_loaded",                "libelle": "W/S Loaded",               "groupe": "Maintenance"},
    {"code": "entered_ws_pm",            "libelle": "Entered W/S PM",           "groupe": "Maintenance"},
    {"code": "departed_ws_am",           "libelle": "Departed W/S AM",          "groupe": "Maintenance"},
    {"code": "waiting_tires_ws",         "libelle": "Waiting tires W/S",        "groupe": "Maintenance"},
    {"code": "vor",                      "libelle": "VOR",                      "groupe": "Maintenance"},

    # --- Pannes et incidents ---
    {"code": "breakdown_loaded",         "libelle": "Breakdown loaded",         "groupe": "Incident"},
    {"code": "breakdown_empty",          "libelle": "Breakdown Empty",          "groupe": "Incident"},
    {"code": "accident",                 "libelle": "Accident",                 "groupe": "Incident"},
    {"code": "road_blocked",             "libelle": "Stopped - Road blocked",   "groupe": "Incident"},

    # --- Attentes administratives / opérationnelles ---
    {"code": "waiting_fuel",             "libelle": "Waiting fuel",             "groupe": "Attente"},
    {"code": "waiting_cargo_docs",       "libelle": "Waiting cargo Docs",       "groupe": "Attente"},
    {"code": "waiting_vehicle_docs",     "libelle": "Waiting vehicule docs",    "groupe": "Attente"},
    {"code": "waiting_driver",           "libelle": "Waiting driver",           "groupe": "Attente"},

    # --- Douane ---
    {"code": "under_customs_ndj",        "libelle": "Under customs Ndj",        "groupe": "Douane"},
    {"code": "under_customs_bangui",     "libelle": "Under customs Bangui",     "groupe": "Douane"},
    {"code": "under_customs_moundou",    "libelle": "Under customs Moundou",    "groupe": "Douane"},
]

# Complète chaque état avec sa categorie fonctionnelle (dérivée du groupe, sauf exception)
for etat in ETATS_INITIAUX:
    etat["categorie"] = EXCEPTIONS_CATEGORIE.get(etat["code"], GROUPE_VERS_CATEGORIE[etat["groupe"]])

# Anciens codes qui n'existent plus dans la nouvelle classification --
# on ne les supprime PAS automatiquement (ils peuvent avoir un historique lié),
# on les signale juste pour que l'admin décide quoi en faire depuis l'interface.
ANCIENS_CODES_OBSOLETES = ["moving_loaded", "shunting", "disponible", "customs_ndj", "customs_bangui", "stopped_road_blocked"]


def seed():
    db = SessionLocal()
    try:
        for etat in ETATS_INITIAUX:
            existant = db.query(EtatReference).filter_by(code=etat["code"]).first()
            if not existant:
                db.add(EtatReference(**etat))
                print(f"Ajouté : {etat['code']} [{etat['groupe']} -> {etat['categorie']}]")
            elif existant.categorie != etat["categorie"] or existant.libelle != etat["libelle"] or existant.groupe != etat["groupe"]:
                existant.categorie = etat["categorie"]
                existant.libelle = etat["libelle"]
                existant.groupe = etat["groupe"]
                print(f"Mis à jour : {etat['code']} [{etat['groupe']} -> {etat['categorie']}]")
            else:
                print(f"Déjà à jour : {etat['code']}")
        db.commit()

        print("\n--- Vérification des anciens codes obsolètes ---")
        for code in ANCIENS_CODES_OBSOLETES:
            e = db.query(EtatReference).filter_by(code=code).first()
            if e:
                nb_usages = len(e.historique)
                print(f"  '{code}' existe encore en base ({nb_usages} ligne(s) d'historique liée(s)) -- à examiner dans Paramètres > États")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
    print("\nTerminé.")
