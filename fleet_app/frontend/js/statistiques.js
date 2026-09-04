const el = (id) => document.getElementById(id);

const CATEGORIES_NON_PRODUCTIVES = ["Breakdown", "Workshop empty/Loaded", "Waiting fuel", "Waiting for documents", "Accident"];

let camionsCache = [];

document.addEventListener("DOMContentLoaded", async () => {
  if (!requireAuth()) return;
  initSidebarSession();
  setActiveNav();
  await charger();
});

async function charger() {
  el("connError").style.display = "none";
  try {
    const [missions, camions] = await Promise.all([
      api.listMissions("terminee"),
      api.listCamions(true),
    ]);
    camionsCache = camions;

    // Départ prévu -> arrivée réelle (le départ réel n'est pas saisi dans l'appli)
    const missionsAvecDurees = missions
      .filter((m) => m.date_depart_prevue && m.date_arrivee_reelle && m.lieu_depart && m.lieu_destination)
      .map((m) => ({
        ...m,
        dureeHeures: (new Date(m.date_arrivee_reelle) - new Date(m.date_depart_prevue)) / 3600000,
      }))
      .filter((m) => m.dureeHeures > 0);

    if (!missionsAvecDurees.length) {
      el("emptyState").style.display = "block";
      el("trajetsContainer").innerHTML = "";
      return;
    }
    el("emptyState").style.display = "none";

    // Regroupe par trajet (lieu de départ -> lieu de destination)
    const groupes = {};
    missionsAvecDurees.forEach((m) => {
      const cle = `${m.lieu_depart.trim()} → ${m.lieu_destination.trim()}`;
      if (!groupes[cle]) groupes[cle] = [];
      groupes[cle].push(m);
    });

    renderTrajets(groupes);
  } catch (err) {
    el("connError").textContent = "Impossible de charger les statistiques : " + err.message;
    el("connError").style.display = "block";
  }
}

function renderTrajets(groupes) {
  const cles = Object.keys(groupes).sort();
  el("trajetsContainer").innerHTML = cles.map((cle, index) => {
    const missionsDuTrajet = groupes[cle].sort((a, b) => a.dureeHeures - b.dureeHeures);
    const durees = missionsDuTrajet.map((m) => m.dureeHeures);
    const moyenne = durees.reduce((s, d) => s + d, 0) / durees.length;
    const min = Math.min(...durees);
    const max = Math.max(...durees);

    return `
      <div class="table-card trajet-card" onclick="toggleTrajet(${index})">
        <div class="trajet-header">
          <div class="trajet-nom">${escapeHtml(cle)}</div>
          <div class="trajet-chiffres">
            <div class="trajet-chiffre"><div class="valeur">${missionsDuTrajet.length}</div><div class="label">mission${missionsDuTrajet.length > 1 ? "s" : ""}</div></div>
            <div class="trajet-chiffre"><div class="valeur">${formatDuree(moyenne)}</div><div class="label">moyenne</div></div>
            <div class="trajet-chiffre"><div class="valeur">${formatDuree(min)}</div><div class="label">min</div></div>
            <div class="trajet-chiffre"><div class="valeur">${formatDuree(max)}</div><div class="label">max</div></div>
          </div>
        </div>
        <div class="trajet-detail" id="trajetDetail${index}">
          ${missionsDuTrajet.map((m) => {
            const lente = m.dureeHeures > moyenne * 1.3;
            const camion = camionsCache.find((c) => c.camion.id === m.camion_id);
            return `
              <div class="mission-ligne">
                <div>
                  <div>${escapeHtml(m.client || "Mission #" + m.id)} ${camion ? `· ${escapeHtml(camion.camion.immatriculation)}` : ""}</div>
                 <div style="color:var(--text-muted);font-size:11.5px;">${new Date(m.date_depart_prevue).toLocaleDateString("fr-FR")} (prévu) → ${new Date(m.date_arrivee_reelle).toLocaleDateString("fr-FR")} (réel)</div>
                </div>
                <div style="display:flex;align-items:center;gap:10px;">
                  <span class="mission-duree ${lente ? "lente" : ""}">${formatDuree(m.dureeHeures)}</span>
                  ${lente ? `<button class="btn btn-secondary btn-justifier" onclick='event.stopPropagation(); justifier(${JSON.stringify(m)}, ${moyenne.toFixed(2)})'>Pourquoi ?</button>` : ""}
                </div>
              </div>
              <div class="justif-box" id="justifBox${m.id}"></div>
            `;
          }).join("")}
        </div>
      </div>
    `;
  }).join("");
}

function toggleTrajet(index) {
  el(`trajetDetail${index}`).classList.toggle("open");
}

async function justifier(m, dureeMoyenneRoute) {
  const box = el(`justifBox${m.id}`);
  const dejaOuvert = box.classList.contains("open");
  if (dejaOuvert) {
    box.classList.remove("open");
    return;
  }
  if (!m.camion_id) {
    box.innerHTML = `<div style="color:var(--text-muted)">Aucun camion associé à cette mission, impossible de croiser avec l'historique d'état.</div>`;
    box.classList.add("open");
    return;
  }
  box.innerHTML = `<div style="color:var(--text-muted)">Analyse en cours…</div>`;
  box.classList.add("open");
  try {
    const historique = await api.historiquePlage(m.camion_id, m.date_depart_prevue, m.date_arrivee_reelle);
    const fenetreDebut = new Date(m.date_depart_prevue);
    const fenetreFin = new Date(m.date_arrivee_reelle);

    const evenements = historique.map((h) => {
      const debut = new Date(h.date_debut);
      const fin = h.date_fin ? new Date(h.date_fin) : new Date();
      const d = debut > fenetreDebut ? debut : fenetreDebut;
      const f = fin < fenetreFin ? fin : fenetreFin;
      const heuresDansLaFenetre = Math.max(0, (f - d) / 3600000);
      return { ...h, heuresDansLaFenetre };
    }).filter((h) => h.heuresDansLaFenetre > 0);

    const causesProbables = evenements.filter((h) => CATEGORIES_NON_PRODUCTIVES.includes(h.etat.categorie_dg));
    const heuresCauses = causesProbables.reduce((s, h) => s + h.heuresDansLaFenetre, 0);
    const ecart = m.dureeHeures - dureeMoyenneRoute;

    if (!evenements.length) {
      box.innerHTML = `<div style="color:var(--text-muted)">Aucun événement d'état enregistré pour ce camion sur la période du trajet — impossible d'expliquer l'écart avec les données actuelles.</div>`;
      return;
    }

    box.innerHTML = `
      <div style="margin-bottom:8px;">Écart par rapport à la moyenne du trajet : <strong style="color:var(--immob)">+${formatDuree(ecart)}</strong></div>
      ${causesProbables.length
        ? `<div style="margin-bottom:6px;">Événements pouvant expliquer le retard (${formatDuree(heuresCauses)} au total) :</div>`
        : `<div style="margin-bottom:6px;color:var(--text-muted)">Aucun événement de type panne/accident/attente détecté — le retard n'est pas expliqué par l'historique d'état disponible.</div>`}
      ${evenements.map((h) => {
        const estCause = CATEGORIES_NON_PRODUCTIVES.includes(h.etat.categorie_dg);
        return `<div class="justif-ligne ${estCause ? "cause" : ""}">
          <span>${estCause ? "⚠ " : ""}${escapeHtml(h.etat.libelle)}</span>
          <span>${formatDuree(h.heuresDansLaFenetre)}</span>
        </div>`;
      }).join("")}
    `;
  } catch (err) {
    box.innerHTML = `<div style="color:var(--immob)">Erreur lors de l'analyse : ${escapeHtml(err.message)}</div>`;
  }
}