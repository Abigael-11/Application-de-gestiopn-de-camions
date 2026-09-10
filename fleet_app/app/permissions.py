"""
Matrice de permissions centralisée -- 6 rôles.
Modules "Missions" et "Finances" volontairement absents : ils n'existent pas
encore dans l'application.
"""
from fastapi import Depends, HTTPException
from app.auth import get_current_user
from app import models

ROLES_VALIDES = (
    "super_admin",
    "admin_transport",
    "dispatcher",
    "maintenance",
    "gestionnaire_flotte",
    "comptable",
)

PERMISSIONS = {
    "camions:creer":      ["super_admin", "admin_transport"],
    "camions:lire":       ["super_admin", "admin_transport", "dispatcher", "maintenance", "gestionnaire_flotte", "comptable"],
    "camions:modifier":   ["super_admin", "admin_transport"],
    "camions:supprimer":  ["super_admin", "admin_transport"],
    "camions:supprimer_definitif": ["super_admin"], 
        "remorques:creer": ["super_admin", "admin_transport"],
    "remorques:lire": ["super_admin", "admin_transport", "dispatcher", "maintenance", "gestionnaire_flotte", "comptable"],
    "remorques:modifier": ["super_admin", "admin_transport","maintenance", "comptable"],
    "remorques:supprimer": ["super_admin", "admin_transport", "maintenance", "comptable"],
    "remorques:supprimer_definitif": ["super_admin"],

    "etats:changer": ["super_admin", "admin_transport", "dispatcher", "maintenance"],
    "etats:lire":    ["super_admin", "admin_transport", "dispatcher", "maintenance", "gestionnaire_flotte"],

    "stats:lire": ["super_admin", "admin_transport", "dispatcher", "gestionnaire_flotte", "comptable"],

    "utilisateurs:gerer": ["super_admin"],
    "utilisateurs:supprimer_definitif": ["super_admin"],

    "parametres:gerer": ["super_admin","admin_transport"],
    "parametres:lire":  ["super_admin", "admin_transport", "dispatcher", "maintenance", "gestionnaire_flotte"],

    "chauffeurs:creer":     ["super_admin", "admin_transport"],
    "chauffeurs:lire":      ["super_admin", "admin_transport", "dispatcher", "maintenance", "gestionnaire_flotte", "comptable"],
    "chauffeurs:modifier":  ["super_admin", "admin_transport"],
    "chauffeurs:supprimer_definitif": ["super_admin","admin_transport"],

    "missions:creer":     ["super_admin", "admin_transport", "dispatcher"],
    "missions:lire":      ["super_admin", "admin_transport", "dispatcher", "gestionnaire_flotte", "comptable"],
    "missions:modifier":  ["super_admin", "admin_transport", "dispatcher"],
    "missions:supprimer": ["super_admin", "admin_transport"],


    "documents:lire": ["super_admin", "admin_transport", "comptable"],
    "documents:modifier_seuils": ["super_admin", "comptable"],
}


def require_permission(permission_key: str):
    roles_autorises = PERMISSIONS.get(permission_key, [])

    def verificateur(utilisateur: models.Utilisateur = Depends(get_current_user)) -> models.Utilisateur:
        if utilisateur.role not in roles_autorises:
            raise HTTPException(
                status_code=403,
                detail=f"Action non autorisée pour le rôle '{utilisateur.role}'.",
            )
        return utilisateur
    return verificateur