# ═══════════════════════════════════════════════
# TWINOVA — Modèles de données (Pydantic)
# Définit ce que l'API accepte et retourne
# ═══════════════════════════════════════════════

from pydantic import BaseModel
from typing import Optional
from datetime import date


# ── Ce qu'on envoie pour créer un produit ────────
class ProduitCreate(BaseModel):
    nom:                str
    secteur:            str = "Agroalimentaire"
    temps_cycle:        float = 30.0
    temps_planifie:     float = 480.0
    marge_unitaire:     float = 2.5
    capacite_theorique: float = 960.0


# ── Ce que l'API retourne pour un produit ────────
class ProduitResponse(BaseModel):
    id:                 int
    nom:                str
    secteur:            str
    temps_cycle:        float
    temps_planifie:     float
    marge_unitaire:     float
    capacite_theorique: float

    class Config:
        from_attributes = True


# ── Ce qu'on envoie pour saisir des données ──────
class SaisieCreate(BaseModel):
    produit_id:          int
    date:                Optional[str] = None
    temps_panne:         float = 0.0
    temps_micro_arret:   float = 0.0
    temps_setup:         float = 0.0
    production_totale:   int
    production_conforme: int


# ── Ce que l'API retourne après calcul KPI ───────
class SaisieResponse(BaseModel):
    id:                 int
    produit_id:         int
    date:               date
    trs:                float
    disponibilite:      float
    performance:        float
    qualite:            float
    gain_potentiel_mois: float

    class Config:
        from_attributes = True


# ── Ce qu'on envoie pour une simulation ──────────
class SimulationRequest(BaseModel):
    produit_id:               int
    temps_panne:              float
    temps_micro_arret:        float
    temps_setup:              float
    production_totale:        int
    production_conforme:      int
    reduction_panne_pct:      float = 0.0
    reduction_defaut_pct:     float = 0.0
    augmentation_cadence_pct: float = 0.0