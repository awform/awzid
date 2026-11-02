"""
Tests du décodage contraint par le texte attendu (`contraint.py`) sur des probabilités CTC SYNTHÉTIQUES (aucun modèle) :
lecture juste = rien ; mot ajouté = « ajoute » ; verset sauté = « saute » ; reprise et mot répété = rien.
    python -m pytest -q tests/test_contraint.py
"""
import numpy as np

import contraint as C

BLANC = 40
K = 4
# 3 versets : mots (jetons) et verset de chaque mot
MOTS = [[1, 2], [3, 4, 5], [6, 7], [8, 9], [10, 11, 12], [13, 14], [15, 16], [17, 18, 19], [20, 21], [22, 23]]
VERSETS = ['1:1'] * 3 + ['1:2'] * 3 + ['1:3'] * 4
R = dict(C.REGLAGES, squel=0, nvar=1)


def trames(jetons_par_mot, intrus=()):
    """Probabilités top-k : chaque jeton = 1 trame nette + 2 blancs ; 3 blancs entre deux mots. `intrus` : {après le mot n: jetons}."""
    seq = [BLANC] * 6
    for n, tk in enumerate(jetons_par_mot):
        for t in tk:
            seq += [t, BLANC, BLANC]
        seq += [BLANC] * 3
        for t in dict(intrus).get(n, []):
            seq += [t, t, BLANC]
    seq += [BLANC] * 6
    ids = np.zeros((len(seq), K), dtype=np.int64)
    lp = np.zeros((len(seq), K), dtype=np.float32)
    for f, t in enumerate(seq):
        autres = [x for x in (BLANC, 30, 31, 32) if x != t][: K - 1]
        ids[f] = [t] + autres
        lp[f] = [-0.03, -4.0, -8.0, -9.0] if t != BLANC else [-0.02, -5.0, -8.0, -9.0]
    return ids, lp


def decoder(ids, lp):
    g = C.Graphe([[tk] for tk in MOTS], VERSETS, BLANC)
    E, f, f0, voix = C.emissions(ids, lp, BLANC, BLANC, R)
    chemin, entrees = C.viterbi(g, E, f, f0, R)
    return C.ecarts(g, chemin, entrees, voix, R, len(chemin) - 1)


def types(ec):
    return sorted((t, i, fin) for t, i, fin, _ in ec)


def test_lecture_juste_rien():
    assert decoder(*trames(MOTS)) == []


def test_mot_ajoute_entre_deux_mots():
    ec = decoder(*trames(MOTS, intrus={4: [33, 34, 35]}))
    assert types(ec) == [('ajoute', 4, 4)]


def test_verset_saute():
    lus = MOTS[:3] + MOTS[6:]  # le verset 1:2 (mots 3 à 5) est sauté
    assert types(decoder(*trames(lus))) == [('saute', 3, 5)]


def test_reprise_et_mot_repete_rien():
    reprise = MOTS[:5] + MOTS[2:]  # retour au mot 2 après le mot 4
    assert decoder(*trames(reprise)) == []
    repete = MOTS[:4] + [MOTS[3]] + MOTS[4:]
    assert decoder(*trames(repete)) == []


def test_jamais_sur_les_derniers_mots():
    """Un ajout juste avant la fin de ce qui est entendu n'est pas encore signalé (on attend la suite)."""
    ec = decoder(*trames(MOTS[:9], intrus={8: [33, 34, 35]}))
    assert ec == []


def test_classes_voyelles_ignorees():
    class SP:  # jeu de jetons minuscule : deux jetons qui ne diffèrent que par la voyelle, un jeton de voyelle seule
        pieces = ['▁كَتَبَ', '▁كتب', 'َ', 'ر']

        def get_piece_size(self):
            return len(self.pieces)

        def id_to_piece(self, i):
            return self.pieces[i]

    cls = C.classes(SP())
    assert cls[0] == cls[1] and cls[0] != cls[3]
    assert cls[2] == cls[4]  # voyelle seule = blanc
