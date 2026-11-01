"""
Awzid — RENFORT DU TAJWĪD : traitement d'UNE voix (recherche interne, rien dans l'appli, rien redistribué).

    python pipeline_voix.py VOIX MODE [N_FAUTES]
      VOIX : nom court ; MODE : « everyayah » (audio /ea/<dossier>/SSSAAA.mp3, juz 'Amma, décodé ici) ou
             « complexe » (5 voix de référence : décodages déjà en cache /cache8/<voix>, audio /src)
Sorties (dans /out/<VOIX>/) : cache/<s>_<a>.npz (log-probas float16, comme cache8), correct.jsonl.gz (mesures étendues
de chaque occurrence juste), fautes.jsonl.gz (fautes simulées sur cette voix, décodées en entier, comme pour un élève).
Les fautes sont fabriquées avec l'audio de la MÊME voix (montage), jamais par synthèse vocale.
"""
from __future__ import annotations

import collections
import glob
import gzip
import json
import os
import random
import sys
import time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, '/p')
import mesures2 as M  # noqa: E402
import tajwid_commun as tc  # noqa: E402
from muaalem import SR, lire_audio  # noqa: E402

NIVEAUX = ('phonemes', 'ghonna', 'qalqla', 'tafkheem_or_taqeeq')
COUT_MAX = 0.20
Q = tc.lire_tanzil()
COMPLEXE = {'ayyoub': ('ayyoub-hafs', 'A03'), 'huthify': ('huthify-hafs', 'A01'), 'akhdar': ('akhdar-hafs', 'A02'),
            'muaiqly': ('muaiqly-hafs', 'A08'), 'muhanna': ('muhanna-hafs', 'A06')}
CHUNK_S = float(os.environ.get('CHUNK_S', '20'))
TRAME = 320


def chemin(voix, mode, s, a):
    if mode == 'complexe':
        d, suf = COMPLEXE[voix]
        return f'/src/{d}/10-{s:03d}{a:03d}-{suf}.mp3'
    return f'/ea/{os.environ["DOSSIER"]}/{s:03d}{a:03d}.mp3'


def coupes(x):
    maxi = int(CHUNK_S * SR) // TRAME * TRAME
    cuts, pos = [], 0
    while len(x) - pos > maxi:
        a, b = pos + maxi - 4 * SR, pos + maxi
        a = max(a, pos + TRAME) // TRAME * TRAME
        n = (b - a) // TRAME
        e = (x[a:a + n * TRAME].reshape(n, TRAME) ** 2).mean(1)
        e = np.convolve(e, np.ones(5) / 5, mode='same')
        pos = a + int(np.argmin(e)) * TRAME
        cuts.append(pos)
    return cuts


class Decodeur:
    def __init__(self):
        self.m = None

    def __call__(self, x):
        import torch
        if self.m is None:
            from muaalem import Muaalem
            self.m = Muaalem('/muaalem', int(os.environ.get('THREADS', '3')))
        if len(x) <= int(CHUNK_S * SR):
            lp = self.m.logprobs(x)
        else:
            b = [0] + coupes(x) + [len(x)]
            parts = [self.m.logprobs(x[i:j]) for i, j in zip(b[:-1], b[1:])]
            lp = {k: torch.cat([p[k] for p in parts], 0) for k in parts[0]}
        return {k: lp[k].numpy().astype(np.float32) for k in NIVEAUX}


def versets(mode, voix):
    if mode == 'complexe':
        L = [tuple(map(int, os.path.basename(f)[:-4].split('_'))) for f in glob.glob(f'/cache8/{voix}/*.npz')]
        frac = float(os.environ.get('FRACTION', '1'))
        # tout le juz 'Amma (référence Ayyūb des voix everyayah), 5:109 (QDAT) + une fraction du reste du Coran, tirée par
        # un hachage du verset : les MÊMES versets pour les 5 voix (la référence Ayyūb existe pour chaque occurrence)
        def tire(v):
            return ((v[0] * 1000 + v[1]) * 2654435761 % 2 ** 32) / 2 ** 32 < frac
        return sorted(v for v in L if v in Q and (v[0] >= 78 or (5, 109) == v or tire(v)))
    s0, s1 = map(int, os.environ.get('SOURATES', '78-114').split('-'))
    return sorted(k for k in Q if s0 <= k[0] <= s1)


def charger_cache(f):
    z = np.load(f)
    return {k: z[k].astype(np.float32) for k in NIVEAUX if k in z}, int(z['n'])


# ------------------------------------------------------------------ fautes simulées (montage d'audio de la même voix)
FAUTES = {
    'ghunna_court70': 'ghunna', 'ghunna_court50': 'ghunna',
    'ikhfa_court': 'ikhfa', 'ikhfa_izhar': 'ikhfa',
    'izhar_long': 'izhar',
    'idgh_court': 'idgham_ghunna', 'idgh_izhar': 'idgham_ghunna', 'idghs_n': 'idgham_sans',
    'iqlab_n': 'iqlab', 'iqlab_izhar': 'iqlab', 'iqlab_court': 'iqlab',
    'lam_leger': 'lam_allah_tafkhim', 'lam_lourd': 'lam_allah_tarqiq',
    'qalq_kubra_sans': 'qalqala_kubra', 'qalq_sughra_sans': 'qalqala_sughra',
    'madd_court': 'madd_long',
}


def banque(C):
    B = collections.defaultdict(list)
    for d in C:
        if not d.get('aligne') or d['cout'] > COUT_MAX or d.get('tok') != d.get('att_tok') or 'tn' not in d:
            continue
        r = d['regle']
        dur = (d['tn'] - d['t0']) * d['fs']
        if r == 'izhar' and d['tok'] == 'ن' and 0.04 <= dur <= 0.16:
            B['n_izhar'].append(d)
        if r == 'ghunna' and d['tok'] in 'نم' and dur >= 0.2:
            B['murmure_' + d['tok']].append(d)
        if r.startswith('lam_allah') and 'tv' in d:
            B[r].append(d)
    return B


def appliquer(typ, x, d, B, rnd, lire):
    fs = d['fs']
    t0, tn = d['t0'] * fs, d['tn'] * fs

    def donneur(cle):
        L = [e for e in B.get(cle, []) if (e['s'], e['a']) != (d['s'], d['a'])]
        return rnd.choice(L) if L else None

    def seg(e, a, b):
        xd = lire(e['s'], e['a'])
        return xd[int(a * e['fs'] * SR): int(b * e['fs'] * SR)].copy()

    if typ == 'ghunna_court50':
        return tc.raccourcir(x, t0, tn, 0.5)
    if typ in ('ghunna_court70',):
        return tc.raccourcir(x, t0, tn, 0.7)
    if typ in ('idgh_court', 'ikhfa_court', 'iqlab_court'):
        if typ == 'idgh_court' and 'bloc_t0' in d:
            t0 = d['bloc_t0'] * fs
        return tc.raccourcir(x, t0, tn, 0.6)
    if typ in ('idgh_izhar', 'idghs_n', 'ikhfa_izhar', 'iqlab_izhar'):
        e = donneur('n_izhar')
        if e is None:
            return None
        sg = seg(e, e['t0'], e['tn'])
        if typ == 'idgh_izhar':
            if 'bloc_t0' in d:
                t0 = d['bloc_t0'] * fs
            return tc.inserer(tc.raccourcir(x, t0, tn, 0.5), t0, sg)
        if typ == 'idghs_n':
            return tc.inserer(x, t0, sg)
        return tc.remplacer(x, t0, tn, sg)   # ikhfa_izhar, iqlab_izhar : ن clair et bref à la place de la nasale tenue
    if typ == 'iqlab_n':
        e = donneur('murmure_ن')
        if e is None:
            return None
        L = e['tn'] - e['t0']
        sg = seg(e, e['t0'] + 0.2 * L, e['tn'] - 0.2 * L)
        n = int((tn - t0) * SR)
        if len(sg) >= n:
            k = (len(sg) - n) // 2
            sg = sg[k:k + n]
        else:
            sg = tc.allonger(np.concatenate([np.zeros(10, np.float32), sg, np.zeros(10, np.float32)]), 10 / SR,
                             (10 + len(sg)) / SR, n / max(1, len(sg)))[10:10 + n]
        return tc.remplacer(x, t0, tn, sg)
    if typ == 'izhar_long':
        return tc.allonger(x, t0, tn, 2.5)
    if typ in ('qalq_kubra_sans', 'qalq_sughra_sans'):
        if 't_fermeture' not in d:
            return None
        if typ == 'qalq_kubra_sans':
            c = int((d['t_fermeture'] + 0.030) * SR)
            y = x[:c].copy()
            f = int(0.015 * SR)
            y[-f:] *= np.linspace(1, 0, f, dtype=np.float32)
            return np.concatenate([y, np.zeros(int(0.3 * SR), np.float32)])
        a = int((d['t_fermeture'] + 0.015) * SR)
        b = min(len(x), a + int(0.060 * SR))
        y = x.copy()
        env = np.full(b - a, 0.03, np.float32)
        f = min(int(0.008 * SR), (b - a) // 3)
        env[:f] = np.linspace(1, 0.03, f)
        env[-f:] = np.linspace(0.03, 1, f)
        y[a:b] *= env
        return y
    if typ in ('lam_leger', 'lam_lourd'):
        e = donneur('lam_allah_tarqiq' if typ == 'lam_leger' else 'lam_allah_tafkhim')
        if e is None or 'tv' not in d:
            return None
        return tc.remplacer(x, t0, d['tv'] * fs, seg(e, e['t0'], e['tv']))
    if typ == 'madd_court':
        # madd de 4-6 temps ramené à environ 2 temps (la durée d'un ṭabīʿī du même verset)
        if not d.get('r_tabii'):
            return None
        part = float(np.clip(1 - 1.0 / d['r_tabii'], 0.3, 0.85))
        return tc.raccourcir(x, t0 + 0.04, tn, part)
    raise ValueError(typ)


def main():
    voix, mode = sys.argv[1], sys.argv[2]
    n_fautes = int(sys.argv[3]) if len(sys.argv) > 3 else 10
    out = f'/out/{voix}'
    os.makedirs(f'{out}/cache', exist_ok=True)
    V = versets(mode, voix)
    dec = Decodeur()
    audio_cache = {}

    def lire(s, a):
        k = (s, a)
        if k not in audio_cache:
            if len(audio_cache) > 64:
                audio_cache.clear()
            audio_cache[k] = lire_audio(chemin(voix, mode, s, a))
        return audio_cache[k]

    t_dep = time.time()
    C = []
    fc = f'{out}/correct.jsonl.gz'
    if os.path.exists(fc) and os.environ.get('REFAIRE') != '1':
        C = [json.loads(l) for l in gzip.open(fc, 'rt', encoding='utf-8')]
    else:
        g = gzip.open(fc + '.tmp', 'wt', encoding='utf-8')
        n_dec = t_aud = 0
        for (s, a) in V:
            p = chemin(voix, mode, s, a)
            if not os.path.exists(p):
                continue
            f = f'/cache8/{voix}/{s}_{a}.npz' if mode == 'complexe' else f'{out}/cache/{s}_{a}.npz'
            try:
                x = lire_audio(p)
            except Exception:
                continue
            if os.path.exists(f):
                lp, n = charger_cache(f)
            else:
                lp = dec(x)
                n = len(x)
                np.savez_compressed(f, n=n, **{k: v.astype(np.float16) for k, v in lp.items()})
                n_dec += 1
                t_aud += len(x) / SR
            for m in M.mesurer_verset(Q[(s, a)], lp, n, x):
                m.update({'rec': voix, 's': s, 'a': a})
                C.append(m)
                g.write(json.dumps(m, ensure_ascii=False) + '\n')
        g.close()
        os.replace(fc + '.tmp', fc)
        print(f'{voix} correct : {len(V)} versets, {n_dec} décodés ({t_aud/60:.1f} min audio), {len(C)} mesures, '
              f'{time.time()-t_dep:.0f} s', flush=True)
    if n_fautes <= 0:
        return
    B = banque(C)
    rnd = random.Random(7)
    ff = f'{out}/fautes.jsonl.gz'
    deja = set()
    anciennes = []
    if os.path.exists(ff):
        anciennes = [json.loads(l) for l in gzip.open(ff, 'rt', encoding='utf-8')]
    deja_gz = list(anciennes)
    # fautes déjà écrites par un passage interrompu (une ligne par faute, écrite aussitôt : un arrêt ne perd rien)
    fp = f'{out}/fautes.partiel.jsonl'
    if os.path.exists(fp):
        for l in open(fp, encoding='utf-8'):
            try:
                anciennes.append(json.loads(l))
            except ValueError:
                break
        with open(fp, 'w', encoding='utf-8') as h:   # on retire une éventuelle dernière ligne tronquée
            for d in anciennes[len(deja_gz):]:
                h.write(json.dumps(d, ensure_ascii=False) + '\n')
    deja = {(d['faute'], d['s'], d['a'], str(d['oid'])) for d in anciennes}
    g = open(fp, 'a', encoding='utf-8')
    types = (os.environ.get('TYPES') or ','.join(FAUTES)).split(',')
    nf = 0
    for typ in types:
        regle = FAUTES[typ]
        cand = [d for d in C if d['regle'] == regle and d.get('aligne') and d['cout'] <= COUT_MAX
                and d.get('tok') == d.get('att_tok') and 'tn' in d]
        if typ.startswith('qalq'):
            cand = [d for d in cand if 't_fermeture' in d]
        if typ == 'madd_court':
            cand = [d for d in cand if d.get('type') in ('lazim', 'hamza') and d.get('r_tabii')]
        if typ.startswith('lam'):
            cand = [d for d in cand if 'tv' in d]
        rnd.shuffle(cand)
        # versets courts d'abord (moins de 12 s) : le décodage d'un verset long coûte cher
        duree_v = {}
        for e in C:
            if 'tn' in e and 'fs' in e:
                duree_v[(e['s'], e['a'])] = max(duree_v.get((e['s'], e['a']), 0), e['tn'] * e['fs'])
        cand.sort(key=lambda e: duree_v.get((e['s'], e['a']), 99) > 12)
        vus, choix = set(), []
        for d in cand:
            if (d['s'], d['a']) in vus:
                continue
            vus.add((d['s'], d['a']))
            choix.append(d)
            if len(choix) >= n_fautes:
                break
        for d in choix:
            if (typ, d['s'], d['a'], str(d['oid'])) in deja:
                continue
            x = lire(d['s'], d['a'])
            y = appliquer(typ, x, d, B, rnd, lire)
            if y is None:
                continue
            lp = dec(y)
            r = M.mesurer_verset(Q[(d['s'], d['a'])], lp, len(y), y, regles={regle}, seulement=d['oid'])
            if not r:
                continue
            r = r[0]
            r.update({'faute': typ, 'rec': voix, 's': d['s'], 'a': d['a'], 'type_madd': d.get('type')})
            g.write(json.dumps(r, ensure_ascii=False) + '\n')
            g.flush()
            nf += 1
    g.close()
    vus_l = set()
    with gzip.open(ff + '.tmp', 'wt', encoding='utf-8') as h:
        partiel = []
        for l in open(fp, encoding='utf-8'):
            try:
                partiel.append(json.loads(l))
            except ValueError:
                break
        for d in deja_gz + partiel:
            k = (d['faute'], d['s'], d['a'], str(d['oid']))
            if k not in vus_l:
                vus_l.add(k)
                h.write(json.dumps(d, ensure_ascii=False) + '\n')
    os.replace(ff + '.tmp', ff)
    os.remove(fp)
    print(f'{voix} fautes : {nf} nouvelles, {time.time()-t_dep:.0f} s', flush=True)


if __name__ == '__main__':
    main()
