"""
Awzid — CALIBRATION DES SEUILS DE TAJWĪD, analyse (1/11/2026). Entrées : les mesures de `mesurer_cache.py` (madd.jsonl.gz,
regles.jsonl.gz), les fautes simulées de l'étude du 25/10 (tajwid-fautes8.jsonl.gz, madd-resultats.json) et, pour le contrôle de la
réimplémentation, les mesures de l'étude (tajwid-correct8.jsonl.gz). Sortie : seuils.json (tous les chiffres du rapport).

    python analyser_seuils.py   (variables : MESURES, ENTREE, SORTIE)

Principe : la VÉRITÉ « juste » = les 5 récitateurs Ḥafṣ du Complexe du Roi Fahd (Coran entier). Pour un score où « plus grand =
plus suspect », le seuil « FA ≤ 2 % pour chaque voix » est la plus petite valeur t telle que, POUR CHAQUE voix, au plus 2 % de ses
occurrences dépassent t. « Une voix laissée de côté » : seuil appris sur 4 voix (2 % du lot réuni), fausses alertes mesurées sur la 5ᵉ.
"""
from __future__ import annotations

import collections
import gzip
import json
import math
import os
import statistics

MESURES = os.environ.get('MESURES', '/out')
ENTREE = os.environ.get('ENTREE', '/in')
SORTIE = os.environ.get('SORTIE', '/out/seuils.json')
VOIX = ['ayyoub', 'akhdar', 'huthify', 'muaiqly', 'muhanna']
COUT_MAX = 0.20
COUT_FAUTE = 0.25
FA_MAX = 0.02


def jl(chemin):
    return [json.loads(l) for l in gzip.open(chemin, 'rt', encoding='utf-8')]


def quant(v, q):
    v = sorted(v)
    if not v:
        return None
    i = min(len(v) - 1, max(0, int(math.ceil(q * len(v))) - 1))
    return v[i]


def seuil_par_voix(par_voix, fa=FA_MAX):
    """Plus petit t (score > t = alerte) tel que CHAQUE voix ait au plus `fa` d'alertes. Renvoie t."""
    t = -1e18
    for v, L in par_voix.items():
        if not L:
            continue
        L = sorted(L, reverse=True)
        k = int(math.floor(fa * len(L)))
        t = max(t, L[k] if k < len(L) else L[-1])
    return t


def wilson_haut(k, n, z=1.96):
    """Borne haute (95 %) d'un taux k/n : la règle de trois ne vaut que pour k = 0."""
    if n == 0:
        return None
    p = k / n
    d = 1 + z * z / n
    c = p + z * z / (2 * n)
    m = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    return (c + m) / d


def taux(L, t):
    return sum(1 for x in L if x > t) / len(L) if L else None


def stats_regle(par_voix, fautes_par_type, nom):
    """par_voix : {voix: [score]} sur les occurrences justes ; fautes_par_type : {type: (liste de scores ou None, n_total)}."""
    tous = [x for L in par_voix.values() for x in L]
    t2 = seuil_par_voix(par_voix)
    t0 = max(tous) if tous else None
    # une voix laissée de côté
    lovo = {}
    for v in par_voix:
        autres = [x for w, L in par_voix.items() if w != v for x in L]
        if not autres or not par_voix[v]:
            continue
        t = quant(autres, 1 - FA_MAX)
        lovo[v] = {'seuil': t, 'fa': taux(par_voix[v], t), 'n': len(par_voix[v])}
    out = {
        'mesure': nom, 'n_justes': len(tous),
        'n_par_voix': {v: len(L) for v, L in par_voix.items()},
        'seuil_fa2_par_voix': t2, 'seuil_0fa': t0,
        'fa_au_seuil_par_voix': {v: taux(L, t2) for v, L in par_voix.items() if L},
        'fa_globale_au_seuil': taux(tous, t2),
        'une_voix_laissee_de_cote': lovo,
        'fa_lovo_max': max((x['fa'] for x in lovo.values()), default=None),
        'centiles_par_voix': {v: {'p50': quant(L, .5), 'p90': quant(L, .9), 'p98': quant(L, .98), 'p99': quant(L, .99), 'max': max(L)}
                              for v, L in par_voix.items() if L},
        'fa_globale_borne_haute_wilson95': wilson_haut(sum(1 for x in tous if x > t2), len(tous)),
    }
    det = {}
    for typ, (sc, n_tot) in fautes_par_type.items():
        det[typ] = {'n_fautes': n_tot, 'n_mesurees': len(sc),
                    'detection_au_seuil_fa2': (sum(1 for x in sc if x > t2) / n_tot) if n_tot else None,
                    'detection_au_seuil_0fa': (sum(1 for x in sc if x > t0) / n_tot) if n_tot else None,
                    'detection_au_seuil_lovo_max': (sum(1 for x in sc if x > max(x2['seuil'] for x2 in lovo.values())) / n_tot) if n_tot and lovo else None}
    out['fautes_simulees'] = det
    return out


def main():
    R = jl(f'{MESURES}/regles.jsonl.gz')
    F = jl(f'{ENTREE}/tajwid-fautes8.jsonl.gz') if os.path.exists(f'{ENTREE}/tajwid-fautes8.jsonl.gz') else [
        json.loads(l) for l in gzip.open(f'{ENTREE}/tajwid-fautes8.jsonl.gz', 'rt')]
    res = {'sources': {'mesures_occurrences': len(R), 'fautes_simulees': len(F)}}

    # ---------------------------------------------------------------- justes : références par occurrence
    bon = [d for d in R if d.get('aligne') and d['cout'] <= COUT_MAX and d['tok'] == d['att_tok']]
    par_occ = collections.defaultdict(dict)
    for d in bon:
        par_occ[(d['s'], d['a'], d['oid'])][d['rec']] = d
    comptes = collections.Counter(d['regle'] for d in R)
    ok = collections.Counter(d['regle'] for d in bon)
    res['occurrences'] = {r: {'mesures_voix': comptes[r], 'analysables': ok[r]} for r in sorted(comptes)}

    def ref_dn(d, mode='med'):
        """Durée normalisée de référence : médiane des AUTRES voix (étude du 25/10) ou durée d'Ayyūb seul (le produit n'a qu'un récitateur)."""
        occ_ = par_occ.get((d['s'], d['a'], d['oid']), {})
        if mode == 'ayyoub':
            a_ = occ_.get('ayyoub')
            return a_['dn'] if a_ is not None and d['rec'] != 'ayyoub' and a_['dn'] > 0 else None
        autres = [v['dn'] for r, v in occ_.items() if r != d['rec']]
        return statistics.median(autres) if len(autres) >= 2 and statistics.median(autres) > 0 else None

    def r_duree(d, mode='med'):
        rf = ref_dn(d, mode)
        return d['dn'] / rf if rf else None

    def inv(v):
        return None if v is None or v <= 0 else 1.0 / v

    MES = {  # type de faute : (règle, {nom : fonction})
        'ghunna_court70': ('ghunna', {'1/r_duree': lambda d: inv(r_duree(d)), '1/r_ayyoub': lambda d: inv(r_duree(d, 'ayyoub'))}),
        'ghunna_court50': ('ghunna', {'1/r_duree': lambda d: inv(r_duree(d)), '1/r_ayyoub': lambda d: inv(r_duree(d, 'ayyoub'))}),
        'idgh_court': ('idgham_ghunna', {'1/r_duree': lambda d: inv(r_duree(d))}),
        'idgh_izhar': ('idgham_ghunna', {'P_n_clair': lambda d: d['Pp']['ن']}),
        'idghs_n': ('idgham_sans', {'P_n': lambda d: max(d['Pp']['ن'], d['Pp']['ں'])}),
        'ikhfa_court': ('ikhfa', {'1/r_duree': lambda d: inv(r_duree(d)), '1/r_ayyoub': lambda d: inv(r_duree(d, 'ayyoub'))}),
        'ikhfa_izhar': ('ikhfa', {'1/r_duree': lambda d: inv(r_duree(d)), 'P_n_clair': lambda d: d['P']['ن']}),
        'izhar_long': ('izhar', {'r_duree': lambda d: r_duree(d), 'r_ayyoub': lambda d: r_duree(d, 'ayyoub')}),
        'iqlab_n': ('iqlab', {'P_n': lambda d: max(d['P']['ن'], d['P']['ں'])}),
        'lam_lourd': ('lam_allah_tarqiq', {'tafkhim_tete': lambda d: d.get('tafkhim_tete')}),
        'lam_leger': ('lam_allah_tafkhim', {'1-tafkhim_tete': lambda d: None if d.get('tafkhim_tete') is None else 1 - d['tafkhim_tete']}),
    }
    # contrôle de la réimplémentation : mêmes durées normalisées que l'étude du 25/10 sur les occurrences communes
    ctl = {}
    ancien = {}
    for l in gzip.open(f'{ENTREE}/tajwid-correct8.jsonl.gz', 'rt'):
        d = json.loads(l)
        if d.get('regle') != '_fait' and d.get('aligne') and 'dn' in d:
            ancien[(d['rec'], d['s'], d['a'], d['oid'])] = d
    ecarts, cmp_ = [], 0
    for d in bon:
        o = ancien.get((d['rec'], d['s'], d['a'], d['oid']))
        if o and o['regle'] == d['regle']:
            cmp_ += 1
            ecarts.append(abs(o['dn'] - d['dn']))
    ctl = {'occurrences_communes': cmp_, 'ecart_dn_max': max(ecarts) if ecarts else None,
           'ecart_dn_moyen': statistics.mean(ecarts) if ecarts else None,
           'identiques_a_1e-3': sum(1 for e in ecarts if e < 1e-3)}
    res['controle_reimplementation'] = ctl

    # fautes simulées groupées
    Fok = collections.defaultdict(list)
    Ftot = collections.Counter()
    manque_oid = 0
    for d in F:
        Ftot[d['faute']] += 1
        # le même numéro d'occurrence doit désigner la même règle dans nos mesures
        cle = (d['s'], d['a'], d['oid'])
        if cle not in par_occ and not any(True for _ in ()):
            pass
        if d.get('aligne') and d['cout'] <= COUT_FAUTE:
            Fok[d['faute']].append(d)
    regles_par_cle = {(d['s'], d['a'], d['oid']): d['regle'] for d in R}
    res['regles'] = {}
    for typ, (regle, mesures) in MES.items():
        for nom, fn in mesures.items():
            par_voix = collections.defaultdict(list)
            for d in bon:
                if d['regle'] != regle:
                    continue
                try:
                    v = fn(d)
                except (KeyError, TypeError):
                    v = None
                if v is not None:
                    par_voix[d['rec']].append(v)
            sc = []
            for d in Fok.get(typ, []):
                cle = (d['s'], d['a'], d['oid'])
                if regles_par_cle.get(cle) != regle:
                    manque_oid += 1
                    continue
                # score de faute : mêmes fonctions que pour les justes ; la référence vient de NOS mesures (Coran entier)
                try:
                    v = fn(d)
                except (KeyError, TypeError):
                    v = None
                if v is not None:
                    sc.append(v)
            if not par_voix:
                continue
            n_tot = Ftot[typ] if 'ayyoub' not in nom else sum(1 for d in F if d['faute'] == typ and d['rec'] != 'ayyoub')
            st = stats_regle(par_voix, {typ: (sc, n_tot)} if n_tot else {}, nom)
            res['regles'][f'{typ}::{nom}'] = dict(st, regle=regle, faute=typ)
    res['fautes_hors_numerotation'] = manque_oid

    # ---------------------------------------------------------------- iqlāb : jeton écrit
    iq = [d for d in R if d['regle'] in ('iqlab', 'ikhfa_shafawi') and d.get('aligne') and d['cout'] <= COUT_MAX]
    res['iqlab_jeton_n'] = {'justes': len(iq), 'jeton_n_ecrit': sum(1 for d in iq if d['tok'] in ('ن', 'ں')),
                            'par_voix': {v: sum(1 for d in iq if d['rec'] == v and d['tok'] in ('ن', 'ں')) for v in VOIX}}
    fiq = [d for d in F if d['faute'] == 'iqlab_n']
    res['iqlab_jeton_n']['fautes'] = {'n': len(fiq), 'jeton_n_ecrit': sum(1 for d in fiq if d.get('aligne') and d['cout'] <= COUT_FAUTE and d['tok'] in ('ن', 'ں'))}
    fik = [d for d in F if d['faute'] == 'ikhfa_izhar']
    ikj = [d for d in R if d['regle'] == 'ikhfa' and d.get('aligne') and d['cout'] <= COUT_MAX]
    res['ikhfa_jeton_n'] = {'justes': len(ikj), 'jeton_n_ecrit': sum(1 for d in ikj if d['tok'] == 'ن'),
                            'fautes': len(fik), 'fautes_jeton_n': sum(1 for d in fik if d.get('aligne') and d['cout'] <= COUT_FAUTE and d['tok'] == 'ن')}

    # ---------------------------------------------------------------- madd
    M = jl(f'{MESURES}/madd.jsonl.gz')
    sortie = {}
    entonnoir = collections.Counter((d['ref'] == 'ayyoub', d['n_ok'], d['raison']) for d in M)
    sortie['entonnoir'] = {f'{"prod" if a else "symetrie"}|n_ok={n}|{r}': c for (a, n, r), c in sorted(entonnoir.items())}
    seuils_test = [0.60, 0.65, 0.70, 0.72, 0.75, 0.78, 0.80, 0.85]

    def bloc(L):
        par = collections.defaultdict(list)
        for d in L:
            par[d['hyp']].append(d['r'])
        out = {'n': len(L), 'n_par_voix': {v: len(x) for v, x in par.items()}, 'par_voix': {}}
        for v, x in par.items():
            x = sorted(x)
            k = int(math.floor(FA_MAX * len(x)))
            out['par_voix'][v] = {'min': x[0], 'p1': quant(x, .01), 'p2': quant(x, .02), 'p5': quant(x, .05), 'p50': quant(x, .5),
                                  'plus_grand_t_fa2': x[k] if k < len(x) else x[-1],
                                  'fa_par_seuil': {str(t): sum(1 for y in x if y < t) / len(x) for t in seuils_test}}
        tous = sorted(d['r'] for d in L)
        if par:
            out['plus_grand_t_fa2_chaque_voix'] = min(p['plus_grand_t_fa2'] for p in out['par_voix'].values())
            out['fa_globale_par_seuil'] = {str(t): sum(1 for y in tous if y < t) / len(tous) for t in seuils_test}
            out['fa_borne_haute_wilson95'] = {str(t): wilson_haut(sum(1 for y in tous if y < t), len(tous)) for t in seuils_test}
            out['min_global'] = tous[0]
            out['p1_global'] = quant(tous, .01)
            # une voix laissée de côté : t = 2 % le plus bas du lot réuni des 3 autres voix, mesuré sur la 4ᵉ
            lov = {}
            for v in par:
                autres = sorted(y for w, x in par.items() if w != v for y in x)
                if autres and par[v]:
                    t = autres[int(math.floor(FA_MAX * len(autres)))]
                    lov[v] = {'seuil': t, 'fa': sum(1 for y in par[v] if y < t) / len(par[v])}
            out['une_voix_laissee_de_cote'] = lov
        return out

    for typ in ('muttasil', 'lazim'):
        for n_ok in (True, False):
            L = [d for d in M if d['ref'] == 'ayyoub' and d['type'] == typ and d['n_ok'] == n_ok and d['raison'] == 'mesure']
            sortie[f'prod|{typ}|n_ok={n_ok}'] = bloc(L)
    L = [d for d in M if d['ref'] != 'ayyoub' and d['type'] == 'muttasil' and d['n_ok'] is False and d['raison'] == 'mesure']
    sortie['symetrie|muttasil|n_ok=False'] = bloc(L)
    L = [d for d in M if d['ref'] != 'ayyoub' and d['type'] == 'muttasil' and d['n_ok'] and d['raison'] == 'mesure']
    sortie['symetrie|muttasil|n_ok=True'] = bloc(L)
    # fautes simulées (étude du 25/10) : 10 raccourcis de muttaṣil (5 versets x 2 voix)
    mr = json.load(open(f'{ENTREE}/madd-resultats.json', encoding='utf-8'))
    court = [c for c in mr['cas'] if c['verite'] == 'court' and 'muttaṣil' in c['type']]
    rc = [c['r'] for c in court if c.get('r') is not None]
    sortie['fautes_simulees_muttasil'] = {
        'n': len(court), 'r_mesures': sorted(rc), 'silences': len(court) - len(rc),
        'detection_par_seuil': {str(t): sum(1 for y in rc if y < t) / len(court) for t in seuils_test},
        'note': 'raccourcis simulés par coupure (Ayyūb et al-Ḥudhayfī), 10 cas : un ordre de grandeur, pas une preuve'}
    sortie['fautes_simulees_lazim'] = {'n': 0, 'note': 'aucune faute simulée de lāzim dans l\'étude : détection non mesurable'}
    res['madd'] = sortie
    json.dump(res, open(SORTIE, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('ok', SORTIE)


if __name__ == '__main__':
    main()
