"""Levier 2 (durée anormale -> mot ajouté) : caractéristiques par frontière de mots consécutifs du chemin.
usage : feat3.py <banc-dir> <lect.json> <sortie.json> <ids.json|->"""
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


def init():
    global SP
    SP = D.tokenizer()


def une(args):
    sid, e, reads = args
    blanc = SP.get_piece_size()
    cls = C.classes(SP)
    jetons = [C.variantes(SP, w, int(R['nvar']), cls) for w in e['mots']]
    g = C.Graphe(jetons, e['va'], blanc, e.get('fac'))
    ntok = [min((len(v) for v in vs), default=0) for vs in jetons]
    z = np.load(f'{B}/topk/{sid}.npz')
    ids, lp, dec, lec = z['ids'].astype(np.int64), z['lp'].astype(np.float32), z['decalage'], z['lecture']
    longs = (ids[:, :, 0] >= 0).sum(1)
    ver = e['verite']
    out = []
    for n in range(len(dec)):
        L = int(longs[n])
        if L < 5:
            continue
        rd = reads[int(lec[n])]
        t_lec = rd['t']
        vad = rd.get('voix') or []
        E, fb, f0, voix = C.emissions(ids[n, :L], lp[n, :L], blanc, blanc, R, cls)
        chemin, entrees = C.viterbi(g, E, fb, f0, R)
        t_fin = min(int((t_lec - dec[n]) / C.FRAME), L - 1)
        # runs de mots 'w' : [j, premier, dernier] ; la première / dernière trame « lettre » = voix du chemin
        runs = []
        for t, c in enumerate(chemin):
            if c[0] == 'w':
                if runs and runs[-1][0] == c[1] and runs[-1][2] == t - 1:
                    runs[-1][2] = t
                else:
                    runs.append([c[1], t, t])
        # vitesse : médiane de (trames de voix du mot / jetons)
        dens = []
        for j, a, b in runs:
            if ntok[j] > 0 and b - a >= 1:
                dens.append((b - a + 1) / ntok[j])
        vit = float(np.median(dens)) if dens else 0.0
        for (j1, a1, b1), (j2, a2, b2) in zip(runs, runs[1:]):
            if j2 != j1 + 1 or ntok[j1] == 0:
                continue
            # frontière : entre la dernière trame voisée du mot j1 et la première de j2
            v1 = [t for t in range(a1, b1 + 1) if voix[t]]
            v2 = [t for t in range(a2, b2 + 1) if voix[t]]
            if not v1 or not v2:
                continue
            x0, x1 = dec[n] + (v1[-1] + 1) * C.FRAME, dec[n] + v2[0] * C.FRAME
            x0, x1 = float(x0), float(x1)
            gv = float(sum(max(0.0, min(x1, b) - max(x0, a)) for a, b in vad))
            dj = (v1[-1] - a1 + 1)
            out.append({'s': sid, 'n': n, 'j': j1, 't': t_lec, 'type': e['type'], 'fin_ok': bool(v2[0] <= t_fin - int(round(R['marge'] / C.FRAME))),
                        'gap': round(x1 - x0, 2), 'gv': round(gv, 2), 'ratio': round(dj / (ntok[j1] * vit), 2) if vit else 0, 'dj': dj,
                        'vrai': bool(e['type'] == 'ajout' and ver['i'] - 1 <= j1 <= ver['i'] + 1), 'vit': round(vit, 2)})
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
