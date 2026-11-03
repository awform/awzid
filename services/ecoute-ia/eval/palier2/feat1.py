"""Levier 1 (treillis CTC) : événements « sub » (mot attendu non retrouvé) avec leur score de vraisemblance.
usage : feat1.py <banc-dir> <lect.json> <sortie.json> [ids.json]
Un événement par (séance, lecture, mot en sub) : j, a, b, trames, voix, llr (forcé - libre), reconnus avant / après, marge ok, dans la vérité."""
import json, os, sys
from multiprocessing import Pool
import numpy as np
sys.path[:0] = ['/code', '/code/eval']
import contraint as C
import detecteur as D

B, LECT, OUT = sys.argv[1:4]
IDS = set(json.load(open(f'{B}/{sys.argv[4]}'))) if len(sys.argv) > 4 else None
R = dict(C.REGLAGES)
R.update(json.loads(os.environ.get('R', '{}')))
SP = None


def init():
    global SP
    SP = D.tokenizer()


def forcé(E, tk, a, b):
    """meilleur log-vraisemblance CTC d'émettre exactement les jetons tk dans les trames a..b (incluses)."""
    if b < a:
        return -1e9
    lab = [E.shape[1] - 1]
    for t in tk:
        lab += [t, E.shape[1] - 1]
    S = len(lab)
    Em = E[a:b + 1][:, lab].astype(np.float64)
    T = Em.shape[0]
    V = np.full(S, -1e9)
    V[0] = Em[0, 0]
    if S > 1:
        V[1] = Em[0, 1]
    ok2 = np.array([s >= 2 and lab[s] != lab[s - 2] and lab[s] != lab[-1] for s in range(S)])
    for t in range(1, T):
        p1 = np.concatenate(([-1e9], V[:-1]))
        p2 = np.concatenate(([-1e9, -1e9], V[:-2]))
        p2 = np.where(ok2, p2, -1e9)
        V = np.maximum(V, np.maximum(p1, p2)) + Em[t]
    return float(max(V[-1], V[-2] if S > 1 else -1e9))


def une(args):
    sid, e, reads = args
    f = f'{B}/topk/{sid}.npz'
    blanc = SP.get_piece_size()
    cls = C.classes(SP)
    jetons = [C.variantes(SP, w, int(R['nvar']), cls) for w in e['mots']]
    g = C.Graphe(jetons, e['va'], blanc, e.get('fac'))
    z = np.load(f)
    ids, lp, dec, lec = z['ids'].astype(np.int64), z['lp'].astype(np.float32), z['decalage'], z['lecture']
    longs = (ids[:, :, 0] >= 0).sum(1)
    ver = e['verite']
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
        libre = E.max(1)
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
                res = {'s': sid, 'n': n, 'j': j, 'a': a, 'b': b, 'nv': nv, 'avant': rec(0, a), 'apres': rec(b + 1, L),
                       'marge': bool(b <= t_fin - int(round(R['marge'] / C.FRAME))), 'type': e['type'],
                       'vrai': bool(ver and ver.get('i') is not None and ver['i'] <= j <= ver['fin'] and e['type'] in ('oubli', 'remplacement')),
                       'vtype': ver['type'] if ver else None, 't': t_lec}
                for pad in (0, 2, 4):
                    lo, hi = max(0, a - pad), min(L - 1, b + pad)
                    best = max((forcé(E, tk, lo, hi) for tk in jetons[j]), default=-1e9)
                    res[f'llr{pad}'] = round(best - float(libre[lo:hi + 1].sum()), 2)
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
