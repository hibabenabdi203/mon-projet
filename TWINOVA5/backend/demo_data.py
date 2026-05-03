# ═══════════════════════════════════════════════
# TWINOVA — Script de données de démonstration
# Génère 30 jours d'historique pour 3 lignes
# ═══════════════════════════════════════════════

import sys
import os
import random
from datetime import date, timedelta

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import init_db, get_db, Produit, Enregistrement, engine
from sqlalchemy.orm import Session
from sqlalchemy import text

def generer_journee(produit, date_j, scenario):
    """Génère des données réalistes selon le scénario"""
    
    scenarios = {
        'excellent':  dict(panne=(5,15),  micro=(5,10),  setup=(5,10),  qualite=(0.97,1.00)),
        'bon':        dict(panne=(15,30), micro=(10,18), setup=(10,15), qualite=(0.93,0.97)),
        'normal':     dict(panne=(30,45), micro=(15,25), setup=(12,18), qualite=(0.88,0.94)),
        'mauvais':    dict(panne=(45,70), micro=(20,30), setup=(15,25), qualite=(0.80,0.90)),
        'critique':   dict(panne=(70,100),micro=(25,40), setup=(20,30), qualite=(0.65,0.82)),
    }
    
    s = scenarios[scenario]
    
    temps_panne      = round(random.uniform(*s['panne']), 1)
    temps_micro      = round(random.uniform(*s['micro']), 1)
    temps_setup      = round(random.uniform(*s['setup']), 1)
    taux_qualite     = random.uniform(*s['qualite'])
    
    # Calcul production théorique
    temps_fonctionnel = produit.temps_planifie - temps_panne - temps_setup - temps_micro
    temps_fonctionnel = max(temps_fonctionnel, 10)
    prod_theorique    = int((temps_fonctionnel * 60) / produit.temps_cycle)
    
    # Production réelle légèrement en dessous du théorique
    prod_totale   = int(prod_theorique * random.uniform(0.85, 0.98))
    prod_conforme = int(prod_totale * taux_qualite)
    
    return {
        'temps_panne':         temps_panne,
        'temps_micro_arret':   temps_micro,
        'temps_setup':         temps_setup,
        'production_totale':   prod_totale,
        'production_conforme': prod_conforme,
    }

def calculer_kpi(produit, data):
    """Calcule les KPIs depuis les données"""
    tp = produit.temps_planifie
    
    disponibilite = ((tp - data['temps_panne'] - data['temps_setup']) / tp) * 100
    
    temps_net      = tp - data['temps_panne'] - data['temps_setup'] - data['temps_micro_arret']
    prod_theorique = (temps_net * 60) / produit.temps_cycle
    performance    = (data['production_totale'] / prod_theorique) * 100 if prod_theorique > 0 else 0
    
    qualite = (data['production_conforme'] / data['production_totale']) * 100 if data['production_totale'] > 0 else 0
    
    trs = (disponibilite * performance * qualite) / 10000
    
    prod_optimale       = produit.capacite_theorique * 0.85
    production_perdue   = max(0, prod_optimale - data['production_conforme'])
    gain_potentiel_mois = production_perdue * produit.marge_unitaire * 30
    
    return {
        'trs':                 round(trs, 2),
        'disponibilite':       round(disponibilite, 2),
        'performance':         round(performance, 2),
        'qualite':             round(qualite, 2),
        'gain_potentiel_mois': round(gain_potentiel_mois, 2),
    }

def main():
    print("🚀 Génération des données de démonstration TWINOVA...")
    
    # Initialiser la base
    init_db()
    
    db = Session(engine)
    
    try:
        # ── Créer les 3 produits ──────────────────────────
        print("\n📦 Création des lignes de production...")
        
        produits_data = [
            dict(nom="Ligne Yaourts Nature",    secteur="Agroalimentaire", temps_cycle=25, temps_planifie=480, marge_unitaire=45,  capacite_theorique=1152),
            dict(nom="Ligne Fromage Frais",      secteur="Agroalimentaire", temps_cycle=35, temps_planifie=480, marge_unitaire=85,  capacite_theorique=822),
            dict(nom="Ligne Lait Pasteurisé",    secteur="Agroalimentaire", temps_cycle=15, temps_planifie=480, marge_unitaire=28,  capacite_theorique=1920),
        ]
        
        produits = []
        for pd in produits_data:
            # Vérifier si existe déjà
            existant = db.query(Produit).filter(Produit.nom == pd['nom']).first()
            if existant:
                produits.append(existant)
                print(f"  ✅ {pd['nom']} — déjà existant (id: {existant.id})")
            else:
                p = Produit(**pd)
                db.add(p)
                db.commit()
                db.refresh(p)
                produits.append(p)
                print(f"  ✅ {pd['nom']} créé (id: {p.id})")
        
        # ── Générer 30 jours d'historique ────────────────
        print("\n📅 Génération de 30 jours d'historique...")
        
        # Scénarios réalistes — simulation d'une vraie PME
        # Semaine 1: démarrage difficile
        # Semaine 2: amélioration progressive
        # Semaine 3: excellente semaine
        # Semaine 4: retour de problèmes puis redressement
        
        calendrier = [
            # Semaine 1 — Démarrage difficile
            'critique', 'mauvais',  'mauvais',  'normal',   'mauvais',  'critique', 'mauvais',
            # Semaine 2 — Amélioration
            'normal',   'normal',   'bon',      'bon',      'normal',   'bon',      'bon',
            # Semaine 3 — Excellente
            'excellent','bon',      'excellent','excellent','bon',      'excellent','excellent',
            # Semaine 4 — Rechute puis redressement
            'critique', 'mauvais',  'normal',   'bon',      'bon',      'excellent','bon',
            # Jours 29-30
            'excellent','excellent',
        ]
        
        aujourd_hui  = date.today()
        date_debut   = aujourd_hui - timedelta(days=29)
        
        total_crees = 0
        
        for produit in produits:
            print(f"\n  📊 {produit.nom}...")
            
            for i, scenario in enumerate(calendrier):
                date_j = date_debut + timedelta(days=i)
                
                # Vérifier si enregistrement existe déjà pour ce jour
                existant = db.query(Enregistrement).filter(
                    Enregistrement.produit_id == produit.id,
                    Enregistrement.date == date_j
                ).first()
                
                if existant:
                    continue
                
                # Variation légère entre produits
                random.seed(i * produit.id * 7)
                
                data = generer_journee(produit, date_j, scenario)
                kpis = calculer_kpi(produit, data)
                
                enreg = Enregistrement(
                    produit_id          = produit.id,
                    date                = date_j,
                    temps_panne         = data['temps_panne'],
                    temps_micro_arret   = data['temps_micro_arret'],
                    temps_setup         = data['temps_setup'],
                    production_totale   = data['production_totale'],
                    production_conforme = data['production_conforme'],
                    trs                 = kpis['trs'],
                    disponibilite       = kpis['disponibilite'],
                    performance         = kpis['performance'],
                    qualite             = kpis['qualite'],
                    gain_potentiel_mois = kpis['gain_potentiel_mois'],
                )
                
                db.add(enreg)
                total_crees += 1
            
            db.commit()
            print(f"    ✅ 30 jours générés")
        
        print(f"\n🎉 Terminé ! {total_crees} enregistrements créés.")
        print(f"   3 lignes × 30 jours = 90 enregistrements au total")
        print(f"\n✅ Rafraîchis la plateforme pour voir les données !")
        
    except Exception as e:
        print(f"\n❌ Erreur: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    main()