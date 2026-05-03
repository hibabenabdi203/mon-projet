/* =============================================================
   TWINOVA — MODULE 3 HACCP & SÉCURITÉ SANITAIRE
   Ajouter ce bloc dans App.js (à la suite du code existant)
   puis ajouter 'haccp' dans la fonction navigateTo() :
   
   case 'haccp':
       haccp.init();
       break;
   ============================================================= */

// ════════════════════════════════════════════════════════════
// MODULE HACCP — Objet principal
// ════════════════════════════════════════════════════════════
const haccp = (() => {

  // ── État interne ────────────────────────────────────────
  let state = {
    plans          : [],
    lots           : [],
    seuilsActifs   : [],
    lotSelected    : null,
    seuilSelected  : null,
    statut         : null,
    vpChart        : null,
    phChart        : null,
  };

  // ── Helpers API ─────────────────────────────────────────
  const api = (path, method = 'GET', body = null) => {
    const token = localStorage.getItem('token');
    const opts  = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    };
    return fetch(`/haccp${path}`, opts).then(r => {
      if (!r.ok) return r.json().then(e => { throw new Error(e.detail || 'Erreur API'); });
      return r.json();
    });
  };

  const apiBase = (path, method = 'GET', body = null) => {
    const token = localStorage.getItem('token');
    const opts  = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    };
    return fetch(path, opts).then(r => r.json());
  };

  const toast = (msg, type = 'success') => {
    if (typeof showToast === 'function') { showToast(msg, type); return; }
    const el = document.createElement('div');
    el.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:9999;
      padding:14px 20px;border-radius:10px;font-size:14px;font-weight:600;
      background:${type==='success'?'#276749':type==='error'?'#c53030':'#744210'};
      color:#fff;box-shadow:0 8px 24px rgba(0,0,0,.2);
      animation:slideIn .3s ease`;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  };

  // ── INIT ────────────────────────────────────────────────
  const init = async () => {
    await Promise.all([
      loadPlans(),
      loadLots(),
      refreshIndicateurs(),
      loadAlertes(),
    ]);
  };

  // ── Charger plans HACCP ─────────────────────────────────
  const loadPlans = async () => {
    try {
      state.plans = await api('/plans');
      renderPlans();
    } catch(e) { console.error('plans:', e); }
  };

  // ── Charger lots (depuis l'API Module 2) ─────────────────
  const loadLots = async () => {
    try {
      const data = await apiBase('/lots');
      state.lots = Array.isArray(data) ? data : (data.lots || []);
      populateLotSelect();
    } catch(e) { console.error('lots:', e); }
  };

  const populateLotSelect = () => {
    const sel = document.getElementById('haccp-lot-select');
    if (!sel) return;
    sel.innerHTML = '<option value="">— Sélectionner un lot —</option>';
    state.lots.forEach(l => {
      const opt = document.createElement('option');
      opt.value       = l.id;
      opt.textContent = `Lot #${l.numero_lot || l.id} — ${l.recette_nom || l.nom_recette || ''}`;
      sel.appendChild(opt);
    });

    // Peupler aussi le select du modal
    const selModal = document.getElementById('plan-recette-select');
    if (selModal) {
      selModal.innerHTML = '<option value="">— Recette —</option>';
      // Utiliser les recettes si disponibles
      apiBase('/recettes').then(recettes => {
        (Array.isArray(recettes) ? recettes : []).forEach(r => {
          const o = document.createElement('option');
          o.value = r.id;
          o.textContent = r.nom;
          selModal.appendChild(o);
        });
      }).catch(() => {});
    }
  };

  // ── Changement de lot ────────────────────────────────────
  const onLotChange = async (lotId) => {
    state.lotSelected   = lotId || null;
    state.seuilSelected = null;
    document.getElementById('haccp-statut-card').style.display     = 'none';
    document.getElementById('haccp-historique-card').style.display = 'none';

    const seuilSel = document.getElementById('haccp-seuil-select');
    seuilSel.innerHTML = '<option value="">— Chargement… —</option>';
    document.getElementById('haccp-zone-info').style.display = 'none';

    if (!lotId) return;

    // Trouver le lot pour accéder à sa recette_id
    const lot = state.lots.find(l => String(l.id) === String(lotId));
    const recetteId = lot?.recette_id || lot?.id_recette;

    // Chercher les seuils liés aux plans de cette recette
    const plansLot = state.plans.filter(p => !recetteId || String(p.recette_id) === String(recetteId));
    state.seuilsActifs = plansLot.flatMap(p => p.seuils || []);

    seuilSel.innerHTML = '<option value="">— Sélectionner un paramètre HACCP —</option>';
    state.seuilsActifs.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = `[${s.etape_process}] ${s.libelle}`;
      seuilSel.appendChild(opt);
    });

    // Charger statut lot
    await loadStatutLot(lotId);
    await loadHistoriqueControles(lotId);
  };

  // ── Changement de seuil ──────────────────────────────────
  const onSeuilChange = (seuilId) => {
    state.seuilSelected = seuilId ? state.seuilsActifs.find(s => String(s.id) === String(seuilId)) : null;
    const zone = document.getElementById('haccp-zone-info');
    const badge = document.getElementById('haccp-unite-badge');
    const preview = document.getElementById('haccp-preview');
    preview.style.display = 'none';

    if (!state.seuilSelected) { zone.style.display = 'none'; badge.textContent = ''; return; }

    const s = state.seuilSelected;
    zone.style.display = 'block';
    badge.textContent  = s.unite || '';

    let rangeText = '';
    if (s.valeur_min !== null && s.valeur_max !== null)
      rangeText = `${s.valeur_min} – ${s.valeur_max} ${s.unite}`;
    else if (s.valeur_max !== null)
      rangeText = `≤ ${s.valeur_max} ${s.unite}`;
    else if (s.valeur_min !== null)
      rangeText = `≥ ${s.valeur_min} ${s.unite}`;

    document.getElementById('haccp-zone-range').textContent = rangeText;
    document.getElementById('haccp-zone-cible').textContent =
      s.valeur_cible !== null ? `Cible : ${s.valeur_cible} ${s.unite}` : '';

    // Vider valeur
    document.getElementById('haccp-valeur').value = '';
  };

  // ── Preview conformité en temps réel ─────────────────────
  const previewConformite = () => {
    const val   = parseFloat(document.getElementById('haccp-valeur').value);
    const prev  = document.getElementById('haccp-preview');
    const s     = state.seuilSelected;
    if (!s || isNaN(val)) { prev.style.display = 'none'; return; }

    let ok = true;
    if (s.valeur_min !== null && val < s.valeur_min) ok = false;
    if (s.valeur_max !== null && val > s.valeur_max) ok = false;

    prev.style.display = 'block';
    prev.className     = `conformite-preview ${ok ? 'preview-ok' : 'preview-nok'}`;
    const ecart = s.valeur_cible !== null ? ` (écart : ${(val - s.valeur_cible).toFixed(2)} ${s.unite})` : '';
    prev.textContent   = ok
      ? `✅ Valeur dans la zone de sécurité${ecart}`
      : `❌ HORS ZONE — ${s.niveau_gravite === 'critique' ? '🚨 Alerte CRITIQUE' : '⚠️ Alerte mineure'}${ecart}`;
  };

  // ── Soumettre contrôle ───────────────────────────────────
  const soumettreControle = async () => {
    const lotId   = document.getElementById('haccp-lot-select').value;
    const seuilId = document.getElementById('haccp-seuil-select').value;
    const valeur  = document.getElementById('haccp-valeur').value;
    const op      = document.getElementById('haccp-operateur').value;
    const cmt     = document.getElementById('haccp-commentaire').value;

    if (!lotId || !seuilId || valeur === '')
      return toast('Veuillez remplir tous les champs obligatoires', 'warning');

    try {
      const res = await api('/controle', 'POST', {
        lot_id         : parseInt(lotId),
        seuil_id       : parseInt(seuilId),
        valeur_mesuree : parseFloat(valeur),
        operateur      : op || 'Opérateur',
        commentaire    : cmt,
      });

      if (res.conforme) {
        toast('✅ Contrôle conforme enregistré');
      } else {
        const msg = res.niveau_gravite === 'critique'
          ? `🚨 ALERTE CRITIQUE — ${res.action_requise}`
          : `⚠️ Alerte mineure — ${res.action_requise}`;
        toast(msg, res.niveau_gravite === 'critique' ? 'error' : 'warning');
        showAlertePopup(res);
      }

      // Reset champs
      document.getElementById('haccp-valeur').value      = '';
      document.getElementById('haccp-commentaire').value = '';
      document.getElementById('haccp-preview').style.display = 'none';

      // Rafraîchir
      await loadStatutLot(lotId);
      await loadHistoriqueControles(lotId);
      await refreshIndicateurs();
      await loadAlertes();

    } catch(e) { toast(e.message, 'error'); }
  };

  // ── Popup alerte non conforme ────────────────────────────
  const showAlertePopup = (data) => {
    const isCrit = data.niveau_gravite === 'critique';
    const popup  = document.createElement('div');
    popup.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;
      display:flex;align-items:center;justify-content:center;padding:20px`;
    popup.innerHTML = `
      <div style="background:#fff;border-radius:16px;max-width:480px;width:100%;
           border-top:6px solid ${isCrit?'#e53e3e':'#dd6b20'};overflow:hidden">
        <div style="padding:24px">
          <div style="font-size:24px;margin-bottom:8px">${isCrit?'🚨':'⚠️'}</div>
          <h3 style="color:${isCrit?'#c53030':'#744210'};margin:0 0 12px">
            ${isCrit?'ALERTE CRITIQUE':'Alerte Mineure'}
          </h3>
          <p style="color:#2d3748;margin-bottom:16px">Valeur hors zone de sécurité détectée.</p>
          <div style="background:${isCrit?'#fff5f5':'#fffaf0'};border-radius:8px;
               padding:12px;border-left:4px solid ${isCrit?'#e53e3e':'#dd6b20'}">
            <div style="font-weight:700;margin-bottom:6px;font-size:13px;color:${isCrit?'#c53030':'#744210'}">
              Action requise :
            </div>
            <div style="font-size:13px;color:#2d3748">${data.action_requise}</div>
          </div>
          ${isCrit ? '<p style="color:#718096;font-size:12px;margin-top:12px">📧 Email envoyé au Responsable Qualité</p>' : ''}
          <button onclick="this.closest(\'[style*=inset]\').remove()"
                  style="margin-top:20px;width:100%;padding:12px;background:${isCrit?'#c53030':'#dd6b20'};
                  color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700;font-size:14px">
            J'ai pris en compte — Fermer
          </button>
        </div>
      </div>`;
    document.body.appendChild(popup);
  };

  // ── Charger statut lot ───────────────────────────────────
  const loadStatutLot = async (lotId) => {
    try {
      const s = await api(`/statut-lot/${lotId}`);
      state.statut = s;
      renderStatutLot(s);
      document.getElementById('haccp-statut-card').style.display = 'block';
    } catch(e) { console.error('statut:', e); }
  };

  const renderStatutLot = (s) => {
    const badge   = document.getElementById('haccp-statut-badge');
    const labelsMap = {
      en_attente : ['🟡 En Attente de Contrôle', 'statut-en_attente'],
      conforme   : ['✅ Tous Contrôles Conformes', 'statut-conforme'],
      bloque     : ['🔴 LOT BLOQUÉ — NON CONFORME', 'statut-bloque'],
      libere     : ['🟢 LOT LIBÉRÉ', 'statut-libere'],
    };
    const [label, cls] = labelsMap[s.statut] || ['—', ''];
    badge.textContent  = label;
    badge.className    = `lot-statut-badge ${cls}`;

    // Jauge
    document.getElementById('haccp-indice-pct').textContent = `${s.indice_conformite}%`;
    const bar = document.getElementById('haccp-jauge-bar');
    bar.style.width      = `${s.indice_conformite}%`;
    bar.style.background = s.indice_conformite >= 100 ? 'linear-gradient(90deg,#48bb78,#38a169)'
      : s.indice_conformite >= 80 ? 'linear-gradient(90deg,#ecc94b,#d69e2e)'
      : 'linear-gradient(90deg,#fc8181,#e53e3e)';

    // Métriques
    document.getElementById('hk-nb-controles').textContent = s.nb_controles;
    document.getElementById('hk-nb-conformes').textContent = s.nb_conformes;
    document.getElementById('hk-nb-crit').textContent      = s.nb_alertes_critiques;
    document.getElementById('hk-nb-min').textContent       = s.nb_alertes_mineures;
    document.getElementById('haccp-temps-risque').textContent = `${s.temps_exposition_risque} min`;

    // Bouton libération
    const blockMsg  = document.getElementById('haccp-block-msg');
    const btnLib    = document.getElementById('haccp-btn-liberer');
    const libMsg    = document.getElementById('haccp-libere-msg');

    blockMsg.style.display = 'none';
    btnLib.style.display   = 'none';
    libMsg.style.display   = 'none';

    if (s.statut === 'libere') {
      libMsg.style.display  = 'block';
      libMsg.textContent    = `✅ LOT LIBÉRÉ par ${s.libere_par || '—'} le ${s.libere_le ? new Date(s.libere_le).toLocaleString('fr-DZ') : '—'}`;
    } else if (s.statut === 'bloque' || (s.nb_alertes_critiques > 0)) {
      blockMsg.style.display = 'block';
    } else if (s.liberation_autorisee && s.nb_controles > 0) {
      btnLib.style.display   = 'block';
    } else if (s.nb_controles === 0) {
      // Rien — en attente
    } else {
      blockMsg.style.display = 'block';
    }

    // Alertes actives
    if (s.alertes_actives && s.alertes_actives.length > 0) {
      let html = '<div style="margin-top:14px">';
      html += '<div style="font-weight:600;font-size:13px;margin-bottom:8px;color:#c53030">🚨 Alertes en cours :</div>';
      s.alertes_actives.slice(0, 3).forEach(a => {
        html += `<div style="background:#fff5f5;border-radius:8px;padding:10px 12px;margin-bottom:6px;
                 border-left:3px solid ${a.niveau_gravite==='critique'?'#e53e3e':'#dd6b20'}">
          <div style="font-size:12px;font-weight:700;color:${a.niveau_gravite==='critique'?'#c53030':'#744210'}">
            ${a.niveau_gravite.toUpperCase()}
          </div>
          <div style="font-size:12px;color:#2d3748;margin:3px 0">${a.message}</div>
          <div style="font-size:11px;color:#718096">${a.action_requise}</div>
          <button onclick="haccp.acquitterAlerte(${a.id})" style="margin-top:6px;font-size:11px;
            padding:3px 10px;background:#e53e3e;color:#fff;border:none;border-radius:4px;cursor:pointer">
            ✔ Acquitter
          </button>
        </div>`;
      });
      html += '</div>';
      blockMsg.insertAdjacentHTML('afterend', html);
    }
  };

  // ── Charger historique contrôles ─────────────────────────
  const loadHistoriqueControles = async (lotId) => {
    try {
      const controles = await api(`/controles/${lotId}`);
      const tbody = document.getElementById('haccp-controles-body');
      const card  = document.getElementById('haccp-historique-card');
      if (!tbody) return;

      if (!controles.length) { card.style.display = 'none'; return; }
      card.style.display = 'block';

      tbody.innerHTML = controles.slice().reverse().map(c => {
        const tag = c.conforme
          ? '<span class="tag-conforme">✅ Conforme</span>'
          : '<span class="tag-nc">❌ Non Conforme</span>';
        const zone = (c.valeur_min !== null && c.valeur_max !== null)
          ? `${c.valeur_min}–${c.valeur_max}` : (c.valeur_max !== null ? `≤${c.valeur_max}` : '—');
        const heure = c.horodatage ? new Date(c.horodatage).toLocaleTimeString('fr-DZ') : '—';
        return `<tr>
          <td>${c.etape || '—'} — ${c.libelle || '—'}</td>
          <td><b>${c.valeur_mesuree}</b> ${c.unite || ''}</td>
          <td>${zone} ${c.unite || ''}</td>
          <td>${tag}</td>
          <td>${heure}</td>
        </tr>`;
      }).join('');
    } catch(e) { console.error('historique:', e); }
  };

  // ── Libérer le lot ───────────────────────────────────────
  const libererLot = async () => {
    const lotId = state.lotSelected;
    if (!lotId) return;
    const libPar = prompt('Votre nom pour la libération du lot :');
    if (!libPar) return;

    try {
      const res = await api('/liberer-lot', 'POST', {
        lot_id    : parseInt(lotId),
        libere_par: libPar,
      });
      toast(`✅ ${res.message}`);
      await loadStatutLot(lotId);
      await refreshIndicateurs();
    } catch(e) { toast(e.message, 'error'); }
  };

  // ── Acquitter alerte ─────────────────────────────────────
  const acquitterAlerte = async (alerteId) => {
    const op = prompt('Votre nom pour acquitter cette alerte :');
    if (!op) return;
    try {
      await fetch(`/haccp/acquitter-alerte/${alerteId}?operateur=${encodeURIComponent(op)}`, {
        method : 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      toast('Alerte acquittée');
      if (state.lotSelected) {
        await loadStatutLot(state.lotSelected);
        await loadHistoriqueControles(state.lotSelected);
      }
      await loadAlertes();
      await refreshIndicateurs();
    } catch(e) { toast(e.message, 'error'); }
  };

  // ── Rafraîchir indicateurs sanitaires ───────────────────
  const refreshIndicateurs = async () => {
    try {
      const ind = await api('/indicateurs-sanitaires');
      setText('haccp-kpi-indice',       `${ind.indice_conformite_global}%`);
      setText('haccp-kpi-bloques',      ind.nb_lots_bloques);
      setText('haccp-kpi-liberes',      ind.nb_lots_liberes);
      setText('haccp-kpi-alertes',      ind.nb_alertes_critiques_nc + ind.nb_alertes_mineures_nc);
      setText('haccp-kpi-indice-label', `${ind.nb_lots_controles} lots contrôlés`);
      setText('haccp-kpi-alertes-crit', `${ind.nb_alertes_critiques_nc} critiques`);
      setText('haccp-kpi-taux-lib',     `Taux : ${ind.taux_liberation}%`);

      // Badge onglet alertes
      const total = ind.nb_alertes_critiques_nc + ind.nb_alertes_mineures_nc;
      const bdg = document.getElementById('badge-alertes');
      if (bdg) { bdg.style.display = total > 0 ? 'inline-block' : 'none'; bdg.textContent = total; }
    } catch(e) { console.error('indicateurs:', e); }
  };

  const setText = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  // ── Charger alertes ─────────────────────────────────────
  const loadAlertes = async (showAll = false) => {
    try {
      const url = showAll ? '/alertes?non_acquittees=false' : '/alertes?non_acquittees=true';
      const alertes = await api(url);
      const container = document.getElementById('alertes-list');
      if (!container) return;

      if (!alertes.length) {
        container.innerHTML = `<div style="text-align:center;padding:40px;color:#718096">
          ✅ Aucune alerte active — Tous les lots sont conformes</div>`;
        return;
      }

      container.innerHTML = alertes.map(a => {
        const isCrit  = a.niveau_gravite === 'critique';
        const horod   = a.horodatage ? new Date(a.horodatage).toLocaleString('fr-DZ') : '—';
        return `
        <div class="alerte-card alerte-${a.niveau_gravite}">
          <div class="alerte-header">
            <div>
              <span class="alerte-titre">${isCrit ? '🚨 CRITIQUE' : '⚠️ MINEURE'} — Lot #${a.lot_id}</span>
              ${a.email_envoye ? '<span style="font-size:11px;color:#718096;margin-left:8px">📧 Email envoyé</span>' : ''}
              ${a.acquittee ? '<span style="font-size:11px;color:#276749;margin-left:8px">✔ Acquittée par '+a.acquittee_par+'</span>' : ''}
            </div>
            ${!a.acquittee ? `<button onclick="haccp.acquitterAlerte(${a.id})"
              class="btn btn-secondary btn-sm">✔ Acquitter</button>` : ''}
          </div>
          <div class="alerte-message">${a.message}</div>
          <div class="alerte-action">Action requise : ${a.action_requise}</div>
          <div class="alerte-footer">
            <span class="alerte-time">${horod}</span>
          </div>
        </div>`;
      }).join('');
    } catch(e) { console.error('alertes:', e); }
  };

  // ── Rendu plans HACCP ────────────────────────────────────
  const renderPlans = () => {
    const container = document.getElementById('plans-haccp-list');
    if (!container) return;

    if (!state.plans.length) {
      container.innerHTML = `<div style="text-align:center;padding:40px;color:#718096">
        Aucun plan HACCP — Créez votre premier plan</div>`;
      return;
    }

    const typeColors = {
      temperature: 'type-temperature', ph: 'type-ph', metal: 'type-metal',
      humidite: 'type-humidite', microbiologie: 'type-microbiologie', visuel: 'type-visuel',
    };

    container.innerHTML = state.plans.map(p => `
      <div class="plan-card">
        <div class="plan-card-header" onclick="togglePlanDetails(${p.id})">
          <div>
            <div class="plan-card-title">📋 ${p.nom_plan}</div>
            <div class="plan-card-meta">Version ${p.version} — ${p.responsable || 'Non défini'}
              — ${p.date_creation ? new Date(p.date_creation).toLocaleDateString('fr-DZ') : '—'}</div>
          </div>
          <div style="display:flex;align-items:center;gap:10px">
            <span class="plan-badge">${p.nb_seuils} CCP${p.nb_seuils>1?'s':''}</span>
            <span style="color:#718096">▼</span>
          </div>
        </div>
        <div id="plan-details-${p.id}" style="display:none;padding:16px 20px">
          ${!p.seuils || !p.seuils.length
            ? '<p style="color:#718096;text-align:center;padding:20px">Aucun seuil défini</p>'
            : p.seuils.map(s => `
            <div class="seuil-row">
              <div>
                <span class="seuil-type-badge ${typeColors[s.type_parametre]||''}">
                  ${s.type_parametre}
                </span>
                <div style="font-weight:600;margin-top:4px">${s.libelle || s.etape_process}</div>
                <div style="font-size:12px;color:#718096">${s.etape_process}</div>
              </div>
              <div>
                <div style="font-size:12px;color:#718096">Zone sécurité</div>
                <div style="font-weight:600">
                  ${s.valeur_min !== null ? s.valeur_min : '—'} – ${s.valeur_max !== null ? s.valeur_max : '—'} ${s.unite || ''}
                </div>
                ${s.valeur_cible !== null ? `<div style="font-size:11px;color:#718096">Cible : ${s.valeur_cible}</div>` : ''}
              </div>
              <div>
                <div style="font-size:12px;color:#718096">Si mineure</div>
                <div style="font-size:12px;color:#2d3748">${s.action_mineure || '—'}</div>
              </div>
              <div>
                <div style="font-size:12px;color:#c53030;font-weight:600">Si critique 🚨</div>
                <div style="font-size:12px;color:#c53030">${s.action_critique || '—'}</div>
              </div>
            </div>`).join('')
          }
        </div>
      </div>`).join('');
  };

  // ── Toggle détails plan ──────────────────────────────────
  // (accessible globalement)
  window.togglePlanDetails = (planId) => {
    const el = document.getElementById(`plan-details-${planId}`);
    if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
  };

  // ── Switch onglets ───────────────────────────────────────
  const switchTab = (tab) => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => {
      c.style.display = 'none';
      c.classList.remove('active-tab');
    });
    const btn = document.querySelector(`[data-tab="${tab}"]`);
    const cnt = document.getElementById(`tab-${tab}`);
    if (btn) btn.classList.add('active');
    if (cnt) { cnt.style.display = 'block'; cnt.classList.add('active-tab'); }

    if (tab === 'alertes') loadAlertes();
    if (tab === 'plans')   renderPlans();
  };

  // ── MODAL PLAN HACCP ─────────────────────────────────────
  let seuilCount = 0;

  const openPlanModal = () => {
    document.getElementById('seuils-container').innerHTML = '';
    seuilCount = 0;
    addSeuilRow();  // Ajouter une ligne vide par défaut
    document.getElementById('modal-plan-haccp').style.display = 'flex';
  };

  const closePlanModal = (event) => {
    if (event && event.target !== document.getElementById('modal-plan-haccp') && event) return;
    document.getElementById('modal-plan-haccp').style.display = 'none';
  };

  const addSeuilRow = () => {
    seuilCount++;
    const id = `seuil-${seuilCount}`;
    const row = document.createElement('div');
    row.className = 'seuil-form-row';
    row.id = id;
    row.innerHTML = `
      <button class="remove-btn" onclick="document.getElementById('${id}').remove()">✕</button>
      <div class="form-row-2" style="margin-bottom:8px">
        <div class="form-group">
          <label class="form-label">Étape du process</label>
          <input type="text" class="form-control seuil-etape" placeholder="Ex: Pasteurisation" />
        </div>
        <div class="form-group">
          <label class="form-label">Type de paramètre</label>
          <select class="form-control seuil-type">
            <option value="temperature">🌡️ Température</option>
            <option value="ph">🧪 pH</option>
            <option value="metal">🔩 Métaux</option>
            <option value="humidite">💧 Humidité</option>
            <option value="microbiologie">🦠 Microbiologie</option>
            <option value="visuel">👁️ Visuel</option>
          </select>
        </div>
      </div>
      <div class="form-row-2" style="margin-bottom:8px">
        <div class="form-group">
          <label class="form-label">Libellé</label>
          <input type="text" class="form-control seuil-libelle" placeholder="Ex: Température sortie pasteuriseur" />
        </div>
        <div class="form-group">
          <label class="form-label">Unité</label>
          <input type="text" class="form-control seuil-unite" placeholder="°C, pH, ppm…" style="max-width:100px" />
        </div>
      </div>
      <div class="form-row-2" style="margin-bottom:8px">
        <div class="form-group">
          <label class="form-label">Min</label>
          <input type="number" class="form-control seuil-min" step="0.1" />
        </div>
        <div class="form-group">
          <label class="form-label">Max</label>
          <input type="number" class="form-control seuil-max" step="0.1" />
        </div>
      </div>
      <div class="form-group" style="margin-bottom:8px">
        <label class="form-label">Action si mineure</label>
        <input type="text" class="form-control seuil-action-min" placeholder="Ex: Rallonger durée de chauffe" />
      </div>
      <div class="form-group" style="margin-bottom:8px">
        <label class="form-label">Action si critique 🚨</label>
        <input type="text" class="form-control seuil-action-crit" placeholder="Ex: ISOLER LE LOT — Alerter Responsable" />
      </div>
      <div class="form-row-2">
        <div class="form-group">
          <label class="form-label">Gravité</label>
          <select class="form-control seuil-gravite">
            <option value="critique">🔴 Critique</option>
            <option value="mineure">🟡 Mineure</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Email alerte</label>
          <input type="email" class="form-control seuil-email" placeholder="qualite@entreprise.dz" />
        </div>
      </div>`;
    document.getElementById('seuils-container').appendChild(row);
  };

  const sauvegarderPlan = async () => {
    const recetteId = document.getElementById('plan-recette-select').value;
    const nom       = document.getElementById('plan-nom').value;
    if (!nom) return toast('Le nom du plan est obligatoire', 'warning');

    const seuilRows = document.querySelectorAll('.seuil-form-row');
    const seuils = [];
    seuilRows.forEach(row => {
      seuils.push({
        etape_process  : row.querySelector('.seuil-etape')?.value || '',
        type_parametre : row.querySelector('.seuil-type')?.value  || 'temperature',
        libelle        : row.querySelector('.seuil-libelle')?.value || '',
        unite          : row.querySelector('.seuil-unite')?.value  || '',
        valeur_min     : parseFloat(row.querySelector('.seuil-min')?.value) || null,
        valeur_max     : parseFloat(row.querySelector('.seuil-max')?.value) || null,
        valeur_cible   : null,
        action_mineure : row.querySelector('.seuil-action-min')?.value || '',
        action_critique: row.querySelector('.seuil-action-crit')?.value || '',
        niveau_gravite : row.querySelector('.seuil-gravite')?.value || 'critique',
        email_alerte   : row.querySelector('.seuil-email')?.value || '',
      });
    });

    try {
      await api('/plans', 'POST', {
        recette_id : parseInt(recetteId) || 1,
        nom_plan   : nom,
        version    : document.getElementById('plan-version').value || '1.0',
        responsable: document.getElementById('plan-responsable').value,
        seuils,
      });
      toast('✅ Plan HACCP créé avec succès');
      document.getElementById('modal-plan-haccp').style.display = 'none';
      await loadPlans();
    } catch(e) { toast(e.message, 'error'); }
  };

  // ── CALCUL VALEUR PASTEURISATRICE ────────────────────────
  const calculerVP = async () => {
    const body = {
      temperature_C  : parseFloat(document.getElementById('vp-temp').value)  || 74,
      duree_secondes : parseFloat(document.getElementById('vp-duree').value) || 20,
      temperature_ref: parseFloat(document.getElementById('vp-tref').value)  || 72,
      z_value        : parseFloat(document.getElementById('vp-z').value)     || 8,
    };

    try {
      const res = await api('/calcul-vp', 'POST', body);
      const isOk = res.conforme_htst;
      document.getElementById('vp-result').innerHTML = `
        <div class="vp-result-card ${isOk ? 'vp-ok' : 'vp-nok'}">
          <div class="vp-valeur" style="color:${isOk?'#276749':'#c53030'}">
            VP = ${res.valeur_pasteurisatrice_s} s
          </div>
          <div style="font-size:13px;color:#718096;margin:6px 0">
            Soit ${res.valeur_pasteurisatrice_min} min · Facteur létalité : ×${res.facteur_lethalite}
          </div>
          <div style="font-size:14px;font-weight:600;margin-top:8px">${res.interpretation}</div>
          <div style="margin-top:10px;font-size:12px;color:#718096">
            HTST (15 s/72°C) : ${res.conforme_htst ? '✅' : '❌'} &nbsp;|&nbsp;
            LTLT (30 min/63°C) : ${res.conforme_ltlt ? '✅' : '❌'}
          </div>
        </div>`;

      // Graphique sensibilité T/durée
      const canvas = document.getElementById('vp-chart');
      canvas.style.display = 'block';
      if (state.vpChart) state.vpChart.destroy();
      const labels = res.courbe_sensibilite.map(d => `${d.temperature}°C`);
      const vals   = res.courbe_sensibilite.map(d => d.duree_equivalente_s);
      state.vpChart = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'Durée équivalente HTST (s)',
            data : vals,
            borderColor : '#667eea',
            backgroundColor: 'rgba(102,126,234,.1)',
            fill: true, tension: 0.4,
          }]
        },
        options: {
          plugins: { legend: { position: 'top' } },
          scales : {
            y: { title: { display: true, text: 'Durée (s)' } },
            x: { title: { display: true, text: 'Température (°C)' } },
          }
        }
      });
    } catch(e) { toast(e.message, 'error'); }
  };

  // ── CALCUL CINÉTIQUE pH ──────────────────────────────────
  const calculerPH = async () => {
    const body = {
      ph_initial    : parseFloat(document.getElementById('ph-initial').value) || 6.5,
      ph_cible      : parseFloat(document.getElementById('ph-cible').value)   || 4.3,
      temperature_C : parseFloat(document.getElementById('ph-temp').value)    || 42,
      duree_heures  : parseFloat(document.getElementById('ph-duree').value)   || 4,
      type_ferment  : document.getElementById('ph-ferment').value,
    };

    try {
      const res = await api('/calcul-ph-fermentation', 'POST', body);
      document.getElementById('ph-result').innerHTML = `
        <div class="vp-result-card ${res.conforme ? 'vp-ok' : 'vp-nok'}">
          <div class="vp-valeur" style="color:${res.conforme?'#276749':'#c53030'}">
            pH estimé = ${res.ph_actuel_estime}
          </div>
          <div style="font-size:13px;color:#718096;margin:4px 0">
            Cible : ${res.ph_cible} ± 0.3 — Ferment : ${res.type_ferment}
          </div>
          <div style="font-weight:600;margin-top:8px">${res.interpretation}</div>
          ${res.heure_atteinte_cible !== null
            ? `<div style="font-size:12px;color:#718096;margin-top:6px">
               pH cible atteint en ≈ ${res.heure_atteinte_cible} h</div>` : ''}
        </div>`;

      const canvas = document.getElementById('ph-chart');
      canvas.style.display = 'block';
      if (state.phChart) state.phChart.destroy();
      const labels = res.courbe_theorique.map(d => `${d.heure}h`);
      const vals   = res.courbe_theorique.map(d => d.ph);
      state.phChart = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label          : 'pH théorique',
            data           : vals,
            borderColor    : '#48bb78',
            backgroundColor: 'rgba(72,187,120,.1)',
            fill: true, tension: 0.4,
          }, {
            label    : 'Zone cible',
            data     : labels.map(() => body.ph_cible),
            borderColor: '#e53e3e',
            borderDash : [5, 5],
            fill: false, pointRadius: 0,
          }]
        },
        options: {
          plugins: { legend: { position: 'top' } },
          scales : {
            y: { title: { display: true, text: 'pH' }, reverse: false },
            x: { title: { display: true, text: 'Temps (h)' } },
          }
        }
      });
    } catch(e) { toast(e.message, 'error'); }
  };

  // ── API publique ─────────────────────────────────────────
  return {
    init,
    switchTab,
    onLotChange,
    onSeuilChange,
    previewConformite,
    soumettreControle,
    libererLot,
    acquitterAlerte,
    refreshIndicateurs,
    loadAlertes,
    openPlanModal,
    closePlanModal,
    addSeuilRow,
    sauvegarderPlan,
    calculerVP,
    calculerPH,
  };

})();


/* =============================================================
   INTÉGRATION dans la fonction navigateTo() existante
   Ajouter ce case :

   case 'haccp':
       document.getElementById('page-haccp').style.display = 'block';
       haccp.init();
       break;

   Et dans le nav HTML :
   <li class="nav-item" onclick="navigateTo('haccp')">
     <span class="nav-icon">🛡️</span>
     <span class="nav-text">HACCP & Sécurité</span>
   </li>
   ============================================================= */