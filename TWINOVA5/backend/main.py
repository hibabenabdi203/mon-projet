# ═══════════════════════════════════════════════
# TWINOVA — Serveur Principal (FastAPI)
# Point d'entrée de toute l'API
# ═══════════════════════════════════════════════
from fastapi import FastAPI, Depends, HTTPException
from haccp_models import PlanHACCP, SeuilCritique, ControleHACCP, AlerteHACCP, StatutSanitaireLot, NiveauGravite, StatutLotHACCP, TypeParametreHACCP, seed_haccp_demo
from haccp_routes import router_haccp
from energie_models import TarifEnergie, SaisieEnergie, SeuilEnergie, LossCostingEnergie, AuditEnergetique, TypeEnergie, PeriodeTarifaire, NiveauAlerteEnergie, seed_energie_demo
from energie_routes import router_energie
from predictif_models import (ComposantMachine, MesureComposant, PredictionPanne, PatternPanne, RapportPredictif, NiveauAlertePredict, TypeComposant, StatutPrediction, seed_predictif_demo)
from predictif_routes import router_predictif
from benchmark_models import seed_benchmark_demo
from benchmark_routes import router_benchmark
from greenfield_models import seed_greenfield_demo
from greenfield_routes import router_greenfield
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from datetime import date as date_type

from database import init_db, get_db, SessionLocal, Produit, Enregistrement
from auth import Utilisateur, chiffrer_mdp, verifier_mdp, creer_token, verifier_token
from models import ProduitCreate, SaisieCreate, SimulationRequest
from kpi import calculer_kpi

# ── Créer l'application ──────────────────────────
app = FastAPI(
    title="TWINOVA API",
    description="Plateforme de Digital Model pour PME industrielles",
    version="1.0.0"
)

# ── Autoriser le frontend à parler au backend ────
from fastapi.middleware.cors import CORSMiddleware

from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router_haccp)
app.include_router(router_energie)
app.include_router(router_predictif)
app.include_router(router_benchmark)
app.include_router(router_greenfield)
# ── Créer les tables au démarrage ────────────────
@app.on_event("startup")
def startup():
    init_db()
    db = SessionLocal()
    seed_haccp_demo(db)
    seed_energie_demo(db)
    seed_predictif_demo(db)
    seed_benchmark_demo(db)
    seed_greenfield_demo(db)

    db.close()
    # Créer la table utilisateurs
    from database import engine
    from auth import Utilisateur
    Utilisateur.__table__.create(bind=engine, checkfirst=True)


# ════════════════════════════════════════════════
# ROUTE DE TEST
# ════════════════════════════════════════════════
@app.get("/")
def accueil():
    return {"message": "TWINOVA API fonctionne ✅", "version": "1.0.0"}


# ════════════════════════════════════════════════
# PRODUITS
# ════════════════════════════════════════════════

@app.get("/produits")
def liste_produits(db: Session = Depends(get_db)):
    """Retourne tous les produits"""
    return db.query(Produit).all()


@app.post("/produits")
def creer_produit(data: ProduitCreate, db: Session = Depends(get_db)):
    """Crée un nouveau produit / ligne de production"""
    produit = Produit(
        nom                = data.nom,
        secteur            = data.secteur,
        temps_cycle        = data.temps_cycle,
        temps_planifie     = data.temps_planifie,
        marge_unitaire     = data.marge_unitaire,
        capacite_theorique = data.capacite_theorique
    )
    db.add(produit)
    db.commit()
    db.refresh(produit)
    return {"message": f"Produit '{produit.nom}' créé ✅", "id": produit.id}


@app.delete("/produits/{produit_id}")
def supprimer_produit(produit_id: int, db: Session = Depends(get_db)):
    """Supprime un produit"""
    produit = db.query(Produit).filter(Produit.id == produit_id).first()
    if not produit:
        raise HTTPException(status_code=404, detail="Produit introuvable")
    db.delete(produit)
    db.commit()
    return {"message": "Produit supprimé ✅"}


# ════════════════════════════════════════════════
# SAISIE & CALCUL KPI
# ════════════════════════════════════════════════

@app.post("/saisie")
def saisir_et_calculer(data: SaisieCreate, db: Session = Depends(get_db)):
    """
    Reçoit les données de production,
    calcule les KPIs et sauvegarde tout en base de données
    """

    # Récupérer le produit
    produit = db.query(Produit).filter(Produit.id == data.produit_id).first()
    if not produit:
        raise HTTPException(status_code=404, detail="Produit introuvable")

    # Calculer les KPIs
    resultat = calculer_kpi(
        temps_planifie      = produit.temps_planifie,
        temps_cycle         = produit.temps_cycle,
        capacite_theorique  = produit.capacite_theorique,
        marge_unitaire      = produit.marge_unitaire,
        temps_panne         = data.temps_panne,
        temps_micro_arret   = data.temps_micro_arret,
        temps_setup         = data.temps_setup,
        production_totale   = data.production_totale,
        production_conforme = data.production_conforme
    )

    # Sauvegarder en base de données
    enregistrement = Enregistrement(
        produit_id          = data.produit_id,
        date                = date_type.fromisoformat(data.date) if data.date else date_type.today(),
        temps_panne         = data.temps_panne,
        temps_micro_arret   = data.temps_micro_arret,
        temps_setup         = data.temps_setup,
        production_totale   = data.production_totale,
        production_conforme = data.production_conforme,
        trs                 = resultat["kpi"]["trs"],
        disponibilite       = resultat["kpi"]["disponibilite"],
        performance         = resultat["kpi"]["performance"],
        qualite             = resultat["kpi"]["qualite"],
        gain_potentiel_mois = resultat["pertes"]["gain_potentiel_mois"]
    )
    db.add(enregistrement)
    db.commit()
    db.refresh(enregistrement)

    return {
        "message": "Données sauvegardées ✅",
        "enregistrement_id": enregistrement.id,
        "produit": produit.nom,
        "kpi": resultat["kpi"],
        "pertes": resultat["pertes"],
        "recommandations": resultat["recommandations"]
    }


# ════════════════════════════════════════════════
# HISTORIQUE
# ════════════════════════════════════════════════

@app.get("/historique/{produit_id}")
def historique(produit_id: int, db: Session = Depends(get_db)):
    """Retourne l'historique de production d'un produit"""
    produit = db.query(Produit).filter(Produit.id == produit_id).first()
    if not produit:
        raise HTTPException(status_code=404, detail="Produit introuvable")

    enregistrements = db.query(Enregistrement).filter(
        Enregistrement.produit_id == produit_id
    ).order_by(Enregistrement.date.desc()).all()

    return {
        "produit": produit.nom,
        "total_enregistrements": len(enregistrements),
        "historique": [
            {
                "id":                 e.id,
                "date":               str(e.date),
                "trs":                e.trs,
                "disponibilite":      e.disponibilite,
                "performance":        e.performance,
                "qualite":            e.qualite,
                "gain_potentiel_mois": e.gain_potentiel_mois
            }
            for e in enregistrements
        ]
    }


# ════════════════════════════════════════════════
# SIMULATION
# ════════════════════════════════════════════════

@app.post("/simulation")
def simuler(data: SimulationRequest, db: Session = Depends(get_db)):
    """Simule l'impact d'améliorations sur les KPIs"""

    produit = db.query(Produit).filter(Produit.id == data.produit_id).first()
    if not produit:
        raise HTTPException(status_code=404, detail="Produit introuvable")

    # KPIs actuels
    actuel = calculer_kpi(
        temps_planifie      = produit.temps_planifie,
        temps_cycle         = produit.temps_cycle,
        capacite_theorique  = produit.capacite_theorique,
        marge_unitaire      = produit.marge_unitaire,
        temps_panne         = data.temps_panne,
        temps_micro_arret   = data.temps_micro_arret,
        temps_setup         = data.temps_setup,
        production_totale   = data.production_totale,
        production_conforme = data.production_conforme
    )

    # Appliquer les améliorations simulées
    new_panne  = data.temps_panne        * (1 - data.reduction_panne_pct / 100)
    new_micro  = data.temps_micro_arret  * (1 - data.augmentation_cadence_pct / 100 * 0.5)
    new_setup  = data.temps_setup        * 0.9

    temps_gagne       = (data.temps_panne - new_panne)
    prod_supplementaire = int(temps_gagne / (produit.temps_cycle / 60))
    new_total         = data.production_totale + prod_supplementaire

    rebuts_actuels    = data.production_totale - data.production_conforme
    new_rebuts        = int(rebuts_actuels * (1 - data.reduction_defaut_pct / 100))
    new_conforme      = new_total - new_rebuts

    # KPIs simulés
    simule = calculer_kpi(
        temps_planifie      = produit.temps_planifie,
        temps_cycle         = produit.temps_cycle,
        capacite_theorique  = produit.capacite_theorique,
        marge_unitaire      = produit.marge_unitaire,
        temps_panne         = new_panne,
        temps_micro_arret   = new_micro,
        temps_setup         = new_setup,
        production_totale   = new_total,
        production_conforme = new_conforme
    )

    gain_direct = (new_conforme - data.production_conforme) * produit.marge_unitaire * 30

    return {
        "actuel":       actuel["kpi"],
        "simule":       simule["kpi"],
        "gain_mensuel": round(gain_direct, 2),
        "deltas": {
            "trs":           round(simule["kpi"]["trs"]          - actuel["kpi"]["trs"], 1),
            "disponibilite": round(simule["kpi"]["disponibilite"] - actuel["kpi"]["disponibilite"], 1),
            "performance":   round(simule["kpi"]["performance"]   - actuel["kpi"]["performance"], 1),
            "qualite":       round(simule["kpi"]["qualite"]       - actuel["kpi"]["qualite"], 1),
        }
    }

# ════════════════════════════════════════════════
# AUTHENTIFICATION
# ════════════════════════════════════════════════

@app.post("/inscription")
def inscription(data: dict, db: Session = Depends(get_db)):
    """Crée un nouveau compte entreprise"""

    # Vérifier si l'email existe déjà
    existant = db.query(Utilisateur).filter(
        Utilisateur.email == data["email"]
    ).first()

    if existant:
        raise HTTPException(
            status_code=400,
            detail="Cet email est déjà utilisé"
        )

    # Créer l'utilisateur
    utilisateur = Utilisateur(
        nom_entreprise = data["nom_entreprise"],
        email          = data["email"],
        mot_de_passe   = chiffrer_mdp(data["mot_de_passe"])
    )
    db.add(utilisateur)
    db.commit()
    db.refresh(utilisateur)

    # Créer le token
    token = creer_token({
        "user_id": utilisateur.id,
        "email":   utilisateur.email
    })

    return {
        "message": f"Compte créé pour {utilisateur.nom_entreprise} ✅",
        "token":   token,
        "user": {
            "id":             utilisateur.id,
            "nom_entreprise": utilisateur.nom_entreprise,
            "email":          utilisateur.email
        }
    }


@app.post("/connexion")
def connexion(data: dict, db: Session = Depends(get_db)):
    """Connecte un utilisateur existant"""

    # Trouver l'utilisateur
    utilisateur = db.query(Utilisateur).filter(
        Utilisateur.email == data["email"]
    ).first()

    if not utilisateur:
        raise HTTPException(
            status_code=401,
            detail="Email ou mot de passe incorrect"
        )

    # Vérifier le mot de passe
    if not verifier_mdp(data["mot_de_passe"], utilisateur.mot_de_passe):
        raise HTTPException(
            status_code=401,
            detail="Email ou mot de passe incorrect"
        )

    # Créer le token
    token = creer_token({
        "user_id": utilisateur.id,
        "email":   utilisateur.email
    })

    return {
        "message": f"Bienvenue {utilisateur.nom_entreprise} ✅",
        "token":   token,
        "user": {
            "id":             utilisateur.id,
            "nom_entreprise": utilisateur.nom_entreprise,
            "email":          utilisateur.email
        }
    }


@app.get("/me")
def mon_profil(token: str, db: Session = Depends(get_db)):
    """Retourne les infos de l'utilisateur connecté"""

    payload = verifier_token(token)
    if not payload:
        raise HTTPException(
            status_code=401,
            detail="Token invalide ou expiré"
        )

    utilisateur = db.query(Utilisateur).filter(
        Utilisateur.id == payload["user_id"]
    ).first()

    if not utilisateur:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")

    return {
        "id":             utilisateur.id,
        "nom_entreprise": utilisateur.nom_entreprise,
        "email":          utilisateur.email
    }

# ── Lancer le serveur ────────────────────────────
# ════════════════════════════════════════════════
# PLAN D'ACTION
# ════════════════════════════════════════════════

@app.get("/plan-action/{produit_id}")
def plan_action(produit_id: int, db: Session = Depends(get_db)):
    """Génère un plan d'action basé sur les vrais KPIs"""

    produit = db.query(Produit).filter(Produit.id == produit_id).first()
    if not produit:
        raise HTTPException(status_code=404, detail="Produit introuvable")

    dernier = db.query(Enregistrement).filter(
        Enregistrement.produit_id == produit_id
    ).order_by(Enregistrement.date.desc()).first()

    if not dernier:
        raise HTTPException(status_code=404, detail="Aucune donnée disponible")

    recommandations = []

    if dernier.disponibilite < 85:
        ecart = round(85 - dernier.disponibilite, 1)
        gain  = round(dernier.gain_potentiel_mois * 0.4, 0)
        recommandations.append({
            "priorite":    "critique" if dernier.disponibilite < 70 else "attention",
            "numero":      "01",
            "icone":       "🔧",
            "titre":       "Maintenance préventive urgente",
            "description": f"{dernier.temps_panne} min de pannes/jour dégradent la disponibilité. Intervention mécanique recommandée sous 48h.",
            "impact_kpi":  f"+{ecart}% disponibilité",
            "gain":        gain,
            "ecart":       ecart
        })

    if dernier.performance < 85:
        ecart = round(85 - dernier.performance, 1)
        gain  = round(dernier.gain_potentiel_mois * 0.3, 0)
        recommandations.append({
            "priorite":    "critique" if dernier.performance < 70 else "attention",
            "numero":      "02",
            "icone":       "⚡",
            "titre":       "Réduire les micro-arrêts",
            "description": f"{dernier.temps_micro_arret} min de micro-arrêts/jour. Standardiser les procédures de changement de série.",
            "impact_kpi":  f"+{ecart}% performance",
            "gain":        gain,
            "ecart":       ecart
        })

    if dernier.qualite < 95:
        ecart  = round(95 - dernier.qualite, 1)
        rebuts = dernier.production_totale - dernier.production_conforme
        gain   = round(dernier.gain_potentiel_mois * 0.3, 0)
        recommandations.append({
            "priorite":    "critique" if dernier.qualite < 80 else "moyenne",
            "numero":      "03",
            "icone":       "📋",
            "titre":       "Optimiser les paramètres qualité",
            "description": f"{rebuts} pièces rebutées/jour. Vérifier le réglage des paramètres process.",
            "impact_kpi":  f"+{ecart}% qualité",
            "gain":        gain,
            "ecart":       ecart
        })

    if not recommandations:
        recommandations.append({
            "priorite":    "optimal",
            "numero":      "01",
            "icone":       "✅",
            "titre":       "Performance excellente !",
            "description": "Tous vos KPIs sont au-dessus des objectifs. Continuez sur cette lancée.",
            "impact_kpi":  "TRS >= 85%",
            "gain":        0,
            "ecart":       0
        })

    return {
        "produit":         produit.nom,
        "date":            str(dernier.date),
        "trs":             dernier.trs,
        "disponibilite":   dernier.disponibilite,
        "performance":     dernier.performance,
        "qualite":         dernier.qualite,
        "recommandations": recommandations,
        "gain_total":      round(dernier.gain_potentiel_mois, 0)
    }
# ════════════════════════════════════════════════
# MODULE 2 — RECETTES & PROCESS
# ════════════════════════════════════════════════

from database import TemplateRecette, Recette, Ingredient, LotProduction, AlerteLot

@app.get("/templates-recettes")
def liste_templates(db: Session = Depends(get_db)):
    """Retourne tous les templates disponibles"""
    templates = db.query(TemplateRecette).filter(
        TemplateRecette.est_actif == True
    ).all()
    return [
        {
            "id": t.id,
            "secteur": t.secteur,
            "nom_template": t.nom_template,
            "description": t.description,
            "temperature_cible": t.temperature_cible,
            "temperature_tolerance": t.temperature_tolerance,
            "temps_cycle_theorique": t.temps_cycle_theorique,
            "rendement_theorique": t.rendement_theorique,
            "ph_cible": t.ph_cible,
            "ph_tolerance": t.ph_tolerance,
            "dlc_theorique_jours": t.dlc_theorique_jours
        }
        for t in templates
    ]

@app.post("/recettes")
def creer_recette(data: dict, db: Session = Depends(get_db)):
    """Crée une nouvelle recette"""
    recette = Recette(
        produit_id            = data.get("produit_id"),
        template_id           = data.get("template_id"),
        utilisateur_id        = data.get("utilisateur_id", 1),
        nom                   = data["nom"],
        description           = data.get("description", ""),
        temperature_cible     = data.get("temperature_cible"),
        temperature_tolerance = data.get("temperature_tolerance", 2.0),
        temps_cycle_theorique = data.get("temps_cycle_theorique"),
        rendement_theorique   = data.get("rendement_theorique", 98.0),
        ph_cible              = data.get("ph_cible"),
        ph_tolerance          = data.get("ph_tolerance", 0.2),
        temps_melange_min     = data.get("temps_melange_min"),
        pression_bar          = data.get("pression_bar"),
        dlc_theorique_jours   = data.get("dlc_theorique_jours"),
        temperature_stockage  = data.get("temperature_stockage")
    )
    db.add(recette)
    db.commit()
    db.refresh(recette)

    for ing in data.get("ingredients", []):
        ingredient = Ingredient(
            recette_id         = recette.id,
            nom                = ing["nom"],
            quantite_theorique = ing["quantite"],
            unite              = ing.get("unite", "kg"),
            est_allergene      = ing.get("est_allergene", False),
            fournisseur        = ing.get("fournisseur", "")
        )
        db.add(ingredient)
    db.commit()

    return {"message": f"Recette '{recette.nom}' créée ✅", "id": recette.id}
@app.get("/recettes")
def liste_toutes_recettes(db: Session = Depends(get_db)):
    """Retourne toutes les recettes — pour HACCP"""
    recettes = db.query(Recette).all()
    return [{"id": r.id, "nom": r.nom} for r in recettes]
@app.get("/recettes/{produit_id}")
def liste_recettes(produit_id: int, db: Session = Depends(get_db)):
    """Retourne les recettes d'un produit"""
    recettes = db.query(Recette).filter(
        Recette.produit_id == produit_id,
        Recette.est_active == True
    ).all()
    return [
        {
            "id": r.id,
            "nom": r.nom,
            "description": r.description,
            "temperature_cible": r.temperature_cible,
            "temperature_tolerance": r.temperature_tolerance,
            "rendement_theorique": r.rendement_theorique,
            "ph_cible": r.ph_cible,
            "dlc_theorique_jours": r.dlc_theorique_jours,
            "ingredients": [
                {
                    "nom": i.nom,
                    "quantite": i.quantite_theorique,
                    "unite": i.unite,
                    "est_allergene": i.est_allergene
                }
                for i in r.ingredients
            ]
        }
        for r in recettes
    ]

@app.post("/lots")
def creer_lot(data: dict, db: Session = Depends(get_db)):
    """Crée un lot de production et calcule le rendement"""
    from datetime import datetime as dt, timedelta

    recette = db.query(Recette).filter(Recette.id == data["recette_id"]).first()
    if not recette:
        raise HTTPException(status_code=404, detail="Recette introuvable")

    masse_entree = data.get("masse_entree_kg", 0)
    masse_sortie = data.get("masse_sortie_kg", 0)
    temp_reelle  = data.get("temperature_reelle")
    ph_reel      = data.get("ph_reel")

    rendement_reel  = (masse_sortie / masse_entree * 100) if masse_entree > 0 else 0
    perte_kg        = masse_entree - masse_sortie
    ecart_rendement = rendement_reel - recette.rendement_theorique

    est_conforme_temp = None
    if temp_reelle and recette.temperature_cible:
        est_conforme_temp = abs(temp_reelle - recette.temperature_cible) <= recette.temperature_tolerance

    est_conforme_ph = None
    if ph_reel and recette.ph_cible:
        est_conforme_ph = abs(ph_reel - recette.ph_cible) <= recette.ph_tolerance

    dlc_calculee = None
    if recette.dlc_theorique_jours and recette.temperature_stockage and temp_reelle:
        dlc_jours    = recette.dlc_theorique_jours * (2.0 ** ((recette.temperature_stockage - temp_reelle) / 10))
        dlc_calculee = dt.now() + timedelta(days=max(0, dlc_jours))

    alertes       = []
    niveau_alerte = "aucune"

    if ecart_rendement < -4:
        niveau_alerte = "critique"
        alertes.append({
            "type": "rendement", "gravite": "critique",
            "message": f"⚠️ Perte matière anormale de {abs(ecart_rendement):.1f}% ! Vérifier fuites et collage parois.",
            "valeur_mesuree": rendement_reel, "valeur_cible": recette.rendement_theorique
        })
    elif ecart_rendement < -2:
        niveau_alerte = "mineure"
        alertes.append({
            "type": "rendement", "gravite": "mineure",
            "message": f"Rendement légèrement sous la cible ({ecart_rendement:.1f}%)",
            "valeur_mesuree": rendement_reel, "valeur_cible": recette.rendement_theorique
        })

    if est_conforme_temp == False:
        ecart_temp = abs(temp_reelle - recette.temperature_cible)
        gravite    = "critique" if ecart_temp > recette.temperature_tolerance * 2 else "mineure"
        if gravite == "critique":
            niveau_alerte = "critique"
        alertes.append({
            "type": "temperature", "gravite": gravite,
            "message": f"🌡️ Température hors tolérance : {temp_reelle}°C (cible: {recette.temperature_cible}°C ± {recette.temperature_tolerance}°C)",
            "valeur_mesuree": temp_reelle, "valeur_cible": recette.temperature_cible
        })

    lot = LotProduction(
        numero_lot         = data.get("numero_lot", f"LOT-{dt.now().strftime('%Y%m%d%H%M%S')}"),
        recette_id         = data["recette_id"],
        produit_id         = data.get("produit_id"),
        utilisateur_id     = data.get("utilisateur_id", 1),
        machines_utilisees = data.get("machines_utilisees", []),
        masse_entree_kg    = masse_entree,
        masse_sortie_kg    = masse_sortie,
        temperature_reelle = temp_reelle,
        ph_reel            = ph_reel,
        date_debut         = dt.now(),
        statut             = "termine",
        rendement_reel     = round(rendement_reel, 2),
        perte_kg           = round(perte_kg, 2),
        ecart_rendement    = round(ecart_rendement, 2),
        est_conforme_temp  = est_conforme_temp,
        est_conforme_ph    = est_conforme_ph,
        dlc_calculee       = dlc_calculee,
        niveau_alerte      = niveau_alerte,
        alertes_actives    = alertes,
        numero_lot_mp      = data.get("numero_lot_mp"),
        operateur          = data.get("operateur"),
        notes              = data.get("notes")
    )
    db.add(lot)
    db.commit()
    db.refresh(lot)

    for a in alertes:
        alerte = AlerteLot(
            lot_id         = lot.id,
            type_alerte    = a["type"],
            gravite        = a["gravite"],
            message        = a["message"],
            valeur_mesuree = a.get("valeur_mesuree"),
            valeur_cible   = a.get("valeur_cible"),
            ecart          = (a.get("valeur_mesuree", 0) or 0) - (a.get("valeur_cible", 0) or 0)
        )
        db.add(alerte)
    db.commit()

    return {
        "message":        f"Lot {lot.numero_lot} créé ✅",
        "id":             lot.id,
        "numero_lot":     lot.numero_lot,
        "rendement_reel": lot.rendement_reel,
        "perte_kg":       lot.perte_kg,
        "ecart_rendement": lot.ecart_rendement,
        "est_conforme_temp": lot.est_conforme_temp,
        "est_conforme_ph":   lot.est_conforme_ph,
        "dlc_calculee":   str(lot.dlc_calculee) if lot.dlc_calculee else None,
        "niveau_alerte":  lot.niveau_alerte,
        "alertes":        alertes
    }
@app.get("/lots")
def liste_tous_lots(db: Session = Depends(get_db)):
    """Retourne tous les lots — pour HACCP"""
    lots = db.query(LotProduction).order_by(LotProduction.date_debut.desc()).all()
    return [
        {
            "id":           l.id,
            "numero_lot":   l.numero_lot,
            "date_debut":   str(l.date_debut),
            "statut":       l.statut,
            "recette_id":   l.recette_id,
            "rendement_reel": l.rendement_reel,
            "niveau_alerte": l.niveau_alerte,
        }
        for l in lots
    ]
@app.get("/lots/{produit_id}")
def liste_lots(produit_id: int, db: Session = Depends(get_db)):
    """Retourne l'historique des lots"""
    lots = db.query(LotProduction).filter(
        LotProduction.produit_id == produit_id
    ).order_by(LotProduction.date_debut.desc()).all()
    return [
        {
            "id":             l.id,
            "numero_lot":     l.numero_lot,
            "date_debut":     str(l.date_debut),
            "statut":         l.statut,
            "masse_entree_kg": l.masse_entree_kg,
            "masse_sortie_kg": l.masse_sortie_kg,
            "rendement_reel": l.rendement_reel,
            "perte_kg":       l.perte_kg,
            "ecart_rendement": l.ecart_rendement,
            "est_conforme_temp": l.est_conforme_temp,
            "niveau_alerte":  l.niveau_alerte,
            "alertes":        l.alertes_actives or []
        }
        for l in lots
    ]

@app.get("/simulateur-capacite/{recette_id}")
def simuler_capacite(
    recette_id:      int,
    objectif_unites: int,
    trs_moyen:       float = 85.0,
    db: Session = Depends(get_db)
):
    """Simule les besoins pour produire X unités"""
    from datetime import datetime as dt, timedelta

    recette = db.query(Recette).filter(Recette.id == recette_id).first()
    if not recette:
        raise HTTPException(status_code=404, detail="Recette introuvable")

    temps_theorique_min  = (objectif_unites * recette.temps_cycle_theorique or 30) / 60
    temps_reel_min       = temps_theorique_min / (trs_moyen / 100)
    matieres_necessaires = objectif_unites / (recette.rendement_theorique / 100)
    dechets_estimes      = matieres_necessaires - objectif_unites

    heure_debut = dt.now()
    heure_fin   = heure_debut + timedelta(minutes=temps_reel_min)

    return {
        "objectif_unites":          objectif_unites,
        "trs_utilise":              trs_moyen,
        "temps_theorique_heures":   round(temps_theorique_min / 60, 2),
        "temps_reel_heures":        round(temps_reel_min / 60, 2),
        "matieres_necessaires_kg":  round(matieres_necessaires, 2),
        "dechets_estimes_kg":       round(dechets_estimes, 2),
        "heure_debut":              heure_debut.strftime("%d/%m/%Y %H:%M"),
        "heure_fin_estimee":        heure_fin.strftime("%d/%m/%Y %H:%M"),
        "planning_message":         f"Pour produire {objectif_unites} unités, démarrez à {heure_debut.strftime('%H:%M')} pour finir à {heure_fin.strftime('%H:%M')} le {heure_fin.strftime('%d/%m/%Y')}"
    }
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)