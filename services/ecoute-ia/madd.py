"""
Awzid — INDICATION DES MADD (25/10/2026, interrupteur `tajwid_madd`, bêta fermée, ADULTES seulement). Logique PURE (aucun modèle, aucun
numpy), testée dans tests/test_madd.py ; d'après l'étude `recherche_coran_ia/ETUDE_TAJWID.md` et le prototype `madd.py`.

RÈGLES (étude § 5) — elles sont codées ici, pas seulement écrites :
  1. UNE INDICATION, JAMAIS UNE NOTE : la seule sortie est « trop_court » ou rien. Jamais « correct », jamais de pourcentage, de score ou
     de rapport chiffré. Le rapport r n'est pas renvoyé.
  2. MIEUX VAUT SE TAIRE QUE SE TROMPER : on ne dit « trop_court » qu'au-dessus d'un seuil réglé pour ZÉRO fausse alerte sur les 50
     récitations justes de la validation (R_COURT = 0,70 : les muttaṣil justes ne descendent pas sous 0,88, les raccourcis montent jusqu'à
     0,78) ET si la confiance du modèle sur le madd est ≥ P_MIN (0,95 ; toutes les récitations justes de l'étude sont ≥ 0,99). Tout le reste
     (madd non retrouvé, verset mal reconnu, correspondance incertaine, zone grise) = SILENCE.
  3. SEULEMENT LES MADD LONGS : muttaṣil (au moins 4 temps) et lāzim (6 temps). Un madd ṭabīʿī (2 temps), munfaṣil et ʿāriḍ ne sont JAMAIS
     signalés (longueurs permises variables) ; jamais « correct » pour un ṭabīʿī.
  4. LA DURÉE, PAS LA LONGUEUR ÉCRITE : le modèle écrit la longueur canonique, il ne la mesure pas (étude § 3.2) ; seule la durée dans le temps,
     rapportée au débit et comparée à Ayyūb (référence), décide.
  5. Un seul madd analysé par appel (cible choisie dans le verset travaillé) ; l'audio n'est jamais conservé (voir madd_route.py).
"""
from __future__ import annotations

import os

MADD = {'ا', 'ۥ', 'ۦ'}  # unités de voyelle longue (a, u, i)
HARAKA = {'َ', 'ُ', 'ِ'}
TRAME = 0.04
R_COURT = float(os.environ.get('MADD_R_COURT', '0.70'))
P_MIN = float(os.environ.get('MADD_P_MIN', '0.95'))
# part maximale de phonèmes différents entre l'élève et la référence : au-delà, le verset est « mal reconnu » et rien n'est analysé
DIST_MAX = float(os.environ.get('MADD_DIST_MAX', '0.25'))
# temps minimum du madd dans la RÉFÉRENCE pour qu'il compte comme « long » selon son type
UNITES_MIN = {'muttasil': 4, 'lazim': 6}
TYPES = tuple(UNITES_MIN)


def runs(toks: list[dict]) -> list[tuple[int, int, int]]:
    """Les madd d'une suite décodée : [(i_haraka, i_premiere_unite, i_derniere_unite)], dans l'ordre du temps."""
    out, i = [], 0
    while i < len(toks):
        if toks[i]['tok'] in MADD and (i == 0 or toks[i - 1]['tok'] != toks[i]['tok']):
            j = i
            while j + 1 < len(toks) and toks[j + 1]['tok'] == toks[i]['tok']:
                j += 1
            h = i - 1 if i > 0 and toks[i - 1]['tok'] in HARAKA else i
            if j > i or (i > 0 and toks[i - 1]['tok'] in HARAKA):  # au moins une vraie voyelle longue
                out.append((h, i, j))
            i = j + 1
        else:
            i += 1
    return out


def mesure(toks: list[dict], run: tuple[int, int, int]) -> dict:
    """Durée = du début de la voyelle brève jusqu'au début du phonème SUIVANT (en fin de verset : dernière unité + 1 trame)."""
    h, i, j = run
    fin = toks[j + 1]['t0'] if j + 1 < len(toks) else toks[j]['t1'] + 1
    return {'unites': j - i + 1, 'duree_s': (fin - toks[h]['t0']) * TRAME,
            'p_min': min(t['p'] for t in toks[i:j + 1])}


def nb_phonemes(toks: list[dict]) -> int:
    return sum(1 for t in toks if t['tok'] not in MADD)


def debit(toks: list[dict], n_ph: int) -> float:
    """Durée moyenne d'un phonème : étendue de la parole / nombre de phonèmes (hors madd) de la référence."""
    return (toks[-1]['t1'] - toks[0]['t0'] + 1) * TRAME / max(1, n_ph)


def _reduit(toks: list[dict]) -> tuple[list[str], list[int]]:
    seq, idx = [], []
    for k, t in enumerate(toks):
        if t['tok'] in MADD and seq and seq[-1] == t['tok']:
            continue
        seq.append(t['tok'])
        idx.append(k)
    return seq, idx


def _distance(a: list[str], b: list[str]) -> int:
    prev = list(range(len(b) + 1))
    for x in range(1, len(a) + 1):
        cur = [x] + [0] * len(b)
        for y in range(1, len(b) + 1):
            cur[y] = min(prev[y] + 1, cur[y - 1] + 1, prev[y - 1] + (a[x - 1] != b[y - 1]))
        prev = cur
    return prev[len(b)]


def distance_relative(ref: list[dict], hyp: list[dict]) -> float:
    """Part de phonèmes à changer pour passer de la référence à l'élève (madd réduits à une unité) ; 1 si la référence est vide."""
    a, _ = _reduit(ref)
    b, _ = _reduit(hyp)
    return 1.0 if not a else _distance(a, b) / len(a)


def aligner_runs(ref: list[dict], hyp: list[dict]) -> list[tuple[int, int, int] | None]:
    """Aligne les deux suites (distance d'édition, madd réduits à une unité) et renvoie, pour chaque madd de la référence, le madd
    correspondant de l'hypothèse (ou None)."""
    a, ia = _reduit(ref)
    b, ib = _reduit(hyp)
    n, m = len(a), len(b)
    D = [[0] * (m + 1) for _ in range(n + 1)]
    for x in range(n + 1):
        D[x][0] = x
    for y in range(m + 1):
        D[0][y] = y
    for x in range(1, n + 1):
        for y in range(1, m + 1):
            D[x][y] = min(D[x - 1][y] + 1, D[x][y - 1] + 1, D[x - 1][y - 1] + (a[x - 1] != b[y - 1]))
    corr: dict[int, int] = {}
    x, y = n, m
    while x > 0 and y > 0:
        if D[x][y] == D[x - 1][y - 1] + (a[x - 1] != b[y - 1]):
            if a[x - 1] == b[y - 1]:
                corr[ia[x - 1]] = ib[y - 1]
            x -= 1
            y -= 1
        elif D[x][y] == D[x - 1][y] + 1:
            x -= 1
        else:
            y -= 1
    par_debut = {r[1]: r for r in runs(hyp)}
    return [par_debut.get(corr.get(r[1])) for r in runs(ref)]


def decider(ref: list[dict], hyp: list[dict], k: int, type_madd: str, n_madd: int | None = None) -> dict:
    """Décision pour LE madd n° k (0 = premier) du verset : {'indication': 'trop_court' | None, 'raison': code}.
    `n_madd` : nombre de madd du verset selon les annotations de tajwīd (contrôle de correspondance) ; s'il ne coïncide pas avec les madd
    décodés dans la référence, on se tait. Seule valeur d'`indication` possible en dehors de None : « trop_court »."""
    def silence(raison: str) -> dict:
        return {'indication': None, 'raison': raison}

    if type_madd not in UNITES_MIN:
        return silence('type_non_long')
    if not ref or not hyp:
        return silence('audio_vide')
    rr = runs(ref)
    if n_madd is not None and n_madd != len(rr):
        return silence('correspondance_incertaine')
    if not (0 <= k < len(rr)):
        return silence('cible_introuvable')
    m_ref = mesure(ref, rr[k])
    if m_ref['unites'] < UNITES_MIN[type_madd]:
        return silence('madd_non_long')
    if distance_relative(ref, hyp) > DIST_MAX:
        return silence('verset_mal_reconnu')
    ch = aligner_runs(ref, hyp)[k]
    if ch is None:
        return silence('madd_non_retrouve')
    mh = mesure(hyp, ch)
    if mh['p_min'] < P_MIN:
        return silence('confiance_insuffisante')
    n_ph = nb_phonemes(ref)
    r = (mh['duree_s'] / debit(hyp, n_ph)) / (m_ref['duree_s'] / debit(ref, n_ph))
    if r < R_COURT:
        return {'indication': 'trop_court', 'raison': 'sous_le_seuil'}
    return silence('zone_non_signalee')
