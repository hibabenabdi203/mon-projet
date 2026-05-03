/* =============================================================
   TWINOVA — MODULE 6 : BENCHMARKING SECTORIEL
   ✅ Aucun form reload — tous les boutons type="button"
   ✅ SPI, Quartiles, Radar, Évolution, Alertes, Certificat
   ============================================================= */

const benchmark = (() => {

  // ── État ────────────────────────────────────────────────────
  let radarChart = null;
  let evolutionChart = null;
  let chartInstances = {};

  // ── Données sectorielles simulées ───────────────────────────
  const SECTEURS_DATA = {
    Laiterie: {
      nb_entreprises: 24,
      moyenne:  { trs: 72, qualite: 88, energie: 0.18, rendement: 91, securite: 85 },
      top10:    { trs: 89, qualite: 96, energie: 0.11, rendement: 97, securite: 96 },
      q1:       { trs: 58, qualite: 79, energie: 0.24, rendement: 83, securite: 74 },
      q3:       { trs: 81, qualite: 93, energie: 0.14, rendement: 95, securite: 92 },
      evolution_secteur: [68, 69, 71, 70, 72, 73, 72, 74, 75, 72, 73, 72],
    },
    Boulangerie: {
      nb_entreprises: 18,
      moyenne:  { trs: 68, qualite: 85, energie: 0.22, rendement: 87, securite: 80 },
      top10:    { trs: 85, qualite: 94, energie: 0.14, rendement: 95, securite: 93 },
      q1:       { trs: 54, qualite: 74, energie: 0.30, rendement: 78, securite: 68 },
      q3:       { trs: 78, qualite: 91, energie: 0.17, rendement: 93, securite: 88 },
      evolution_secteur: [64, 65, 67, 66, 68, 69, 68, 70, 71, 68, 69, 68],
    },
    Conserverie: {
      nb_entreprises: 15,
      moyenne:  { trs: 74, qualite: 90, energie: 0.16, rendement: 88, securite: 88 },
      top10:    { trs: 91, qualite: 97, energie: 0.09, rendement: 96, securite: 97 },
      q1:       { trs: 60, qualite: 81, energie: 0.22, rendement: 80, securite: 78 },
      q3:       { trs: 83, qualite: 95, energie: 0.12, rendement: 94, securite: 94 },
      evolution_secteur: [70, 71, 73, 72, 74, 75, 74, 76, 77, 74, 75, 74],
    },
    Fromagerie: {
      nb_entreprises: 12,
      moyenne:  { trs: 70, qualite: 87, energie: 0.20, rendement: 89, securite: 83 },
      top10:    { trs: 87, qualite: 95, energie: 0.12, rendement: 96, securite: 94 },
      q1:       { trs: 56, qualite: 77, energie: 0.27, rendement: 81, securite: 71 },
      q3:       { trs: 79, qualite: 92, energie: 0.15, rendement: 94, securite: 90 },
      evolution_secteur: [66, 67, 69, 68, 70, 71, 70, 72, 73, 70, 71, 70],
    }
  };

  const MOIS_LABELS = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];

  // ── Données utilisateur (depuis localStorage ou simulées) ───
  const getUserData = () => ({
    trs:       parseFloat(localStorage.getItem('bench_trs'))       || 65,
    qualite:   parseFloat(localStorage.getItem('bench_qualite'))   || 82,
    energie:   parseFloat(localStorage.getItem('bench_energie'))   || 0.21,
    rendement: parseFloat(localStorage.getItem('bench_rendement')) || 86,
    securite:  parseFloat(localStorage.getItem('bench_securite'))  || 78,
    evolution: JSON.parse(localStorage.getItem('bench_evolution') || 'null') ||
               [60, 61, 63, 62, 64, 65, 64, 66, 65, 64, 65, 65],
  });

  // ── Calcul SPI ───────────────────────────────────────────────
  const calculerSPI = (user, secteur, poids) => {
    const p = poids || { trs:30, qualite:25, energie:20, rendement:15, securite:10 };
    const total = p.trs + p.qualite + p.energie + p.rendement + p.securite;

    // Pour l'énergie, moins = mieux → inverser le ratio
    const scores = {
      trs:       (user.trs       / secteur.moyenne.trs)       * 100,
      qualite:   (user.qualite   / secteur.moyenne.qualite)   * 100,
      energie:   (secteur.moyenne.energie / user.energie)     * 100,
      rendement: (user.rendement / secteur.moyenne.rendement) * 100,
      securite:  (user.securite  / secteur.moyenne.securite)  * 100,
    };

    const spi = (
      scores.trs       * (p.trs       / total) +
      scores.qualite   * (p.qualite   / total) +
      scores.energie   * (p.energie   / total) +
      scores.rendement * (p.rendement / total) +
      scores.securite  * (p.securite  / total)
    );

    return { spi: Math.round(spi), scores };
  };

  // ── Calcul rang ──────────────────────────────────────────────
  const calculerRang = (valeur, q1, mediane, q3, top10, inverser) => {
    if (inverser) {
      if (valeur <= top10)  return { label: 'Top 10%', classe: 'rang-top',      emoji: '🏆' };
      if (valeur <= q1)     return { label: 'Top 25%', classe: 'rang-bon',       emoji: '🥇' };
      if (valeur <= mediane)return { label: 'Médiane',  classe: 'rang-moyen',    emoji: '🥈' };
      return                       { label: 'À améliorer', classe: 'rang-faible', emoji: '📈' };
    }
    if (valeur >= top10)    return { label: 'Top 10%', classe: 'rang-top',      emoji: '🏆' };
    if (valeur >= q3)       return { label: 'Top 25%', classe: 'rang-bon',       emoji: '🥇' };
    if (valeur >= mediane)  return { label: 'Médiane',  classe: 'rang-moyen',    emoji: '🥈' };
    return                         { label: 'À améliorer', classe: 'rang-faible', emoji: '📈' };
  };

  // ── CHARGER l'analyse complète ───────────────────────────────
  const charger = () => {
    const secteur = document.getElementById('bench-secteur')?.value || 'Laiterie';
    const data = SECTEURS_DATA[secteur];
    const user = getUserData();
    const poids = getPoids();
    const { spi, scores } = calculerSPI(user, data, poids);
    const mediane = {
      trs:       (data.q1.trs       + data.q3.trs)       / 2,
      qualite:   (data.q1.qualite   + data.q3.qualite)   / 2,
      energie:   (data.q1.energie   + data.q3.energie)   / 2,
      rendement: (data.q1.rendement + data.q3.rendement) / 2,
      securite:  (data.q1.securite  + data.q3.securite)  / 2,
    };

    afficherKPIs(spi, user, data, mediane, scores);
    dessinerRadar(user, data);
    afficherQuartiles(user, data, mediane);
    afficherClassement(user, data, spi);
    dessinerEvolution(user, data);
    afficherRecommandations(user, data, scores);
    verifierAlertes(user, data, spi);
    afficherCertificat(spi, secteur);
  };

  // ── Récupérer poids personnalisés ───────────────────────────
  const getPoids = () => ({
    trs:       parseInt(document.getElementById('poids-trs')?.value       || 30),
    qualite:   parseInt(document.getElementById('poids-qualite')?.value   || 25),
    energie:   parseInt(document.getElementById('poids-energie')?.value   || 20),
    rendement: parseInt(document.getElementById('poids-rendement')?.value || 15),
    securite:  parseInt(document.getElementById('poids-securite')?.value  || 10),
  });

  // ── Afficher KPIs ───────────────────────────────────────────
  const afficherKPIs = (spi, user, data, mediane, scores) => {
    // SPI Global
    const spiEl = document.getElementById('bench-spi');
    const spiBadge = document.getElementById('bench-spi-badge');
    if (spiEl) spiEl.textContent = spi;
    if (spiBadge) {
      if (spi >= 120) { spiBadge.textContent = '🏆 Top 10%'; spiBadge.className = 'kpi-status ok'; }
      else if (spi >= 110) { spiBadge.textContent = '🥇 Top 25%'; spiBadge.className = 'kpi-status ok'; }
      else if (spi >= 90) { spiBadge.textContent = '🥈 Médiane'; spiBadge.className = 'kpi-status warning'; }
      else { spiBadge.textContent = '📈 À améliorer'; spiBadge.className = 'kpi-status critical'; }
    }

    // Rangs individuels
    const rangTRS = calculerRang(user.trs, data.q1.trs, mediane.trs, data.q3.trs, data.top10.trs, false);
    const rangEPI = calculerRang(user.energie, data.top10.energie, mediane.energie, data.q1.energie, data.q1.energie, true);
    const rangQual = calculerRang(user.qualite, data.q1.qualite, mediane.qualite, data.q3.qualite, data.top10.qualite, false);

    setText('bench-rang-trs', `${rangTRS.emoji} ${rangTRS.label}`);
    setText('bench-rang-trs-label', `${user.trs}% vs moy. ${data.moyenne.trs}%`);
    setText('bench-rang-epi', `${rangEPI.emoji} ${rangEPI.label}`);
    setText('bench-rang-epi-label', `${user.energie} vs moy. ${data.moyenne.energie} kWh/u`);
    setText('bench-rang-qualite', `${rangQual.emoji} ${rangQual.label}`);
    setText('bench-rang-qualite-label', `${user.qualite}% vs moy. ${data.moyenne.qualite}%`);

    // Nb entreprises
    setText('bench-nb-ent', `${data.nb_entreprises} entreprises dans le pool`);
  };

  // ── Radar ───────────────────────────────────────────────────
  const dessinerRadar = (user, data) => {
    const ctx = document.getElementById('bench-radar');
    if (!ctx) return;
    if (radarChart) radarChart.destroy();

    // Normaliser sur 100 pour le radar (énergie inversée)
    const norm = (val, ref) => Math.round((val / ref) * 100);
    const normInv = (val, ref) => Math.round((ref / val) * 100);

    radarChart = new Chart(ctx, {
      type: 'radar',
      data: {
        labels: ['TRS', 'Qualité', 'Énergie', 'Rendement', 'Sécurité'],
        datasets: [
          {
            label: 'Votre entreprise',
            data: [
              norm(user.trs, data.moyenne.trs),
              norm(user.qualite, data.moyenne.qualite),
              normInv(user.energie, data.moyenne.energie),
              norm(user.rendement, data.moyenne.rendement),
              norm(user.securite, data.moyenne.securite),
            ],
            backgroundColor: 'rgba(0,87,184,0.15)',
            borderColor: '#0057b8',
            borderWidth: 2,
            pointBackgroundColor: '#0057b8',
          },
          {
            label: 'Moyenne secteur',
            data: [100, 100, 100, 100, 100],
            backgroundColor: 'rgba(150,150,150,0.08)',
            borderColor: 'rgba(150,150,150,0.5)',
            borderWidth: 1.5,
            borderDash: [5, 5],
            pointBackgroundColor: 'rgba(150,150,150,0.5)',
          },
          {
            label: 'Top 10%',
            data: [
              norm(data.top10.trs, data.moyenne.trs),
              norm(data.top10.qualite, data.moyenne.qualite),
              normInv(data.top10.energie, data.moyenne.energie),
              norm(data.top10.rendement, data.moyenne.rendement),
              norm(data.top10.securite, data.moyenne.securite),
            ],
            backgroundColor: 'rgba(26,138,74,0.08)',
            borderColor: 'rgba(26,138,74,0.6)',
            borderWidth: 1.5,
            borderDash: [3, 3],
            pointBackgroundColor: 'rgba(26,138,74,0.6)',
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          r: {
            min: 0, max: 160,
            ticks: { display: false },
            grid: { color: 'rgba(255,255,255,0.08)' },
            pointLabels: {
              color: '#94a3b8',
              font: { family: 'JetBrains Mono', size: 11 }
            }
          }
        },
        plugins: {
          legend: {
            labels: { color: '#94a3b8', font: { size: 11 }, boxWidth: 12 }
          }
        }
      }
    });
  };

  // ── Quartiles ───────────────────────────────────────────────
  const afficherQuartiles = (user, data, mediane) => {
    const container = document.getElementById('bench-quartiles-list');
    if (!container) return;

    const items = [
      { label: 'TRS (%)', val: user.trs, q1: data.q1.trs, med: mediane.trs, q3: data.q3.trs, top: data.top10.trs, max: 100, inv: false },
      { label: 'Qualité (%)', val: user.qualite, q1: data.q1.qualite, med: mediane.qualite, q3: data.q3.qualite, top: data.top10.qualite, max: 100, inv: false },
      { label: 'Énergie (kWh/u)', val: user.energie, q1: data.q1.energie, med: mediane.energie, q3: data.q3.energie, top: data.top10.energie, max: 0.35, inv: true },
      { label: 'Rendement (%)', val: user.rendement, q1: data.q1.rendement, med: mediane.rendement, q3: data.q3.rendement, top: data.top10.rendement, max: 100, inv: false },
      { label: 'Sécurité (%)', val: user.securite, q1: data.q1.securite, med: mediane.securite, q3: data.q3.securite, top: data.top10.securite, max: 100, inv: false },
    ];

    container.innerHTML = items.map(item => {
      const pct = val => Math.round((val / item.max) * 100);
      const rang = calculerRang(item.val, item.q1, item.med, item.q3, item.top, item.inv);
      const posMarker = pct(item.val);

      return `
        <div style="padding:4px 0">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <span style="font-family:var(--mono);font-size:11px;font-weight:600;color:var(--text)">${item.label}</span>
            <span style="font-family:var(--mono);font-size:10px" class="${rang.classe}">${rang.emoji} ${rang.label} — <strong>${item.val}</strong></span>
          </div>
          <div class="quartile-bar-container">
            <div class="quartile-zone" style="left:${pct(item.q1)}%;width:${pct(item.q3)-pct(item.q1)}%;background:rgba(0,229,255,0.12);border:1px solid rgba(0,229,255,0.2)"></div>
            <div class="quartile-zone" style="left:${pct(item.med)-0.5}%;width:1%;background:rgba(0,229,255,0.5)"></div>
            <div class="quartile-marker" style="left:${posMarker}%;background:#0057b8"></div>
          </div>
          <div class="quartile-label">
            <span>Q1: ${item.q1}</span>
            <span>Méd: ${item.med.toFixed(item.max===100?0:2)}</span>
            <span>Q3: ${item.q3}</span>
            <span>Top: ${item.top}</span>
          </div>
        </div>`;
    }).join('');
  };

  // ── Classement anonyme ──────────────────────────────────────
  const afficherClassement = (user, data, spi) => {
    const container = document.getElementById('bench-classement');
    if (!container) return;

    // Générer classement simulé
    const nb = data.nb_entreprises;
    const entreprises = [];
    for (let i = 0; i < nb - 1; i++) {
      entreprises.push({
        nom: `Entreprise ${String.fromCharCode(65 + i)}`,
        spi: Math.round(85 + Math.random() * 50),
        isUser: false,
      });
    }
    entreprises.push({ nom: '⭐ Votre entreprise', spi, isUser: true });
    entreprises.sort((a, b) => b.spi - a.spi);

    const rang = entreprises.findIndex(e => e.isUser) + 1;
    setText('bench-nb-ent', `${nb} entreprises dans le pool`);

    container.innerHTML = entreprises.slice(0, 8).map((e, i) => `
      <div style="display:flex;align-items:center;gap:12px;padding:10px 16px;
                  background:${e.isUser ? 'rgba(0,87,184,0.08)' : 'transparent'};
                  border-left:${e.isUser ? '3px solid #0057b8' : '3px solid transparent'};
                  border-bottom:1px solid var(--border);transition:background 0.2s">
        <span style="font-family:var(--mono);font-size:13px;font-weight:700;
                     color:${i===0?'gold':i===1?'silver':i===2?'#cd7f32':'var(--text-d)'}">
          ${i===0?'🥇':i===1?'🥈':i===2?'🥉':`#${i+1}`}
        </span>
        <span style="flex:1;font-size:13px;font-weight:${e.isUser?'700':'400'};
                     color:${e.isUser?'#0057b8':'var(--text-m)'}">${e.nom}</span>
        <div style="text-align:right">
          <div style="font-family:var(--mono);font-size:15px;font-weight:700;
                      color:${e.spi>=110?'var(--green)':e.spi>=90?'var(--yellow)':'var(--red)'}">${e.spi}</div>
          <div style="font-family:var(--mono);font-size:9px;color:var(--text-d)">SPI</div>
        </div>
      </div>
    `).join('') + `
      <div style="padding:12px 16px;font-family:var(--mono);font-size:11px;
                  color:#0057b8;background:rgba(0,87,184,0.04);border-top:1px solid var(--border)">
        📍 Votre rang : <strong>${rang}ème / ${nb}</strong> entreprises
      </div>`;
  };

  // ── Évolution temporelle ────────────────────────────────────
  const dessinerEvolution = (user, data) => {
    const ctx = document.getElementById('bench-evolution');
    if (!ctx) return;
    if (evolutionChart) evolutionChart.destroy();

    evolutionChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: MOIS_LABELS,
        datasets: [
          {
            label: 'Votre TRS',
            data: user.evolution,
            borderColor: '#0057b8',
            backgroundColor: 'rgba(0,87,184,0.1)',
            borderWidth: 2.5,
            tension: 0.4,
            fill: true,
            pointRadius: 4,
            pointBackgroundColor: '#0057b8',
          },
          {
            label: 'Moyenne secteur',
            data: data.evolution_secteur,
            borderColor: 'rgba(150,150,150,0.6)',
            backgroundColor: 'transparent',
            borderWidth: 1.5,
            borderDash: [5, 5],
            tension: 0.4,
            pointRadius: 2,
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
          y: { min: 40, max: 100, ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.06)' } }
        },
        plugins: {
          legend: { labels: { color: '#94a3b8', font: { size: 11 }, boxWidth: 12 } }
        }
      }
    });
  };

  // ── Recommandations Peer-to-Peer ───────────────────────────
  const afficherRecommandations = (user, data, scores) => {
    const container = document.getElementById('bench-recommandations');
    if (!container) return;

    const recos = [];

    if (scores.trs < 95) recos.push({
      icon: '⚙️', titre: 'Optimiser le TRS',
      desc: `Votre TRS (${user.trs}%) est sous la moyenne (${data.moyenne.trs}%). Les top performers de votre secteur ont réduit les micro-arrêts via la méthode SMED.`,
      gain: `+${data.moyenne.trs - user.trs} pts TRS possible`,
      color: 'var(--yellow)'
    });

    if (scores.energie < 95) recos.push({
      icon: '⚡', titre: 'Réduire la consommation énergétique',
      desc: `Votre EPI (${user.energie} kWh/u) dépasse la moyenne (${data.moyenne.energie}). L'isolation des cuves et variateurs de fréquence réduisent de 20% la conso.`,
      gain: `−${Math.round((user.energie - data.moyenne.energie) * 100) / 100} kWh/unité`,
      color: '#f59e0b'
    });

    if (scores.qualite < 95) recos.push({
      icon: '🎯', titre: 'Améliorer la conformité qualité',
      desc: `Votre taux qualité (${user.qualite}%) est perfectible. Les entreprises top investissent dans le contrôle statistique de procédé (SPC) et les capteurs pH en ligne.`,
      gain: `+${data.moyenne.qualite - user.qualite} pts qualité`,
      color: 'var(--teal)'
    });

    if (scores.securite < 95) recos.push({
      icon: '🛡️', titre: 'Renforcer la sécurité sanitaire',
      desc: `Score sécurité (${user.securite}%) à améliorer. Les meilleures PME du secteur ont digitalisé leurs plans HACCP et effectuent des contrôles terrain toutes les 2h.`,
      gain: `Réduire les non-conformités`,
      color: 'var(--red)'
    });

    if (recos.length === 0) recos.push({
      icon: '🏆', titre: 'Performance Excellente !',
      desc: 'Vous surpassez la moyenne sectorielle sur tous les indicateurs. Continuez à innover pour maintenir votre avantage concurrentiel.',
      gain: 'Maintenir le cap',
      color: 'var(--green)'
    });

    container.innerHTML = recos.map(r => `
      <div style="background:var(--bg-e);border:1px solid var(--border);border-top:3px solid ${r.color};
                  border-radius:var(--rl);padding:18px;transition:all 0.2s"
           onmouseover="this.style.transform='translateY(-2px)'"
           onmouseout="this.style.transform=''">
        <div style="font-size:22px;margin-bottom:10px">${r.icon}</div>
        <div style="font-weight:700;font-size:14px;margin-bottom:8px;color:var(--text)">${r.titre}</div>
        <div style="font-family:var(--mono);font-size:11px;color:var(--text-m);line-height:1.7;margin-bottom:12px">${r.desc}</div>
        <div style="font-family:var(--mono);font-size:11px;font-weight:700;color:${r.color};
                    background:rgba(0,0,0,0.2);padding:6px 10px;border-radius:var(--r)">
          📈 ${r.gain}
        </div>
      </div>`).join('');
  };

  // ── Alertes de déclassement ─────────────────────────────────
  const verifierAlertes = (user, data, spi) => {
    const container = document.getElementById('bench-alertes');
    if (!container) return;

    const alertes = [];
    const mediane = { trs: (data.q1.trs + data.q3.trs) / 2 };

    if (user.trs < data.q3.trs && user.trs > mediane.trs) {
      alertes.push({
        type: 'warning',
        msg: `⚠️ Attention : votre TRS (${user.trs}%) glisse vers la médiane sectorielle.`,
        detail: `3 entreprises de votre secteur vous ont dépassé ce mois-ci.`
      });
    }
    if (user.energie > data.q1.energie) {
      alertes.push({
        type: 'critical',
        msg: `🔴 Votre consommation énergétique (${user.energie} kWh/u) dépasse le Q1 sectoriel.`,
        detail: `Action urgente recommandée pour réduire vos coûts fixes.`
      });
    }
    if (spi >= 110) {
      alertes.push({
        type: 'success',
        msg: `🏆 Félicitations ! Votre SPI (${spi}) vous place dans le Top 10% du secteur.`,
        detail: `Vous pouvez générer votre certificat de performance.`
      });
    }

    if (alertes.length === 0) {
      container.innerHTML = `<div style="text-align:center;padding:20px;font-family:var(--mono);font-size:12px;color:var(--text-m)">
        ✅ Aucune alerte de déclassement détectée
      </div>`;
      return;
    }

    container.innerHTML = alertes.map(a => `
      <div style="padding:14px 18px;border-radius:var(--r);margin-bottom:10px;
                  background:${a.type==='success'?'rgba(26,138,74,0.06)':a.type==='critical'?'rgba(217,48,37,0.06)':'rgba(245,158,11,0.06)'};
                  border-left:3px solid ${a.type==='success'?'var(--green)':a.type==='critical'?'var(--red)':'var(--yellow)'}">
        <div style="font-weight:700;font-size:13px;margin-bottom:4px">${a.msg}</div>
        <div style="font-family:var(--mono);font-size:11px;color:var(--text-m)">${a.detail}</div>
      </div>`).join('');
  };

  // ── Certificat ──────────────────────────────────────────────
  const afficherCertificat = (spi, secteur) => {
    const section = document.getElementById('bench-certificat-section');
    if (!section) return;

    let cert = null;
    if (spi >= 120) cert = { emoji:'🥇', titre:'Champion Sectoriel', color:'gold' };
    else if (spi >= 110) cert = { emoji:'🏆', titre:'Top Performeur', color:'#c0c0c0' };
    else if (spi >= 100) cert = { emoji:'🥈', titre:'Au-dessus de la Moyenne', color:'#cd7f32' };

    if (!cert) { section.style.display = 'none'; return; }

    section.style.display = 'block';
    setText('cert-emoji', cert.emoji);
    setText('cert-titre', cert.titre);
    setText('cert-details', `Secteur : ${secteur} — SPI : ${spi}/150 — Certifié par TWINOVA`);
    document.querySelector('#bench-certificat-section .card').style.borderColor = cert.color;
  };

  // ── Soumettre mes données ───────────────────────────────────
  const soumettre = () => {
    const modal = document.getElementById('bench-modal-soumettre');
    if (modal) modal.style.display = 'flex';
  };

  const fermerModal = () => {
    const modal = document.getElementById('bench-modal-soumettre');
    if (modal) modal.style.display = 'none';
  };

  const confirmerSoumission = () => {
    const trs       = parseFloat(document.getElementById('sub-trs')?.value);
    const qualite   = parseFloat(document.getElementById('sub-qualite')?.value);
    const energie   = parseFloat(document.getElementById('sub-energie')?.value);
    const rendement = parseFloat(document.getElementById('sub-rendement')?.value);
    const securite  = parseFloat(document.getElementById('sub-securite')?.value);

    if (!trs || !qualite || !energie || !rendement || !securite) {
      alert('Veuillez remplir tous les champs.'); return;
    }

    // Sauvegarder
    localStorage.setItem('bench_trs',       trs);
    localStorage.setItem('bench_qualite',   qualite);
    localStorage.setItem('bench_energie',   energie);
    localStorage.setItem('bench_rendement', rendement);
    localStorage.setItem('bench_securite',  securite);

    // Ajouter à l'évolution
    const evo = JSON.parse(localStorage.getItem('bench_evolution') || '[]');
    evo.push(trs);
    if (evo.length > 12) evo.shift();
    localStorage.setItem('bench_evolution', JSON.stringify(evo));

    fermerModal();
    charger();

    // Confirmation visuelle
    const btn = document.getElementById('bench-submit-confirm');
    if (btn) { btn.textContent = '✅ Soumis !'; btn.style.background = 'var(--green)'; }
    setTimeout(() => {
      if (btn) { btn.textContent = 'Confirmer la soumission'; btn.style.background = ''; }
    }, 2000);
  };

  const exporterCertificat = () => {
    alert('📄 Certificat PDF — Fonctionnalité disponible après déploiement en ligne.');
  };

  const setText = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  return { charger, soumettre, fermerModal, confirmerSoumission, exporterCertificat };

})();