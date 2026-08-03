const el = (id) => document.getElementById(id);
let camionEnEdition = null;

async function init() {
  if (!requireAuth()) return;
  const role = session.getRole();
  if (role !== "admin" && role !== "operation") {
    window.location.href = "index.html";
    return;
  }
  initSidebarSession();

  // L'équipe opération ne gère que les camions -- les autres onglets
  // (États, Utilisateurs, Seuils) restent réservés à l'admin.
  if (role === "operation") {
    document.querySelectorAll('.ptab').forEach((tab) => {
      if (tab.dataset.panel !== "camions") tab.style.display = "none";
    });
    document.querySelectorAll('.ptab').forEach((t) => t.classList.remove("active"));
    document.querySelectorAll('.panel').forEach((p) => p.classList.remove("active"));
    document.querySelector('.ptab[data-panel="camions"]').classList.add("active");
    el("panel-camions").classList.add("active");
  }

  document.querySelectorAll(".ptab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".ptab").forEach((t) => t.classList.remove("active"));
      document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
      tab.classList.add("active");
      el(`panel-${tab.dataset.panel}`).classList.add("active");
    });
  });

  el("btnCancel").addEventListener("click", closeModal);
  el("modalOverlay").addEventListener("click", (e) => { if (e.target.id === "modalOverlay") closeModal(); });
  el("btnConfirm").addEventListener("click", enregistrerLien);

  el("btnNouvelUtilisateur").addEventListener("click", ouvrirNouvelUtilisateur);
  el("btnCancelUser").addEventListener("click", closeModalUser);
  el("modalOverlayUser").addEventListener("click", (e) => { if (e.target.id === "modalOverlayUser") closeModalUser(); });
  el("btnConfirmUser").addEventListener("click", enregistrerUtilisateur);

  el("btnNouveauCamion").addEventListener("click", ouvrirNouveauCamion);
  el("btnCancelCamion").addEventListener("click", closeModalCamion);
  el("modalOverlayCamion").addEventListener("click", (e) => { if (e.target.id === "modalOverlayCamion") closeModalCamion(); });
  el("btnConfirmCamion").addEventListener("click", enregistrerNouveauCamion);

  el("btnNouvelEtat").addEventListener("click", ouvrirNouvelEtat);
  el("btnCancelEtat").addEventListener("click", closeModalEtat);
  el("modalOverlayEtat").addEventListener("click", (e) => { if (e.target.id === "modalOverlayEtat") closeModalEtat(); });
  el("btnConfirmEtat").addEventListener("click", enregistrerEtat);

  await loadCamions();
  if (role === "admin") {
    initSeuil();
    await loadEtats();
    await loadUtilisateurs();
  }
}

let etatEnEdition = null;

async function loadEtats() {
  try {
    const etats = await api.listEtats();
    etats.sort((a, b) => (a.groupe || "").localeCompare(b.groupe || "") || a.libelle.localeCompare(b.libelle));
    el("etatsBody").innerHTML = etats.map((e) => `
      <tr>
        <td>${escapeHtml(e.libelle)}<div style="font-size:11px;color:var(--text-muted);">${escapeHtml(e.code)}</div></td>
        <td>${escapeHtml(e.groupe || "—")}</td>
        <td><span class="status-pill status-${e.categorie}">${CATEGORIE_LABEL[e.categorie] || e.categorie}</span></td>
        <td><button class="btn btn-secondary btn-sm" onclick='ouvrirEditionEtat(${JSON.stringify(e)})'>✎ Modifier</button></td>
      </tr>
    `).join("");
  } catch (err) {
    showConnError(err);
  }
}

function ouvrirNouvelEtat() {
  etatEnEdition = null;
  el("modalEtatTitre").textContent = "Nouvel état";
  el("eCode").value = "";
  el("eCode").disabled = false;
  el("eLibelle").value = "";
  el("eGroupe").value = "Deplacement";
  el("eCategorie").value = "actif";
  el("modalErrorEtat").style.display = "none";
  el("modalOverlayEtat").classList.add("open");
}

function ouvrirEditionEtat(etat) {
  etatEnEdition = etat;
  el("modalEtatTitre").textContent = `Modifier — ${etat.libelle}`;
  el("eCode").value = etat.code;
  el("eCode").disabled = true; // le code est la clé technique, non modifiable
  el("eLibelle").value = etat.libelle;
  el("eGroupe").value = etat.groupe || "Autre";
  el("eCategorie").value = etat.categorie;
  el("modalErrorEtat").style.display = "none";
  el("modalOverlayEtat").classList.add("open");
}

function closeModalEtat() { el("modalOverlayEtat").classList.remove("open"); }

async function enregistrerEtat() {
  const btn = el("btnConfirmEtat");
  const errBox = el("modalErrorEtat");
  errBox.style.display = "none";

  const libelle = el("eLibelle").value.trim();
  const code = el("eCode").value.trim();
  if (!libelle || !code) {
    errBox.textContent = "Le code et le libellé sont obligatoires.";
    errBox.style.display = "block";
    return;
  }

  btn.disabled = true;
  btn.textContent = "Enregistrement…";
  try {
    if (etatEnEdition) {
      await api.updateEtat(etatEnEdition.id, {
        libelle, groupe: el("eGroupe").value, categorie: el("eCategorie").value,
      });
    } else {
      await api.createEtat({
        code, libelle, groupe: el("eGroupe").value, categorie: el("eCategorie").value,
      });
    }
    closeModalEtat();
    showToast(etatEnEdition ? "État mis à jour." : "État créé avec succès.");
    await loadEtats();
  } catch (err) {
    errBox.textContent = err.message;
    errBox.style.display = "block";
  } finally {
    btn.disabled = false;
    btn.textContent = "Enregistrer";
  }
}

async function loadCamions() {
  try {
    const camions = await api.listCamions(true); // inclut aussi les désactivés, pour pouvoir les réactiver
    if (!camions.length) {
      el("camionsBody").innerHTML = `<tr><td colspan="7" style="color:var(--text-muted);text-align:center;padding:24px;">Aucun camion enregistré pour l'instant.</td></tr>`;
      return;
    }
    el("camionsBody").innerHTML = camions.map((c) => `
      <tr style="${!c.camion.actif ? 'opacity:0.5;' : ''}">
        <td><strong>${escapeHtml(c.camion.immatriculation)}</strong></td>
        <td>${escapeHtml(c.camion.marque || "—")}</td>
        <td>${c.camion.capacite_tonnes ? c.camion.capacite_tonnes + "t" : "—"}</td>
        <td>${escapeHtml(c.camion.chauffeur_actuel || "—")}</td>
        <td class="link-cell" title="${escapeHtml(c.camion.lien_dossier_externe || "")}">${c.camion.lien_dossier_externe ? escapeHtml(c.camion.lien_dossier_externe) : "—"}</td>
        <td>${c.camion.actif ? '<span style="color:var(--actif)">Actif</span>' : '<span style="color:var(--text-muted)">Désactivé</span>'}</td>
        <td>
          <div class="row-actions">
            <button class="btn btn-secondary btn-sm" onclick='ouvrirEdition(${JSON.stringify(c.camion)})'>✎ Modifier</button>
            <button class="btn btn-secondary btn-sm" onclick="toggleActifCamion(${c.camion.id}, ${c.camion.actif})">${c.camion.actif ? "Désactiver" : "Réactiver"}</button>
            <button class="btn btn-secondary btn-sm" style="color:var(--immob);" onclick="supprimerCamion(${c.camion.id}, '${escapeHtml(c.camion.immatriculation)}')">🗑</button>
          </div>
        </td>
      </tr>
    `).join("");
  } catch (err) {
    showConnError(err);
  }
}

async function toggleActifCamion(id, actifActuel) {
  try {
    await api.updateCamion(id, { actif: !actifActuel });
    showToast(actifActuel ? "Camion désactivé." : "Camion réactivé.");
    await loadCamions();
  } catch (err) {
    showToast(err.message, true);
  }
}

async function supprimerCamion(id, immatriculation) {
  if (!confirm(`Supprimer définitivement ${immatriculation} ? Cette action est irréversible et n'est possible que si le camion n'a aucun historique.`)) return;
  try {
    await api.deleteCamion(id);
    showToast("Camion supprimé.");
    await loadCamions();
  } catch (err) {
    // Cas fréquent : le backend refuse car un historique existe -- on le dit clairement
    showToast(err.message, true);
  }
}

function showConnError(err) {
  el("connError").style.display = "block";
  el("connError").innerHTML = `<strong>Connexion au serveur impossible.</strong><br>${escapeHtml(err.message)}`;
}

function ouvrirEdition(camion) {
  camionEnEdition = camion;
  el("modalSub").textContent = `Camion ${camion.immatriculation}`;
  el("fChauffeur").value = camion.chauffeur_actuel || "";
  el("fLien").value = camion.lien_dossier_externe || "";
  el("modalError").style.display = "none";
  el("modalOverlay").classList.add("open");
}
function closeModal() { el("modalOverlay").classList.remove("open"); }

async function enregistrerLien() {
  const btn = el("btnConfirm");
  btn.disabled = true;
  btn.textContent = "Enregistrement…";
  try {
    await api.updateCamion(camionEnEdition.id, {
      lien_dossier_externe: el("fLien").value || null,
      chauffeur_actuel: el("fChauffeur").value || null,
    });
    closeModal();
    showToast("Camion mis à jour.");
    await loadCamions();
  } catch (err) {
    el("modalError").textContent = err.message;
    el("modalError").style.display = "block";
  } finally {
    btn.disabled = false;
    btn.textContent = "Enregistrer";
  }
}

/* ---------- Nouveau camion ---------- */
function ouvrirNouveauCamion() {
  el("cImmat").value = "";
  el("cMarque").value = "";
  el("cCapacite").value = "";
  el("cChauffeur").value = "";
  el("modalErrorCamion").style.display = "none";
  el("modalOverlayCamion").classList.add("open");
}
function closeModalCamion() { el("modalOverlayCamion").classList.remove("open"); }

async function enregistrerNouveauCamion() {
  const btn = el("btnConfirmCamion");
  const errBox = el("modalErrorCamion");
  errBox.style.display = "none";

  const immatriculation = el("cImmat").value.trim();
  if (!immatriculation) {
    errBox.textContent = "L'immatriculation est obligatoire.";
    errBox.style.display = "block";
    return;
  }

  btn.disabled = true;
  btn.textContent = "Création…";
  try {
    await api.createCamion({
      immatriculation,
      marque: el("cMarque").value || null,
      capacite_tonnes: el("cCapacite").value ? parseFloat(el("cCapacite").value) : null,
      chauffeur_actuel: el("cChauffeur").value || null,
    });
    closeModalCamion();
    showToast("Camion créé avec succès.");
    await loadCamions();
  } catch (err) {
    errBox.textContent = err.message;
    errBox.style.display = "block";
  } finally {
    btn.disabled = false;
    btn.textContent = "Créer le camion";
  }
}

/* ---------- Utilisateurs ---------- */

const ROLE_LABEL_PARAM = { operation: "Opération", direction: "Direction", admin: "Admin" };

async function loadUtilisateurs() {
  try {
    const utilisateurs = await api.listUtilisateurs();
    el("utilisateursBody").innerHTML = utilisateurs.map((u) => `
      <tr>
        <td><strong>${escapeHtml(u.nom)}</strong>${u.identifiant === session.getIdentifiant() ? ' <span style="color:var(--text-muted);font-size:11px;">(vous)</span>' : ""}</td>
        <td>${escapeHtml(u.identifiant)}</td>
        <td><span class="status-pill status-${u.role === "admin" ? "immobilisation" : u.role === "direction" ? "attente" : "actif"}">${ROLE_LABEL_PARAM[u.role] || u.role}</span></td>
        <td>${u.actif ? '<span style="color:var(--actif)">Actif</span>' : '<span style="color:var(--text-muted)">Désactivé</span>'}</td>
       <td>${u.actif && u.identifiant !== session.getIdentifiant() ? `<button class="btn btn-secondary btn-sm" onclick="desactiverUtilisateur(${u.id})">Désactiver</button>` : (!u.actif ? `<button class="btn btn-secondary btn-sm" onclick="reactiverUtilisateur(${u.id})">Réactiver</button>` : "—")}</td>
      </tr>
    `).join("");
  } catch (err) {
    showConnError(err);
  }
}

function ouvrirNouvelUtilisateur() {
  el("uNom").value = "";
  el("uIdentifiant").value = "";
  el("uMotDePasse").value = "";
  el("uRole").value = "operation";
  el("modalErrorUser").style.display = "none";
  el("modalOverlayUser").classList.add("open");
}
function closeModalUser() { el("modalOverlayUser").classList.remove("open"); }

async function enregistrerUtilisateur() {
  const btn = el("btnConfirmUser");
  const errBox = el("modalErrorUser");
  errBox.style.display = "none";

  const nom = el("uNom").value.trim();
  const identifiant = el("uIdentifiant").value.trim();
  const motDePasse = el("uMotDePasse").value;
  if (!nom || !identifiant || motDePasse.length < 8) {
    errBox.textContent = "Nom, identifiant requis, et mot de passe d'au moins 8 caractères.";
    errBox.style.display = "block";
    return;
  }

  btn.disabled = true;
  btn.textContent = "Création…";
  try {
    await api.createUtilisateur({ nom, identifiant, mot_de_passe: motDePasse, role: el("uRole").value });
    closeModalUser();
    showToast("Utilisateur créé avec succès.");
    await loadUtilisateurs();
  } catch (err) {
    errBox.textContent = err.message;
    errBox.style.display = "block";
  } finally {
    btn.disabled = false;
    btn.textContent = "Créer le compte";
  }
}

async function desactiverUtilisateur(id) {
  if (!confirm("Désactiver ce compte ? La personne ne pourra plus se connecter.")) return;
  try {
    await api.desactiverUtilisateur(id);
    showToast("Compte désactivé.");
    await loadUtilisateurs();
  } catch (err) {
    showToast(err.message, true);
  }
}


async function reactiverUtilisateur(id) {
  try {
    await api.reactiverUtilisateur(id);
    showToast("Compte réactivé.");
    await loadUtilisateurs();
  } catch (err) {
    showToast(err.message, true);
  }
}

/* ---------- Seuil d'alerte (persisté en local sur cette machine) ---------- */
function initSeuil() {
  const saved = parseInt(localStorage.getItem("fleetops_seuil_alerte_heures"), 10) || 48;
  el("seuilSlider").value = saved;
  updateSeuilDisplay(saved);
  el("seuilSlider").addEventListener("input", (e) => updateSeuilDisplay(parseInt(e.target.value, 10)));
  el("btnSaveSeuil").addEventListener("click", () => {
    const val = parseInt(el("seuilSlider").value, 10);
    localStorage.setItem("fleetops_seuil_alerte_heures", val);
    el("seuilActuel").textContent = `${val}h`;
    showToast("Seuil d'alerte enregistré. Il sera appliqué au tableau de bord après actualisation.");
  });
}
function updateSeuilDisplay(val) {
  el("seuilVal").textContent = val;
  el("seuilJours").textContent = (val / 24).toFixed(val % 24 === 0 ? 0 : 1);
}

init();
