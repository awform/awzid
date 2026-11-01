"""
Tests des SEUILS DE TAJWĪD (1/11/2026) : la configuration calibrée (`seuils_tajwid.json`), son chargeur (`seuils_tajwid.py`), l'effet
sur le mode « madd », et les outils de calibration (`calibration/`). Garanties vérifiées :
  - toute règle est « eteinte » ou « indication » ; SEULE la règle madd muttaṣil est en « indication » (c'est le seul détecteur du service) ;
  - une règle n'est jamais en « indication » si sa fiabilité mesurée est insuffisante, ou si ses fausses alertes dépassent 2 % ;
  - l'état d'une règle est cohérent avec ses chiffres (prête = >= 90 % de >= 30 fautes ; indication = de 50 % à 90 %) ;
  - fichier absent, illisible ou règle inconnue = SILENCE ; le madd lāzim (non calibrable) est éteint ;
  - l'interrupteur `tajwid_madd` reste éteint par défaut en production ;
  - le fichier se régénère à l'identique depuis les mesures (`calibration/seuils_mesures.json`).
    python -m pytest -q tests/test_seuils_tajwid.py
"""
import json
import os
import subprocess
import sys

import pytest

import madd
import seuils_tajwid as st

ICI = os.path.dirname(os.path.abspath(__file__))
SERVICE = os.path.dirname(ICI)
CALIB = os.path.join(SERVICE, 'calibration')
CONFIG = os.path.join(SERVICE, 'seuils_tajwid.json')


def T(tok, t0, t1=None, p=0.999):
    return {'tok': tok, 't0': t0, 't1': t0 if t1 is None else t1, 'p': p}


def verset(unites, pas, autres=20):
    toks, t = [], 0
    for k in range(autres):
        toks.append(T('بتثنم'[k % 5], t)); t += 2
    toks.append(T('َ', t)); t += 2
    for _ in range(unites):
        toks.append(T('ا', t)); t += pas
    for k in range(autres):
        toks.append(T('رزسشص'[k % 5], t)); t += 2
    return toks


C = json.load(open(CONFIG, encoding='utf-8'))
R = C['regles']


# ---------------------------------------------------------------- la configuration
def test_chaque_regle_est_eteinte_ou_indication_et_complete():
    assert R
    for cle, r in R.items():
        assert r['id'] == cle
        assert r['etat'] in st.ETATS
        assert r['fiabilite'] in st.FIABILITES
        assert r['seuil'] is None or isinstance(r['seuil'], (int, float))
        if r['fiabilite'] != 'non_mesuree':
            assert r['seuil'] is not None and r['n_justes'] > 0


def test_seule_la_regle_madd_muttasil_est_en_indication():
    allumees = {k for k, r in R.items() if r['etat'] == 'indication'}
    assert allumees == {'madd_muttasil'}
    assert st.est_allumee('madd_muttasil') and not st.est_allumee('madd_lazim')


def test_aucune_regle_n_est_en_indication_sans_fiabilite_suffisante():
    for r in R.values():
        if r['etat'] == 'indication':
            assert r['fiabilite'] in ('indication', 'prete_validation')
            assert r['fausses_alertes_voix_max'] <= 0.02 + 1e-9


def test_etat_coherent_avec_les_chiffres():
    for k, r in R.items():
        if r['fiabilite'] == 'non_mesuree':
            assert r['etat'] == 'eteinte' or k == 'madd_muttasil'
            continue
        # fausses alertes <= 2 % pour CHAQUE voix de référence, sinon la règle ne peut pas être « insuffisante » que par détection
        det, n = r['detection_fautes_simulees'], r['n_fautes_simulees']
        if r['fiabilite'] == 'prete_validation':
            assert r['fausses_alertes_voix_max'] <= 0.02 + 1e-9 and det >= 0.90 and n >= 30
        elif r['fiabilite'] == 'indication':
            assert r['fausses_alertes_voix_max'] <= 0.02 + 1e-9 and 0.50 < det < 0.90
        else:
            assert r['fausses_alertes_voix_max'] > 0.02 or det is None or det <= 0.50 or n < 30


def test_regles_pretes_a_valider_restent_eteintes():
    pretes = [k for k, r in R.items() if r['fiabilite'] == 'prete_validation']
    assert pretes  # ghunna très courte, iẓhār tenu, lām lourd après i
    for k in pretes:
        assert R[k]['etat'] == 'eteinte', k


def test_regles_non_mesurees_ou_insuffisantes_sont_eteintes():
    for k in ('qalqala_milieu', 'qalqala_fin_verset', 'makharij', 'ra_et_emphatiques', 'madd_arid', 'madd_lazim',
              'idgham_ghunna_sans_ghunna', 'iqlab_n', 'lam_allah_leger_apres_a_u', 'ghunna_un_peu_courte'):
        assert R[k]['etat'] == 'eteinte', k
        assert not st.est_allumee(k)


def test_seuil_madd_confirme_a_0_70():
    assert R['madd_muttasil']['seuil'] == 0.70
    assert madd.R_COURT == 0.70 and madd.P_MIN == 0.95
    # 0,70 tient 2 % sur chaque voix de référence (et sur Ayyūb contre les autres)
    assert R['madd_muttasil']['fausses_alertes_voix_max'] <= 0.02
    assert R['madd_muttasil']['seuil_max_fa2_chaque_voix'] >= 0.70


def test_avertissement_voix_d_hommes_present():
    assert 'Aucune voix d\'élève' in C['avertissement'] and 'tajwid_madd' in C['avertissement']


# ---------------------------------------------------------------- le chargeur : tout doute = silence
def test_fichier_absent_ou_illisible_tout_est_eteint(tmp_path):
    assert st.charger(str(tmp_path / 'nexiste-pas.json')) == {'regles': {}}
    mauvais = tmp_path / 'mauvais.json'
    mauvais.write_text('{pas du json', encoding='utf-8')
    vide = st.charger(str(mauvais))
    assert vide == {'regles': {}}
    assert st.est_allumee('madd_muttasil', vide) is False
    assert st.etat('madd_muttasil', vide) == 'eteinte'
    assert st.seuil('madd_muttasil', 0.7, vide) == 0.7
    forme = tmp_path / 'forme.json'
    forme.write_text('[1, 2]', encoding='utf-8')
    assert st.charger(str(forme)) == {'regles': {}}


def test_regle_inconnue_ou_etat_inconnu_est_eteinte():
    faux = {'regles': {'x': {'id': 'x', 'etat': 'actif', 'seuil': 1.0}}}
    assert st.etat('x', faux) == 'eteinte' and not st.est_allumee('x', faux)
    assert not st.est_allumee('inconnue', faux)
    sans_seuil = {'regles': {'y': {'id': 'y', 'etat': 'indication', 'seuil': None}}}
    assert not st.est_allumee('y', sans_seuil)


# ---------------------------------------------------------------- effet sur le mode madd
def test_madd_lazim_est_silencieux_par_defaut():
    six = verset(6, 4)
    r = madd.decider(six, verset(6, 1), 0, 'lazim', 1)
    assert r == {'indication': None, 'raison': 'type_eteint'}
    assert madd.TYPES_ALLUMES == ('muttasil',)
    assert madd.TYPES == ('muttasil', 'lazim')  # la route accepte encore le type (réponse : silence)


def test_madd_muttasil_inchange():
    ref = verset(4, 4)
    assert madd.decider(ref, verset(4, 4), 0, 'muttasil', 1) == {'indication': None, 'raison': 'zone_non_signalee'}
    assert madd.decider(ref, verset(4, 2), 0, 'muttasil', 1)['indication'] == 'trop_court'


def test_rapport_et_decider_disent_la_meme_chose(monkeypatch):
    monkeypatch.setattr(madd, 'TYPES_ALLUMES', ('muttasil', 'lazim'))
    ref = verset(4, 4)
    for pas in (1, 2, 3, 4, 5):
        raison, r, p, u = madd.rapport(ref, verset(4, pas), 0, 'muttasil', 1)
        d = madd.decider(ref, verset(4, pas), 0, 'muttasil', 1)
        assert raison == 'mesure' and p > 0.99 and u == 4
        assert (d['indication'] == 'trop_court') == (r < madd.R_COURT)
    # lāzim, une fois rallumé (test seulement) : même logique
    six = verset(6, 4)
    assert madd.decider(six, verset(6, 2), 0, 'lazim', 1)['indication'] == 'trop_court'
    assert madd.rapport(six, verset(6, 2), 0, 'lazim', 1)[0] == 'mesure'


def test_rapport_codes_de_silence_sans_mesure():
    ref = verset(4, 4)
    assert madd.rapport(ref, verset(4, 4), 0, 'tabii', 1) == ('type_non_long', None, None, None)
    assert madd.rapport([], ref, 0, 'muttasil', 1)[0] == 'audio_vide'
    assert madd.rapport(ref, verset(4, 4), 0, 'muttasil', 3)[0] == 'correspondance_incertaine'
    assert madd.rapport(ref, verset(4, 4), 5, 'muttasil', None)[0] == 'cible_introuvable'
    assert madd.rapport(ref, verset(4, 4), 0, 'lazim', 1)[0] == 'type_eteint'


# ---------------------------------------------------------------- l'interrupteur de production
def test_interrupteur_tajwid_madd_eteint_en_production():
    f = os.path.join(SERVICE, '..', '..', 'packages', 'school', 'src', 'fonctions.ts')
    if not os.path.exists(f):
        pytest.skip('dépôt complet absent (image du service)')
    src = open(f, encoding='utf-8').read()
    assert "tajwid_madd: { defaut: 'off' }" in src


# ---------------------------------------------------------------- les outils de calibration
@pytest.fixture(scope='module')
def calib():
    if not os.path.isdir(CALIB):
        pytest.skip('dossier calibration absent (image du service)')
    sys.path.insert(0, CALIB)
    import analyser_seuils
    import mesurer_cache
    return analyser_seuils, mesurer_cache


def test_seuil_par_voix_chaque_voix_au_plus_2_pour_cent(calib):
    a, _ = calib
    # voix 1 : 100 valeurs 0..99 ; voix 2 : 100 valeurs 0..199 pas 2
    v1 = list(range(100))
    v2 = [2 * i for i in range(100)]
    t = a.seuil_par_voix({'a': v1, 'b': v2})
    assert a.taux(v1, t) <= 0.02 and a.taux(v2, t) <= 0.02
    # c'est le plus petit seuil possible : en dessous, une des voix dépasse 2 %
    assert a.taux(v1, t - 1e-9) > 0.02 or a.taux(v2, t - 1e-9) > 0.02
    assert a.seuil_par_voix({'a': [1.0] * 10}) == 1.0  # n * 2 % < 1 : aucune alerte permise


def test_wilson_et_quantiles(calib):
    a, _ = calib
    assert a.wilson_haut(0, 0) is None
    assert 0.03 < a.wilson_haut(0, 100) < 0.05      # 3,7 % (la règle de trois donne 3 %)
    assert a.wilson_haut(2, 212) > 2 / 212
    assert a.quant([1, 2, 3, 4], 0.5) == 2 and a.quant([], 0.5) is None


def test_empreinte_et_cibles_comme_le_code_typescript(calib):
    _, m = calib
    # valeurs calculées par textHash() de packages/content/src/tajwid.ts
    assert m.base36(m.fnv('abc')) == '7aigaz'
    assert m.base36(m.fnv('بِسْمِ ٱللَّهِ')) == '11qyb3c'
    txt = 'abcdefgh'
    h = m.base36(m.fnv(txt))
    # règles : 12 = madd_muttasil sur 'cd', 13 = madd_6 sur 'f', 9 = madd_2 sur 'a'
    entry = [h, 9, 0, 1, 12, 2, 2, 13, 5, 1]
    assert m.cibles_de(txt, entry) == (3, [(1, 'muttasil'), (2, 'lazim')])
    assert m.cibles_de(txt, ['mauvaise-empreinte'] + entry[1:]) is None
    assert m.cibles_de(txt, [h, 99, 0, 1]) is None          # règle inconnue
    assert m.cibles_de(txt, [h, 12, 7, 5]) is None          # hors du texte
    assert m.cibles_de(txt, [h, 9, 0, 1]) is None           # aucun madd long


def test_le_fichier_de_seuils_se_regenere_a_l_identique(tmp_path):
    mesures = os.path.join(CALIB, 'seuils_mesures.json')
    gen = os.path.join(CALIB, 'generer_seuils.py')
    if not os.path.exists(mesures):
        pytest.skip('calibration absente (image du service)')
    sortie = tmp_path / 'regenere.json'
    subprocess.run([sys.executable, gen, mesures, str(sortie)], check=True, capture_output=True)
    assert json.load(open(sortie, encoding='utf-8')) == C
