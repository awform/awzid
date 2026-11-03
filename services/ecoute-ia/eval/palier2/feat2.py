"""Levier 1 bis : un mot attendu « non retrouvé » (sub) est-il mieux expliqué par un AUTRE mot du Coran ?
usage : feat2.py <banc-dir> <lect.json> <sortie.json> <ids.json|-> ; sortie : événements (sub avec nv>=2) + alt = score(mot attendu) - score(meilleur autre mot)"""
import json, os, sys
from multiprocessing import Pool
import numpy as np
sys.path[:0] = ['/code', '/code/eval']
import contraint as C
import detecteur as D

B, LECT, OUT, IDSF = sys.argv[1:5]
IDS = set(json.load(open(f'{B}/{IDSF}'))) if IDSF != '-' else None
R = dict(C.REGLAGES)
SP = None
LEX = None
TSV = '/awform-content/coran/tanzil-uthmani.tsv'
MMAX = 14


def init():
    global SP, LEX
    SP = D.tokenizer()
    ws = {}
    for l in open(TSV, encoding='utf-8'):
        l = l.rstrip('\n').replace('﻿', '')
        t = l.find('\t')
        if t <= 0:
            continue
        for w in l[t + 1:].split():
            x = C.norm(w)
            if C.LETTRE.search(x) and x not in ws:
                ws[x] = SP.encode(x)
    toks = [(w, t) for w, t in ws.items() if 0 < len(t) <= MMAX]
    N = len(toks)
    lab = np.full((N, 2 * MMAX + 1), -1, dtype=np.int64)
    blanc = SP.get_piece_size()
    for i, (w, t) in enumerate(toks):
        row = [blanc]
        for k in t:
            row += [k, blanc]
        lab[i, :len(row)] = row
    LEX = (lab, [w for w, _ in toks], np.array([len(t) for _, t in toks]))


def batch(E, a, b, lab, ln):
    """meilleur log-vraisemblance CTC de chaque mot du lexique dans les trames a..b."""
    blanc = E.shape[1] - 1
    N, S = lab.shape
    valid = lab >= 0
    labc = np.where(valid, lab, blanc)
    # saut interdit si même jeton qu'à s-2 (ou blanc)
    ok2 = np.zeros((N, S), dtype=bool)
    ok2[:, 2:] = (labc[:, 2:] != labc[:, :-2]) & (labc[:, 2:] != blanc)
    V = np.full((N, S), -1e9)
    Em = E[a:b + 1]
    V[:, 0] = Em[0, labc[:, 0]]
    V[:, 1] = np.where(valid[:, 1], Em[0, labc[:, 1]], -1e9)
    for t in range(1, Em.shape[0]):
        p1 = np.concatenate((np.full((N, 1), -1e9), V[:, :-1]), 1)
        p2 = np.concatenate((np.full((N, 2), -1e9), V[:, :-2]), 1)
        p2 = np.where(ok2, p2, -1e9)
        V = np.maximum(V, np.maximum(p1, p2)) + Em[t][labc]
        V = np.where(valid, V, -1e9)
    last = 2 * ln
    r = np.arange(N)
    return np.maximum(V[r, last], V[r, last - 1])


def forcé(E, tk, a, b):
    lab = np.full((1, 2 * MMAX + 1), -1, dtype=np.int64)
    row = [E.shape[1] - 1]
    for t in tk[:MMAX]:
        row += [t, E.shape[1] - 1]
    lab[0, :len(row)] = row
    return float(batch(E, a, b, lab, np.array([min(len(tk), MMAX)]))[0])


def une(args):
    sid, e, reads = args
    blanc = SP.get_piece_size()
    cls = C.classes(SP)
    jetons = [C.variantes(SP, w, int(R['nvar']), cls) for w in e['mots']]
    g = C.Graphe(jetons, e['va'], blanc, e.get('fac'))
    z = np.load(f'{B}/topk/{sid}.npz')
    ids, lp, dec, lec = z['ids'].astype(np.int64), z['lp'].astype(np.float32), z['decalage'], z['lecture']
    longs = (ids[:, :, 0] >= 0).sum(1)
    ver = e['verite']
    lab, mots, ln = LEX
    nx = [C.norm(w) for w in e['mots']]
    out = []
    for n in range(len(dec)):
        L = int(longs[n])
        if L < 5:
            continue
        t_lec = reads[int(lec[n])]['t']
        E, fb, f0, voix = C.emissions(ids[n, :L], lp[n, :L], blanc, blanc, R, cls)
        chemin, entrees = C.viterbi(g, E, fb, f0, R)
        t_fin = min(int((t_lec - dec[n]) / C.FRAME), L - 1)
        lu = [(t, c[1]) for t, c in enumerate(chemin) if c[0] == 'w']

        def rec(t0, t1):
            return len({j for t, j in lu if t0 <= t < t1})
        t = 0
        while t < L:
            c = chemin[t]
            if c[0] == 'sub':
                j = c[1]
                a = t
                while t < L and chemin[t] == ('sub', j):
                    t += 1
                b = t - 1
                nv = int(voix[a:b + 1].sum())
                if nv < 2:
                    continue
                avant, apres = rec(0, a), rec(b + 1, L)
                if avant < 1 or apres < 2 or b > t_fin - int(round(R['marge'] / C.FRAME)):
                    continue
                res = {'s': sid, 'n': n, 'j': j, 'a': a, 'b': b, 'nv': nv, 'type': e['type'], 't': t_lec,
                       'vrai': bool(ver and ver.get('i') is not None and ver['i'] <= j <= ver['fin'] and e['type'] in ('oubli', 'remplacement'))}
                for pad in (1, 3):
                    lo, hi = max(0, a - pad), min(L - 1, b + pad)
                    sc = batch(E, lo, hi, lab, ln)
                    mine = max((forcé(E, tk, lo, hi) for tk in jetons[j]), default=-1e9)
                    # meilleur AUTRE mot (différent du mot attendu)
                    o = np.argsort(-sc)[:3]
                    alt = next((float(sc[i]) for i in o if mots[i] != nx[j]), float(sc[o[0]]))
                    res[f'mine{pad}'] = round(mine, 2)
                    res[f'alt{pad}'] = round(alt, 2)
                    res[f'd{pad}'] = round(mine - alt, 2)
                out.append(res)
            else:
                t += 1
    return out


if __name__ == '__main__':
    exp = json.load(open(f'{B}/export-t3.json'))
    lect = {L['id']: L['reads'] for L in json.load(open(f'{B}/{LECT}'))}
    tache = [(s, e, lect[s]) for s, e in exp.items() if s in lect and (IDS is None or s in IDS)]
    with Pool(int(os.environ.get('PROC', '3')), initializer=init) as p:
        res = p.map(une, tache, chunksize=1)
    ev = [x for r in res for x in r]
    json.dump(ev, open(f'{B}/{OUT}', 'w'))
    print(len(tache), 'séances', len(ev), 'événements', file=sys.stderr)
