"""
Awzid — RENFORT DU TAJWĪD : évaluation intermédiaire sur les fautes simulées NOUVELLES d'Ayyūb (iqlāb « ن clair » et « sans
tenue », idghām, lām), pendant que les autres voix attendent (VM saturée).
  - indices de probabilité (P_n, 1-P_۾, Pp_n) : seuil = « ≤ 2 % de fausses alertes pour CHACUNE des 5 voix » sur le Coran
    entier (regles.jsonl.gz du 1/11, 112 040 occurrences) : seuil indépendant des fautes testées ;
  - indices acoustiques et durées propres au récitant (dF2, r_tabii) : seuil = 98ᵉ centile des occurrences justes d'Ayyūb
    lui-même (2 264 versets). C'est OPTIMISTE (même voix) : à confirmer sur les voix nouvelles.
"""
import collections
import gzip
import json
import math

import numpy as np

R = [json.loads(l) for l in gzip.open('/calib/regles.jsonl.gz', 'rt')]
C = [json.loads(l) for l in gzip.open('/out/ayyoub/correct.jsonl.gz', 'rt', encoding='utf-8')]
F = [json.loads(l) for l in gzip.open('/out/ayyoub/fautes.jsonl.gz', 'rt', encoding='utf-8')]
ok = lambda d: d.get('aligne') and d['cout'] <= 0.2 and d.get('tok') == d.get('att_tok')
okf = lambda d: d.get('aligne') and d['cout'] <= 0.25


def t_voix(regle, fn):
    pv = collections.defaultdict(list)
    for d in R:
        if d['regle'] == regle and ok(d):
            try:
                pv[d['rec']].append(fn(d))
            except (KeyError, TypeError):
                pass
    return max(sorted(v)[int(math.floor(0.98 * len(v)))] for v in pv.values()), sum(map(len, pv.values()))


def t_ayyoub(regle, fn):
    v = []
    for d in C:
        if d['regle'] == regle and ok(d):
            try:
                x = fn(d)
            except (KeyError, TypeError):
                x = None
            if x is not None and np.isfinite(x):
                v.append(x)
    v.sort()
    return (v[int(math.floor(0.98 * len(v)))] if v else None), len(v)


def det(typ, fn, t):
    L = [d for d in F if d['faute'] == typ]
    s = 0
    for d in L:
        if not okf(d):
            continue
        try:
            x = fn(d)
        except (KeyError, TypeError):
            x = None
        if x is not None and x > t:
            s += 1
    return s, len(L)


div = lambda a, b: None if not a or not b or b <= 0 else a / b
out = {}
lignes = [
    ('iqlab', 'P_n', lambda d: d['P']['ن'], 'voix', ['iqlab_n', 'iqlab_izhar', 'iqlab_court']),
    ('iqlab', '1-P_۾', lambda d: 1 - d['P']['۾'], 'voix', ['iqlab_n', 'iqlab_izhar', 'iqlab_court']),
    ('iqlab', 'max(n,ں) (ancien)', lambda d: max(d['P']['ن'], d['P']['ں']), 'voix', ['iqlab_n', 'iqlab_izhar', 'iqlab_court']),
    ('iqlab', '1/r_tabii', lambda d: div(1.0, d.get('r_tabii')), 'ayyoub', ['iqlab_izhar', 'iqlab_court']),
    ('idgham_ghunna', 'Pp_n', lambda d: d['Pp']['ن'], 'voix', ['idgh_izhar', 'idgh_court']),
    ('idgham_ghunna', '1/r_tabii_bloc', lambda d: div(1.0, d.get('r_tabii_bloc')), 'ayyoub', ['idgh_izhar', 'idgh_court']),
    ('idgham_ghunna', '1/r_tabii (ancienne fenêtre)', lambda d: div(1.0, d.get('r_tabii')), 'ayyoub', ['idgh_izhar', 'idgh_court']),
    ('idgham_ghunna', '1/r_large (voyelle du tanwīn + tenue + و/ي)', lambda d: div(d['duree'] / d['r_tabii'], (d['tn'] - d['tp']) * d['fs']) if d.get('r_tabii') else None, 'ayyoub', ['idgh_izhar', 'idgh_court']),
    ('idgham_sans', 'Pp_n|ں', lambda d: max(d['Pp']['ن'], d['Pp']['ں']), 'voix', ['idghs_n']),
    ('lam_allah_tafkhim', 'dF2', lambda d: d.get('dF2'), 'ayyoub', ['lam_leger']),
    ('lam_allah_tafkhim', 'rF2', lambda d: d.get('rF2'), 'ayyoub', ['lam_leger']),
    ('lam_allah_tafkhim', '1-tafkhim (ancien)', lambda d: 1 - d['tafkhim_tete'], 'voix', ['lam_leger']),
    ('lam_allah_tarqiq', 'tafkhim', lambda d: d['tafkhim_tete'], 'voix', ['lam_lourd']),
    ('lam_allah_tarqiq', '-dF2', lambda d: None if d.get('dF2') is None else -d['dF2'], 'ayyoub', ['lam_lourd']),
    ('ghunna', '1/r_tabii', lambda d: div(1.0, d.get('r_tabii')), 'ayyoub', ['ghunna_court70', 'ghunna_court50']),
    ('ikhfa', '1/r_tabii', lambda d: div(1.0, d.get('r_tabii')), 'ayyoub', ['ikhfa_court', 'ikhfa_izhar']),
    ('ikhfa', 'P_n', lambda d: d['P']['ن'], 'voix', ['ikhfa_izhar']),
    ('izhar', 'r_tabii', lambda d: d.get('r_tabii'), 'ayyoub', ['izhar_long']),
]
for regle, nom, fn, mode, types in lignes:
    t, n = t_voix(regle, fn) if mode == 'voix' else t_ayyoub(regle, fn)
    if t is None:
        continue
    r = {'seuil': t, 'n_justes': n, 'seuil_appris_sur': '5 voix, Coran entier' if mode == 'voix' else 'Ayyūb seul (optimiste)'}
    for typ in types:
        k, m = det(typ, fn, t)
        r[typ] = f'{k}/{m}'
    out[f'{regle}::{nom}'] = r
    print(f'{regle:18s} {nom:28s} seuil={t:.4g} (n={n}, {r["seuil_appris_sur"]}) ' + ' '.join(f'{ty}={r[ty]}' for ty in types))
json.dump(out, open('/out/ayyoub_eval.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
