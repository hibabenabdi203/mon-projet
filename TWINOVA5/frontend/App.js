/* ═══════════════════════════════════════════════════════
   TWINOVA — app.js
   Navigation · Charts · Calcul KPI · Simulateur
═══════════════════════════════════════════════════════ */
let deviseActive = localStorage.getItem('twinova_devise') || 'DZD';
// ── AUTHENTIFICATION ──────────────────────────────────
// ── PLAN D'ACTION ─────────────────────────────────────
async function chargerPlanAction(produitId = 2) {
  try {
    const response = await fetch(`http://127.0.0.1:8000/plan-action/${produitId}`);
    const data = await response.json();
    const r = data.recommandations;

    // ── Mettre à jour les 3 cartes ──────────────────
    const grid = document.querySelector('.decisions-grid');
    if (!grid) return;

    grid.innerHTML = r.map((rec, i) => {
      const prioriteClass = rec.priorite === 'critique' ? 'decision-critical' :
                            rec.priorite === 'attention' ? 'decision-warning' : 'decision-info';
      const urgenceClass  = rec.priorite === 'critique' ? 'critical-bg' :
                            rec.priorite === 'attention' ? 'warning-bg' : 'info-bg';
      const urgenceTexte  = rec.priorite === 'critique' ? '⚡ Urgence : sous 48h' :
                            rec.priorite === 'attention' ? '📅 Planifier cette semaine' : '🗓 Dans les 2 semaines';

      const gainAffiche = convertir(rec.gain);

      return `
        <div class="decision-card ${prioriteClass}">
          <div class="decision-num">ACTION ${rec.numero}</div>
          <div class="decision-title">${rec.icone} ${rec.titre}</div>
          <div class="decision-problem">
            <div class="dp-label">PROBLÈME IDENTIFIÉ</div>
            <div class="dp-text">${rec.description}</div>
          </div>
          <div class="decision-action">
            <div class="dp-label">ACTION CONCRÈTE</div>
            <div class="dp-text">${actionConcreteTexte(rec.titre, rec.ecart)}</div>
          </div>
          <div class="decision-impact">
            <div class="di-item">
              <span class="di-label">${rec.impact_kpi.split('+')[1]?.split('%')[0] ? 'KPI' : 'KPI'}</span>
              <span class="di-val teal">${rec.impact_kpi}</span>
            </div>
            <div class="di-item">
              <span class="di-label">Gain mensuel</span>
              <span class="di-val teal">+ ${gainAffiche}</span>
            </div>
          </div>
          <div class="decision-urgency ${urgenceClass}">${urgenceTexte}</div>
        </div>
      `;
    }).join('');

    // ── Mettre à jour le résumé ──────────────────────
    const summary = document.querySelector('.decisions-summary');
    if (summary) {
      const trsActuel  = data.trs;
      const trsCible   = Math.min(trsActuel + 20, 95);
      const gainTotal  = convertir(data.gain_total);

      summary.innerHTML = `
        <div class="ds-title">Si vous appliquez les ${r.length} action(s)</div>
        <div class="ds-kpis">
          <div class="ds-kpi">
            <div class="ds-val">${data.trs}%<span class="ds-arrow">→</span><span class="teal">${trsCible}%</span></div>
            <div class="ds-label">TRS</div>
          </div>
          <div class="ds-kpi">
            <div class="ds-val">${data.disponibilite}%<span class="ds-arrow">→</span><span class="teal">${Math.min(data.disponibilite + 10, 98)}%</span></div>
            <div class="ds-label">Disponibilité</div>
          </div>
          <div class="ds-kpi">
            <div class="ds-val">${data.performance}%<span class="ds-arrow">→</span><span class="teal">${Math.min(data.performance + 8, 98)}%</span></div>
            <div class="ds-label">Performance</div>
          </div>
          <div class="ds-kpi">
            <div class="ds-val">${data.qualite}%<span class="ds-arrow">→</span><span class="teal">${Math.min(data.qualite + 5, 99)}%</span></div>
            <div class="ds-label">Qualité</div>
          </div>
          <div class="ds-kpi ds-gain">
            <div class="ds-val teal">+ ${gainTotal}</div>
            <div class="ds-label">Gain / mois</div>
          </div>
        </div>
      `;
    }

  } catch(e) {
    console.error('Erreur Plan Action:', e);
  }
}

function actionConcreteTexte(titre, ecart) {
  if (titre.includes('Maintenance')) {
    return `Planifier une intervention technique sous 48h. Vérifier et remplacer les joints, courroies et roulements. Mettre en place un suivi hebdomadaire.`;
  } else if (titre.includes('micro-arrêts')) {
    return `Appliquer la méthode SMED. Documenter et standardiser les procédures de changement de série. Former les opérateurs. Objectif : setup < 8 min.`;
  } else if (titre.includes('qualité')) {
    return `Vérifier et recalibrer les paramètres de dosage et de température. Mettre en place un contrôle qualité renforcé en début de poste. Revoir les SOP.`;
  }
  return `Maintenir les bonnes pratiques et continuer le suivi quotidien des KPIs.`;
}

function switchAuth(mode) {
  document.getElementById('form-connexion').style.display  = mode === 'connexion'   ? 'block' : 'none';
  document.getElementById('form-inscription').style.display = mode === 'inscription' ? 'block' : 'none';
  document.querySelectorAll('.auth-tab').forEach((t, i) => {
    t.classList.toggle('active', (mode === 'connexion' && i === 0) || (mode === 'inscription' && i === 1));
  });
}

async function seConnecter() {
  const email = document.getElementById('login-email').value;
  const mdp   = document.getElementById('login-mdp').value;
  const error = document.getElementById('login-error');

  if (!email || !mdp) { error.textContent = 'Remplissez tous les champs'; return; }

  try {
    const response = await fetch('http://127.0.0.1:8000/connexion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, mot_de_passe: mdp })
    });

    const data = await response.json();

    if (!response.ok) { error.textContent = data.detail; return; }

    // Sauvegarder le token et les infos utilisateur
    localStorage.setItem('twinova_token', data.token);
    localStorage.setItem('twinova_user',  JSON.stringify(data.user));

    // Masquer la page de connexion
    ouvrirPlateforme(data.user);

  } catch (e) {
    error.textContent = 'Erreur de connexion au serveur';
  }
}

async function sInscrire() {
  const nom   = document.getElementById('reg-nom').value;
  const email = document.getElementById('reg-email').value;
  const mdp   = document.getElementById('reg-mdp').value;
  const error = document.getElementById('reg-error');

  if (!nom || !email || !mdp) { error.textContent = 'Remplissez tous les champs'; return; }
  if (mdp.length < 6) { error.textContent = 'Mot de passe minimum 6 caractères'; return; }

  try {
    const response = await fetch('http://127.0.0.1:8000/inscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nom_entreprise: nom, email, mot_de_passe: mdp })
    });

    const data = await response.json();

    if (!response.ok) { error.textContent = data.detail; return; }

    // Sauvegarder le token
    localStorage.setItem('twinova_token', data.token);
    localStorage.setItem('twinova_user',  JSON.stringify(data.user));

    // Ouvrir la plateforme
    ouvrirPlateforme(data.user);

  } catch (e) {
    error.textContent = 'Erreur de connexion au serveur';
  }
}

function ouvrirPlateforme(user) {
  // Masquer la page de connexion
  document.getElementById('auth-overlay').style.display = 'none';

  // Mettre à jour la sidebar
  const nom = user.nom_entreprise;
  const avatar = nom.substring(0, 2).toUpperCase();

  const sidebarNom = document.getElementById('sidebar-nom');
  const sidebarAvatar = document.getElementById('sidebar-avatar');
  if (sidebarNom) sidebarNom.textContent = nom;
  if (sidebarAvatar) sidebarAvatar.textContent = avatar;

  // Mettre à jour la page Mon Compte
  const compteNom = document.getElementById('compte-nom');
  const compteEmail = document.getElementById('compte-email');
  const compteDevise = document.getElementById('compte-devise');
  if (compteNom) compteNom.value = nom;
  if (compteEmail) compteEmail.value = user.email;
  if (compteDevise) compteDevise.value = deviseActive;
}

function seDeconnecter() {
  // Supprimer la session
  localStorage.removeItem('twinova_token');
  localStorage.removeItem('twinova_user');

  // Réafficher la page de connexion
  document.getElementById('auth-overlay').style.display = 'flex';

  // Vider les champs de connexion
  const email = document.getElementById('login-email');
  const mdp = document.getElementById('login-mdp');
  if (email) email.value = '';
  if (mdp) mdp.value = '';

  // Retourner au dashboard
 navigate('dashboard');
setTimeout(async () => {
    await chargerDonneesGraphiques();
    await initKpiChart('7j');
    await initLossChart();
}, 500);
}

function changerMotDePasse() {
  const actuel  = document.getElementById('mdp-actuel').value;
  const nouveau = document.getElementById('mdp-nouveau').value;
  const confirm = document.getElementById('mdp-confirm').value;
  const error   = document.getElementById('mdp-error');

  if (!actuel || !nouveau || !confirm) {
    error.textContent = 'Remplissez tous les champs';
    return;
  }
  if (nouveau.length < 6) {
    error.textContent = 'Minimum 6 caractères';
    return;
  }
  if (nouveau !== confirm) {
    error.textContent = 'Les mots de passe ne correspondent pas';
    return;
  }

  // Pour l'instant confirmation visuelle
  error.style.color = '#1a8a4a';
  error.textContent = '✓ Mot de passe changé avec succès !';
  setTimeout(() => {
    error.textContent = '';
    error.style.color = '';
    document.getElementById('mdp-actuel').value = '';
    document.getElementById('mdp-nouveau').value = '';
    document.getElementById('mdp-confirm').value = '';
  }, 3000);
}

function sauvegarderCompte() {
  const nom = document.getElementById('compte-nom').value;
  if (!nom) return;

  // Mettre à jour la sidebar
  const user = JSON.parse(localStorage.getItem('twinova_user'));
  user.nom_entreprise = nom;
  localStorage.setItem('twinova_user', JSON.stringify(user));

  const sidebarNom    = document.getElementById('sidebar-nom');
  const sidebarAvatar = document.getElementById('sidebar-avatar');
  if (sidebarNom)    sidebarNom.textContent = nom;
  if (sidebarAvatar) sidebarAvatar.textContent = nom.substring(0, 2).toUpperCase();

  // Confirmation
  const btn = document.querySelector('.compte-card .btn-accent-sm');
  if (btn) {
    btn.textContent = '✓ Sauvegardé !';
    btn.style.background = '#1a8a4a';
    btn.style.color = '#fff';
    setTimeout(() => {
      btn.textContent = 'Sauvegarder';
      btn.style.background = '';
      btn.style.color = '';
    }, 2000);
  }
}

function verifierConnexion() {
  const token = localStorage.getItem('twinova_token');
  const user  = localStorage.getItem('twinova_user');

  if (token && user) {
    // Déjà connecté — ouvrir directement la plateforme
    ouvrirPlateforme(JSON.parse(user));
  }
  // Sinon la page de connexion reste visible
}

// Vérifier la connexion au chargement
verifierConnexion();
// ── DATE ─────────────────────────────────────────────
function updateDate() {
  const el = document.getElementById('topbarDate');
  if (!el) return;
  el.textContent = new Date().toLocaleDateString('fr-FR', {
    weekday:'short', day:'2-digit', month:'short', year:'numeric'
  });
}
updateDate();
// ── MULTI-DEVISE ──────────────────────────────────────
const DEVISES = {
  DZD: { symbole: 'DA',  taux: 147.0,  nom: 'Dinar Algérien' },
  EUR: { symbole: '€',   taux: 1.0,    nom: 'Euro' },
  USD: { symbole: '$',   taux: 1.08,   nom: 'Dollar US' },
  GBP: { symbole: '£',   taux: 0.85,   nom: 'Livre Sterling' },
  MAD: { symbole: 'MAD', taux: 10.8,   nom: 'Dirham Marocain' },
  TND: { symbole: 'TND', taux: 3.3,    nom: 'Dinar Tunisien' },
  SAR: { symbole: 'SAR', taux: 4.05,   nom: 'Riyal Saoudien' },
  AED: { symbole: 'AED', taux: 3.97,   nom: 'Dirham Émirats' },
  TRY: { symbole: '₺',   taux: 35.0,   nom: 'Livre Turque' },
  EGP: { symbole: 'EGP', taux: 33.0,   nom: 'Livre Égyptienne' }
};

// Devise active — DZD par défaut

function initDevise() {
  const selector = document.getElementById('devise-selector');
  if (selector) selector.value = deviseActive;
}

function changerDevise(code) {
  deviseActive = code;
  localStorage.setItem('twinova_devise', code);

  // Convertir les montants fixes
  const couts = {
    'cout-pannes': 105,
    'cout-micro':  45,
    'cout-rebuts': 30,
    'cout-total':  180
  };
  Object.entries(couts).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = '− ' + convertir(val);
  });

  // Convertir les recommandations
  document.querySelectorAll('.montant-converti').forEach(el => {
    const eur = parseFloat(el.dataset.eur);
    el.textContent = '+ ' + convertir(eur) + '/mois';
  });

  // Recharger dashboard et historique
  chargerDashboard();
  if (document.getElementById('page-historique').classList.contains('active')) {
    chargerHistorique();
  }
}

function convertir(montantEuros) {
  const devise = DEVISES[deviseActive];
  const montant = Math.round(montantEuros * devise.taux);
  return montant.toLocaleString('fr-FR') + ' ' + devise.symbole;
}

// Pré-remplir la date du formulaire
const dateInput = document.getElementById('f-date');
if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];

// ── NAVIGATION ───────────────────────────────────────
const pageTitles = {
  dashboard:   'Dashboard',
  saisie:      'Saisie Production',
  simulation:  'Simulateur de Scénarios',
  decisions:   'Plan d\'Action',
  historique:  'Historique',
  produits:    'Mes Produits',
  compte:      'Mon Compte',
  visualisation: 'Visualisation 3D',
  recettes: 'Recettes & Process',
  haccp: 'HACCP & Sécurité',
  energie: 'Optimisation Énergétique',
  intelligence: ' Intelligence Prédictive',
  benchmark: 'Benchmarking Sectoriel',
};
// ── RECETTES & PROCESS ───────────────────────────────
let templatesData = [];
let recettesData  = [];
let timelineEvents = [];
let planningData  = [];

async function chargerPageRecettes() {
  await chargerTemplates();
  await chargerRecettesSauvegardees();
  chargerSelectRecettes();
}

// ── Charger les templates depuis le backend ──────────
async function chargerTemplates() {
  try {
    const response = await fetch('http://127.0.0.1:8000/templates-recettes');
    templatesData  = await response.json();

    const grid = document.getElementById('ts-grid');
    if (!grid) return;

    // Grouper par modèle de risque
    const modeles = {
      'Thermique Chaud':  { badge: 'badge-thermique-chaud',  emoji: '🔥', templates: [] },
      'Thermique Froid':  { badge: 'badge-thermique-froid',  emoji: '❄️', templates: [] },
      'Fermentation & pH':{ badge: 'badge-fermentation',     emoji: '🧪', templates: [] },
      'Pesage & Rendement':{ badge: 'badge-pesage',          emoji: '⚖️', templates: [] },
      'Parage & Eau':     { badge: 'badge-parage',           emoji: '💧', templates: [] },
    };

    const modeleParSecteur = {
      'Laiterie':         'Thermique Chaud',
      'Conserverie':      'Thermique Chaud',
      'Boissons':         'Thermique Chaud',
      'Viande':           'Thermique Chaud',
      'Surgélation':      'Thermique Froid',
      'Fromagerie':       'Fermentation & pH',
      'Boulangerie':      'Fermentation & pH',
      'Céréales':         'Pesage & Rendement',
      'Café / Épices':    'Pesage & Rendement',
      'Fruits et Légumes':'Parage & Eau',
    };

    // Corriger : Viande Froid et Laiterie Froid
    templatesData.forEach(t => {
      let modele = modeleParSecteur[t.secteur] || 'Thermique Chaud';
      if (t.temperature_cible !== null && t.temperature_cible <= 10) {
  modele = 'Thermique Froid';
} else if (t.ph_cible !== null && t.secteur !== 'Laiterie') {
  modele = 'Fermentation & pH';
} else if (t.secteur === 'Fromagerie' || t.secteur === 'Boulangerie') {
  modele = 'Fermentation & pH';
}
      if (t.secteur === 'Laiterie' && t.nom_template.includes('Yaourt')) {
        modele = 'Fermentation & pH';
      }
      if (t.secteur === 'Laiterie' && t.nom_template.includes('Stockage')) {
        modele = 'Thermique Froid';
      }
      if (modeles[modele]) modeles[modele].templates.push(t);
    });

    grid.innerHTML = Object.entries(modeles).map(([nom, m]) => {
      if (m.templates.length === 0) return '';
      return `
        <div style="grid-column: 1 / -1; margin-top:8px">
          <span class="ts-modele-badge ${m.badge}">${m.emoji} ${nom}</span>
        </div>
        ${m.templates.map(t => `
          <div class="ts-card" onclick="selectionnerTemplate(${t.id})" id="ts-${t.id}">
            <div class="ts-card-secteur">${t.secteur}</div>
            <div class="ts-card-nom">${t.nom_template}</div>
            <div class="ts-card-params">
              ${t.temperature_cible !== null ? `🌡 ${t.temperature_cible}°C` : ''}
              ${t.rendement_theorique ? ` · ⚙️ ${t.rendement_theorique}%` : ''}
              ${t.dlc_theorique_jours ? ` · 📅 ${t.dlc_theorique_jours}j` : ''}
            </div>
          </div>
        `).join('')}
      `;
    }).join('');

  } catch(e) {
    console.error('Erreur chargement templates:', e);
  }
}

function selectionnerTemplate(id) {
  const t = templatesData.find(t => t.id === id);
  if (!t) return;

  // Mettre en surbrillance
  document.querySelectorAll('.ts-card').forEach(c => c.classList.remove('selected'));
  const card = document.getElementById(`ts-${id}`);
  if (card) card.classList.add('selected');

  // Remplir le formulaire
  document.getElementById('rf-nom').value          = '';
  document.getElementById('rf-desc').value         = t.description || '';
  document.getElementById('rf-temp').value         = t.temperature_cible || '';
  document.getElementById('rf-temp-tol').value     = t.temperature_tolerance || 2;
  document.getElementById('rf-rendement').value    = t.rendement_theorique || 98;
  document.getElementById('rf-ph').value           = t.ph_cible || '';
  document.getElementById('rf-dlc').value          = t.dlc_theorique_jours || '';
  document.getElementById('rf-temp-stockage').value = '';
  document.getElementById('rf-template-id').value  = id;

  // Réinitialiser les ingrédients
  document.getElementById('ingredients-list').innerHTML = '';
  ajouterIngredient();

  // Afficher le formulaire
  document.getElementById('recette-form').style.display = 'block';
}

function ouvrirNouvelleRecette() {
  document.querySelectorAll('.ts-card').forEach(c => c.classList.remove('selected'));
  document.getElementById('rf-nom').value           = '';
  document.getElementById('rf-desc').value          = '';
  document.getElementById('rf-temp').value          = '';
  document.getElementById('rf-temp-tol').value      = 2;
  document.getElementById('rf-rendement').value     = 98;
  document.getElementById('rf-ph').value            = '';
  document.getElementById('rf-dlc').value           = '';
  document.getElementById('rf-temp-stockage').value = '';
  document.getElementById('rf-template-id').value   = '';
  document.getElementById('ingredients-list').innerHTML = '';
  ajouterIngredient();
  document.getElementById('recette-form').style.display = 'block';
}

function annulerRecette() {
  document.getElementById('recette-form').style.display = 'none';
  document.querySelectorAll('.ts-card').forEach(c => c.classList.remove('selected'));
}

let ingredientCount = 0;
function ajouterIngredient() {
  ingredientCount++;
  const liste = document.getElementById('ingredients-list');
  const row = document.createElement('div');
  row.className = 'ingredient-row';
  row.id = `ing-${ingredientCount}`;
  row.innerHTML = `
    <input type="text"   placeholder="Nom ingrédient" class="ing-nom"/>
    <input type="number" placeholder="Quantité"       class="ing-qte" step="0.1"/>
    <select class="ing-unite">
      <option value="kg">kg</option>
      <option value="L">L</option>
      <option value="g">g</option>
      <option value="mL">mL</option>
    </select>
    <label style="font-size:11px; white-space:nowrap">
      <input type="checkbox" class="ing-allergene"/> Allerg.
    </label>
    <button class="btn-remove-ing" onclick="document.getElementById('ing-${ingredientCount}').remove()">✕</button>
  `;
  liste.appendChild(row);
}

async function sauvegarderRecette() {
  const nom = document.getElementById('rf-nom').value.trim();
  if (!nom) { alert('Donnez un nom à votre recette !'); return; }

  // Collecter les ingrédients
  const ingredients = [];
  document.querySelectorAll('.ingredient-row').forEach(row => {
    const nom_ing = row.querySelector('.ing-nom')?.value.trim();
    const qte     = parseFloat(row.querySelector('.ing-qte')?.value);
    const unite   = row.querySelector('.ing-unite')?.value;
    const allerge = row.querySelector('.ing-allergene')?.checked;
    if (nom_ing && qte) {
      ingredients.push({ nom: nom_ing, quantite: qte, unite, est_allergene: allerge });
    }
  });

  const data = {
    produit_id:            2,
    template_id:           parseInt(document.getElementById('rf-template-id').value) || null,
    nom:                   nom,
    description:           document.getElementById('rf-desc').value,
    temperature_cible:     parseFloat(document.getElementById('rf-temp').value) || null,
    temperature_tolerance: parseFloat(document.getElementById('rf-temp-tol').value) || 2,
    rendement_theorique:   parseFloat(document.getElementById('rf-rendement').value) || 98,
    ph_cible:              parseFloat(document.getElementById('rf-ph').value) || null,
    dlc_theorique_jours:   parseInt(document.getElementById('rf-dlc').value) || null,
    temperature_stockage:  parseFloat(document.getElementById('rf-temp-stockage').value) || null,
    ingredients
  };

  try {
    const response = await fetch('http://127.0.0.1:8000/recettes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await response.json();

    ajouterTimeline(`Recette "${nom}" sauvegardée ✅`, 'alerte-ok');
    annulerRecette();
    await chargerRecettesSauvegardees();
    chargerSelectRecettes();

  } catch(e) {
    console.error('Erreur sauvegarde recette:', e);
  }
}

async function chargerRecettesSauvegardees() {
  try {
    const response = await fetch('http://127.0.0.1:8000/recettes/2');
    recettesData   = await response.json();

    const container = document.getElementById('recettes-sauvegardees');
    if (!container) return;

    if (recettesData.length === 0) {
      container.innerHTML = '<div class="rs-empty">Aucune recette sauvegardée — choisissez un template ci-dessus</div>';
      return;
    }

    container.innerHTML = `
      <div class="ts-label" style="margin-bottom:8px">MES RECETTES (${recettesData.length})</div>
      ${recettesData.map(r => `
        <div class="rs-card">
          <div>
            <div class="rs-card-nom">${r.nom}</div>
            <div class="rs-card-desc">
              ${r.temperature_cible ? `🌡 ${r.temperature_cible}°C` : ''}
              ${r.rendement_theorique ? ` · ⚙️ ${r.rendement_theorique}%` : ''}
              ${r.dlc_theorique_jours ? ` · 📅 DLC ${r.dlc_theorique_jours}j` : ''}
            </div>
          </div>
          <button class="rs-btn-use" onclick="utiliserRecette(${r.id})">Utiliser</button>
        </div>
      `).join('')}
    `;
  } catch(e) {
    console.error('Erreur chargement recettes:', e);
  }
}

function chargerSelectRecettes() {
  const selects = ['lf-recette', 'sc-recette'];
  selects.forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    sel.innerHTML = '<option value="">— Choisir une recette —</option>' +
      recettesData.map(r => `<option value="${r.id}">${r.nom}</option>`).join('');
  });
}

function utiliserRecette(id) {
  const sel = document.getElementById('lf-recette');
  if (sel) sel.value = id;
  document.getElementById('page-recettes').scrollTop = 300;
}

// ── Créer un lot ─────────────────────────────────────

async function creerLot() {
  const recetteId = parseInt(document.getElementById('lf-recette').value);
  if (!recetteId) { alert('Choisissez une recette !'); return; }

  const entree = parseFloat(document.getElementById('lf-entree').value);
  const sortie = parseFloat(document.getElementById('lf-sortie').value);
  if (!entree || !sortie) { alert('Saisissez les masses entrante et sortante !'); return; }

  const data = {
    recette_id:        recetteId,
    produit_id:        2,
    numero_lot:        document.getElementById('lf-numero').value || null,
    masse_entree_kg:   entree,
    masse_sortie_kg:   sortie,
    temperature_reelle: parseFloat(document.getElementById('lf-temp').value) || null,
    ph_reel:           parseFloat(document.getElementById('lf-ph').value) || null,
    operateur:         document.getElementById('lf-operateur').value || null,
    numero_lot_mp:     document.getElementById('lf-lot-mp').value || null,
  };

  try {
    const response = await fetch('http://127.0.0.1:8000/lots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await response.json();

    // Afficher les jauges
    afficherJauges(result, data);

    // Timeline
    ajouterTimeline(`Lot ${result.numero_lot} créé — Rendement : ${result.rendement_reel}%`,
      result.niveau_alerte === 'critique' ? 'alerte-critique' :
      result.niveau_alerte === 'mineure'  ? 'alerte-mineure'  : 'alerte-ok');

    result.alertes.forEach(a => {
      ajouterTimeline(a.message, a.gravite === 'critique' ? 'alerte-critique' : 'alerte-mineure');
    });

    if (result.dlc_calculee) {
      ajouterTimeline(`DLC calculée : ${result.dlc_calculee.split('T')[0]}`, 'alerte-ok');
    }

  } catch(e) {
    console.error('Erreur création lot:', e);
  }
}

function afficherJauges(result, data) {
  const recette = recettesData.find(r => r.id === parseInt(document.getElementById('lf-recette').value));
  if (!recette) return;

  document.getElementById('jauges-container').style.display = 'flex';

  // Jauge Rendement
  const cibleRend = recette.rendement_theorique || 98;
  const reelRend  = result.rendement_reel || 0;
  const couleurRend = reelRend >= cibleRend - 2 ? '#1a8a4a' : reelRend >= cibleRend - 4 ? '#f59e0b' : '#d93025';

  document.getElementById('j-cible-rendement').style.width = Math.min(cibleRend, 100) + '%';
  document.getElementById('j-reel-rendement').style.width  = Math.min(reelRend, 100) + '%';
  document.getElementById('j-reel-rendement').style.background = couleurRend;
  document.getElementById('jv-cible-rendement').textContent = cibleRend + '%';
  document.getElementById('jv-reel-rendement').textContent  = reelRend + '%';

  // Jauge Température
  if (data.temperature_reelle && recette.temperature_cible) {
    document.getElementById('jauge-temp-wrap').style.display = 'block';
    const cibleTemp = recette.temperature_cible;
    const reelTemp  = data.temperature_reelle;
    const maxTemp   = Math.max(cibleTemp, reelTemp) * 1.2;
    const couleurTemp = result.est_conforme_temp ? '#1a8a4a' : '#d93025';

    document.getElementById('j-cible-temp').style.width  = (cibleTemp / maxTemp * 100) + '%';
    document.getElementById('j-reel-temp').style.width   = (reelTemp  / maxTemp * 100) + '%';
    document.getElementById('j-reel-temp').style.background = couleurTemp;
    document.getElementById('jv-cible-temp').textContent = cibleTemp + '°C';
    document.getElementById('jv-reel-temp').textContent  = reelTemp  + '°C';
  }

  // Jauge pH
  if (data.ph_reel && recette.ph_cible) {
    document.getElementById('jauge-ph-wrap').style.display = 'block';
    const ciblePh = recette.ph_cible;
    const reelPh  = data.ph_reel;
    const maxPh   = 14;
    const couleurPh = result.est_conforme_ph ? '#1a8a4a' : '#d93025';

    document.getElementById('j-cible-ph').style.width  = (ciblePh / maxPh * 100) + '%';
    document.getElementById('j-reel-ph').style.width   = (reelPh  / maxPh * 100) + '%';
    document.getElementById('j-reel-ph').style.background = couleurPh;
    document.getElementById('jv-cible-ph').textContent = ciblePh;
    document.getElementById('jv-reel-ph').textContent  = reelPh;
  }
}

// ── Timeline ─────────────────────────────────────────
function ajouterTimeline(message, classe = '') {
  timelineEvents.unshift({ message, classe, heure: new Date().toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' }) });

  const liste = document.getElementById('timeline-list');
  if (!liste) return;

  liste.innerHTML = timelineEvents.slice(0, 20).map(e => `
    <div class="tl-item ${e.classe}">
      <span class="tl-time">${e.heure}</span>
      <span class="tl-msg">${e.message}</span>
    </div>
  `).join('');
}

// ── Mode Démo ────────────────────────────────────────
function chargerDemoLot() {
  if (recettesData.length === 0) {
    alert('Sauvegardez d\'abord une recette pour tester le Mode Démo !');
    return;
  }

  const recette = recettesData[0];
  document.getElementById('lf-recette').value   = recette.id;
  document.getElementById('lf-numero').value    = `LOT-DEMO-${Date.now().toString().slice(-4)}`;
  document.getElementById('lf-entree').value    = 1000;
  document.getElementById('lf-sortie').value    = 910;
  document.getElementById('lf-temp').value      = recette.temperature_cible ?
    (recette.temperature_cible + 8).toFixed(1) : 80;
  document.getElementById('lf-operateur').value = 'Démo TWINOVA';
  document.getElementById('lf-lot-mp').value    = 'MP-DEMO-001';

  ajouterTimeline('⚗️ Mode Démo activé — Données de test chargées', 'alerte-mineure');
}

// ── Simulateur de Capacité ───────────────────────────
async function simulerCapacite() {
  const recetteId = parseInt(document.getElementById('sc-recette').value);
  const objectif  = parseInt(document.getElementById('sc-objectif').value);
  const trs       = parseFloat(document.getElementById('sc-trs').value) || 85;

  if (!recetteId || !objectif) {
    alert('Choisissez une recette et un objectif de production !');
    return;
  }

  try {
    const response = await fetch(
      `http://127.0.0.1:8000/simulateur-capacite/${recetteId}?objectif_unites=${objectif}&trs_moyen=${trs}`
    );
    const result = await response.json();

    document.getElementById('sim-cap-result').style.display = 'block';
    document.getElementById('scr-matieres').textContent = result.matieres_necessaires_kg + ' kg';
    document.getElementById('scr-dechets').textContent  = result.dechets_estimes_kg + ' kg';
    document.getElementById('scr-temps').textContent    = result.temps_reel_heures + ' h';
    document.getElementById('scr-fin').textContent      = result.heure_fin_estimee;
    document.getElementById('scr-planning').textContent = result.planning_message;

    // Stocker pour export
    planningData = result;

    ajouterTimeline(`Simulation : ${objectif} unités → ${result.temps_reel_heures}h de production`, 'alerte-ok');

  } catch(e) {
    console.error('Erreur simulation capacité:', e);
  }
}

// ── Export Planning ──────────────────────────────────
function exporterPlanning() {
  if (!planningData || !planningData.objectif_unites) return;

  const recette = recettesData.find(r => r.id === parseInt(document.getElementById('sc-recette').value));
  const nomRecette = recette ? recette.nom : 'Recette inconnue';

  const contenu = [
    `PLANNING DE PRODUCTION — TWINOVA`,
    `═══════════════════════════════`,
    `Recette       : ${nomRecette}`,
    `Objectif      : ${planningData.objectif_unites} unités`,
    `TRS utilisé   : ${planningData.trs_utilise}%`,
    `─────────────────────────────────`,
    `Matières      : ${planningData.matieres_necessaires_kg} kg`,
    `Déchets       : ${planningData.dechets_estimes_kg} kg`,
    `Durée réelle  : ${planningData.temps_reel_heures} heures`,
    `Début         : ${planningData.heure_debut}`,
    `Fin estimée   : ${planningData.heure_fin_estimee}`,
    `─────────────────────────────────`,
    planningData.planning_message,
    ``,
    `Généré par TWINOVA — ${new Date().toLocaleString('fr-FR')}`
  ].join('\n');

  const blob = new Blob([contenu], { type: 'text/plain; charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `Planning_${nomRecette.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.txt`;
  a.click();
  URL.revokeObjectURL(url);

  ajouterTimeline(`Planning exporté : ${nomRecette}`, 'alerte-ok');
}
 // ── VISUALISATION 3D ─────────────────────────────────
// ── VISUALISATION 3D ─────────────────────────────────
let scene3D, camera3D, renderer3D, mesh3D;
let autoRotation = true;
let kpiColors = true;
let photos3D = [];
let kpiActuel = { trs: 0, dispo: 0, perf: 0, qual: 0 };

function initVisualisation3D() {
  const container = document.getElementById('visu-canvas-container');
  if (!container || !window.THREE) return;

  if (renderer3D) {
    renderer3D.dispose();
    container.innerHTML = '';
  }

  const w = container.clientWidth || 800;
  const h = container.clientHeight || 500;

  // Scène
  scene3D = new THREE.Scene();
  scene3D.background = new THREE.Color(0xf0f4f8);

  // Caméra
  camera3D = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
  camera3D.position.set(0, 0, 5);

  // Rendu
  renderer3D = new THREE.WebGLRenderer({ antialias: true });
  renderer3D.setSize(w, h);
  container.appendChild(renderer3D.domElement);

  // Lumières
  scene3D.add(new THREE.AmbientLight(0xffffff, 0.8));
  const dir = new THREE.DirectionalLight(0xffffff, 0.6);
  dir.position.set(5, 5, 5);
  scene3D.add(dir);

  // Grille sol
  const grid = new THREE.GridHelper(8, 12, 0xcccccc, 0xe8e8e8);
  grid.position.y = -2;
  scene3D.add(grid);

  // Créer objet par défaut
  creerObjet3D();

  // Charger KPIs
  chargerKPIs3D();

  // Contrôles souris
  setupControls3D(container);

  // Animation
  animer3D();

  // Resize
  window.addEventListener('resize', () => {
    if (!renderer3D || !container) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera3D.aspect = w / h;
    camera3D.updateProjectionMatrix();
    renderer3D.setSize(w, h);
  });
}

function creerObjet3D() {
  if (!scene3D) return;
  if (mesh3D) { scene3D.remove(mesh3D); mesh3D = null; }

  const groupe = new THREE.Group();

  if (photos3D.length === 0) {
    // Objet par défaut — machine stylisée
    const corps = new THREE.Mesh(
      new THREE.CylinderGeometry(0.8, 0.8, 2.2, 32),
      new THREE.MeshLambertMaterial({ color: getCouleurKPI() })
    );
    groupe.add(corps);

    const tete = new THREE.Mesh(
      new THREE.SphereGeometry(0.82, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: 0x0057b8 })
    );
    tete.position.y = 1.1;
    groupe.add(tete);

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(1.0, 1.0, 0.2, 32),
      new THREE.MeshLambertMaterial({ color: 0x1a2333 })
    );
    base.position.y = -1.2;
    groupe.add(base);

  } else {
    // Afficher les photos comme des panneaux 3D
    const nbPhotos = Math.min(photos3D.length, 6);
    const loader = new THREE.TextureLoader();
    const angleStep = (Math.PI * 2) / nbPhotos;
    const rayon = nbPhotos === 1 ? 0 : 1.5;

    photos3D.slice(0, nbPhotos).forEach((url, i) => {
      loader.load(url, (texture) => {
        // Calculer dimensions en gardant les proportions
        const imgW = texture.image.width;
        const imgH = texture.image.height;
        const ratio = imgW / imgH;
        const hauteur = 2.5;
        const largeur = hauteur * ratio;

        const panneau = new THREE.Mesh(
          new THREE.PlaneGeometry(largeur, hauteur),
          new THREE.MeshLambertMaterial({
            map: texture,
            side: THREE.DoubleSide,
            transparent: true
          })
        );

        if (nbPhotos === 1) {
          // Une seule photo — affichage centré face caméra
          panneau.position.set(0, 0, 0);
        } else {
          // Plusieurs photos — disposition en cercle
          const angle = i * angleStep;
          panneau.position.set(
            Math.sin(angle) * rayon,
            0,
            Math.cos(angle) * rayon
          );
          panneau.rotation.y = angle;
        }

        // Bordure colorée selon KPI
        const bordure = new THREE.Mesh(
          new THREE.PlaneGeometry(largeur + 0.1, hauteur + 0.1),
          new THREE.MeshLambertMaterial({
            color: getCouleurKPI(),
            side: THREE.DoubleSide
          })
        );
        bordure.position.z = -0.01;
        panneau.add(bordure);

        groupe.add(panneau);
      });
    });
  }

  mesh3D = groupe;
  scene3D.add(mesh3D);
}

function getCouleurKPI() {
  const trs = kpiActuel.trs;
  return trs >= 85 ? 0x1a8a4a : trs >= 60 ? 0xf59e0b : 0xd93025;
}

async function chargerKPIs3D(produitId = 2) {
  try {
    const response = await fetch(`http://127.0.0.1:8000/historique/${produitId}`);
    const data = await response.json();
    if (!data.historique || data.historique.length === 0) return;

    const e = data.historique[0];
    kpiActuel = { trs: e.trs, dispo: e.disponibilite, perf: e.performance, qual: e.qualite };

    const kpis = [
      { bar: 'vbar-trs',   val: 'vval-trs',   v: e.trs },
      { bar: 'vbar-dispo', val: 'vval-dispo',  v: e.disponibilite },
      { bar: 'vbar-perf',  val: 'vval-perf',   v: e.performance },
      { bar: 'vbar-qual',  val: 'vval-qual',   v: e.qualite },
    ];

    kpis.forEach(k => {
      const couleur = k.v >= 85 ? '#1a8a4a' : k.v >= 60 ? '#f59e0b' : '#d93025';
      const bar = document.getElementById(k.bar);
      const val = document.getElementById(k.val);
      if (bar) { bar.style.width = k.v + '%'; bar.style.background = couleur; }
      if (val) { val.textContent = k.v + '%'; val.style.color = couleur; }
    });

    const statut = e.trs >= 85 ? '✅ Performance Optimale' :
                   e.trs >= 60 ? '⚠️ Performance Attention' : '🔴 Performance Critique';
    const statutEl = document.getElementById('visu-statut');
    if (statutEl) statutEl.textContent = statut;

    // Mettre à jour les couleurs de l'objet 3D
    creerObjet3D();

  } catch(err) {
    console.error('Erreur KPIs 3D:', err);
  }
}

function chargerPhotos(input) {
  const files = Array.from(input.files);
  if (!files.length) return;

  // Ajouter aux photos existantes
  const preview = document.getElementById('photosPreview');

  files.forEach((file, i) => {
    const url = URL.createObjectURL(file);
    photos3D.push(url);

    const index = photos3D.length - 1;

    // Miniature avec bouton suppression
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:relative; display:inline-block;';
    wrapper.id = 'photo-wrapper-' + index;

    const img = document.createElement('img');
    img.src = url;
    img.className = 'visu-photo-thumb';
    img.onclick = () => appliquerPhoto(index);

    const btnDelete = document.createElement('button');
    btnDelete.textContent = '✕';
    btnDelete.style.cssText = `
      position:absolute; top:-6px; right:-6px;
      width:18px; height:18px; border-radius:50%;
      background:#d93025; color:white; border:none;
      font-size:10px; cursor:pointer; line-height:18px;
      text-align:center; padding:0;
    `;
    btnDelete.onclick = (e) => {
      e.stopPropagation();
      supprimerPhoto(index);
    };

    wrapper.appendChild(img);
    wrapper.appendChild(btnDelete);
    if (preview) preview.appendChild(wrapper);
  });

  // Recréer l'objet 3D avec toutes les photos
  creerObjet3D();
}

function supprimerPhoto(index) {
  photos3D.splice(index, 1);

  // Reconstruire la prévisualisation
  const preview = document.getElementById('photosPreview');
  if (preview) preview.innerHTML = '';

  photos3D.forEach((url, i) => {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:relative; display:inline-block;';

    const img = document.createElement('img');
    img.src = url;
    img.className = 'visu-photo-thumb';
    img.onclick = () => appliquerPhoto(i);

    const btnDelete = document.createElement('button');
    btnDelete.textContent = '✕';
    btnDelete.style.cssText = `
      position:absolute; top:-6px; right:-6px;
      width:18px; height:18px; border-radius:50%;
      background:#d93025; color:white; border:none;
      font-size:10px; cursor:pointer; line-height:18px;
      text-align:center; padding:0;
    `;
    btnDelete.onclick = (e) => {
      e.stopPropagation();
      supprimerPhoto(i);
    };

    wrapper.appendChild(img);
    wrapper.appendChild(btnDelete);
    if (preview) preview.appendChild(wrapper);
  });

  creerObjet3D();
}

function appliquerPhoto(index) {
  document.querySelectorAll('.visu-photo-thumb').forEach((img, i) => {
    img.classList.toggle('active', i === index);
  });
}

function setupControls3D(container) {
  let isDragging = false;
  let previousMousePosition = { x: 0, y: 0 };

  container.addEventListener('mousedown', (e) => {
    isDragging = true;
    autoRotation = false;
    previousMousePosition = { x: e.clientX, y: e.clientY };
  });

  container.addEventListener('mousemove', (e) => {
    if (!isDragging || !mesh3D) return;
    const delta = {
      x: e.clientX - previousMousePosition.x,
      y: e.clientY - previousMousePosition.y
    };
    mesh3D.rotation.y += delta.x * 0.01;
    mesh3D.rotation.x += delta.y * 0.005;
    previousMousePosition = { x: e.clientX, y: e.clientY };
  });

  container.addEventListener('mouseup', () => { isDragging = false; });
  container.addEventListener('mouseleave', () => { isDragging = false; });

  container.addEventListener('wheel', (e) => {
    if (!camera3D) return;
    camera3D.position.z += e.deltaY * 0.005;
    camera3D.position.z = Math.max(2, Math.min(10, camera3D.position.z));
  });
}

function animer3D() {
  if (!renderer3D) return;
  requestAnimationFrame(animer3D);
  if (autoRotation && mesh3D) mesh3D.rotation.y += 0.005;
  renderer3D.render(scene3D, camera3D);
}

function resetCamera() {
  if (camera3D) camera3D.position.set(0, 0, 5);
  if (mesh3D) { mesh3D.rotation.x = 0; mesh3D.rotation.y = 0; }
}

function toggleRotation() {
  autoRotation = !autoRotation;
  const btns = document.querySelectorAll('.visu-btn');
  if (btns[1]) btns[1].textContent = autoRotation ? '⏸ Auto-rotation' : '▶ Auto-rotation';
}

function toggleKpiColors() {
  kpiColors = !kpiColors;
  creerObjet3D();
}
  
let visu3dInitialise = false;

function navigate(pageId) {
  console.trace('🔴 navigate appelé vers: ' + pageId);
  // Cacher toutes les pages
  document.querySelectorAll('.page').forEach(p => {
    p.classList.remove('active');
    p.style.display = 'none';
  });
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  // Afficher la page demandée
  const page = document.getElementById('page-' + pageId);
  if (page) { page.style.display = 'block'; page.classList.add('active'); }

  const navItem = document.querySelector(`[data-page="${pageId}"]`);
  if (navItem) navItem.classList.add('active');

  const titleEl = document.getElementById('pageTitle');
  if (titleEl) titleEl.textContent = pageTitles[pageId] || pageId;

 if (pageId === 'dashboard') {
    setTimeout(async () => {
        await chargerDashboard();
        await chargerDonneesGraphiques();
        if (kpiChart) { kpiChart.destroy(); kpiChart = null; }
        if (lossChart) { lossChart.destroy(); lossChart = null; }
        await initKpiChart('7j');
        await initLossChart();
        if (kpiChart) kpiChart.resize();
        if (lossChart) lossChart.resize();
    }, 500);
}
  if (pageId === 'historique') setTimeout(chargerHistorique, 50);
  if (pageId === 'produits') setTimeout(chargerProduits, 50);
  if (pageId === 'recettes') setTimeout(chargerPageRecettes, 50);
  if (pageId === 'simulation') setTimeout(() => chargerDonneesSimulateur(), 50);
  if (pageId === 'visualisation') {
    setTimeout(() => {
      if (!visu3dInitialise) {
        visu3d.init();
        visu3dInitialise = true;
      }
    }, 100);
  }
  if (pageId === 'compte') setTimeout(() => {
    const user = JSON.parse(localStorage.getItem('twinova_user'));
    if (user) ouvrirPlateforme(user);
  }, 50);
  if (pageId === 'haccp') setTimeout(() => haccp.init(), 50);
  if (pageId === 'energie') setTimeout(() => energie.init(), 50);
  if (pageId === 'intelligence') setTimeout(() => predictif.init(), 100);
  if (pageId === 'benchmark') {
    try { benchmark.charger(); } catch(e) { console.warn('benchmark:', e); }
  }
  if (pageId === 'greenfield') setTimeout(() => greenfield.init(), 50);

  window.scrollTo(0, 0);
}

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', e => {
    e.preventDefault();
    navigate(item.dataset.page);
  });
});

// ── CHART KPIs ───────────────────────────────────────
const chartDatasets = {
  '7j':  { labels: [], trs: [], dispo: [], perf: [] },
  '30j': { labels: [], trs: [], dispo: [], perf: [] },
  '90j': { labels: [], trs: [], dispo: [], perf: [] }
};

async function chargerDonneesGraphiques(produitId = 2) {
  try {
    const response = await fetch(`http://127.0.0.1:8000/historique/${produitId}`);
    const data = await response.json();
    const historique = data.historique.reverse(); // Du plus ancien au plus récent

    // ── 7 derniers jours ──
    const sept = historique.slice(-7);
    chartDatasets['7j'].labels = sept.map(e => {
      const d = new Date(e.date);
      return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' });
    });
    chartDatasets['7j'].trs   = sept.map(e => e.trs);
    chartDatasets['7j'].dispo = sept.map(e => e.disponibilite);
    chartDatasets['7j'].perf  = sept.map(e => e.performance);

    // ── 30 derniers jours ──
    const trente = historique.slice(-30);
    chartDatasets['30j'].labels = trente.map(e => {
      const d = new Date(e.date);
      return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    });
    chartDatasets['30j'].trs   = trente.map(e => e.trs);
    chartDatasets['30j'].dispo = trente.map(e => e.disponibilite);
    chartDatasets['30j'].perf  = trente.map(e => e.performance);

    // ── 90 derniers jours (tous) ──
    chartDatasets['90j'].labels = historique.map(e => {
      const d = new Date(e.date);
      return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    });
    chartDatasets['90j'].trs   = historique.map(e => e.trs);
    chartDatasets['90j'].dispo = historique.map(e => e.disponibilite);
    chartDatasets['90j'].perf  = historique.map(e => e.performance);

  } catch (e) {
    console.error('Erreur chargement graphiques:', e);
  }
}

let kpiChart;
let lossChart;
async function initKpiChart(period = '7j') {
  const ctx = document.getElementById('kpiChart');
  if (!ctx) return;

  // Charger les données si vides
  if (chartDatasets[period].labels.length === 0) {
    await chargerDonneesGraphiques();
  }

  if (kpiChart) kpiChart.destroy();
  const d = chartDatasets[period];

  kpiChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: d.labels,
      datasets: [
        { label: 'TRS', data: d.trs, borderColor:'#d93025', backgroundColor:'rgba(217,48,37,0.06)', borderWidth:2, pointRadius:3, tension:0.4 },
        { label: 'Disponibilité', data: d.dispo, borderColor:'#f59e0b', backgroundColor:'rgba(245,158,11,0.04)', borderWidth:2, pointRadius:3, tension:0.4 },
        { label: 'Performance', data: d.perf, borderColor:'#0057b8', backgroundColor:'rgba(0,87,184,0.04)', borderWidth:2, pointRadius:3, tension:0.4 }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { labels: { color:'#5a6a82', font:{ family:'JetBrains Mono', size:10 }, boxWidth:12 } },
        tooltip: {
          backgroundColor:'#ffffff', borderColor:'#d0d9e8', borderWidth:1,
          titleColor:'#1a2333', bodyColor:'#5a6a82',
          titleFont:{ family:'Rajdhani', size:13 }, bodyFont:{ family:'JetBrains Mono', size:10 },
          callbacks: { label: c => ` ${c.dataset.label}: ${c.raw}%` }
        }
      },
      scales: {
        x: { grid:{ color:'#e8edf5' }, ticks:{ color:'#5a6a82', font:{ family:'JetBrains Mono', size:9 } } },
        y: { grid:{ color:'#e8edf5' }, ticks:{ color:'#5a6a82', font:{ family:'JetBrains Mono', size:9 }, callback: v => v+'%' }, min:40, max:100 }
      }
    }
  });
}

function setPeriod(p, btn) {
  document.querySelectorAll('.period-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  initKpiChart(p);
}

// ── CHART PERTES ─────────────────────────────────────
async function initLossChart(produitId = 2) {
  const ctx = document.getElementById('lossChart');
  if (!ctx) return;

  // Récupérer le dernier enregistrement
  let pannes = 42, micro = 18, setup = 15, qualite = 20;

  try {
    const response = await fetch(`http://127.0.0.1:8000/historique/${produitId}`);
    const data = await response.json();

    if (data.historique && data.historique.length > 0) {
      const dernier = data.historique[0]; // Le plus récent
      pannes  = dernier.temps_panne || 42;
      micro   = dernier.temps_micro_arret || 18;
      setup   = dernier.temps_setup || 15;

      // Pertes qualité = production non conforme × temps cycle / 60
      const rebuts = dernier.production_totale - dernier.production_conforme;
      qualite = Math.round(rebuts * 0.5); // Estimation
    }
  } catch(e) {
    console.error('Erreur graphique pertes:', e);
  }

  const total = pannes + micro + setup + qualite;

  if (lossChart) { lossChart.destroy(); lossChart = null; }
lossChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: [
        `Pannes (${pannes} min)`,
        `Micro-arrêts (${micro} min)`,
        `Setup (${setup} min)`,
        `Qualité (${qualite} min)`
      ],
      datasets: [{
        data: [pannes, micro, setup, qualite],
        backgroundColor: ['#ff4d6d','#ffc947','#ff9843','#00FFD1'],
        borderColor: '#ffffff',
        borderWidth: 3
      }]
    },
    options: {
      responsive: true,
      cutout: '62%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color:'#4a5878', font:{ family:'JetBrains Mono', size:9 }, boxWidth:10, padding:8 }
        },
        tooltip: {
          backgroundColor:'#ffffff', borderColor:'#d0d9e8', borderWidth:1,
          titleColor:'#1a2333', bodyColor:'#5a6a82',
          titleFont:{ family:'Rajdhani',size:13 }, bodyFont:{ family:'JetBrains Mono',size:10 },
          callbacks: { label: c => ` ${c.label}: ${Math.round(c.raw / total * 100)}%` }
        }
      }
    }
  });

  // Mettre à jour le total
  const totalEl = document.querySelector('.loss-total');
  if (totalEl) totalEl.textContent = `Total pertes : ${total} min/jour`;
}

// ── MINI SIMULATEUR (Dashboard) ──────────────────────
const BASE = { dispo:70, perf:80, qual:88, trs:62, planifie:480, cycle:30, cap:960, marge:2.5 };
let BASE_REEL = null; // Sera rempli avec les vraies données

async function chargerDonneesSimulateur(produitId = 2) {
  try {
    const response = await fetch(`http://127.0.0.1:8000/historique/${produitId}`);
    const data = await response.json();

    if (data.historique && data.historique.length > 0) {
      const dernier = data.historique[0];
      const prodResponse = await fetch(`http://127.0.0.1:8000/produits`);
      const produits = await prodResponse.json();
      const produit = produits.find(p => p.id === produitId) || produits[0];

      BASE_REEL = {
        dispo:    dernier.disponibilite,
        perf:     dernier.performance,
        qual:     dernier.qualite,
        trs:      dernier.trs,
        planifie: produit ? produit.temps_planifie : 480,
        cycle:    produit ? produit.temps_cycle : 30,
        cap:      produit ? produit.capacite_theorique : 960,
        marge:    produit ? produit.marge_unitaire : 2.5
      };

      // Mettre à jour le sous-titre du simulateur
      const sub = document.querySelector('#page-simulation .card-sub');
      if (sub) {
        sub.textContent = `Données réelles du ${new Date(dernier.date).toLocaleDateString('fr-FR')} — TRS actuel : ${dernier.trs}%`;
      }

      // Lancer la simulation avec les vraies données
      fullSim();
    }
  } catch(e) {
    console.error('Erreur chargement simulateur:', e);
  }
}

function calcTRS(d, p, q) { return Math.round(d * p * q / 10000 * 10) / 10; }

function miniSim(input, valId) {
  document.getElementById(valId).textContent = input.value;
  runMiniSim();
}

function runMiniSim() {
  const r1 = parseInt(document.getElementById('sv1')?.textContent || 20);
  const r2 = parseInt(document.getElementById('sv2')?.textContent || 15);
  const r3 = parseInt(document.getElementById('sv3')?.textContent || 10);

  const d = Math.min(100, Math.round(BASE.dispo * (1 + r1/100)));
  const p = Math.min(100, Math.round(BASE.perf  * (1 + r3/100)));
  const q = Math.min(100, Math.round(BASE.qual  * (1 + r2/100)));
  const trs = calcTRS(d, p, q);

  const set = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val+'%'; };
  set('ss-trs', trs); set('ss-dispo', d); set('ss-perf', p); set('ss-qual', q);

  const gainProd = Math.round((trs - 62) / 100 * BASE.cap * BASE.marge * 30);
  const gainEl = document.getElementById('ss-gain');
  if (gainEl) gainEl.textContent = '+ ' + gainProd.toLocaleString('fr-FR') + ' €/mois';
}

// ── CALCUL KPI — connecté au backend ─────────────────
async function calculateKPI(e) {
  e.preventDefault();

  const produit_id = 2; // l'id du produit qu'on vient de créer

  const data = {
    produit_id:          produit_id,
    date:                document.getElementById('f-date').value,
    temps_panne:         parseFloat(document.getElementById('f-panne').value)  || 0,
    temps_micro_arret:   parseFloat(document.getElementById('f-micro').value)  || 0,
    temps_setup:         parseFloat(document.getElementById('f-setup').value)  || 0,
    production_totale:   parseInt(document.getElementById('f-total').value)    || 0,
    production_conforme: parseInt(document.getElementById('f-conforme').value) || 0
  };

  // Afficher un message de chargement
  const btn = e.target.querySelector('button[type=submit]');
  btn.textContent = 'Calcul en cours...';
  btn.disabled = true;

  try {
    // Envoyer les données au serveur Python
    const response = await fetch('http://127.0.0.1:8000/saisie', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    const resultat = await response.json();

    if (!response.ok) {
      throw new Error(resultat.detail || 'Erreur serveur');
    }

    // Afficher les résultats
    const kpi = resultat.kpi;

    const colorFor = v => v >= 85 ? '#1a8a4a' : v >= 75 ? '#f59e0b' : '#d93025';

    const set = (id, val, color) => {
      const el = document.getElementById(id);
      if (el) { el.textContent = val; if (color) el.style.color = color; }
    };

    set('r-trs',   kpi.trs   + '%', colorFor(kpi.trs));
    set('r-dispo', kpi.disponibilite + '%', colorFor(kpi.disponibilite));
    set('r-perf',  kpi.performance   + '%', colorFor(kpi.performance));
    set('r-qual',  kpi.qualite       + '%', colorFor(kpi.qualite));
    set('r-rebuts', resultat.pertes.production_rebutee + ' pcs');
    set('r-cout',  '− ' + resultat.pertes.cout_defauts + ' €/jour');
    set('r-gain',  '+ ' + resultat.pertes.gain_potentiel_mois.toLocaleString('fr-FR') + ' €/mois');

    // Statut
    const badge = document.getElementById('result-statut');
    if (badge) {
      badge.textContent = kpi.statut.toUpperCase();
      badge.style.background = kpi.statut === 'optimal' ? 'rgba(26,138,74,0.1)' :
                               kpi.statut === 'correct' ? 'rgba(0,87,184,0.1)' :
                               kpi.statut === 'attention' ? 'rgba(245,158,11,0.1)' :
                               'rgba(217,48,37,0.1)';
      badge.style.color = kpi.statut === 'optimal' ? '#1a8a4a' :
                          kpi.statut === 'correct'  ? '#0057b8' :
                          kpi.statut === 'attention'? '#f59e0b' : '#d93025';
      badge.style.border = '1px solid currentColor';
      badge.style.borderRadius = '5px';
      badge.style.padding = '3px 9px';
      badge.style.fontFamily = 'JetBrains Mono';
      badge.style.fontSize = '10px';
      badge.style.fontWeight = '600';
    }

    // Afficher la carte résultat
    const resultCard = document.getElementById('kpiResult');
    if (resultCard) resultCard.style.display = 'block';

    // Message succès
    btn.textContent = '✓ Données sauvegardées !';
    btn.style.background = '#1a8a4a';
    btn.style.color = '#fff';

    setTimeout(() => {
      btn.textContent = 'Calculer les KPIs →';
      btn.style.background = '';
      btn.style.color = '';
      btn.disabled = false;
    }, 3000);

  } catch (error) {
    btn.textContent = '✗ Erreur : ' + error.message;
    btn.style.background = '#d93025';
    btn.style.color = '#fff';
    btn.disabled = false;
    setTimeout(() => {
      btn.textContent = 'Calculer les KPIs →';
      btn.style.background = '';
      btn.style.color = '';
    }, 3000);
  }
}

// ── SIMULATEUR COMPLET ───────────────────────────────
let simBarChart;

function fullSim() {
  const B = BASE_REEL || BASE; // Utilise les vraies données si disponibles

  const r1 = parseInt(document.getElementById('sfs1').value);
  const r2 = parseInt(document.getElementById('sfs2').value);
  const r3 = parseInt(document.getElementById('sfs3').value);
  const r4 = parseInt(document.getElementById('sfs4').value);

  document.getElementById('sf1').textContent = r1 + '%';
  document.getElementById('sf2').textContent = r2 + '%';
  document.getElementById('sf3').textContent = r3 + '%';
  document.getElementById('sf4').textContent = r4 + '%';

  const d   = Math.min(100, Math.round(B.dispo * (1 + (r1 + r4 * 0.3) / 100)));
  const p   = Math.min(100, Math.round(B.perf  * (1 + r3 / 100)));
  const q   = Math.min(100, Math.round(B.qual  * (1 + r2 / 100)));
  const trs = calcTRS(d, p, q);

  const kpis = [
    { label:'TRS',           before: Math.round(B.trs),  after: trs },
    { label:'Disponibilité', before: Math.round(B.dispo), after: d },
    { label:'Performance',   before: Math.round(B.perf),  after: p },
    { label:'Qualité',       before: Math.round(B.qual),  after: q }
  ];

  const grid = document.getElementById('simResultGrid');
  if (grid) {
    grid.innerHTML = kpis.map(k => `
      <div class="sri">
        <div class="sri-label">${k.label.toUpperCase()}</div>
        <div class="sri-vals">
          <span style="color:#ff4d6d">${k.before}%</span>
          <span class="sri-arrow">→</span>
          <span style="color:#00FFD1">${k.after}%</span>
          <span class="sri-delta">+${k.after - k.before}%</span>
        </div>
      </div>
    `).join('');
  }

  // Gain avec devise
  const gainProd = Math.round((trs - B.trs) / 100 * B.cap * B.marge * 30);
  const gainEl = document.getElementById('simGainBig');
  if (gainEl) gainEl.textContent = '+ ' + convertir(Math.max(0, gainProd));

  // Sous-titre gain
  const gainSub = document.querySelector('.sim-gain-sub');
  if (gainSub) gainSub.textContent = `basé sur une marge unitaire de ${B.marge} €/pièce`;

 // Bar chart
  const container = document.getElementById('simBarChartContainer');
  if (!container) return;
  container.innerHTML = '<canvas id="simBarChart"></canvas>';
  const ctx = document.getElementById('simBarChart');
  simBarChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: kpis.map(k => k.label),
      datasets: [
        { label:'Actuel', data: kpis.map(k => k.before), backgroundColor:'rgba(255,77,109,0.5)', borderColor:'#ff4d6d', borderWidth:1 },
        { label:'Simulé', data: kpis.map(k => k.after),  backgroundColor:'rgba(0,255,209,0.5)',  borderColor:'#00FFD1', borderWidth:1 }
      ]
    },
    options: {
      responsive: true,
      scales: {
        x: { grid:{color:'#e8edf5'}, ticks:{color:'#5a6a82', font:{family:'JetBrains Mono', size:10}} },
        y: { grid:{color:'#e8edf5'}, ticks:{color:'#5a6a82', font:{family:'JetBrains Mono', size:10}, callback: v => v+'%'}, min:0, max:110 }
      },
      plugins: {
        legend: { labels:{color:'#5a6a82', font:{family:'JetBrains Mono', size:10}} },
        tooltip: {
          backgroundColor:'#ffffff', borderColor:'#d0d9e8', borderWidth:1,
          titleColor:'#1a2333', bodyColor:'#5a6a82',
          callbacks: { label: c => ` ${c.dataset.label}: ${c.raw}%` }
        }
      }
    }
  });
}


// ── HISTORIQUE — connecté au backend ─────────────────
// ── MES PRODUITS ─────────────────────────────────────
async function chargerProduits() {
  try {
    const response = await fetch('http://127.0.0.1:8000/produits');
    const produits = await response.json();

    if (!produits || produits.length === 0) return;

    const liste = document.getElementById('produits-list');
    if (!liste) return;

    // Récupérer le dernier TRS de chaque produit
    const produitAvecKpi = await Promise.all(produits.map(async (p) => {
      try {
        const hResp = await fetch(`http://127.0.0.1:8000/historique/${p.id}`);
        const hData = await hResp.json();
        const dernier = hData.historique && hData.historique[0];
        return { ...p, trs: dernier ? dernier.trs : null };
      } catch {
        return { ...p, trs: null };
      }
    }));

    // Générer le HTML
    const cardsHTML = produitAvecKpi.map((p, i) => {
      const trs = p.trs;
      const badgeClass = trs === null ? 'badge-warning' :
                         trs >= 85 ? 'badge-ok' :
                         trs >= 60 ? 'badge-warning' : 'badge-critical';
      const statut = trs === null ? 'Aucune donnée' :
                     trs >= 85 ? 'Optimal' :
                     trs >= 60 ? 'Attention' : 'Critique';
      const trsColor = trs === null ? 'yellow' :
                       trs >= 85 ? 'teal' :
                       trs >= 60 ? 'yellow' : 'red';
      const trsAffiche = trs !== null ? trs + '%' : '—';
      const margeConvertie = convertir(p.marge_unitaire);
      const activeClass = i === 0 ? 'active-produit' : '';

      return `
        <div class="card produit-card ${activeClass}">
          <div class="produit-header">
            <div class="produit-name">${p.nom}</div>
            <span class="${badgeClass}">${statut}</span>
          </div>
          <div class="produit-meta">${p.secteur} · TRS actuel : <strong class="${trsColor}">${trsAffiche}</strong></div>
          <div class="produit-stats">
            <div><span>Capacité</span><strong>${p.capacite_theorique} pcs/j</strong></div>
            <div><span>Cycle</span><strong>${p.temps_cycle} sec</strong></div>
            <div><span>Marge</span><strong>${margeConvertie}</strong></div>
          </div>
        </div>
      `;
    }).join('');

    // Centrer si une seule ligne
    const wrapStyle = produitAvecKpi.length === 1 ?
      'display:flex; justify-content:center;' : '';

    liste.innerHTML = `
      <div style="${wrapStyle}">
        ${cardsHTML}
      </div>
      <button class="btn-accent btn-add-produit">+ Ajouter une ligne</button>
    `;

  } catch(e) {
    console.error('Erreur chargement produits:', e);
  }
}
async function chargerHistorique() {
  try {
    const response = await fetch('http://127.0.0.1:8000/historique/2');
    const data = await response.json();

    const tbody = document.querySelector('.data-table tbody');
    if (!tbody) return;

    if (data.historique.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align:center; color:var(--text-m); padding:30px">
            Aucune donnée enregistrée pour l'instant
          </td>
        </tr>`;
      return;
    }

    tbody.innerHTML = data.historique.map(e => {
      // Couleur selon le TRS
      const trsColor = e.trs >= 85 ? 'tag-green' : e.trs >= 75 ? 'tag-yellow' : 'tag-red';
      const statut   = e.trs >= 85 ? 'Optimal'   : e.trs >= 75 ? 'Correct'    : e.trs >= 60 ? 'Attention' : 'Critique';
      const badgeClass = e.trs >= 85 ? 'badge-ok' : e.trs >= 75 ? 'badge-warning' : 'badge-critical';

      // Formater la date
      const date = new Date(e.date);
      const dateStr = date.toLocaleDateString('fr-FR', {
        day: '2-digit', month: '2-digit', year: 'numeric'
      });

      return `
        <tr>
          <td>${dateStr}</td>
          <td>${data.produit}</td>
          <td><span class="${trsColor}">${e.trs}%</span></td>
          <td>${e.disponibilite}%</td>
          <td>${e.performance}%</td>
          <td>${e.qualite}%</td>
          <td><span class="${badgeClass}">${statut}</span></td>
          <td class="teal">+ ${convertir(e.gain_potentiel_mois)}/mois</td>
        </tr>`;
    }).join('');

  } catch (error) {
    console.error('Erreur chargement historique:', error);
  }
}
// ── DASHBOARD — connecté au backend ──────────────────
async function chargerDashboard() {
  try {
    const response = await fetch('http://127.0.0.1:8000/historique/2');
    const data = await response.json();

    if (!data.historique || data.historique.length === 0) return;

    // Prendre le dernier enregistrement
    const e = data.historique[0];
    const kpi = {
      trs:          e.trs,
      disponibilite: e.disponibilite,
      performance:  e.performance,
      qualite:      e.qualite
    };

    // ── Mettre à jour les cartes KPI ─────────────────
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    set('val-trs',   kpi.trs);
    set('val-dispo', kpi.disponibilite);
    set('val-perf',  kpi.performance);
    set('val-qual',  kpi.qualite);

    // ── Mettre à jour les anneaux SVG ─────────────────
    const updateRing = (id, value) => {
      const ring = document.getElementById(id);
      if (!ring) return;
      const circumference = 201;
      const offset = circumference - (value / 100) * circumference;
      ring.style.strokeDashoffset = offset;
      ring.style.stroke = value >= 85 ? '#1a8a4a' : value >= 75 ? '#f59e0b' : '#d93025';
    };

    updateRing('ring-trs',   kpi.trs);
    updateRing('ring-dispo', kpi.disponibilite);
    updateRing('ring-perf',  kpi.performance);
    updateRing('ring-qual',  kpi.qualite);

    // ── Mettre à jour les statuts ─────────────────────
    const getStatut = v => v >= 85 ? 'OPTIMAL' : v >= 75 ? 'CORRECT' : v >= 60 ? 'ATTENTION' : 'CRITIQUE';
    const getClass  = v => v >= 85 ? 'ok' : v >= 75 ? 'ok' : v >= 60 ? 'warning' : 'critical';

    const updateStatut = (cardId, value) => {
      const card = document.getElementById(cardId);
      if (!card) return;
      const badge = card.querySelector('.kpi-status');
      if (!badge) return;
      badge.textContent = getStatut(value);
      badge.className = 'kpi-status ' + getClass(value);
    };

    updateStatut('card-trs',   kpi.trs);
    updateStatut('card-dispo', kpi.disponibilite);
    updateStatut('card-perf',  kpi.performance);
    updateStatut('card-qual',  kpi.qualite);

    // ── Mettre à jour le score de santé ──────────────
    const score = Math.round((kpi.trs + kpi.disponibilite + kpi.performance + kpi.qualite) / 4);
    set('scoreValue', score);
    const scoreBar = document.getElementById('scoreBar');
    if (scoreBar) scoreBar.style.width = score + '%';

    // ── Mettre à jour l'impact financier ─────────────
    const gainMois = e.gain_potentiel_mois;
    const coutJour = Math.round(gainMois / 30);
// Mettre à jour tous les montants financiers
// Mettre à jour les coûts financiers avec IDs fixes
const couts = {
  'cout-pannes':  105,
  'cout-micro':   45,
  'cout-rebuts':  30,
  'cout-total':   180
};
Object.entries(couts).forEach(([id, val]) => {
  const el = document.getElementById(id);
  if (el) el.textContent = '− ' + convertir(val);
});
const gainEl = document.querySelector('.finance-potential .finance-value');
if (gainEl) gainEl.textContent = '+ ' + convertir(gainMois);


// Mettre à jour le simulateur
const simGain = document.getElementById('ss-gain');
if (simGain) {
  const gainProd = Math.round((62 / 100) * 960 * 2.5 * 30 * 0.2);
  simGain.textContent = '+ ' + convertir(gainProd);
}

// Mettre à jour le gain dans le score banner
const gainBanner = document.querySelector('.alert-item.info span:last-child');
if (gainBanner) gainBanner.textContent = 'Gain potentiel mensuel identifié : ' + convertir(gainMois);
// Pré-remplir chartDatasets avec les données déjà chargées
await chargerDonneesGraphiques();
  } catch (error) {
    console.error('Erreur chargement dashboard:', error);
  }
}
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
window.haccp = (() => {

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
    const token = localStorage.getItem('twinova_token');
    const opts  = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    };
    return fetch(`http://127.0.0.1:8000/haccp${path}`, opts).then(r => {
      if (!r.ok) return r.json().then(e => { throw new Error(e.detail || 'Erreur API'); });
      return r.json();
    });
  };

  const apiBase = (path, method = 'GET', body = null) => {
    const token = localStorage.getItem('twinova_token');
    const opts  = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    };
    return fetch('http://127.0.0.1:8000' + path, opts).then(r => r.json());
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
    return fetch(`http://127.0.0.1:8000/energie${path}`, {
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
    document.querySelectorAll('.etab').forEach(c => { c.style.display = 'none'; });
    const btn = document.querySelector(`[data-etab="${tab}"]`);
    const cnt = document.getElementById(`etab-${tab}`);
    if (btn) btn.classList.add('active');
    if (cnt) cnt.style.display = 'block';
    if (tab === 'carbone') energie.chargerCarbone();
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
   /* =============================================================
   TWINOVA — MODULE 5 : MAINTENANCE PRÉDICTIVE
   À coller à la fin de App.js
   Ajouter dans navigate() :
   if (pageId === 'predictif') setTimeout(() => predictif.init(), 50);
   Ajouter dans pageTitles :
   predictif: 'Maintenance Prédictive',
   ============================================================= */

const predictif = (() => {

  const PRODUIT_ID = 2;
  let state = {
    composants    : [],
    predictions   : [],
    radarChart    : null,
    hsiChart      : null,
    rapportData   : null,
  };

  // ── Helpers ─────────────────────────────────────────
  const api = (path, method = 'GET', body = null) => {
    const token = localStorage.getItem('twinova_token');
    return fetch(`http://127.0.0.1:8000/predictif${path}`, {
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
    setTimeout(() => el.remove(), 5000);
  };

  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  const fmt = (n) => n ? n.toLocaleString('fr-DZ') : '—';

  // ── INIT ────────────────────────────────────────────
  const init = async () => {
    const now = new Date();
    const moisEl = document.getElementById('rapp-mois');
    const anneeEl = document.getElementById('rapp-annee');
    if (moisEl) moisEl.value = now.getMonth() + 1;
    if (anneeEl) anneeEl.value = now.getFullYear();

    await Promise.all([
      chargerDashboard(),
      chargerComposants(),
      chargerPredictions(),
    ]);
  };

  // ── Dashboard KPIs ───────────────────────────────────
  const chargerDashboard = async () => {
    try {
      const d = await api(`/dashboard/${PRODUIT_ID}`);
      const hsi = d.hsi_moyen || 75;

      setText('pred-hsi', Math.round(hsi));
      const ring = document.getElementById('ring-hsi');
      if (ring) {
        const offset = 201 - (hsi / 100) * 201;
        ring.style.strokeDashoffset = offset;
        ring.style.stroke = hsi >= 75 ? 'var(--green)' : hsi >= 55 ? 'var(--yellow)' : 'var(--red)';
      }
      const badge = document.getElementById('pred-hsi-badge');
      if (badge) {
        badge.textContent = hsi >= 75 ? 'OPTIMAL' : hsi >= 55 ? 'SURVEILLER' : hsi >= 35 ? 'PLANIFIER' : 'CRITIQUE';
        badge.className = `kpi-status ${hsi >= 75 ? 'ok' : hsi >= 55 ? 'warning' : 'critical'}`;
      }
      setText('pred-hsi-delta', `${d.nb_composants} composants`);
      setText('pred-agir', d.alertes_agir || 0);
      setText('pred-planifier', `🟠 ${d.alertes_planifier || 0} à planifier`);
      setText('pred-surveiller', `🟡 ${d.alertes_surveiller || 0} à surveiller`);
      setText('pred-cout-evite', `${fmt(d.cout_evite_potentiel)} DZD`);
      setText('pred-fiabilite', d.taux_fiabilite_pct || '—');
      setText('pred-actives', `${d.predictions_actives || 0} prédictions actives`);
      const fiabBadge = document.getElementById('pred-fiab-badge');
      if (fiabBadge && d.taux_fiabilite_pct) {
        fiabBadge.textContent = d.taux_fiabilite_pct >= 80 ? 'FIABLE' : 'EN APPRENTISSAGE';
        fiabBadge.className = `kpi-status ${d.taux_fiabilite_pct >= 80 ? 'ok' : 'warning'}`;
      }
    } catch(e) { console.error('dashboard predictif:', e); }
  };

  // ── Composants ───────────────────────────────────────
  const chargerComposants = async () => {
    try {
      state.composants = await api(`/composants/${PRODUIT_ID}`);
      renderComposants();
      populateSelects();
    } catch(e) { console.error('composants:', e); }
  };

  const renderComposants = () => {
    const grid = document.getElementById('composants-grid');
    if (!grid) return;

    const typeIcons = {
      moteur:'⚙️', pompe:'🔄', capteur:'📡', vanne:'🔧',
      echangeur:'♨️', compresseur:'💨', convoyeur:'🏭', autre:'🔩'
    };

    grid.innerHTML = state.composants.map(c => {
      const hsi      = c.hsi_actuel;
      const alerte   = c.niveau_alerte;
      const couleur  = alerte === 'agir' ? 'var(--red)' : alerte === 'planifier' ? 'var(--orange)' :
                       alerte === 'surveiller' ? 'var(--yellow)' : 'var(--green)';
      const alerteLabel = alerte === 'agir' ? '🔴 AGIR MAINTENANT' :
                          alerte === 'planifier' ? '🟠 Planifier' :
                          alerte === 'surveiller' ? '🟡 Surveiller' : '✅ Normal';
      const usurePct = c.ratio_usure_pct || 0;
      const usureColor = usurePct >= 90 ? 'var(--red)' : usurePct >= 70 ? 'var(--yellow)' : 'var(--green)';

      return `
        <div class="composant-card alerte-${alerte}" onclick="predictif.voirAnalyse(${c.id})">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
            <div>
              <div style="font-size:18px">${typeIcons[c.type_composant] || '🔩'}</div>
              <div style="font-weight:700;font-size:14px;margin-top:4px">${c.nom}</div>
              <div style="font-family:var(--mono);font-size:10px;color:var(--text-m)">${c.type_composant}</div>
            </div>
            <div style="text-align:right">
              <div style="font-family:var(--mono);font-size:28px;font-weight:700;color:${hsi ? couleur : 'var(--text-d)'}">${hsi !== null ? Math.round(hsi) : '—'}</div>
              <div style="font-family:var(--mono);font-size:10px;color:var(--text-m)">HSI</div>
            </div>
          </div>

          <div style="font-family:var(--mono);font-size:10px;color:${couleur};font-weight:600;margin-bottom:8px">
            ${alerteLabel}
          </div>

          <div style="display:flex;justify-content:space-between;font-family:var(--mono);font-size:11px;color:var(--text-m);margin-bottom:4px">
            <span>Usure : ${usurePct}%</span>
            <span>${c.heures_utilisees}h / ${c.duree_vie_theorique_h || '?'}h</span>
          </div>
          <div class="usure-bar">
            <div class="usure-fill" style="width:${Math.min(100,usurePct)}%;background:${usureColor}"></div>
          </div>

          <div style="display:flex;justify-content:space-between;margin-top:10px;font-family:var(--mono);font-size:10px;color:var(--text-m)">
            <span>Criticité : ${'⭐'.repeat(c.criticite)}</span>
            <span>${c.derniere_mesure ? new Date(c.derniere_mesure).toLocaleDateString('fr-DZ') : 'Aucune mesure'}</span>
          </div>
        </div>
      `;
    }).join('');

    if (!state.composants.length) {
      grid.innerHTML = `<div style="grid-column:span 2;text-align:center;padding:40px;color:var(--text-m);font-family:var(--mono);font-size:12px">
        Aucun composant — cliquez "+ Ajouter" pour commencer</div>`;
    }
  };

  const populateSelects = () => {
    const selects = ['m-composant', 'radar-composant', 'analyse-composant'];
    selects.forEach(id => {
      const sel = document.getElementById(id);
      if (!sel) return;
      const val = sel.value;
      sel.innerHTML = '<option value="">— Composant —</option>' +
        state.composants.map(c => `<option value="${c.id}">${c.nom}</option>`).join('');
      if (val) sel.value = val;
    });
  };

  // ── Preview HSI ──────────────────────────────────────
  const previewHSI = () => {
    const temp  = parseFloat(document.getElementById('m-temp')?.value);
    const vib   = parseFloat(document.getElementById('m-vib')?.value);
    const micro = parseFloat(document.getElementById('m-micro')?.value);
    const rend  = parseFloat(document.getElementById('m-rendement')?.value);

    let score = 100;
    const penalites = [];

    if (!isNaN(temp)) {
      if (temp > 80) penalites.push(Math.min(40, (temp - 80) * 2));
      else if (temp > 65) penalites.push((temp - 65) * 1.5);
    }
    if (!isNaN(vib)) {
      if (vib > 7.1) penalites.push(Math.min(35, (vib - 7.1) * 5));
      else if (vib > 4.5) penalites.push((vib - 4.5) * 3);
    }
    if (!isNaN(micro)) {
      if (micro > 30) penalites.push(Math.min(20, (micro - 30) * 0.8));
      else if (micro > 20) penalites.push((micro - 20) * 0.5);
    }
    if (!isNaN(rend)) {
      if (rend < 93) penalites.push(Math.min(20, (93 - rend) * 2));
      else if (rend < 96) penalites.push((96 - rend) * 1.2);
    }

    const total = Math.min(100, penalites.reduce((a, b) => a + b, 0));
    const hsi   = Math.max(0, Math.round(100 - total));

    const ring  = document.getElementById('hsi-preview-ring');
    const valEl = document.getElementById('hsi-preview-val');
    const lblEl = document.getElementById('hsi-preview-label');

    if (!ring || !valEl) return;

    const offset = 440 - (hsi / 100) * 440;
    const color  = hsi >= 75 ? 'var(--green)' : hsi >= 55 ? 'var(--yellow)' :
                   hsi >= 35 ? 'var(--orange)' : 'var(--red)';
    const label  = hsi >= 75 ? '✅ Normal' : hsi >= 55 ? '🟡 Surveiller' :
                   hsi >= 35 ? '🟠 Planifier' : '🔴 Agir !';

    ring.style.strokeDashoffset = offset;
    ring.style.stroke = color;
    valEl.textContent = hsi;
    valEl.style.fill  = color;
    if (lblEl) { lblEl.textContent = label; lblEl.style.fill = color; }
  };

  // ── Saisir mesure ────────────────────────────────────
  const saisirMesure = async () => {
    const compId = document.getElementById('m-composant')?.value;
    if (!compId) { toast('Sélectionnez un composant', 'warning'); return; }

    const body = {
      composant_id    : parseInt(compId),
      produit_id      : PRODUIT_ID,
      shift           : document.getElementById('m-shift')?.value || 'jour',
      operateur       : document.getElementById('m-operateur')?.value || '',
      temperature_c   : parseFloat(document.getElementById('m-temp')?.value) || null,
      vibration_mm_s  : parseFloat(document.getElementById('m-vib')?.value) || null,
      courant_a       : parseFloat(document.getElementById('m-courant')?.value) || null,
      bruit_db        : parseFloat(document.getElementById('m-bruit')?.value) || null,
      micro_arrets_min: parseFloat(document.getElementById('m-micro')?.value) || null,
      ph_mesure       : parseFloat(document.getElementById('m-ph')?.value) || null,
      rendement_pct   : parseFloat(document.getElementById('m-rendement')?.value) || null,
    };

    try {
      const res = await api('/mesure', 'POST', body);
      toast(res.message, res.niveau_alerte === 'agir' ? 'error' : res.niveau_alerte === 'planifier' ? 'warning' : 'success');

      // Afficher résultat prédiction si générée
      if (res.prediction) {
        const p = res.prediction;
        const resultEl = document.getElementById('mesure-prediction-result');
        if (resultEl) {
          const niveau = res.niveau_alerte;
          const bg     = niveau === 'agir' ? 'rgba(217,48,37,.08)' : niveau === 'planifier' ? 'rgba(234,108,0,.08)' : 'rgba(245,158,11,.08)';
          const brd    = niveau === 'agir' ? 'var(--red)' : niveau === 'planifier' ? 'var(--orange)' : 'var(--yellow)';
          resultEl.style.display = 'block';
          resultEl.innerHTML = `
            <div style="background:${bg};border:1px solid ${brd};border-radius:var(--r);padding:16px">
              <div style="font-family:var(--mono);font-size:10px;color:${brd};letter-spacing:1px;margin-bottom:10px">⚡ PRÉDICTION GÉNÉRÉE</div>
              <div style="font-size:13px;font-weight:600;margin-bottom:6px">${p.action}</div>
              ${p.rul?.rul_jours ? `<div style="font-family:var(--mono);font-size:12px;color:var(--text-m)">RUL estimé : <strong>${p.rul.rul_jours} jours</strong></div>` : ''}
              <div style="margin-top:10px;display:grid;grid-template-columns:1fr 1fr;gap:8px">
                <div style="background:var(--bg-e);border-radius:var(--r);padding:10px;text-align:center">
                  <div style="font-family:var(--mono);font-size:10px;color:var(--text-m)">Si on attend</div>
                  <div style="font-family:var(--mono);font-size:15px;font-weight:700;color:var(--red)">${fmt(p.whatif?.cout_si_panne)} DZD</div>
                </div>
                <div style="background:var(--bg-e);border-radius:var(--r);padding:10px;text-align:center">
                  <div style="font-family:var(--mono);font-size:10px;color:var(--text-m)">Si on agit</div>
                  <div style="font-family:var(--mono);font-size:15px;font-weight:700;color:var(--green)">${fmt(p.whatif?.cout_preventif)} DZD</div>
                </div>
              </div>
              <div style="margin-top:8px;text-align:center;font-family:var(--mono);font-size:11px;color:var(--teal)">
                💰 Vous économisez ${fmt(p.whatif?.vous_economisez)} DZD — ${p.whatif?.ratio}
              </div>
            </div>`;
        }
      }

      await chargerComposants();
      await chargerDashboard();
      await chargerPredictions();
      await updateRadar();

    } catch(e) { toast('Erreur saisie', 'error'); }
  };

  // ── Radar de risque ──────────────────────────────────
  const updateRadar = async () => {
    const compId = document.getElementById('radar-composant')?.value;
    if (!compId) return;

    try {
      const analyse = await api(`/analyse/${compId}`);
      const radar   = analyse.radar_risque;
      if (!radar) return;

      const canvas = document.getElementById('radar-chart');
      if (!canvas) return;
      if (state.radarChart) state.radarChart.destroy();

      state.radarChart = new Chart(canvas.getContext('2d'), {
        type: 'radar',
        data: {
          labels: ['🌡️ Thermique', '📳 Mécanique', '⏱️ Process', '⚙️ Qualité', '🔩 Usure'],
          datasets: [{
            label: 'Niveau de risque (%)',
            data: [
              radar.thermique || 0,
              radar.mecanique || 0,
              radar.process   || 0,
              radar.qualite   || 0,
              radar.usure     || 0,
            ],
            backgroundColor: 'rgba(217,48,37,.15)',
            borderColor    : '#d93025',
            borderWidth    : 2,
            pointBackgroundColor: '#d93025',
            pointRadius: 5,
          }, {
            label: 'Seuil d\'alerte (50%)',
            data: [50, 50, 50, 50, 50],
            backgroundColor: 'transparent',
            borderColor    : 'rgba(245,158,11,.4)',
            borderWidth    : 1,
            borderDash     : [5, 3],
            pointRadius    : 0,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            r: {
              min: 0, max: 100,
              ticks: { font:{ family:'JetBrains Mono', size:9 }, color:'var(--text-m)', stepSize: 25 },
              grid : { color: 'var(--bg-h)' },
              angleLines: { color: 'var(--border)' },
              pointLabels: { font:{ family:'Rajdhani', size:11 }, color:'var(--text-m)' },
            }
          },
          plugins: {
            legend: { position:'bottom', labels:{ font:{family:'JetBrains Mono',size:10}, color:'var(--text-m)' } }
          }
        }
      });

      // Interprétation
      const maxRisque = Math.max(radar.thermique||0, radar.mecanique||0, radar.process||0, radar.qualite||0, radar.usure||0);
      const axes = ['thermique','mecanique','process','qualite','usure'];
      const noms = ['thermique','mécanique','process','qualité','usure'];
      const idxMax = axes.indexOf(Object.entries(radar).sort((a,b)=>b[1]-a[1])[0][0]);

      const interp = document.getElementById('radar-interpretation');
      if (interp) {
        interp.textContent = maxRisque >= 70
          ? `⚠️ Risque principal : axe ${noms[idxMax] || '—'} (${maxRisque}%). Intervention recommandée.`
          : maxRisque >= 40
          ? `🟡 Surveiller l'axe ${noms[idxMax] || '—'} (${maxRisque}%). Pas d'urgence immédiate.`
          : `✅ Tous les axes dans la zone normale. Prochain contrôle dans 7 jours.`;
      }

    } catch(e) { console.error('radar:', e); }
  };

  // ── Voir analyse composant ────────────────────────────
  const voirAnalyse = async (compId) => {
    const sel = document.getElementById('analyse-composant');
    if (sel) sel.value = compId;
    switchTab('analyse');
    await analyserComposant();
  };

  const analyserComposant = async () => {
    const compId = document.getElementById('analyse-composant')?.value;
    if (!compId) { toast('Sélectionnez un composant', 'warning'); return; }

    const container = document.getElementById('analyse-result');
    if (container) container.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-m)">Analyse en cours…</div>';

    try {
      const d = await api(`/analyse/${compId}`);
      if (!container) return;

      const hsi = d.hsi_actuel;
      const rul = d.rul;
      const tend= d.tendance_hsi;
      const corr= d.correlations;

      container.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px">
          <div style="background:var(--bg-e);border-radius:var(--r);padding:16px;text-align:center;border:1px solid var(--border)">
            <div style="font-family:var(--mono);font-size:10px;color:var(--text-m)">HSI ACTUEL</div>
            <div style="font-family:var(--mono);font-size:32px;font-weight:700;color:${hsi>=75?'var(--green)':hsi>=55?'var(--yellow)':'var(--red)'}">${hsi !== null ? Math.round(hsi) : '—'}</div>
            <div style="font-family:var(--mono);font-size:10px;color:var(--text-m)">/ 100</div>
          </div>
          <div style="background:var(--bg-e);border-radius:var(--r);padding:16px;text-align:center;border:1px solid var(--border)">
            <div style="font-family:var(--mono);font-size:10px;color:var(--text-m)">RUL ESTIMÉ</div>
            <div style="font-family:var(--mono);font-size:22px;font-weight:700;color:var(--teal)">${rul?.rul_jours || '—'}</div>
            <div style="font-family:var(--mono);font-size:10px;color:var(--text-m)">jours</div>
          </div>
          <div style="background:var(--bg-e);border-radius:var(--r);padding:16px;text-align:center;border:1px solid var(--border)">
            <div style="font-family:var(--mono);font-size:10px;color:var(--text-m)">TENDANCE</div>
            <div style="font-family:var(--mono);font-size:18px;font-weight:700;color:var(--text)">${tend?.direction || '—'}</div>
            <div style="font-family:var(--mono);font-size:10px;color:var(--text-m)">J+7: ${tend?.prevision_j7 || '—'}</div>
          </div>
          <div style="background:var(--bg-e);border-radius:var(--r);padding:16px;text-align:center;border:1px solid var(--border)">
            <div style="font-family:var(--mono);font-size:10px;color:var(--text-m)">HSI WMA</div>
            <div style="font-family:var(--mono);font-size:22px;font-weight:700;color:var(--teal)">${d.hsi_wma || '—'}</div>
            <div style="font-family:var(--mono);font-size:10px;color:var(--text-m)">pondéré</div>
          </div>
        </div>

        ${rul?.message ? `<div style="background:rgba(0,87,184,.06);border:1px solid rgba(0,87,184,.2);border-radius:var(--r);padding:14px;margin-bottom:16px;font-family:var(--mono);font-size:12px;color:var(--teal)">${rul.message}</div>` : ''}

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
          <!-- Corrélations -->
          <div>
            <div style="font-family:var(--mono);font-size:10px;color:var(--teal);letter-spacing:1.5px;margin-bottom:12px">CORRÉLATIONS (PEARSON)</div>
            ${Object.entries(corr || {}).map(([k, v]) => {
              const r = v.valeur;
              const abs = Math.abs(r);
              const w = Math.round(abs * 100);
              const col = r < -0.4 ? 'var(--red)' : r > 0.4 ? 'var(--green)' : 'var(--text-m)';
              const nom = k.replace('_vs_hsi','').replace(/_/g,' ');
              return `<div style="margin-bottom:10px">
                <div style="display:flex;justify-content:space-between;font-family:var(--mono);font-size:11px;margin-bottom:3px">
                  <span>${nom}</span><span style="color:${col};font-weight:700">r = ${r}</span>
                </div>
                <div style="height:5px;background:var(--bg-h);border-radius:3px">
                  <div style="height:100%;width:${w}%;background:${col};border-radius:3px"></div>
                </div>
                <div style="font-family:var(--mono);font-size:9px;color:var(--text-d);margin-top:2px">${v.interpretation}</div>
              </div>`;
            }).join('')}
            ${!Object.keys(corr || {}).length ? '<div style="color:var(--text-m);font-family:var(--mono);font-size:11px">Pas assez de données (min. 3 mesures)</div>' : ''}
          </div>

          <!-- Historique HSI -->
          <div>
            <div style="font-family:var(--mono);font-size:10px;color:var(--teal);letter-spacing:1.5px;margin-bottom:12px">ÉVOLUTION HSI</div>
            <canvas id="hsi-evolution-chart" height="180"></canvas>
          </div>
        </div>
      `;

      // Graphique évolution HSI
      const canvas = document.getElementById('hsi-evolution-chart');
      if (canvas && d.historique_hsi?.length) {
        if (state.hsiChart) state.hsiChart.destroy();
        const labels = d.historique_hsi.map(h => new Date(h.date).toLocaleDateString('fr-DZ', {day:'2-digit',month:'short'}));
        const valeurs = d.historique_hsi.map(h => h.hsi);

        state.hsiChart = new Chart(canvas.getContext('2d'), {
          type: 'line',
          data: {
            labels,
            datasets: [{
              label: 'HSI',
              data : valeurs,
              borderColor : '#0057b8',
              backgroundColor: 'rgba(0,87,184,.08)',
              borderWidth: 2, pointRadius: 4, tension: 0.4, fill: true,
            }, {
              label: 'Seuil alerte (55)',
              data : labels.map(() => 55),
              borderColor: 'rgba(245,158,11,.5)',
              borderDash: [5,3], borderWidth: 1, pointRadius: 0, fill: false,
            }]
          },
          options: {
            responsive:true,
            plugins:{ legend:{ labels:{ font:{family:'JetBrains Mono',size:10}, color:'var(--text-m)' } } },
            scales:{
              x:{ grid:{color:'var(--bg-h)'}, ticks:{font:{family:'JetBrains Mono',size:9}} },
              y:{ min:0, max:100, grid:{color:'var(--bg-h)'}, ticks:{font:{family:'JetBrains Mono',size:9}} }
            }
          }
        });
      }

    } catch(e) { if (container) container.innerHTML = '<div style="color:var(--red);padding:20px">Erreur analyse</div>'; }
  };

  // ── Prédictions ──────────────────────────────────────
  const chargerPredictions = async () => {
    try {
      state.predictions = await api(`/predictions/${PRODUIT_ID}`);
      renderPredictions();
      renderChronologie();
    } catch(e) { console.error('predictions:', e); }
  };

  const renderPredictions = () => {
    const container = document.getElementById('predictions-list');
    if (!container) return;

    if (!state.predictions.length) {
      container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-m);font-family:var(--mono);font-size:12px">✅ Aucune prédiction de panne active — machines en bon état</div>';
      return;
    }

    container.innerHTML = state.predictions.map(p => {
      const prob    = Math.round((p.probabilite_panne || 0) * 100);
      const probCol = prob >= 70 ? 'var(--red)' : prob >= 40 ? 'var(--orange)' : 'var(--yellow)';
      const niveau  = p.niveau_alerte;

      return `
        <div class="pred-card ${niveau}">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
            <div>
              <div style="font-weight:700;font-size:14px">${p.composant_nom}</div>
              <div style="font-family:var(--mono);font-size:10px;color:var(--text-m)">${new Date(p.date_prediction).toLocaleString('fr-DZ')}</div>
            </div>
            <div style="text-align:right">
              <div style="font-family:var(--mono);font-size:22px;font-weight:700;color:${probCol}">${prob}%</div>
              <div style="font-family:var(--mono);font-size:10px;color:var(--text-m)">probabilité</div>
            </div>
          </div>

          <div style="font-family:var(--mono);font-size:11px;color:var(--text-m);margin-bottom:8px">
            🔍 Signal : ${p.signal_declencheur || '—'}
          </div>
          <div style="font-size:13px;font-weight:600;margin-bottom:10px">${p.action_recommandee || '—'}</div>

          ${p.rul_jours ? `<div style="font-family:var(--mono);font-size:11px;color:var(--teal);margin-bottom:10px">
            ⏳ RUL : ${p.rul_jours} jours — panne estimée le ${p.date_panne_estimee ? new Date(p.date_panne_estimee).toLocaleDateString('fr-DZ') : '—'}
          </div>` : ''}

          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px">
            <div style="background:rgba(217,48,37,.08);border-radius:var(--r);padding:8px;text-align:center">
              <div style="font-family:var(--mono);font-size:9px;color:var(--text-m)">Si panne</div>
              <div style="font-family:var(--mono);font-size:13px;font-weight:700;color:var(--red)">${fmt(p.whatif_cout_panne)} DZD</div>
            </div>
            <div style="background:rgba(26,138,74,.08);border-radius:var(--r);padding:8px;text-align:center">
              <div style="font-family:var(--mono);font-size:9px;color:var(--text-m)">Prévention</div>
              <div style="font-family:var(--mono);font-size:13px;font-weight:700;color:var(--green)">${fmt(p.whatif_cout_prev)} DZD</div>
            </div>
            <div style="background:var(--teal-dim);border-radius:var(--r);padding:8px;text-align:center">
              <div style="font-family:var(--mono);font-size:9px;color:var(--teal)">Économie</div>
              <div style="font-family:var(--mono);font-size:13px;font-weight:700;color:var(--teal)">${p.ratio_economie}x</div>
            </div>
          </div>

          <div style="display:flex;gap:8px">
            <button onclick="predictif.validerPrediction(${p.id},'validee')"
              style="flex:1;padding:8px;background:rgba(26,138,74,.1);border:1px solid var(--green);color:var(--green);border-radius:var(--r);font-family:var(--font);font-size:12px;font-weight:600;cursor:pointer">
              ✅ Panne survenue
            </button>
            <button onclick="predictif.validerPrediction(${p.id},'fausse')"
              style="flex:1;padding:8px;background:var(--bg-e);border:1px solid var(--border-b);color:var(--text-m);border-radius:var(--r);font-family:var(--font);font-size:12px;cursor:pointer">
              ❌ Fausse alerte
            </button>
          </div>
        </div>
      `;
    }).join('');
  };

  const renderChronologie = () => {
    const container = document.getElementById('chronologie-list');
    if (!container) return;

    const preds = state.predictions.filter(p => p.date_panne_estimee)
      .sort((a, b) => new Date(a.date_panne_estimee) - new Date(b.date_panne_estimee));

    if (!preds.length) {
      container.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-m);font-family:var(--mono);font-size:11px">✅ Aucune intervention prévue</div>';
      return;
    }

    const couleurs = { agir: 'var(--red)', planifier: 'var(--orange)', surveiller: 'var(--yellow)', normal: 'var(--green)' };

    container.innerHTML = preds.map(p => `
      <div class="chron-item">
        <div class="chron-dot" style="background:${couleurs[p.niveau_alerte] || 'var(--teal)'}"></div>
        <div style="flex:1">
          <div style="font-weight:700;font-size:13px">${p.composant_nom}</div>
          <div style="font-family:var(--mono);font-size:11px;color:${couleurs[p.niveau_alerte]}">
            📅 ${new Date(p.date_panne_estimee).toLocaleDateString('fr-DZ', {day:'2-digit',month:'long',year:'numeric'})}
          </div>
          <div style="font-family:var(--mono);font-size:10px;color:var(--text-m);margin-top:2px">${p.action_recommandee?.substring(0,60)}…</div>
        </div>
        <div style="text-align:right">
          <div style="font-family:var(--mono);font-size:18px;font-weight:700;color:${couleurs[p.niveau_alerte]}">${Math.round((p.probabilite_panne||0)*100)}%</div>
          <div style="font-family:var(--mono);font-size:9px;color:var(--text-m)">${p.rul_jours ? `J-${p.rul_jours}` : ''}</div>
        </div>
      </div>
    `).join('');
  };

  // ── Valider prédiction ────────────────────────────────
  const validerPrediction = async (id, statut) => {
    try {
      await api('/valider-prediction', 'POST', { prediction_id: id, statut });
      toast(statut === 'validee' ? '✅ Prédiction validée — fiabilité améliorée' : '❌ Fausse alerte enregistrée');
      await chargerPredictions();
      await chargerDashboard();
    } catch(e) { toast('Erreur', 'error'); }
  };

  // ── Rapport mensuel ───────────────────────────────────
  const genererRapport = async () => {
    const mois  = document.getElementById('rapp-mois')?.value;
    const annee = document.getElementById('rapp-annee')?.value;

    try {
      const r = await api(`/rapport/${PRODUIT_ID}?mois=${mois}&annee=${annee}`);
      state.rapportData = r;

      const container = document.getElementById('rapport-result');
      if (!container) return;

      const moisNoms = ['','Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

      container.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px">
          <div style="background:var(--bg-e);border-radius:var(--r);padding:16px;text-align:center;border:1px solid var(--border)">
            <div style="font-family:var(--mono);font-size:10px;color:var(--text-m)">FIABILITÉ</div>
            <div style="font-family:var(--mono);font-size:32px;font-weight:700;color:${r.taux_fiabilite>=80?'var(--green)':'var(--yellow)'}">${r.taux_fiabilite}%</div>
          </div>
          <div style="background:var(--bg-e);border-radius:var(--r);padding:16px;text-align:center;border:1px solid var(--border)">
            <div style="font-family:var(--mono);font-size:10px;color:var(--text-m)">PRÉDICTIONS</div>
            <div style="font-family:var(--mono);font-size:32px;font-weight:700">${r.nb_predictions}</div>
          </div>
          <div style="background:var(--bg-e);border-radius:var(--r);padding:16px;text-align:center;border:1px solid var(--border)">
            <div style="font-family:var(--mono);font-size:10px;color:var(--green)">VALIDÉES</div>
            <div style="font-family:var(--mono);font-size:32px;font-weight:700;color:var(--green)">${r.nb_validees}</div>
          </div>
          <div style="background:var(--bg-e);border-radius:var(--r);padding:16px;text-align:center;border:1px solid var(--border)">
            <div style="font-family:var(--mono);font-size:10px;color:var(--teal)">COÛT ÉVITÉ</div>
            <div style="font-family:var(--mono);font-size:22px;font-weight:700;color:var(--teal)">${fmt(r.cout_evite_dzd)}</div>
            <div style="font-family:var(--mono);font-size:10px;color:var(--text-m)">DZD</div>
          </div>
        </div>

        <div style="background:var(--bg-e);border-radius:var(--r);border:1px solid var(--border);overflow:hidden">
          <table class="data-table">
            <thead><tr>
              <th>Composant</th><th>Date</th><th>Probabilité</th><th>Statut</th><th>Action</th>
            </tr></thead>
            <tbody>
              ${(r.predictions || []).map(p => `
                <tr>
                  <td>${p.composant}</td>
                  <td>${p.date}</td>
                  <td style="font-family:var(--mono)">${Math.round((p.probabilite||0)*100)}%</td>
                  <td><span class="${p.statut==='validee'?'tag-green':p.statut==='fausse'?'tag-red':'tag-yellow'}">${p.statut}</span></td>
                  <td style="font-size:12px;color:var(--text-m)">${(p.action||'').substring(0,50)}</td>
                </tr>`).join('')}
              ${!r.predictions?.length ? '<tr><td colspan="5" style="text-align:center;color:var(--text-m)">Aucune prédiction ce mois</td></tr>' : ''}
            </tbody>
          </table>
        </div>
      `;
    } catch(e) { toast('Aucune donnée pour cette période', 'warning'); }
  };

  const exporterRapport = () => {
    if (!state.rapportData) { toast('Générez d\'abord un rapport', 'warning'); return; }
    const r = state.rapportData;
    const moisNoms = ['','Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
    const contenu = [
      `RAPPORT MAINTENANCE PRÉDICTIVE — TWINOVA`,
      `════════════════════════════════════════`,
      `Période        : ${moisNoms[r.mois]} ${r.annee}`,
      `Fiabilité      : ${r.taux_fiabilite}%`,
      `Prédictions    : ${r.nb_predictions} (${r.nb_validees} validées / ${r.nb_fausses} fausses)`,
      `Coût évité     : ${fmt(r.cout_evite_dzd)} DZD`,
      `────────────────────────────────────────`,
      `DÉTAIL DES PRÉDICTIONS :`,
      ...(r.predictions||[]).map(p => `• ${p.composant} (${p.date}) — ${Math.round((p.probabilite||0)*100)}% — ${p.statut}`),
      ``,
      `Généré par TWINOVA — ${new Date().toLocaleString('fr-DZ')}`,
    ].join('\n');

    const blob = new Blob([contenu], { type: 'text/plain; charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `Rapport_Predictif_${moisNoms[r.mois]}_${r.annee}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Composant modal ───────────────────────────────────
  const openAddComposant = () => {
    document.getElementById('modal-composant').style.display = 'flex';
  };

  const sauvegarderComposant = async () => {
    const nom = document.getElementById('nc-nom')?.value;
    if (!nom) { toast('Entrez un nom', 'warning'); return; }

    try {
      await api('/composants', 'POST', {
        produit_id           : PRODUIT_ID,
        nom,
        type_composant       : document.getElementById('nc-type')?.value || 'autre',
        criticite            : parseInt(document.getElementById('nc-criticite')?.value) || 3,
        duree_vie_theorique_h: parseFloat(document.getElementById('nc-duree')?.value) || null,
        cout_remplacement    : parseFloat(document.getElementById('nc-cout')?.value) || null,
      });
      toast('✅ Composant ajouté');
      document.getElementById('modal-composant').style.display = 'none';
      await chargerComposants();
    } catch(e) { toast('Erreur', 'error'); }
  };

  // ── Onglets ──────────────────────────────────────────
  const switchTab = (tab) => {
    document.querySelectorAll('[data-ptab]').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.ptab').forEach(c => { c.style.display = 'none'; });
    const btn = document.querySelector(`[data-ptab="${tab}"]`);
    const cnt = document.getElementById(`ptab-${tab}`);
    if (btn) btn.classList.add('active');
    if (cnt) cnt.style.display = 'block';
    if (tab === 'predictions') renderPredictions();
    if (tab === 'rapport') genererRapport();
};

  const refresh = async () => {
    await init();
    toast('✅ Données actualisées');
  };

  return {
    init, refresh, switchTab,
    previewHSI, saisirMesure, updateRadar,
    voirAnalyse, analyserComposant,
    chargerPredictions, validerPrediction,
    genererRapport, exporterRapport,
    openAddComposant, sauvegarderComposant,
  };

})();


/* Ajouter dans navigate() :
   if (pageId === 'predictif') setTimeout(() => predictif.init(), 50);
*/

   
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
    return fetch(`http://127.0.0.1:8000/greenfield${path}`, {
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
/* =============================================================
   TWINOVA — MODULE VISUALISATION 3D — Jumeau Numérique
   Remplacer tout le contenu de la section visualisation dans App.js

   Dans navigate() :
   if (pageId === 'visualisation') {
       document.getElementById('page-visualisation').style.display = 'block';
       setTimeout(() => visu3d.init(), 100);
   }
   ============================================================= */



window.addEventListener('load', () => {
    // Appliquer la devise sauvegardée
    const deviseSauvegardee = localStorage.getItem('twinova_devise');
    if (deviseSauvegardee) {
        deviseActive = deviseSauvegardee;
        const selector = document.getElementById('devise-selector');
        if (selector) selector.value = deviseSauvegardee;
    }
    changerDevise(deviseActive);

    setTimeout(async () => {
        await chargerDonneesGraphiques();
        if (kpiChart) { kpiChart.destroy(); kpiChart = null; }
        if (lossChart) { lossChart.destroy(); lossChart = null; }
        await initKpiChart('7j');
        await initLossChart();
    }, 1000);
});
