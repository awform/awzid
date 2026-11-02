"""
DÉCODAGE CONTRAINT PAR LE TEXTE ATTENDU (chantier « Tarteel titan », phase 3).

Sur les probabilités de la tête CTC d'une lecture (fenêtre glissante), on cherche le meilleur chemin (Viterbi) dans un graphe
construit avec le texte ATTENDU de la portion :
  - les mots attendus, chacun en jetons du modèle (topologie CTC ; plusieurs découpages en jetons par mot, car le modèle
    n'écrit pas toujours un mot avec le découpage canonique) ;
  - pour chaque mot, une « substitution » (mot mal lu ou écrit autrement que le modèle ne l'écrit : bouche-trou) ;
  - entre deux mots, un chemin « HORS TEXTE » (mot ajouté) : bouche-trou payé à l'entrée et par trame de voix ;
  - des retours en arrière (reprise, retour au verset précédent, mot répété) : récitation normale, peu chers ;
  - des sauts de verset(s) entiers (1 ou 2 versets) et, en option, l'oubli d'un seul mot ;
  - un début et une fin libres (la fenêtre coupe la récitation n'importe où).
Les écarts sont lus sur le chemin : un passage « hors texte » d'au moins `nbmin` trames de voix entre deux mots reconnus
= mot AJOUTÉ ; un saut de verset(s) suivi de mots reconnus = verset SAUTÉ.

Le texte coranique (Tanzil) est converti EN MÉMOIRE vers l'écriture du modèle (`norm`), pour le calcul seulement ; il n'est ni
affiché ni écrit. Aucune synthèse, aucune voix.
"""
import re

import numpy as np

NEG = -1e9
FRAME = 0.08
MARQUES = re.compile('[ۖ-ۭؐ-ؚـ࣓-ࣿ]')
LETTRE = re.compile('[ء-ي]')
HARAKAT = re.compile('[ً-ْٰ]')

#: réglés sur le banc 2 (190 séances, 11 voix) le 01/11/2026 ; vérifiés sur des voix jamais vues (banc 3)
REGLAGES = {
    'ins': -12.0,    # entrée d'un passage hors texte (mot ajouté)
    'sub': -6.0,     # mot attendu lu « autrement » (bouche-trou à sa place)
    'back': -3.0,    # retour en arrière (reprise, retour, mot répété)
    'skip': -9.0,    # saut d'un verset entier (ou de deux)
    'dele': -14.0,   # oubli d'un seul mot (None : arc absent)
    'beta': -1.0,    # coût par trame de voix d'un bouche-trou (hors texte, substitution)
    'bsub': -2.0,    # coût par trame de voix d'une substitution (un mot mal lu est court)
    'beta0': -2.0,   # coût par trame de voix du début / de la fin libres
    'plancher': -2.0,  # log-prob d'un jeton absent du top-k : (k-ième) + plancher
    'squel': 1,      # jetons comparés par squelette (voyelles brèves ignorées)
    'nvar': 6,       # découpages en jetons essayés par mot
    'nbmin': 4,      # trames de voix minimales d'un mot ajouté
    'apres': 2,      # mots reconnus exigés après l'écart (on attend la suite : jamais sur les derniers mots entendus)
    'avant': 1,      # mots reconnus exigés avant l'écart
    'marge': 1.0,    # l'écart doit finir au moins `marge` s avant la fin de la fenêtre
    'oubli': 0,      # signaler aussi les oublis d'un mot (arc `dele`)
    'trou': 0,       # > 0 : voix (s) sans lettre lue entre deux mots consécutifs = mot ajouté non écrit par le modèle
}


def norm(w):
    """Mot Tanzil -> écriture du jeu de jetons du modèle (en mémoire, calcul seulement)."""
    w = w.replace('ٱ', 'ا').replace('ٰ', 'ا').replace('ٓ', '').replace('ۡ', 'ْ')
    return MARQUES.sub('', w)


_CLASSES = {}


def classes(sp):
    """Classe de chaque jeton (squelette sans voyelles brèves) : deux jetons qui ne diffèrent que par les voyelles comptent
    pour un (le texte Tanzil et l'écriture du modèle diffèrent souvent par les voyelles : tanwīn, sukūn, waqf)."""
    k = id(sp)
    if k not in _CLASSES:
        V = sp.get_piece_size()
        sq = [HARAKAT.sub('', sp.id_to_piece(i)).replace('▁', '') for i in range(V)]
        codes = {s: n for n, s in enumerate(sorted(set(sq) - {''}))}
        nb = len(codes)  # classe du blanc ; un jeton fait de voyelles seules compte comme un blanc (rien de lu)
        _CLASSES[k] = np.array([codes.get(s, nb) for s in sq] + [nb], dtype=np.int64)
    return _CLASSES[k]


def variantes(sp, w, n, cls=None):
    """Découpages en jetons d'un mot Tanzil (le canonique d'abord), distincts par squelette si `cls`."""
    x = norm(w)
    if not LETTRE.search(x):
        return []
    out, vus = [], set()
    nu = HARAKAT.sub('', x)  # le modèle écrit parfois sans voyelles (selon la voix)
    cands = [sp.encode(x), sp.encode(nu)]
    if n > 1:
        a, b = list(sp.nbest_encode_as_ids(x, n)), list(sp.nbest_encode_as_ids(nu, n))
        cands += [z for p in zip(a, b) for z in p] + a[len(b):] + b[len(a):]
    for c in cands:
        k = tuple(cls[c]) if cls is not None else tuple(c)
        if k in vus or not c:
            continue
        vus.add(k)
        out.append(list(c))
        if len(out) >= n:
            break
    return out


class Graphe:
    """Graphe d'une portion. `jetons[j]` : liste de découpages (listes d'identifiants) du mot j ([] : mot sans lettre).
    Les découpages d'un mot sont des « variantes » contiguës."""

    def __init__(self, jetons, versets, blanc, facultatifs=None):
        self.W = W = len(jetons)
        self.blanc = blanc
        lab, off, last, pw_word = [], [], [], []
        for j, vs in enumerate(jetons):
            for tk in (vs or [[blanc]]):  # mot sans jeton : un seul blanc
                off.append(len(lab))
                for t in tk:
                    lab += [blanc, t]
                last.append(len(lab) - 1)
                pw_word.append(j)
        self.lab = np.array(lab, dtype=np.int64)
        self.S = S = len(lab)
        self.off = np.array(off)
        self.last = np.array(last)
        self.pw_word = np.array(pw_word)
        self.P = len(off)
        self.debut_pw = np.searchsorted(self.pw_word, np.arange(W))  # première variante de chaque mot
        wo = np.zeros(S, dtype=np.int64)
        for p in range(self.P):
            wo[self.off[p]: self.last[p] + 1] = p
        self.pw_of = wo
        debut = np.zeros(S, dtype=bool)
        debut[self.off] = True
        self.m1_ok = ~debut
        m2 = np.zeros(S, dtype=bool)
        for s in range(S):
            if s % 2 == 1 and s - 2 >= self.off[wo[s]] and lab[s] != lab[s - 2]:
                m2[s] = True
        self.m2_ok = m2
        bornes = []  # (premier, dernier) mot de chaque verset
        for j, v in enumerate(versets):
            if not bornes or versets[j - 1] != v:
                bornes.append([j, j])
            else:
                bornes[-1][1] = j
        self.bornes = bornes
        sk = []
        for k in range(len(bornes)):
            for n in (1, 2):
                if k + n + 1 < len(bornes):
                    sk.append((bornes[k][1], bornes[k + n + 1][0]))
        self.sauts = sk
        self.fac = np.array(facultatifs or [0] * W, dtype=bool)


def emissions(ids, lp, blanc, V, R, cls=None):
    """ids/lp [T,K] (top-k CTC) -> E [T,V+1] (log-prob, plancher pour les jetons absents), f (bouche-trou), f0, voix (bool).
    cls : classes des jetons (R['squel']) : un jeton attendu vaut la somme des probabilités de sa classe."""
    T, K = ids.shape
    plancher = lp[:, K - 1] + R['plancher']
    ok = ids >= 0
    if cls is not None and R.get('squel'):
        nc = int(cls.max()) + 1
        Ec = np.full((T, nc), -np.inf, dtype=np.float64)
        for k in range(K):
            r = np.nonzero(ok[:, k])[0]
            c = cls[ids[r, k]]
            Ec[r, c] = np.logaddexp(Ec[r, c], lp[r, k])
        Ec = np.maximum(Ec, plancher[:, None])
        E = Ec[:, cls].astype(np.float32)
    else:
        rows = np.repeat(np.arange(T)[:, None], K, axis=1)
        E = np.repeat(plancher[:, None], V + 1, axis=1).astype(np.float32)
        E[rows[ok], ids[ok]] = lp[ok]
    eb = E[:, blanc]
    lettre = (ids != blanc) & ok
    if cls is not None and R.get('squel'):
        lettre &= cls[np.where(ok, ids, blanc)] != cls[blanc]
    nb = np.where(lettre, lp, -np.inf).max(1)
    f = np.stack([np.maximum(eb, nb + R['beta']), np.maximum(eb, nb + R.get('bsub', R['beta']))])
    f0 = np.maximum(eb, nb + R['beta0'])
    voix = nb + R['beta'] > eb
    return E, f.astype(np.float32), f0.astype(np.float32), voix


SRC_NORM, SRC_GAP, SRC_BACK, SRC_SKIP, SRC_DEL, SRC_START = range(6)


def viterbi(g, E, f, f0, R):
    T = E.shape[0]
    W, S, P = g.W, g.S, g.P
    Ew = E[:, g.lab]
    V = np.full(S, NEG, dtype=np.float64)
    Sub = np.full(W, NEG)
    G = np.full(W, NEG)
    St = float(f0[0])
    En = NEG
    bp_in = np.zeros((T, S), dtype=np.int8)
    a_src = np.zeros((T, W), dtype=np.int8)
    a_from = np.zeros((T, W), dtype=np.int16)
    sub_in = np.zeros((T, W), dtype=bool)
    gap_in = np.zeros((T, W), dtype=bool)
    end_sub = np.zeros((T, W), dtype=bool)
    end_pw = np.zeros((T, W), dtype=np.int32)  # variante qui finit le mot
    en_from = np.full(T, -1, dtype=np.int16)
    for p in range(P):
        for s in (g.off[p], g.off[p] + 1):
            if s <= g.last[p]:
                V[s] = Ew[0, s]
                bp_in[0, s] = 3
    a_src[0, :] = SRC_START
    fg, fs = f
    Sub[:] = R['sub'] + fs[0]
    sub_in[0, :] = True
    idx = np.arange(W)
    sauts = np.array(g.sauts, dtype=np.int64).reshape(-1, 2)
    ent0 = g.off
    ent1 = g.off + 1
    ok1 = ent1 <= g.last

    def fins(V, Sub, t):
        lv = V[g.last]
        endw = np.maximum.reduceat(lv, g.debut_pw)
        # variante gagnante : première variante du mot qui atteint le max
        eg = lv == endw[g.pw_word]
        cand = np.where(eg, np.arange(P), P)
        best = np.minimum.reduceat(cand, g.debut_pw)
        es = Sub > endw
        end_sub[t] = es
        end_pw[t] = best
        return np.where(es, Sub, endw)

    for t in range(1, T):
        endv = fins(V, Sub, t - 1)
        A = np.full(W, St)
        src = np.full(W, SRC_START, dtype=np.int8)
        frm = np.full(W, -1, dtype=np.int16)
        c = np.concatenate(([NEG], endv[:-1]))
        m = c > A
        A = np.where(m, c, A); src[m] = SRC_NORM; frm[m] = idx[m] - 1
        c = np.concatenate(([NEG], G[:-1]))
        m = c > A
        A = np.where(m, c, A); src[m] = SRC_GAP; frm[m] = idx[m] - 1
        rev = endv[::-1]
        cm = np.maximum.accumulate(rev)
        sm = cm[::-1]
        acc = np.maximum.accumulate(np.where(rev == cm, np.arange(W), 0))
        am = ((W - 1) - acc)[::-1]
        c = sm + R['back']
        m = c > A
        A = np.where(m, c, A); src[m] = SRC_BACK; frm[m] = am[m]
        if len(sauts):
            cv = endv[sauts[:, 0]] + R['skip']
            for (a_, b_), x in zip(sauts, cv):
                if x > A[b_]:
                    A[b_] = x; src[b_] = SRC_SKIP; frm[b_] = a_
        if R.get('dele') is not None and W > 2:
            c = np.concatenate(([NEG, NEG], endv[:-2])) + R['dele']
            m = c > A
            A = np.where(m, c, A); src[m] = SRC_DEL; frm[m] = idx[m] - 2
        a_src[t] = src
        a_from[t] = frm
        p1 = np.concatenate(([NEG], V[:-1]))
        p1 = np.where(g.m1_ok, p1, NEG)
        p2 = np.concatenate(([NEG, NEG], V[:-2]))
        p2 = np.where(g.m2_ok, p2, NEG)
        best = V.copy()
        bp = np.zeros(S, dtype=np.int8)
        m = p1 > best; best = np.where(m, p1, best); bp[m] = 1
        m = p2 > best; best = np.where(m, p2, best); bp[m] = 2
        Ap = A[g.pw_word]
        m = Ap > best[ent0]
        best[ent0[m]] = Ap[m]; bp[ent0[m]] = 3
        e1, a1 = ent1[ok1], Ap[ok1]
        m = a1 > best[e1]
        best[e1[m]] = a1[m]; bp[e1[m]] = 3
        bp_in[t] = bp
        Vn = best + Ew[t]
        cs = A + R['sub']
        m = cs > Sub
        sub_in[t] = m
        Subn = np.where(m, cs, Sub) + fs[t]
        cg = endv + R['ins']
        m = cg > G
        gap_in[t] = m
        Gn = np.where(m, cg, G) + fg[t]
        jm = int(np.argmax(endv))
        if endv[jm] > En:
            En = endv[jm]; en_from[t] = jm
        En = En + f0[t]
        St = St + f0[t]
        V, Sub, G = Vn, Subn, Gn
    endv = fins(V, Sub, T - 1)
    jm = int(np.argmax(endv))
    if En >= endv[jm]:
        node = ('en',)
    else:
        node = ('sub', jm) if end_sub[T - 1, jm] else ('w', int(g.last[end_pw[T - 1, jm]]))
    return trace(g, node, T, bp_in, a_src, a_from, sub_in, gap_in, end_sub, end_pw, en_from)


def trace(g, node, T, bp_in, a_src, a_from, sub_in, gap_in, end_sub, end_pw, en_from):
    """Chemin : par trame ('w', j) | ('sub', j) | ('gap', j) | ('st',) | ('en',) ; et entrées de mots (trame, mot, source, depuis)."""
    chemin = [None] * T
    entrees = []

    def fin_de(j, t):
        return ('sub', j) if end_sub[t, j] else ('w', int(g.last[end_pw[t, j]]))

    def depuis(src, frm, t):
        if src == SRC_START or t == 0:
            return ('st',)
        if src == SRC_GAP:
            return ('gap', frm)
        return fin_de(frm, t - 1)

    for t in range(T - 1, -1, -1):
        k = node[0]
        if k == 'w':
            s = node[1]
            j = int(g.pw_word[g.pw_of[s]])
            chemin[t] = ('w', j)
            b = int(bp_in[t, s])
            if b == 3:
                src, frm = int(a_src[t, j]), int(a_from[t, j])
                entrees.append((t, j, src, frm))
                node = depuis(src, frm, t)
            else:
                node = ('w', s - b)
        elif k == 'sub':
            j = node[1]
            chemin[t] = ('sub', j)
            if sub_in[t, j]:
                src, frm = int(a_src[t, j]), int(a_from[t, j])
                entrees.append((t, j, src, frm))
                node = depuis(src, frm, t)
        elif k == 'gap':
            j = node[1]
            chemin[t] = ('gap', j)
            if gap_in[t, j]:
                node = fin_de(j, t - 1)
        elif k == 'en':
            chemin[t] = ('en',)
            if en_from[t] >= 0:
                node = fin_de(int(en_from[t]), t - 1)
        else:
            chemin[t] = ('st',)
    entrees.reverse()
    return chemin, entrees


def ecarts(g, chemin, entrees, voix, R, t_fin, lettres=None, vad=None, dec=0.0):
    """Écarts sûrs lus sur le chemin. t_fin : dernière trame d'audio réel de la fenêtre. Renvoie [(type, i, fin, trame)]."""
    T = len(chemin)
    marge = int(round(R['marge'] / FRAME))
    lu_t = [(t, c[1]) for t, c in enumerate(chemin) if c[0] == 'w']

    def reconnus(t0, t1):
        return len({j for t, j in lu_t if t0 <= t < t1})

    out = []
    t = 0
    while t < T:
        if chemin[t][0] == 'gap':
            j = chemin[t][1]
            t0 = t
            while t < T and chemin[t] == ('gap', j):
                t += 1
            nb = int(voix[t0:t].sum())
            if (nb >= R['nbmin'] and t - 1 <= t_fin - marge and reconnus(t, T) >= R['apres']
                    and reconnus(0, t0) >= R['avant']):
                out.append(('ajoute', j, j, t))
        else:
            t += 1
    if R.get('trou') and lettres is not None and vad:
        # voix sans lettre lue entre deux mots consécutifs reconnus : mot ajouté que le modèle n'a pas écrit
        seq = []
        for t, c in enumerate(chemin):
            if seq and seq[-1][0] == c:
                seq[-1][2] = t
            else:
                seq.append([c, t, t])
        for (c1, a1, b1), (c2, a2, b2) in zip(seq, seq[1:]):
            if c1[0] != 'w' or c2[0] != 'w' or c2[1] != c1[1] + 1:
                continue
            l1 = [t for t in range(a1, b1 + 1) if lettres[t]]
            l2 = [t for t in range(a2, b2 + 1) if lettres[t]]
            if not l1 or not l2:
                continue
            x0, x1 = dec + (l1[-1] + 1) * FRAME, dec + l2[0] * FRAME
            v = sum(max(0.0, min(x1, b) - max(x0, a)) for a, b in vad)
            if (v >= R['trou'] and l2[0] <= t_fin - marge and reconnus(a2, T) >= R['apres']
                    and reconnus(0, a1 + 1) >= R['avant']):
                out.append(('ajoute', c1[1], c1[1], l2[0]))
    for (t, j, src, frm) in entrees:
        if t > t_fin - marge or reconnus(t, T) < R['apres'] or reconnus(0, t) < R['avant']:
            continue
        if src == SRC_SKIP:
            out.append(('saute', frm + 1, j - 1, t))
        if src == SRC_DEL and R.get('oubli') and not g.fac[frm + 1]:
            out.append(('oublie', frm + 1, frm + 1, t))
    return out
