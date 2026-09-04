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
    const [statut, historique, repartitionDg] = await Promise.all([
      api.getCamion(camionId),
      api.historique(camionId, periodeJours),
      api.repartitionCategorieDg(camionId, periodeJours),
    ]);
    el("bcCamion").textContent = statut.camion.immatriculation;
    el("titreImmat").textContent = statut.camion.immatriculation;
    el("sousTitre").textContent = `${statut.camion.marque || ""} · ${historique.length} événement${historique.length > 1 ? "s" : ""} enregistré${historique.length > 1 ? "s" : ""}`;

    renderFrise(historique);
    renderTable(historique);
    renderRepartitionDg(repartitionDg);
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

init();

const COULEUR_CATEGORIE_DG = {
  "Driving": "var(--dg-driving)",
  "Loading and offloading": "var(--dg-loading)",
  "Breakdown": "var(--dg-breakdown)",
  "Workshop empty/Loaded": "var(--dg-workshop)",
  "Waiting fuel": "var(--dg-fuel)",
  "Waiting for documents": "var(--dg-docs)",
  "Accident": "var(--dg-accident)",
};

function renderRepartitionDg(repartition) {
  const parCategorie = Object.fromEntries(repartition.map((r) => [r.categorie_dg, r]));
  const total = repartition.reduce((s, r) => s + r.duree_totale_heures, 0);

  if (!repartition.length || total === 0) {
    el("dgRepartitionRows").innerHTML = `<div style="color:var(--text-muted);font-size:12.5px;">Aucune donnée sur cette période.</div>`;
    el("tauxOccupation").textContent = "—";
    return;
  }

  const ordre = ["Driving", "Loading and offloading", "Breakdown", "Workshop empty/Loaded", "Waiting fuel", "Waiting for documents", "Accident"];

  el("dgRepartitionRows").innerHTML = ordre.map((cat) => {
    const r = parCategorie[cat];
    const heures = r ? r.duree_totale_heures : 0;
    const pct = total > 0 ? (heures / total) * 100 : 0;
    const couleur = COULEUR_CATEGORIE_DG[cat];
    return `
      <div style="margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:4px;">
          <span><span class="legend-dot" style="background:${couleur}"></span>${cat}</span>
          <span>${formatDuree(heures)} · <strong>${pct.toFixed(0)}%</strong></span>
        </div>
        <div style="height:6px;background:var(--border);border-radius:3px;overflow:hidden;">
          <div style="width:${pct}%;height:100%;background:${couleur}"></div>
        </div>
      </div>
    `;
  }).join("");

  const heuresProductif = (parCategorie["Driving"]?.duree_totale_heures || 0) +
    (parCategorie["Loading and offloading"]?.duree_totale_heures || 0);
  const tauxOccupation = (heuresProductif / total) * 100;
  el("tauxOccupation").textContent = tauxOccupation.toFixed(1) + " %";
}