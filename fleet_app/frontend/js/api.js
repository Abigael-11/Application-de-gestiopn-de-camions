// En local (ouvert via python -m http.server), on cible le backend local.
// Une fois déployé (GitHub Pages, etc.), on cible le backend en ligne --
// remplacez la valeur ci-dessous par l'URL Render une fois que vous l'avez.
const BACKEND_URL_PRODUCTION = "https://VOTRE-APP.onrender.com"; // <-- à modifier après déploiement

const API_BASE = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
  ? "http://127.0.0.1:8000"
  : BACKEND_URL_PRODUCTION;

/**
 * Wrapper fetch commun : gère les erreurs réseau (backend éteint) et les
 * erreurs métier (4xx/5xx renvoyées par FastAPI avec un champ "detail").
 */
async function apiFetch(path, options = {}) {
  const token = typeof session !== "undefined" ? session.getToken() : null;
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch (err) {
    throw new ApiError(
      "Impossible de joindre le serveur. Vérifiez que l'API tourne (uvicorn app.main:app --reload) sur http://localhost:8000.",
      0
    );
  }

  let data = null;
  try { data = await response.json(); } catch { /* réponse vide, ok */ }

  if (response.status === 401 && token && path !== "/auth/login") {
    // Session expirée ou invalide -- on nettoie et on renvoie vers la connexion
    session.clear();
    window.location.href = "login.html";
    return;
  }

  if (!response.ok) {
    const message = (data && data.detail) || `Erreur ${response.status}`;
    throw new ApiError(message, response.status);
  }
  return data;
}

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

const api = {
  listCamions: () => apiFetch("/camions/"),
  getCamion: (id) => apiFetch(`/camions/${id}`),
  createCamion: (payload) =>
    apiFetch("/camions/", { method: "POST", body: JSON.stringify(payload) }),
  updateCamion: (id, payload) =>
    apiFetch(`/camions/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  changerEtat: (id, payload) =>
    apiFetch(`/camions/${id}/changer-etat`, { method: "POST", body: JSON.stringify(payload) }),
  historique: (id, depuisJours) =>
    apiFetch(`/camions/${id}/historique${depuisJours ? `?depuis_jours=${depuisJours}` : ""}`),
  listEtats: () => apiFetch("/etats/"),
  dureeMoyenne: (camionId, derniersJours) =>
    apiFetch(
      `/stats/duree-moyenne?derniers_jours=${derniersJours || 30}` +
      (camionId ? `&camion_id=${camionId}` : "")
    ),
  listUtilisateurs: () => apiFetch("/utilisateurs/"),
  createUtilisateur: (payload) =>
    apiFetch("/utilisateurs/", { method: "POST", body: JSON.stringify(payload) }),
  desactiverUtilisateur: (id) =>
    apiFetch(`/utilisateurs/${id}/desactiver`, { method: "PATCH" }),
};

/* ---------- Aides communes ---------- */

const CATEGORIE_LABEL = { actif: "Actif", attente: "Attente", immobilisation: "Immobilisation" };

function badgeHtml(etat) {
  if (!etat) return `<span class="badge" style="background:var(--bg-app);color:var(--text-muted)">Aucun état</span>`;
  const cat = etat.categorie || "attente";
  return `<span class="badge badge-${cat}"><span class="badge-dot" style="background:currentColor"></span>${escapeHtml(etat.libelle)}</span>`;
}

function formatDuree(heures) {
  if (heures === null || heures === undefined) return "—";
  if (heures < 1) return `${Math.round(heures * 60)}min`;
  if (heures < 24) return `${Math.round(heures)}h`;
  const jours = Math.floor(heures / 24);
  const reste = Math.round(heures % 24);
  return reste > 0 ? `${jours}j ${reste}h` : `${jours}j`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function showToast(message, isError = false) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = message;
  el.style.borderLeftColor = isError ? "var(--immob)" : "var(--actif)";
  el.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.remove("show"), 3500);
}
