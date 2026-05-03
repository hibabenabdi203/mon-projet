"""
TWINOVA — MODULE 6 : BENCHMARKING SECTORIEL — Routes API
Ajouter dans main.py :
from benchmark_models import (DonneeBenchmark, StatsBenchmark,
    AlerteBenchmark, CertificatPerformance, seed_benchmark_demo)
from benchmark_routes import router_benchmark
app.include_router(router_benchmark)
Dans startup() : seed_benchmark_demo(db)
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import math, statistics

from database import get_db, Produit, Enregistrement
from benchmark_models import (DonneeBenchmark, StatsBenchmark,
    AlerteBenchmark, CertificatPerformance)

router_benchmark = APIRouter(prefix="/benchmark", tags=["Benchmarking"])


# ── Schémas ──────────────────────────────────────────────────
class SoumissionBenchmark(BaseModel):
    produit_id    : int
    secteur       : str
    sous_secteur  : Optional[str] = None
    mois          : int
    annee         : int
    poids_trs     : float = 0.25
    poids_qualite : float = 0.20
    poids_energie : float = 0.20
    poids_rendement: float = 0.20
    poids_haccp   : float = 0.15


# ── Utilitaires statistiques ─────────────────────────────────
def quartiles(valeurs: list) -> dict:
    if not valeurs:
        return {"q1": 0, "mediane": 0, "q3": 0, "moyenne": 0, "top10": 0, "min": 0, "max": 0}
    s = sorted(v for v in valeurs if v is not None)
    n = len(s)
    if n == 0:
        return {"q1": 0, "mediane": 0, "q3": 0, "moyenne": 0, "top10": 0, "min": 0, "max": 0}

    def percentile(pct):
        k = (n - 1) * pct / 100
        f, c = math.floor(k), math.ceil(k)
        if f == c:
            return round(s[int(k)], 2)
        return round(s[f] + (s[c] - s[f]) * (k - f), 2)

    return {
        "q1"     : percentile(25),
        "mediane": percentile(50),
        "q3"     : percentile(75),
        "moyenne": round(statistics.mean(s), 2),
        "top10"  : percentile(90),
        "min"    : round(min(s), 2),
        "max"    : round(max(s), 2),
        "n"      : n,
    }


def calculer_spi(valeur_entreprise, moyenne_secteur, kpi_type="max") -> float:
    """
    SPI = (Valeur entreprise / Moyenne secteur) × 100
    Pour les KPIs où plus bas = mieux (énergie, taux_perte) : on inverse.
    SPI > 100 = meilleur que la moyenne
    """
    if not moyenne_secteur or moyenne_secteur == 0:
        return 100.0
    if kpi_type == "min":  # plus bas = mieux
        spi = (moyenne_secteur / valeur_entreprise) * 100
    else:
        spi = (valeur_entreprise / moyenne_secteur) * 100
    return round(spi, 1)


def calculer_percentile_rang(valeur, distribution: list, kpi_type="max") -> dict:
    """
    Trouve le rang et percentile d'une valeur dans une distribution.
    Retourne rang, nb_total, percentile, quartile (1-4).
    """
    s = sorted(v for v in distribution if v is not None)
    n = len(s)
    if n == 0:
        return {"rang": 1, "nb_total": 1, "percentile": 50, "quartile": 2}

    if kpi_type == "min":
        rang = sum(1 for v in s if v < valeur) + 1
        percentile = round((1 - rang / n) * 100, 1)
    else:
        rang = sum(1 for v in s if v > valeur) + 1
        percentile = round((1 - rang / n) * 100, 1)

    quartile = 4 if percentile >= 75 else 3 if percentile >= 50 else 2 if percentile >= 25 else 1

    return {
        "rang"      : rang,
        "nb_total"  : n,
        "percentile": percentile,
        "quartile"  : quartile,
        "label"     : f"Top {100-percentile:.0f}%" if percentile >= 75 else
                      f"{rang}e sur {n}",
    }


# ── ROUTE : Soumettre données entreprise ─────────────────────
@router_benchmark.post("/soumettre")
def soumettre_donnees(data: SoumissionBenchmark, db: Session = Depends(get_db)):
    """Récupère les KPIs réels du produit et les soumet au pool anonymisé."""
    produit = db.query(Produit).filter(Produit.id == data.produit_id).first()
    if not produit:
        raise HTTPException(404, "Produit non trouvé")

    # Récupérer le dernier enregistrement
    dernier = db.query(Enregistrement).filter(
        Enregistrement.produit_id == data.produit_id
    ).order_by(Enregistrement.date.desc()).first()

    if not dernier:
        raise HTTPException(400, "Aucune donnée de production — saisissez d'abord des données")

    import hashlib
    code = "ENT-" + hashlib.md5(f"{data.produit_id}-{data.secteur}".encode()).hexdigest()[:8].upper()

    # SPI pondéré
    moy_secteur = db.query(DonneeBenchmark).filter(
        DonneeBenchmark.secteur == data.secteur,
        DonneeBenchmark.mois == data.mois,
        DonneeBenchmark.annee == data.annee,
        DonneeBenchmark.valide == True
    ).all()

    trs_moy = statistics.mean([d.trs for d in moy_secteur if d.trs]) if moy_secteur else dernier.trs
    spi = calculer_spi(dernier.trs, trs_moy)

    # Vérifier si déjà soumis ce mois
    existant = db.query(DonneeBenchmark).filter(
        DonneeBenchmark.entreprise_code == code,
        DonneeBenchmark.mois == data.mois,
        DonneeBenchmark.annee == data.annee
    ).first()

    if existant:
        existant.trs           = dernier.trs
        existant.qualite       = dernier.qualite
        existant.disponibilite = dernier.disponibilite
        existant.spi           = spi
    else:
        db.add(DonneeBenchmark(
            secteur           = data.secteur,
            sous_secteur      = data.sous_secteur,
            mois              = data.mois,
            annee             = data.annee,
            entreprise_code   = code,
            trs               = dernier.trs,
            qualite           = dernier.qualite,
            disponibilite     = dernier.disponibilite,
            rendement_matiere = 95.0,
            epi_electricite   = 0.18,
            epi_eau           = 3.2,
            conformite_haccp  = 90.0,
            taux_perte        = 5.0,
            spi               = spi,
        ))

    db.commit()

    # Recalculer stats
    _recalculer_stats(db, data.secteur, data.sous_secteur, data.mois, data.annee)

    return {"message": "Données soumises anonymement ✅", "code": code, "spi": spi}


def _recalculer_stats(db, secteur, sous_secteur, mois, annee):
    """Recalcule les statistiques agrégées du secteur."""
    donnees = db.query(DonneeBenchmark).filter(
        DonneeBenchmark.secteur == secteur,
        DonneeBenchmark.mois == mois,
        DonneeBenchmark.annee == annee,
        DonneeBenchmark.valide == True
    ).all()

    if not donnees:
        return

    def q(field):
        return quartiles([getattr(d, field) for d in donnees if getattr(d, field) is not None])

    trs_q  = q("trs")
    qual_q = q("qualite")
    rend_q = q("rendement_matiere")
    epi_q  = q("epi_electricite")
    hac_q  = q("conformite_haccp")

    stats = db.query(StatsBenchmark).filter(
        StatsBenchmark.secteur == secteur,
        StatsBenchmark.mois == mois,
        StatsBenchmark.annee == annee
    ).first()

    if not stats:
        stats = StatsBenchmark(secteur=secteur, sous_secteur=sous_secteur, mois=mois, annee=annee)
        db.add(stats)

    stats.nb_entreprises  = len(donnees)
    stats.date_calcul     = datetime.utcnow()
    stats.trs_moyenne     = trs_q["moyenne"]
    stats.trs_mediane     = trs_q["mediane"]
    stats.trs_q1          = trs_q["q1"]
    stats.trs_q3          = trs_q["q3"]
    stats.trs_top10       = trs_q["top10"]
    stats.qualite_moyenne = qual_q["moyenne"]
    stats.qualite_mediane = qual_q["mediane"]
    stats.qualite_q1      = qual_q["q1"]
    stats.qualite_q3      = qual_q["q3"]
    stats.qualite_top10   = qual_q["top10"]
    stats.rendement_moyenne= rend_q["moyenne"]
    stats.rendement_mediane= rend_q["mediane"]
    stats.rendement_q1    = rend_q["q1"]
    stats.rendement_q3    = rend_q["q3"]
    stats.rendement_top10 = rend_q["top10"]
    stats.epi_moyenne     = epi_q["moyenne"]
    stats.epi_mediane     = epi_q["mediane"]
    stats.epi_q1          = epi_q["q1"]
    stats.epi_q3          = epi_q["q3"]
    stats.epi_top10       = epi_q["top10"]
    stats.haccp_moyenne   = hac_q["moyenne"]
    stats.haccp_mediane   = hac_q["mediane"]
    stats.haccp_top10     = hac_q["top10"]
    stats.spi_moyen       = round(statistics.mean([d.spi for d in donnees if d.spi] or [100]), 1)
    db.commit()


# ── ROUTE : Positionnement entreprise ────────────────────────
@router_benchmark.get("/positionnement/{produit_id}")
def get_positionnement(
    produit_id: int,
    secteur: str,
    mois: int = 4,
    annee: int = 2026,
    db: Session = Depends(get_db)
):
    """Retourne le positionnement complet de l'entreprise vs le secteur."""
    dernier = db.query(Enregistrement).filter(
        Enregistrement.produit_id == produit_id
    ).order_by(Enregistrement.date.desc()).first()

    if not dernier:
        raise HTTPException(400, "Aucune donnée disponible")

    donnees = db.query(DonneeBenchmark).filter(
        DonneeBenchmark.secteur == secteur,
        DonneeBenchmark.mois == mois,
        DonneeBenchmark.annee == annee,
        DonneeBenchmark.valide == True
    ).all()

    stats = db.query(StatsBenchmark).filter(
        StatsBenchmark.secteur == secteur,
        StatsBenchmark.mois == mois,
        StatsBenchmark.annee == annee
    ).first()

    if not stats and donnees:
        _recalculer_stats(db, secteur, None, mois, annee)
        stats = db.query(StatsBenchmark).filter(
            StatsBenchmark.secteur == secteur,
            StatsBenchmark.mois == mois,
            StatsBenchmark.annee == annee
        ).first()

    if not stats:
        raise HTTPException(404, f"Pas encore de données secteur '{secteur}' pour {mois}/{annee}")

    # Distributions pour calcul de rang
    dist_trs     = [d.trs for d in donnees if d.trs]
    dist_qualite = [d.qualite for d in donnees if d.qualite]
    dist_rend    = [d.rendement_matiere for d in donnees if d.rendement_matiere]
    dist_epi     = [d.epi_electricite for d in donnees if d.epi_electricite]
    dist_haccp   = [d.conformite_haccp for d in donnees if d.conformite_haccp]

    # Valeurs entreprise (réelles ou estimées)
    ent_trs     = dernier.trs
    ent_qualite = dernier.qualite
    ent_rend    = 95.0  # à connecter Module 2
    ent_epi     = 0.18  # à connecter Module 4
    ent_haccp   = 90.0  # à connecter Module 3

    # Rangs
    rang_trs     = calculer_percentile_rang(ent_trs,     dist_trs,     "max")
    rang_qualite = calculer_percentile_rang(ent_qualite, dist_qualite, "max")
    rang_rend    = calculer_percentile_rang(ent_rend,     dist_rend,   "max")
    rang_epi     = calculer_percentile_rang(ent_epi,      dist_epi,    "min")
    rang_haccp   = calculer_percentile_rang(ent_haccp,    dist_haccp,  "max")

    # SPI pondéré
    spi_trs     = calculer_spi(ent_trs,     stats.trs_moyenne,      "max")
    spi_qualite = calculer_spi(ent_qualite, stats.qualite_moyenne,  "max")
    spi_rend    = calculer_spi(ent_rend,     stats.rendement_moyenne,"max")
    spi_epi     = calculer_spi(ent_epi,      stats.epi_moyenne,     "min")
    spi_haccp   = calculer_spi(ent_haccp,    stats.haccp_moyenne,   "max")
    spi_global  = round(spi_trs*0.25 + spi_qualite*0.20 + spi_rend*0.20 + spi_epi*0.20 + spi_haccp*0.15, 1)

    # Certificat
    certificat = None
    if rang_trs["percentile"] >= 90 and spi_global >= 115:
        certificat = {"niveau": "Or", "label": "🥇 Top Performeur Sectoriel"}
    elif rang_trs["percentile"] >= 75 and spi_global >= 105:
        certificat = {"niveau": "Argent", "label": "🥈 Performeur Au-Dessus de la Moyenne"}
    elif rang_trs["percentile"] >= 50:
        certificat = {"niveau": "Bronze", "label": "🥉 Dans la Moyenne Sectorielle"}

    # Recommandations peer-to-peer
    recommandations = []
    if spi_trs < 95:
        recommandations.append({
            "kpi": "TRS",
            "message": f"Votre TRS ({ent_trs}%) est en dessous de la moyenne ({stats.trs_moyenne}%). Les entreprises de votre secteur ayant amélioré leur TRS ont investi dans la maintenance préventive et la formation des opérateurs.",
            "action": "Activer le Module 5 — Maintenance Prédictive",
            "gain_estime": f"+{round(stats.trs_moyenne - ent_trs, 1)} pts TRS"
        })
    if spi_epi < 95:
        recommandations.append({
            "kpi": "Énergie",
            "message": f"Votre consommation ({ent_epi} kWh/u) est {round((ent_epi/stats.epi_moyenne-1)*100, 0):.0f}% au-dessus de la moyenne. Les top performeurs ont optimisé l'isolation des cuves et adopté des variateurs de vitesse.",
            "action": "Revoir les paramètres dans Énergie & Économie",
            "gain_estime": f"−{round((ent_epi - stats.epi_mediane)*100, 0):.0f}% conso"
        })
    if spi_haccp < 95:
        recommandations.append({
            "kpi": "HACCP",
            "message": f"Votre conformité sanitaire ({ent_haccp}%) est inférieure à la médiane sectorielle ({stats.haccp_mediane}%). Renforcez la fréquence des contrôles terrain.",
            "action": "Configurer plus de points de contrôle dans HACCP & Sécurité",
            "gain_estime": f"+{round(stats.haccp_mediane - ent_haccp, 1)} pts conformité"
        })

    if not recommandations:
        recommandations.append({
            "kpi": "Global",
            "message": "Excellente performance ! Vous êtes au-dessus de la moyenne sur tous les indicateurs.",
            "action": "Maintenez vos bonnes pratiques et partagez-les avec vos équipes",
            "gain_estime": "Performance optimale"
        })

    return {
        "secteur"         : secteur,
        "mois"            : mois,
        "annee"           : annee,
        "nb_entreprises"  : stats.nb_entreprises,
        "spi_global"      : spi_global,
        "certificat"      : certificat,

        "entreprise"      : {
            "trs"     : ent_trs,
            "qualite" : ent_qualite,
            "rendement": ent_rend,
            "epi"     : ent_epi,
            "haccp"   : ent_haccp,
        },

        "secteur_stats"   : {
            "trs"    : {"moyenne": stats.trs_moyenne,      "mediane": stats.trs_mediane,      "top10": stats.trs_top10,      "q1": stats.trs_q1,      "q3": stats.trs_q3},
            "qualite": {"moyenne": stats.qualite_moyenne,  "mediane": stats.qualite_mediane,  "top10": stats.qualite_top10,  "q1": stats.qualite_q1,  "q3": stats.qualite_q3},
            "rendement":{"moyenne": stats.rendement_moyenne,"mediane": stats.rendement_mediane,"top10": stats.rendement_top10,"q1": stats.rendement_q1,"q3": stats.rendement_q3},
            "epi"    : {"moyenne": stats.epi_moyenne,      "mediane": stats.epi_mediane,      "top10": stats.epi_top10,      "q1": stats.epi_q1,      "q3": stats.epi_q3},
            "haccp"  : {"moyenne": stats.haccp_moyenne,    "mediane": stats.haccp_mediane,    "top10": stats.haccp_top10},
        },

        "rangs"           : {
            "trs"     : rang_trs,
            "qualite" : rang_qualite,
            "rendement": rang_rend,
            "energie" : rang_epi,
            "haccp"   : rang_haccp,
        },

        "spi_detail"      : {
            "trs"     : spi_trs,
            "qualite" : spi_qualite,
            "rendement": spi_rend,
            "energie" : spi_epi,
            "haccp"   : spi_haccp,
        },

        "recommandations" : recommandations,
    }


@router_benchmark.get("/secteurs")
def get_secteurs(db: Session = Depends(get_db)):
    """Liste des secteurs disponibles dans le pool."""
    from sqlalchemy import distinct
    secteurs = db.query(distinct(DonneeBenchmark.secteur)).all()
    return [s[0] for s in secteurs]


@router_benchmark.get("/alertes/{produit_id}")
def get_alertes_benchmark(produit_id: int, db: Session = Depends(get_db)):
    alertes = db.query(AlerteBenchmark).filter(
        AlerteBenchmark.produit_id == produit_id,
        AlerteBenchmark.lu == False
    ).order_by(AlerteBenchmark.date_alerte.desc()).limit(10).all()
    return [
        {"id": a.id, "type": a.type_alerte, "kpi": a.kpi_concerne,
         "message": a.message, "rang_avant": a.ancienne_position,
         "rang_apres": a.nouvelle_position, "date": a.date_alerte.isoformat()}
        for a in alertes
    ]


@router_benchmark.get("/evolution/{produit_id}")
def get_evolution(produit_id: int, secteur: str, db: Session = Depends(get_db)):
    """Évolution temporelle : entreprise vs secteur sur 6 mois."""
    import hashlib
    code = "ENT-" + hashlib.md5(f"{produit_id}-{secteur}".encode()).hexdigest()[:8].upper()

    donnees_ent = db.query(DonneeBenchmark).filter(
        DonneeBenchmark.entreprise_code == code
    ).order_by(DonneeBenchmark.annee, DonneeBenchmark.mois).limit(6).all()

    stats_sect = db.query(StatsBenchmark).filter(
        StatsBenchmark.secteur == secteur
    ).order_by(StatsBenchmark.annee, StatsBenchmark.mois).limit(6).all()

    return {
        "entreprise": [
            {"mois": d.mois, "annee": d.annee, "trs": d.trs, "spi": d.spi}
            for d in donnees_ent
        ],
        "secteur_moyenne": [
            {"mois": s.mois, "annee": s.annee, "trs": s.trs_moyenne, "spi": s.spi_moyen}
            for s in stats_sect
        ]
    }