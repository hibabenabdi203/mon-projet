"""
=============================================================
TWINOVA — MODULE 4 : OPTIMISATION ÉNERGÉTIQUE
Routes API à ajouter dans main.py
=============================================================
IMPORTS à ajouter dans main.py :
from energie_models import (
    TarifEnergie, SaisieEnergie, SeuilEnergie,
    LossCostingEnergie, AuditEnergetique,
    TypeEnergie, PeriodeTarifaire, NiveauAlerteEnergie,
    seed_energie_demo
)
Puis dans startup() : seed_energie_demo(db)
Et : app.include_router(router_energie)
=============================================================
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, date
import json
import math

from database import get_db
from energie_models import (
    TarifEnergie, SaisieEnergie, SeuilEnergie,
    LossCostingEnergie, AuditEnergetique,
    TypeEnergie, PeriodeTarifaire, NiveauAlerteEnergie
)

router_energie = APIRouter(prefix="/energie", tags=["Énergie"])


# ──────────────────────────────────────────────────────────────
# SCHÉMAS PYDANTIC
# ──────────────────────────────────────────────────────────────

class SaisieEnergieCreate(BaseModel):
    produit_id        : int
    lot_id            : Optional[int] = None
    date_saisie       : str           # YYYY-MM-DD
    shift             : str = "jour"
    type_energie      : str
    periode_tarifaire : str = "pleine"
    consommation      : float
    production_unites : int = 0
    operateur         : Optional[str] = None
    notes             : Optional[str] = None

class TarifEnergieCreate(BaseModel):
    produit_id     : int
    type_energie   : str
    periode        : str = "pleine"
    prix_unitaire  : float
    unite          : str = "kWh"
    devise         : str = "DZD"
    facteur_co2    : float = 0.512

class SeuilEnergieCreate(BaseModel):
    produit_id   : int
    type_energie : str
    epi_cible    : float
    epi_alerte   : float
    epi_critique : float

class LossCostingRequest(BaseModel):
    lot_id               : int
    produit_id           : int
    quantite_perdue_kg   : float
    cout_matiere_kg      : float          # DZD / kg
    heures_operateur     : float = 0.0
    taux_horaire         : float = 800.0  # DZD / heure (SMIG algérien ~600-900)
    taux_amortissement   : float = 50.0   # DZD / heure machine
    cout_traitement_dechet: float = 0.0
    energie_consommee_kwh: float = 0.0
    prix_kwh             : float = 7.5

class ParametresAudit(BaseModel):
    produit_id : int
    mois       : int
    annee      : int


# ──────────────────────────────────────────────────────────────
# UTILITAIRES
# ──────────────────────────────────────────────────────────────

def get_tarif(db, produit_id: int, type_energie: str, periode: str) -> Optional[TarifEnergie]:
    return db.query(TarifEnergie).filter(
        TarifEnergie.produit_id == produit_id,
        TarifEnergie.type_energie == type_energie,
        TarifEnergie.periode == periode,
        TarifEnergie.actif == True
    ).first()


def calculer_niveau_alerte(epi: float, seuil: Optional[SeuilEnergie]) -> str:
    if not seuil or not epi:
        return NiveauAlerteEnergie.NORMAL
    if epi >= seuil.epi_critique:
        return NiveauAlerteEnergie.CRITIQUE
    if epi >= seuil.epi_alerte:
        return NiveauAlerteEnergie.ATTENTION
    return NiveauAlerteEnergie.NORMAL


def calculer_score_efficacite(saisies: list, seuils: list) -> float:
    """Score 0-100 basé sur les EPIs vs cibles."""
    if not saisies or not seuils:
        return 50.0

    scores = []
    seuil_map = {s.type_energie: s for s in seuils}

    for saisie in saisies:
        if not saisie.epi:
            continue
        seuil = seuil_map.get(saisie.type_energie)
        if not seuil or not seuil.epi_cible:
            continue

        ratio = seuil.epi_cible / saisie.epi
        score = min(100, ratio * 100)
        scores.append(score)

    return round(sum(scores) / len(scores), 1) if scores else 50.0


# ──────────────────────────────────────────────────────────────
# TARIFS
# ──────────────────────────────────────────────────────────────

@router_energie.get("/tarifs/{produit_id}")
def get_tarifs(produit_id: int, db: Session = Depends(get_db)):
    tarifs = db.query(TarifEnergie).filter(
        TarifEnergie.produit_id == produit_id,
        TarifEnergie.actif == True
    ).all()
    return [
        {
            "id"           : t.id,
            "type_energie" : t.type_energie,
            "periode"      : t.periode,
            "prix_unitaire": t.prix_unitaire,
            "unite"        : t.unite,
            "devise"       : t.devise,
            "facteur_co2"  : t.facteur_co2,
        }
        for t in tarifs
    ]


@router_energie.post("/tarifs")
def creer_tarif(data: TarifEnergieCreate, db: Session = Depends(get_db)):
    # Désactiver l'ancien tarif du même type/période
    ancien = db.query(TarifEnergie).filter(
        TarifEnergie.produit_id == data.produit_id,
        TarifEnergie.type_energie == data.type_energie,
        TarifEnergie.periode == data.periode,
        TarifEnergie.actif == True
    ).first()
    if ancien:
        ancien.actif = False

    tarif = TarifEnergie(**data.dict())
    db.add(tarif)
    db.commit()
    return {"message": "Tarif enregistré", "id": tarif.id}


@router_energie.post("/seuils")
def creer_seuil(data: SeuilEnergieCreate, db: Session = Depends(get_db)):
    ancien = db.query(SeuilEnergie).filter(
        SeuilEnergie.produit_id == data.produit_id,
        SeuilEnergie.type_energie == data.type_energie,
        SeuilEnergie.actif == True
    ).first()
    if ancien:
        ancien.actif = False

    seuil = SeuilEnergie(**data.dict())
    db.add(seuil)
    db.commit()
    return {"message": "Seuil enregistré", "id": seuil.id}


# ──────────────────────────────────────────────────────────────
# SAISIE ÉNERGIE
# ──────────────────────────────────────────────────────────────

@router_energie.post("/saisie")
def saisir_energie(data: SaisieEnergieCreate, db: Session = Depends(get_db)):
    # Récupérer le tarif correspondant
    tarif = get_tarif(db, data.produit_id, data.type_energie, data.periode_tarifaire)
    prix = tarif.prix_unitaire if tarif else 0.0
    facteur_co2 = tarif.facteur_co2 if tarif else 0.0

    # Calculs
    cout_total    = round(data.consommation * prix, 2)
    empreinte_co2 = round(data.consommation * facteur_co2, 3)
    epi           = round(data.consommation / data.production_unites, 4) if data.production_unites > 0 else None

    # Niveau d'alerte
    seuil = db.query(SeuilEnergie).filter(
        SeuilEnergie.produit_id == data.produit_id,
        SeuilEnergie.type_energie == data.type_energie,
        SeuilEnergie.actif == True
    ).first()
    niveau = calculer_niveau_alerte(epi, seuil)

    saisie = SaisieEnergie(
        produit_id        = data.produit_id,
        lot_id            = data.lot_id,
        date_saisie       = date.fromisoformat(data.date_saisie),
        shift             = data.shift,
        type_energie      = data.type_energie,
        periode_tarifaire = data.periode_tarifaire,
        consommation      = data.consommation,
        unite             = tarif.unite if tarif else "kWh",
        production_unites = data.production_unites,
        operateur         = data.operateur,
        notes             = data.notes,
        cout_total        = cout_total,
        epi               = epi,
        empreinte_co2     = empreinte_co2,
        niveau_alerte     = niveau,
    )
    db.add(saisie)
    db.commit()

    return {
        "id"            : saisie.id,
        "cout_total"    : cout_total,
        "epi"           : epi,
        "empreinte_co2" : empreinte_co2,
        "niveau_alerte" : niveau,
        "message"       : f"Consommation enregistrée — Coût : {cout_total:.2f} DZD · EPI : {epi} {saisie.unite}/unité" if epi else f"Enregistré — Coût : {cout_total:.2f} DZD",
    }


# ──────────────────────────────────────────────────────────────
# HISTORIQUE & INDICATEURS
# ──────────────────────────────────────────────────────────────

@router_energie.get("/historique/{produit_id}")
def get_historique_energie(
    produit_id: int,
    type_energie: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(SaisieEnergie).filter(SaisieEnergie.produit_id == produit_id)
    if type_energie:
        query = query.filter(SaisieEnergie.type_energie == type_energie)

    saisies = query.order_by(SaisieEnergie.date_saisie.desc()).limit(90).all()

    return [
        {
            "id"               : s.id,
            "date_saisie"      : str(s.date_saisie),
            "shift"            : s.shift,
            "type_energie"     : s.type_energie,
            "periode_tarifaire": s.periode_tarifaire,
            "consommation"     : s.consommation,
            "unite"            : s.unite,
            "production_unites": s.production_unites,
            "cout_total"       : s.cout_total,
            "epi"              : s.epi,
            "empreinte_co2"    : s.empreinte_co2,
            "niveau_alerte"    : s.niveau_alerte,
            "operateur"        : s.operateur,
        }
        for s in saisies
    ]


@router_energie.get("/indicateurs/{produit_id}")
def get_indicateurs_energie(produit_id: int, db: Session = Depends(get_db)):
    """KPIs énergétiques pour le dashboard — 30 derniers jours."""
    from datetime import timedelta
    date_debut = date.today() - timedelta(days=30)

    saisies = db.query(SaisieEnergie).filter(
        SaisieEnergie.produit_id == produit_id,
        SaisieEnergie.date_saisie >= date_debut
    ).all()

    seuils = db.query(SeuilEnergie).filter(
        SeuilEnergie.produit_id == produit_id,
        SeuilEnergie.actif == True
    ).all()

    if not saisies:
        return {
            "cout_total_mois"    : 0.0,
            "co2_total_kg"       : 0.0,
            "epi_electricite"    : None,
            "epi_eau"            : None,
            "score_efficacite"   : 50.0,
            "nb_alertes"         : 0,
            "nb_saisies"         : 0,
            "economies_potentielles": 0.0,
        }

    # Agréger par type
    par_type = {}
    for s in saisies:
        t = s.type_energie
        if t not in par_type:
            par_type[t] = {"conso": 0.0, "cout": 0.0, "co2": 0.0, "prod": 0, "n": 0}
        par_type[t]["conso"] += s.consommation or 0
        par_type[t]["cout"]  += s.cout_total or 0
        par_type[t]["co2"]   += s.empreinte_co2 or 0
        par_type[t]["prod"]  += s.production_unites or 0
        par_type[t]["n"]     += 1

    def epi_type(t):
        d = par_type.get(t)
        if not d or d["prod"] == 0:
            return None
        return round(d["conso"] / d["prod"], 4)

    cout_total  = round(sum(d["cout"] for d in par_type.values()), 2)
    co2_total   = round(sum(d["co2"]  for d in par_type.values()), 2)
    nb_alertes  = sum(1 for s in saisies if s.niveau_alerte != NiveauAlerteEnergie.NORMAL)
    score       = calculer_score_efficacite(saisies, seuils)

    # Economies potentielles si EPI réduit à la cible
    economies = 0.0
    seuil_map = {s.type_energie: s for s in seuils}
    for t, d in par_type.items():
        seuil = seuil_map.get(t)
        if seuil and seuil.epi_cible and d["prod"] > 0:
            epi_actuel = d["conso"] / d["prod"]
            if epi_actuel > seuil.epi_cible:
                conso_cible = seuil.epi_cible * d["prod"]
                conso_economisee = d["conso"] - conso_cible
                tarif = db.query(TarifEnergie).filter(
                    TarifEnergie.produit_id == produit_id,
                    TarifEnergie.type_energie == t,
                    TarifEnergie.actif == True
                ).first()
                if tarif:
                    economies += conso_economisee * tarif.prix_unitaire

    # Comparaison jour vs nuit
    jour  = [s for s in saisies if s.shift in ["jour", "matin"]]
    nuit  = [s for s in saisies if s.shift in ["nuit", "soir"]]
    epi_jour = round(sum(s.consommation for s in jour) / max(sum(s.production_unites for s in jour), 1), 4) if jour else None
    epi_nuit = round(sum(s.consommation for s in nuit) / max(sum(s.production_unites for s in nuit), 1), 4) if nuit else None

    return {
        "cout_total_mois"       : cout_total,
        "co2_total_kg"          : co2_total,
        "epi_electricite"       : epi_type("electricite"),
        "epi_eau"               : epi_type("eau"),
        "epi_gaz"               : epi_type("gaz"),
        "score_efficacite"      : score,
        "nb_alertes"            : nb_alertes,
        "nb_saisies"            : len(saisies),
        "economies_potentielles": round(economies, 2),
        "comparaison_shift"     : {
            "epi_jour": epi_jour,
            "epi_nuit": epi_nuit,
            "ecart_pct": round((epi_nuit - epi_jour) / epi_jour * 100, 1) if epi_jour and epi_nuit else None
        },
        "par_type"              : {
            t: {
                "consommation": round(d["conso"], 2),
                "cout"        : round(d["cout"], 2),
                "co2"         : round(d["co2"], 3),
                "epi"         : round(d["conso"] / d["prod"], 4) if d["prod"] > 0 else None,
            }
            for t, d in par_type.items()
        }
    }


# ──────────────────────────────────────────────────────────────
# LOSS COSTING — COÛT RÉEL D'UN LOT RATÉ
# ──────────────────────────────────────────────────────────────

@router_energie.post("/loss-costing")
def calculer_loss_costing(data: LossCostingRequest, db: Session = Depends(get_db)):
    """
    Coût Réel de Perte = Matières + Énergie + Main d'œuvre + Amortissement + Traitement

    La formule actuelle du module 2 ne retient que la marge perdue.
    Ici on décompose le vrai coût industriel complet.
    """
    cout_matieres     = round(data.quantite_perdue_kg * data.cout_matiere_kg, 2)
    cout_energie      = round(data.energie_consommee_kwh * data.prix_kwh, 2)
    cout_main_oeuvre  = round(data.heures_operateur * data.taux_horaire, 2)
    cout_amortissement= round(data.heures_operateur * data.taux_amortissement, 2)
    cout_traitement   = round(data.cout_traitement_dechet, 2)

    cout_total = round(
        cout_matieres + cout_energie + cout_main_oeuvre +
        cout_amortissement + cout_traitement, 2
    )

    # Sauvegarder
    lc = LossCostingEnergie(
        lot_id              = data.lot_id,
        produit_id          = data.produit_id,
        cout_matieres       = cout_matieres,
        cout_energie        = cout_energie,
        cout_main_oeuvre    = cout_main_oeuvre,
        cout_amortissement  = cout_amortissement,
        cout_traitement     = cout_traitement,
        cout_total_reel     = cout_total,
    )
    db.add(lc)
    db.commit()

    return {
        "cout_total_reel"  : cout_total,
        "decomposition"    : {
            "matieres_premieres" : {"montant": cout_matieres,     "pct": round(cout_matieres / cout_total * 100, 1) if cout_total else 0},
            "energie"            : {"montant": cout_energie,      "pct": round(cout_energie / cout_total * 100, 1) if cout_total else 0},
            "main_oeuvre"        : {"montant": cout_main_oeuvre,  "pct": round(cout_main_oeuvre / cout_total * 100, 1) if cout_total else 0},
            "amortissement"      : {"montant": cout_amortissement,"pct": round(cout_amortissement / cout_total * 100, 1) if cout_total else 0},
            "traitement_dechets" : {"montant": cout_traitement,   "pct": round(cout_traitement / cout_total * 100, 1) if cout_total else 0},
        },
        "interpretation"   : (
            f"Ce lot raté a coûté réellement {cout_total:,.0f} DZD — "
            f"dont {cout_matieres:,.0f} DZD en matières et {cout_energie:,.0f} DZD en énergie gaspillée."
        ),
        "equivalent_lots"  : round(cout_total / max(cout_matieres, 1), 1),
    }


# ──────────────────────────────────────────────────────────────
# BILAN CARBONE
# ──────────────────────────────────────────────────────────────

@router_energie.get("/bilan-carbone/{produit_id}")
def get_bilan_carbone(produit_id: int, db: Session = Depends(get_db)):
    """Empreinte carbone cumulée et par unité produite."""
    from datetime import timedelta
    date_debut = date.today() - timedelta(days=365)

    saisies = db.query(SaisieEnergie).filter(
        SaisieEnergie.produit_id == produit_id,
        SaisieEnergie.date_saisie >= date_debut
    ).all()

    co2_total     = round(sum(s.empreinte_co2 or 0 for s in saisies), 2)
    prod_totale   = sum(s.production_unites or 0 for s in saisies)
    co2_par_unite = round(co2_total / prod_totale * 1000, 2) if prod_totale > 0 else 0  # g CO2 / unité

    # Par type d'énergie
    par_type = {}
    for s in saisies:
        t = s.type_energie
        par_type[t] = par_type.get(t, 0) + (s.empreinte_co2 or 0)

    # Équivalents visuels
    arbres_equivalent  = round(co2_total / 21.77, 1)    # 1 arbre absorbe ~21.77 kg CO2/an
    km_voiture_equiv   = round(co2_total / 0.21, 0)      # 0.21 kg CO2 / km voiture essence

    return {
        "co2_total_kg"        : co2_total,
        "co2_par_unite_g"     : co2_par_unite,
        "production_totale"   : prod_totale,
        "par_type_energie"    : {t: round(v, 2) for t, v in par_type.items()},
        "equivalents"         : {
            "arbres_a_planter": arbres_equivalent,
            "km_en_voiture"   : km_voiture_equiv,
        },
        "objectif_reduction"  : {
            "cible_pct"        : 20,
            "economie_co2_kg"  : round(co2_total * 0.20, 2),
            "message"          : f"Réduire de 20% = économiser {round(co2_total * 0.20, 1)} kg CO2 équivalent à planter {round(co2_total * 0.20 / 21.77, 1)} arbres"
        }
    }


# ──────────────────────────────────────────────────────────────
# COMPARAISON LOTS / SHIFTS
# ──────────────────────────────────────────────────────────────

@router_energie.get("/comparaison-shifts/{produit_id}")
def comparer_shifts(produit_id: int, db: Session = Depends(get_db)):
    """Compare la performance énergétique entre shifts."""
    from datetime import timedelta
    date_debut = date.today() - timedelta(days=30)

    saisies = db.query(SaisieEnergie).filter(
        SaisieEnergie.produit_id == produit_id,
        SaisieEnergie.date_saisie >= date_debut,
        SaisieEnergie.production_unites > 0
    ).all()

    shifts = {}
    for s in saisies:
        sh = s.shift or "inconnu"
        if sh not in shifts:
            shifts[sh] = {"conso": 0, "cout": 0, "prod": 0, "co2": 0, "n": 0}
        shifts[sh]["conso"] += s.consommation or 0
        shifts[sh]["cout"]  += s.cout_total or 0
        shifts[sh]["prod"]  += s.production_unites or 0
        shifts[sh]["co2"]   += s.empreinte_co2 or 0
        shifts[sh]["n"]     += 1

    result = {}
    for sh, d in shifts.items():
        epi = round(d["conso"] / d["prod"], 4) if d["prod"] > 0 else None
        result[sh] = {
            "consommation_totale": round(d["conso"], 2),
            "cout_total"         : round(d["cout"], 2),
            "production_totale"  : d["prod"],
            "epi"                : epi,
            "co2_total"          : round(d["co2"], 2),
            "nb_saisies"         : d["n"],
        }

    # Trouver le shift le plus efficace
    meilleur = min(result.items(), key=lambda x: x[1]["epi"] or 9999, default=None)

    return {
        "par_shift"        : result,
        "shift_optimal"    : meilleur[0] if meilleur else None,
        "recommandation"   : f"Le shift '{meilleur[0]}' est le plus efficace énergétiquement ({meilleur[1]['epi']} kWh/unité)" if meilleur else None
    }


# ──────────────────────────────────────────────────────────────
# AUDIT MENSUEL AUTOMATIQUE
# ──────────────────────────────────────────────────────────────

@router_energie.post("/audit-mensuel")
def generer_audit(data: ParametresAudit, db: Session = Depends(get_db)):
    """Génère ou régénère l'audit énergétique mensuel."""
    from datetime import date as dt_date

    debut  = dt_date(data.annee, data.mois, 1)
    if data.mois == 12:
        fin = dt_date(data.annee + 1, 1, 1)
    else:
        fin = dt_date(data.annee, data.mois + 1, 1)

    saisies = db.query(SaisieEnergie).filter(
        SaisieEnergie.produit_id == data.produit_id,
        SaisieEnergie.date_saisie >= debut,
        SaisieEnergie.date_saisie < fin
    ).all()

    if not saisies:
        raise HTTPException(404, f"Aucune saisie pour {data.mois}/{data.annee}")

    seuils = db.query(SeuilEnergie).filter(
        SeuilEnergie.produit_id == data.produit_id,
        SeuilEnergie.actif == True
    ).all()

    # Agréger
    conso_elec = sum(s.consommation for s in saisies if s.type_energie == "electricite")
    conso_eau  = sum(s.consommation for s in saisies if s.type_energie == "eau")
    conso_gaz  = sum(s.consommation for s in saisies if s.type_energie == "gaz")
    cout_total = sum(s.cout_total or 0 for s in saisies)
    prod_tot   = sum(s.production_unites or 0 for s in saisies)
    co2_tot    = sum(s.empreinte_co2 or 0 for s in saisies)

    epi_elec = round(conso_elec / prod_tot, 4) if prod_tot and conso_elec else None
    epi_eau  = round(conso_eau  / prod_tot, 4) if prod_tot and conso_eau  else None
    epi_glob = round(cout_total / prod_tot, 2) if prod_tot else None
    score    = calculer_score_efficacite(saisies, seuils)

    # Recommandations automatiques
    recommandations = []
    seuil_map = {s.type_energie: s for s in seuils}

    if epi_elec and seuil_map.get("electricite"):
        s = seuil_map["electricite"]
        if epi_elec > s.epi_cible:
            pct = round((epi_elec - s.epi_cible) / s.epi_cible * 100, 1)
            recommandations.append({
                "type"     : "electricite",
                "message"  : f"Électricité : EPI à {epi_elec} kWh/unité, soit +{pct}% vs cible ({s.epi_cible})",
                "action"   : "Vérifier les moteurs en veille et l'isolation des groupes froid",
                "gravite"  : "critique" if epi_elec >= s.epi_critique else "attention",
            })

    if epi_eau and seuil_map.get("eau"):
        s = seuil_map["eau"]
        if epi_eau > s.epi_cible:
            recommandations.append({
                "type"   : "eau",
                "message": f"Eau : EPI à {epi_eau} L/unité, cible {s.epi_cible} L/unité",
                "action" : "Auditer les nettoyages CIP et les fuites sur circuit vapeur",
                "gravite": "attention",
            })

    if score >= 85:
        recommandations.append({
            "type"   : "positif",
            "message": f"Excellente efficacité énergétique ce mois ! Score {score}/100",
            "action" : "Documenter les bonnes pratiques pour les autres shifts",
            "gravite": "ok",
        })

    # Sauvegarder ou mettre à jour
    audit = db.query(AuditEnergetique).filter(
        AuditEnergetique.produit_id == data.produit_id,
        AuditEnergetique.mois == data.mois,
        AuditEnergetique.annee == data.annee
    ).first()

    if not audit:
        audit = AuditEnergetique(produit_id=data.produit_id, mois=data.mois, annee=data.annee)
        db.add(audit)

    audit.conso_electricite  = round(conso_elec, 2)
    audit.conso_eau          = round(conso_eau, 2)
    audit.conso_gaz          = round(conso_gaz, 2)
    audit.cout_total_energie = round(cout_total, 2)
    audit.production_totale  = prod_tot
    audit.epi_electricite    = epi_elec
    audit.epi_eau            = epi_eau
    audit.epi_global         = epi_glob
    audit.score_efficacite   = score
    audit.co2_total_kg       = round(co2_tot, 2)
    audit.co2_par_unite      = round(co2_tot / prod_tot * 1000, 2) if prod_tot else 0
    audit.recommandations    = json.dumps(recommandations, ensure_ascii=False)
    audit.date_generation    = datetime.utcnow()
    db.commit()

    return {
        "mois"              : data.mois,
        "annee"             : data.annee,
        "conso_electricite" : audit.conso_electricite,
        "conso_eau"         : audit.conso_eau,
        "conso_gaz"         : audit.conso_gaz,
        "cout_total_energie": audit.cout_total_energie,
        "production_totale" : audit.production_totale,
        "epi_electricite"   : audit.epi_electricite,
        "epi_eau"           : audit.epi_eau,
        "epi_global"        : audit.epi_global,
        "score_efficacite"  : audit.score_efficacite,
        "co2_total_kg"      : audit.co2_total_kg,
        "co2_par_unite_g"   : audit.co2_par_unite,
        "recommandations"   : recommandations,
        "nb_saisies"        : len(saisies),
    }


@router_energie.get("/audits/{produit_id}")
def get_audits(produit_id: int, db: Session = Depends(get_db)):
    """Historique des audits mensuels."""
    audits = db.query(AuditEnergetique).filter(
        AuditEnergetique.produit_id == produit_id
    ).order_by(AuditEnergetique.annee.desc(), AuditEnergetique.mois.desc()).all()

    return [
        {
            "mois"              : a.mois,
            "annee"             : a.annee,
            "cout_total_energie": a.cout_total_energie,
            "production_totale" : a.production_totale,
            "epi_electricite"   : a.epi_electricite,
            "epi_eau"           : a.epi_eau,
            "score_efficacite"  : a.score_efficacite,
            "co2_total_kg"      : a.co2_total_kg,
            "economies_realisees": a.economies_realisees,
        }
        for a in audits
    ]
