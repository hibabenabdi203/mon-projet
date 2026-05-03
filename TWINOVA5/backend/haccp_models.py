"""
=============================================================
TWINOVA — MODULE 3 HACCP & SÉCURITÉ SANITAIRE
Ajouts à database.py  —  copier ces classes à la suite des
modèles existants dans database.py
=============================================================
"""

from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Text, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import relationship
from database import Base   # import de votre Base existante
import enum
from datetime import datetime


# ──────────────────────────────────────────────────────────────
# ENUMS
# ──────────────────────────────────────────────────────────────

class NiveauGravite(str, enum.Enum):
    MINEURE  = "mineure"
    CRITIQUE = "critique"

class StatutLotHACCP(str, enum.Enum):
    EN_ATTENTE  = "en_attente"
    CONFORME    = "conforme"
    BLOQUE      = "bloque"
    LIBERE      = "libere"

class TypeParametreHACCP(str, enum.Enum):
    TEMPERATURE   = "temperature"
    PH            = "ph"
    METAL         = "metal"
    HUMIDITE      = "humidite"
    MICRO         = "microbiologie"
    VISUEL        = "visuel"


# ──────────────────────────────────────────────────────────────
# TABLE : PlanHACCP — une fiche HACCP par recette
# ──────────────────────────────────────────────────────────────

class PlanHACCP(Base):
    __tablename__ = "plan_haccp"

    id              = Column(Integer, primary_key=True, index=True)
    recette_id      = Column(Integer, ForeignKey("recettes.id"), nullable=False)
    nom_plan        = Column(String(200), nullable=False)
    version         = Column(String(20), default="1.0")
    responsable     = Column(String(100))
    date_creation   = Column(DateTime, default=datetime.utcnow)
    date_revision   = Column(DateTime, default=datetime.utcnow)
    actif           = Column(Boolean, default=True)

    seuils          = relationship("SeuilCritique", back_populates="plan", cascade="all, delete-orphan")


# ──────────────────────────────────────────────────────────────
# TABLE : SeuilCritique — un CCP (Critical Control Point) par ligne
# ──────────────────────────────────────────────────────────────

class SeuilCritique(Base):
    __tablename__ = "seuil_critique"

    id                  = Column(Integer, primary_key=True, index=True)
    plan_id             = Column(Integer, ForeignKey("plan_haccp.id"), nullable=False)
    etape_process       = Column(String(100), nullable=False)   # ex: "Pasteurisation"
    type_parametre      = Column(SAEnum(TypeParametreHACCP), nullable=False)
    libelle             = Column(String(150))                   # ex: "Température sortie"
    unite               = Column(String(20))                    # °C, pH, ppm, %
    valeur_min          = Column(Float)
    valeur_max          = Column(Float)
    valeur_cible        = Column(Float)
    action_mineure      = Column(Text)   # si mineure : ex "Rallonger durée chauffe"
    action_critique     = Column(Text)   # si critique : ex "Isoler lot — Détruire"
    niveau_gravite      = Column(SAEnum(NiveauGravite), default=NiveauGravite.CRITIQUE)
    email_alerte        = Column(String(200))                   # destinataire email
    actif               = Column(Boolean, default=True)

    plan                = relationship("PlanHACCP", back_populates="seuils")


# ──────────────────────────────────────────────────────────────
# TABLE : ControleHACCP — une saisie terrain par lot
# ──────────────────────────────────────────────────────────────

class ControleHACCP(Base):
    __tablename__ = "controle_haccp"

    id                  = Column(Integer, primary_key=True, index=True)
    lot_id              = Column(Integer, ForeignKey("lots_production.id"), nullable=False)
    seuil_id            = Column(Integer, ForeignKey("seuil_critique.id"), nullable=False)
    valeur_mesuree      = Column(Float, nullable=False)
    operateur           = Column(String(100))
    horodatage          = Column(DateTime, default=datetime.utcnow)
    conforme            = Column(Boolean)          # calculé auto
    ecart              = Column(Float)              # valeur_mesuree - cible
    action_appliquee    = Column(Text)
    commentaire         = Column(Text)

    alerte              = relationship("AlerteHACCP", back_populates="controle", uselist=False)


# ──────────────────────────────────────────────────────────────
# TABLE : AlerteHACCP — générée auto si non-conforme
# ──────────────────────────────────────────────────────────────

class AlerteHACCP(Base):
    __tablename__ = "alerte_haccp"

    id              = Column(Integer, primary_key=True, index=True)
    controle_id     = Column(Integer, ForeignKey("controle_haccp.id"), nullable=False)
    lot_id          = Column(Integer, ForeignKey("lots_production.id"), nullable=False)
    niveau_gravite  = Column(SAEnum(NiveauGravite), nullable=False)
    message         = Column(Text)
    action_requise  = Column(Text)
    email_envoye    = Column(Boolean, default=False)
    email_destinat  = Column(String(200))
    acquittee       = Column(Boolean, default=False)
    acquittee_par   = Column(String(100))
    acquittee_le    = Column(DateTime)
    horodatage      = Column(DateTime, default=datetime.utcnow)

    controle        = relationship("ControleHACCP", back_populates="alerte")


# ──────────────────────────────────────────────────────────────
# TABLE : StatutSanitaireLot — état global HACCP d'un lot
# ──────────────────────────────────────────────────────────────

class StatutSanitaireLot(Base):
    __tablename__ = "statut_sanitaire_lot"

    id                      = Column(Integer, primary_key=True, index=True)
    lot_id                  = Column(Integer, ForeignKey("lots_production.id"), nullable=False, unique=True)
    statut                  = Column(SAEnum(StatutLotHACCP), default=StatutLotHACCP.EN_ATTENTE)
    indice_conformite       = Column(Float, default=0.0)   # (conformes/total)*100
    temps_exposition_risque = Column(Float, default=0.0)   # minutes hors zone sécurité
    valeur_pasteurisatrice  = Column(Float)                # VP calculée
    liberation_autorisee    = Column(Boolean, default=False)
    libere_par              = Column(String(100))
    libere_le               = Column(DateTime)
    nb_controles            = Column(Integer, default=0)
    nb_conformes            = Column(Integer, default=0)
    nb_alertes_mineures     = Column(Integer, default=0)
    nb_alertes_critiques    = Column(Integer, default=0)
    derniere_maj            = Column(DateTime, default=datetime.utcnow)


# ──────────────────────────────────────────────────────────────
# DONNÉES DE DÉMONSTRATION — appeler une seule fois au démarrage
# ──────────────────────────────────────────────────────────────

def seed_haccp_demo(db):
    """Insère des plans HACCP de démonstration si la table est vide."""
    if db.query(PlanHACCP).count() > 0:
        return

    # Plan 1 — Pasteurisation lait (recette_id=1 hypothétique)
    plan1 = PlanHACCP(
        recette_id=1,
        nom_plan="HACCP Pasteurisation Lait",
        version="2.1",
        responsable="Responsable Qualité",
    )
    db.add(plan1)
    db.flush()

    seuils_p1 = [
        SeuilCritique(
            plan_id=plan1.id,
            etape_process="Pasteurisation",
            type_parametre=TypeParametreHACCP.TEMPERATURE,
            libelle="Température de sortie pasteuriseur",
            unite="°C",
            valeur_min=72.0,
            valeur_max=85.0,
            valeur_cible=75.0,
            action_mineure="Vérifier le thermostat — Prolonger le traitement",
            action_critique="ISOLER LE LOT — Recirculation obligatoire — Alerter Responsable",
            niveau_gravite=NiveauGravite.CRITIQUE,
            email_alerte="qualite@twinova.dz",
        ),
        SeuilCritique(
            plan_id=plan1.id,
            etape_process="Refroidissement",
            type_parametre=TypeParametreHACCP.TEMPERATURE,
            libelle="Température après refroidissement",
            unite="°C",
            valeur_min=2.0,
            valeur_max=6.0,
            valeur_cible=4.0,
            action_mineure="Réajuster la vitesse de refroidissement",
            action_critique="ISOLER LE LOT — Vérifier la chaîne du froid",
            niveau_gravite=NiveauGravite.CRITIQUE,
            email_alerte="qualite@twinova.dz",
        ),
        SeuilCritique(
            plan_id=plan1.id,
            etape_process="Contrôle final",
            type_parametre=TypeParametreHACCP.METAL,
            libelle="Détection corps étrangers métalliques",
            unite="ppm",
            valeur_min=None,
            valeur_max=0.5,
            valeur_cible=0.0,
            action_mineure="Passer au détecteur secondaire",
            action_critique="BLOQUER ET DÉTRUIRE LE LOT — Traçabilité obligatoire",
            niveau_gravite=NiveauGravite.CRITIQUE,
            email_alerte="qualite@twinova.dz",
        ),
    ]

    # Plan 2 — Fermentation yaourt
    plan2 = PlanHACCP(
        recette_id=2,
        nom_plan="HACCP Fermentation Yaourt",
        version="1.3",
        responsable="Chef de Production",
    )
    db.add(plan2)
    db.flush()

    seuils_p2 = [
        SeuilCritique(
            plan_id=plan2.id,
            etape_process="Fermentation",
            type_parametre=TypeParametreHACCP.PH,
            libelle="pH final après fermentation",
            unite="pH",
            valeur_min=4.0,
            valeur_max=4.6,
            valeur_cible=4.3,
            action_mineure="Prolonger fermentation de 30 min",
            action_critique="ISOLER LE LOT — Analyse microbiologique urgente",
            niveau_gravite=NiveauGravite.CRITIQUE,
            email_alerte="qualite@twinova.dz",
        ),
        SeuilCritique(
            plan_id=plan2.id,
            etape_process="Fermentation",
            type_parametre=TypeParametreHACCP.TEMPERATURE,
            libelle="Température étuve fermentation",
            unite="°C",
            valeur_min=40.0,
            valeur_max=45.0,
            valeur_cible=42.0,
            action_mineure="Réajuster thermostat étuve",
            action_critique="ISOLER LE LOT — Fermentation compromise",
            niveau_gravite=NiveauGravite.CRITIQUE,
            email_alerte="qualite@twinova.dz",
        ),
        SeuilCritique(
            plan_id=plan2.id,
            etape_process="Refroidissement",
            type_parametre=TypeParametreHACCP.TEMPERATURE,
            libelle="Température refroidissement post-fermentation",
            unite="°C",
            valeur_min=2.0,
            valeur_max=8.0,
            valeur_cible=4.0,
            action_mineure="Accélérer le refroidissement",
            action_critique="ISOLER LE LOT — Risque de sur-acidification",
            niveau_gravite=NiveauGravite.MINEURE,
            email_alerte="qualite@twinova.dz",
        ),
    ]

    for s in seuils_p1 + seuils_p2:
        db.add(s)

    db.commit()
    print("✅ Données HACCP de démonstration insérées.")