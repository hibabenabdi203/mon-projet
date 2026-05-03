# ═══════════════════════════════════════════════
# TWINOVA — Moteur de calcul KPI
# Formules OEE standard
# ═══════════════════════════════════════════════

def calculer_kpi(
    temps_planifie: float,      # minutes/jour
    temps_cycle: float,         # secondes/pièce
    capacite_theorique: float,  # pièces/jour
    marge_unitaire: float,      # €/pièce
    temps_panne: float,         # minutes
    temps_micro_arret: float,   # minutes
    temps_setup: float,         # minutes
    production_totale: int,     # pièces
    production_conforme: int    # pièces
):

    # ── 1. DISPONIBILITÉ ─────────────────────────
    # Temps réellement fonctionnel après pannes et setup
    temps_fonctionnel = temps_planifie - temps_panne - temps_setup
    temps_fonctionnel = max(temps_fonctionnel, 0.01)  # éviter division par zéro

    disponibilite = (temps_fonctionnel / temps_planifie) * 100
    disponibilite = min(round(disponibilite, 1), 100.0)

    # ── 2. PERFORMANCE ───────────────────────────
    # Temps net après micro-arrêts
    temps_net = temps_fonctionnel - temps_micro_arret
    temps_net = max(temps_net, 0.01)

    # Production théorique possible pendant ce temps net
    temps_cycle_min = temps_cycle / 60  # convertir secondes en minutes
    production_theorique = temps_net / temps_cycle_min

    performance = (production_totale / production_theorique) * 100
    performance = min(round(performance, 1), 100.0)

    # ── 3. QUALITÉ ───────────────────────────────
    if production_totale > 0:
        qualite = (production_conforme / production_totale) * 100
    else:
        qualite = 0.0
    qualite = min(round(qualite, 1), 100.0)

    # ── 4. TRS ───────────────────────────────────
    trs = (disponibilite * performance * qualite) / 10000
    trs = round(trs, 1)

    # ── 5. PERTES ET COÛTS ───────────────────────
    production_rebutee = production_totale - production_conforme
    cout_defauts = round(production_rebutee * marge_unitaire, 2)

    # Production perdue = écart entre 85% TRS et TRS actuel
    production_optimale = int(capacite_theorique * 0.85)
    production_perdue = max(production_optimale - production_conforme, 0)
    gain_potentiel_mois = round(production_perdue * marge_unitaire * 30, 2)

    # ── 6. STATUT ────────────────────────────────
    if trs >= 85:
        statut = "optimal"
    elif trs >= 75:
        statut = "correct"
    elif trs >= 60:
        statut = "attention"
    else:
        statut = "critique"

    # ── 7. RECOMMANDATIONS ───────────────────────
    recommandations = []

    if temps_panne > 30:
        recommandations.append({
            "priorite": "critique",
            "titre": "Maintenance préventive urgente",
            "action": "Planifier une intervention technique sous 48h",
            "gain": f"+{round(temps_panne * 0.5, 0):.0f} min/jour récupérées"
        })

    if performance < 80:
        recommandations.append({
            "priorite": "haute",
            "titre": "Réduire les micro-arrêts",
            "action": "Standardiser les procédures de changement de série",
            "gain": f"+{round((90 - performance) * 0.5, 1)}% performance estimée"
        })

    if qualite < 95:
        recommandations.append({
            "priorite": "moyenne",
            "titre": "Réduire le taux de défauts",
            "action": "Vérifier les paramètres process et recalibrer",
            "gain": f"-{production_rebutee} pièces rebutées/jour"
        })

    return {
        "kpi": {
            "trs": trs,
            "disponibilite": disponibilite,
            "performance": performance,
            "qualite": qualite,
            "statut": statut
        },
        "pertes": {
            "production_rebutee": production_rebutee,
            "cout_defauts": cout_defauts,
            "gain_potentiel_mois": gain_potentiel_mois
        },
        "recommandations": recommandations
    }