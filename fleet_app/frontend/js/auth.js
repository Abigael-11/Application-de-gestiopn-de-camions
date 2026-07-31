/**
 * Gestion de la session utilisateur, partagée par toutes les pages.
 * Le token JWT est stocké dans localStorage -- propre à ce navigateur/cette machine.
 */
const session = {
  getToken: () => localStorage.getItem("fleetops_token"),
  getRole: () => localStorage.getItem("fleetops_role"),
  getNom: () => localStorage.getItem("fleetops_nom"),
  getIdentifiant: () => localStorage.getItem("fleetops_identifiant"),

  save(data) {
    localStorage.setItem("fleetops_token", data.access_token);
    localStorage.setItem("fleetops_role", data.role);
    localStorage.setItem("fleetops_nom", data.nom);
    localStorage.setItem("fleetops_identifiant", data.identifiant);
  },

  clear() {
    localStorage.removeItem("fleetops_token");
    localStorage.removeItem("fleetops_role");
    localStorage.removeItem("fleetops_nom");
    localStorage.removeItem("fleetops_identifiant");
  },

  isLoggedIn() {
    return !!this.getToken();
  },
};

const ROLE_LABEL = { operation: "Équipe Opération", direction: "Direction", admin: "Administrateur" };

/**
 * À appeler en tout premier sur chaque page protégée (dashboard, camion,
 * historique, paramètres). Redirige vers la connexion si pas de session.
 */
function requireAuth() {
  if (!session.isLoggedIn()) {
    window.location.href = "login.html";
    return false;
  }
  return true;
}

function logout() {
  session.clear();
  window.location.href = "login.html";
}

/** Remplit le pied de sidebar avec le nom/rôle réels, et adapte la navigation visible selon le rôle. */
function initSidebarSession() {
  const teamEl = document.querySelector(".sidebar-footer .team");
  const locEl = document.querySelector(".sidebar-footer .loc");
  if (teamEl) teamEl.textContent = session.getNom() || "—";
  if (locEl) locEl.innerHTML = `${ROLE_LABEL[session.getRole()] || session.getRole()} · <a href="#" onclick="logout()" style="color:var(--text-muted);text-decoration:underline;">Se déconnecter</a>`;

  // Le lien Paramètres est visible pour admin (tout) et operation (gestion des camions) -- masqué pour direction
  if (session.getRole() === "direction") {
    document.querySelectorAll('a.nav-item[href="parametres.html"]').forEach((a) => a.style.display = "none");
  }
}

/* ---------- Formulaire de connexion (uniquement présent sur login.html) ---------- */
const loginForm = document.getElementById("loginForm");
if (loginForm) {
  // Si déjà connecté, pas besoin de repasser par le login
  if (session.isLoggedIn()) window.location.href = "index.html";

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("btnLogin");
    const errBox = document.getElementById("loginError");
    errBox.style.display = "none";
    btn.disabled = true;
    btn.textContent = "Connexion…";
    try {
      const data = await apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          identifiant: document.getElementById("identifiant").value,
          mot_de_passe: document.getElementById("motDePasse").value,
        }),
      });
      session.save(data);
      window.location.href = "index.html";
    } catch (err) {
      errBox.textContent = err.message;
      errBox.style.display = "block";
    } finally {
      btn.disabled = false;
      btn.textContent = "Se connecter";
    }
  });
}
