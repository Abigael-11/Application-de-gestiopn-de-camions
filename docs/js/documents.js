
const el = (id) => document.getElementById(id);
const TYPE_DOCUMENT_LABEL = {
    carte_grise: "Carte grise",
    carte_bleue: "Carte bleue",
    visite_technique: "Visite technique",
    assurance: "Assurance",
    licence_transport: "Licence transport",
    patente_talcsa: "Patente TALCSA",
  };
  const ORDRE_DOCUMENTS = ["carte_grise", "carte_bleue", "visite_technique", "assurance", "licence_transport", "patente_talcsa"];
  
  async function init() {
    if (!requireAuth()) return;
    const role = session.getRole();
    if (!["super_admin", "admin_transport", "comptable"].includes(role)) {
      window.location.href = "index.html";
      return;
    }
  
    initSidebarSession();
    setActiveNav();
  
    if (["super_admin", "comptable"].includes(role)) {
      el("seuilsActions").style.display = "flex";
      el("btnConfigurerSeuils").addEventListener("click", ouvrirSeuils);
    }
    el("btnCancelSeuils").addEventListener("click", () => el("modalOverlaySeuils").classList.remove("open"));
    el("modalOverlaySeuils").addEventListener("click", (e) => { if (e.target.id === "modalOverlaySeuils") el("modalOverlaySeuils").classList.remove("open"); });
    el("btnSaveSeuils").addEventListener("click", enregistrerSeuils);
  
    await loadTableauBord();
  }
  
  async function loadTableauBord() {
    try {
      const vehicules = await api.tableauBordDocuments();
      if (!vehicules.length) {
        el("documentsBody").innerHTML = `<tr><td colspan="9" style="color:var(--text-muted);text-align:center;padding:24px;">Aucun véhicule actif enregistré.</td></tr>`;
        return;
      }
      el("documentsBody").innerHTML = vehicules.map((v) => `
        <tr>
          <td><strong>${escapeHtml(v.unit || "—")}</strong></td>
          <td>${escapeHtml(v.immatriculation)}</td>
          <td>${v.type_vehicule === "camion" ? "🚚 Camion" : "🔗 Remorque"}</td>
          ${ORDRE_DOCUMENTS.map((type) => renderCelluleDocument(v.documents.find((d) => d.type_document === type))).join("")}
        </tr>
      `).join("");
    } catch (err) {
      el("connError").style.display = "block";
      el("connError").innerHTML = `<strong>Connexion au serveur impossible.</strong><br>${escapeHtml(err.message)}`;
    }
  }
  
  function renderCelluleDocument(doc) {
    if (!doc || doc.statut === "inconnu") {
      return `<td class="doc-cell"><span class="doc-badge doc-inconnu">Non renseigné</span></td>`;
    }
    const dateFormatee = new Date(doc.date_expiration).toLocaleDateString("fr-FR");
    const labelStatut = doc.statut === "rouge" ? "Expire bientôt" : doc.statut === "jaune" ? "À surveiller" : "Valide";
    return `<td class="doc-cell"><span class="doc-badge doc-${doc.statut}">${labelStatut}</span><span class="date">${dateFormatee} (${doc.jours_restants}j)</span></td>`;
  }
  
  async function ouvrirSeuils() {
    try {
      const seuils = await api.listSeuilsDocuments();
      el("seuilsFields").innerHTML = seuils.map((s) => `
        <div class="field" data-type="${s.type_document}">
          <label>${TYPE_DOCUMENT_LABEL[s.type_document] || s.type_document}</label>
          <div style="display:flex;gap:10px;">
            <div style="flex:1;">
              <label style="font-size:11px;color:var(--text-muted);">Seuil jaune (jours)</label>
              <input type="number" class="seuil-jaune" value="${s.seuil_jaune_jours}" min="1" />
            </div>
            <div style="flex:1;">
              <label style="font-size:11px;color:var(--text-muted);">Seuil rouge (jours)</label>
              <input type="number" class="seuil-rouge" value="${s.seuil_rouge_jours}" min="1" />
            </div>
          </div>
        </div>
      `).join("");
      el("modalErrorSeuils").style.display = "none";
      el("modalOverlaySeuils").classList.add("open");
    } catch (err) {
      showToast(err.message, true);
    }
  }
  
  async function enregistrerSeuils() {
    const btn = el("btnSaveSeuils");
    const errBox = el("modalErrorSeuils");
    errBox.style.display = "none";
    btn.disabled = true;
    btn.textContent = "Enregistrement…";
  
    try {
      const blocs = el("seuilsFields").querySelectorAll("[data-type]");
      for (const bloc of blocs) {
        const type = bloc.dataset.type;
        const seuilJaune = parseInt(bloc.querySelector(".seuil-jaune").value, 10);
        const seuilRouge = parseInt(bloc.querySelector(".seuil-rouge").value, 10);
        if (seuilRouge >= seuilJaune) {
          errBox.textContent = `Pour "${TYPE_DOCUMENT_LABEL[type]}" : le seuil rouge doit être inférieur au seuil jaune.`;
          errBox.style.display = "block";
          btn.disabled = false;
          btn.textContent = "Enregistrer";
          return;
        }
        await api.updateSeuilDocument(type, { seuil_jaune_jours: seuilJaune, seuil_rouge_jours: seuilRouge });
      }
      el("modalOverlaySeuils").classList.remove("open");
      showToast("Seuils enregistrés.");
      await loadTableauBord();
    } catch (err) {
      errBox.textContent = err.message;
      errBox.style.display = "block";
    } finally {
      btn.disabled = false;
      btn.textContent = "Enregistrer";
    }
  }
  
  init();