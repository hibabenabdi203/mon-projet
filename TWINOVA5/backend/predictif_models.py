"""
=============================================================
TWINOVA — MODULE 5 : MAINTENANCE PRÉDICTIVE
Modèles à ajouter dans database.py
=============================================================
"""

from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Text, ForeignKey, Enum as SAEnum, Date, JSON
from sqlalchemy.orm import relationship
from database import Base
import enum
from datetime import datetime


# ──────────────────────────────────────────────────────────────
# ENUMS
# ──────────────────────────────────────────────────────────────

class NiveauAlertePredict(str, enum.Enum):
    NORMAL    = "normal"
    SURVEILLER= "surveiller"   # 🟡
    PLANIFIER = "planifier"    # 🟠
    AGIR      = "agir"         # 🔴

class TypeComposant(str, enum.Enum):
    MOTEUR       = "moteur"
    POMPE        = "pompe"
    CAPTEUR      = "capteur"
    VANNE        = "vanne"
    ECHANGEUR    = "echangeur"
    COMPRESSEUR  = "compresseur"
    CONVOYEUR    = "convoyeur"
    AUTRE        = "autre"

class StatutPrediction(str, enum.Enum):
    EN_COURS  = "en_cours"
    VALIDEE   = "validee"    # panne survenue comme prédit
    MANQUEE   = "manquee"    # panne non prédite
    FAUSSE    = "fausse"     # alerte sans panne réelle


# ──────────────────────────────────────────────────────────────
# TABLE : ComposantMachine
# ──────────────────────────────────────────────────────────────

class ComposantMachine(Base):
    __tablename__ = "composant_machine"

    id                   = Column(Integer, primary_key=True, index=True)
    produit_id           = Column(Integer, ForeignKey("produits.id"), nullable=False)
    nom                  = Column(String(150), nullable=False)
    type_composant       = Column(SAEnum(TypeComposant), default=TypeComposant.AUTRE)
    description          = Column(Text)
    date_installation    = Column(Date)
    duree_vie_theorique_h= Column(Float)     # heures de vie théorique
    heures_utilisees     = Column(Float, default=0.0)
    derniere_maintenance = Column(Date)
    cout_remplacement    = Column(Float)     # DZD
    criticite            = Column(Integer, default=3)  # 1-5 (5 = critique)
    actif                = Column(Boolean, default=True)

    mesures              = relationship("MesureComposant", back_populates="composant")
    predictions          = relationship("PredictionPanne", back_populates="composant")


# ──────────────────────────────────────────────────────────────
# TABLE : MesureComposant — saisie terrain des signaux faibles
# ──────────────────────────────────────────────────────────────

class MesureComposant(Base):
    __tablename__ = "mesure_composant"

    id               = Column(Integer, primary_key=True, index=True)
    composant_id     = Column(Integer, ForeignKey("composant_machine.id"), nullable=False)
    produit_id       = Column(Integer, ForeignKey("produits.id"), nullable=False)
    horodatage       = Column(DateTime, default=datetime.utcnow)
    shift            = Column(String(20))

    # Paramètres physiques mesurés
    temperature_c    = Column(Float)       # température moteur/palier
    vibration_mm_s   = Column(Float)       # vibration en mm/s
    courant_a        = Column(Float)       # intensité électrique (A)
    pression_bar     = Column(Float)       # pression process
    debit_l_h        = Column(Float)       # débit liquide
    bruit_db         = Column(Float)       # niveau sonore
    vitesse_rpm      = Column(Float)       # vitesse rotation

    # Paramètres process (liens Module 2 & 3)
    micro_arrets_min = Column(Float)       # depuis Module 2
    ph_mesure        = Column(Float)       # depuis Module 3
    rendement_pct    = Column(Float)       # depuis Module 2

    # Score calculé auto
    hsi_score        = Column(Float)       # Health Score Index 0-100
    niveau_alerte    = Column(SAEnum(NiveauAlertePredict), default=NiveauAlertePredict.NORMAL)
    operateur        = Column(String(100))
    notes            = Column(Text)

    composant        = relationship("ComposantMachine", back_populates="mesures")


# ──────────────────────────────────────────────────────────────
# TABLE : PredictionPanne
# ──────────────────────────────────────────────────────────────

class PredictionPanne(Base):
    __tablename__ = "prediction_panne"

    id                   = Column(Integer, primary_key=True, index=True)
    composant_id         = Column(Integer, ForeignKey("composant_machine.id"), nullable=False)
    produit_id           = Column(Integer, ForeignKey("produits.id"), nullable=False)
    date_prediction      = Column(DateTime, default=datetime.utcnow)

    # RUL — Remaining Useful Life
    rul_heures           = Column(Float)           # heures restantes estimées
    date_panne_estimee   = Column(DateTime)
    probabilite_panne    = Column(Float)           # 0.0 à 1.0
    niveau_alerte        = Column(SAEnum(NiveauAlertePredict))

    # Contexte
    signal_declencheur   = Column(Text)            # ex: "vibration +40% en 3j"
    cause_probable       = Column(Text)
    action_recommandee   = Column(Text)
    whatif_cout_panne    = Column(Float)           # DZD — coût si on n'agit pas
    whatif_cout_prev     = Column(Float)           # DZD — coût intervention préventive
    ratio_economie       = Column(Float)           # whatif_cout_panne / whatif_cout_prev

    # Validation
    statut               = Column(SAEnum(StatutPrediction), default=StatutPrediction.EN_COURS)
    date_panne_reelle    = Column(DateTime)
    commentaire_retour   = Column(Text)

    composant            = relationship("ComposantMachine", back_populates="predictions")


# ──────────────────────────────────────────────────────────────
# TABLE : PatternPanne — mémoire des signes avant-coureurs
# ──────────────────────────────────────────────────────────────

class PatternPanne(Base):
    __tablename__ = "pattern_panne"

    id                = Column(Integer, primary_key=True, index=True)
    produit_id        = Column(Integer, ForeignKey("produits.id"), nullable=False)
    type_composant    = Column(SAEnum(TypeComposant))
    nom_pattern       = Column(String(200))
    description       = Column(Text)

    # Seuils déclencheurs
    seuil_temperature = Column(Float)
    seuil_vibration   = Column(Float)
    seuil_micro_arrets= Column(Float)
    seuil_rendement   = Column(Float)

    # Résultat observé
    heures_avant_panne= Column(Float)    # délai moyen entre signal et panne
    cout_moyen_panne  = Column(Float)    # DZD
    fiabilite_pattern = Column(Float)    # % de fois où ce pattern a mené à une panne
    nb_occurrences    = Column(Integer, default=0)
    actif             = Column(Boolean, default=True)


# ──────────────────────────────────────────────────────────────
# TABLE : RapportPredictif — rapport mensuel prédictions vs réalité
# ──────────────────────────────────────────────────────────────

class RapportPredictif(Base):
    __tablename__ = "rapport_predictif"

    id                    = Column(Integer, primary_key=True, index=True)
    produit_id            = Column(Integer, ForeignKey("produits.id"), nullable=False)
    mois                  = Column(Integer)
    annee                 = Column(Integer)
    date_generation       = Column(DateTime, default=datetime.utcnow)

    nb_predictions_total  = Column(Integer, default=0)
    nb_validees           = Column(Integer, default=0)   # panne survenue comme prédit
    nb_manquees           = Column(Integer, default=0)
    nb_fausses            = Column(Integer, default=0)

    taux_fiabilite        = Column(Float, default=0.0)   # %
    cout_evite_total      = Column(Float, default=0.0)   # DZD
    hsi_moyen             = Column(Float, default=0.0)   # Health Score moyen du mois
    temps_arret_evite_h   = Column(Float, default=0.0)   # heures de panne évitées


# ──────────────────────────────────────────────────────────────
# SEED DONNÉES DÉMO
# ──────────────────────────────────────────────────────────────

def seed_predictif_demo(db):
    if db.query(ComposantMachine).count() > 0:
        return

    composants = [
        ComposantMachine(
            produit_id=1, nom="Pompe à lait principale",
            type_composant=TypeComposant.POMPE,
            description="Pompe centrifuge ligne pasteurisation",
            duree_vie_theorique_h=8760.0, heures_utilisees=5200.0,
            cout_remplacement=185000.0, criticite=5,
        ),
        ComposantMachine(
            produit_id=1, nom="Moteur convoyeur bouteilles",
            type_composant=TypeComposant.MOTEUR,
            description="Moteur 7.5 kW ligne remplissage",
            duree_vie_theorique_h=12000.0, heures_utilisees=3800.0,
            cout_remplacement=95000.0, criticite=4,
        ),
        ComposantMachine(
            produit_id=1, nom="Capteur pH fermentation",
            type_composant=TypeComposant.CAPTEUR,
            description="Électrode pH cuve yaourt",
            duree_vie_theorique_h=2000.0, heures_utilisees=1650.0,
            cout_remplacement=28000.0, criticite=5,
        ),
        ComposantMachine(
            produit_id=1, nom="Compresseur air process",
            type_composant=TypeComposant.COMPRESSEUR,
            description="Compresseur 15 bar alimentation vannes",
            duree_vie_theorique_h=20000.0, heures_utilisees=11000.0,
            cout_remplacement=320000.0, criticite=3,
        ),
    ]

    for c in composants:
        db.add(c)
    db.flush()

    patterns = [
        PatternPanne(
            produit_id=1,
            type_composant=TypeComposant.POMPE,
            nom_pattern="Surchauffe avant blocage pompe",
            description="Température palier > 75°C + vibration > 4 mm/s → blocage 4-6h après",
            seuil_temperature=75.0, seuil_vibration=4.0,
            heures_avant_panne=5.0, cout_moyen_panne=280000.0,
            fiabilite_pattern=0.87, nb_occurrences=7,
        ),
        PatternPanne(
            produit_id=1,
            type_composant=TypeComposant.CAPTEUR,
            nom_pattern="Dérive électrode pH",
            description="Écart pH mesuré vs théorique > 0.3 pendant 2h → capteur HS dans 12h",
            seuil_rendement=95.0,
            heures_avant_panne=12.0, cout_moyen_panne=45000.0,
            fiabilite_pattern=0.92, nb_occurrences=12,
        ),
        PatternPanne(
            produit_id=1,
            type_composant=TypeComposant.MOTEUR,
            nom_pattern="Micro-arrêts précurseurs",
            description="Micro-arrêts > 25 min/j pendant 3j consécutifs → panne moteur dans 48h",
            seuil_micro_arrets=25.0,
            heures_avant_panne=48.0, cout_moyen_panne=150000.0,
            fiabilite_pattern=0.78, nb_occurrences=5,
        ),
    ]

    for p in patterns:
        db.add(p)

    db.commit()
    print("✅ Données Maintenance Prédictive insérées.")