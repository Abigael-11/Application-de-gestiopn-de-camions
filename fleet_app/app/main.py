import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, engine
from app.routers import camions, stats, etats, auth, utilisateurs, chauffeurs, missions

# Crée les tables si elles n'existent pas encore (suffisant pour le MVP ;
# on passera à Alembic pour les migrations quand le schéma se stabilisera)
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Fleet Tracker API",
    description="Suivi des états et traçabilité des camions — remplace le suivi manuel Google Sheet.",
    version="0.1.0",
)

# En local : ALLOWED_ORIGINS n'est pas défini -> on autorise tout ("*"), pratique pour développer.
# En production (Render) : définir ALLOWED_ORIGINS avec l'URL exacte du frontend
# (ex: https://votre-compte.github.io), séparées par des virgules si plusieurs.
origines = os.getenv("ALLOWED_ORIGINS")
allow_origins = origines.split(",") if origines else ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(camions.router)
app.include_router(stats.router)
app.include_router(etats.router)
app.include_router(auth.router)
app.include_router(utilisateurs.router)
app.include_router(chauffeurs.router)
app.include_router(missions.router)


@app.get("/")
def racine():
    return {"message": "Fleet Tracker API — voir /docs pour la documentation interactive"}


def init_database():
    from seed_etats import seed as seed_etats
    from seed_categorie_dg import seed as seed_categorie_dg
    from create_admin import creer_admin

    print("=== INITIALISATION DE LA BASE DE DONNÉES ===")

    try:
        print("1/3 - Initialisation des états...")
        seed_etats()

        print("2/3 - Initialisation des catégories DG...")
        seed_categorie_dg()

        print("3/3 - Vérification du compte administrateur...")
        creer_admin()

        print("=== INITIALISATION TERMINÉE ===")

    except Exception as e:
        print(f"ERREUR INITIALISATION : {e}")


@app.on_event("startup")
async def startup_event():
    init_database()