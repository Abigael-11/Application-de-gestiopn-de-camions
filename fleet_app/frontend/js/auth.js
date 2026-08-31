const theme = {
  KEY: "fleetops_theme",
  get: () => localStorage.getItem(theme.KEY) || "light",
  apply(value) {
    if (value === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  },
  set(value) {
    localStorage.setItem(theme.KEY, value);
    theme.apply(value);
  },
  toggle() {
    theme.set(theme.get() === "dark" ? "light" : "dark");
    updateThemeToggleLabel();
  },
};

function updateThemeToggleLabel() {
  const btn = document.getElementById("themeToggleBtn");
  if (!btn) return;
  btn.textContent = theme.get() === "dark" ? "☀ Mode clair" : "🌙 Mode sombre";
}

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
const ROLE_LABEL = {
  super_admin: "Super Administrateur",
  admin_transport: "Administrateur Transport",
  dispatcher: "Exploitant / Dispatcher",
  maintenance: "Responsable Maintenance",
  gestionnaire_flotte: "Gestionnaire de Flotte",
  comptable: "Comptable",
};
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
function initSidebarSession() {
  const teamEl = document.querySelector(".sidebar-footer .team");
  const locEl = document.querySelector(".sidebar-footer .loc");
  if (teamEl) teamEl.textContent = session.getNom() || "-";
  if (locEl) locEl.innerHTML = `${ROLE_LABEL[session.getRole()] || session.getRole()} - <a href="#" onclick="logout()" style="color:var(--text-muted);text-decoration:underline;">Se deconnecter</a>`;
  if (session.getRole() === "comptable") {
    document.querySelectorAll('a.nav-item[href="parametres.html"]').forEach((a) => a.style.display = "none");
  }

  const footer = document.querySelector(".sidebar-footer");
  if (footer && !document.getElementById("themeToggleBtn")) {
    const btn = document.createElement("button");
    btn.id = "themeToggleBtn";
    btn.className = "theme-toggle";
    btn.type = "button";
    btn.addEventListener("click", theme.toggle);
    footer.appendChild(btn);
    updateThemeToggleLabel();
  }
}
const loginForm = document.getElementById("loginForm");
if (loginForm) {
  if (session.isLoggedIn()) window.location.href = "index.html";
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("btnLogin");
    const errBox = document.getElementById("loginError");
    errBox.style.display = "none";
    btn.disabled = true;
    btn.textContent = "Connexion...";
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