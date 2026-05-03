from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from greenfield_models import MachineVirtuelle, ProjetGreenfield, SimulationGreenfield
from pydantic import BaseModel
from typing import List, Optional
import json, math

router_greenfield = APIRouter(prefix="/greenfield", tags=["greenfield"])

# ── Schemas ────────────────────────────────────────────────────────────────────
class ProjetCreate(BaseModel):
    utilisateur_id: int = 1
    nom_projet: str
    secteur: str
    localisation: str = "Alger"
    prix_vente_kg: float
    cout_mp_kg: float
    cout_mdo_mois: float
    cout_energie_kwh: float = 7.5
    loyer_mois: float = 0
    autres_charges: float = 0
    production_cible_kg_j: float
    jours_travail_mois: int = 22
    investissement_total: float
    apport_propre_pct: float = 30
    taux_interet: float = 6.0
    duree_credit_ans: int = 5
    ligne_configuration: List[int] = []  # IDs machines

class ProjetUpdate(BaseModel):
    nom_projet: Optional[str] = None
    prix_vente_kg: Optional[float] = None
    cout_mp_kg: Optional[float] = None
    cout_mdo_mois: Optional[float] = None
    loyer_mois: Optional[float] = None
    autres_charges: Optional[float] = None
    production_cible_kg_j: Optional[float] = None
    investissement_total: Optional[float] = None
    ligne_configuration: Optional[List[int]] = None


# ── Catalogue machines ─────────────────────────────────────────────────────────
@router_greenfield.get("/machines")
def get_machines(secteur: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(MachineVirtuelle)
    machines = q.all()
    result = []
    for m in machines:
        try:
            secteurs = json.loads(m.secteurs) if m.secteurs else []
        except:
            secteurs = []
        if secteur and secteur not in secteurs:
            continue
        result.append({
            "id": m.id, "nom": m.nom, "categorie": m.categorie, "icon": m.icon,
            "prix_dzd": m.prix_dzd, "puissance_kw": m.puissance_kw,
            "debit_kg_h": m.debit_kg_h, "surface_m2": m.surface_m2,
            "nb_operateurs": m.nb_operateurs, "taux_rendement": m.taux_rendement,
            "description": m.description, "secteurs": secteurs
        })
    return result


# ── Projets ────────────────────────────────────────────────────────────────────
@router_greenfield.get("/projets/{utilisateur_id}")
def get_projets(utilisateur_id: int, db: Session = Depends(get_db)):
    projets = db.query(ProjetGreenfield).filter_by(utilisateur_id=utilisateur_id).all()
    return [{"id": p.id, "nom_projet": p.nom_projet, "secteur": p.secteur,
             "date_creation": str(p.date_creation)} for p in projets]


@router_greenfield.post("/projets")
def creer_projet(data: ProjetCreate, db: Session = Depends(get_db)):
    projet = ProjetGreenfield(**data.dict())
    db.add(projet)
    db.commit()
    db.refresh(projet)
    return {"message": "Projet créé", "projet_id": projet.id}


@router_greenfield.put("/projets/{projet_id}")
def maj_projet(projet_id: int, data: ProjetUpdate, db: Session = Depends(get_db)):
    p = db.query(ProjetGreenfield).get(projet_id)
    if not p:
        raise HTTPException(404, "Projet non trouvé")
    for k, v in data.dict(exclude_none=True).items():
        setattr(p, k, v)
    db.commit()
    return {"message": "Projet mis à jour"}


# ── Simulation ─────────────────────────────────────────────────────────────────
@router_greenfield.post("/simuler/{projet_id}")
def simuler(projet_id: int, db: Session = Depends(get_db)):
    p = db.query(ProjetGreenfield).get(projet_id)
    if not p:
        raise HTTPException(404, "Projet non trouvé")

    machines_ids = p.ligne_configuration or []
    machines = []
    for mid in machines_ids:
        m = db.query(MachineVirtuelle).get(mid)
        if m:
            machines.append(m)

    # ── 1. Investissement ──────────────────────────────────────────────────
    invest_machines = sum(m.prix_dzd for m in machines)
    invest_total = p.investissement_total if p.investissement_total > 0 else invest_machines * 1.4  # +40% génie civil
    credit = invest_total * (1 - p.apport_propre_pct / 100)
    r = p.taux_interet / 100 / 12
    n = p.duree_credit_ans * 12
    mensualite = credit * r / (1 - (1 + r) ** -n) if r > 0 and n > 0 else credit / n

    # ── 2. Revenus mensuels ────────────────────────────────────────────────
    prod_mois_kg = p.production_cible_kg_j * p.jours_travail_mois
    ca_mensuel = prod_mois_kg * p.prix_vente_kg

    # ── 3. Coûts mensuels ─────────────────────────────────────────────────
    puissance_totale = sum(m.puissance_kw for m in machines)
    heures_mois = p.jours_travail_mois * 8
    cout_energie = puissance_totale * heures_mois * p.cout_energie_kwh
    cout_mp = prod_mois_kg * p.cout_mp_kg
    cout_total = cout_mp + p.cout_mdo_mois + cout_energie + p.loyer_mois + p.autres_charges + mensualite

    marge_brute = ca_mensuel - cout_mp
    ebitda = ca_mensuel - (cout_mp + p.cout_mdo_mois + cout_energie + p.loyer_mois + p.autres_charges)
    benefice_net = ebitda - mensualite

    # ── 4. Point Mort ──────────────────────────────────────────────────────
    couts_fixes = p.cout_mdo_mois + cout_energie + p.loyer_mois + p.autres_charges + mensualite
    marge_unit = p.prix_vente_kg - p.cout_mp_kg
    point_mort_kg = couts_fixes / marge_unit if marge_unit > 0 else 0
    point_mort_mois = math.ceil(invest_total / max(benefice_net, 1)) if benefice_net > 0 else 999

    # ── 5. ROI & VAN ───────────────────────────────────────────────────────
    roi_pct = (benefice_net * 12 / invest_total * 100) if invest_total > 0 else 0
    taux_act = 0.12 / 12  # taux actualisation 12%/an
    van_5ans = sum(benefice_net / (1 + taux_act) ** i for i in range(1, 61)) - invest_total
    tri_pct = roi_pct * 0.85  # approx

    # ── 6. Dimensionnement (Loi de Little) ────────────────────────────────
    surface_machines = sum(m.surface_m2 for m in machines)
    surface_circulation = surface_machines * 0.5
    surface_stockage = (prod_mois_kg / 30) * 0.002  # m² par kg stocké
    surface_totale = surface_machines + surface_circulation + surface_stockage + 50  # +50m² vestiaires/bureaux

    nb_operateurs = sum(m.nb_operateurs for m in machines)
    stock_encours = 0
    if machines:
        debit_min = min(m.debit_kg_h for m in machines if m.debit_kg_h > 0) if any(m.debit_kg_h > 0 for m in machines) else 1
        temps_traversee = p.production_cible_kg_j / max(debit_min, 1)
        stock_encours = debit_min * temps_traversee  # Loi de Little: L = λ × W

    # ── 7. Plan 3 ans (mois par mois) ──────────────────────────────────────
    plan_36 = []
    ca_cumul = 0
    invest_restant = invest_total
    for mois in range(1, 37):
        montee_charge = min(1.0, 0.3 + mois * 0.07)  # montée en charge progressive
        ca_m = ca_mensuel * montee_charge
        cout_m = cout_mp * montee_charge + p.cout_mdo_mois + cout_energie * montee_charge + p.loyer_mois + p.autres_charges + mensualite
        benef_m = ca_m - cout_m
        ca_cumul += benef_m
        plan_36.append({
            "mois": mois,
            "ca": round(ca_m),
            "couts": round(cout_m),
            "benefice": round(benef_m),
            "cumul": round(ca_cumul),
            "rentable": ca_cumul >= 0
        })

    # ── Sauvegarde ────────────────────────────────────────────────────────
    sim = SimulationGreenfield(
        projet_id=projet_id,
        ca_mensuel=round(ca_mensuel),
        cout_production=round(cout_total),
        marge_brute=round(marge_brute),
        ebitda=round(ebitda),
        point_mort_unites=round(point_mort_kg),
        point_mort_mois=int(min(point_mort_mois, 999)),
        roi_pct=round(roi_pct, 1),
        van_5ans=round(van_5ans),
        tri_pct=round(tri_pct, 1),
        payback_mois=int(min(point_mort_mois, 999)),
        surface_totale_m2=round(surface_totale),
        nb_operateurs_total=nb_operateurs,
        puissance_totale_kw=round(puissance_totale, 1),
        stock_encours_kg=round(stock_encours, 1),
    )
    db.add(sim)
    db.commit()

    return {
        "projet": {"nom": p.nom_projet, "secteur": p.secteur},
        "machines": [{"nom": m.nom, "icon": m.icon, "categorie": m.categorie,
                      "prix": m.prix_dzd, "puissance": m.puissance_kw} for m in machines],
        "financier": {
            "invest_total": round(invest_total),
            "invest_machines": round(invest_machines),
            "mensualite_credit": round(mensualite),
            "ca_mensuel": round(ca_mensuel),
            "cout_total": round(cout_total),
            "marge_brute": round(marge_brute),
            "ebitda": round(ebitda),
            "benefice_net": round(benefice_net),
            "point_mort_kg_mois": round(point_mort_kg),
            "payback_mois": int(min(point_mort_mois, 999)),
            "roi_pct": round(roi_pct, 1),
            "van_5ans": round(van_5ans),
            "tri_pct": round(tri_pct, 1),
        },
        "dimensionnement": {
            "surface_totale_m2": round(surface_totale),
            "surface_machines_m2": round(surface_machines),
            "nb_operateurs": nb_operateurs,
            "puissance_totale_kw": round(puissance_totale, 1),
            "stock_encours_kg": round(stock_encours, 1),
        },
        "plan_3ans": plan_36,
        "couts_detail": {
            "matieres_premieres": round(cout_mp),
            "main_oeuvre": round(p.cout_mdo_mois),
            "energie": round(cout_energie),
            "loyer": round(p.loyer_mois),
            "autres": round(p.autres_charges),
            "credit": round(mensualite),
        }
    }


# ── Export Business Plan (résumé texte) ───────────────────────────────────────
@router_greenfield.get("/business-plan/{projet_id}")
def get_business_plan(projet_id: int, db: Session = Depends(get_db)):
    p = db.query(ProjetGreenfield).get(projet_id)
    if not p:
        raise HTTPException(404)
    sims = db.query(SimulationGreenfield).filter_by(projet_id=projet_id).order_by(SimulationGreenfield.date_sim.desc()).all()
    if not sims:
        raise HTTPException(400, "Lancez d'abord une simulation")
    s = sims[0]
    return {
        "projet": p.nom_projet, "secteur": p.secteur,
        "roi": s.roi_pct, "van_5ans": s.van_5ans, "payback": s.payback_mois,
        "ca": s.ca_mensuel, "ebitda": s.ebitda, "surface": s.surface_totale_m2,
        "operateurs": s.nb_operateurs_total
    }