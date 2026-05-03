from sqlalchemy import Column, Integer, Float, String, DateTime, JSON, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base
import random, string

# ── Catalogue machines virtuelles ─────────────────────────────────────────────
class MachineVirtuelle(Base):
    __tablename__ = "machines_virtuelles"
    id              = Column(Integer, primary_key=True)
    nom             = Column(String)
    categorie       = Column(String)  # reception, transformation, conditionnement, stockage
    icon            = Column(String)
    prix_dzd        = Column(Float)
    puissance_kw    = Column(Float)
    debit_kg_h      = Column(Float)
    surface_m2      = Column(Float)
    nb_operateurs   = Column(Integer, default=1)
    taux_rendement  = Column(Float, default=95.0)
    description     = Column(String)
    secteurs        = Column(String)  # JSON list: ["Laiterie","Boulangerie"]

# ── Projet Greenfield ──────────────────────────────────────────────────────────
class ProjetGreenfield(Base):
    __tablename__ = "projets_greenfield"
    id               = Column(Integer, primary_key=True)
    utilisateur_id   = Column(Integer)
    nom_projet       = Column(String)
    secteur          = Column(String)
    localisation     = Column(String)
    date_creation    = Column(DateTime, default=datetime.utcnow)

    # Paramètres marché
    prix_vente_kg    = Column(Float, default=0)
    cout_mp_kg       = Column(Float, default=0)
    cout_mdo_mois    = Column(Float, default=0)
    cout_energie_kwh = Column(Float, default=7.5)
    loyer_mois       = Column(Float, default=0)
    autres_charges   = Column(Float, default=0)

    # Objectifs
    production_cible_kg_j = Column(Float, default=1000)
    jours_travail_mois    = Column(Integer, default=22)

    # Investissement
    investissement_total  = Column(Float, default=0)
    apport_propre_pct     = Column(Float, default=30)
    taux_interet          = Column(Float, default=6.0)
    duree_credit_ans      = Column(Integer, default=5)

    # Configuration ligne (JSON)
    ligne_configuration   = Column(JSON, default=[])

    simulations = relationship("SimulationGreenfield", back_populates="projet")

# ── Résultats simulation ───────────────────────────────────────────────────────
class SimulationGreenfield(Base):
    __tablename__ = "simulations_greenfield"
    id             = Column(Integer, primary_key=True)
    projet_id      = Column(Integer, ForeignKey("projets_greenfield.id"))
    date_sim       = Column(DateTime, default=datetime.utcnow)

    # Résultats financiers
    ca_mensuel          = Column(Float)
    cout_production     = Column(Float)
    marge_brute         = Column(Float)
    ebitda              = Column(Float)
    point_mort_unites   = Column(Float)
    point_mort_mois     = Column(Integer)
    roi_pct             = Column(Float)
    van_5ans            = Column(Float)
    tri_pct             = Column(Float)
    payback_mois        = Column(Integer)

    # Dimensionnement
    surface_totale_m2   = Column(Float)
    nb_operateurs_total = Column(Integer)
    puissance_totale_kw = Column(Float)
    stock_encours_kg    = Column(Float)

    projet = relationship("ProjetGreenfield", back_populates="simulations")


def seed_greenfield_demo(db):
    """Peupler la bibliothèque de machines virtuelles"""
    if db.query(MachineVirtuelle).first():
        return

    machines = [
        # ── Réception ──
        MachineVirtuelle(nom="Trémie de réception", categorie="reception", icon="🏗️",
            prix_dzd=850_000, puissance_kw=2.2, debit_kg_h=5000, surface_m2=12,
            nb_operateurs=1, taux_rendement=99, description="Réception et pesage des matières premières",
            secteurs='["Laiterie","Boulangerie","Conserverie","Fromagerie"]'),
        MachineVirtuelle(nom="Dépalettiseur automatique", categorie="reception", icon="📦",
            prix_dzd=1_200_000, puissance_kw=3.5, debit_kg_h=2000, surface_m2=15,
            nb_operateurs=1, taux_rendement=97, description="Déchargement automatisé des palettes",
            secteurs='["Boulangerie","Conserverie"]'),

        # ── Transformation ──
        MachineVirtuelle(nom="Pasteurisateur HTST", categorie="transformation", icon="🌡️",
            prix_dzd=4_500_000, puissance_kw=18, debit_kg_h=3000, surface_m2=20,
            nb_operateurs=1, taux_rendement=98, description="Pasteurisation haute température courte durée",
            secteurs='["Laiterie","Fromagerie"]'),
        MachineVirtuelle(nom="Pétrin industriel 300L", categorie="transformation", icon="🌀",
            prix_dzd=1_800_000, puissance_kw=15, debit_kg_h=400, surface_m2=8,
            nb_operateurs=1, taux_rendement=96, description="Pétrissage automatique spirale",
            secteurs='["Boulangerie"]'),
        MachineVirtuelle(nom="Cuve de fermentation 5000L", categorie="transformation", icon="🧪",
            prix_dzd=2_200_000, puissance_kw=4, debit_kg_h=800, surface_m2=16,
            nb_operateurs=1, taux_rendement=97, description="Fermentation contrôlée température/pH",
            secteurs='["Laiterie","Fromagerie"]'),
        MachineVirtuelle(nom="Autoclave stérilisation", categorie="transformation", icon="🔥",
            prix_dzd=3_800_000, puissance_kw=45, debit_kg_h=1200, surface_m2=18,
            nb_operateurs=2, taux_rendement=95, description="Stérilisation par chaleur vapeur",
            secteurs='["Conserverie"]'),
        MachineVirtuelle(nom="Mélangeur inox 1000L", categorie="transformation", icon="⚙️",
            prix_dzd=950_000, puissance_kw=7.5, debit_kg_h=2000, surface_m2=10,
            nb_operateurs=1, taux_rendement=98, description="Mélange et homogénéisation",
            secteurs='["Laiterie","Boulangerie","Conserverie","Fromagerie"]'),
        MachineVirtuelle(nom="Four tunnel 25m", categorie="transformation", icon="🔆",
            prix_dzd=5_500_000, puissance_kw=80, debit_kg_h=600, surface_m2=60,
            nb_operateurs=2, taux_rendement=94, description="Cuisson continue gaz/électrique",
            secteurs='["Boulangerie"]'),

        # ── Conditionnement ──
        MachineVirtuelle(nom="Remplisseuse 6 têtes", categorie="conditionnement", icon="🚿",
            prix_dzd=2_800_000, puissance_kw=5, debit_kg_h=1500, surface_m2=12,
            nb_operateurs=2, taux_rendement=95, description="Remplissage aseptique pots/bouteilles",
            secteurs='["Laiterie","Fromagerie"]'),
        MachineVirtuelle(nom="Ligne d'emballage Flow-Pack", categorie="conditionnement", icon="📦",
            prix_dzd=3_200_000, puissance_kw=8, debit_kg_h=800, surface_m2=25,
            nb_operateurs=2, taux_rendement=93, description="Emballage individuel sous film",
            secteurs='["Boulangerie","Conserverie"]'),
        MachineVirtuelle(nom="Étiqueteuse automatique", categorie="conditionnement", icon="🏷️",
            prix_dzd=680_000, puissance_kw=1.5, debit_kg_h=3000, surface_m2=6,
            nb_operateurs=1, taux_rendement=97, description="Étiquetage recto-verso automatique",
            secteurs='["Laiterie","Boulangerie","Conserverie","Fromagerie"]'),
        MachineVirtuelle(nom="Thermoformeuse", categorie="conditionnement", icon="🔲",
            prix_dzd=2_100_000, puissance_kw=12, debit_kg_h=500, surface_m2=18,
            nb_operateurs=2, taux_rendement=94, description="Formage et scellage barquettes",
            secteurs='["Conserverie","Fromagerie"]'),
        MachineVirtuelle(nom="Palettiseur robotisé", categorie="conditionnement", icon="🤖",
            prix_dzd=4_800_000, puissance_kw=6, debit_kg_h=5000, surface_m2=20,
            nb_operateurs=1, taux_rendement=98, description="Palettisation automatique 400 palettes/h",
            secteurs='["Laiterie","Boulangerie","Conserverie","Fromagerie"]'),

        # ── Stockage & Utilités ──
        MachineVirtuelle(nom="Chambre froide 100m²", categorie="stockage", icon="❄️",
            prix_dzd=1_500_000, puissance_kw=22, debit_kg_h=0, surface_m2=120,
            nb_operateurs=0, taux_rendement=99, description="Stockage réfrigéré 0-4°C",
            secteurs='["Laiterie","Fromagerie"]'),
        MachineVirtuelle(nom="Silo de stockage 50T", categorie="stockage", icon="🏛️",
            prix_dzd=750_000, puissance_kw=1.5, debit_kg_h=0, surface_m2=8,
            nb_operateurs=0, taux_rendement=99, description="Stockage matières sèches en vrac",
            secteurs='["Boulangerie","Conserverie"]'),
        MachineVirtuelle(nom="Compresseur d'air 15 kW", categorie="utilites", icon="💨",
            prix_dzd=420_000, puissance_kw=15, debit_kg_h=0, surface_m2=4,
            nb_operateurs=0, taux_rendement=99, description="Production air comprimé process",
            secteurs='["Laiterie","Boulangerie","Conserverie","Fromagerie"]'),
        MachineVirtuelle(nom="Chaudière vapeur 500kg/h", categorie="utilites", icon="♨️",
            prix_dzd=1_100_000, puissance_kw=350, debit_kg_h=0, surface_m2=12,
            nb_operateurs=1, taux_rendement=88, description="Production vapeur process et CIP",
            secteurs='["Laiterie","Fromagerie","Conserverie"]'),
        MachineVirtuelle(nom="Station CIP automatique", categorie="utilites", icon="🚿",
            prix_dzd=900_000, puissance_kw=8, debit_kg_h=0, surface_m2=8,
            nb_operateurs=0, taux_rendement=99, description="Nettoyage en place automatisé",
            secteurs='["Laiterie","Fromagerie"]'),
    ]
    db.add_all(machines)
    db.commit()