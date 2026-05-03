/* =============================================================
   TWINOVA — MODULE 4 : OPTIMISATION ÉNERGÉTIQUE
   À coller à la fin de App.js
   Ajouter dans navigate() :
   if (pageId === 'energie') setTimeout(() => energie.init(), 50);
   ============================================================= */

const energie = (() => {

  const PRODUIT_ID = 2; // adapter si besoin
  let state = {
    tarifs       : [],
    historique   : [],
    indicateurs  : null,
    energieChart : null,
    lossChart    : null,
    carboneChart : null,
  };

  // ── Helpers ─────────────────────────────────────────
  const api = (path, method = 'GET', body = null) => {
    const token = localStorage.getItem('twinova_token');
    return fetch(`http://localhost:8000/energie${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }).then(r => r.json());
  };

  const toast = (msg, type = 'success') => {
    if (typeof showToast === 'function') { showToast(msg, type); return; }
    const el = document.createElement('div');
    const bg = type === 'success' ? '#1a8a4a' : type === 'error' ? '#d93025' : '#f59e0b';
    el.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:9999;padding:14px 20px;
      border-radius:10px;font-size:14px;font-weight:600;background:${bg};color:#fff;
      box-shadow:0 8px 24px rgba(0,0,0,.2);font-family:Rajdhani,sans-serif`;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  };

  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

  // ── INIT ────────────────────────────────────────────
  const init = async () => {
    // Pré-remplir la date d'aujourd'hui
    const dateEl = document.getElementById('e-date');
    if (dateEl) dateEl.value = new Date().toISOString().split('T')[0];

    // Pré-remplir le mois/année de l'audit
    const now = new Date();
    const moisEl = document.getElementById('audit-mois');
    const anneeEl = document.getElementById('audit-annee');
    if (moisEl) moisEl.value = now.getMonth() + 1;
    if (anneeEl) anneeEl.value = now.getFullYear();

    await Promise.all([
      chargerIndicateurs(),
      chargerHistorique(),
      chargerTarifs(),
    ]);
    initGraphique();
  };

  // ── Indicateurs KPI ──────────────────────────────────
  const chargerIndicateurs = async () => {
    try {
      const ind = await api(`/indicateurs/${PRODUIT_ID}`);
      state.indicateurs = ind;
      renderKPIs(ind);
      renderShifts(ind.comparaison_shift);
      updatePulse();
    } catch(e) { console.error('indicateurs énergie:', e); }
  };

  const renderKPIs = (ind) => {
    // Score efficacité
    const score = ind.score_efficacite || 50;
    setText('energie-score', Math.round(score));
    const ring = document.getElementById('ring-energie');
    if (ring) {
      const offset = 201 - (score / 100) * 201;
      ring.style.strokeDashoffset = offset;
      ring.style.stroke = score >= 85 ? 'var(--green)' : score >= 60 ? 'var(--yellow)' : 'var(--red)';
    }
    const scoreBadge = document.getElementById('energie-score-badge');
    if (scoreBadge) {
      scoreBadge.textContent = score >= 85 ? 'OPTIMAL' : score >= 60 ? 'ATTENTION' : 'CRITIQUE';
      scoreBadge.className = `kpi-status ${score >= 85 ? 'ok' : score >= 60 ? 'warning' : 'critical'}`;
    }
    setText('energie-score-delta', score >= 85 ? '+OK' : `${(score - 85).toFixed(0)} pts`);

    // Coût
    const cout = ind.cout_total_mois || 0;
    setText('energie-cout', cout.toLocaleString('fr-DZ') + ' DZD');
    setText('energie-economies', `Économies potentielles : ${(ind.economies_potentielles || 0).toLocaleString('fr-DZ')} DZD`);

    // EPI électricité
    const epi = ind.epi_electricite;
    setText('energie-epi', epi ? epi.toFixed(3) : '—');
    const epiDelta = epi ? ((epi - 0.15) / 0.15 * 100).toFixed(1) : null;
    const epiBadge = document.getElementById('energie-epi-badge');
    const epiEcart = document.getElementById('energie-epi-ecart');
    if (epiBadge && epi) {
      epiBadge.textContent = epi <= 0.15 ? 'OPTIMAL' : epi <= 0.20 ? 'ATTENTION' : 'CRITIQUE';
      epiBadge.className = `kpi-status ${epi <= 0.15 ? 'ok' : epi <= 0.20 ? 'warning' : 'critical'}`;
    }
    if (epiEcart && epiDelta) {
      epiEcart.textContent = `${epiDelta > 0 ? '+' : ''}${epiDelta}% vs cible`;
      epiEcart.className = `kpi-delta ${epiDelta > 0 ? 'red' : 'green'}`;
    }

    // CO2
    const co2 = ind.co2_total_kg || 0;
    setText('energie-co2', co2.toFixed(1));
    setText('energie-co2-unite', `${((co2 / Math.max(state.indicateurs?.nb_saisies || 1, 1)) * 1000).toFixed(0)} g CO₂ / unité`);
    const arbres = (co2 / 21.77).toFixed(1);
    setText('energie-co2-equiv', `🌳 Équiv. ${arbres} arbres/mois`);
  };

  const renderShifts = (shifts) => {
    const el = document.getElementById('shifts-compare');
    if (!el || !shifts) return;

    if (!shifts.epi_jour && !shifts.epi_nuit) {
      el.innerHTML = '<span style="font-size:11px">Pas encore de données multi-shifts</span>';
      return;
    }

    const ecart = shifts.ecart_pct;
    const icon  = ecart > 0 ? '🔴' : '🟢';
    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;margin-bottom:6px">
        <span>☀️ Shift jour</span>
        <strong style="font-family:var(--mono)">${shifts.epi_jour || '—'} kWh/u</strong>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:6px">
        <span>🌙 Shift nuit</span>
        <strong style="font-family:var(--mono)">${shifts.epi_nuit || '—'} kWh/u</strong>
      </div>
      ${ecart !== null ? `<div style="font-family:var(--mono);font-size:10px;color:${ecart > 0 ? 'var(--red)' : 'var(--green)'}">
        ${icon} Nuit ${ecart > 0 ? '+' : ''}${ecart}% vs jour
      </div>` : ''}
    `;
  };

  // ── Energy Pulse ─────────────────────────────────────
  const updatePulse = () => {
    const type = document.getElementById('pulse-type')?.value || 'electricite';
    const ind  = state.indicateurs;
    if (!ind) return;

    const tarif = state.tarifs.find(t => t.type_energie === type);
    const prixPlein  = tarif ? tarif.prix_unitaire : 7.5;
    const prixCreuse = state.tarifs.find(t => t.type_energie === type && t.periode === 'creuse')?.prix_unitaire || prixPlein * 0.56;

    // Consommation horaire estimée (EPI × cadence)
    const epi = ind.par_type?.[type]?.epi || 0;
    const cadenceHoraire = 125; // unités/heure (exemple)
    const consoHoraire = epi * cadenceHoraire;
    const coutHeure    = consoHoraire * prixPlein;

    // Mise à jour jauge
    const ring = document.getElementById('pulse-ring');
    const max  = type === 'electricite' ? 500 : type === 'eau' ? 2 : 50;
    const pct  = Math.min(100, (consoHoraire / max) * 100);
    if (ring) {
      ring.style.strokeDashoffset = 377 - (pct / 100) * 377;
      ring.style.stroke = pct < 50 ? '#1a8a4a' : pct < 80 ? '#f59e0b' : '#d93025';
    }
    setText('pulse-val', coutHeure.toFixed(0));
    setText('pulse-creuse', (consoHoraire * prixCreuse).toFixed(0) + ' DZD');
    setText('pulse-pointe', (consoHoraire * prixPlein * 1.4).toFixed(0) + ' DZD');
  };

  // ── Historique ───────────────────────────────────────
  const chargerHistorique = async () => {
    try {
      const data = await api(`/historique/${PRODUIT_ID}`);
      state.historique = data;
      renderHistorique(data);
    } catch(e) { console.error('historique énergie:', e); }
  };

  const renderHistorique = (saisies) => {
    const tbody = document.getElementById('energie-historique-body');
    if (!tbody) return;

    if (!saisies.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-m);padding:20px">Aucune saisie — commencez par enregistrer une consommation</td></tr>';
      return;
    }

    const typeIcons = { electricite:'⚡', eau:'💧', gaz:'🔥', fioul:'🛢', vapeur:'♨️', air_comprime:'💨' };
    tbody.innerHTML = saisies.slice(0, 15).map(s => {
      const alerteClass = s.niveau_alerte === 'critique' ? 'tag-red' :
                          s.niveau_alerte === 'attention' ? 'tag-yellow' : 'tag-green';
      const alerteLabel = s.niveau_alerte === 'critique' ? '🔴 Critique' :
                          s.niveau_alerte === 'attention' ? '⚠️ Attention' : '✅ Normal';
      return `<tr>
        <td>${new Date(s.date_saisie).toLocaleDateString('fr-DZ')}</td>
        <td>${typeIcons[s.type_energie] || ''} ${s.type_energie}</td>
        <td style="font-family:var(--mono)">${s.consommation} ${s.unite}</td>
        <td style="font-family:var(--mono)">${s.epi ? s.epi.toFixed(3) : '—'}</td>
        <td style="font-family:var(--mono)">${(s.cout_total || 0).toLocaleString('fr-DZ')} DZD</td>
        <td><span class="${alerteClass}">${alerteLabel}</span></td>
      </tr>`;
    }).join('');
  };

  // ── Preview coût ─────────────────────────────────────
  const previewCout = () => {
    const type    = document.getElementById('e-type')?.value;
    const periode = document.getElementById('e-periode')?.value;
    const conso   = parseFloat(document.getElementById('e-consommation')?.value);
    const prod    = parseInt(document.getElementById('e-production')?.value) || 0;

    const prev = document.getElementById('e-preview');
    if (!type || !conso || isNaN(conso)) { if (prev) prev.style.display = 'none'; return; }

    const tarif  = state.tarifs.find(t => t.type_energie === type && t.periode === periode) ||
                   state.tarifs.find(t => t.type_energie === type);
    const prix   = tarif ? tarif.prix_unitaire : 7.5;
    const co2fac = tarif ? tarif.facteur_co2  : 0.512;

    const cout = (conso * prix).toFixed(0);
    const epi  = prod > 0 ? (conso / prod).toFixed(4) : '—';
    const co2  = (conso * co2fac).toFixed(2);

    if (prev) prev.style.display = 'block';
    setText('prev-cout', `${parseFloat(cout).toLocaleString('fr-DZ')} DZD`);
    setText('prev-epi', epi);
    setText('prev-co2', `${co2} kg`);
  };

  // ── Saisir énergie ───────────────────────────────────
  const saisir = async () => {
    const type  = document.getElementById('e-type')?.value;
    const conso = parseFloat(document.getElementById('e-consommation')?.value);
    const date  = document.getElementById('e-date')?.value;

    if (!type || !conso || !date) {
      toast('Remplissez les champs obligatoires', 'warning'); return;
    }

    try {
      const res = await api('/saisie', 'POST', {
        produit_id        : PRODUIT_ID,
        date_saisie       : date,
        shift             : document.getElementById('e-shift')?.value || 'jour',
        type_energie      : type,
        periode_tarifaire : document.getElementById('e-periode')?.value || 'pleine',
        consommation      : conso,
        production_unites : parseInt(document.getElementById('e-production')?.value) || 0,
        operateur         : document.getElementById('e-operateur')?.value || '',
      });

      const alertIcon = res.niveau_alerte === 'critique' ? '🚨' :
                        res.niveau_alerte === 'attention' ? '⚠️' : '✅';
      toast(`${alertIcon} ${res.message}`);

      // Reset
      document.getElementById('e-consommation').value = '';
      document.getElementById('e-production').value   = '';
      document.getElementById('e-preview').style.display = 'none';

      await chargerHistorique();
      await chargerIndicateurs();
      initGraphique();

    } catch(e) { toast('Erreur lors de la saisie', 'error'); }
  };

  // ── Type change (label unité) ─────────────────────────
  const onTypeChange = () => {
    const type = document.getElementById('e-type')?.value;
    const labels = {
      electricite: '(kWh)', eau: '(m³)', gaz: '(m³)',
      fioul: '(litres)', vapeur: '(kg)', air_comprime: '(Nm³)'
    };
    setText('e-unite-label', labels[type] || '');
    previewCout();
  };

  // ── Loss Costing ─────────────────────────────────────
  const calculerLossCosting = async () => {
    const quantite   = parseFloat(document.getElementById('lc-quantite')?.value);
    const coutMatiere= parseFloat(document.getElementById('lc-cout-matiere')?.value);
    const heures     = parseFloat(document.getElementById('lc-heures')?.value) || 0;
    const taux       = parseFloat(document.getElementById('lc-taux')?.value) || 800;
    const energie_kwh= parseFloat(document.getElementById('lc-energie')?.value) || 0;
    const traitement = parseFloat(document.getElementById('lc-traitement')?.value) || 0;

    if (!quantite || !coutMatiere) {
      toast('Remplissez quantité et coût matière', 'warning'); return;
    }

    try {
      const res = await api('/loss-costing', 'POST', {
        lot_id               : 1,
        produit_id           : PRODUIT_ID,
        quantite_perdue_kg   : quantite,
        cout_matiere_kg      : coutMatiere,
        heures_operateur     : heures,
        taux_horaire         : taux,
        energie_consommee_kwh: energie_kwh,
        cout_traitement_dechet: traitement,
      });

      document.getElementById('loss-result').style.display = 'block';
      setText('loss-total-val', res.cout_total_reel.toLocaleString('fr-DZ'));
      setText('loss-interpretation', res.interpretation);

      // Graphique camembert
      const canvas = document.getElementById('loss-chart');
      if (state.lossChart) state.lossChart.destroy();
      const d = res.decomposition;
      state.lossChart = new Chart(canvas.getContext('2d'), {
        type: 'doughnut',
        data: {
          labels: ['Matières', 'Énergie', 'Main d\'œuvre', 'Amortissement', 'Traitement déchets'],
          datasets: [{
            data: [
              d.matieres_premieres.montant,
              d.energie.montant,
              d.main_oeuvre.montant,
              d.amortissement.montant,
              d.traitement_dechets.montant,
            ],
            backgroundColor: ['#d93025','#f59e0b','#0057b8','#6b46c1','#718096'],
            borderColor: '#fff', borderWidth: 3,
          }]
        },
        options: {
          responsive: true, cutout: '55%',
          plugins: {
            legend: { position: 'bottom', labels: { font:{ family:'JetBrains Mono', size:10 }, color:'var(--text-m)', boxWidth:12 } },
            tooltip: {
              callbacks: { label: ctx => ` ${ctx.label}: ${ctx.raw.toLocaleString('fr-DZ')} DZD (${d[Object.keys(d)[ctx.dataIndex]]?.pct || 0}%)` }
            }
          }
        }
      });

    } catch(e) { toast('Erreur calcul loss costing', 'error'); }
  };

  // ── Audit mensuel ────────────────────────────────────
  const genererAudit = async () => {
    const mois  = parseInt(document.getElementById('audit-mois')?.value);
    const annee = parseInt(document.getElementById('audit-annee')?.value);

    try {
      const audit = await api('/audit-mensuel', 'POST', {
        produit_id: PRODUIT_ID, mois, annee
      });

      const container = document.getElementById('audit-result');
      if (!container) return;

      const moisNoms = ['','Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
      const scoreColor = audit.score_efficacite >= 85 ? 'var(--green)' :
                         audit.score_efficacite >= 60 ? 'var(--yellow)' : 'var(--red)';

      container.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px">
          <div style="background:var(--bg-e);border-radius:var(--r);padding:16px;text-align:center;border:1px solid var(--border)">
            <div style="font-family:var(--mono);font-size:10px;color:var(--text-m)">SCORE EFFICACITÉ</div>
            <div style="font-family:var(--mono);font-size:32px;font-weight:700;color:${scoreColor}">${audit.score_efficacite}/100</div>
          </div>
          <div style="background:var(--bg-e);border-radius:var(--r);padding:16px;text-align:center;border:1px solid var(--border)">
            <div style="font-family:var(--mono);font-size:10px;color:var(--text-m)">COÛT TOTAL ÉNERGIE</div>
            <div style="font-family:var(--mono);font-size:22px;font-weight:700;color:var(--text)">${(audit.cout_total_energie||0).toLocaleString('fr-DZ')}</div>
            <div style="font-family:var(--mono);font-size:10px;color:var(--text-m)">DZD</div>
          </div>
          <div style="background:var(--bg-e);border-radius:var(--r);padding:16px;text-align:center;border:1px solid var(--border)">
            <div style="font-family:var(--mono);font-size:10px;color:var(--text-m)">EPI ÉLECTRICITÉ</div>
            <div style="font-family:var(--mono);font-size:22px;font-weight:700;color:var(--teal)">${audit.epi_electricite || '—'}</div>
            <div style="font-family:var(--mono);font-size:10px;color:var(--text-m)">kWh/unité</div>
          </div>
          <div style="background:var(--bg-e);border-radius:var(--r);padding:16px;text-align:center;border:1px solid var(--border)">
            <div style="font-family:var(--mono);font-size:10px;color:var(--green)">CO₂ TOTAL</div>
            <div style="font-family:var(--mono);font-size:22px;font-weight:700;color:var(--green)">${(audit.co2_total_kg||0).toFixed(1)}</div>
            <div style="font-family:var(--mono);font-size:10px;color:var(--text-m)">kg CO₂</div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:20px">
          <div style="background:var(--bg-e);border-radius:var(--r);padding:14px;border:1px solid var(--border)">
            <div style="font-family:var(--mono);font-size:9px;color:var(--text-m);letter-spacing:1px">⚡ ÉLECTRICITÉ</div>
            <div style="font-family:var(--mono);font-size:18px;font-weight:700;margin-top:4px">${(audit.conso_electricite||0).toFixed(1)} kWh</div>
          </div>
          <div style="background:var(--bg-e);border-radius:var(--r);padding:14px;border:1px solid var(--border)">
            <div style="font-family:var(--mono);font-size:9px;color:var(--text-m);letter-spacing:1px">💧 EAU</div>
            <div style="font-family:var(--mono);font-size:18px;font-weight:700;margin-top:4px">${(audit.conso_eau||0).toFixed(1)} m³</div>
          </div>
          <div style="background:var(--bg-e);border-radius:var(--r);padding:14px;border:1px solid var(--border)">
            <div style="font-family:var(--mono);font-size:9px;color:var(--text-m);letter-spacing:1px">🔥 GAZ</div>
            <div style="font-family:var(--mono);font-size:18px;font-weight:700;margin-top:4px">${(audit.conso_gaz||0).toFixed(1)} m³</div>
          </div>
        </div>

        <div style="background:var(--bg-e);border-radius:var(--r);padding:16px;border:1px solid var(--border)">
          <div style="font-family:var(--mono);font-size:9px;color:var(--teal);letter-spacing:1.5px;margin-bottom:12px">RECOMMANDATIONS AUTOMATIQUES</div>
          ${(audit.recommandations || []).map(r => `
            <div style="display:flex;gap:12px;padding:10px 0;border-bottom:1px solid var(--border);align-items:flex-start">
              <div style="font-size:16px">${r.gravite === 'critique' ? '🚨' : r.gravite === 'attention' ? '⚠️' : '✅'}</div>
              <div>
                <div style="font-size:13px;font-weight:600;color:var(--text)">${r.message}</div>
                <div style="font-family:var(--mono);font-size:11px;color:var(--text-m);margin-top:4px">→ ${r.action}</div>
              </div>
            </div>
          `).join('')}
        </div>

        <div style="text-align:center;margin-top:14px">
          <button class="btn-outline" onclick="energie.exporterAudit(${JSON.stringify(audit).replace(/"/g,'&quot;')})">
            📄 Exporter le rapport
          </button>
        </div>
      `;

      switchTab('audit');
    } catch(e) { toast('Aucune donnée pour cette période', 'warning'); }
  };

  // ── Bilan Carbone ─────────────────────────────────────
  const chargerCarbone = async () => {
    try {
      const data = await api(`/bilan-carbone/${PRODUIT_ID}`);
      setText('co2-total-val', data.co2_total_kg.toFixed(1));
      setText('co2-arbres', data.equivalents.arbres_a_planter);
      setText('co2-km', data.equivalents.km_en_voiture.toLocaleString('fr-DZ'));
      setText('co2-objectif', data.objectif_reduction.message);

      // Graphique répartition
      const canvas = document.getElementById('carbone-chart');
      if (state.carboneChart) state.carboneChart.destroy();
      const types  = Object.keys(data.par_type_energie);
      const valeurs= Object.values(data.par_type_energie);
      const icons  = { electricite:'⚡', eau:'💧', gaz:'🔥', fioul:'🛢', vapeur:'♨️', air_comprime:'💨' };

      state.carboneChart = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
          labels: types.map(t => `${icons[t]||''} ${t}`),
          datasets: [{
            label: 'kg CO₂',
            data: valeurs,
            backgroundColor: ['rgba(0,87,184,.7)','rgba(26,138,74,.7)','rgba(234,108,0,.7)','rgba(107,70,193,.7)'],
            borderRadius: 6,
          }]
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false } },
          scales: {
            y: { grid:{color:'var(--bg-h)'}, ticks:{font:{family:'JetBrains Mono',size:10}}, title:{display:true,text:'kg CO₂'} },
            x: { grid:{display:false}, ticks:{font:{family:'JetBrains Mono',size:10}} }
          }
        }
      });

    } catch(e) { toast('Calcul bilan carbone en cours…', 'warning'); }
  };

  // ── Tarifs ───────────────────────────────────────────
  const chargerTarifs = async () => {
    try {
      state.tarifs = await api(`/tarifs/${PRODUIT_ID}`);
      renderTarifs();
    } catch(e) {}
  };

  const renderTarifs = () => {
    const el = document.getElementById('tarifs-list');
    if (!el || !state.tarifs.length) return;
    const icons = { electricite:'⚡', eau:'💧', gaz:'🔥', fioul:'🛢' };
    el.innerHTML = `
      <div style="font-family:var(--mono);font-size:9px;color:var(--text-m);letter-spacing:1px;margin-bottom:8px">TARIFS CONFIGURÉS</div>
      ${state.tarifs.map(t => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--bg-e);border-radius:var(--r);margin-bottom:6px;border:1px solid var(--border)">
          <span>${icons[t.type_energie]||''} ${t.type_energie} (${t.periode})</span>
          <span style="font-family:var(--mono);font-weight:700;color:var(--teal)">${t.prix_unitaire} DZD/${t.unite}</span>
        </div>
      `).join('')}
    `;
  };

  const sauvegarderTarif = async () => {
    const type   = document.getElementById('t-type')?.value;
    const periode= document.getElementById('t-periode')?.value;
    const prix   = parseFloat(document.getElementById('t-prix')?.value);
    const co2    = parseFloat(document.getElementById('t-co2')?.value) || 0.512;

    if (!prix) { toast('Entrez un prix', 'warning'); return; }

    try {
      await api('/tarifs', 'POST', {
        produit_id: PRODUIT_ID, type_energie: type, periode,
        prix_unitaire: prix, facteur_co2: co2, unite: type === 'eau' ? 'm3' : 'kWh',
      });
      toast('✅ Tarif enregistré');
      await chargerTarifs();
    } catch(e) { toast('Erreur', 'error'); }
  };

  const sauvegarderSeuil = async () => {
    const type    = document.getElementById('s-type')?.value;
    const cible   = parseFloat(document.getElementById('s-cible')?.value);
    const alerte  = parseFloat(document.getElementById('s-alerte')?.value);
    const critique= parseFloat(document.getElementById('s-critique')?.value);

    if (!cible || !alerte || !critique) { toast('Remplissez les 3 seuils', 'warning'); return; }

    try {
      await api('/seuils', 'POST', {
        produit_id: PRODUIT_ID, type_energie: type,
        epi_cible: cible, epi_alerte: alerte, epi_critique: critique,
      });
      toast('✅ Seuils enregistrés');
    } catch(e) { toast('Erreur', 'error'); }
  };

  // ── Graphique Productivité vs Énergie ─────────────────
  const initGraphique = () => {
    const canvas = document.getElementById('energie-chart');
    if (!canvas) return;
    if (state.energieChart) state.energieChart.destroy();

    const saisies = state.historique.filter(s => s.type_energie === 'electricite').slice(0, 14).reverse();
    if (!saisies.length) return;

    const labels = saisies.map(s => new Date(s.date_saisie).toLocaleDateString('fr-DZ', { day:'2-digit', month:'short' }));
    const epis   = saisies.map(s => s.epi || 0);
    const prods  = saisies.map(s => s.production_unites || 0);

    state.energieChart = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'EPI (kWh/unité)',
            data: epis, yAxisID: 'y',
            borderColor: '#d93025', backgroundColor: 'rgba(217,48,37,.08)',
            borderWidth: 2, pointRadius: 4, tension: 0.4, fill: true,
          },
          {
            label: 'Production (unités)',
            data: prods, yAxisID: 'y1',
            borderColor: '#0057b8', backgroundColor: 'rgba(0,87,184,.06)',
            borderWidth: 2, pointRadius: 4, tension: 0.4, fill: false,
            borderDash: [5, 3],
          }
        ]
      },
      options: {
        responsive: true,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { labels: { font:{ family:'JetBrains Mono', size:10 }, color:'var(--text-m)' } }
        },
        scales: {
          x:  { grid:{color:'var(--bg-h)'}, ticks:{font:{family:'JetBrains Mono',size:9}} },
          y:  { position:'left',  title:{display:true,text:'EPI kWh/u'}, grid:{color:'var(--bg-h)'}, ticks:{font:{family:'JetBrains Mono',size:9}} },
          y1: { position:'right', title:{display:true,text:'Production'}, grid:{display:false}, ticks:{font:{family:'JetBrains Mono',size:9}} },
        }
      }
    });
  };

  const setGraphPeriod = (period, btn) => {
    document.querySelectorAll('.period-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    initGraphique();
  };

  // ── Onglets ──────────────────────────────────────────
  const switchTab = (tab) => {
    document.querySelectorAll('[data-etab]').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.etab').forEach(c => c.style.display = 'none');
    const btn = document.querySelector(`[data-etab="${tab}"]`);
    const cnt = document.getElementById(`etab-${tab}`);
    if (btn) btn.classList.add('active');
    if (cnt) cnt.style.display = 'block';
    if (tab === 'carbone') chargerCarbone();
  };

  // ── Export audit ─────────────────────────────────────
  const exporterAudit = (audit) => {
    const moisNoms = ['','Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
    const contenu = [
      `AUDIT ÉNERGÉTIQUE — TWINOVA`,
      `════════════════════════════════`,
      `Période   : ${moisNoms[audit.mois]} ${audit.annee}`,
      `Score     : ${audit.score_efficacite}/100`,
      `─────────────────────────────────`,
      `⚡ Électricité  : ${audit.conso_electricite || 0} kWh`,
      `💧 Eau          : ${audit.conso_eau || 0} m³`,
      `🔥 Gaz          : ${audit.conso_gaz || 0} m³`,
      `─────────────────────────────────`,
      `Coût total      : ${(audit.cout_total_energie || 0).toLocaleString('fr-DZ')} DZD`,
      `Production      : ${audit.production_totale} unités`,
      `EPI Élec        : ${audit.epi_electricite || '—'} kWh/unité`,
      `CO₂ total       : ${audit.co2_total_kg || 0} kg`,
      `─────────────────────────────────`,
      `RECOMMANDATIONS :`,
      ...(audit.recommandations || []).map(r => `• ${r.message}\n  → ${r.action}`),
      ``,
      `Généré par TWINOVA — ${new Date().toLocaleString('fr-DZ')}`,
    ].join('\n');

    const blob = new Blob([contenu], { type: 'text/plain; charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `Audit_Energie_${moisNoms[audit.mois]}_${audit.annee}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const refresh = async () => {
    await chargerIndicateurs();
    await chargerHistorique();
    await chargerTarifs();
    initGraphique();
    toast('✅ Données actualisées');
  };

  return {
    init, refresh, saisir, previewCout, onTypeChange, updatePulse,
    switchTab, setGraphPeriod, calculerLossCosting, genererAudit,
    chargerCarbone, sauvegarderTarif, sauvegarderSeuil, exporterAudit,
  };

})();

/* ── Ajouter dans navigate() de App.js :
   if (pageId === 'energie') setTimeout(() => energie.init(), 50);
   ── */