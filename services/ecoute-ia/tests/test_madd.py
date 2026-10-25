"""
Tests du mode « madd » (25/10/2026) : décision PURE (madd.py) sur des suites de phonèmes synthétiques, et route /madd en mode d'essai
(sans modèle). Garanties vérifiées : une indication ou rien (jamais « correct », jamais de nombre), seulement les madd longs
(muttaṣil, lāzim), silence dans tous les cas douteux, mode fermé par défaut (le service d'écoute n'a PAS de route /madd).
    python -m pytest -q tests/test_madd.py
"""
import os
import struct

import pytest

import madd

os.environ.setdefault('ECOUTE_MADD_ESSAI', '1')


def T(tok, t0, t1=None, p=0.999):
    return {'tok': tok, 't0': t0, 't1': t0 if t1 is None else t1, 'p': p}


def verset(unites=4, pas=4, p_madd=0.999, autres=20, pas_autres=2):
    """Verset synthétique : `autres` phonèmes, puis une voyelle brève + `unites` unités de madd (une toutes les `pas` trames), puis `autres`."""
    toks, t = [], 0
    for k in range(autres):
        toks.append(T('بتثنم'[k % 5], t))
        t += pas_autres
    toks.append(T('َ', t))
    t += 2
    for _ in range(unites):
        toks.append(T('ا', t, p=p_madd))
        t += pas
    for k in range(autres):
        toks.append(T('رزسشص'[k % 5], t))
        t += pas_autres
    return toks


REF = verset(4, 4)


def test_recitation_juste_aucune_indication():
    r = madd.decider(REF, verset(4, 4), 0, 'muttasil', 1)
    assert r == {'indication': None, 'raison': 'zone_non_signalee'}


def test_madd_raccourci_une_indication_trop_court():
    r = madd.decider(REF, verset(4, 2), 0, 'muttasil', 1)
    assert r['indication'] == 'trop_court'
    # la sortie ne contient JAMAIS de mesure : ni rapport, ni durée, ni pourcentage
    assert set(r) == {'indication', 'raison'}


def test_seuil_prudent_une_legere_baisse_ne_declenche_rien():
    # un madd à peine plus court (3,5 trames par unité au lieu de 4) : zone grise, on se tait
    for pas in (3, 4, 5):
        assert madd.decider(REF, verset(4, pas), 0, 'muttasil', 1)['indication'] is None


def test_jamais_correct_la_seule_valeur_possible_est_trop_court_ou_rien():
    for unites in (2, 4, 6):
        for pas in (1, 2, 3, 4, 5, 6):
            for tm in ('muttasil', 'lazim', 'tabii'):
                r = madd.decider(REF, verset(unites, pas), 0, tm, 1)
                assert r['indication'] in (None, 'trop_court')
                assert 'correct' not in str(r).lower() and 'ok' not in r


def test_seulement_les_madd_longs():
    court = verset(2, 4)  # ṭabīʿī : 2 temps dans la référence
    r = madd.decider(court, verset(2, 1), 0, 'muttasil', 1)
    assert r == {'indication': None, 'raison': 'madd_non_long'}
    for tm in ('tabii', 'munfasil', 'arid', ''):
        assert madd.decider(REF, verset(4, 1), 0, tm, 1)['raison'] == 'type_non_long'
    # lāzim : la référence doit compter 6 temps
    assert madd.decider(REF, verset(4, 1), 0, 'lazim', 1)['raison'] == 'madd_non_long'
    six = verset(6, 4)
    assert madd.decider(six, verset(6, 2), 0, 'lazim', 1)['indication'] == 'trop_court'


def test_silence_si_la_correspondance_ou_la_cible_est_incertaine():
    assert madd.decider(REF, verset(4, 1), 0, 'muttasil', 2)['raison'] == 'correspondance_incertaine'
    assert madd.decider(REF, verset(4, 1), 3, 'muttasil', None)['raison'] == 'cible_introuvable'
    assert madd.decider([], verset(4, 1), 0, 'muttasil')['raison'] == 'audio_vide'


def test_silence_sous_le_seuil_de_confiance():
    r = madd.decider(REF, verset(4, 2, p_madd=0.90), 0, 'muttasil', 1)
    assert r == {'indication': None, 'raison': 'confiance_insuffisante'}


def test_verset_mal_reconnu_rien_n_est_analyse():
    hyp = verset(4, 2)
    for k in range(0, 40, 2):  # la moitié des phonèmes sont autres : récitation d'un autre verset
        hyp[k]['tok'] = 'غ'
    r = madd.decider(REF, hyp, 0, 'muttasil', 1)
    assert r['indication'] is None and r['raison'] == 'verset_mal_reconnu'


def test_madd_non_retrouve():
    # l'élève ne dit aucune voyelle longue
    hyp = [t for t in verset(4, 2) if t['tok'] != 'ا']
    assert madd.decider(REF, hyp, 0, 'muttasil', 1)['indication'] is None


def test_debit_l_ensemble_plus_lent_n_est_pas_une_faute():
    # tout le verset est dit plus lentement (×1,5) : le rapport au débit ne déclenche rien
    lent = verset(4, 6, pas_autres=3)
    assert madd.decider(REF, lent, 0, 'muttasil', 1)['indication'] is None


def test_distance_et_mesure():
    assert madd.distance_relative(REF, REF) == 0
    m = madd.mesure(REF, madd.runs(REF)[0])
    assert m['unites'] == 4 and m['p_min'] > 0.99
    assert madd.UNITES_MIN == {'muttasil': 4, 'lazim': 6}
    assert madd.R_COURT == 0.70 and madd.P_MIN == 0.95


# ---------------------------------------------------------------- la route (modèle d'essai)

def corps(ref=b'REF-AUDIO', eleve=b'ELEVE-AUDIO'):
    return struct.pack('>I', len(ref)) + ref + eleve


def test_route_essai_et_cadrage():
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    import madd_route

    assert madd_route.decouper(corps()) == (b'REF-AUDIO', b'ELEVE-AUDIO')
    assert madd_route.decouper(b'xx') is None
    assert madd_route.decouper(struct.pack('>I', 99) + b'abc') is None
    app = FastAPI()
    madd_route.installer(app, True)
    with TestClient(app) as c:
        # le thread de chargement du modèle d'essai doit avoir fini
        for _ in range(50):
            if c.get('/madd/sante').json()['pret']:
                break
        assert c.get('/madd/sante').json()['pret'] is True
        r = c.post('/madd?k=0&type=muttasil&n=1', content=corps(), headers={'x-essai-madd': 'trop_court'})
        assert r.status_code == 200 and r.json()['indication'] == 'trop_court'
        r = c.post('/madd?k=0&type=muttasil', content=corps())
        assert r.json()['indication'] is None
        assert c.post('/madd?type=tabii', content=corps()).status_code == 400
        assert c.post('/madd?type=muttasil', content=b'abc').status_code == 400
        assert c.post('/madd?type=muttasil', content=corps(eleve=b'x' * (5 * 1024 * 1024))).status_code == 413


def test_le_service_d_ecoute_n_a_pas_de_route_madd_par_defaut():
    """Sans ECOUTE_MADD=1, ecoute.py n'importe rien du mode madd : le service de production est inchangé."""
    os.environ.pop('ECOUTE_MADD', None)
    os.environ['ECOUTE_ESSAI'] = '1'
    import importlib

    import ecoute

    importlib.reload(ecoute)
    chemins = {getattr(r, 'path', '') for r in ecoute.app.routes}
    assert '/madd' not in chemins and '/madd/sante' not in chemins
    assert {'/ecouter', '/sante'} <= chemins
    src = open(os.path.join(os.path.dirname(ecoute.__file__), 'ecoute.py'), encoding='utf-8').read()
    assert "if os.environ.get('ECOUTE_MADD') == '1':" in src
    # le module du mode n'est jamais importé en haut du fichier
    assert src.index('import madd_route') > src.index("if os.environ.get('ECOUTE_MADD')")
