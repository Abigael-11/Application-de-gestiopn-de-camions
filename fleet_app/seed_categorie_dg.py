"""
Peuple/actualise la 7e categorie demandee par le DG (categorie_dg), SANS
toucher aux champs categorie et groupe deja en place.

Usage : python seed_categorie_dg.py
"""
from app.database import SessionLocal
from app.models import EtatReference

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


def seed():
    db = SessionLocal()
    try:
        codes_traites = set()
        for categorie_dg, codes in MAPPING_CATEGORIE_DG.items():
            for code in codes:
                etat = db.query(EtatReference).filter_by(code=code).first()
                if not etat:
                    print(f"IGNORE : code '{code}' introuvable en base (a verifier)")
                    continue
                if etat.categorie_dg != categorie_dg:
                    etat.categorie_dg = categorie_dg
                    print(f"Mis a jour : {code} -> {categorie_dg}")
                else:
                    print(f"Deja a jour : {code}")
                codes_traites.add(code)
        db.commit()

        tous = db.query(EtatReference).all()
        oublies = [e.code for e in tous if e.code not in codes_traites]
        if oublies:
            print("\n--- ATTENTION : etats sans categorie_dg assignee ---")
            for code in oublies:
                print(f"  '{code}' -- a ajouter au mapping")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
    print("\nTermine.")