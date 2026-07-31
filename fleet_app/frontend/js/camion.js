const SEUIL_ALERTE_HEURES = parseInt(localStorage.getItem("fleetops_seuil_alerte_heures"), 10) || 48;
const params = new URLSearchParams(window.location.search);
const camionId = params.get("id");

let etats = [];
let historiqueMois = [];

const el = (id) => document.getElementById(id);

async function init() {
  if (!requireAuth()) return;
  initSidebarSession();

  if (!camionId) {
    el("connError").style.display = "block";
    el("connError").innerHTML = "<strong>Aucun camion sélectionné.</strong> Retournez au tableau de bord et cliquez sur un camion.";
    return;
  }

  el("btnChanger").addEventListener("click", () => openModal());
  el("btnCancel").addEventListener("click", closeModal);
  el("modalOverlay").addEventListener("click", (e) => { if (e.target.id === "modalOverlay") closeModal(); });
  el("btnConfirm").addEventListener("click", confirmerChangementEtat);
  el("btnHistorique").addEventListener("click", () => { window.location.href = `historique.html?id=${camionId}`; });
  el("btnRapport").addEventListener("click", genererRapportCsv);

  await loadAll();
}

async function loadAll() {
  el("connError").style.display = "none";
  try {
    const [statut, etatsData, historique, stats] = await Promise.all([
      api.getCamion(camionId),
      api.listEtats(),
      api.historique(camionId, 31),
      api.dureeMoyenne(camionId, 30),
    ]);
    etats = etatsData;
    historiqueMois = historique;
    populateEtatSelect();
    renderHeader(statut);
    renderCards(statut, stats);
    renderMiniTimeline(historique);
    el("eventCount").textContent = `${historique.length} événement${historique.length > 1 ? "s" : ""} ce mois-ci`;
  } catch (err) {
    el("connError").style.display = "block";
    el("connError").innerHTML = `<strong>Erreur de chargement.</strong><br>${escapeHtml(err.message)}`;
  }
}

function populateEtatSelect() {
  el("fEtat").innerHTML = etats
    .map((e) => `<option value="${e.code}">${escapeHtml(e.libelle)} (${CATEGORIE_LABEL[e.categorie] || e.categorie})</option>`)
    .join("");
}

function renderHeader(statut) {
  const c = statut.camion;
  document.title = `${c.immatriculation} — Fleet Ops`;
  el("bcImmat").textContent = c.immatriculation;
  el("titreImmat").textContent = c.immatriculation;
  el("titreBadge").innerHTML = badgeHtml(statut.etat_actuel);

  if (session.getRole() === "direction") {
    el("btnChanger").style.display = "none";
  }

  const anomalie = statut.etat_actuel && statut.etat_actuel.categorie !== "actif" && (statut.duree_dans_etat_heures || 0) > SEUIL_ALERTE_HEURES;
  el("sousTitre").innerHTML = `Flotte : ${escapeHtml(c.marque || "—")} &nbsp;·&nbsp; Capacité : ${c.capacite_tonnes ? c.capacite_tonnes + " tonnes" : "—"} &nbsp;·&nbsp; Depuis : ${statut.duree_dans_etat_heures !== null ? formatDuree(statut.duree_dans_etat_heures) : "—"}${anomalie ? ' <span class="anomalie-tag">- ANOMALIE</span>' : ""}`;

  const lienBtn = el("btnDossierExterne");
  if (c.lien_dossier_externe) {
    lienBtn.href = c.lien_dossier_externe;
    lienBtn.style.display = "inline-flex";
  } else {
    lienBtn.style.display = "none";
  }
}

function renderCards(statut, stats) {
  const c = statut.camion;
  const anomalie = statut.etat_actuel && statut.etat_actuel.categorie !== "actif" && (statut.duree_dans_etat_heures || 0) > SEUIL_ALERTE_HEURES;

  // Taux d'occupation sur 30 jours, spécifique à ce camion (Actif / Total)
  let heuresActif = 0, heuresTotal = 0;
  (stats || []).forEach((s) => {
    const etatRef = etats.find((e) => e.code === s.etat_code);
    const heures = s.duree_moyenne_heures * s.nombre_occurrences;
    heuresTotal += heures;
    if (etatRef && etatRef.categorie === "actif") heuresActif += heures;
  });
  const tauxOccupation = heuresTotal > 0 ? (heuresActif / heuresTotal) * 100 : null;

  el("detailCards").innerHTML = `
    <div class="detail-card ${anomalie ? "accent" : ""}">
      <div class="detail-label" style="${anomalie ? "color:var(--immob)" : ""}">État actuel</div>
      <div class="detail-value">${badgeHtml(statut.etat_actuel)}</div>
      <div class="detail-sub">${statut.etat_actuel ? "Lieu non renseigné" : "Aucun historique"}</div>
    </div>
    <div class="detail-card ${anomalie ? "accent" : ""}">
      <div class="detail-label" style="${anomalie ? "color:var(--immob)" : ""}">Durée dans cet état</div>
      <div class="detail-value" style="${anomalie ? "color:var(--immob)" : ""}">${statut.duree_dans_etat_heures !== null && statut.duree_dans_etat_heures !== undefined ? formatDuree(statut.duree_dans_etat_heures) : "—"}</div>
      ${anomalie ? `<div class="detail-sub" style="color:var(--immob)">Dépasse le seuil d'alerte (${SEUIL_ALERTE_HEURES}h)</div>` : `<div class="detail-sub">Dans les délais normaux</div>`}
    </div>
    <div class="detail-card">
      <div class="detail-label">Chauffeur assigné</div>
      <div class="detail-value" style="font-size:16px;">${escapeHtml(c.chauffeur_actuel || "Non assigné")}</div>
      <div class="detail-sub">Flotte ${escapeHtml(c.marque || "—")} · ${c.capacite_tonnes ? c.capacite_tonnes + "t" : "—"}</div>
    </div>
    <div class="detail-card">
      <div class="detail-label">Taux d'occupation (30j)</div>
      <div class="detail-value">${tauxOccupation === null ? "—" : tauxOccupation.toFixed(1) + " %"}</div>
      <div class="detail-sub">Actif / Total sur la période</div>
    </div>
  `;
}

function genererRapportCsv() {
  if (!historiqueMois.length) {
    showToast("Aucun événement à inclure dans le rapport pour l'instant.", true);
    return;
  }
  const entetes = ["État", "Catégorie", "Début", "Fin", "Durée (h)", "Lieu", "Marchandise", "Saisi par"];
  const lignes = [...historiqueMois]
    .sort((a, b) => new Date(b.date_debut) - new Date(a.date_debut))
    .map((h) => {
      const debut = new Date(h.date_debut);
      const fin = h.date_fin ? new Date(h.date_fin) : new Date();
      const dureeH = ((fin - debut) / 3600000).toFixed(1);
      return [
        h.etat.libelle, CATEGORIE_LABEL[h.etat.categorie] || h.etat.categorie,
        debut.toLocaleString("fr-FR"), h.date_fin ? fin.toLocaleString("fr-FR") : "en cours",
        dureeH, h.lieu || "", h.marchandise || "", h.saisi_par || "",
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";");
    });
  const csv = [entetes.join(";"), ...lignes].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `rapport_${document.getElementById("titreImmat").textContent}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("Rapport généré et téléchargé.");
}

function renderMiniTimeline(historique) {
  const wrap = el("miniTimeline");
  if (!historique.length) {
    wrap.innerHTML = `<div style="color:var(--text-muted);font-size:12.5px;padding:10px 0;">Aucun événement enregistré pour l'instant.</div>`;
    return;
  }
  // Trie du plus ancien au plus récent, calcule une durée pour chaque segment
  const sorted = [...historique].sort((a, b) => new Date(a.date_debut) - new Date(b.date_debut));
  const withDuree = sorted.map((h) => {
    const debut = new Date(h.date_debut);
    const fin = h.date_fin ? new Date(h.date_fin) : new Date();
    return { ...h, dureeMs: Math.max(fin - debut, 60000) };
  });
  const total = withDuree.reduce((s, h) => s + h.dureeMs, 0);

  wrap.innerHTML = withDuree.map((h) => {
    const pct = (h.dureeMs / total) * 100;
    const color = `var(--${h.etat.categorie === "immobilisation" ? "immob" : h.etat.categorie})`;
    return `<div style="width:${pct}%;background:${color}" title="${escapeHtml(h.etat.libelle)} — ${formatDuree(h.dureeMs / 3600000)}"></div>`;
  }).join("");
}

function openModal() {
  el("modalError").style.display = "none";
  el("fLieu").value = "";
  el("fMarchandise").value = "";
  el("fSaisiPar").value = "";
  el("modalOverlay").classList.add("open");
}
function closeModal() { el("modalOverlay").classList.remove("open"); }

async function confirmerChangementEtat() {
  const btn = el("btnConfirm");
  const errBox = el("modalError");
  errBox.style.display = "none";
  btn.disabled = true;
  btn.textContent = "Enregistrement…";
  try {
    await api.changerEtat(camionId, {
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
