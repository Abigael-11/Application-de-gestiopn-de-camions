const params = new URLSearchParams(window.location.search);
const camionId = params.get("id");
let periodeJours = 30;

const el = (id) => document.getElementById(id);

async function init() {
  if (!requireAuth()) return;
  initSidebarSession();

  if (!camionId) {
    el("connError").style.display = "block";
    el("connError").innerHTML = "<strong>Aucun camion sélectionné.</strong>";
    return;
  }
  el("bcCamion").href = `camion.html?id=${camionId}`;
  el("periodTabs").addEventListener("click", (e) => {
    const tab = e.target.closest(".period-tab");
    if (!tab) return;
    document.querySelectorAll(".period-tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    periodeJours = parseInt(tab.dataset.jours, 10);
    loadAll();
  });
  await loadAll();
}

async function loadAll() {
  el("connError").style.display = "none";
  try {
    const [statut, historique] = await Promise.all([
      api.getCamion(camionId),
      api.historique(camionId, periodeJours),
    ]);
    el("bcCamion").textContent = statut.camion.immatriculation;
    el("titreImmat").textContent = statut.camion.immatriculation;
    el("sousTitre").textContent = `${statut.camion.marque || ""} · ${historique.length} événement${historique.length > 1 ? "s" : ""} enregistré${historique.length > 1 ? "s" : ""}`;

    renderFrise(historique);
    renderTable(historique);
    renderRecap(historique);
  } catch (err) {
    el("connError").style.display = "block";
    el("connError").innerHTML = `<strong>Erreur de chargement.</strong><br>${escapeHtml(err.message)}`;
  }
}

function renderFrise(historique) {
  const track = el("friseTrack");
  const axis = el("friseAxis");
  if (!historique.length) {
    track.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted);font-size:12.5px;">Aucun événement sur cette période</div>`;
    axis.innerHTML = "";
    return;
  }
  const sorted = [...historique].sort((a, b) => new Date(a.date_debut) - new Date(b.date_debut));
  const debutPeriode = new Date(sorted[0].date_debut);
  const finPeriode = new Date();
  const totalMs = finPeriode - debutPeriode || 1;

  track.innerHTML = sorted.map((h) => {
    const debut = new Date(h.date_debut);
    const fin = h.date_fin ? new Date(h.date_fin) : finPeriode;
    const left = ((debut - debutPeriode) / totalMs) * 100;
    const width = Math.max(((fin - debut) / totalMs) * 100, 0.3);
    const color = `var(--${h.etat.categorie === "immobilisation" ? "immob" : h.etat.categorie})`;
    return `<div class="frise-seg" style="left:${left}%;width:${width}%;background:${color}" title="${escapeHtml(h.etat.libelle)} — ${debut.toLocaleDateString("fr-FR")}"></div>`;
  }).join("");

  axis.innerHTML = `<span>${debutPeriode.toLocaleDateString("fr-FR")}</span><span>${finPeriode.toLocaleDateString("fr-FR")}</span>`;
}

function renderTable(historique) {
  const tbody = el("tbody");
  const empty = el("emptyState");
  if (!historique.length) {
    tbody.innerHTML = "";
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";
  const sorted = [...historique].sort((a, b) => new Date(b.date_debut) - new Date(a.date_debut));
  tbody.innerHTML = sorted.map((h) => {
    const debut = new Date(h.date_debut);
    const fin = h.date_fin ? new Date(h.date_fin) : null;
    const dureeMs = (fin || new Date()) - debut;
    return `
      <tr>
        <td>${badgeHtml(h.etat)}</td>
        <td>${debut.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</td>
        <td>${fin ? fin.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "<em style='color:var(--actif)'>en cours</em>"}</td>
        <td>${formatDuree(dureeMs / 3600000)}</td>
        <td>${escapeHtml(h.lieu || "—")}</td>
        <td>${escapeHtml(h.saisi_par || "—")}</td>
      </tr>
    `;
  }).join("");
}

function renderRecap(historique) {
  const totaux = { actif: 0, attente: 0, immobilisation: 0 };
  historique.forEach((h) => {
    const fin = h.date_fin ? new Date(h.date_fin) : new Date();
    const heures = (fin - new Date(h.date_debut)) / 3600000;
    totaux[h.etat.categorie] = (totaux[h.etat.categorie] || 0) + heures;
  });
  const totalHeures = totaux.actif + totaux.attente + totaux.immobilisation;

  const bar = el("recapBar");
  bar.innerHTML = totalHeures > 0
    ? ["actif", "attente", "immobilisation"].map((cat) => {
        const pct = (totaux[cat] / totalHeures) * 100;
        return pct > 0 ? `<div style="width:${pct}%;background:var(--${cat === "immobilisation" ? "immob" : cat})"></div>` : "";
      }).join("")
    : "";

  el("recapRows").innerHTML = ["actif", "attente", "immobilisation"].map((cat) => {
    const pct = totalHeures > 0 ? (totaux[cat] / totalHeures) * 100 : 0;
    return `
      <div class="recap-row">
        <span><span class="legend-dot" style="background:var(--${cat === "immobilisation" ? "immob" : cat})"></span>${CATEGORIE_LABEL[cat]}</span>
        <span>${formatDuree(totaux[cat])} &nbsp; <strong>${pct.toFixed(0)}%</strong></span>
      </div>
    `;
  }).join("");

  const tauxOccupation = totalHeures > 0 ? (totaux.actif / totalHeures) * 100 : null;
  el("tauxOccupation").textContent = tauxOccupation === null ? "—" : tauxOccupation.toFixed(1) + " %";
}

init();
