import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, engine
from app.routers import camions, stats, etats, auth, utilisateurs

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


@app.get("/")
def racine():
    return {"message": "Fleet Tracker API — voir /docs pour la documentation interactive"}
