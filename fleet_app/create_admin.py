"""
Crée le tout premier compte administrateur, nécessaire pour ensuite créer
les autres utilisateurs (opération, direction) depuis l'application.

⚠️ Changez le mot de passe par défaut après la première connexion !

Usage : python create_admin.py
"""
from app.database import SessionLocal, Base, engine
from app.models import Utilisateur
from app.auth import hash_password

Base.metadata.create_all(bind=engine)

IDENTIFIANT_DEFAUT = "admin"
MOT_DE_PASSE_DEFAUT = "admin123"  # à changer immédiatement après la première connexion


def creer_admin():
    db = SessionLocal()
    try:
        existant = db.query(Utilisateur).filter_by(identifiant=IDENTIFIANT_DEFAUT).first()
        if existant:
            print(f"Le compte '{IDENTIFIANT_DEFAUT}' existe déjà. Rien à faire.")
            return

        admin = Utilisateur(
            nom="Administrateur",
            identifiant=IDENTIFIANT_DEFAUT,
            mot_de_passe_hash=hash_password(MOT_DE_PASSE_DEFAUT),
            role="admin",
        )
        db.add(admin)
        db.commit()
        print(f"Compte admin créé : identifiant='{IDENTIFIANT_DEFAUT}', mot de passe='{MOT_DE_PASSE_DEFAUT}'")
        print("⚠️  Changez ce mot de passe dès votre première connexion.")
    finally:
        db.close()


if __name__ == "__main__":
    creer_admin()
