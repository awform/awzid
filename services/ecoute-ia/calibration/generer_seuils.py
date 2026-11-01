"""
Awzid — écrit `services/ecoute-ia/seuils_tajwid.json` (la configuration lue par le service) à partir de `seuils.json` (sortie de
analyser_seuils.py). Les seuils sont ARRONDIS DANS LE SENS PRUDENT (au millième supérieur pour « plus grand = suspect »).

    python generer_seuils.py seuils.json ../seuils_tajwid.json

RÈGLE DES ÉTATS (écrite ici, relue par les tests) :
  - `etat` : « eteinte » (le service ne signale rien) ou « indication » (le service peut signaler « indication automatique », jamais une
    note). AUCUNE règle n'est « active » au sens d'une décision automatique : l'interrupteur `tajwid_madd` reste éteint en production.
  - `fiabilite` (mesurée sur les 5 voix de référence + fautes simulées, voir le rapport) :
      « prete_validation » : fausses alertes <= 2 % pour chacune des 5 voix ET détection >= 90 % de >= 30 fautes simulées ;
      « indication »       : fausses alertes <= 2 % pour chaque voix ET détection de plus de 50 % à moins de 90 % ;
      « insuffisante »     : détection <= 50 %, ou fausses alertes impossibles à tenir ;
      « non_mesuree »      : la mesure demande l'audio (qalqala, formants...) ou n'a pas de faute simulée crédible.
    Une règle « prete_validation » reste « eteinte » : il manque la vérification sur des voix humaines (plan du 25/10, § 4).
"""
from __future__ import annotations

import json
import math
import sys

src, dst = sys.argv[1], sys.argv[2]
S = json.load(open(src, encoding='utf-8'))


def haut(x, nd=3):
    f = 10 ** nd
    return math.ceil(x * f - 1e-9) / f


def fiab(fa_max, det, n_f):
    if fa_max is None or fa_max > 0.02 + 1e-9:
        return 'insuffisante'
    if det is None or n_f < 30:
        return 'non_mesuree' if det is None else 'insuffisante'
    if det >= 0.90:
        return 'prete_validation'
    if det > 0.50:
        return 'indication'
    return 'insuffisante'


def regle_duree_ou_proba(cle, ident, libelle, sens_texte, unite):
    r = S['regles'][cle]
    t = haut(r['seuil_fa2_par_voix'], 4 if r['seuil_fa2_par_voix'] < 1 else 3)
    f = r['fautes_simulees'][r['faute']]
    det = f['detection_au_seuil_fa2']
    fa_max = max(r['fa_au_seuil_par_voix'].values())
    return {
        'id': ident, 'libelle': libelle, 'mesure': r['mesure'], 'sens': sens_texte, 'unite': unite, 'seuil': t,
        'etat': 'eteinte', 'fiabilite': fiab(fa_max, det, f['n_fautes']),
        'fausses_alertes_voix_max': round(fa_max, 4), 'fausses_alertes_voix': {v: round(x, 4) for v, x in r['fa_au_seuil_par_voix'].items()},
        'fausses_alertes_voix_laissee_de_cote_max': round(r['fa_lovo_max'], 4),
        'n_justes': r['n_justes'], 'detection_fautes_simulees': round(det, 3), 'n_fautes_simulees': f['n_fautes'],
        'faute_simulee': r['faute'],
    }


out = {
    'version': 1, 'date': '2026-11-01', 'modele': 'obadx/muaalem-model-v3_2, int8 (les seuils ne valent que pour lui)',
    'voix_de_reference': ['ayyoub', 'akhdar', 'huthify', 'muaiqly', 'muhanna'],
    'fa_cible': 0.02,
    'avertissement': ('Seuils réglés sur 5 voix d\'hommes, récitateurs professionnels du Complexe du Roi Fahd (Coran entier), et sur des '
                      'fautes SIMULÉES par montage. Aucune voix d\'élève, de femme, d\'enfant ni de téléphone bruité. Une règle ne s\'allume '
                      'qu\'après vérification sur des voix humaines ; l\'interrupteur `tajwid_madd` reste éteint en production.'),
    'regles': {},
}

# ---- madd (le seul détecteur présent dans le service) -------------------------------------------------------------------------
M = S['madd']
mu = M['prod|muttasil|n_ok=True']
sym = M['symetrie|muttasil|n_ok=True']
fs = M['fautes_simulees_muttasil']
fa070 = mu['fa_globale_par_seuil']['0.7']
fa_voix = {v: p['fa_par_seuil']['0.7'] for v, p in mu['par_voix'].items()}
fa_voix_sym = sym['par_voix']['ayyoub']['fa_par_seuil']['0.7']
out['regles']['madd_muttasil'] = {
    'id': 'madd_muttasil', 'libelle': 'madd muttaṣil trop court (4 temps ou plus dans la référence)',
    'mesure': 'rapport r = durée du madd / débit, élève sur Ayyūb ; chaîne complète du service, contrôle du nombre de madd compris',
    'sens': 'r < seuil', 'unite': 'rapport', 'seuil': 0.70,
    'etat': 'indication', 'fiabilite': 'indication',
    'fausses_alertes_voix_max': round(max(max(fa_voix.values()), fa_voix_sym), 4), 'fausses_alertes_voix': {k: round(v, 4) for k, v in fa_voix.items()},
    'fausses_alertes_globale': round(fa070, 4), 'fausses_alertes_ayyoub_contre_autres_voix': round(fa_voix_sym, 4),
    'n_justes': mu['n'], 'n_par_voix': mu['n_par_voix'],
    'seuil_max_fa2_chaque_voix': round(min(mu['plus_grand_t_fa2_chaque_voix'], sym['plus_grand_t_fa2_chaque_voix']), 4),
    'detection_fautes_simulees': fs['detection_par_seuil']['0.7'], 'n_fautes_simulees': fs['n'],
    'faute_simulee': 'madd raccourci par coupure (étude du 25/10)',
    'note': ('0,70 est confirmé : c\'est la valeur la plus haute qui tient 2 % sur chaque voix (et sur Ayyūb contre les autres). '
             'Monter à 0,75 donne 3,8 % de fausses alertes. Sans le contrôle du nombre de madd, 10,8 % : ce contrôle est indispensable.'),
}
lz = M['prod|lazim|n_ok=True']
out['regles']['madd_lazim'] = {
    'id': 'madd_lazim', 'libelle': 'madd lāzim trop court (6 temps dans la référence)', 'mesure': 'idem muttaṣil', 'sens': 'r < seuil',
    'unite': 'rapport', 'seuil': 0.70, 'etat': 'eteinte', 'fiabilite': 'non_mesuree',
    'n_justes': lz['n'], 'detection_fautes_simulees': None, 'n_fautes_simulees': 0,
    'note': ('Seulement %d mesure(s) exploitable(s) sur tout le Coran (les autres sont écartées par le contrôle du nombre de madd) et aucune '
             'faute simulée : impossible de borner les fausses alertes. Éteinte : le service se tait.' % lz['n']),
}

# ---- règles de recherche (aucun détecteur dans le service : seuils rangés pour la suite, règles ÉTEINTES) --------------------
out['regles']['ghunna_tres_courte'] = regle_duree_ou_proba(
    'ghunna_court70::1/r_ayyoub', 'ghunna_tres_courte', 'ghunna réduite à une simple nasale (-70 %)',
    'durée d\'Ayyūb / durée de l\'élève > seuil', 'rapport')
out['regles']['ghunna_un_peu_courte'] = regle_duree_ou_proba(
    'ghunna_court50::1/r_ayyoub', 'ghunna_un_peu_courte', 'ghunna raccourcie de moitié (-50 %)',
    'durée d\'Ayyūb / durée de l\'élève > seuil', 'rapport')
out['regles']['ikhfa_non_tenue'] = regle_duree_ou_proba(
    'ikhfa_court::1/r_ayyoub', 'ikhfa_non_tenue', 'ikhfāʾ non tenue (-60 %)', 'durée d\'Ayyūb / durée de l\'élève > seuil', 'rapport')
out['regles']['ikhfa_n_clair'] = regle_duree_ou_proba(
    'ikhfa_izhar::P_n_clair', 'ikhfa_n_clair', 'ن clair au lieu de l\'ikhfāʾ (probabilité de ن)',
    'probabilité maximale de ن > seuil', 'probabilité')
out['regles']['izhar_tenu'] = regle_duree_ou_proba(
    'izhar_long::r_ayyoub', 'izhar_tenu', 'iẓhār tenu (ghunna ajoutée)', 'durée de l\'élève / durée d\'Ayyūb > seuil', 'rapport')
out['regles']['idgham_sans_n_entendu'] = regle_duree_ou_proba(
    'idghs_n::P_n', 'idgham_sans_n_entendu', 'ن entendu devant ل ou ر (idghām sans ghunna)',
    'probabilité maximale de ن ou ں > seuil', 'probabilité')
out['regles']['idgham_ghunna_sans_ghunna'] = regle_duree_ou_proba(
    'idgh_court::1/r_duree', 'idgham_ghunna_sans_ghunna', 'idghām avec ghunna non tenu (-60 %)',
    'durée de référence / durée de l\'élève > seuil', 'rapport')
out['regles']['idgham_ghunna_n_clair'] = regle_duree_ou_proba(
    'idgh_izhar::P_n_clair', 'idgham_ghunna_n_clair', 'ن prononcé clairement dans l\'idghām avec ghunna',
    'probabilité maximale de ن > seuil', 'probabilité')
out['regles']['iqlab_n'] = regle_duree_ou_proba(
    'iqlab_n::P_n', 'iqlab_n', 'ن à la place du م de l\'iqlāb (probabilité de ن)', 'probabilité maximale de ن ou ں > seuil', 'probabilité')
out['regles']['lam_allah_lourd_apres_i'] = regle_duree_ou_proba(
    'lam_lourd::tafkhim_tete', 'lam_allah_lourd_apres_i', 'lām de « Allāh » lourd après i (tête tafkhīm du modèle)',
    'moyenne de la tête tafkhīm > seuil', 'probabilité')
out['regles']['lam_allah_leger_apres_a_u'] = regle_duree_ou_proba(
    'lam_leger::1-tafkhim_tete', 'lam_allah_leger_apres_a_u', 'lām de « Allāh » léger après a/u (tête tafkhīm seule)',
    '1 - moyenne de la tête tafkhīm > seuil', 'probabilité')

# ---- règles qui demandent l'audio : non recalculées ici -----------------------------------------------------------------------
for ident, lib in (('qalqala_milieu', 'qalqala au milieu du verset : rebond non entendu'),
                   ('qalqala_fin_verset', 'qalqala en fin de verset : rebond non entendu'),
                   ('ra_et_emphatiques', 'rā lourd ou léger, lettres emphatiques'),
                   ('makharij', 'makhārij (ح/ه, ع/ء, ق/ك, ص/س, ...)'),
                   ('madd_arid', 'madd ʿāriḍ li-s-sukūn : durée'),
                   ('lam_allah_formant', 'lām de « Allāh » : deuxième formant')):
    out['regles'][ident] = {'id': ident, 'libelle': lib, 'mesure': None, 'sens': None, 'unite': None, 'seuil': None,
                            'etat': 'eteinte', 'fiabilite': 'non_mesuree',
                            'note': 'mesure acoustique (audio) : non recalculée sur le décodage du Coran entier, qui ne conserve que les probabilités du modèle'}
json.dump(out, open(dst, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
open(dst, 'a').write('\n')
print('ok', dst, len(out['regles']), 'règles')
for k, v in out['regles'].items():
    print(f"{k:30s} seuil={v['seuil']} etat={v['etat']} fiab={v['fiabilite']} fa_max={v.get('fausses_alertes_voix_max')} det={v.get('detection_fautes_simulees')}/{v.get('n_fautes_simulees')}")
