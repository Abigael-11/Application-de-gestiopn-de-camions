const el = (id) => document.getElementById(id);

let missionEnEdition = null;
let camionsCache = [];
let chauffeursCache = [];
let remorquesCache = [];

const STATUT_LABEL = {
  planifiee: "Planifiée",
  en_cours: "En cours",
  terminee: "Terminée",
  annulee: "Annulée",
};

document.addEventListener("DOMContentLoaded", async () => {
  if (!requireAuth()) return;
  initSidebarSession();
  setActiveNav();

  el("btnNouvelleMission").addEventListener("click", ouvrirNouvelleMission);
  el("btnCancelMission").addEventListener("click", closeModalMission);
  el("modalOverlayMission").addEventListener("click", (e) => {
    if (e.target.id === "modalOverlayMission") closeModalMission();
  });
  el("btnConfirmMission").addEventListener("click", enregistrerMission);
  el("filtreStatut").addEventListener("change", loadMissions);

  await loadMissions();
});

async function loadMissions() {
  try {
    const statutFiltre = el("filtreStatut").value;
    const [missions, camions, chauffeurs, remorques] = await Promise.all([
      api.listMissions(statutFiltre),
      api.listCamions(true),
      api.listChauffeurs(true),
      api.listRemorques(true),  
    ]);
    camionsCache = camions;
    chauffeursCache = chauffeurs;
    remorquesCache = remorques;

    const selectCamion = el("mCamionId");
    selectCamion.innerHTML = '<option value="">— Aucun —</option>' +
    camions.map((c) => `<option value="${c.camion.id}">${escapeHtml(c.camion.unit || c.camion.immatriculation)}</option>`).join("");



    const selectRemorque = el("mRemorqueId");
    selectRemorque.innerHTML = '<option value="">— Aucune —</option>' +
    remorques.map((r) => `<option value="${r.id}">${escapeHtml(r.unit || r.immatriculation)}</option>`).join("");


    const selectChauffeur = el("mChauffeurId");
    selectChauffeur.innerHTML = '<option value="">— Aucun —</option>' +
      chauffeurs.map((ch) => `<option value="${ch.id}">${escapeHtml(ch.prenom + " " + ch.nom)}</option>`).join("");

    el("connError").style.display = "none";

    if (!missions.length) {
      el("missionsBody").innerHTML = `<tr><td colspan="8" style="color:var(--text-muted);text-align:center;padding:24px;">Aucune mission enregistrée pour l'instant.</td></tr>`;
      return;
    }

    el("missionsBody").innerHTML = missions.map((m) => {
      const camion = camionsCache.find((c) => c.camion.id === m.camion_id);
      const chauffeur = chauffeursCache.find((ch) => ch.id === m.chauffeur_id);
      const remorque = remorquesCache.find((r) => r.id === m.remorque_id);
      return `
        <tr>
          <td>${escapeHtml(m.client || "—")}</td>
          <td>${escapeHtml(m.marchandise || "—")}</td>
          <td>${camion ? escapeHtml(camion.camion.unit || camion.camion.immatriculation) : "—"}${remorque ? " / " + escapeHtml(remorque.unit || remorque.immatriculation) : ""}</td>
          <td>${chauffeur ? escapeHtml(chauffeur.prenom + " " + chauffeur.nom) : "—"}</td>
          <td>${escapeHtml(m.lieu_depart || "—")} → ${escapeHtml(m.lieu_destination || "—")}</td>
          <td>${m.date_depart_prevue ? new Date(m.date_depart_prevue).toLocaleString("fr-FR") : "—"}</td>
          <td><span class="badge badge-${m.statut}">${STATUT_LABEL[m.statut] || m.statut}</span></td>
          <td>
            <button class="btn btn-secondary btn-sm" onclick='ouvrirEditionMission(${JSON.stringify(m)})'>✎ Modifier</button>
            <button class="btn btn-secondary btn-sm" onclick='genererRapportMission(${JSON.stringify(m)})'>📄 Rapport</button>
            ${m.statut !== "terminee" && m.statut !== "annulee"
              ? `<button class="btn btn-primary btn-sm" onclick='terminerMission(${JSON.stringify(m)})'>✓ Terminer</button>`
              : ""}
            ${["super_admin", "admin_transport"].includes(session.getRole())
              ? `<button class="btn btn-secondary btn-sm" style="color:var(--immob)" onclick='supprimerMission(${m.id})'>🗑 Supprimer</button>`
              : ""}
          </td>
        </tr>
      `;
    }).join("");
  } catch (err) {
    el("connError").textContent = "Impossible de charger les missions : " + err.message;
    el("connError").style.display = "block";
  }
}

function terminerMission(m) {
  ouvrirEditionMission(m);
  el("mStatut").value = "terminee";
  if (!el("mDateArriveeReelle").value) {
    const maintenant = new Date();
    maintenant.setMinutes(maintenant.getMinutes() - maintenant.getTimezoneOffset());
    el("mDateArriveeReelle").value = maintenant.toISOString().slice(0, 16);
  }
}

async function supprimerMission(id) {
  if (!confirm("Supprimer définitivement cette mission ? Cette action est irréversible.")) {
    return;
  }
  try {
    await api.supprimerMission(id);
    showToast("Mission supprimée.");
    await loadMissions();
  } catch (err) {
    showToast(err.message, true);
  }
}

function ouvrirNouvelleMission() {
  missionEnEdition = null;
  el("modalMissionTitre").textContent = "Nouvelle mission";
  el("mClient").value = "";
  el("mMarchandise").value = "";
  el("mCamionId").value = "";
  el("mRemorqueId").value = "";
  el("mChauffeurId").value = "";
  el("mLieuDepart").value = "";
  el("mLieuDestination").value = "";
  el("mDateDepartPrevue").value = "";
  el("mDateArriveeReelle").value = "";
  el("mStatut").value = "planifiee";
  el("modalErrorMission").style.display = "none";
  el("modalOverlayMission").classList.add("open");
}

function ouvrirEditionMission(m) {
  missionEnEdition = m;
  el("modalMissionTitre").textContent = `Modifier — ${m.client || "Mission #" + m.id}`;
  el("mClient").value = m.client || "";
  el("mMarchandise").value = m.marchandise || "";
  el("mCamionId").value = m.camion_id || "";
  el("mRemorqueId").value = m.remorque_id || "";
  el("mChauffeurId").value = m.chauffeur_id || "";
  el("mLieuDepart").value = m.lieu_depart || "";
  el("mLieuDestination").value = m.lieu_destination || "";
  el("mDateDepartPrevue").value = m.date_depart_prevue ? m.date_depart_prevue.slice(0, 16) : "";
  el("mDateArriveeReelle").value = m.date_arrivee_reelle ? m.date_arrivee_reelle.slice(0, 16) : "";
  el("mStatut").value = m.statut || "planifiee";
  el("modalErrorMission").style.display = "none";
  el("modalOverlayMission").classList.add("open");
}

function closeModalMission() {
  el("modalOverlayMission").classList.remove("open");
}

async function enregistrerMission() {
  const btn = el("btnConfirmMission");
  const errBox = el("modalErrorMission");
  errBox.style.display = "none";
  if (!el("mCamionId").value) {
    errBox.textContent = "Le tracteur (camion) est obligatoire.";
    errBox.style.display = "block";
    return;
  }
  if (!el("mRemorqueId").value) {
    errBox.textContent = "La remorque est obligatoire.";
    errBox.style.display = "block";
    return;
  }

  const payload = {
    client: el("mClient").value.trim() || null,
    marchandise: el("mMarchandise").value.trim() || null,
    camion_id: el("mCamionId").value ? parseInt(el("mCamionId").value) : null,
    remorque_id: el("mRemorqueId").value ? parseInt(el("mRemorqueId").value) : null,
    chauffeur_id: el("mChauffeurId").value ? parseInt(el("mChauffeurId").value) : null,
    lieu_depart: el("mLieuDepart").value.trim() || null,
    lieu_destination: el("mLieuDestination").value.trim() || null,
    date_depart_prevue: el("mDateDepartPrevue").value || null,
    date_arrivee_reelle: el("mDateArriveeReelle").value || null,
    statut: el("mStatut").value,
  };

  btn.disabled = true;
  try {
    if (missionEnEdition) {
      await api.updateMission(missionEnEdition.id, payload);
    } else {
      await api.createMission(payload);
    }
    closeModalMission();
    showToast(missionEnEdition ? "Mission mise à jour." : "Mission créée avec succès.");
    await loadMissions();
  } catch (err) {
    errBox.textContent = err.message;
    errBox.style.display = "block";
  } finally {
    btn.disabled = false;
  }
}

async function genererRapportMission(m) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  let y = 18;

  const camion = camionsCache.find((c) => c.camion.id === m.camion_id);
  const remorque = remorquesCache.find((r) => r.id === m.remorque_id);
  const chauffeur = chauffeursCache.find((ch) => ch.id === m.chauffeur_id);

  // -- Logo + en-tête --
  try {
    const logoDataUrl = await chargerImageBase64("img/logo.png");
    doc.addImage(logoDataUrl, "PNG", 14, 10, 18, 18);
  } catch (e) {
    // Si le logo ne charge pas (pas de connexion), on continue sans bloquer le rapport
  }

  doc.setFontSize(16);
  doc.setFont(undefined, "bold");
  doc.text("TransAfrique Logistics Cameroun", 36, y);
  doc.setFontSize(11);
  doc.setFont(undefined, "normal");
  y += 7;
  doc.text(`Rapport de mission — ${m.client || "Mission #" + m.id}`, 36, y);
  y += 5;
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Généré le ${new Date().toLocaleString("fr-FR")}`, 36, y);
  doc.setTextColor(0);
  y += 12;

  // -- Informations mission --
  doc.setFontSize(12);
  doc.setFont(undefined, "bold");
  doc.text("Informations", 14, y);
  y += 6;
  doc.setFontSize(10);
  doc.setFont(undefined, "normal");
  doc.text(`Client : ${m.client || "—"}`, 14, y); y += 5;
  doc.text(`Marchandise : ${m.marchandise || "—"}`, 14, y); y += 5;
  doc.text(`Trajet : ${m.lieu_depart || "—"} → ${m.lieu_destination || "—"}`, 14, y); y += 5;
  doc.text(`Statut : ${STATUT_LABEL[m.statut] || m.statut}`, 14, y); y += 10;

  // -- Véhicule --
  doc.setFontSize(12);
  doc.setFont(undefined, "bold");
  doc.text("Véhicule", 14, y);
  y += 6;
  doc.setFontSize(10);
  doc.setFont(undefined, "normal");
  doc.text(`Tracteur : ${camion ? (camion.camion.unit || "—") + " (" + camion.camion.immatriculation + ")" : "—"}`, 14, y); y += 5;
  doc.text(`Remorque : ${remorque ? (remorque.unit || "—") + " (" + remorque.immatriculation + ")" : "—"}`, 14, y); y += 5;
  doc.text(`Chauffeur : ${chauffeur ? chauffeur.prenom + " " + chauffeur.nom : "—"}${chauffeur?.telephone ? " — " + chauffeur.telephone : ""}`, 14, y); y += 10;

  // -- Durée --
  doc.setFontSize(12);
  doc.setFont(undefined, "bold");
  doc.text("Temps de trajet", 14, y);
  y += 6;
  doc.setFontSize(10);
  doc.setFont(undefined, "normal");
  const depart = m.date_depart_prevue ? new Date(m.date_depart_prevue) : null;
  const arrivee = m.date_arrivee_reelle ? new Date(m.date_arrivee_reelle) : null;
  doc.text(`Départ : ${depart ? depart.toLocaleString("fr-FR") : "—"}`, 14, y); y += 5;
  doc.text(`Arrivée : ${arrivee ? arrivee.toLocaleString("fr-FR") : "—"}`, 14, y); y += 5;
  if (depart && arrivee) {
    const dureeHeures = (arrivee - depart) / 3600000;
    doc.text(`Durée totale : ${formatDuree(dureeHeures)}`, 14, y);
  } else {
    doc.text(`Durée totale : — (mission pas encore terminée)`, 14, y);
  }
  y += 10;

  // -- Historique des états pendant la mission --
  doc.setFontSize(12);
  doc.setFont(undefined, "bold");
  doc.text("États traversés pendant la mission", 14, y);
  y += 2;

  if (!depart || !arrivee) {
    y += 8;
    doc.setFontSize(10);
    doc.setFont(undefined, "normal");
    doc.text("Historique indisponible — mission pas encore terminée.", 14, y);
  } else {
    try {
      const historique = await api.historiquePlage(m.camion_id, m.date_depart_prevue, m.date_arrivee_reelle);
      const lignes = historique.map((h) => [
        h.etat?.libelle || h.etat?.code || "—",
        new Date(h.date_debut).toLocaleString("fr-FR"),
        h.date_fin ? new Date(h.date_fin).toLocaleString("fr-FR") : "En cours",
        formatDuree((( h.date_fin ? new Date(h.date_fin) : new Date()) - new Date(h.date_debut)) / 3600000),
        h.lieu || "—",
        h.saisi_par || "—",
      ]);

      if (!lignes.length) {
        y += 8;
        doc.setFontSize(10);
        doc.setFont(undefined, "normal");
        doc.text("Aucun changement d'état enregistré sur cette période.", 14, y);
      } else {
        doc.autoTable({
          startY: y + 4,
          head: [["État", "Début", "Fin", "Durée", "Lieu", "Saisi par"]],
          body: lignes,
          styles: { fontSize: 8 },
        });
      }
    } catch (err) {
      y += 8;
      doc.setFontSize(10);
      doc.setFont(undefined, "normal");
      doc.text("Erreur lors du chargement de l'historique.", 14, y);
    }
  }

  doc.save(`rapport_mission_${m.id}_${new Date().toISOString().slice(0, 10)}.pdf`);
  showToast("Rapport de mission généré et téléchargé.");
}

function chargerImageBase64(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      canvas.getContext("2d").drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = url;
  });
}