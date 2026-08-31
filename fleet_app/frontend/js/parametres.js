const el = (id) => document.getElementById(id);
let camionEnEdition = null;

async function init() {
  if (!requireAuth()) return;
  const role = session.getRole();
  if (role === "comptable") {
    window.location.href = "index.html";
    return;
  }
  initSidebarSession();

  el("btnNouveauChauffeur").addEventListener("click", ouvrirNouveauChauffeur);
  el("btnCancelChauffeur").addEventListener("click", closeModalChauffeur);
  el("modalOverlayChauffeur").addEventListener("click", (e) => { if (e.target.id === "modalOverlayChauffeur") closeModalChauffeur(); });
  el("btnConfirmChauffeur").addEventListener("click", enregistrerChauffeur);

  if (role !== "super_admin") {
    document.querySelectorAll('.ptab').forEach((tab) => {
      if (tab.dataset.panel !== "camions" && tab.dataset.panel !== "chauffeurs") tab.style.display = "none";  
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
  await loadChauffeurs();
  if (role === "super_admin") {
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
        <td>${escapeHtml(e.categorie_dg || "—")}</td>
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
  el("eCategorieDg").value = "";
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
  el("eCategorieDg").value = etat.categorie_dg || "";
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
    errBox.textContent = "Le code et le libelle sont obligatoires.";
    errBox.style.display = "block";
    return;
  }

  btn.disabled = true;
  btn.textContent = "Enregistrement...";
  try {
    if (etatEnEdition) {
      await api.updateEtat(etatEnEdition.id, {
        libelle: libelle,
        groupe: el("eGroupe").value,
        categorie: el("eCategorie").value,
        categorie_dg: el("eCategorieDg").value || null,
      });
    } else {
      await api.createEtat({
        code: code,
        libelle: libelle,
        groupe: el("eGroupe").value,
        categorie: el("eCategorie").value,
        categorie_dg: el("eCategorieDg").value || null,
      });
    }
    closeModalEtat();
    showToast(etatEnEdition ? "Etat mis a jour." : "Etat cree avec succes.");
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
      <td><strong>${escapeHtml(c.camion.unit || "—")}</strong></td>
      <td>${escapeHtml(c.camion.immatriculation)}</td>
      <td>${escapeHtml(c.camion.marque || "—")}</td>
      <td>${c.camion.capacite_tonnes ? c.camion.capacite_tonnes + "t" : "—"}</td>
      <td>${escapeHtml(c.camion.chauffeur_actuel || "—")}</td>
      <td>${c.camion.actif ? '<span style="color:var(--actif)">Actif</span>' : '<span style="color:var(--text-muted)">Désactivé</span>'}</td>
      <td>
        <div class="row-actions">
          <button class="btn btn-secondary btn-sm" onclick='ouvrirEdition(${JSON.stringify(c.camion)})'>✎ Modifier</button>
          <button class="btn btn-secondary btn-sm" onclick="toggleActifCamion(${c.camion.id}, ${c.camion.actif})">${c.camion.actif ? "Désactiver" : "Réactiver"}</button>
          ${session.getRole() === "super_admin" ? `<button class="btn btn-secondary btn-sm" style="color:var(--immob);font-weight:600;" onclick="supprimerCamionDefinitif(${c.camion.id}, '${escapeHtml(c.camion.immatriculation)}')">🗑 Définitif</button>` : ""}
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
    showToast(err.message, true);
  }
}

async function supprimerCamionDefinitif(id, immatriculation) {
  const saisie = prompt(`ATTENTION : suppression DÉFINITIVE et IRRÉVERSIBLE de ${immatriculation}, y compris tout son historique.\nTapez l'immatriculation exacte pour confirmer :`);
  if (saisie !== immatriculation) {
    if (saisie !== null) showToast("Confirmation incorrecte, suppression annulée.", true);
    return;
  }
  try {
    await api.deleteCamionDefinitif(id);
    showToast("Camion et historique supprimés définitivement.");
    await loadCamions();
  } catch (err) {
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
  el("fUnit").value = camion.unit || "";
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
      unit: el("fUnit").value || null,
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
  el("cUnit").value = "";
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
      unit: el("cUnit").value || null,
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

const ROLE_LABEL_PARAM = {
  super_admin: "Super Administrateur",
  admin_transport: "Administrateur Transport",
  dispatcher: "Exploitant / Dispatcher",
  maintenance: "Responsable Maintenance",
  gestionnaire_flotte: "Gestionnaire de Flotte",
  comptable: "Comptable",
};
const ROLE_COULEUR_PARAM = {
  super_admin: "immobilisation",
  admin_transport: "immobilisation",
  dispatcher: "attente",
  maintenance: "attente",
  gestionnaire_flotte: "attente",
  comptable: "actif",
};

async function loadUtilisateurs() {
  try {
    const utilisateurs = await api.listUtilisateurs();
    el("utilisateursBody").innerHTML = utilisateurs.map((u) => {
      const estMoi = u.identifiant === session.getIdentifiant();
      const optionsRole = Object.keys(ROLE_LABEL_PARAM).map((r) =>
        `<option value="${r}" ${r === u.role ? "selected" : ""}>${ROLE_LABEL_PARAM[r]}</option>`
      ).join("");
      return `
      <tr>
        <td><strong>${escapeHtml(u.nom)}</strong>${estMoi ? ' <span style="color:var(--text-muted);font-size:11px;">(vous)</span>' : ""}</td>
        <td>${escapeHtml(u.identifiant)}</td>
        <td>
          ${estMoi
            ? `<span class="status-pill status-${ROLE_COULEUR_PARAM[u.role] || "actif"}">${ROLE_LABEL_PARAM[u.role] || u.role}</span>`
            : `<select onchange="changerRoleUtilisateur(${u.id}, this.value)" style="font-size:12px;padding:4px 6px;">${optionsRole}</select>`}
        </td>
        <td>${u.actif ? '<span style="color:var(--actif)">Actif</span>' : '<span style="color:var(--text-muted)">Désactivé</span>'}</td>
        <td>
          ${u.actif && !estMoi ? `<button class="btn btn-secondary btn-sm" onclick="desactiverUtilisateur(${u.id})">Désactiver</button>` : (!u.actif ? `<button class="btn btn-secondary btn-sm" onclick="reactiverUtilisateur(${u.id})">Réactiver</button>` : "—")}
          ${session.getRole() === "super_admin" && !estMoi ? `<button class="btn btn-secondary btn-sm" style="color:var(--immob);font-weight:600;" onclick="supprimerUtilisateurDefinitif(${u.id}, '${escapeHtml(u.identifiant)}')">🗑 Définitif</button>` : ""}
        </td>
      </tr>
    `;
    }).join("");
  } catch (err) {
    showConnError(err);
  }
}

async function changerRoleUtilisateur(id, role) {
  if (!confirm("Changer le rôle de cet utilisateur ?")) {
    await loadUtilisateurs();
    return;
  }
  try {
    await api.changerRoleUtilisateur(id, role);
    showToast("Rôle mis à jour.");
    await loadUtilisateurs();
  } catch (err) {
    showToast(err.message, true);
    await loadUtilisateurs();
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

async function supprimerUtilisateurDefinitif(id, identifiant) {
  const saisie = prompt(`ATTENTION : suppression DÉFINITIVE et IRRÉVERSIBLE du compte "${identifiant}".\nTapez l'identifiant exact pour confirmer :`);
  if (saisie !== identifiant) {
    if (saisie !== null) showToast("Confirmation incorrecte, suppression annulée.", true);
    return;
  }
  try {
    await api.deleteUtilisateurDefinitif(id);
    showToast("Utilisateur supprimé définitivement.");
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

/* ---------- Chauffeurs ---------- */
let chauffeurEnEdition = null;

async function loadChauffeurs() {
  try {
    const [chauffeurs, camions] = await Promise.all([api.listChauffeurs(true), api.listCamions(true)]);

    // Remplit le menu déroulant "Camion affecté" du modal
    const select = el("chCamionId");
    select.innerHTML = '<option value="">— Aucun —</option>' +
      camions.map((c) => `<option value="${c.camion.id}">${escapeHtml(c.camion.immatriculation)}</option>`).join("");

    if (!chauffeurs.length) {
      el("chauffeursBody").innerHTML = `<tr><td colspan="7" style="color:var(--text-muted);text-align:center;padding:24px;">Aucun chauffeur enregistré pour l'instant.</td></tr>`;
      return;
    }

    el("chauffeursBody").innerHTML = chauffeurs.map((ch) => {
      const camion = camions.find((c) => c.camion.id === ch.camion_id);
      const expiresBientot = ch.date_expiration_permis && (new Date(ch.date_expiration_permis) - new Date()) / 86400000 < 30;
      return `
        <tr style="${!ch.actif ? 'opacity:0.5;' : ''}">
          <td><strong>${escapeHtml(ch.prenom)} ${escapeHtml(ch.nom)}</strong></td>
          <td>${escapeHtml(ch.telephone || "—")}</td>
          <td>${escapeHtml(ch.numero_permis || "—")}${ch.categorie_permis ? " (" + escapeHtml(ch.categorie_permis) + ")" : ""}</td>
          <td style="${expiresBientot ? 'color:var(--immob);font-weight:600;' : ''}">${ch.date_expiration_permis ? new Date(ch.date_expiration_permis).toLocaleDateString("fr-FR") : "—"}${expiresBientot ? " ⚠" : ""}</td>
          <td>${escapeHtml(ch.disponibilite || "—")}</td>
          <td>${camion ? escapeHtml(camion.camion.immatriculation) : "—"}</td>
          <td>
            <div class="row-actions">
              <button class="btn btn-secondary btn-sm" onclick='ouvrirEditionChauffeur(${JSON.stringify(ch)})'>✎ Modifier</button>
              <button class="btn btn-secondary btn-sm" onclick="toggleActifChauffeur(${ch.id}, ${ch.actif})">${ch.actif ? "Désactiver" : "Réactiver"}</button>
              ${session.getRole() === "super_admin" ? `<button class="btn btn-secondary btn-sm" style="color:var(--immob);font-weight:600;" onclick="supprimerChauffeurDefinitif(${ch.id}, '${escapeHtml(ch.prenom)} ${escapeHtml(ch.nom)}')">🗑 Définitif</button>` : ""}
            </div>
          </td>
        </tr>
      `;
    }).join("");
  } catch (err) {
    showConnError(err);
  }
}

async function toggleActifChauffeur(id, actifActuel) {
  try {
    await api.updateChauffeur(id, { actif: !actifActuel });
    showToast(actifActuel ? "Chauffeur désactivé." : "Chauffeur réactivé.");
    await loadChauffeurs();
  } catch (err) {
    showToast(err.message, true);
  }
}

async function supprimerChauffeurDefinitif(id, nomComplet) {
  const saisie = prompt(`ATTENTION : suppression DÉFINITIVE et IRRÉVERSIBLE du chauffeur "${nomComplet}".\nTapez son nom complet exact pour confirmer :`);
  if (saisie !== nomComplet) {
    if (saisie !== null) showToast("Confirmation incorrecte, suppression annulée.", true);
    return;
  }
  try {
    await api.deleteChauffeurDefinitif(id);
    showToast("Chauffeur supprimé définitivement.");
    await loadChauffeurs();
  } catch (err) {
    showToast(err.message, true);
  }
}

function ouvrirNouveauChauffeur() {
  chauffeurEnEdition = null;
  el("modalChauffeurTitre").textContent = "Nouveau chauffeur";
  el("chNom").value = "";
  el("chPrenom").value = "";
  el("chTelephone").value = "";
  el("chNumPermis").value = "";
  el("chCatPermis").value = "";
  el("chExpirationPermis").value = "";
  el("chDispo").value = "disponible";
  el("chCamionId").value = "";
  el("modalErrorChauffeur").style.display = "none";
  el("modalOverlayChauffeur").classList.add("open");
}

function ouvrirEditionChauffeur(ch) {
  chauffeurEnEdition = ch;
  el("modalChauffeurTitre").textContent = `Modifier — ${ch.prenom} ${ch.nom}`;
  el("chNom").value = ch.nom;
  el("chPrenom").value = ch.prenom;
  el("chTelephone").value = ch.telephone || "";
  el("chNumPermis").value = ch.numero_permis || "";
  el("chCatPermis").value = ch.categorie_permis || "";
  el("chExpirationPermis").value = ch.date_expiration_permis ? ch.date_expiration_permis.slice(0, 10) : "";
  el("chDispo").value = ch.disponibilite || "disponible";
  el("chCamionId").value = ch.camion_id || "";
  el("modalErrorChauffeur").style.display = "none";
  el("modalOverlayChauffeur").classList.add("open");
}

function closeModalChauffeur() { el("modalOverlayChauffeur").classList.remove("open"); }

async function enregistrerChauffeur() {
  const btn = el("btnConfirmChauffeur");
  const errBox = el("modalErrorChauffeur");
  errBox.style.display = "none";

  const nom = el("chNom").value.trim();
  const prenom = el("chPrenom").value.trim();
  if (!nom || !prenom) {
    errBox.textContent = "Le nom et le prénom sont obligatoires.";
    errBox.style.display = "block";
    return;
  }

  const payload = {
    nom, prenom,
    telephone: el("chTelephone").value || null,
    numero_permis: el("chNumPermis").value || null,
    categorie_permis: el("chCatPermis").value || null,
    date_expiration_permis: el("chExpirationPermis").value || null,
    disponibilite: el("chDispo").value,
    camion_id: el("chCamionId").value ? parseInt(el("chCamionId").value, 10) : null,
  };

  btn.disabled = true;
  btn.textContent = "Enregistrement…";
  try {
    if (chauffeurEnEdition) {
      await api.updateChauffeur(chauffeurEnEdition.id, payload);
    } else {
      await api.createChauffeur(payload);
    }
    closeModalChauffeur();
    showToast(chauffeurEnEdition ? "Chauffeur mis à jour." : "Chauffeur créé avec succès.");
    await loadChauffeurs();
  } catch (err) {
    errBox.textContent = err.message;
    errBox.style.display = "block";
  } finally {
    btn.disabled = false;
    btn.textContent = "Enregistrer";
  }
}

init();