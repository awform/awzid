"""
Awzid — CALIBRATION DES SEUILS DE TAJWĪD sur le décodage du Coran entier (5 voix Ḥafṣ du Complexe du Roi Fahd), 1/11/2026.
Lit SEULEMENT les log-probabilités déjà décodées (cache8 : aucun audio relu, aucun modèle chargé). Écrit des mesures, une ligne par
occurrence, sans audio. Rien n'est modifié dans l'appli.

    python mesurer_cache.py madd              -> OUT/madd.jsonl.gz    (décision du service d'écoute, madd.py, sur les vrais décodages)
    python mesurer_cache.py regles [N_PROC]   -> OUT/regles.jsonl.gz  (durées et probabilités des règles de nasalisation, du lām de Allāh)

Variables : CACHE (défaut /work/cache8), OUT (défaut /out), TANZIL, TAJWID_DIR (fichiers /tajwid/NNN.json), SERVICE (dossier
services/ecoute-ia, pour importer madd.py tel qu'il est en production), VOCAB (vocab.json du modèle).
"""
from __future__ import annotations

import collections
import gzip
import json
import multiprocessing as mp
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.environ.get('SERVICE', os.path.join(HERE, '..')))

CACHE = os.environ.get('CACHE', '/work/cache8')
OUT = os.environ.get('OUT', '/out')
TAJWID_DIR = os.environ.get('TAJWID_DIR', '/tajwid')
VOCAB = os.environ.get('VOCAB', '/muaalem/vocab.json')
VOIX = ['ayyoub', 'akhdar', 'huthify', 'muaiqly', 'muhanna']
COUT_MAX = 0.20  # au-delà, le verset est mal reconnu : on se tait (même valeur que l'étude du 25/10)

VOC = json.load(open(VOCAB)) if os.path.exists(VOCAB) else {'phonemes': {}, 'ghonna': {}, 'tafkheem_or_taqeeq': {}}  # vide : tests
INV = {i: t for t, i in VOC['phonemes'].items()}
PH = VOC['phonemes']


def charger(rec, s, a):
    f = f'{CACHE}/{rec}/{s}_{a}.npz'
    if not os.path.exists(f):
        return None
    z = np.load(f)
    return {k: z[k].astype(np.float32) for k in ('phonemes', 'ghonna', 'tafkheem_or_taqeeq')}, int(z['n'])


def glouton(lp):
    """Décodage glouton CTC identique à celui du service (muaalem.py) : {tok, t0, t1, p} par émission, trames de 40 ms."""
    best = lp.argmax(-1)
    ps = np.exp(lp.max(-1))
    out, prev = [], None
    for t, (i, p) in enumerate(zip(best.tolist(), ps.tolist())):
        if i != 0 and i == prev:
            out[-1]['t1'] = t
            out[-1]['p'] = max(out[-1]['p'], p)
        elif i != 0:
            out.append({'tok': INV[i], 't0': t, 't1': t, 'p': p})
        prev = i
    return out


# ------------------------------------------------------------------------------------------------ madd
def fnv(s):
    h = 0x811c9dc5
    for c in s:
        h ^= ord(c)
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h


def base36(n):
    d = '0123456789abcdefghijklmnopqrstuvwxyz'
    out = ''
    while True:
        out = d[n % 36] + out
        n //= 36
        if n == 0:
            return out


TANWIN = set('ًٌٍ')
SMALL_MEEM = set('ۭۢ')
REGLES_TAJWID = ['ghunnah', 'idghaam_ghunnah', 'idghaam_shafawi', 'ikhfa', 'ikhfa_shafawi', 'iqlab', 'idghaam_no_ghunnah',
                 'idghaam_mutajanisayn', 'idghaam_mutaqaribayn', 'madd_2', 'madd_246', 'madd_munfasil', 'madd_muttasil', 'madd_6',
                 'qalqalah', 'hamzat_wasl', 'lam_shamsiyyah', 'silent']
MADD_R = {'madd_2', 'madd_246', 'madd_munfasil', 'madd_muttasil', 'madd_6'}
LONG = {'madd_muttasil': 'muttasil', 'madd_6': 'lazim'}


def cibles_de(text, entry):
    """Port fidèle de `ciblesDe` / `runsOf` (apps/web/src/lib/tajwid-madd/cibles.ts, packages/content/src/tajwid.ts) :
    (n, [(k, type)]) ou None si l'annotation n'est pas fiable pour ce texte."""
    if not entry or entry[0] != base36(fnv(text)) or (len(entry) - 1) % 3 != 0:
        return None
    paint = [-1] * len(text)
    for k in range(1, len(entry), 3):
        r, st, ln = entry[k], entry[k + 1], entry[k + 2]
        if not (0 <= r < len(REGLES_TAJWID)) or st < 0 or ln <= 0 or st + ln > len(text):
            return None
        for i in range(st, st + ln):
            paint[i] = r
    for i in range(1, len(text)):
        if paint[i] != paint[i - 1] and text[i - 1] in TANWIN and text[i] in SMALL_MEEM:
            paint[i] = paint[i - 1]
    runs, a = [], 0
    for i in range(1, len(text) + 1):
        if i == len(text) or paint[i] != paint[a]:
            runs.append((a, i, REGLES_TAJWID[paint[a]] if paint[a] >= 0 else None))
            a = i
    k, cibles = 0, []
    for (a, b, r) in runs:
        if r in MADD_R:
            if r in LONG:
                cibles.append((k, LONG[r]))
            k += 1
    return (k, cibles) if cibles else None


def lire_tanzil_brut():
    d = {}
    for l in open(os.environ.get('TANZIL', '/content/coran/tanzil-uthmani.tsv'), encoding='utf-8'):
        l = l.rstrip('\n').lstrip('﻿')
        if not l.strip():
            continue
        sa, txt = l.split('\t', 1)
        s, a = sa.split(':')
        d[(int(s), int(a))] = txt.replace('﻿', '')
    return d


def passe_madd():
    import madd  # le MÊME module que le service (services/ecoute-ia/madd.py)
    import tajwid_commun as tc
    T = lire_tanzil_brut()
    T2 = tc.lire_tanzil()
    out = gzip.open(f'{OUT}/madd.jsonl.gz', 'wt', encoding='utf-8')
    n_annot = n_ecarte = 0
    for s in range(1, 115):
        try:
            sura = json.load(open(f'{TAJWID_DIR}/{s:03d}.json'))
        except FileNotFoundError:
            continue
        for a in range(1, len(sura['a']) + 1):
            txt = T.get((s, a))
            if txt is None:
                continue
            c = cibles_de(txt, sura['a'][a - 1])
            if c is None and (s, a) in T2:  # texte sans la basmala de tête
                c = cibles_de(T2[(s, a)], sura['a'][a - 1])
            if c is None:
                n_ecarte += 1
                continue
            n_total, cibles = c
            n_annot += 1
            dec = {}
            for rec in VOIX:
                x = charger(rec, s, a)
                if x is not None:
                    dec[rec] = glouton(x[0]['phonemes'])
            # (référence, élève) : la production = Ayyūb contre chacune des 4 autres voix ; la voix d'Ayyūb elle-même est mesurée
            # contre chacune des 4 autres comme référence (« symétrie », jamais utilisée pour le seuil de production)
            for ref_v in VOIX:
                for hyp_v in VOIX:
                    if ref_v == hyp_v or ref_v not in dec or hyp_v not in dec:
                        continue
                    if ref_v != 'ayyoub' and hyp_v != 'ayyoub':
                        continue
                    for (k, typ) in cibles:
                        for n_arg in (n_total, None):
                            raison, r, pmin, unites = madd.rapport(dec[ref_v], dec[hyp_v], k, typ, n_arg)
                            out.write(json.dumps({'s': s, 'a': a, 'k': k, 'type': typ, 'ref': ref_v, 'hyp': hyp_v,
                                                  'n_ok': n_arg is not None, 'raison': raison,
                                                  'r': None if r is None else round(r, 4),
                                                  'p': None if pmin is None else round(pmin, 4), 'u': unites}) + '\n')
    out.close()
    print('versets annotés avec madd long :', n_annot, '| annotation non fiable :', n_ecarte)


# ------------------------------------------------------------------------------------------------ autres règles
REGLES = {'ghunna', 'idgham_ghunna', 'idgham_sans', 'ikhfa', 'ikhfa_shafawi', 'iqlab', 'izhar',
          'lam_allah_tarqiq', 'lam_allah_tafkhim'}
VOY = {'َ', 'ُ', 'ِ', 'ا', 'ۥ', 'ۦ'}


def aligner_rapide(att, dec):
    """Même alignement que tajwid_commun.aligner (distance d'édition, substitutions voisines à 0,6), en listes Python."""
    import tajwid_commun as tc
    n, m = len(att), len(dec)
    A = [g['tok'] for g in att]
    B = [g['tok'] for g in dec]
    cache = {}

    def cout(a, b):
        k = (a, b)
        v = cache.get(k)
        if v is None:
            v = cache[k] = tc._cout(a, b)
        return v
    D = [[0.0] * (m + 1) for _ in range(n + 1)]
    for y in range(m + 1):
        D[0][y] = float(y)
    for x in range(1, n + 1):
        D[x][0] = float(x)
        ax, Dp, Dc = A[x - 1], D[x - 1], D[x]
        for y in range(1, m + 1):
            v = Dp[y] + 1.0
            w = Dc[y - 1] + 1.0
            if w < v:
                v = w
            w = Dp[y - 1] + cout(ax, B[y - 1])
            if w < v:
                v = w
            Dc[y] = v
    corr = [None] * n
    x, y = n, m
    while x > 0 and y > 0:
        c = cout(A[x - 1], B[y - 1])
        if abs(D[x][y] - (D[x - 1][y - 1] + c)) < 1e-4:
            if c < 1.0:
                corr[x - 1] = y - 1
            x -= 1
            y -= 1
        elif abs(D[x][y] - (D[x - 1][y] + 1)) < 1e-4:
            x -= 1
        else:
            y -= 1
    return corr, D[n][m] / max(1, n)


def groupes(dec):
    import tajwid_commun as tc
    return tc.groupes_decodes(dec)


def fin_voyelle(dec, j):
    k = j + 1
    while k < len(dec) and dec[k]['tok'] in VOY:
        k += 1
    return dec[k]['t0'] if k < len(dec) else dec[-1]['t1'] + 1


_Q = None


def mesures_verset(args):
    global _Q
    import tajwid_commun as tc
    s, a = args
    if _Q is None:
        _Q = tc.lire_tanzil()
    toks, occ = tc.transcrire(_Q[(s, a)])
    occ = [o for o in occ if o['regle'] in REGLES]
    if not occ:
        return []
    att = tc.groupes_attendus(toks)
    res = []
    P_ghonna = VOC['ghonna']['[مغن]']
    P_tafkhim = VOC['tafkheem_or_taqeeq']['[مفخم]']
    for rec in VOIX:
        x = charger(rec, s, a)
        if x is None:
            continue
        lp, n_ech = x
        dec = groupes(glouton(lp['phonemes']))
        if not dec:
            continue
        T = lp['phonemes'].shape[0]
        fs = n_ech / 16000 / T
        corr, cout = aligner_rapide(att, dec)
        P = np.exp(lp['phonemes'])
        G = np.exp(lp['ghonna'][:, P_ghonna])
        Tf = np.exp(lp['tafkheem_or_taqeeq'][:, P_tafkhim])
        rate = (dec[-1]['t1'] - dec[0]['t0'] + 1) * fs / len(att)
        for o in occ:
            idx = [i for i, g in enumerate(att) if o['id'] in g['tags']]
            m = {'rec': rec, 's': s, 'a': a, 'oid': o['id'], 'regle': o['regle'], 'detail': o['detail'], 'cout': round(cout, 3)}
            if not idx or corr[idx[0]] is None:
                m['aligne'] = False
                res.append(m)
                continue
            i = idx[0]
            j = corr[i]
            g = dec[j]
            t0, t1 = g['t0'], g['t1']
            tn = dec[j + 1]['t0'] if j + 1 < len(dec) else t1 + 1
            tp = dec[j - 1]['t0'] if j > 0 else t0
            W = slice(t0, max(tn, t1 + 1))
            Wp = slice(tp, max(tn, t1 + 1))
            m.update({'aligne': True, 'tok': g['tok'], 'att_tok': att[i]['tok'], 'n': g['n'], 'att_n': att[i]['n'],
                      'dn': round((tn - t0) * fs / rate, 4), 'duree': round((tn - t0) * fs, 4),
                      'P': {t: round(float(P[W, PH[t]].max()), 5) for t in ('ن', 'ں', 'م', '۾')},
                      'Pp': {t: round(float(P[Wp, PH[t]].max()), 5) for t in ('ن', 'ں')},
                      'ghunna_max': round(float(G[W].max()), 5)})
            if o['regle'].startswith('lam_allah'):
                tv = fin_voyelle(dec, j)
                m['tafkhim_tete'] = round(float(Tf[t0:max(tv, t1 + 1)].mean()), 5)
            res.append(m)
    return res


def passe_regles(n_proc):
    import tajwid_commun as tc
    Q = tc.lire_tanzil()
    versets = sorted(Q)[:int(os.environ.get('LIMIT', '1000000'))]
    out = gzip.open(f'{OUT}/regles.jsonl.gz', 'wt', encoding='utf-8')
    n = 0
    with mp.Pool(n_proc) as pool:
        for k, res in enumerate(pool.imap(mesures_verset, versets, chunksize=8)):
            for m in res:
                out.write(json.dumps(m, ensure_ascii=False) + '\n')
                n += 1
            if k % 1000 == 0:
                print(k, len(versets), n, flush=True)
    out.close()
    print('mesures :', n)


if __name__ == '__main__':
    if sys.argv[1] == 'madd':
        passe_madd()
    else:
        passe_regles(int(sys.argv[2]) if len(sys.argv) > 2 else 3)
