"""
Awzid — SEUILS DE TAJWĪD (1/11/2026) : lecture de `seuils_tajwid.json`, la configuration calibrée sur le décodage du Coran entier par
5 récitateurs de référence (voir docs/projet/TAJWID_SEUILS_2026-11-01.md). Logique PURE, sans modèle ni numpy.

Règle d'or : une règle n'est signalée que si son `etat` est « indication ». Toute autre valeur (« eteinte », règle inconnue, fichier
illisible) = SILENCE. Le fichier est lu une fois ; il se régénère par `calibration/generer_seuils.py`, jamais à la main.
"""
from __future__ import annotations

import json
import os

CHEMIN = os.environ.get('TAJWID_SEUILS', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'seuils_tajwid.json'))
ETATS = ('eteinte', 'indication')
FIABILITES = ('prete_validation', 'indication', 'insuffisante', 'non_mesuree')


def charger(chemin: str = CHEMIN) -> dict:
    """Le contenu du fichier ; en cas d'absence ou d'erreur : AUCUNE règle (tout est éteint)."""
    try:
        with open(chemin, encoding='utf-8') as f:
            d = json.load(f)
        return d if isinstance(d, dict) and isinstance(d.get('regles'), dict) else {'regles': {}}
    except (OSError, ValueError):
        return {'regles': {}}


SEUILS = charger()


def regle(ident: str, seuils: dict | None = None) -> dict | None:
    return (seuils or SEUILS)['regles'].get(ident)


def etat(ident: str, seuils: dict | None = None) -> str:
    r = regle(ident, seuils)
    return r['etat'] if r and r.get('etat') in ETATS else 'eteinte'


def est_allumee(ident: str, seuils: dict | None = None) -> bool:
    """Vrai seulement si la règle est en mode « indication » ET possède un seuil numérique."""
    r = regle(ident, seuils)
    return bool(r) and etat(ident, seuils) == 'indication' and isinstance(r.get('seuil'), (int, float))


def seuil(ident: str, defaut: float, seuils: dict | None = None) -> float:
    """Seuil numérique de la règle, ou `defaut` si elle n'en a pas."""
    r = regle(ident, seuils)
    v = r.get('seuil') if r else None
    return float(v) if isinstance(v, (int, float)) else defaut
