from sqlalchemy import create_engine, Column, Integer, String, Float, Boolean, DateTime, JSON, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship, sessionmaker
from datetime import datetime, date

# Crée le fichier de base de données SQLitepython main.py
DATABASE_URL = "sqlite:///./twinova.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


# ── TABLE : produits ──────────────────────────────────
class Produit(Base):
    __tablename__ = "produits"

    id                 = Column(Integer, primary_key=True, index=True)
    nom                = Column(String, nullable=False)
    secteur            = Column(String, default="Agroalimentaire")
    temps_cycle        = Column(Float, default=30.0)      # secondes/pièce
    temps_planifie     = Column(Float, default=480.0)     # minutes/jour
    marge_unitaire     = Column(Float, default=2.5)       # €/pièce
    capacite_theorique = Column(Float, default=960.0)     # pièces/jour

    # Lien avec les enregistrements
    enregistrements = relationship("Enregistrement", back_populates="produit", cascade="all, delete")


# ── TABLE : enregistrements ───────────────────────────
class Enregistrement(Base):
    __tablename__ = "enregistrements"

    id                  = Column(Integer, primary_key=True, index=True)
    produit_id          = Column(Integer, ForeignKey("produits.id"))
    date = Column(DateTime, default=datetime.now)

    # Données saisies par l'utilisateur
    temps_panne         = Column(Float, default=0.0)
    temps_micro_arret   = Column(Float, default=0.0)
    temps_setup         = Column(Float, default=0.0)
    production_totale   = Column(Integer, default=0)
    production_conforme = Column(Integer, default=0)

    # KPIs calculés et sauvegardés
    trs                 = Column(Float, default=0.0)
    disponibilite       = Column(Float, default=0.0)
    performance         = Column(Float, default=0.0)
    qualite             = Column(Float, default=0.0)
    gain_potentiel_mois = Column(Float, default=0.0)

    produit = relationship("Produit", back_populates="enregistrements")


# ── Fonction pour obtenir une session DB ──────────────
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ── Créer toutes les tables ───────────────────────────
# ══════════════════════════════════════════════════════
# MODULE 2 — INTELLIGENCE PROCESS & RECETTES
# ══════════════════════════════════════════════════════

class TemplateRecette(Base):
    """Bibliothèque de templates prédéfinis par secteur"""
    __tablename__ = 'templates_recettes'
    
    id                  = Column(Integer, primary_key=True)
    secteur             = Column(String, nullable=False)  # 'laiterie', 'boulangerie', etc.
    nom_template        = Column(String, nullable=False)  # 'Pasteurisation Lait'
    description         = Column(String)
    
    # Paramètres process par défaut
    temperature_cible   = Column(Float)   # °C
    temperature_tolerance = Column(Float, default=2.0)  # ±°C
    temps_cycle_theorique = Column(Float)  # secondes/unité
    rendement_theorique   = Column(Float, default=98.0)  # %
    ph_cible              = Column(Float)  # Pour produits acides
    ph_tolerance          = Column(Float, default=0.2)
    dlc_theorique_jours = Column(Integer, nullable=True)
    
    # Métadonnées
    est_actif           = Column(Boolean, default=True)
    date_creation       = Column(DateTime, default=datetime.now)
    
    recettes = relationship("Recette", back_populates="template")


class Recette(Base):
    """Recette personnalisée d'une entreprise basée sur un template"""
    __tablename__ = 'recettes'
    
    id                  = Column(Integer, primary_key=True)
    produit_id          = Column(Integer, ForeignKey('produits.id'))
    template_id         = Column(Integer, ForeignKey('templates_recettes.id'), nullable=True)
    utilisateur_id      = Column(Integer, ForeignKey('utilisateurs.id'))
    
    nom                 = Column(String, nullable=False)
    description         = Column(String)
    version             = Column(String, default='1.0')
    
    # Paramètres process personnalisés
    temperature_cible      = Column(Float)
    temperature_tolerance  = Column(Float, default=2.0)
    temps_cycle_theorique  = Column(Float)
    rendement_theorique    = Column(Float, default=98.0)
    ph_cible               = Column(Float, nullable=True)
    ph_tolerance           = Column(Float, default=0.2)
    temps_melange_min      = Column(Float, nullable=True)
    pression_bar           = Column(Float, nullable=True)
    humidite_pct           = Column(Float, nullable=True)
    
    # DLC théorique (jours) à température normale
    dlc_theorique_jours    = Column(Integer, nullable=True)
    temperature_stockage   = Column(Float, nullable=True)  # °C
    
    # Métadonnées
    est_active          = Column(Boolean, default=True)
    date_creation       = Column(DateTime, default=datetime.now)
    date_modification   = Column(DateTime, default=datetime.now)
    
    template    = relationship("TemplateRecette", back_populates="recettes")
    ingredients = relationship("Ingredient", back_populates="recette", cascade="all, delete")
    lots        = relationship("LotProduction", back_populates="recette")


class Ingredient(Base):
    """Matières premières d'une recette"""
    __tablename__ = 'ingredients'
    
    id              = Column(Integer, primary_key=True)
    recette_id      = Column(Integer, ForeignKey('recettes.id'))
    
    nom             = Column(String, nullable=False)
    quantite_theorique = Column(Float, nullable=False)  # kg ou L
    unite           = Column(String, default='kg')       # 'kg', 'L', 'g', 'mL'
    est_allergene   = Column(Boolean, default=False)
    fournisseur     = Column(String, nullable=True)
    
    recette = relationship("Recette", back_populates="ingredients")


class LotProduction(Base):
    """Suivi en temps réel des lots de production"""
    __tablename__ = 'lots_production'
    
    id              = Column(Integer, primary_key=True)
    numero_lot      = Column(String, nullable=False, unique=True)  # 'LOT-2026-001'
    recette_id      = Column(Integer, ForeignKey('recettes.id'))
    produit_id      = Column(Integer, ForeignKey('produits.id'))
    utilisateur_id  = Column(Integer, ForeignKey('utilisateurs.id'))
    
    # Multi-machines : plusieurs lignes en parallèle
    machines_utilisees = Column(JSON)  # [{"produit_id": 1, "nom": "Ligne A"}, ...]
    
    # Données réelles saisies
    masse_entree_kg    = Column(Float)   # Matière première engagée
    masse_sortie_kg    = Column(Float)   # Produit fini conforme
    temperature_reelle = Column(Float)   # Température moyenne saisie
    ph_reel            = Column(Float, nullable=True)
    humidite_reelle    = Column(Float, nullable=True)
    
    # Planning
    date_debut      = Column(DateTime)
    date_fin        = Column(DateTime, nullable=True)
    statut          = Column(String, default='en_cours')  # 'en_cours', 'termine', 'bloque'
    
    # Résultats calculés (mis à jour automatiquement)
    rendement_reel     = Column(Float, nullable=True)   # %
    perte_kg           = Column(Float, nullable=True)   # kg perdus
    ecart_rendement    = Column(Float, nullable=True)   # % d'écart vs théorique
    est_conforme_temp  = Column(Boolean, nullable=True)
    est_conforme_ph    = Column(Boolean, nullable=True)
    dlc_calculee       = Column(DateTime, nullable=True)  # DLC réelle calculée
    
    # Alertes
    niveau_alerte   = Column(String, default='aucune')  # 'aucune', 'mineure', 'critique'
    alertes_actives = Column(JSON, nullable=True)  # Liste des alertes
    
    # Traçabilité
    numero_lot_mp   = Column(String, nullable=True)  # N° lot matière première
    operateur       = Column(String, nullable=True)
    notes           = Column(String, nullable=True)
    
    recette = relationship("Recette", back_populates="lots")
    alertes = relationship("AlerteLot", back_populates="lot", cascade="all, delete")


class AlerteLot(Base):
    """Historique des alertes générées par lot"""
    __tablename__ = 'alertes_lots'
    
    id          = Column(Integer, primary_key=True)
    lot_id      = Column(Integer, ForeignKey('lots_production.id'))
    
    type_alerte = Column(String)    # 'temperature', 'rendement', 'ph', 'dlc'
    gravite     = Column(String)    # 'mineure', 'critique'
    message     = Column(String)
    valeur_mesuree  = Column(Float, nullable=True)
    valeur_cible    = Column(Float, nullable=True)
    ecart           = Column(Float, nullable=True)
    
    email_envoye    = Column(Boolean, default=False)
    date_alerte     = Column(DateTime, default=datetime.now)
    acquittee       = Column(Boolean, default=False)
    lot = relationship("LotProduction", back_populates="alertes")

def init_db():
    Base.metadata.create_all(bind=engine)
    _creer_templates_par_defaut()

def _creer_templates_par_defaut():
    """Crée les 13 templates de recettes couvrant 95% des PME agroalimentaires"""
    db = SessionLocal()
    try:
        if db.query(TemplateRecette).count() > 0:
            return

        templates = [

            # ══════════════════════════════════════════
            # MODÈLE 1 — THERMIQUE CHAUD
            # Point critique : Température de pasteurisation/stérilisation
            # ══════════════════════════════════════════

            TemplateRecette(
                secteur="Laiterie",
                nom_template="Pasteurisation Lait (HTST)",
                description="Process HTST : 72°C pendant 15 secondes. Détruit 99.9% des pathogènes. Norme EN ISO 22000.",
                temperature_cible=72.0,
                temperature_tolerance=1.5,
                temps_cycle_theorique=30.0,
                rendement_theorique=98.5,
                ph_cible=6.7,
                ph_tolerance=0.3,
                dlc_theorique_jours=7
            ),

            TemplateRecette(
                secteur="Conserverie",
                nom_template="Stérilisation Conserves (Appertisation)",
                description="Traitement thermique à 121°C (F0 ≥ 3 min). Détruit les spores de Clostridium botulinum. Norme HACCP critique.",
                temperature_cible=121.0,
                temperature_tolerance=1.0,
                temps_cycle_theorique=20.0,
                rendement_theorique=99.0,
                ph_cible=None,
                ph_tolerance=None,
                dlc_theorique_jours=730
            ),

            TemplateRecette(
                secteur="Boissons",
                nom_template="Pasteurisation Jus de Fruits",
                description="Pasteurisation haute température pour jus : 85-95°C. Préserve vitamines et arômes. Contrôle Brix et pH obligatoire.",
                temperature_cible=88.0,
                temperature_tolerance=3.0,
                temps_cycle_theorique=15.0,
                rendement_theorique=75.0,
                ph_cible=3.8,
                ph_tolerance=0.3,
                dlc_theorique_jours=365
            ),

            TemplateRecette(
                secteur="Viande",
                nom_template="Charcuterie Cuite (Mortadelle / Saucisse)",
                description="Cuisson à cœur obligatoire à 70°C minimum. Contrôle T° à cœur par sonde. Risque Listeria critique en post-cuisson.",
                temperature_cible=72.0,
                temperature_tolerance=2.0,
                temps_cycle_theorique=60.0,
                rendement_theorique=85.0,
                ph_cible=6.2,
                ph_tolerance=0.4,
                dlc_theorique_jours=21
            ),

            # ══════════════════════════════════════════
            # MODÈLE 2 — THERMIQUE FROID
            # Point critique : Maintien de la chaîne du froid
            # ══════════════════════════════════════════

            TemplateRecette(
                secteur="Viande",
                nom_template="Découpe et Conditionnement Viande Fraîche",
                description="Chaîne du froid stricte : T° atelier < 10°C, T° produit < 4°C. Rupture de chaîne = alerte critique immédiate. DLC réduite proportionnellement.",
                temperature_cible=4.0,
                temperature_tolerance=2.0,
                temps_cycle_theorique=45.0,
                rendement_theorique=88.0,
                ph_cible=5.8,
                ph_tolerance=0.3,
                dlc_theorique_jours=5
            ),

            TemplateRecette(
                secteur="Laiterie",
                nom_template="Stockage et Distribution Produits Frais",
                description="Maintien T° entre 0°C et 4°C. Toute rupture > 1h au-delà de 6°C génère une alerte critique et réduit automatiquement la DLC calculée.",
                temperature_cible=2.0,
                temperature_tolerance=2.0,
                temps_cycle_theorique=10.0,
                rendement_theorique=99.5,
                ph_cible=None,
                ph_tolerance=None,
                dlc_theorique_jours=21
            ),

            TemplateRecette(
                secteur="Surgélation",
                nom_template="Surgélation Rapide (IQF)",
                description="Surgélation à -18°C en moins de 4h (norme IQF). Cristaux de glace fins = qualité préservée. T° de stockage : -18°C constant.",
                temperature_cible=-18.0,
                temperature_tolerance=2.0,
                temps_cycle_theorique=30.0,
                rendement_theorique=97.0,
                ph_cible=None,
                ph_tolerance=None,
                dlc_theorique_jours=365
            ),

            # ══════════════════════════════════════════
            # MODÈLE 3 — FERMENTATION & pH
            # Point critique : pH et temps de fermentation
            # ══════════════════════════════════════════

            TemplateRecette(
                secteur="Laiterie",
                nom_template="Fabrication Yaourt (Fermentation)",
                description="Fermentation à 43°C avec Lactobacillus bulgaricus et Streptococcus thermophilus. pH cible 4.5. Contrôle pH toutes les 30 min obligatoire.",
                temperature_cible=43.0,
                temperature_tolerance=1.0,
                temps_cycle_theorique=25.0,
                rendement_theorique=96.0,
                ph_cible=4.5,
                ph_tolerance=0.2,
                dlc_theorique_jours=21
            ),

            TemplateRecette(
                secteur="Fromagerie",
                nom_template="Fromage Frais (Coagulation + Égouttage)",
                description="Coagulation enzymatique à 35°C. Rendement fromager moyen : 10-22% selon type. Formule : 10L lait → 1kg fromage frais. pH d'égouttage : 4.6.",
                temperature_cible=35.0,
                temperature_tolerance=2.0,
                temps_cycle_theorique=35.0,
                rendement_theorique=22.0,
                ph_cible=4.6,
                ph_tolerance=0.3,
                dlc_theorique_jours=14
            ),

            TemplateRecette(
                secteur="Boulangerie",
                nom_template="Pain Industriel (Pétrissage + Cuisson)",
                description="Fermentation à 27°C pendant 90 min, cuisson à 220°C. Contrôle humidité farine (max 14.5%). Perte à la cuisson (ressuage) : 10-12% du poids.",
                temperature_cible=220.0,
                temperature_tolerance=5.0,
                temps_cycle_theorique=45.0,
                rendement_theorique=88.0,
                ph_cible=5.5,
                ph_tolerance=0.5,
                dlc_theorique_jours=5
            ),

            # ══════════════════════════════════════════
            # MODÈLE 4 — PESAGE & RENDEMENT
            # Point critique : Précision du poids et perte matière
            # ══════════════════════════════════════════

            TemplateRecette(
                secteur="Céréales",
                nom_template="Conditionnement Pâtes / Semoule / Farine",
                description="Contrôle poids net obligatoire (Directive Métrologique). Tolérance légale : ±1.5% sur poids déclaré. Sur-dosage moyen de 1% = perte de 3.6 tonnes/an pour 1000 kg/jour.",
                temperature_cible=None,
                temperature_tolerance=None,
                temps_cycle_theorique=8.0,
                rendement_theorique=99.2,
                ph_cible=None,
                ph_tolerance=None,
                dlc_theorique_jours=365
            ),

            TemplateRecette(
                secteur="Café / Épices",
                nom_template="Conditionnement Café / Épices / Produits Secs",
                description="Process sec : broyage + dosage + emballage sous atmosphère modifiée (N2). Contrôle poids en continu. Humidité produit < 12% obligatoire pour conservation.",
                temperature_cible=None,
                temperature_tolerance=None,
                temps_cycle_theorique=5.0,
                rendement_theorique=99.5,
                ph_cible=None,
                ph_tolerance=None,
                dlc_theorique_jours=730
            ),

            # ══════════════════════════════════════════
            # MODÈLE 5 — PARAGE & EAU
            # Point critique : Taux de déchets et consommation eau
            # ══════════════════════════════════════════

            TemplateRecette(
                secteur="Fruits et Légumes",
                nom_template="Lavage, Parage et Conditionnement Légumes Frais",
                description="Tri + lavage + parage + conditionnement sous atmosphère modifiée. Taux de déchets végétaux : 15-30% selon produit. Eau de lavage : 5-10L/kg. Chloration eau : 50-200 ppm.",
                temperature_cible=4.0,
                temperature_tolerance=2.0,
                temps_cycle_theorique=20.0,
                rendement_theorique=75.0,
                ph_cible=None,
                ph_tolerance=None,
                dlc_theorique_jours=7
            ),
        ]

        for t in templates:
            db.add(t)
        db.commit()
        print(f"✅ {len(templates)} templates de recettes créés avec succès !")
        print("   Modèle 1 — Thermique Chaud    : 4 templates")
        print("   Modèle 2 — Thermique Froid    : 3 templates")
        print("   Modèle 3 — Fermentation & pH  : 3 templates")
        print("   Modèle 4 — Pesage & Rendement : 2 templates")
        print("   Modèle 5 — Parage & Eau       : 1 template")

    except Exception as e:
        print(f"❌ Erreur création templates: {e}")
        db.rollback()
    finally:
        db.close()
    
