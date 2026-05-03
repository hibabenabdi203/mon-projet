"""
TWINOVA — MODULE 6 : BENCHMARKING SECTORIEL — Models
"""
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Text, ForeignKey
from database import Base
from datetime import datetime


class DonneeBenchmark(Base):
    __tablename__ = "donnee_benchmark"
    id                   = Column(Integer, primary_key=True, index=True)
    secteur              = Column(String(100), nullable=False)
    sous_secteur         = Column(String(100))
    mois                 = Column(Integer, nullable=False)
    annee                = Column(Integer, nullable=False)
    entreprise_code      = Column(String(50))
    trs                  = Column(Float)
    qualite              = Column(Float)
    rendement_matiere    = Column(Float)
    epi_electricite      = Column(Float)
    epi_eau              = Column(Float)
    conformite_haccp     = Column(Float)
    taux_perte           = Column(Float)
    disponibilite        = Column(Float)
    spi                  = Column(Float)
    capacite_tonne_jour  = Column(Float)
    nb_employes          = Column(Integer)
    date_soumission      = Column(DateTime, default=datetime.utcnow)
    valide               = Column(Boolean, default=True)


class StatsBenchmark(Base):
    __tablename__ = "stats_benchmark"
    id              = Column(Integer, primary_key=True, index=True)
    secteur         = Column(String(100), nullable=False)
    sous_secteur    = Column(String(100))
    mois            = Column(Integer, nullable=False)
    annee           = Column(Integer, nullable=False)
    nb_entreprises  = Column(Integer, default=0)
    date_calcul     = Column(DateTime, default=datetime.utcnow)
    trs_moyenne     = Column(Float)
    trs_mediane     = Column(Float)
    trs_q1          = Column(Float)
    trs_q3          = Column(Float)
    trs_top10       = Column(Float)
    qualite_moyenne = Column(Float)
    qualite_mediane = Column(Float)
    qualite_q1      = Column(Float)
    qualite_q3      = Column(Float)
    qualite_top10   = Column(Float)
    rendement_moyenne   = Column(Float)
    rendement_mediane   = Column(Float)
    rendement_q1        = Column(Float)
    rendement_q3        = Column(Float)
    rendement_top10     = Column(Float)
    epi_moyenne     = Column(Float)
    epi_mediane     = Column(Float)
    epi_q1          = Column(Float)
    epi_q3          = Column(Float)
    epi_top10       = Column(Float)
    haccp_moyenne   = Column(Float)
    haccp_mediane   = Column(Float)
    haccp_top10     = Column(Float)
    spi_moyen       = Column(Float)


class AlerteBenchmark(Base):
    __tablename__ = "alerte_benchmark"
    id               = Column(Integer, primary_key=True, index=True)
    produit_id       = Column(Integer, ForeignKey("produits.id"), nullable=False)
    secteur          = Column(String(100))
    type_alerte      = Column(String(50))
    kpi_concerne     = Column(String(50))
    message          = Column(Text)
    ancienne_position= Column(Integer)
    nouvelle_position= Column(Integer)
    nb_entreprises   = Column(Integer)
    lu               = Column(Boolean, default=False)
    date_alerte      = Column(DateTime, default=datetime.utcnow)


class CertificatPerformance(Base):
    __tablename__ = "certificat_performance"
    id             = Column(Integer, primary_key=True, index=True)
    produit_id     = Column(Integer, ForeignKey("produits.id"), nullable=False)
    secteur        = Column(String(100))
    type_certificat= Column(String(100))
    niveau         = Column(String(20))
    spi_obtenu     = Column(Float)
    percentile     = Column(Float)
    mois           = Column(Integer)
    annee          = Column(Integer)
    date_emission  = Column(DateTime, default=datetime.utcnow)
    valide         = Column(Boolean, default=True)


def seed_benchmark_demo(db):
    if db.query(DonneeBenchmark).count() > 0:
        return
    import random
    random.seed(42)
    configs = [
        ("Laiterie","Yaourt",72,88,93,0.18,3.2,91),
        ("Laiterie","Lait pasteurisé",75,90,95,0.15,2.8,93),
        ("Boulangerie","Pain industriel",68,85,91,0.22,4.1,88),
        ("Conserverie","Tomate",70,87,92,0.20,5.5,89),
        ("Fromagerie","Fromage frais",65,86,90,0.25,3.8,87),
    ]
    for secteur,sous_secteur,trs_m,qual_m,rend_m,epi_m,eau_m,haccp_m in configs:
        for i in range(18):
            trs = round(max(45,min(98,random.gauss(trs_m,8))),1)
            db.add(DonneeBenchmark(
                secteur=secteur,sous_secteur=sous_secteur,mois=4,annee=2026,
                entreprise_code=f"ENT-{secteur[:3].upper()}-{i+1:03d}",
                trs=trs,
                qualite=round(max(75,min(99,random.gauss(qual_m,5))),1),
                rendement_matiere=round(max(80,min(99,random.gauss(rend_m,4))),1),
                epi_electricite=round(max(0.08,min(0.40,random.gauss(epi_m,0.05))),3),
                epi_eau=round(max(1.5,min(8.0,random.gauss(eau_m,1.0))),2),
                conformite_haccp=round(max(70,min(100,random.gauss(haccp_m,6))),1),
                taux_perte=round(max(1,min(15,random.gauss(5,2))),1),
                disponibilite=round(max(60,min(98,random.gauss(trs_m+8,6))),1),
                capacite_tonne_jour=round(random.uniform(5,50),1),
                nb_employes=random.randint(20,200),
                spi=round(random.gauss(100,15),1),
            ))
    db.commit()
    print("✅ Données Benchmarking insérées.")