"""
=============================================================
TWINOVA — MODULE 4 : OPTIMISATION ÉNERGÉTIQUE & ÉCONOMIQUE
Modèles à ajouter dans database.py
=============================================================
"""

from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Text, ForeignKey, Enum as SAEnum, Date
from sqlalchemy.orm import relationship
from database import Base
import enum
from datetime import datetime


# ──────────────────────────────────────────────────────────────
# ENUMS
# ──────────────────────────────────────────────────────────────

class TypeEnergie(str, enum.Enum):
    ELECTRICITE = "electricite"
    EAU         = "eau"
    GAZ         = "gaz"
    FIOUL       = "fioul"
    VAPEUR      = "vapeur"
    AIR_COMPRIME= "air_comprime"

class PeriodeTarifaire(str, enum.Enum):
    CREUSE  = "creuse"
    PLEINE  = "pleine"
    POINTE  = "pointe"

class NiveauAlerteEnergie(str, enum.Enum):
    NORMAL   = "normal"
    ATTENTION= "attention"
    CRITIQUE = "critique"


# ──────────────────────────────────────────────────────────────
# TABLE : TarifEnergie — prix unitaire par type et période
# ──────────────────────────────────────────────────────────────

class TarifEnergie(Base):
    __tablename__ = "tarif_energie"

    id              = Column(Integer, primary_key=True, index=True)
    produit_id      = Column(Integer, ForeignKey("produits.id"), nullable=False)
    type_energie    = Column(SAEnum(TypeEnergie), nullable=False)
    periode         = Column(SAEnum(PeriodeTarifaire), default=PeriodeTarifaire.PLEINE)
    prix_unitaire   = Column(Float, nullable=False)   # DZD / kWh ou DZD / m³
    unite           = Column(String(20), default="kWh")
    devise          = Column(String(10), default="DZD")
    facteur_co2     = Column(Float, default=0.5)       # kg CO2 / unité
    actif           = Column(Boolean, default=True)
    date_creation   = Column(DateTime, default=datetime.utcnow)


# ──────────────────────────────────────────────────────────────
# TABLE : SaisieEnergie — saisie terrain consommation
# ──────────────────────────────────────────────────────────────

class SaisieEnergie(Base):
    __tablename__ = "saisie_energie"

    id                  = Column(Integer, primary_key=True, index=True)
    produit_id          = Column(Integer, ForeignKey("produits.id"), nullable=False)
    lot_id              = Column(Integer, ForeignKey("lots_production.id"), nullable=True)
    date_saisie         = Column(Date, nullable=False)
    shift               = Column(String(20), default="jour")    # jour / nuit / matin / soir
    type_energie        = Column(SAEnum(TypeEnergie), nullable=False)
    periode_tarifaire   = Column(SAEnum(PeriodeTarifaire), default=PeriodeTarifaire.PLEINE)
    consommation        = Column(Float, nullable=False)          # kWh ou m³
    unite               = Column(String(20), default="kWh")
    production_unites   = Column(Integer, default=0)             # unités produites pendant ce laps
    operateur           = Column(String(100))
    notes               = Column(Text)
    horodatage          = Column(DateTime, default=datetime.utcnow)

    # Champs calculés (remplis auto par l'API)
    cout_total          = Column(Float)                          # DZD
    epi                 = Column(Float)                          # kWh / unité
    empreinte_co2       = Column(Float)                          # kg CO2
    niveau_alerte       = Column(SAEnum(NiveauAlerteEnergie), default=NiveauAlerteEnergie.NORMAL)


# ──────────────────────────────────────────────────────────────
# TABLE : SeuilEnergie — cibles et alertes par produit
# ──────────────────────────────────────────────────────────────

class SeuilEnergie(Base):
    __tablename__ = "seuil_energie"

    id              = Column(Integer, primary_key=True, index=True)
    produit_id      = Column(Integer, ForeignKey("produits.id"), nullable=False)
    type_energie    = Column(SAEnum(TypeEnergie), nullable=False)
    epi_cible       = Column(Float)        # kWh cible / unité
    epi_alerte      = Column(Float)        # seuil déclenchant alerte attention
    epi_critique    = Column(Float)        # seuil déclenchant alerte critique
    actif           = Column(Boolean, default=True)


# ──────────────────────────────────────────────────────────────
# TABLE : LossCostingEnergie — coût réel d'un lot raté
# ──────────────────────────────────────────────────────────────

class LossCostingEnergie(Base):
    __tablename__ = "loss_costing_energie"

    id                   = Column(Integer, primary_key=True, index=True)
    lot_id               = Column(Integer, ForeignKey("lots_production.id"), nullable=False)
    produit_id           = Column(Integer, ForeignKey("produits.id"), nullable=False)
    date_calcul          = Column(DateTime, default=datetime.utcnow)

    # Composantes du coût réel
    cout_matieres        = Column(Float, default=0.0)   # DZD — matières perdues
    cout_energie         = Column(Float, default=0.0)   # DZD — énergie consommée pour rien
    cout_main_oeuvre     = Column(Float, default=0.0)   # DZD — heures-opérateur
    cout_amortissement   = Column(Float, default=0.0)   # DZD — usure machine
    cout_traitement      = Column(Float, default=0.0)   # DZD — destruction / retraitement

    # Total
    cout_total_reel      = Column(Float, default=0.0)
    marge_perdue         = Column(Float, default=0.0)
    ratio_perte_ca       = Column(Float, default=0.0)   # % du CA potentiel


# ──────────────────────────────────────────────────────────────
# TABLE : AuditEnergetique — rapport mensuel auto
# ──────────────────────────────────────────────────────────────

class AuditEnergetique(Base):
    __tablename__ = "audit_energetique"

    id                   = Column(Integer, primary_key=True, index=True)
    produit_id           = Column(Integer, ForeignKey("produits.id"), nullable=False)
    mois                 = Column(Integer, nullable=False)   # 1-12
    annee                = Column(Integer, nullable=False)
    date_generation      = Column(DateTime, default=datetime.utcnow)

    # Consommations du mois
    conso_electricite    = Column(Float, default=0.0)   # kWh
    conso_eau            = Column(Float, default=0.0)   # m³
    conso_gaz            = Column(Float, default=0.0)   # m³ ou kg
    cout_total_energie   = Column(Float, default=0.0)   # DZD
    production_totale    = Column(Integer, default=0)   # unités

    # EPI du mois
    epi_electricite      = Column(Float)   # kWh / unité
    epi_eau              = Column(Float)   # L / unité
    epi_global           = Column(Float)   # coût DZD / unité

    # Score d'efficacité (0-100)
    score_efficacite     = Column(Float, default=0.0)

    # Empreinte carbone
    co2_total_kg         = Column(Float, default=0.0)
    co2_par_unite        = Column(Float, default=0.0)

    # Comparaison mois précédent
    variation_conso      = Column(Float, default=0.0)   # %
    variation_epi        = Column(Float, default=0.0)   # %
    economies_realisees  = Column(Float, default=0.0)   # DZD

    # Recommandations auto
    recommandations      = Column(Text)   # JSON string


# ──────────────────────────────────────────────────────────────
# SEED DONNÉES DÉMO
# ──────────────────────────────────────────────────────────────

def seed_energie_demo(db):
    """Insère des tarifs et seuils de démonstration."""
    if db.query(TarifEnergie).count() > 0:
        return

    tarifs = [
        TarifEnergie(produit_id=1, type_energie=TypeEnergie.ELECTRICITE,
                     periode=PeriodeTarifaire.PLEINE, prix_unitaire=7.50,
                     unite="kWh", devise="DZD", facteur_co2=0.512),
        TarifEnergie(produit_id=1, type_energie=TypeEnergie.ELECTRICITE,
                     periode=PeriodeTarifaire.CREUSE, prix_unitaire=4.20,
                     unite="kWh", devise="DZD", facteur_co2=0.512),
        TarifEnergie(produit_id=1, type_energie=TypeEnergie.EAU,
                     periode=PeriodeTarifaire.PLEINE, prix_unitaire=28.0,
                     unite="m3", devise="DZD", facteur_co2=0.0),
        TarifEnergie(produit_id=1, type_energie=TypeEnergie.GAZ,
                     periode=PeriodeTarifaire.PLEINE, prix_unitaire=18.5,
                     unite="m3", devise="DZD", facteur_co2=2.04),
    ]
    for t in tarifs:
        db.add(t)

    seuils = [
        SeuilEnergie(produit_id=1, type_energie=TypeEnergie.ELECTRICITE,
                     epi_cible=0.15, epi_alerte=0.20, epi_critique=0.28),
        SeuilEnergie(produit_id=1, type_energie=TypeEnergie.EAU,
                     epi_cible=2.5, epi_alerte=3.5, epi_critique=5.0),
    ]
    for s in seuils:
        db.add(s)

    db.commit()
    print("✅ Données Énergie de démonstration insérées.")