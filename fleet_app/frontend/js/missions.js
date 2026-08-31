const el = (id) => document.getElementById(id);

let missionEnEdition = null;
let camionsCache = [];
let chauffeursCache = [];

const STATUT_LABEL = {
  planifiee: "Planifiée",
  en_cours: "En cours",
  terminee: "Terminée",
  annulee: "Annulée",
};

document.addEventListener("DOMContentLoaded", async () => {
  if (!requireAuth()) return;
  initSidebarSession();

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
    const [missions, camions, chauffeurs] = await Promise.all([
      api.listMissions(statutFiltre),
      api.listCamions(true),
      api.listChauffeurs(true),
    ]);
       camionsCache = camions;
    chauffeursCache = chauffeurs;

    const selectCamion = el("mCamionId");
    selectCamion.innerHTML = '<option value="">— Aucun —</option>' +
      camions.map((c) => `<option value="${c.camion.id}">${escapeHtml(c.camion.immatriculation)}</option>`).join("");

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
      return `
        <tr>
          <td>${escapeHtml(m.client || "—")}</td>
          <td>${escapeHtml(m.marchandise || "—")}</td>
          <td>${camion ? escapeHtml(camion.camion.immatriculation) : "—"}</td>
          <td>${chauffeur ? escapeHtml(chauffeur.prenom + " " + chauffeur.nom) : "—"}</td>
          <td>${escapeHtml(m.lieu_depart || "—")} → ${escapeHtml(m.lieu_destination || "—")}</td>
          <td>${m.date_depart_prevue ? new Date(m.date_depart_prevue).toLocaleString("fr-FR") : "—"}</td>
          <td><span class="badge badge-${m.statut}">${STATUT_LABEL[m.statut] || m.statut}</span></td>
          <td>
            <button class="btn btn-secondary btn-sm" onclick='ouvrirEditionMission(${JSON.stringify(m)})'>✎ Modifier</button>
            ${m.statut !== "terminee" && m.statut !== "annulee"
              ? `<button class="btn btn-primary btn-sm" onclick="terminerMission(${m.id})">✓ Terminer</button>`
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

async function terminerMission(id) {
  try {
    await api.updateMission(id, {
      statut: "terminee",
      date_arrivee_reelle: new Date().toISOString(),
    });
    showToast("Mission marquée comme terminée.");
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
  el("mChauffeurId").value = "";
  el("mLieuDepart").value = "";
  el("mLieuDestination").value = "";
  el("mDateDepartPrevue").value = "";
  el("mDateArriveePrevue").value = "";
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
  el("mChauffeurId").value = m.chauffeur_id || "";
  el("mLieuDepart").value = m.lieu_depart || "";
  el("mLieuDestination").value = m.lieu_destination || "";
  el("mDateDepartPrevue").value = m.date_depart_prevue ? m.date_depart_prevue.slice(0, 16) : "";
  el("mDateArriveePrevue").value = m.date_arrivee_prevue ? m.date_arrivee_prevue.slice(0, 16) : "";
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

  const payload = {
    client: el("mClient").value.trim() || null,
    marchandise: el("mMarchandise").value.trim() || null,
    camion_id: el("mCamionId").value ? parseInt(el("mCamionId").value) : null,
    chauffeur_id: el("mChauffeurId").value ? parseInt(el("mChauffeurId").value) : null,
    lieu_depart: el("mLieuDepart").value.trim() || null,
    lieu_destination: el("mLieuDestination").value.trim() || null,
    date_depart_prevue: el("mDateDepartPrevue").value || null,
    date_arrivee_prevue: el("mDateArriveePrevue").value || null,
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