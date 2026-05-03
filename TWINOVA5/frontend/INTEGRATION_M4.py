"""
=============================================================
TWINOVA MODULE 4 — GUIDE D'INTÉGRATION
=============================================================

1. COPIER les fichiers dans le projet :
   energie_models.py  → backend/
   energie_routes.py  → backend/
   energie_section.html → contenu à coller dans index.html
   energie_app.js       → contenu à coller dans App.js

2. MODIFIER backend/main.py :
─────────────────────────────────────────────────────
# En haut, après les autres imports :
from energie_models import (
    TarifEnergie, SaisieEnergie, SeuilEnergie,
    LossCostingEnergie, AuditEnergetique,
    TypeEnergie, PeriodeTarifaire, NiveauAlerteEnergie,
    seed_energie_demo
)
from energie_routes import router_energie

# Après app.include_router(router_haccp) :
app.include_router(router_energie)

# Dans startup(), après seed_haccp_demo(db) :
seed_energie_demo(db)
─────────────────────────────────────────────────────

3. MODIFIER frontend/index.html :
   - Coller le contenu de energie_section.html juste avant </main>
   - Ajouter dans la sidebar (après HACCP) :
     <a href="#" class="nav-item" data-page="energie">
         <svg class="nav-icon" viewBox="0 0 20 20">
           <path d="M11 2L4 12h7l-2 6 9-10h-7l2-6z" fill="currentColor"/>
         </svg>
         Énergie & Économie
     </a>

4. MODIFIER frontend/App.js :
   - Coller le contenu de energie_app.js à la fin
   - Dans la fonction navigate(), ajouter :
     if (pageId === 'energie') setTimeout(() => energie.init(), 50);
   - Dans pageTitles, ajouter :
     energie: 'Optimisation Énergétique',

5. REDÉMARRER le backend :
   uvicorn main:app --reload --port 8000

=============================================================
FONCTIONNALITÉS MODULE 4 LIVRÉES :
✅ EPI (Intensité Énergétique) : kWh/unité, m³/unité
✅ Energy Pulse — jauge temps réel coût lot en cours
✅ Loss Costing — coût réel décomposé (matières + énergie + MO + amortissement)
✅ Bilan Carbone — kg CO₂, arbres équivalents, objectifs
✅ Comparaison shifts jour/nuit — détection gaspillages
✅ Audit mensuel automatique — recommandations IA
✅ Graphique Productivité vs Énergie
✅ Alertes de dérive EPI (normal / attention / critique)
✅ Gestion multi-tarifs (heures pleines / creuses / pointe)
✅ Score d'efficacité énergétique 0-100
✅ Export rapport audit .txt
✅ Données démo (tarifs DZD + seuils secteur laitier)
=============================================================
"""