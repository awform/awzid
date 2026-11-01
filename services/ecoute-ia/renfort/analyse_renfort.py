"""
Awzid — RENFORT DU TAJWĪD : analyse (recherche interne). Seuils appris sur les voix d'ENTRAÎNEMENT seulement, puis mesurés sur
des voix de TEST jamais vues (fausses alertes, fautes simulées) et sur les fautes RÉELLES d'apprenants de QDAT / qdat_bench.

    python analyse_renfort.py  -> /out/renfort_resultats.json et un résumé lisible sur la sortie standard

Règle d'or : seuil = plus petite valeur telle que chaque voix d'entraînement (≥ 40 occurrences) ET le lot d'entraînement réuni
aient au plus 2 % de fausses alertes. Une règle n'est « prête » que si, sur les voix de TEST : fausses alertes ≤ 2 % (lot réuni,
et aucune voix au-dessus de 4 %), détection ≥ 90 % des fautes simulées, et, quand QDAT la couvre, fausses alertes ≤ 2 % sur les
apprenants jugés justes.
"""
from __future__ import annotations

import collections
import glob
import gzip
import json
import math
import os

import numpy as np

S = os.environ.get('SORTIES', '/out')
TRAIN = ['ayyoub', 'akhdar', 'huthify', 'muaiqly', 'muhanna', 'Abdul_Basit_Murattal_192kbps', 'Abdul_Basit_Mujawwad_128kbps',
         'Alafasy_128kbps', 'Abdurrahmaan_As-Sudais_192kbps', 'Muhsin_Al_Qasim_192kbps', 'Ali_Jaber_64kbps',
         'Abdullah_Matroud_128kbps', 'Khaalid_Abdullaah_al-Qahtaanee_192kbps', 'Yasser_Ad-Dussary_128kbps', 'Salah_Al_Budair_128kbps',
         'Abdullaah_3awwaad_Al-Juhaynee_128kbps']
TEST = ['Husary_128kbps', 'Husary_Muallim_128kbps', 'Abdullah_Basfar_192kbps', 'Abu_Bakr_Ash-Shaatree_128kbps',
        'Ahmed_ibn_Ali_al-Ajamy_128kbps_ketaballah.net', 'Hani_Rifai_192kbps', 'Ghamadi_40kbps', 'Fares_Abbad_64kbps',
        'Ahmed_Neana_128kbps', 'Akram_AlAlaqimy_128kbps', 'Sahl_Yassin_128kbps', 'mahmoud_ali_al_banna_32kbps', 'Nasser_Alqatami_128kbps',
        'Minshawy_Murattal_128kbps', 'Mohammad_al_Tablaway_128kbps', 'Muhammad_Jibreel_128kbps', 'Saood_ash-Shuraym_128kbps']
FA = 0.02
N_MIN_VOIX = 40
COUT_MAX, COUT_FAUTE = 0.20, 0.25


def jl(f):
    return [json.loads(l) for l in gzip.open(f, 'rt', encoding='utf-8')] if os.path.exists(f) else []


def wilson(k, n, z=1.96):
    if n == 0:
        return None
    p = k / n
    d = 1 + z * z / n
    return (p + z * z / (2 * n) + z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / d


C, F = {}, {}
for v in TRAIN + TEST:
    C[v] = [d for d in jl(f'{S}/{v}/correct.jsonl.gz') if d.get('aligne') and d['cout'] <= COUT_MAX and d.get('tok') == d.get('att_tok')]
    F[v] = [d for d in jl(f'{S}/{v}/fautes.jsonl.gz')]
REF = {(d['s'], d['a'], str(d['oid'])): d for d in C.get('ayyoub', [])}


def ref(d, cle='dn'):
    r = REF.get((d['s'], d['a'], str(d['oid'])))
    if r is None or d.get('rec') == 'ayyoub':
        return None
    if cle == 'large':
        return (r['tn'] - r['tp']) * r['fs'] / r['rate'] if 'tp' in r else None
    return r.get(cle) or None


def div(a, b):
    return None if a is None or b is None or b <= 0 or a <= 0 else a / b


# score : plus grand = plus suspect. (règle, {nom : fonction})
SC = {
    'ghunna': {'ref/dn': lambda d: div(ref(d), d['dn']), '1/r_tabii': lambda d: div(1.0, d.get('r_tabii'))},
    'ikhfa': {'ref/dn': lambda d: div(ref(d), d['dn']), 'P_n': lambda d: d['P']['ن'], '1/r_tabii': lambda d: div(1.0, d.get('r_tabii')),
              '1-P_ں': lambda d: 1 - d['P']['ں']},
    'izhar': {'dn/ref': lambda d: div(d['dn'], ref(d)), 'r_tabii': lambda d: d.get('r_tabii')},
    'idgham_ghunna': {'ref/dn (ancien)': lambda d: div(ref(d), d['dn']),
                      'ref_bloc/dn_bloc': lambda d: div(ref(d, 'dn_bloc'), d.get('dn_bloc')),
                      '1/r_tabii_bloc': lambda d: div(1.0, d.get('r_tabii_bloc')),
                      # fenêtre large : la tenue nasale du tanwīn est souvent écrite DANS la voyelle du tanwīn (diagnostic du 1/11)
                      '1/r_large': lambda d: div(d['duree'] / d['r_tabii'], (d['tn'] - d['tp']) * d['fs']) if d.get('r_tabii') else None,
                      'ref_large/large': lambda d: div(ref(d, 'large'), (d['tn'] - d['tp']) * d['fs'] / d['rate']), 'Pp_n': lambda d: d['Pp']['ن'], 'Pp_n+m': lambda d: d['Pp']['ن'] + d['Pp']['م'],
                      '-ghunna_bloc': lambda d: -d['ghunna_bloc'] if 'ghunna_bloc' in d else None},
    'idgham_sans': {'Pp_n|ں': lambda d: max(d['Pp']['ن'], d['Pp']['ں']), 'Pp_n': lambda d: d['Pp']['ن']},
    'iqlab': {'P_n|ں (ancien)': lambda d: max(d['P']['ن'], d['P']['ں']), 'P_n': lambda d: d['P']['ن'],
              '1-P_۾': lambda d: 1 - d['P']['۾'], 'ref/dn': lambda d: div(ref(d), d['dn']), '1/r_tabii': lambda d: div(1.0, d.get('r_tabii')),
              'm_creux': lambda d: d.get('m_creux'), 'f2_pente': lambda d: d.get('f2_pente')},
    'lam_allah_tafkhim': {'1-tafkhim (ancien)': lambda d: 1 - d['tafkhim_tete'], 'dF2': lambda d: d.get('dF2'),
                          'rF2': lambda d: d.get('rF2'), '-tafkhim_cons': lambda d: -d['tafkhim_cons']},
    'lam_allah_tarqiq': {'tafkhim': lambda d: d['tafkhim_tete'], '-dF2': lambda d: None if d.get('dF2') is None else -d['dF2']},
    'qalqala_kubra': {'-echo_db': lambda d: None if 'echo_db' not in d else -d['echo_db'],
                      '-P_rebond': lambda d: -d['P_rebond'], '-qalqala_tete': lambda d: -d.get('qalqala_tete', 1), '-echo_rel': lambda d: None if 'echo_rel_db' not in d else -d['echo_rel_db']},
    'qalqala_sughra': {'-echo_db': lambda d: None if 'echo_db' not in d else -d['echo_db'],
                       '-P_rebond': lambda d: -d['P_rebond'], '-qalqala_tete': lambda d: -d.get('qalqala_tete', 1)},
    'madd_long': {'-r_tabii': lambda d: None if not d.get('r_tabii') else -d['r_tabii'], 'ref/dn': lambda d: div(ref(d), d['dn'])},
    'ra_tafkhim': {'-tafkhim': lambda d: -d['tafkhim_tete'], 'dF2': lambda d: d.get('dF2')},
    'ra_tarqiq': {'tafkhim': lambda d: d['tafkhim_tete'], '-dF2': lambda d: None if d.get('dF2') is None else -d['dF2']},
    'emphatique': {'-tafkhim': lambda d: -d['tafkhim_tete'], 'dF2': lambda d: d.get('dF2')},
}
FAUTES_DE = {'ghunna': ['ghunna_court70', 'ghunna_court50'], 'ikhfa': ['ikhfa_court', 'ikhfa_izhar'], 'izhar': ['izhar_long'],
             'idgham_ghunna': ['idgh_court', 'idgh_izhar'], 'idgham_sans': ['idghs_n'],
             'iqlab': ['iqlab_court', 'iqlab_izhar', 'iqlab_n'], 'lam_allah_tafkhim': ['lam_leger'], 'lam_allah_tarqiq': ['lam_lourd'],
             'qalqala_kubra': ['qalq_kubra_sans'], 'qalqala_sughra': ['qalq_sughra_sans'], 'madd_long': ['madd_court']}


def valeurs(L, fn):
    out = []
    for d in L:
        try:
            v = fn(d)
        except (KeyError, TypeError):
            v = None
        if v is not None and np.isfinite(v):
            out.append(v)
    return out


def seuil(par_voix):
    tous = sorted(x for L in par_voix.values() for x in L)
    if not tous:
        return None
    t = tous[min(len(tous) - 1, int(math.floor((1 - FA) * len(tous))))]
    for L in par_voix.values():
        if len(L) >= N_MIN_VOIX:
            L = sorted(L)
            t = max(t, L[min(len(L) - 1, int(math.floor((1 - FA) * len(L))))])
    return t


def filtre(regle, d, sous=None):
    if regle == 'madd_long' and sous and d.get('type') != sous and d.get('type_madd') != sous:
        return False
    return True


def evaluer(regle, nom, fn, sous=None):
    trn = {v: valeurs([d for d in C[v] if d['regle'] == regle and filtre(regle, d, sous)], fn) for v in TRAIN}
    tst = {v: valeurs([d for d in C[v] if d['regle'] == regle and filtre(regle, d, sous)], fn) for v in TEST}
    t = seuil(trn)
    if t is None:
        return None
    r = {'mesure': nom, 'seuil': t, 'n_train': sum(map(len, trn.values())), 'n_test': sum(map(len, tst.values()))}
    k = sum(1 for L in tst.values() for x in L if x > t)
    n = sum(map(len, tst.values()))
    r['fa_test'] = k / n if n else None
    r['fa_test_wilson95'] = wilson(k, n)
    r['fa_test_par_voix'] = {v: (round(sum(1 for x in L if x > t) / len(L), 4), len(L)) for v, L in tst.items() if L}
    r['fa_train_par_voix'] = {v: (round(sum(1 for x in L if x > t) / len(L), 4), len(L)) for v, L in trn.items() if L}
    det = {}
    for typ in FAUTES_DE.get(regle, []):
        for part, voix in (('train', TRAIN), ('test', TEST)):
            Lf = [d for v in voix for d in F[v] if d['faute'] == typ and filtre(regle, d, sous)]
            ok = [d for d in Lf if d.get('aligne') and d['cout'] <= COUT_FAUTE]
            sc = valeurs(ok, fn)
            det[f'{typ}|{part}'] = {'n': len(Lf), 'mesurees': len(sc), 'detection': (sum(1 for x in sc if x > t) / len(Lf)) if Lf else None}
    r['fautes'] = det
    return r


# ------------------------------------------------------------------ combinaison (régression logistique), apprise sur l'entraînement
def combinaison(regle, noms, typ):
    from sklearn.linear_model import LogisticRegression
    fns = [SC[regle][n] for n in noms]

    def X(L):
        rows, keep = [], []
        for d in L:
            try:
                v = [f(d) for f in fns]
            except (KeyError, TypeError):
                continue
            if any(x is None or not np.isfinite(x) for x in v):
                continue
            rows.append(v)
            keep.append(d)
        return np.array(rows, float), keep
    Xc, _ = X([d for v in TRAIN for d in C[v] if d['regle'] == regle])
    Xf, _ = X([d for v in TRAIN for d in F[v] if d['faute'] == typ and d.get('aligne') and d['cout'] <= COUT_FAUTE])
    if len(Xf) < 15 or len(Xc) < 50:
        return None
    mu, sd = Xc.mean(0), Xc.std(0) + 1e-9
    clf = LogisticRegression(class_weight='balanced', max_iter=2000).fit(np.vstack([(Xc - mu) / sd, (Xf - mu) / sd]),
                                                                          np.r_[np.zeros(len(Xc)), np.ones(len(Xf))])

    def fn(d):
        try:
            v = np.array([f(d) for f in fns], float)
        except (KeyError, TypeError):
            return None
        if not np.all(np.isfinite(v)):
            return None
        return float(clf.decision_function(((v - mu) / sd)[None])[0])
    SC[regle][f'combi[{"+".join(noms)}]→{typ}'] = fn
    return fn


# ------------------------------------------------------------------ QDAT : fautes réelles (fin de 5:109)
def qdat():
    Qb = jl(f'{S}/qdat_bench.jsonl.gz')
    Qq = jl(f'{S}/qdat_qdat.jsonl.gz')
    ay = [d for d in C.get('ayyoub', []) if (d['s'], d['a']) == (5, 109)]

    def occ(mes, regle, detail_debut=None):
        L = [m for m in mes if m['regle'] == regle and m.get('aligne') and (detail_debut is None or str(m['detail']).startswith(detail_debut))]
        return L[-1] if L else None
    ref_ay = {}
    for regle in ('ghunna', 'ikhfa', 'qalqala_kubra'):
        L = [d for d in ay if d['regle'] == regle]
        if L:
            ref_ay[regle] = L[-1]
    out = {'n_bench': len(Qb), 'n_qdat': len(Qq), 'ref_ayyoub': {k: v['dn'] for k, v in ref_ay.items()}}

    def ghayn_leger(sifat):
        for x in sifat or []:
            if x['phonemes'].startswith('غ'):
                return x['tafkheem_or_taqeeq'] == 'moraqaq'
        return None

    def lignes(Q, etiq):
        R = []
        for q in Q:
            mes = q['mesures']
            cout = mes[0]['cout'] if mes else 9
            e = etiq(q)
            for regle, faute in e.items():
                if faute is None:
                    continue
                R.append({'regle': regle, 'faute': faute, 'cout': cout, 'id': q['id'], 'gender': q.get('gender'), 'age': q.get('age'),
                          'm': occ(mes, regle, 'غ' if regle == 'emphatique' else None)})
        return R
    eb = lambda q: {'ghunna': {1: False, 0: True}.get(q['noon_moshaddadah_len']),
                    'ikhfa': {2: False, 0: True}.get(q['noon_mokhfah_len']),
                    'qalqala_kubra': {1: False, 0: True}.get(q['qalqalah']),
                    'emphatique': ghayn_leger(q.get('sifat'))}
    eq = lambda q: {'ghunna': None if q['the_tight_noon'] is None or q['the_tight_noon'] != q['the_tight_noon'] else q['the_tight_noon'] == 0,
                    'ikhfa': q['concealment'] == 0}
    out['bench'] = lignes(Qb, eb)
    out['qdat'] = lignes(Qq, eq)
    # accord entre les deux annotations (mêmes enregistrements : original_id)
    bq = {q['original_id']: q for q in Qq}
    acc = collections.Counter()
    for q in Qb:
        o = bq.get(q['original_id'])
        if o:
            acc[('ghunna', q['noon_moshaddadah_len'], o['the_tight_noon'])] += 1
            acc[('ikhfa', q['noon_mokhfah_len'], o['concealment'])] += 1
    out['accord_bench_qdat'] = {str(k): v for k, v in sorted(acc.items(), key=str)}
    out['genres_bench'] = dict(collections.Counter(q['gender'] for q in Qb))
    out['genres_qdat'] = dict(collections.Counter(q['gender'] for q in Qq))
    out['cout_median'] = float(np.median([q['mesures'][0]['cout'] for q in Qq + Qb if q['mesures']])) if Qq + Qb else None
    return out, ref_ay


def eval_qdat(Qd, ref_ay, regle, nom, fn, t):
    res = {}
    for part in ('bench', 'qdat'):
        L = [x for x in Qd[part] if x['regle'] == regle]
        if not L:
            continue
        sc_j, sc_f, sil_j, sil_f = [], [], 0, 0
        for x in L:
            m = x['m']
            v = None
            if m is not None and x['cout'] <= COUT_FAUTE:
                mm = dict(m)
                if regle in ref_ay:
                    mm['rec'] = 'qdat'
                    r = ref_ay[regle]
                    REF[('q', 'q', 'q')] = r
                    mm['s'], mm['a'], mm['oid'] = 'q', 'q', 'q'
                try:
                    v = fn(mm)
                except (KeyError, TypeError):
                    v = None
            if v is None:
                if x['faute']:
                    sil_f += 1
                else:
                    sil_j += 1
                continue
            (sc_f if x['faute'] else sc_j).append((v, x))
        nj = len(sc_j) + sil_j
        nf = len(sc_f) + sil_f
        kj = sum(1 for v, _ in sc_j if v > t)
        res[part] = {'justes': nj, 'justes_mesures': len(sc_j), 'fa': (kj / len(sc_j)) if sc_j else None,
                     'fa_wilson95': wilson(kj, len(sc_j)), 'fautes': nf, 'fautes_mesurees': len(sc_f),
                     'detection': (sum(1 for v, _ in sc_f if v > t) / nf) if nf else None,
                     'fa_femmes': None, 'fa_enfants_<15': None}
        fem = [v for v, x in sc_j if x['gender'] in ('female', 1)]
        enf = [v for v, x in sc_j if (x['age'] or 99) < 15]
        if fem:
            res[part]['fa_femmes'] = (round(sum(1 for v in fem if v > t) / len(fem), 4), len(fem))
        if enf:
            res[part]['fa_enfants_<15'] = (round(sum(1 for v in enf if v > t) / len(enf), 4), len(enf))
    return res


def main():
    out = {'train': TRAIN, 'test': TEST,
           'occurrences': {v: dict(collections.Counter(d['regle'] for d in C[v])) for v in TRAIN + TEST},
           'fautes_simulees': {v: dict(collections.Counter(d['faute'] for d in F[v])) for v in TRAIN + TEST}, 'regles': {}}
    combis = {'iqlab': [(['P_n', '1-P_۾', 'ref/dn'], 'iqlab_izhar'), (['P_n', '1-P_۾', 'm_creux', 'f2_pente'], 'iqlab_n')],
              'idgham_ghunna': [(['1/r_large', 'Pp_n', '-ghunna_bloc'], 'idgh_izhar'), (['1/r_large', 'ref_large/large'], 'idgh_court')],
              'lam_allah_tafkhim': [(['dF2', '-tafkhim_cons'], 'lam_leger')],
              'qalqala_sughra': [(['-echo_db', '-P_rebond'], 'qalq_sughra_sans')],
              'qalqala_kubra': [(['-P_rebond', '-qalqala_tete', '-echo_db'], 'qalq_kubra_sans')],
              'ghunna': [(['ref/dn', '1/r_tabii'], 'ghunna_court70')],
              'ikhfa': [(['ref/dn', '1/r_tabii', 'P_n', '1-P_ں'], 'ikhfa_izhar')]}
    for regle, L in combis.items():
        for noms, typ in L:
            combinaison(regle, noms, typ)
    Qd, ref_ay = qdat()
    out['qdat_meta'] = {k: v for k, v in Qd.items() if k not in ('bench', 'qdat')}
    for regle, fns in SC.items():
        sous_types = ['lazim', 'hamza'] if regle == 'madd_long' else [None]
        for sous in sous_types:
            for nom, fn in fns.items():
                r = evaluer(regle, nom, fn, sous)
                if r is None:
                    continue
                if regle in ('ghunna', 'ikhfa', 'qalqala_kubra', 'emphatique'):
                    r['qdat_reel'] = eval_qdat(Qd, ref_ay, regle, nom, fn, r['seuil'])
                cle = f'{regle}{"/" + sous if sous else ""}::{nom}'
                out['regles'][cle] = r
                det = ' '.join(f'{k}={v["detection"]:.2f}({v["n"]})' for k, v in r['fautes'].items() if v['detection'] is not None)
                q = r.get('qdat_reel', {})
                qs = ' '.join(f'{p}:FA={x["fa"] if x["fa"] is None else round(x["fa"], 3)}/{x["justes_mesures"]} DET={x["detection"] if x["detection"] is None else round(x["detection"], 3)}/{x["fautes"]}'
                              for p, x in q.items())
                pires = max((x[0] for x in r['fa_test_par_voix'].values()), default=None)
                print(f'{cle:55s} t={r["seuil"]:.4g} FAtest={r["fa_test"] if r["fa_test"] is None else round(r["fa_test"], 4)} '
                      f'(n={r["n_test"]}, pire voix {pires}) {det} {qs}', flush=True)
    json.dump(out, open(f'{S}/renfort_resultats.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1, default=str)


if __name__ == '__main__':
    main()
