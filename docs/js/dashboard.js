const SEUIL_ALERTE_HEURES = parseInt(localStorage.getItem("fleetops_seuil_alerte_heures"), 10) || 48;

let camions = [];
let etats = [];
let etatsByCode = {};
let currentFilter = "tous";
let currentCamionIdPourModal = null;

const el = (id) => document.getElementById(id);

async function init() {
  if (!requireAuth()) return;
  initSidebarSession();
  setActiveNav();

  el("btnRefresh").addEventListener("click", loadAll);
  el("search").addEventListener("input", render);
  el("tabs").addEventListener("click", (e) => {
    const tab = e.target.closest(".tab");
    if (!tab) return;
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    currentFilter = tab.dataset.filter;
    render();
  });

  el("btnCancel").addEventListener("click", closeModal);
  el("modalOverlay").addEventListener("click", (e) => { if (e.target.id === "modalOverlay") closeModal(); });
  el("btnConfirm").addEventListener("click", confirmerChangementEtat);

  await loadAll();
}

async function loadAll() {
  el("connError").style.display = "none";
  try {
    const [camionsData, etatsData] = await Promise.all([api.listCamions(), api.listEtats()]);
    camions = camionsData;
    etats = etatsData;
    etatsByCode = Object.fromEntries(etats.map((e) => [e.code, e]));
    populateEtatSelect();
    render();
    await renderMetrics();
    el("lastUpdate").textContent = `Mise à jour automatique · ${new Date().toLocaleString("fr-FR", { dateStyle: "full", timeStyle: "short" })}`;
  } catch (err) {
    el("connError").style.display = "block";
    el("connError").innerHTML = `<strong>Connexion au serveur impossible.</strong><br>${escapeHtml(err.message)}`;
    el("tbody").innerHTML = "";
    el("metrics").innerHTML = "";
  }
}

function populateEtatSelect() {
  const select = el("fEtat");
  select.innerHTML = etats
    .map((e) => `<option value="${e.code}">${escapeHtml(e.libelle)} (${CATEGORIE_LABEL[e.categorie] || e.categorie})</option>`)
    .join("");
}

async function renderMetrics() {
  const total = camions.length;
  const actifs = camions.filter((c) => c.etat_actuel && c.etat_actuel.categorie === "actif").length;
  const immobilisesLongtemps = camions.filter(
    (c) => c.etat_actuel && c.etat_actuel.categorie !== "actif" && (c.duree_dans_etat_heures || 0) > SEUIL_ALERTE_HEURES
  );

  el("countImmob").textContent = immobilisesLongtemps.length;

  // Taux d'occupation réel (pondéré par les durées historiques sur 30 jours),
  // pas juste un instantané -- même logique que le calcul du DG (Actif / Total)
  let tauxOccupation = null;
  try {
    const stats = await api.dureeMoyenne(null, 30);
    let heuresActif = 0, heuresTotal = 0;
    stats.forEach((s) => {
      const cat = etatsByCode[s.etat_code]?.categorie;
      const heures = s.duree_moyenne_heures * s.nombre_occurrences;
      heuresTotal += heures;
      if (cat === "actif") heuresActif += heures;
    });
    if (heuresTotal > 0) tauxOccupation = (heuresActif / heuresTotal) * 100;
  } catch { /* si les stats échouent, on affiche juste "—" */ }

  el("metrics").innerHTML = `
    <div class="metric-card">
      <div class="metric-top">
        <span class="metric-label">Camions actifs</span>
        <span class="metric-icon">🚚</span>
      </div>
      <div class="metric-value">${actifs} <span class="of">/ ${total}</span></div>
      <div class="metric-bar"><div class="metric-bar-fill" style="width:${total ? (actifs / total) * 100 : 0}%"></div></div>
    </div>
    <div class="metric-card">
      <div class="metric-top">
        <span class="metric-label">Taux d'occupation</span>
        <span class="metric-icon">📈</span>
      </div>
      <div class="metric-value">${tauxOccupation === null ? "—" : tauxOccupation.toFixed(1) + " %"}</div>
      <div class="metric-bar"><div class="metric-bar-fill" style="width:${tauxOccupation || 0}%;background:var(--accent)"></div></div>
    </div>
    <div class="metric-card ${immobilisesLongtemps.length ? "alert" : ""}">
      <div class="metric-top">
        <span class="metric-label">Immobilisés &gt; ${SEUIL_ALERTE_HEURES}h</span>
        <span class="metric-icon">⚠</span>
      </div>
      <div class="metric-value">${immobilisesLongtemps.length}${immobilisesLongtemps.length ? " <span class=\"of\">ALERTE</span>" : ""}</div>
      ${immobilisesLongtemps.length ? `<div class="metric-alert-text">${immobilisesLongtemps.length} camion(s) nécessite(nt) une attention immédiate</div>` : ""}
    </div>
  `;
}

function render() {
  const search = el("search").value.trim().toLowerCase();

  let rows = camions.filter((c) => {
    if (currentFilter === "actif" && c.etat_actuel?.categorie !== "actif") return false;
    if (currentFilter === "attente" && c.etat_actuel?.categorie !== "attente") return false;
    if (currentFilter === "immobilisation" && !(c.etat_actuel?.categorie !== "actif" && (c.duree_dans_etat_heures || 0) > SEUIL_ALERTE_HEURES)) return false;
    if (search) {
      const haystack = `${c.camion.immatriculation} ${c.camion.unit || ""} ${c.etat_actuel?.libelle || ""}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });

  const tbody = el("tbody");
  const empty = el("emptyState");

  if (rows.length === 0) {
    tbody.innerHTML = "";
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  tbody.innerHTML = rows.map((c) => {
    const anomalie = c.etat_actuel && c.etat_actuel.categorie !== "actif" && (c.duree_dans_etat_heures || 0) > SEUIL_ALERTE_HEURES;
    return `
  <tr>
  <td>${escapeHtml(c.camion.unit || "—")}</td>
  <td>
    <div class="truck-id"><a href="camion.html?id=${c.camion.id}">${escapeHtml(c.camion.immatriculation)}</a> ${anomalie ? "⚠️" : ""}</div>
    <div class="truck-sub">${escapeHtml(c.camion.marque || "")}${c.camion.capacite_tonnes ? ` · ${c.camion.capacite_tonnes}t` : ""}</div>
  </td>
  <td>${badgeHtml(c.etat_actuel)}</td>
      <td class="${anomalie ? "since-anomalie" : "since-normal"}">${c.duree_dans_etat_heures !== null && c.duree_dans_etat_heures !== undefined ? formatDuree(c.duree_dans_etat_heures) : "—"}</td>
        <td>${escapeHtml(c.lieu || "—")}</td>
        <td>
          <div class="row-actions">
            ${["super_admin", "admin_transport", "dispatcher", "maintenance"].includes(session.getRole()) ? `<button class="btn btn-primary btn-sm" onclick="openModal(${c.camion.id}, '${escapeHtml(c.camion.immatriculation)}')">↻ Changer l'état</button>` : ""}
            <a class="btn btn-secondary btn-sm" href="camion.html?id=${c.camion.id}">Traçabilité</a>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

function openModal(camionId, immatriculation) {
  currentCamionIdPourModal = camionId;
  el("modalTitle").textContent = "Changer l'état";
  el("modalSub").textContent = `Camion ${unit}`;
  el("modalError").style.display = "none";
  el("fLieu").value = "";
  el("fMarchandise").value = "";
  el("fSaisiPar").value = "";
  el("modalOverlay").classList.add("open");
}

function closeModal() {
  el("modalOverlay").classList.remove("open");
  currentCamionIdPourModal = null;
}

async function confirmerChangementEtat() {
  const btn = el("btnConfirm");
  const errBox = el("modalError");
  errBox.style.display = "none";
  btn.disabled = true;
  btn.textContent = "Enregistrement…";
  try {
    await api.changerEtat(currentCamionIdPourModal, {
      etat_code: el("fEtat").value,
      lieu: el("fLieu").value || null,
      marchandise: el("fMarchandise").value || null,
      saisi_par: el("fSaisiPar").value || null,
    });
    closeModal();
    showToast("État mis à jour avec succès.");
    await loadAll();
  } catch (err) {
    errBox.textContent = err.message;
    errBox.style.display = "block";
  } finally {
    btn.disabled = false;
    btn.textContent = "Confirmer le changement";
  }
}

init();