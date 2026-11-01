"""
GOP (« goodness of pronunciation » au niveau du MOT) par alignement forcé CTC — étude du chantier « Tarteel titan » phase 2.
Question : la probabilité que le MOT ATTENDU ait été dit, lue dans la tête CTC du modèle, sépare-t-elle « mal lu par la machine »
de « pas dit » (oublié, remplacé) mieux que la ressemblance des mots entendus ? Le texte attendu est normalisé EN MÉMOIRE pour le
jeu de jetons du modèle (voyelles standard), pour le calcul seulement ; rien n'est écrit ni modifié.

  python gop.py <banc-dir> <export.json>   ->  <banc-dir>/gop.json

`export.json` (écrit par banc.mjs avec EXPORT=…) donne, par séance, les mots attendus (texte Tanzil) et l'instant [début, fin] de
chaque mot retrouvé dans la lecture de toute la séance (null : non entendu). Entrées : topk/<séance>.npz (banc.py, TOPK=1).
Sortie : par séance et par mot attendu : [moyenne, minimum] sur les jetons du mot du meilleur log-prob du jeton sur ses trames
alignées (0 = très sûr ; -14 = absent des 8 meilleurs jetons de toutes les trames).
"""
import json, os, re, sys, tarfile, tempfile
import numpy as np

B, EXPORT = sys.argv[1], sys.argv[2]
MODELE = os.environ.get('ECOUTE_MODELE', '/model/stt_ar_fastconformer_hybrid_large_pcd_v1.0.nemo')
FRAME = 0.08
PAD = 0.5
PLANCHER = -14.0
NEG = -1e9
MARQUES = re.compile('[ۖ-ۭؐ-ؚـ࣓-ࣿ]')
LETTRE = re.compile('[ء-ي]')


def charger_tokenizer():
    import sentencepiece as spm
    d = tempfile.mkdtemp()
    with tarfile.open(MODELE) as t:
        nom = [n for n in t.getnames() if n.endswith('tokenizer.model')][0]
        t.extract(nom, d)
    sp = spm.SentencePieceProcessor()
    sp.load(os.path.join(d, nom))
    return sp


def norm(w):
    """Texte Tanzil d'un mot -> écriture du modèle (en mémoire, pour le calcul seulement)."""
    w = w.replace('ٱ', 'ا').replace('ٰ', 'ا').replace('ٓ', '').replace('ۡ', 'ْ')
    return MARQUES.sub('', w)


def aligner(ids, val, jetons, blanc):
    """Viterbi CTC, début et fin libres. ids/val : [T,K]. Renvoie, par jeton, le meilleur log-prob sur ses trames."""
    T, K = ids.shape
    n = len(jetons)
    S = 2 * n + 1
    lab = np.full(S, blanc, dtype=np.int32)
    lab[1::2] = jetons
    if CODE is None:
        E = np.full((T, S), PLANCHER, dtype=np.float32)
        for k in range(K):
            eg = ids[:, k][:, None] == lab[None, :]
            E = np.where(eg, np.maximum(E, val[:, k][:, None]), E)
        labc = lab
    else:  # SKEL=1 : on compare les SQUELETTES des jetons (voyelles ignorées) et on somme les probabilités
        cid = CODE[np.where(ids < 0, len(CODE) - 1, ids)]
        labc = CODE[lab]
        Es = np.full((T, S), -np.inf, dtype=np.float32)
        for k in range(K):
            eg = cid[:, k][:, None] == labc[None, :]
            Es = np.logaddexp(Es, np.where(eg, val[:, k][:, None], -np.inf))
        E = np.maximum(Es, PLANCHER)
    saut = np.zeros(S, dtype=bool)
    saut[2:] = (lab[2:] != blanc) & (labc[2:] != labc[:-2])
    V = np.full((T, S), NEG, dtype=np.float32)
    back = np.zeros((T, S), dtype=np.int8)
    V[0, 0] = E[0, 0]
    V[0, 1] = E[0, 1]
    for t in range(1, T):
        p = V[t - 1]
        c1 = np.concatenate(([NEG], p[:-1]))
        c2 = np.concatenate(([NEG, NEG], p[:-2]))
        c2 = np.where(saut, c2, NEG)
        cand = np.stack([p, c1, c2])
        b = cand.argmax(0)
        V[t] = cand[b, np.arange(S)] + E[t]
        back[t] = b
    s = S - 1 if V[T - 1, S - 1] >= V[T - 1, S - 2] else S - 2
    chemin = np.zeros(T, dtype=np.int32)
    for t in range(T - 1, -1, -1):
        chemin[t] = s
        s -= int(back[t, s])
    meil = np.full(n, PLANCHER, dtype=np.float32)
    for t in range(T):
        s = chemin[t]
        if s % 2 == 1:
            meil[s // 2] = max(meil[s // 2], E[t, s])
    return meil


CODE = None
HARAKAT = re.compile('[ً-ْٰ]')


def main():
    global CODE
    sp = charger_tokenizer()
    blanc = sp.get_piece_size()
    if os.environ.get('SKEL') == '1':
        squel = [HARAKAT.sub('', sp.id_to_piece(i)) for i in range(blanc)]
        codes = {s: n for n, s in enumerate(sorted(set(squel)))}
        CODE = np.array([codes[s] for s in squel] + [-2, -3], dtype=np.int32)  # blanc = -2, absent (-1) = -3
    exp = json.load(open(EXPORT, encoding='utf-8'))
    out = {}
    for sid, e in exp.items():
        f = f'{B}/topk/{sid}.npz'
        if not os.path.exists(f):
            continue
        z = np.load(f)
        ids, lp, dec = z['ids'], z['lp'].astype(np.float32), z['decalage']
        long = (ids[:, :, 0] >= 0).sum(1)  # trames réelles de chaque lecture
        debut_audio = dec + PAD
        fin_audio = dec + long * FRAME - PAD
        mots, inst = e['mots'], e['inst']
        res = {}
        for i, w in enumerate(mots):
            if not LETTRE.search(norm(w)):
                continue
            if inst[i]:
                a, b = inst[i]
            else:  # milieu du trou entre les voisins entendus
                av = next((inst[x][1] for x in range(i - 1, -1, -1) if inst[x]), None)
                ap = next((inst[x][0] for x in range(i + 1, len(mots)) if inst[x]), None)
                if av is None or ap is None:
                    continue
                a = b = (av + ap) / 2
            bons = [r for r in range(len(dec)) if (debut_audio[r] <= 0.01 or a - debut_audio[r] >= 1.5) and fin_audio[r] - b >= 1.5]
            if not bons:
                continue
            r = bons[0]
            lo, hi = max(0, i - 4), min(len(mots), i + 5)
            mi = [m for m in range(lo, hi) if LETTRE.search(norm(mots[m]))]
            idj, deb = [], []
            for m in mi:  # chaque mot est codé seul : ses bornes sont connues
                deb.append(len(idj))
                idj += sp.encode(HARAKAT.sub('', norm(mots[m])) if CODE is not None else norm(mots[m]))
            meil = aligner(ids[r, : long[r]].astype(np.int32), lp[r, : long[r]], np.array(idj, dtype=np.int32), blanc)
            j = mi.index(i)
            k0, k1 = deb[j], (deb[j + 1] if j + 1 < len(deb) else len(idj))
            sc = meil[k0:k1]
            res[i] = [float(sc.mean()), float(sc.min())]
        out[sid] = res
        json.dump(out, open(f'{B}/gop.json', 'w'))
    tous = np.array([v for r in out.values() for v in r.values()], dtype=np.float32)
    if len(tous):
        print(len(out), 'séances,', len(tous), 'mots notés ; moyenne : percentiles 1/5/25/50 =',
              np.percentile(tous[:, 0], [1, 5, 25, 50]).round(2), '; minimum : ', np.percentile(tous[:, 1], [1, 5, 25, 50]).round(2))


if __name__ == '__main__':
    main()
