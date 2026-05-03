from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
import math
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from database import get_db, SessionLocal
from auth import verifier_token
from haccp_models import (
    PlanHACCP, SeuilCritique, ControleHACCP,
    AlerteHACCP, StatutSanitaireLot,
    NiveauGravite, StatutLotHACCP, TypeParametreHACCP
)

def get_current_user():
    return True

router_haccp = APIRouter(prefix="/haccp", tags=["HACCP"])




# ──────────────────────────────────────────────────────────────
# SCHÉMAS PYDANTIC
# ──────────────────────────────────────────────────────────────

class SeuilCritiqueCreate(BaseModel):
    etape_process: str
    type_parametre: str
    libelle: str
    unite: str
    valeur_min: Optional[float] = None
    valeur_max: Optional[float] = None
    valeur_cible: Optional[float] = None
    action_mineure: str
    action_critique: str
    niveau_gravite: str = "critique"
    email_alerte: Optional[str] = None

class PlanHACCPCreate(BaseModel):
    recette_id: int
    nom_plan: str
    version: str = "1.0"
    responsable: Optional[str] = None
    seuils: List[SeuilCritiqueCreate] = []

class ControleHACCPCreate(BaseModel):
    lot_id: int
    seuil_id: int
    valeur_mesuree: float
    operateur: Optional[str] = None
    commentaire: Optional[str] = None

class LiberationLotRequest(BaseModel):
    lot_id: int
    libere_par: str

class ParametresVP(BaseModel):
    """Valeur Pasteurisatrice — paramètres d'entrée"""
    temperature_C: float           # Température de traitement
    duree_secondes: float          # Durée effective du traitement
    temperature_ref: float = 72.0  # Référence HTST lait = 72°C
    z_value: float = 8.0           # z-value pathogène cible (Listeria=7.5, Salmonella=8)

class ParametresPH(BaseModel):
    """Cinétique du pH — fermentation lactique"""
    ph_initial: float = 6.5
    ph_cible: float = 4.3
    temperature_C: float = 42.0
    duree_heures: float = 4.0
    type_ferment: str = "yaourt"   # yaourt | fromage | kefir


# ──────────────────────────────────────────────────────────────
# UTILITAIRES
# ──────────────────────────────────────────────────────────────

def calculer_conformite(valeur: float, seuil) -> tuple[bool, float]:
    """Retourne (conforme, écart)."""
    conforme = True
    if seuil.valeur_min is not None and valeur < seuil.valeur_min:
        conforme = False
    if seuil.valeur_max is not None and valeur > seuil.valeur_max:
        conforme = False
    ecart = valeur - (seuil.valeur_cible or 0.0)
    return conforme, round(ecart, 3)


def recalculer_statut_lot(db, lot_id: int):
    """Recalcule l'indice de conformité et le statut global du lot."""
    controles = db.query(ControleHACCP).filter(ControleHACCP.lot_id == lot_id).all()
    if not controles:
        return

    nb_total    = len(controles)
    nb_conformes = sum(1 for c in controles if c.conforme)
    alertes = db.query(AlerteHACCP).filter(AlerteHACCP.lot_id == lot_id).all()
    nb_crit  = sum(1 for a in alertes if a.niveau_gravite == NiveauGravite.CRITIQUE and not a.acquittee)
    nb_min   = sum(1 for a in alertes if a.niveau_gravite == NiveauGravite.MINEURE and not a.acquittee)

    indice = round((nb_conformes / nb_total) * 100, 1) if nb_total else 0.0

    # Calcul temps d'exposition au risque (somme des durées hors zone — estimation)
    temps_risque = 0.0
    hors_zone = [c for c in controles if not c.conforme]
    if hors_zone:
        temps_risque = round(len(hors_zone) * 15, 1)  # ~15 min par mesure non conforme

    # Statut global
    if nb_crit > 0:
        statut = StatutLotHACCP.BLOQUE
        lib_ok = False
    elif nb_total > 0 and nb_conformes == nb_total:
        statut = StatutLotHACCP.CONFORME
        lib_ok = True
    else:
        statut = StatutLotHACCP.EN_ATTENTE
        lib_ok = (nb_crit == 0 and nb_min == 0 and nb_total > 0)

    # Upsert StatutSanitaireLot
    statut_row = db.query(StatutSanitaireLot).filter(
        StatutSanitaireLot.lot_id == lot_id
    ).first()

    if not statut_row:
        statut_row = StatutSanitaireLot(lot_id=lot_id)
        db.add(statut_row)

    statut_row.statut                  = statut
    statut_row.indice_conformite       = indice
    statut_row.temps_exposition_risque = temps_risque
    statut_row.liberation_autorisee    = lib_ok
    statut_row.nb_controles            = nb_total
    statut_row.nb_conformes            = nb_conformes
    statut_row.nb_alertes_mineures     = nb_min
    statut_row.nb_alertes_critiques    = nb_crit
    statut_row.derniere_maj            = datetime.utcnow()
    db.commit()


def envoyer_email_alerte(destinataire: str, lot_id: int, message: str, action: str):
    """
    Envoi email SMTP — configurer les variables d'environnement :
    SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
    En dev, un simple print simule l'envoi.
    """
    import os
    smtp_host = os.getenv("SMTP_HOST", "")
    if not smtp_host:
        print(f"📧 [SIMULATION EMAIL] À: {destinataire}")
        print(f"   Lot #{lot_id} — {message}")
        print(f"   Action requise: {action}")
        return

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"🚨 ALERTE HACCP CRITIQUE — Lot #{lot_id}"
        msg["From"]    = os.getenv("SMTP_FROM", smtp_host)
        msg["To"]      = destinataire

        html = f"""
        <html><body style="font-family:Arial;background:#fff">
        <div style="border-left:6px solid #e53e3e;padding:20px;margin:20px">
        <h2 style="color:#e53e3e">🚨 Alerte HACCP Critique</h2>
        <p><b>Lot de production :</b> #{lot_id}</p>
        <p><b>Déviation détectée :</b> {message}</p>
        <p style="background:#fff5f5;padding:12px;border-radius:6px">
            <b>Action requise immédiatement :</b><br>{action}
        </p>
        <p style="color:#718096;font-size:12px">TWINOVA — Plateforme Digital Model Industriel</p>
        </div></body></html>
        """
        msg.attach(MIMEText(html, "html"))

        with smtplib.SMTP(smtp_host, int(os.getenv("SMTP_PORT", 587))) as server:
            server.starttls()
            server.login(os.getenv("SMTP_USER"), os.getenv("SMTP_PASS"))
            server.sendmail(msg["From"], [destinataire], msg.as_string())
    except Exception as e:
        print(f"⚠️ Erreur envoi email: {e}")


# ──────────────────────────────────────────────────────────────
# ROUTES — PLANS HACCP
# ──────────────────────────────────────────────────────────────

@router_haccp.get("/plans")
def get_plans_haccp(db: Session = Depends(get_db), user=Depends(get_current_user)):
    plans = db.query(PlanHACCP).filter(PlanHACCP.actif == True).all()
    result = []
    for p in plans:
        result.append({
            "id": p.id,
            "recette_id": p.recette_id,
            "nom_plan": p.nom_plan,
            "version": p.version,
            "responsable": p.responsable,
            "date_creation": p.date_creation.isoformat() if p.date_creation else None,
            "nb_seuils": len(p.seuils),
            "seuils": [
                {
                    "id": s.id,
                    "etape_process": s.etape_process,
                    "type_parametre": s.type_parametre,
                    "libelle": s.libelle,
                    "unite": s.unite,
                    "valeur_min": s.valeur_min,
                    "valeur_max": s.valeur_max,
                    "valeur_cible": s.valeur_cible,
                    "action_mineure": s.action_mineure,
                    "action_critique": s.action_critique,
                    "niveau_gravite": s.niveau_gravite,
                }
                for s in p.seuils if s.actif
            ],
        })
    return result


@router_haccp.post("/plans")
def creer_plan_haccp(
    plan_data: PlanHACCPCreate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    plan = PlanHACCP(
        recette_id=plan_data.recette_id,
        nom_plan=plan_data.nom_plan,
        version=plan_data.version,
        responsable=plan_data.responsable,
    )
    db.add(plan)
    db.flush()

    for s_data in plan_data.seuils:
        seuil = SeuilCritique(plan_id=plan.id, **s_data.dict())
        db.add(seuil)

    db.commit()
    return {"id": plan.id, "message": "Plan HACCP créé"}


@router_haccp.get("/seuils/{plan_id}")
def get_seuils(plan_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    return db.query(SeuilCritique).filter(
        SeuilCritique.plan_id == plan_id,
        SeuilCritique.actif == True
    ).all()


# ──────────────────────────────────────────────────────────────
# ROUTES — SAISIE CONTRÔLE HACCP (terrain)
# ──────────────────────────────────────────────────────────────

@router_haccp.post("/controle")
def saisir_controle(
    data: ControleHACCPCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    seuil = db.query(SeuilCritique).filter(SeuilCritique.id == data.seuil_id).first()
    if not seuil:
        raise HTTPException(404, "Seuil non trouvé")

    conforme, ecart = calculer_conformite(data.valeur_mesuree, seuil)

    controle = ControleHACCP(
        lot_id          = data.lot_id,
        seuil_id        = data.seuil_id,
        valeur_mesuree  = data.valeur_mesuree,
        operateur       = data.operateur or (user.email if user else "Inconnu"),
        conforme        = conforme,
        ecart           = ecart,
        commentaire     = data.commentaire,
    )
    db.add(controle)
    db.flush()

    # Générer alerte si non conforme
    alerte = None
    if not conforme:
        gravite  = seuil.niveau_gravite
        action   = seuil.action_critique if gravite == NiveauGravite.CRITIQUE else seuil.action_mineure
        message  = (
            f"[{seuil.etape_process}] {seuil.libelle} = {data.valeur_mesuree} {seuil.unite} "
            f"(attendu : {seuil.valeur_min}–{seuil.valeur_max} {seuil.unite})"
        )

        alerte = AlerteHACCP(
            controle_id    = controle.id,
            lot_id         = data.lot_id,
            niveau_gravite = gravite,
            message        = message,
            action_requise = action,
            email_destinat = seuil.email_alerte,
        )
        db.add(alerte)
        db.flush()

        # Email async si critique
        if gravite == NiveauGravite.CRITIQUE and seuil.email_alerte:
            background_tasks.add_task(
                envoyer_email_alerte,
                seuil.email_alerte, data.lot_id, message, action
            )
            alerte.email_envoye = True

    db.commit()
    recalculer_statut_lot(db, data.lot_id)

    return {
        "controle_id"    : controle.id,
        "conforme"       : conforme,
        "ecart"          : ecart,
        "alerte_generee" : alerte is not None,
        "niveau_gravite" : alerte.niveau_gravite if alerte else None,
        "action_requise" : alerte.action_requise if alerte else None,
    }


@router_haccp.get("/controles/{lot_id}")
def get_controles_lot(
    lot_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    controles = db.query(ControleHACCP).filter(ControleHACCP.lot_id == lot_id).all()
    result = []
    for c in controles:
        seuil = db.query(SeuilCritique).filter(SeuilCritique.id == c.seuil_id).first()
        result.append({
            "id"             : c.id,
            "seuil_id"       : c.seuil_id,
            "etape"          : seuil.etape_process if seuil else "—",
            "libelle"        : seuil.libelle if seuil else "—",
            "unite"          : seuil.unite if seuil else "",
            "valeur_mesuree" : c.valeur_mesuree,
            "valeur_min"     : seuil.valeur_min if seuil else None,
            "valeur_max"     : seuil.valeur_max if seuil else None,
            "valeur_cible"   : seuil.valeur_cible if seuil else None,
            "conforme"       : c.conforme,
            "ecart"          : c.ecart,
            "operateur"      : c.operateur,
            "horodatage"     : c.horodatage.isoformat() if c.horodatage else None,
            "commentaire"    : c.commentaire,
        })
    return result


# ──────────────────────────────────────────────────────────────
# ROUTES — STATUT SANITAIRE LOT
# ──────────────────────────────────────────────────────────────

@router_haccp.get("/statut-lot/{lot_id}")
def get_statut_lot(
    lot_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    statut = db.query(StatutSanitaireLot).filter(
        StatutSanitaireLot.lot_id == lot_id
    ).first()

    if not statut:
        return {
            "lot_id"                 : lot_id,
            "statut"                 : "en_attente",
            "indice_conformite"      : 0.0,
            "liberation_autorisee"   : False,
            "nb_controles"           : 0,
            "nb_conformes"           : 0,
            "nb_alertes_critiques"   : 0,
            "nb_alertes_mineures"    : 0,
            "temps_exposition_risque": 0.0,
        }

    alertes = db.query(AlerteHACCP).filter(
        AlerteHACCP.lot_id == lot_id,
        AlerteHACCP.acquittee == False
    ).all()

    return {
        "lot_id"                 : lot_id,
        "statut"                 : statut.statut,
        "indice_conformite"      : statut.indice_conformite,
        "liberation_autorisee"   : statut.liberation_autorisee,
        "libere_par"             : statut.libere_par,
        "libere_le"              : statut.libere_le.isoformat() if statut.libere_le else None,
        "nb_controles"           : statut.nb_controles,
        "nb_conformes"           : statut.nb_conformes,
        "nb_alertes_critiques"   : statut.nb_alertes_critiques,
        "nb_alertes_mineures"    : statut.nb_alertes_mineures,
        "temps_exposition_risque": statut.temps_exposition_risque,
        "valeur_pasteurisatrice" : statut.valeur_pasteurisatrice,
        "alertes_actives"        : [
            {
                "id"            : a.id,
                "niveau_gravite": a.niveau_gravite,
                "message"       : a.message,
                "action_requise": a.action_requise,
                "horodatage"    : a.horodatage.isoformat() if a.horodatage else None,
            }
            for a in alertes
        ],
    }


@router_haccp.post("/liberer-lot")
def liberer_lot(
    data: LiberationLotRequest,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    statut = db.query(StatutSanitaireLot).filter(
        StatutSanitaireLot.lot_id == data.lot_id
    ).first()

    if not statut:
        raise HTTPException(400, "Aucun contrôle HACCP enregistré pour ce lot")
    if not statut.liberation_autorisee:
        raise HTTPException(400, "Libération non autorisée — des alertes critiques sont en attente")

    statut.statut    = StatutLotHACCP.LIBERE
    statut.libere_par = data.libere_par
    statut.libere_le  = datetime.utcnow()
    db.commit()

    return {"message": f"Lot #{data.lot_id} libéré par {data.libere_par}", "statut": "libere"}


@router_haccp.post("/acquitter-alerte/{alerte_id}")
def acquitter_alerte(
    alerte_id: int,
    operateur: str,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    alerte = db.query(AlerteHACCP).filter(AlerteHACCP.id == alerte_id).first()
    if not alerte:
        raise HTTPException(404, "Alerte non trouvée")

    alerte.acquittee    = True
    alerte.acquittee_par = operateur
    alerte.acquittee_le  = datetime.utcnow()
    db.commit()

    # Recalculer statut lot après acquittement
    recalculer_statut_lot(db, alerte.lot_id)

    return {"message": "Alerte acquittée"}


# ──────────────────────────────────────────────────────────────
# ROUTES — ALERTES HACCP
# ──────────────────────────────────────────────────────────────

@router_haccp.get("/alertes")
def get_alertes_haccp(
    non_acquittees: bool = True,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    query = db.query(AlerteHACCP)
    if non_acquittees:
        query = query.filter(AlerteHACCP.acquittee == False)
    alertes = query.order_by(AlerteHACCP.horodatage.desc()).limit(50).all()

    return [
        {
            "id"            : a.id,
            "lot_id"        : a.lot_id,
            "niveau_gravite": a.niveau_gravite,
            "message"       : a.message,
            "action_requise": a.action_requise,
            "email_envoye"  : a.email_envoye,
            "acquittee"     : a.acquittee,
            "acquittee_par" : a.acquittee_par,
            "horodatage"    : a.horodatage.isoformat() if a.horodatage else None,
        }
        for a in alertes
    ]


# ──────────────────────────────────────────────────────────────
# ROUTES — FORMULES SCIENTIFIQUES
# ──────────────────────────────────────────────────────────────

@router_haccp.post("/calcul-vp")
def calculer_valeur_pasteurisatrice(params: ParametresVP):
    """
    Valeur Pasteurisatrice (VP) — Modèle de Bigelow
    VP = ∫ 10^((T - Tref) / z) dt
    En approx discrète sur durée totale (secondes) :
    VP = durée_eff × 10^((T - Tref) / z)
    Interprétation :
      VP ≥ 1 → Traitement équivalent à 15 s à 72°C (HTST lait)
      VP ≥ 15 → Pasteurisation LTLT (63°C / 30 min)
    """
    T    = params.temperature_C
    Tref = params.temperature_ref
    z    = params.z_value
    t    = params.duree_secondes

    # Valeur Pasteurisatrice en secondes
    vp_secondes = t * (10 ** ((T - Tref) / z))

    # Référence HTST = 15 s à 72°C → VP_ref = 15
    vp_ref_htst = 15.0
    conforme_htst = vp_secondes >= vp_ref_htst

    # Référence LTLT = 1800 s à 63°C
    vp_ref_ltlt = 1800.0
    conforme_ltlt = vp_secondes >= vp_ref_ltlt

    # Temps équivalent à 72°C pour atteindre même VP
    t_eq_72 = vp_secondes  # par définition Tref=72

    return {
        "valeur_pasteurisatrice_s" : round(vp_secondes, 2),
        "valeur_pasteurisatrice_min": round(vp_secondes / 60, 3),
        "conforme_htst"            : conforme_htst,   # 15s/72°C
        "conforme_ltlt"            : conforme_ltlt,   # 30min/63°C
        "temps_equivalent_72C_s"   : round(t_eq_72, 2),
        "facteur_lethalite"        : round(10 ** ((T - Tref) / z), 4),
        "interpretation"           : (
            "✅ Traitement suffisant (HTST)"  if conforme_htst and conforme_ltlt else
            "✅ Traitement suffisant (HTST)"  if conforme_htst else
            "⚠️ Traitement insuffisant — augmenter T ou durée"
        ),
        "parametres"               : {
            "temperature_C" : T,
            "duree_s"       : t,
            "Tref"          : Tref,
            "z_value"       : z,
        },
        "courbe_sensibilite"        : [
            {
                "temperature": round(Tref - 10 + i * 2, 1),
                "duree_equivalente_s": round(15 * (10 ** -((Tref - 10 + i * 2 - Tref) / z)), 2)
            }
            for i in range(15)
        ]
    }


@router_haccp.post("/calcul-ph-fermentation")
def calculer_cinetique_ph(params: ParametresPH):
    """
    Cinétique de fermentation lactique — modèle logistique simplifié
    pH(t) = pH_cible + (pH_initial - pH_cible) / (1 + e^(k*(t-t_demi)))
    Paramètres par type de ferment :
      Yaourt (L. bulgaricus + S. thermophilus) : k=1.8, t½=2.0h
      Fromage frais (Lc. lactis)              : k=1.2, t½=4.0h
      Kéfir (mix complexe)                    : k=1.5, t½=3.0h
    """
    ferment_params = {
        "yaourt"  : {"k": 1.8, "t_demi": 2.0},
        "fromage" : {"k": 1.2, "t_demi": 4.0},
        "kefir"   : {"k": 1.5, "t_demi": 3.0},
    }
    fp = ferment_params.get(params.type_ferment, ferment_params["yaourt"])
    k      = fp["k"]
    t_demi = fp["t_demi"]

    def ph_t(t_h):
        delta = params.ph_initial - params.ph_cible
        return params.ph_cible + delta / (1 + math.exp(k * (t_h - t_demi)))

    # Courbe théorique toutes les 30 min
    courbe_theorique = [
        {"heure": round(i * 0.5, 1), "ph": round(ph_t(i * 0.5), 3)}
        for i in range(int(params.duree_heures * 2) + 1)
    ]

    ph_actuel = ph_t(params.duree_heures)
    conforme  = params.ph_cible - 0.3 <= ph_actuel <= params.ph_cible + 0.3

    # Estimation temps restant pour atteindre pH cible
    # Résolution numérique simple
    t_cible = None
    for i in range(200):
        t = i * 0.05
        if ph_t(t) <= params.ph_cible + 0.05:
            t_cible = round(t, 2)
            break

    return {
        "ph_actuel_estime"  : round(ph_actuel, 3),
        "ph_cible"          : params.ph_cible,
        "conforme"          : conforme,
        "heure_atteinte_cible": t_cible,
        "courbe_theorique"  : courbe_theorique,
        "type_ferment"      : params.type_ferment,
        "temperature_C"     : params.temperature_C,
        "interpretation"    : (
            f"✅ pH dans la plage cible ({params.ph_cible} ± 0.3)"
            if conforme else
            f"⚠️ pH hors zone ({ph_actuel:.2f}) — vérifier inoculum et température"
        ),
    }


@router_haccp.get("/indicateurs-sanitaires")
def get_indicateurs_sanitaires(db: Session = Depends(get_db), user=Depends(get_current_user)):
    """KPIs sanitaires globaux pour le dashboard."""
    tous_statuts = db.query(StatutSanitaireLot).all()
    toutes_alertes = db.query(AlerteHACCP).all()

    nb_lots       = len(tous_statuts)
    nb_conformes  = sum(1 for s in tous_statuts if s.statut in [StatutLotHACCP.CONFORME, StatutLotHACCP.LIBERE])
    nb_bloques    = sum(1 for s in tous_statuts if s.statut == StatutLotHACCP.BLOQUE)
    nb_liberes    = sum(1 for s in tous_statuts if s.statut == StatutLotHACCP.LIBERE)

    indice_global = round((nb_conformes / nb_lots) * 100, 1) if nb_lots else 0.0
    alertes_nc    = [a for a in toutes_alertes if not a.acquittee]

    return {
        "indice_conformite_global"   : indice_global,
        "nb_lots_controles"          : nb_lots,
        "nb_lots_conformes"          : nb_conformes,
        "nb_lots_bloques"            : nb_bloques,
        "nb_lots_liberes"            : nb_liberes,
        "nb_alertes_critiques_nc"    : sum(1 for a in alertes_nc if a.niveau_gravite == NiveauGravite.CRITIQUE),
        "nb_alertes_mineures_nc"     : sum(1 for a in alertes_nc if a.niveau_gravite == NiveauGravite.MINEURE),
        "taux_liberation"            : round((nb_liberes / nb_lots) * 100, 1) if nb_lots else 0.0,
    }