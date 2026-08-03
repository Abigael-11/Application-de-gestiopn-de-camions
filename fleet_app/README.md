# Fleet Ops — Suivi de flotte de camions

Application de suivi des états de camions (chargement, trajet, panne, atelier…),
remplaçant un suivi manuel sur Google Sheet. Calcule automatiquement les durées
et le taux d'occupation, avec traçabilité complète par camion.

## Stack technique

- **Backend** : FastAPI + PostgreSQL + SQLAlchemy
- **Frontend** : HTML/CSS/JS simple (pas de build, pas de npm)
- **Authentification** : JWT + rôles (opération / direction / admin)

## Installation

### 1. Prérequis

- Python 3.10+
- PostgreSQL (installé et démarré)

### 2. Créer la base de données

Dans pgAdmin (ou `psql`) :
```sql
CREATE USER fleet_user WITH PASSWORD 'fleet_pass';
CREATE DATABASE fleet_db OWNER fleet_user;
GRANT ALL ON SCHEMA public TO fleet_user;
```

### 3. Environnement Python

```bash
cd fleet_app
python -m venv venv
# Windows :
.\venv\Scripts\Activate.ps1
# Mac/Linux :
source venv/bin/activate

pip install -r requirements.txt
copy .env.example .env   # (ou "cp" sur Mac/Linux)
```

### 4. Initialiser la base

```bash
python seed_etats.py      # charge les 24 états de référence
python create_admin.py    # crée le premier compte admin
```

Ça affiche l'identifiant/mot de passe créés (`admin` / `admin123` par défaut).
**Changez ce mot de passe dès la première connexion** (via un futur écran de
gestion du profil, ou directement en base pour l'instant).

## Lancer l'application

Deux serveurs à lancer **en parallèle**, dans deux terminaux séparés.

**Terminal 1 — Backend**
```bash
uvicorn app.main:app --reload
```
→ API disponible sur http://localhost:8000 (documentation interactive sur `/docs`)

**Terminal 2 — Frontend**
```bash
cd frontend
python -m http.server 3000
```
→ Application disponible sur http://localhost:3000/login.html

## Rôles

| Rôle | Peut consulter | Peut changer un état | Accès Paramètres |
|---|---|---|---|
| `operation` | ✅ | ✅ | ❌ |
| `direction` | ✅ | ❌ (lecture seule) | ❌ |
| `admin` | ✅ | ✅ | ✅ (utilisateurs, camions, états) |

Seul un admin peut créer de nouveaux comptes, depuis **Paramètres → Utilisateurs**.

## Structure du projet

```
fleet_app/
├── app/                  # Backend FastAPI
│   ├── main.py
│   ├── models.py         # Camion, EtatReference, HistoriqueEtat, Utilisateur
│   ├── auth.py           # JWT, hashage mots de passe, protection des routes
│   ├── crud.py
│   ├── schemas.py
│   └── routers/
├── frontend/             # Interface web (HTML/CSS/JS, sans build)
│   ├── login.html
│   ├── index.html        # Tableau de bord
│   ├── camion.html        # Détail + traçabilité d'un camion
│   ├── historique.html
│   └── parametres.html
├── seed_etats.py          # Charge les 24 états dans la base
├── create_admin.py        # Crée le premier compte admin
└── requirements.txt
```

## Notes de conception importantes

- **Historisation** : chaque changement d'état crée une nouvelle ligne
  horodatée dans `historique_etats` ; rien n'est jamais écrasé. C'est ce qui
  permet de calculer des durées fiables.
- **Catégories d'états** : `actif` / `attente` / `immobilisation`. La question
  de savoir si "attente" compte comme temps productif dans le taux
  d'occupation reste **à confirmer avec l'équipe opération** (voir
  commentaires dans `seed_etats.py`).
- **Intégration GPS** : volontairement hors scope pour l'instant. Le champ
  `lien_dossier_externe` sur chaque camion permet de renvoyer vers le système
  GPS/dossier existant sans dupliquer les données.
