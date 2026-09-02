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
  el("btnRapport").addEventListener("click", genererRapportPdf);

  await loadAll();
}

async function loadAll() {
  el("connError").style.display = "none";
  try {
    const [statut, etatsData, historique, historiqueAnnee, stats] = await Promise.all([
      api.getCamion(camionId),
      api.listEtats(),
      api.historique(camionId, 31),
      api.historique(camionId, 365),
      api.dureeMoyenne(camionId, 30),
    ]);
    etats = etatsData;
    historiqueMois = historique;
    populateEtatSelect();
    renderHeader(statut);
    dernierStatut = statut;
    dernieresStats = stats;
    renderCards(statut, stats);
    renderMiniTimeline(historiqueAnnee);
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

  if (!["super_admin", "admin_transport", "dispatcher", "maintenance"].includes(session.getRole())) {
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

  // Taux d'occupation sur 30 jours, basé sur les 7 catégories DG
  // (Productif = Driving + Loading and offloading / Total)
  let heuresProductif = 0, heuresTotal = 0;
  (stats || []).forEach((s) => {
    const etatRef = etats.find((e) => e.code === s.etat_code);
    const heures = s.duree_moyenne_heures * s.nombre_occurrences;
    heuresTotal += heures;
    if (etatRef && (etatRef.categorie_dg === "Driving" || etatRef.categorie_dg === "Loading and offloading")) {
      heuresProductif += heures;
    }
  });
  const tauxOccupation = heuresTotal > 0 ? (heuresProductif / heuresTotal) * 100 : null;
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
      <div class="detail-sub">Driving + Loading and offloading / Total</div>
    </div>
  `;
}

let dernierStatut = null;
let dernieresStats = null;

function genererRapportPdf() {
  if (!historiqueMois.length) {
    showToast("Aucun événement à inclure dans le rapport pour l'instant.", true);
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const immat = document.getElementById("titreImmat").textContent;
  const c = dernierStatut ? dernierStatut.camion : {};
  let y = 18;

  // -- En-tête --
  doc.setFontSize(16);
  doc.setFont(undefined, "bold");
  doc.text("TransAfrique Logistics Cameroun", 14, y);
  doc.setFontSize(11);
  doc.setFont(undefined, "normal");
  y += 7;
  doc.text(`Rapport camion — ${immat}`, 14, y);
  y += 5;
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Généré le ${new Date().toLocaleString("fr-FR")}`, 14, y);
  doc.setTextColor(0);
  y += 10;

  // -- Infos camion --
  doc.setFontSize(12);
  doc.setFont(undefined, "bold");
  doc.text("Informations", 14, y);
  y += 6;
  doc.setFontSize(10);
  doc.setFont(undefined, "normal");
  doc.text(`Immatriculation : ${immat}`, 14, y); y += 5;
  doc.text(`Flotte / Marque : ${c.marque || "—"}`, 14, y); y += 5;
  doc.text(`Capacité : ${c.capacite_tonnes ? c.capacite_tonnes + " t" : "—"}`, 14, y); y += 5;
  doc.text(`Chauffeur actuel : ${c.chauffeur_actuel || "—"}`, 14, y); y += 10;

  // -- Statistiques (taux d'occupation DG + répartition par catégorie) --
  doc.setFontSize(12);
  doc.setFont(undefined, "bold");
  doc.text("Statistiques (30 derniers jours)", 14, y);
  y += 6;
  doc.setFontSize(10);
  doc.setFont(undefined, "normal");

  let heuresProductif = 0, heuresTotal = 0;
  const heuresParCategorie = {};
  (dernieresStats || []).forEach((s) => {
    const etatRef = etats.find((e) => e.code === s.etat_code);
    const heures = s.duree_moyenne_heures * s.nombre_occurrences;
    heuresTotal += heures;
    if (etatRef) {
      const cat = etatRef.categorie_dg || "Non classé";
      heuresParCategorie[cat] = (heuresParCategorie[cat] || 0) + heures;
      if (cat === "Driving" || cat === "Loading and offloading") heuresProductif += heures;
    }
  });
  const tauxOccupation = heuresTotal > 0 ? (heuresProductif / heuresTotal) * 100 : null;

  doc.text(`Taux d'occupation : ${tauxOccupation !== null ? tauxOccupation.toFixed(1) + " %" : "—"}`, 14, y);
  y += 5;
  doc.text("Répartition par catégorie :", 14, y);
  y += 5;
  Object.entries(heuresParCategorie).forEach(([cat, heures]) => {
    doc.text(`  • ${cat} : ${formatDuree(heures)}`, 16, y);
    y += 5;
  });
  y += 6;

  // -- Historique détaillé --
  doc.setFontSize(12);
  doc.setFont(undefined, "bold");
  doc.text("Historique des états (31 derniers jours)", 14, y);
  y += 2;

  const lignes = [...historiqueMois]
    .sort((a, b) => new Date(b.date_debut) - new Date(a.date_debut))
    .map((h) => {
      const debut = new Date(h.date_debut);
      const fin = h.date_fin ? new Date(h.date_fin) : new Date();
      const dureeH = ((fin - debut) / 3600000).toFixed(1);
      return [
        h.etat.libelle,
        debut.toLocaleString("fr-FR"),
        h.date_fin ? fin.toLocaleString("fr-FR") : "en cours",
        dureeH + " h",
        h.lieu || "—",
        h.saisi_par || "—",
      ];
    });

  doc.autoTable({
    startY: y + 4,
    head: [["État", "Début", "Fin", "Durée", "Lieu", "Saisi par"]],
    body: lignes,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [217, 142, 31] },
  });

  doc.save(`rapport_${immat}_${new Date().toISOString().slice(0, 10)}.pdf`);
  showToast("Rapport PDF généré et téléchargé.");
}

function renderMiniTimeline(historique) {
  const wrap = el("miniTimeline");
  if (!historique.length) {
    wrap.innerHTML = `<div style="color:var(--text-muted);font-size:12.5px;padding:10px 0;">Aucun événement enregistré pour l'instant.</div>`;
    return;
  }

  // 1) Calcule, pour chacun des 12 derniers mois, le taux d'occupation
  //    (Driving + Loading and offloading) / total, en découpant chaque
  //    événement sur les mois qu'il chevauche.
  const NB_MOIS = 12;
  const aujourdHui = new Date();
  const mois = [];
  for (let i = NB_MOIS - 1; i >= 0; i--) {
    const debutMois = new Date(aujourdHui.getFullYear(), aujourdHui.getMonth() - i, 1);
    const finMois = new Date(debutMois.getFullYear(), debutMois.getMonth() + 1, 1);
    mois.push({ debut: debutMois, fin: finMois, productif: 0, total: 0 });
  }

  historique.forEach((h) => {
    const debut = new Date(h.date_debut);
    const fin = h.date_fin ? new Date(h.date_fin) : new Date();
    const estProductif = h.etat.categorie_dg === "Driving" || h.etat.categorie_dg === "Loading and offloading";

    mois.forEach((m) => {
      const chevaucheDebut = debut > m.debut ? debut : m.debut;
      const chevaucheFin = fin < m.fin ? fin : m.fin;
      const heures = (chevaucheFin - chevaucheDebut) / 3600000;
      if (heures > 0) {
        m.total += heures;
        if (estProductif) m.productif += heures;
      }
    });
  });

  const valeurs = mois.map((m) => (m.total > 0 ? (m.productif / m.total) * 100 : null));

  // 2) Construit le tracé SVG (ligne + zone dégradée), en sautant les
  //    mois sans donnée pour ne pas fausser la courbe.
  const largeur = 900, hauteur = 150;
  const margeGauche = 10, margeDroite = 10, margeHaut = 12, margeBas = 26;
  const zoneL = largeur - margeGauche - margeDroite;
  const zoneH = hauteur - margeHaut - margeBas;
  const pas = zoneL / (NB_MOIS - 1);

  const coords = valeurs.map((v, i) => {
    if (v === null) return null;
    return {
      x: margeGauche + i * pas,
      y: margeHaut + zoneH - (v / 100) * zoneH,
      v,
      mois: mois[i].debut,
    };
  });

  const segments = [];
  let segmentCourant = [];
  coords.forEach((c) => {
    if (c) {
      segmentCourant.push(c);
    } else if (segmentCourant.length) {
      segments.push(segmentCourant);
      segmentCourant = [];
    }
  });
  if (segmentCourant.length) segments.push(segmentCourant);

  let pathLigne = "";
  let pathAire = "";
  const base = margeHaut + zoneH;
  segments.forEach((seg) => {
    pathLigne += `M${seg[0].x.toFixed(1)},${seg[0].y.toFixed(1)} `;
    pathAire += `M${seg[0].x.toFixed(1)},${base} L${seg[0].x.toFixed(1)},${seg[0].y.toFixed(1)} `;
    seg.slice(1).forEach((c) => {
      pathLigne += `L${c.x.toFixed(1)},${c.y.toFixed(1)} `;
      pathAire += `L${c.x.toFixed(1)},${c.y.toFixed(1)} `;
    });
    pathAire += `L${seg[seg.length - 1].x.toFixed(1)},${base} Z `;
  });

  const pointsHtml = coords.map((c) => {
    if (!c) return "";
    const dateLabel = c.mois.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
    return `<circle class="taux-point" cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="3.5" fill="var(--accent)" stroke="var(--bg-card)" stroke-width="1.5" data-date="${dateLabel}" data-valeur="${c.v.toFixed(0)}"></circle>`;
  }).join("");

  const labelsMoisHtml = mois.map((m, i) => {
    const x = margeGauche + i * pas;
    const label = m.debut.toLocaleDateString("fr-FR", { month: "short" });
    return `<text x="${x.toFixed(1)}" y="${hauteur - 6}" font-size="10" fill="var(--text-muted)" text-anchor="middle">${label}</text>`;
  }).join("");

  wrap.innerHTML = `
    <svg viewBox="0 0 ${largeur} ${hauteur}" style="width:100%;height:140px;display:block;">
      <defs>
        <linearGradient id="degradeTaux" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.35" />
          <stop offset="100%" stop-color="var(--accent)" stop-opacity="0" />
        </linearGradient>
      </defs>
      <path d="${pathAire}" fill="url(#degradeTaux)" stroke="none"></path>
      <path d="${pathLigne}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></path>
      ${pointsHtml}
      ${labelsMoisHtml}
    </svg>
    <div class="mini-tooltip" id="miniTooltip"></div>
  `;

  const tooltip = el("miniTooltip");
  wrap.querySelectorAll(".taux-point").forEach((pt) => {
    pt.addEventListener("mouseenter", () => {
      tooltip.innerHTML = `<strong>${pt.dataset.date}</strong>Taux d'occupation : ${pt.dataset.valeur}%`;
      const ptRect = pt.getBoundingClientRect();
      const wrapRect = wrap.getBoundingClientRect();
      tooltip.style.left = (ptRect.left - wrapRect.left) + "px";
      tooltip.style.top = (ptRect.top - wrapRect.top) + "px";
      tooltip.classList.add("show");
    });
    pt.addEventListener("mouseleave", () => tooltip.classList.remove("show"));
  });
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