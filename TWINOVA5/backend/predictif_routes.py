"""
=============================================================
TWINOVA — MODULE 5 : MAINTENANCE PRÉDICTIVE
Routes API — ajouter dans main.py :
from predictif_models import (ComposantMachine, MesureComposant,
    PredictionPanne, PatternPanne, RapportPredictif,
    NiveauAlertePredict, TypeComposant, StatutPrediction,
    seed_predictif_demo)
from predictif_routes import router_predictif
app.include_router(router_predictif)
Dans startup() : seed_predictif_demo(db)
=============================================================
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timedelta, date
import math
import statistics

from database import get_db
from predictif_models import (
    ComposantMachine, MesureComposant, PredictionPanne,
    PatternPanne, RapportPredictif,
    NiveauAlertePredict, TypeComposant, StatutPrediction
)

router_predictif = APIRouter(prefix="/predictif", tags=["Prédictif"])


# ──────────────────────────────────────────────────────────────
# SCHÉMAS PYDANTIC
# ──────────────────────────────────────────────────────────────

class MesureCreate(BaseModel):
    composant_id     : int
    produit_id       : int
    shift            : str = "jour"
    temperature_c    : Optional[float] = None
    vibration_mm_s   : Optional[float] = None
    courant_a        : Optional[float] = None
    pression_bar     : Optional[float] = None
    debit_l_h        : Optional[float] = None
    bruit_db         : Optional[float] = None
    vitesse_rpm      : Optional[float] = None
    micro_arrets_min : Optional[float] = None
    ph_mesure        : Optional[float] = None
    rendement_pct    : Optional[float] = None
    operateur        : Optional[str]   = None
    notes            : Optional[str]   = None

class ComposantCreate(BaseModel):
    produit_id            : int
    nom                   : str
    type_composant        : str = "autre"
    description           : Optional[str] = None
    duree_vie_theorique_h : Optional[float] = None
    heures_utilisees      : float = 0.0
    cout_remplacement     : Optional[float] = None
    criticite             : int = 3

class ValidationPrediction(BaseModel):
    prediction_id        : int
    statut               : str
    date_panne_reelle    : Optional[str] = None
    commentaire          : Optional[str] = None


# ──────────────────────────────────────────────────────────────
# SCIENCE — FORMULES MATHÉMATIQUES
# ──────────────────────────────────────────────────────────────

def calculer_hsi(mesure: MesureCreate, composant: ComposantMachine) -> float:
    """
    Health Score Index (HSI) — 0 à 100
    Inspiré du modèle de dégradation de Wiener.
    Score = 100 − Σ(pénalités normalisées par paramètre)
    """
    score = 100.0
    penalites = []

    # Température (référence : <60°C = OK, >80°C = critique)
    if mesure.temperature_c is not None:
        T = mesure.temperature_c
        if T > 80:
            penalites.append(min(40, (T - 80) * 2))
        elif T > 65:
            penalites.append((T - 65) * 1.5)

    # Vibration (référence ISO 10816 : <2.8 mm/s = OK, >7.1 = critique)
    if mesure.vibration_mm_s is not None:
        V = mesure.vibration_mm_s
        if V > 7.1:
            penalites.append(min(35, (V - 7.1) * 5))
        elif V > 4.5:
            penalites.append((V - 4.5) * 3)

    # Micro-arrêts (>20 min/j = signal faible)
    if mesure.micro_arrets_min is not None:
        MA = mesure.micro_arrets_min
        if MA > 30:
            penalites.append(min(20, (MA - 30) * 0.8))
        elif MA > 20:
            penalites.append((MA - 20) * 0.5)

    # Rendement (cible ≥ 97%)
    if mesure.rendement_pct is not None:
        R = mesure.rendement_pct
        if R < 93:
            penalites.append(min(20, (93 - R) * 2))
        elif R < 96:
            penalites.append((96 - R) * 1.2)

    # pH dérive (cible ±0.2)
    if mesure.ph_mesure is not None:
        # On considère pH cible ~4.3 pour yaourt ou 6.5 pour lait
        ph_ecart = abs(mesure.ph_mesure - 4.3) if mesure.ph_mesure < 5 else abs(mesure.ph_mesure - 6.5)
        if ph_ecart > 0.5:
            penalites.append(min(15, ph_ecart * 10))

    # Usure théorique basée sur heures d'utilisation
    if composant.duree_vie_theorique_h and composant.heures_utilisees:
        ratio_usure = composant.heures_utilisees / composant.duree_vie_theorique_h
        if ratio_usure > 0.9:
            penalites.append(min(25, (ratio_usure - 0.9) * 250))
        elif ratio_usure > 0.75:
            penalites.append((ratio_usure - 0.75) * 60)

    total_penalite = min(100, sum(penalites))
    return max(0.0, round(100 - total_penalite, 1))


def calculer_niveau_alerte_hsi(hsi: float) -> str:
    if hsi >= 75:
        return NiveauAlertePredict.NORMAL
    elif hsi >= 55:
        return NiveauAlertePredict.SURVEILLER
    elif hsi >= 35:
        return NiveauAlertePredict.PLANIFIER
    else:
        return NiveauAlertePredict.AGIR


def regression_lineaire(valeurs: list) -> dict:
    """
    Régression linéaire simple y = a*x + b
    Retourne : pente, ordonnée, R², prévision J+7
    """
    n = len(valeurs)
    if n < 3:
        return {"pente": 0, "r2": 0, "prevision_j7": valeurs[-1] if valeurs else 0}

    x = list(range(n))
    mean_x = sum(x) / n
    mean_y = sum(valeurs) / n

    num   = sum((x[i] - mean_x) * (valeurs[i] - mean_y) for i in range(n))
    denom = sum((x[i] - mean_x) ** 2 for i in range(n))

    if denom == 0:
        return {"pente": 0, "r2": 0, "prevision_j7": valeurs[-1]}

    a = num / denom
    b = mean_y - a * mean_x

    # R²
    ss_res = sum((valeurs[i] - (a * x[i] + b)) ** 2 for i in range(n))
    ss_tot = sum((valeurs[i] - mean_y) ** 2 for i in range(n))
    r2     = round(1 - ss_res / ss_tot, 3) if ss_tot > 0 else 0

    prevision_j7 = round(a * (n + 7) + b, 2)

    return {"pente": round(a, 4), "r2": r2, "prevision_j7": prevision_j7, "b": round(b, 4)}


def moyenne_mobile_ponderee(valeurs: list, poids: list = None) -> float:
    """
    WMA — Weighted Moving Average
    Donne plus d'importance aux valeurs récentes.
    """
    n = len(valeurs)
    if n == 0:
        return 0.0
    if poids is None:
        poids = list(range(1, n + 1))

    total_poids = sum(poids[-n:])
    if total_poids == 0:
        return valeurs[-1]

    wma = sum(valeurs[i] * poids[i] for i in range(n)) / total_poids
    return round(wma, 3)


def calculer_rul(composant: ComposantMachine, hsi_actuel: float, taux_degradation: float) -> dict:
    """
    Remaining Useful Life — modèle linéaire de dégradation.
    RUL = (HSI_actuel - HSI_seuil_critique) / taux_degradation_par_heure
    HSI seuil critique = 25 (en dessous = panne imminente)
    """
    hsi_critique = 25.0

    if taux_degradation <= 0:
        return {
            "rul_heures": None,
            "date_panne": None,
            "message": "Pas assez de données pour calculer le RUL"
        }

    rul_h = max(0, (hsi_actuel - hsi_critique) / taux_degradation)
    date_panne = datetime.utcnow() + timedelta(hours=rul_h)

    return {
        "rul_heures"      : round(rul_h, 1),
        "rul_jours"       : round(rul_h / 24, 1),
        "date_panne"      : date_panne.isoformat(),
        "fiabilite_heures": round(composant.heures_utilisees, 0),
        "ratio_usure_pct" : round(composant.heures_utilisees / composant.duree_vie_theorique_h * 100, 1) if composant.duree_vie_theorique_h else None,
        "message"         : (
            f"⚠️ AGIR MAINTENANT — panne estimée dans {round(rul_h, 0):.0f}h" if rul_h < 8 else
            f"🟠 Planifier intervention dans {round(rul_h/24, 1)} jours" if rul_h < 72 else
            f"🟡 Surveiller — {round(rul_h/24, 0):.0f} jours de fonctionnement estimés"
        )
    }


def pearson_correlation(x: list, y: list) -> float:
    """Coefficient de corrélation de Pearson entre deux séries."""
    n = len(x)
    if n < 3 or len(y) != n:
        return 0.0

    mean_x = sum(x) / n
    mean_y = sum(y) / n

    num   = sum((x[i] - mean_x) * (y[i] - mean_y) for i in range(n))
    denom = math.sqrt(
        sum((x[i] - mean_x) ** 2 for i in range(n)) *
        sum((y[i] - mean_y) ** 2 for i in range(n))
    )

    if denom == 0:
        return 0.0
    return round(num / denom, 3)


def random_forest_simple(mesure: MesureCreate, patterns: list) -> dict:
    """
    Random Forest simplifié — vote majoritaire sur les patterns connus.
    Chaque pattern est un 'arbre de décision' binaire.
    """
    votes_panne = 0
    votes_ok    = 0
    patterns_declenches = []

    for p in patterns:
        declenchee = False

        if p.seuil_temperature and mesure.temperature_c:
            if mesure.temperature_c >= p.seuil_temperature:
                declenchee = True

        if p.seuil_vibration and mesure.vibration_mm_s:
            if mesure.vibration_mm_s >= p.seuil_vibration:
                declenchee = True

        if p.seuil_micro_arrets and mesure.micro_arrets_min:
            if mesure.micro_arrets_min >= p.seuil_micro_arrets:
                declenchee = True

        if p.seuil_rendement and mesure.rendement_pct:
            if mesure.rendement_pct <= p.seuil_rendement:
                declenchee = True

        if declenchee:
            votes_panne += p.fiabilite_pattern
            patterns_declenches.append({
                "nom"            : p.nom_pattern,
                "heures_avant"   : p.heures_avant_panne,
                "cout_panne"     : p.cout_moyen_panne,
                "fiabilite"      : p.fiabilite_pattern,
            })
        else:
            votes_ok += (1 - (p.fiabilite_pattern or 0.5))

    total = votes_panne + votes_ok
    prob_panne = round(votes_panne / total, 3) if total > 0 else 0.0

    heures_avant = min(
        (p["heures_avant"] for p in patterns_declenches),
        default=None
    )

    return {
        "probabilite_panne"     : prob_panne,
        "patterns_declenches"   : patterns_declenches,
        "heures_estimees_avant" : heures_avant,
        "interpretation"        : (
            f"🔴 Risque élevé ({prob_panne*100:.0f}%) — intervention urgente" if prob_panne >= 0.7 else
            f"🟠 Risque modéré ({prob_panne*100:.0f}%) — planifier maintenance" if prob_panne >= 0.4 else
            f"🟡 Risque faible ({prob_panne*100:.0f}%) — surveiller" if prob_panne >= 0.2 else
            f"✅ Risque minimal ({prob_panne*100:.0f}%)"
        )
    }


# ──────────────────────────────────────────────────────────────
# ROUTES — COMPOSANTS
# ──────────────────────────────────────────────────────────────

@router_predictif.get("/composants/{produit_id}")
def get_composants(produit_id: int, db: Session = Depends(get_db)):
    composants = db.query(ComposantMachine).filter(
        ComposantMachine.produit_id == produit_id,
        ComposantMachine.actif == True
    ).all()

    result = []
    for c in composants:
        # Dernière mesure
        derniere = db.query(MesureComposant).filter(
            MesureComposant.composant_id == c.id
        ).order_by(MesureComposant.horodatage.desc()).first()

        ratio_usure = round(c.heures_utilisees / c.duree_vie_theorique_h * 100, 1) if c.duree_vie_theorique_h else None

        result.append({
            "id"                   : c.id,
            "nom"                  : c.nom,
            "type_composant"       : c.type_composant,
            "description"          : c.description,
            "duree_vie_theorique_h": c.duree_vie_theorique_h,
            "heures_utilisees"     : c.heures_utilisees,
            "ratio_usure_pct"      : ratio_usure,
            "cout_remplacement"    : c.cout_remplacement,
            "criticite"            : c.criticite,
            "hsi_actuel"           : derniere.hsi_score if derniere else None,
            "niveau_alerte"        : derniere.niveau_alerte if derniere else NiveauAlertePredict.NORMAL,
            "derniere_mesure"      : derniere.horodatage.isoformat() if derniere else None,
        })
    return result


@router_predictif.post("/composants")
def creer_composant(data: ComposantCreate, db: Session = Depends(get_db)):
    c = ComposantMachine(**data.dict())
    db.add(c)
    db.commit()
    return {"id": c.id, "message": f"Composant '{c.nom}' créé"}


# ──────────────────────────────────────────────────────────────
# ROUTES — MESURES & ANALYSE
# ──────────────────────────────────────────────────────────────

@router_predictif.post("/mesure")
def saisir_mesure(data: MesureCreate, db: Session = Depends(get_db)):
    composant = db.query(ComposantMachine).filter(
        ComposantMachine.id == data.composant_id
    ).first()
    if not composant:
        raise HTTPException(404, "Composant non trouvé")

    # Calcul HSI
    hsi    = calculer_hsi(data, composant)
    niveau = calculer_niveau_alerte_hsi(hsi)

    mesure = MesureComposant(
        composant_id    = data.composant_id,
        produit_id      = data.produit_id,
        shift           = data.shift,
        temperature_c   = data.temperature_c,
        vibration_mm_s  = data.vibration_mm_s,
        courant_a       = data.courant_a,
        pression_bar    = data.pression_bar,
        debit_l_h       = data.debit_l_h,
        bruit_db        = data.bruit_db,
        vitesse_rpm     = data.vitesse_rpm,
        micro_arrets_min= data.micro_arrets_min,
        ph_mesure       = data.ph_mesure,
        rendement_pct   = data.rendement_pct,
        hsi_score       = hsi,
        niveau_alerte   = niveau,
        operateur       = data.operateur,
        notes           = data.notes,
    )
    db.add(mesure)

    # Mettre à jour heures d'utilisation (+ 8h par mesure quotidienne)
    composant.heures_utilisees = round(composant.heures_utilisees + 8, 0)

    db.commit()

    # Analyser et générer prédiction si nécessaire
    prediction = None
    if niveau in [NiveauAlertePredict.PLANIFIER, NiveauAlertePredict.AGIR]:
        prediction = _generer_prediction(db, mesure, composant)

    return {
        "mesure_id"    : mesure.id,
        "hsi_score"    : hsi,
        "niveau_alerte": niveau,
        "prediction"   : prediction,
        "message"      : (
            f"🔴 AGIR MAINTENANT — HSI={hsi}/100" if niveau == NiveauAlertePredict.AGIR else
            f"🟠 Planifier intervention — HSI={hsi}/100" if niveau == NiveauAlertePredict.PLANIFIER else
            f"🟡 Surveiller — HSI={hsi}/100" if niveau == NiveauAlertePredict.SURVEILLER else
            f"✅ État normal — HSI={hsi}/100"
        )
    }


def _generer_prediction(db, mesure: MesureComposant, composant: ComposantMachine) -> dict:
    """Génère une prédiction de panne automatique."""
    # Récupérer historique HSI
    historique_mesures = db.query(MesureComposant).filter(
        MesureComposant.composant_id == composant.id
    ).order_by(MesureComposant.horodatage.asc()).limit(30).all()

    hsi_series = [m.hsi_score for m in historique_mesures if m.hsi_score is not None]

    # Taux de dégradation WMA
    if len(hsi_series) >= 2:
        delta_hsi = [hsi_series[i] - hsi_series[i-1] for i in range(1, len(hsi_series))]
        taux_deg  = abs(moyenne_mobile_ponderee(delta_hsi)) / 8  # par heure
    else:
        taux_deg = 0.5  # estimation par défaut

    rul = calculer_rul(composant, mesure.hsi_score, taux_deg)

    # Patterns
    patterns = db.query(PatternPanne).filter(
        PatternPanne.produit_id == composant.produit_id,
        PatternPanne.actif == True
    ).all()

    rf = random_forest_simple(
        type('M', (), {
            'temperature_c': mesure.temperature_c,
            'vibration_mm_s': mesure.vibration_mm_s,
            'micro_arrets_min': mesure.micro_arrets_min,
            'rendement_pct': mesure.rendement_pct,
            'ph_mesure': mesure.ph_mesure,
        })(),
        patterns
    )

    # Coût what-if
    cout_panne = composant.cout_remplacement or 0
    cout_preventif = round(cout_panne * 0.3, 0)  # maintenance préventive = 30% remplacement
    ratio = round(cout_panne / max(cout_preventif, 1), 1)

    signal = []
    if mesure.temperature_c and mesure.temperature_c > 65:
        signal.append(f"Température : {mesure.temperature_c}°C (seuil : 65°C)")
    if mesure.vibration_mm_s and mesure.vibration_mm_s > 4.5:
        signal.append(f"Vibration : {mesure.vibration_mm_s} mm/s (seuil : 4.5)")
    if mesure.micro_arrets_min and mesure.micro_arrets_min > 20:
        signal.append(f"Micro-arrêts : {mesure.micro_arrets_min} min/j (seuil : 20)")

    action = (
        "⛔ Arrêter la machine immédiatement — risque de casse" if mesure.hsi_score < 35 else
        "🔧 Programmer maintenance dans les 48h — réduire cadence de 15%" if mesure.hsi_score < 55 else
        "👀 Augmenter fréquence de surveillance — contrôle toutes les 4h"
    )

    pred = PredictionPanne(
        composant_id        = composant.id,
        produit_id          = composant.produit_id,
        rul_heures          = rul.get("rul_heures"),
        date_panne_estimee  = datetime.fromisoformat(rul["date_panne"]) if rul.get("date_panne") else None,
        probabilite_panne   = rf["probabilite_panne"],
        niveau_alerte       = mesure.niveau_alerte,
        signal_declencheur  = " | ".join(signal) if signal else "Dégradation progressive détectée",
        cause_probable      = rf["patterns_declenches"][0]["nom"] if rf["patterns_declenches"] else "Usure normale accélérée",
        action_recommandee  = action,
        whatif_cout_panne   = cout_panne,
        whatif_cout_prev    = cout_preventif,
        ratio_economie      = ratio,
    )
    db.add(pred)
    db.commit()

    return {
        "rul"           : rul,
        "probabilite"   : rf["probabilite_panne"],
        "action"        : action,
        "whatif"        : {
            "cout_si_panne"     : cout_panne,
            "cout_preventif"    : cout_preventif,
            "vous_economisez"   : round(cout_panne - cout_preventif, 0),
            "ratio"             : f"{ratio}x plus cher d'attendre",
        }
    }


@router_predictif.get("/analyse/{composant_id}")
def analyser_composant(composant_id: int, db: Session = Depends(get_db)):
    """Analyse complète d'un composant — tendances, RUL, corrélations."""
    composant = db.query(ComposantMachine).filter(
        ComposantMachine.id == composant_id
    ).first()
    if not composant:
        raise HTTPException(404, "Composant non trouvé")

    mesures = db.query(MesureComposant).filter(
        MesureComposant.composant_id == composant_id
    ).order_by(MesureComposant.horodatage.asc()).limit(30).all()

    if not mesures:
        return {"message": "Aucune mesure disponible pour ce composant"}

    hsi_series  = [m.hsi_score for m in mesures if m.hsi_score]
    temp_series = [m.temperature_c for m in mesures if m.temperature_c]
    vib_series  = [m.vibration_mm_s for m in mesures if m.vibration_mm_s]
    ma_series   = [m.micro_arrets_min for m in mesures if m.micro_arrets_min]
    rend_series = [m.rendement_pct for m in mesures if m.rendement_pct]

    # Régressions
    reg_hsi  = regression_lineaire(hsi_series)  if len(hsi_series) >= 3 else {}
    reg_temp = regression_lineaire(temp_series) if len(temp_series) >= 3 else {}

    # WMA
    hsi_wma  = moyenne_mobile_ponderee(hsi_series)  if hsi_series else None

    # Taux de dégradation
    if len(hsi_series) >= 2:
        delta = [hsi_series[i] - hsi_series[i-1] for i in range(1, len(hsi_series))]
        taux_deg = abs(moyenne_mobile_ponderee(delta)) / 8
    else:
        taux_deg = 0.0

    # RUL
    rul = calculer_rul(composant, hsi_series[-1] if hsi_series else 50, taux_deg)

    # Corrélations de Pearson
    correlations = {}
    if len(temp_series) >= 3 and len(hsi_series) >= 3:
        n = min(len(temp_series), len(hsi_series))
        correlations["temperature_vs_hsi"] = pearson_correlation(temp_series[-n:], hsi_series[-n:])
    if len(ma_series) >= 3 and len(hsi_series) >= 3:
        n = min(len(ma_series), len(hsi_series))
        correlations["micro_arrets_vs_hsi"] = pearson_correlation(ma_series[-n:], hsi_series[-n:])
    if len(rend_series) >= 3 and len(hsi_series) >= 3:
        n = min(len(rend_series), len(hsi_series))
        correlations["rendement_vs_hsi"] = pearson_correlation(rend_series[-n:], hsi_series[-n:])

    # Interprétation corrélations
    def interp_corr(r):
        if r is None: return "—"
        r_abs = abs(r)
        direction = "négative" if r < 0 else "positive"
        if r_abs >= 0.8: return f"Très forte corrélation {direction}"
        if r_abs >= 0.6: return f"Forte corrélation {direction}"
        if r_abs >= 0.4: return f"Corrélation modérée {direction}"
        return f"Faible corrélation ({r})"

    # Radar de risque 24h
    radar = _generer_radar_risque(mesures[-1] if mesures else None, composant)

    return {
        "composant"     : {"id": composant.id, "nom": composant.nom, "type": composant.type_composant},
        "hsi_actuel"    : hsi_series[-1] if hsi_series else None,
        "hsi_wma"       : hsi_wma,
        "tendance_hsi"  : {
            **reg_hsi,
            "direction"   : "📉 Dégradation" if reg_hsi.get("pente", 0) < -0.1 else
                            "📈 Amélioration" if reg_hsi.get("pente", 0) > 0.1 else "➡️ Stable",
            "prevision_j7": reg_hsi.get("prevision_j7"),
        },
        "rul"           : rul,
        "taux_degradation_h": round(taux_deg, 4),
        "correlations"  : {
            k: {"valeur": v, "interpretation": interp_corr(v)}
            for k, v in correlations.items()
        },
        "radar_risque"  : radar,
        "historique_hsi": [
            {"date": m.horodatage.isoformat(), "hsi": m.hsi_score, "alerte": m.niveau_alerte}
            for m in mesures
        ],
    }


def _generer_radar_risque(derniere_mesure, composant: ComposantMachine) -> dict:
    """Génère le radar de risque sur 5 axes pour les prochaines 24h."""
    if not derniere_mesure:
        return {}

    def score_risque(valeur, seuil_ok, seuil_critique):
        if valeur is None: return 20  # incertitude = risque moyen-faible
        if valeur >= seuil_critique: return 90
        if valeur >= seuil_ok: return 50 + (valeur - seuil_ok) / (seuil_critique - seuil_ok) * 40
        return max(5, valeur / seuil_ok * 30)

    usure_pct = (composant.heures_utilisees / composant.duree_vie_theorique_h * 100) if composant.duree_vie_theorique_h else 50

    return {
        "thermique"   : round(score_risque(derniere_mesure.temperature_c, 65, 80), 0),
        "mecanique"   : round(score_risque(derniere_mesure.vibration_mm_s, 4.5, 7.1), 0),
        "process"     : round(score_risque(derniere_mesure.micro_arrets_min, 20, 35), 0),
        "qualite"     : round(100 - (derniere_mesure.rendement_pct or 95), 0),
        "usure"       : round(min(95, usure_pct), 0),
    }


# ──────────────────────────────────────────────────────────────
# ROUTES — PRÉDICTIONS
# ──────────────────────────────────────────────────────────────

@router_predictif.get("/predictions/{produit_id}")
def get_predictions(produit_id: int, db: Session = Depends(get_db)):
    preds = db.query(PredictionPanne).filter(
        PredictionPanne.produit_id == produit_id,
        PredictionPanne.statut == StatutPrediction.EN_COURS
    ).order_by(PredictionPanne.date_prediction.desc()).limit(20).all()

    return [
        {
            "id"                : p.id,
            "composant_id"      : p.composant_id,
            "composant_nom"     : p.composant.nom if p.composant else "—",
            "rul_heures"        : p.rul_heures,
            "rul_jours"         : round(p.rul_heures / 24, 1) if p.rul_heures else None,
            "date_panne_estimee": p.date_panne_estimee.isoformat() if p.date_panne_estimee else None,
            "probabilite_panne" : p.probabilite_panne,
            "niveau_alerte"     : p.niveau_alerte,
            "signal_declencheur": p.signal_declencheur,
            "cause_probable"    : p.cause_probable,
            "action_recommandee": p.action_recommandee,
            "whatif_cout_panne" : p.whatif_cout_panne,
            "whatif_cout_prev"  : p.whatif_cout_prev,
            "ratio_economie"    : p.ratio_economie,
            "date_prediction"   : p.date_prediction.isoformat(),
        }
        for p in preds
    ]


@router_predictif.post("/valider-prediction")
def valider_prediction(data: ValidationPrediction, db: Session = Depends(get_db)):
    pred = db.query(PredictionPanne).filter(PredictionPanne.id == data.prediction_id).first()
    if not pred:
        raise HTTPException(404, "Prédiction non trouvée")

    pred.statut = data.statut
    pred.commentaire_retour = data.commentaire
    if data.date_panne_reelle:
        pred.date_panne_reelle = datetime.fromisoformat(data.date_panne_reelle)

    # Mettre à jour la fiabilité du pattern si validée
    if data.statut == StatutPrediction.VALIDEE:
        pattern = db.query(PatternPanne).filter(
            PatternPanne.produit_id == pred.produit_id
        ).first()
        if pattern:
            pattern.nb_occurrences += 1

    db.commit()
    return {"message": f"Prédiction #{data.prediction_id} validée comme '{data.statut}'"}


# ──────────────────────────────────────────────────────────────
# ROUTES — KPIs & DASHBOARD
# ──────────────────────────────────────────────────────────────

@router_predictif.get("/dashboard/{produit_id}")
def get_dashboard_predictif(produit_id: int, db: Session = Depends(get_db)):
    """KPIs prédictifs pour le dashboard principal."""
    composants = db.query(ComposantMachine).filter(
        ComposantMachine.produit_id == produit_id,
        ComposantMachine.actif == True
    ).all()

    hsi_scores = []
    alertes_agir = 0
    alertes_planifier = 0
    alertes_surveiller = 0
    cout_evite_potentiel = 0

    for c in composants:
        derniere = db.query(MesureComposant).filter(
            MesureComposant.composant_id == c.id
        ).order_by(MesureComposant.horodatage.desc()).first()

        if derniere:
            hsi_scores.append(derniere.hsi_score or 50)
            if derniere.niveau_alerte == NiveauAlertePredict.AGIR:
                alertes_agir += 1
                cout_evite_potentiel += c.cout_remplacement or 0
            elif derniere.niveau_alerte == NiveauAlertePredict.PLANIFIER:
                alertes_planifier += 1
                cout_evite_potentiel += (c.cout_remplacement or 0) * 0.5
            elif derniere.niveau_alerte == NiveauAlertePredict.SURVEILLER:
                alertes_surveiller += 1

    hsi_moyen = round(sum(hsi_scores) / len(hsi_scores), 1) if hsi_scores else 75.0

    # Prédictions actives
    predictions_actives = db.query(PredictionPanne).filter(
        PredictionPanne.produit_id == produit_id,
        PredictionPanne.statut == StatutPrediction.EN_COURS
    ).count()

    # Taux de fiabilité historique
    total_pred = db.query(PredictionPanne).filter(
        PredictionPanne.produit_id == produit_id,
        PredictionPanne.statut != StatutPrediction.EN_COURS
    ).count()
    validees = db.query(PredictionPanne).filter(
        PredictionPanne.produit_id == produit_id,
        PredictionPanne.statut == StatutPrediction.VALIDEE
    ).count()
    taux_fiabilite = round(validees / total_pred * 100, 1) if total_pred > 0 else 0.0

    return {
        "hsi_moyen"              : hsi_moyen,
        "nb_composants"          : len(composants),
        "alertes_agir"           : alertes_agir,
        "alertes_planifier"      : alertes_planifier,
        "alertes_surveiller"     : alertes_surveiller,
        "predictions_actives"    : predictions_actives,
        "taux_fiabilite_pct"     : taux_fiabilite,
        "cout_evite_potentiel"   : round(cout_evite_potentiel, 0),
        "composants_critiques"   : [
            {"nom": c.nom, "criticite": c.criticite, "type": c.type_composant}
            for c in sorted(composants, key=lambda x: x.criticite, reverse=True)[:3]
        ]
    }


@router_predictif.get("/rapport/{produit_id}")
def generer_rapport(produit_id: int, mois: int, annee: int, db: Session = Depends(get_db)):
    """Rapport mensuel : prédictions faites vs réalité."""
    debut = datetime(annee, mois, 1)
    fin   = datetime(annee, mois + 1, 1) if mois < 12 else datetime(annee + 1, 1, 1)

    predictions = db.query(PredictionPanne).filter(
        PredictionPanne.produit_id == produit_id,
        PredictionPanne.date_prediction >= debut,
        PredictionPanne.date_prediction < fin
    ).all()

    nb_total     = len(predictions)
    nb_validees  = sum(1 for p in predictions if p.statut == StatutPrediction.VALIDEE)
    nb_manquees  = sum(1 for p in predictions if p.statut == StatutPrediction.MANQUEE)
    nb_fausses   = sum(1 for p in predictions if p.statut == StatutPrediction.FAUSSE)
    nb_en_cours  = sum(1 for p in predictions if p.statut == StatutPrediction.EN_COURS)

    taux_fiabilite = round(nb_validees / max(nb_total - nb_en_cours, 1) * 100, 1)
    cout_evite     = sum(
        (p.whatif_cout_panne or 0) - (p.whatif_cout_prev or 0)
        for p in predictions if p.statut == StatutPrediction.VALIDEE
    )

    return {
        "mois"             : mois,
        "annee"            : annee,
        "nb_predictions"   : nb_total,
        "nb_validees"      : nb_validees,
        "nb_manquees"      : nb_manquees,
        "nb_fausses"       : nb_fausses,
        "nb_en_cours"      : nb_en_cours,
        "taux_fiabilite"   : taux_fiabilite,
        "cout_evite_dzd"   : round(cout_evite, 0),
        "predictions"      : [
            {
                "composant"    : p.composant.nom if p.composant else "—",
                "date"         : p.date_prediction.strftime("%d/%m"),
                "probabilite"  : p.probabilite_panne,
                "statut"       : p.statut,
                "action"       : p.action_recommandee,
            }
            for p in predictions
        ]
    }