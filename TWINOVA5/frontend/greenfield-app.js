/* =============================================================
   TWINOVA — MODULE 7 : SIMULATION GREENFIELD
   À coller à la fin de App.js

   Dans navigate() ajouter :
   if (pageId === 'greenfield') {
       document.getElementById('page-greenfield').style.display = 'block';
       setTimeout(() => greenfield.init(), 50);
   }

   Dans pageTitles ajouter :
   greenfield: 'Simulation Greenfield',

   Dans la sidebar ajouter :
   <a href="#" class="nav-item" data-page="greenfield">
     <svg class="nav-icon" viewBox="0 0 20 20"><path d="M3 18V9l7-7 7 7v9H13v-5H7v5H3z" fill="currentColor"/></svg>
     Simulation Greenfield
   </a>
   ============================================================= */

const greenfield = (() => {

  let state = {
    machines: [],         // Catalogue complet
    ligne: [],            // Machines sélectionnées (objets)
    projetId: null,
    resultats: null,
    chart3ans: null,
  };

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const api = (path, method = 'GET', body = null) => {
    const token = localStorage.getItem('twinova_token');
    return fetch(`http://localhost:8000/greenfield${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
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

  const fmt = n => n != null ? Math.round(n).toLocaleString('fr-DZ') : '—';
  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

  // ── INIT ─────────────────────────────────────────────────────────────────────
  const init = async () => {
    await chargerMachines();
    previewRapide();
  };

  // ── Charger catalogue machines ────────────────────────────────────────────────
  const chargerMachines = async () => {
    try {
      const secteur = document.getElementById('gf-secteur')?.value || 'Laiterie';
      state.machines = await api(`/machines?secteur=${encodeURIComponent(secteur)}`);
      renderBibliotheque();
    } catch(e) { console.error('machines:', e); }
  };

  // ── Rendu bibliothèque ────────────────────────────────────────────────────────
  const renderBibliotheque = () => {
    const container = document.getElementById('gf-bibliotheque');
    if (!container) return;

    const filtrecat = document.getElementById('gf-filtre-cat')?.value || '';
    let machines = state.machines;
    if (filtrecat) machines = machines.filter(m => m.categorie === filtrecat);

    if (!machines.length) {
      container.innerHTML = '<div style="color:var(--text-m);font-family:var(--mono);font-size:11px;padding:20px;text-align:center">Aucune machine pour ce secteur</div>';
      return;
    }

    // Grouper par catégorie
    const cats = { reception: '🏗️ Réception', transformation: '⚙️ Transformation',
                   conditionnement: '📦 Conditionnement', stockage: '❄️ Stockage', utilites: '💨 Utilités' };
    const grouped = {};
    machines.forEach(m => {
      if (!grouped[m.categorie]) grouped[m.categorie] = [];
      grouped[m.categorie].push(m);
    });

    container.innerHTML = Object.entries(grouped).map(([cat, ms]) => `
      <div style="margin-bottom:6px">
        <div style="font-family:var(--mono);font-size:9px;color:var(--text-d);letter-spacing:1px;margin-bottom:4px;padding:0 2px">
          ${cats[cat] || cat}
        </div>
        ${ms.map(m => `
          <div class="gf-machine-card" draggable="true"
            ondragstart="greenfield.dragStart(event, ${m.id})"
            style="margin-bottom:5px">
            <div class="gf-machine-icon">${m.icon}</div>
            <div class="gf-machine-info">
              <div class="gf-machine-nom" title="${m.description}">${m.nom}</div>
              <div class="gf-machine-prix">${fmt(m.prix_dzd)} DZD · ${m.debit_kg_h > 0 ? m.debit_kg_h+' kg/h' : m.puissance_kw+' kW'}</div>
            </div>
            <button type="button" class="gf-machine-add" onclick="greenfield.ajouterMachine(${m.id})" title="Ajouter à la ligne">+</button>
          </div>
        `).join('')}
      </div>
    `).join('');
  };

  // ── Drag & Drop ──────────────────────────────────────────────────────────────
  const dragStart = (event, machineId) => {
    event.dataTransfer.setData('machineId', machineId);
  };

  const drop = (event) => {
    event.preventDefault();
    const id = parseInt(event.dataTransfer.getData('machineId'));
    ajouterMachine(id);
    const zone = document.getElementById('gf-drop-zone');
    if (zone) zone.style.background = '';
  };

  // ── Ajouter machine à la ligne ────────────────────────────────────────────────
  const ajouterMachine = (machineId) => {
    const machine = state.machines.find(m => m.id === machineId);
    if (!machine) return;
    state.ligne.push({ ...machine });
    renderLigne();
    updateResumeLigne();
    previewRapide();
  };

  // ── Supprimer machine de la ligne ─────────────────────────────────────────────
  const supprimerMachine = (index) => {
    state.ligne.splice(index, 1);
    renderLigne();
    updateResumeLigne();
    previewRapide();
  };

  // ── Vider la ligne ───────────────────────────────────────────────────────────
  const viderLigne = () => {
    state.ligne = [];
    renderLigne();
    updateResumeLigne();
  };

  // ── Rendu ligne de production ─────────────────────────────────────────────────
  const renderLigne = () => {
    const zone = document.getElementById('gf-drop-zone');
    if (!zone) return;

    const hint = document.getElementById('gf-drop-hint');

    if (!state.ligne.length) {
      zone.innerHTML = `<div id="gf-drop-hint" style="color:var(--text-d);font-family:var(--mono);font-size:11px;text-align:center;padding:40px 0">
        👈 Glissez des machines ici<br>pour construire votre ligne
      </div>`;
      return;
    }

    zone.innerHTML = state.ligne.map((m, i) => `
      ${i > 0 ? '<div class="gf-arrow">↓</div>' : ''}
      <div class="gf-ligne-machine">
        <div style="font-size:18px">${m.icon}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:12px">${m.nom}</div>
          <div style="display:flex;gap:6px;margin-top:2px">
            <span class="cat-badge cat-${m.categorie}">${m.categorie}</span>
            <span style="font-family:var(--mono);font-size:10px;color:var(--teal)">${fmt(m.prix_dzd)} DZD</span>
          </div>
        </div>
        <button type="button" class="gf-remove" onclick="greenfield.supprimerMachine(${i})">✕</button>
      </div>
    `).join('');
  };

  // ── Résumé ligne ──────────────────────────────────────────────────────────────
  const updateResumeLigne = () => {
    const resume = document.getElementById('gf-ligne-resume');
    const investDiv = document.getElementById('gf-invest-total');
    const investVal = document.getElementById('gf-invest-val');
    if (!resume) return;

    if (!state.ligne.length) {
      resume.textContent = 'Glissez des machines dans le configurateur →';
      if (investDiv) investDiv.style.display = 'none';
      return;
    }

    const total = state.ligne.reduce((s, m) => s + m.prix_dzd, 0);
    const puissance = state.ligne.reduce((s, m) => s + m.puissance_kw, 0);
    const operateurs = state.ligne.reduce((s, m) => s + m.nb_operateurs, 0);

    resume.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:6px">
        <div style="display:flex;justify-content:space-between"><span>${state.ligne.length} machines</span><span style="color:var(--teal)">${puissance} kW</span></div>
        <div style="display:flex;justify-content:space-between"><span>Opérateurs</span><span style="color:var(--text)">${operateurs}</span></div>
      </div>
    `;

    if (investDiv) investDiv.style.display = 'block';
    if (investVal) investVal.textContent = fmt(total) + ' DZD';
  };

  // ── Preview rapide marge ──────────────────────────────────────────────────────
  const previewRapide = () => {
    const pv = parseFloat(document.getElementById('gf-prix-vente')?.value) || 0;
    const mp = parseFloat(document.getElementById('gf-cout-mp')?.value) || 0;
    const prevDiv = document.getElementById('gf-preview-marge');
    const margeVal = document.getElementById('gf-marge-val');
    const margePct = document.getElementById('gf-marge-pct');

    if (pv > 0 && mp > 0) {
      const marge = pv - mp;
      const pct = (marge / pv * 100).toFixed(1);
      if (prevDiv) prevDiv.style.display = 'block';
      if (margeVal) margeVal.textContent = `${fmt(marge)} DZD/kg`;
      if (margePct) {
        margePct.textContent = `Marge brute : ${pct}%`;
        margePct.style.color = pct >= 30 ? 'var(--green)' : pct >= 15 ? 'var(--yellow)' : 'var(--red)';
      }
    }
  };

  // ── Filtrer machines ──────────────────────────────────────────────────────────
  const filtrerMachines = async () => {
    await chargerMachines();
  };

  // ── Switch onglets ────────────────────────────────────────────────────────────
  const switchTab = (tab) => {
    document.querySelectorAll('[data-gftab]').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.gftab').forEach(c => c.style.display = 'none');
    const btn = document.querySelector(`[data-gftab="${tab}"]`);
    const cnt = document.getElementById(`gftab-${tab}`);
    if (btn) btn.classList.add('active');
    if (cnt) cnt.style.display = 'block';
  };

  // ── Lancer simulation ─────────────────────────────────────────────────────────
  const simuler = async () => {
    if (!state.ligne.length) { toast('Ajoutez au moins une machine à votre ligne', 'warning'); return; }

    const nom = document.getElementById('gf-nom')?.value || 'Mon Projet';
    const secteur = document.getElementById('gf-secteur')?.value || 'Laiterie';

    const investMachines = state.ligne.reduce((s, m) => s + m.prix_dzd, 0);

    const body = {
      utilisateur_id: 1,
      nom_projet: nom,
      secteur,
      localisation: document.getElementById('gf-localisation')?.value || 'Alger',
      prix_vente_kg: parseFloat(document.getElementById('gf-prix-vente')?.value) || 250,
      cout_mp_kg: parseFloat(document.getElementById('gf-cout-mp')?.value) || 80,
      cout_mdo_mois: parseFloat(document.getElementById('gf-mdo')?.value) || 500000,
      cout_energie_kwh: 7.5,
      loyer_mois: parseFloat(document.getElementById('gf-loyer')?.value) || 150000,
      autres_charges: 50000,
      production_cible_kg_j: parseFloat(document.getElementById('gf-prod-cible')?.value) || 1000,
      jours_travail_mois: 22,
      investissement_total: investMachines * 1.4,
      apport_propre_pct: parseFloat(document.getElementById('gf-apport')?.value) || 30,
      taux_interet: parseFloat(document.getElementById('gf-taux')?.value) || 6,
      duree_credit_ans: parseInt(document.getElementById('gf-duree')?.value) || 5,
      ligne_configuration: state.ligne.map(m => m.id),
    };

    try {
      // Créer projet
      const { projet_id } = await api('/projets', 'POST', body);
      state.projetId = projet_id;

      toast('⏳ Simulation en cours…', 'warning');

      // Lancer simulation
      const res = await api(`/simuler/${projet_id}`, 'POST');
      state.resultats = res;

      renderKPIs(res);
      renderResultats(res);
      renderPlan3ans(res.plan_3ans);
      renderDimensionnement(res);

      switchTab('resultats');
      toast('✅ Simulation terminée !');
    } catch(e) {
      toast('Erreur simulation', 'error');
      console.error(e);
    }
  };

  // ── KPIs ──────────────────────────────────────────────────────────────────────
  const renderKPIs = (res) => {
    const f = res.financier;
    const d = res.dimensionnement;

    setText('gf-roi', f.roi_pct.toFixed(1));
    const roiBadge = document.getElementById('gf-roi-badge');
    if (roiBadge) {
      roiBadge.textContent = f.roi_pct >= 25 ? 'EXCELLENT' : f.roi_pct >= 15 ? 'BON' : f.roi_pct >= 8 ? 'CORRECT' : 'FAIBLE';
      roiBadge.className = `kpi-status ${f.roi_pct >= 15 ? 'ok' : f.roi_pct >= 8 ? 'warning' : 'critical'}`;
    }

    setText('gf-payback', f.payback_mois < 999 ? f.payback_mois : '> 5 ans');
    setText('gf-ca', fmt(f.ca_mensuel) + ' DZD');
    setText('gf-van', fmt(f.van_5ans) + ' DZD');
    const vanLabel = document.getElementById('gf-van-label');
    if (vanLabel) vanLabel.style.color = f.van_5ans >= 0 ? 'var(--green)' : 'var(--red)';
    setText('gf-surface', d.surface_totale_m2);
    setText('gf-operateurs', `${d.nb_operateurs} opérateurs · ${d.puissance_totale_kw} kW`);
  };

  // ── Résultats financiers ──────────────────────────────────────────────────────
  const renderResultats = (res) => {
    const container = document.getElementById('gf-resultats-content');
    if (!container) return;
    const f = res.financier;
    const cd = res.couts_detail;

    const rentable = f.benefice_net > 0;
    container.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px">
        ${[
          ['CA Mensuel', fmt(f.ca_mensuel) + ' DZD', 'var(--teal)'],
          ['Coûts Totaux', fmt(f.cout_total) + ' DZD', 'var(--red)'],
          ['Bénéfice Net', fmt(f.benefice_net) + ' DZD', rentable ? 'var(--green)' : 'var(--red)'],
          ['EBITDA', fmt(f.ebitda) + ' DZD', f.ebitda >= 0 ? 'var(--teal)' : 'var(--red)'],
          ['Point Mort', fmt(f.point_mort_kg_mois) + ' kg/mois', 'var(--yellow)'],
          ['Mensualité Crédit', fmt(f.mensualite_credit) + ' DZD', 'var(--text-m)'],
        ].map(([label, val, color]) => `
          <div style="background:var(--bg-e);border-radius:var(--r);padding:14px;border:1px solid var(--border)">
            <div style="font-family:var(--mono);font-size:9px;color:var(--text-m);margin-bottom:4px">${label}</div>
            <div style="font-family:var(--mono);font-size:16px;font-weight:700;color:${color}">${val}</div>
          </div>
        `).join('')}
      </div>

      <!-- Décomposition coûts -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div>
          <div style="font-family:var(--mono);font-size:10px;color:var(--text-m);letter-spacing:1px;margin-bottom:10px">DÉCOMPOSITION DES COÛTS/MOIS</div>
          ${Object.entries(cd).map(([k, v]) => {
            const labels = { matieres_premieres:'🌾 Matières Premières', main_oeuvre:'👷 Main d\'Œuvre',
              energie:'⚡ Énergie', loyer:'🏭 Loyer', autres:'📦 Autres Charges', credit:'🏦 Crédit' };
            const total = Object.values(cd).reduce((s, x) => s + x, 0);
            const pct = total > 0 ? (v / total * 100).toFixed(1) : 0;
            return `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--border)">
                <span style="font-family:var(--mono);font-size:11px">${labels[k] || k}</span>
                <span style="font-family:var(--mono);font-size:11px;font-weight:700">${fmt(v)} <span style="color:var(--text-d)">(${pct}%)</span></span>
              </div>`;
          }).join('')}
        </div>

        <!-- Indicateurs clés -->
        <div>
          <div style="font-family:var(--mono);font-size:10px;color:var(--text-m);letter-spacing:1px;margin-bottom:10px">INDICATEURS FINANCIERS</div>
          ${[
            ['ROI Annuel', f.roi_pct.toFixed(1) + '%', f.roi_pct >= 15 ? 'var(--green)' : 'var(--red)'],
            ['VAN 5 ans', fmt(f.van_5ans) + ' DZD', f.van_5ans >= 0 ? 'var(--green)' : 'var(--red)'],
            ['TRI estimé', f.tri_pct.toFixed(1) + '%', f.tri_pct >= 12 ? 'var(--green)' : 'var(--yellow)'],
            ['Payback', f.payback_mois < 999 ? f.payback_mois + ' mois' : '> 5 ans', f.payback_mois <= 36 ? 'var(--green)' : 'var(--red)'],
            ['Investissement total', fmt(f.invest_total) + ' DZD', 'var(--text)'],
            ['dont machines', fmt(f.invest_machines) + ' DZD', 'var(--text-m)'],
          ].map(([label, val, color]) => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--border)">
              <span style="font-family:var(--mono);font-size:11px">${label}</span>
              <span style="font-family:var(--mono);font-size:13px;font-weight:700;color:${color}">${val}</span>
            </div>
          `).join('')}

          <!-- Verdict -->
          <div style="margin-top:14px;padding:14px;background:${rentable ? 'rgba(26,138,74,.06)' : 'rgba(217,48,37,.06)'};
               border:1px solid ${rentable ? 'rgba(26,138,74,.2)' : 'rgba(217,48,37,.2)'};border-radius:var(--r);text-align:center">
            <div style="font-size:24px;margin-bottom:6px">${rentable ? '✅' : '⚠️'}</div>
            <div style="font-weight:700;font-size:13px;color:${rentable ? 'var(--green)' : 'var(--red)'}">
              ${rentable ? 'PROJET RENTABLE' : 'PROJET À RISQUE'}
            </div>
            <div style="font-family:var(--mono);font-size:10px;color:var(--text-m);margin-top:4px">
              ${rentable
                ? `Rentabilité atteinte en ${f.payback_mois} mois`
                : 'Révisez les coûts ou augmentez le prix de vente'}
            </div>
          </div>
        </div>
      </div>
    `;
  };

  // ── Plan 3 ans ────────────────────────────────────────────────────────────────
  const renderPlan3ans = (plan) => {
    const canvas = document.getElementById('gf-chart-3ans');
    if (!canvas || !plan?.length) return;

    if (state.chart3ans) state.chart3ans.destroy();

    const labels = plan.map(p => `M${p.mois}`);
    const ca = plan.map(p => p.ca);
    const couts = plan.map(p => p.couts);
    const cumul = plan.map(p => p.cumul);

    state.chart3ans = new Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'CA',
            data: ca,
            backgroundColor: 'rgba(0,255,209,.3)',
            borderColor: 'var(--teal)',
            borderWidth: 1,
            yAxisID: 'y',
          },
          {
            label: 'Coûts',
            data: couts,
            backgroundColor: 'rgba(217,48,37,.2)',
            borderColor: 'rgba(217,48,37,.5)',
            borderWidth: 1,
            yAxisID: 'y',
          },
          {
            label: 'Cumul bénéfice',
            data: cumul,
            type: 'line',
            borderColor: '#0057b8',
            backgroundColor: 'rgba(0,87,184,.05)',
            fill: true,
            borderWidth: 2,
            pointRadius: 0,
            yAxisID: 'y1',
            tension: 0.4,
          }
        ]
      },
      options: {
        responsive: true,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { labels: { font:{family:'JetBrains Mono',size:10}, color:'var(--text-m)' } },
          tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmt(ctx.raw)} DZD` } }
        },
        scales: {
          x: { grid:{color:'var(--bg-h)'}, ticks:{font:{family:'JetBrains Mono',size:8}} },
          y: { position:'left', grid:{color:'var(--bg-h)'}, ticks:{font:{family:'JetBrains Mono',size:9}, callback: v => fmt(v)} },
          y1: { position:'right', grid:{display:false}, ticks:{font:{family:'JetBrains Mono',size:9}, callback: v => fmt(v)} }
        }
      }
    });

    // Table résumé annuel
    const table = document.getElementById('gf-plan-table');
    if (table) {
      const annees = [plan.slice(0,12), plan.slice(12,24), plan.slice(24,36)];
      table.innerHTML = `
        <table class="data-table">
          <thead><tr><th>Année</th><th>CA Total</th><th>Coûts</th><th>Bénéfice</th><th>Statut</th></tr></thead>
          <tbody>
            ${annees.map((mois, i) => {
              const caTot = mois.reduce((s,m) => s+m.ca, 0);
              const coutTot = mois.reduce((s,m) => s+m.couts, 0);
              const benef = caTot - coutTot;
              return `<tr>
                <td style="font-weight:700">Année ${i+1}</td>
                <td style="font-family:var(--mono);color:var(--teal)">${fmt(caTot)} DZD</td>
                <td style="font-family:var(--mono);color:var(--red)">${fmt(coutTot)} DZD</td>
                <td style="font-family:var(--mono);font-weight:700;color:${benef>=0?'var(--green)':'var(--red)'}">${fmt(benef)} DZD</td>
                <td><span class="${benef>=0?'tag-green':'tag-red'}">${benef>=0?'✅ Bénéficiaire':'⚠️ Déficit'}</span></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      `;
    }
  };

  // ── Dimensionnement ───────────────────────────────────────────────────────────
  const renderDimensionnement = (res) => {
    const container = document.getElementById('gf-dimensionnement-content');
    if (!container) return;
    const d = res.dimensionnement;
    const machines = res.machines;

    container.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px">
        ${[
          ['Surface totale', d.surface_totale_m2 + ' m²', '📐'],
          ['Puissance installée', d.puissance_totale_kw + ' kW', '⚡'],
          ['Opérateurs', d.nb_operateurs + ' personnes', '👷'],
          ['Stock en-cours', d.stock_encours_kg + ' kg', '📦'],
        ].map(([label, val, icon]) => `
          <div style="background:var(--bg-e);border-radius:var(--r);padding:16px;text-align:center;border:1px solid var(--border)">
            <div style="font-size:24px;margin-bottom:8px">${icon}</div>
            <div style="font-family:var(--mono);font-size:9px;color:var(--text-m);margin-bottom:4px">${label}</div>
            <div style="font-family:var(--mono);font-size:20px;font-weight:700;color:var(--teal)">${val}</div>
          </div>
        `).join('')}
      </div>

      <!-- Loi de Little -->
      <div style="background:rgba(0,87,184,.06);border:1px solid rgba(0,87,184,.2);border-radius:var(--r);padding:16px;margin-bottom:16px">
        <div style="font-family:var(--mono);font-size:10px;color:#0057b8;letter-spacing:1.5px;margin-bottom:8px">📐 LOI DE LITTLE — Stock en-cours = Débit × Temps de traversée</div>
        <div style="font-family:var(--mono);font-size:12px;color:var(--text-m)">
          Stock en-cours estimé : <strong style="color:var(--text)">${d.stock_encours_kg} kg</strong> dans la ligne de production<br>
          Surface de stockage tampon recommandée : <strong>${Math.round(d.stock_encours_kg * 0.002)} m²</strong>
        </div>
      </div>

      <!-- Machines sélectionnées -->
      <div style="font-family:var(--mono);font-size:10px;color:var(--text-m);letter-spacing:1px;margin-bottom:12px">MACHINES CONFIGURÉES</div>
      <table class="data-table">
        <thead><tr><th>Machine</th><th>Catégorie</th><th>Puissance</th><th>Prix</th></tr></thead>
        <tbody>
          ${machines.map(m => `
            <tr>
              <td>${m.icon} ${m.nom}</td>
              <td><span class="cat-badge cat-${m.categorie}">${m.categorie}</span></td>
              <td style="font-family:var(--mono)">${m.puissance} kW</td>
              <td style="font-family:var(--mono);color:var(--teal)">${fmt(m.prix)} DZD</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  };

  // ── Nouveau projet ────────────────────────────────────────────────────────────
  const nouveauProjet = () => {
    state.ligne = [];
    state.projetId = null;
    state.resultats = null;
    renderLigne();
    updateResumeLigne();
    // Reset KPIs
    ['gf-roi','gf-payback','gf-ca','gf-van','gf-surface'].forEach(id => setText(id, '—'));
    switchTab('configurateur');
    toast('Nouveau projet créé', 'success');
  };

  // ── Export Business Plan ──────────────────────────────────────────────────────
  const exporterBusinessPlan = () => {
    if (!state.resultats) { toast('Lancez d\'abord une simulation', 'warning'); return; }
    const res = state.resultats;
    const f = res.financier;
    const d = res.dimensionnement;
    const nom = document.getElementById('gf-nom')?.value || 'Mon Projet';
    const secteur = document.getElementById('gf-secteur')?.value || '';

    const contenu = [
      `╔════════════════════════════════════════════════════════╗`,
      `║          BUSINESS PLAN INDUSTRIEL — TWINOVA            ║`,
      `╚════════════════════════════════════════════════════════╝`,
      ``,
      `PROJET       : ${nom}`,
      `SECTEUR      : ${secteur}`,
      `DATE         : ${new Date().toLocaleDateString('fr-DZ', {day:'2-digit',month:'long',year:'numeric'})}`,
      ``,
      `════════════════════════════════════════════════════════`,
      `1. RÉSUMÉ EXÉCUTIF`,
      `════════════════════════════════════════════════════════`,
      ``,
      `Investissement total    : ${fmt(f.invest_total)} DZD`,
      `  dont équipements      : ${fmt(f.invest_machines)} DZD`,
      `  dont génie civil/divers: ${fmt(f.invest_total - f.invest_machines)} DZD`,
      ``,
      `Mensualité crédit       : ${fmt(f.mensualite_credit)} DZD/mois`,
      ``,
      `════════════════════════════════════════════════════════`,
      `2. PRÉVISIONS FINANCIÈRES MENSUELLES`,
      `════════════════════════════════════════════════════════`,
      ``,
      `Chiffre d'affaires      : ${fmt(f.ca_mensuel)} DZD/mois`,
      `Coût de production      : ${fmt(f.cout_total)} DZD/mois`,
      `Marge brute             : ${fmt(f.marge_brute)} DZD/mois`,
      `EBITDA                  : ${fmt(f.ebitda)} DZD/mois`,
      `Bénéfice net            : ${fmt(f.benefice_net)} DZD/mois`,
      ``,
      `════════════════════════════════════════════════════════`,
      `3. INDICATEURS DE RENTABILITÉ`,
      `════════════════════════════════════════════════════════`,
      ``,
      `ROI annuel              : ${f.roi_pct.toFixed(1)}%`,
      `VAN sur 5 ans           : ${fmt(f.van_5ans)} DZD`,
      `TRI estimé              : ${f.tri_pct.toFixed(1)}%`,
      `Payback                 : ${f.payback_mois < 999 ? f.payback_mois + ' mois' : '> 5 ans'}`,
      `Point mort              : ${fmt(f.point_mort_kg_mois)} kg/mois`,
      ``,
      `════════════════════════════════════════════════════════`,
      `4. DIMENSIONNEMENT TECHNIQUE`,
      `════════════════════════════════════════════════════════`,
      ``,
      `Surface totale requise  : ${d.surface_totale_m2} m²`,
      `Puissance installée     : ${d.puissance_totale_kw} kW`,
      `Nombre d'opérateurs     : ${d.nb_operateurs} personnes`,
      `Stock en-cours          : ${d.stock_encours_kg} kg`,
      ``,
      `════════════════════════════════════════════════════════`,
      `5. ÉQUIPEMENTS RETENUS`,
      `════════════════════════════════════════════════════════`,
      ``,
      ...res.machines.map(m => `  ${m.icon} ${m.nom} — ${fmt(m.prix)} DZD — ${m.puissance} kW`),
      ``,
      `════════════════════════════════════════════════════════`,
      ``,
      `Document généré par TWINOVA — Digital Model Industriel`,
      `Simulation Greenfield — Données prévisionnelles`,
      `${new Date().toLocaleString('fr-DZ')}`,
    ].join('\n');

    const blob = new Blob([contenu], { type: 'text/plain; charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `BusinessPlan_${nom.replace(/\s+/g,'_')}_${new Date().getFullYear()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast('✅ Business Plan téléchargé !');
  };

  return {
    init, filtrerMachines, dragStart, drop,
    ajouterMachine, supprimerMachine, viderLigne,
    switchTab, simuler, nouveauProjet,
    exporterBusinessPlan, previewRapide,
  };

})();

/* Ajouter dans navigate() :
   if (pageId === 'greenfield') {
       document.getElementById('page-greenfield').style.display = 'block';
       setTimeout(() => greenfield.init(), 50);
   }
*/