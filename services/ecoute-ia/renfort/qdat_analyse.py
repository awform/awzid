"""
Awzid — RENFORT DU TAJWĪD : analyse des fautes RÉELLES d'apprenants (QDAT, qdat_bench ; fin de 5:109).

Calibration « apprenants » : les récitants sont répartis en deux moitiés (hachage de l'identifiant du récitant). Le seuil
est appris sur les justes d'une moitié (≤ 2 % de fausses alertes), puis mesuré sur l'autre moitié (justes : fausses alertes ;
fautes : détection), et inversement. On donne aussi le résultat d'un seuil fixé à l'avance (`SEUILS_PRO`, appris sur les
voix professionnelles par analyse_renfort.py), quand il existe.

    python qdat_analyse.py  -> /out/qdat_resultats.json + résumé
"""
from __future__ import annotations

import collections
import gzip
import hashlib
import json
import math
import os
import sys

import numpy as np

sys.path.insert(0, '/r')
sys.path.insert(0, '/p')
O = '/out'
QDAT_FEMME = None
FA = 0.02


def jl(f):
    return [json.loads(l) for l in gzip.open(f, 'rt', encoding='utf-8')] if os.path.exists(f) else []


def wilson(k, n, z=1.96):
    if not n:
        return None
    p = k / n
    d = 1 + z * z / n
    return (p + z * z / (2 * n) + z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / d


def ref_ayyoub():
    """Mesures d'Ayyūb sur 5:109 (référence de durée du produit) : dernière occurrence de chaque règle (= fin du verset)."""
    C = jl(f'{O}/ayyoub/correct.jsonl.gz')
    ay = [d for d in C if (d['s'], d['a']) == (5, 109) and d.get('aligne')]
    if not ay:
        import mesures2 as M
        import tajwid_commun as tc
        from muaalem import lire_audio
        z = np.load('/cache8/ayyoub/5_109.npz')
        lp = {k: z[k].astype(np.float32) for k in ('phonemes', 'ghonna', 'qalqla', 'tafkheem_or_taqeeq')}
        ay = [m for m in M.mesurer_verset(tc.lire_tanzil()[(5, 109)], lp, int(z['n']), lire_audio('/src/ayyoub-hafs/10-005109-A03.mp3'))
              if m.get('aligne')]
    out = {}
    for m in ay:
        out[m['regle']] = m
    return out


REF = ref_ayyoub()


def occ(q, regle):
    L = [m for m in q['mesures'] if m['regle'] == regle and m.get('aligne')]
    return L[-1] if L else None


def div(a, b):
    return None if a is None or b is None or a <= 0 or b <= 0 else a / b


SC = {
    'ghunna': {'1/r_tabii': lambda m: div(1.0, m.get('r_tabii')), 'ref/dn': lambda m: div(REF['ghunna']['dn'], m['dn']),
               '-ghunna_tete': lambda m: -m['ghunna']},
    'ikhfa': {'1/r_tabii': lambda m: div(1.0, m.get('r_tabii')), 'ref/dn': lambda m: div(REF['ikhfa']['dn'], m['dn']),
              'P_n': lambda m: m['P']['ن'], '1-P_ں': lambda m: 1 - m['P']['ں'],
              'max(P_n,1/r_tabii-1)': lambda m: None if not m.get('r_tabii') else max(m['P']['ن'], 1 / m['r_tabii'] - 1)},
    'qalqala_kubra': {'-qalqala_tete': lambda m: -m.get('qalqala_tete', 1), '-P_rebond': lambda m: -m['P_rebond'],
                      '-echo_db': lambda m: None if 'echo_db' not in m else -m['echo_db'],
                      '-max(tete,P_rebond)': lambda m: -max(m.get('qalqala_tete', 1), m['P_rebond'])},
}


def locuteur(q):
    return str(q.get('original_id', q['id'])).rsplit('_', 1)[0]


def moitie(q):
    return int(hashlib.md5(locuteur(q).encode()).hexdigest(), 16) % 2


def etiquettes(q, src):
    if src == 'bench':
        return {'ghunna': {1: False, 0: True}.get(q['noon_moshaddadah_len']),
                'ikhfa': {2: False, 0: True}.get(q['noon_mokhfah_len']),
                'qalqala_kubra': {1: False, 0: True}.get(q['qalqalah'])}
    tn = q.get('the_tight_noon')
    return {'ghunna': None if tn is None or tn != tn else tn == 0, 'ikhfa': q['concealment'] == 0}


def seuil(v):
    v = sorted(v)
    return v[min(len(v) - 1, int(math.floor((1 - FA) * len(v))))] if v else None


def main():
    pro = json.load(open(f'{O}/seuils_pro.json')) if os.path.exists(f'{O}/seuils_pro.json') else {}
    res = {'ref_ayyoub_dn': {k: v.get('dn') for k, v in REF.items()}}
    B = jl(f'{O}/qdat_bench.jsonl.gz')
    Q = jl(f'{O}/qdat_qdat.jsonl.gz')
    # accord des deux annotations (QDAT d'origine / réannotation experte de qdat_bench) sur les mêmes enregistrements
    bq = {q['original_id']: q for q in Q}
    acc = collections.Counter()
    for q in B:
        o = bq.get(q['original_id'])
        if o:
            e1, e2 = etiquettes(q, 'bench'), etiquettes(o, 'qdat')
            for r in ('ghunna', 'ikhfa'):
                acc[f'{r}: bench={e1[r]} qdat={e2[r]}'] += 1
            acc[f'genre: bench={q["gender"]} qdat={o["gender"]}'] += 1
    # codage du genre dans QDAT (0/1) déduit des mêmes enregistrements dans qdat_bench (« female » / « male »)
    g = collections.Counter((q['gender'], bq[q['original_id']]['gender']) for q in B if q['original_id'] in bq)
    global QDAT_FEMME
    QDAT_FEMME = max((v for (b, v) in g if b == 'female'), key=lambda v: g[('female', v)], default=None)
    res['qdat_code_femme'] = QDAT_FEMME
    res['accord_bench_qdat'] = dict(sorted(acc.items()))
    res['n'] = {'bench': len(B), 'qdat': len(Q), 'locuteurs_qdat': len({locuteur(q) for q in Q}),
                'genre_bench': dict(collections.Counter(q['gender'] for q in B)), 'genre_qdat': dict(collections.Counter(q['gender'] for q in Q)),
                'age_qdat': {'<15': sum(1 for q in Q if q['age'] < 15), '15-25': sum(1 for q in Q if 15 <= q['age'] < 25),
                             '>=25': sum(1 for q in Q if q['age'] >= 25)}}
    print(json.dumps(res, ensure_ascii=False, indent=1))
    res['regles'] = {}
    for src, D in (('bench', B), ('qdat', Q)):
        for regle, fns in SC.items():
            for nom, fn in fns.items():
                rows = []
                for q in D:
                    e = etiquettes(q, src).get(regle)
                    if e is None:
                        continue
                    m = occ(q, regle)
                    cout = q['mesures'][0]['cout'] if q['mesures'] else 9
                    v = None
                    if m is not None and cout <= 0.25:
                        try:
                            v = fn(m)
                        except (KeyError, TypeError):
                            v = None
                    rows.append({'v': v, 'faute': e, 'moitie': moitie(q), 'gender': q['gender'], 'age': q['age']})
                if not rows:
                    continue
                r = {'justes': sum(1 for x in rows if not x['faute']), 'fautes': sum(1 for x in rows if x['faute']),
                     'silences_justes': sum(1 for x in rows if not x['faute'] and x['v'] is None),
                     'silences_fautes': sum(1 for x in rows if x['faute'] and x['v'] is None)}
                # validation croisée par récitant (2 moitiés)
                kfa = nj = kdet = nf = 0
                fem = [0, 0]
                enf = [0, 0]
                for h in (0, 1):
                    t = seuil([x['v'] for x in rows if x['moitie'] == h and not x['faute'] and x['v'] is not None])
                    if t is None:
                        continue
                    for x in rows:
                        if x['moitie'] == h:
                            continue
                        if x['faute']:
                            nf += 1
                            kdet += int(x['v'] is not None and x['v'] > t)
                        elif x['v'] is not None:
                            nj += 1
                            al = int(x['v'] > t)
                            kfa += al
                            if x['gender'] == 'female' or (src == 'qdat' and x['gender'] == QDAT_FEMME):
                                fem[0] += al; fem[1] += 1
                            if (x['age'] or 99) < 15:
                                enf[0] += al; enf[1] += 1
                r['croise'] = {'fa': kfa / nj if nj else None, 'fa_wilson95': wilson(kfa, nj), 'n_justes': nj,
                               'detection': kdet / nf if nf else None, 'n_fautes': nf,
                               'fa_femmes': (fem[0] / fem[1], fem[1]) if fem[1] else None,
                               'fa_enfants_<15': (enf[0] / enf[1], enf[1]) if enf[1] else None,
                               'seuil_moitie0': seuil([x['v'] for x in rows if x['moitie'] == 0 and not x['faute'] and x['v'] is not None]),
                               'seuil_moitie1': seuil([x['v'] for x in rows if x['moitie'] == 1 and not x['faute'] and x['v'] is not None])}
                tp = pro.get(f'{regle}::{nom}')
                if tp is not None:
                    J = [x for x in rows if not x['faute'] and x['v'] is not None]
                    Fx = [x for x in rows if x['faute']]
                    k = sum(1 for x in J if x['v'] > tp)
                    r['seuil_pro'] = {'seuil': tp, 'fa': k / len(J) if J else None, 'fa_wilson95': wilson(k, len(J)),
                                      'detection': sum(1 for x in Fx if x['v'] is not None and x['v'] > tp) / len(Fx) if Fx else None}
                res['regles'][f'{src}|{regle}::{nom}'] = r
                c = r['croise']
                sp = r.get('seuil_pro', {})
                print(f'{src:5s} {regle:13s} {nom:22s} justes={r["justes"]:3d} fautes={r["fautes"]:3d} | croisé : FA={c["fa"] if c["fa"] is None else round(c["fa"], 3)} '
                      f'(≤{c["fa_wilson95"] if c["fa_wilson95"] is None else round(c["fa_wilson95"], 3)}) DET={c["detection"] if c["detection"] is None else round(c["detection"], 3)} '
                      f'femmes={c["fa_femmes"]} enfants={c["fa_enfants_<15"]}'
                      + (f' | seuil pro {sp["seuil"]:.3g}: FA={sp["fa"]:.3f} DET={sp["detection"]:.3f}' if sp else ''), flush=True)
    # combinaison de plusieurs indices (régression logistique), apprise sur une moitié des récitants, testée sur l'autre
    from sklearn.linear_model import LogisticRegression
    COMBIS = {'ghunna': ['1/r_tabii', 'ref/dn', '-ghunna_tete'], 'ikhfa': ['1/r_tabii', 'ref/dn', 'P_n', '1-P_ں'],
              'qalqala_kubra': ['-qalqala_tete', '-P_rebond', '-echo_db']}
    for src, D in (('bench', B), ('qdat', Q)):
        for regle, noms in COMBIS.items():
            X, y, h, fem = [], [], [], []
            n_f_tot = [0, 0]
            for q in D:
                e = etiquettes(q, src).get(regle)
                if e is None:
                    continue
                n_f_tot[moitie(q)] += int(e)
                m = occ(q, regle)
                cout = q['mesures'][0]['cout'] if q['mesures'] else 9
                if m is None or cout > 0.25:
                    continue
                try:
                    v = [SC[regle][n](m) for n in noms]
                except (KeyError, TypeError):
                    continue
                if any(x is None or not np.isfinite(x) for x in v):
                    continue
                X.append(v); y.append(int(e)); h.append(moitie(q))
                fem.append(q['gender'] == 'female' or (src == 'qdat' and q['gender'] == QDAT_FEMME))
            if not X:
                continue
            X, y, h, fem = np.array(X), np.array(y), np.array(h), np.array(fem)
            kfa = nj = kdet = 0
            kfem = nfem = 0
            for k in (0, 1):
                a, b = h == k, h != k
                if y[a].sum() < 5:
                    continue
                mu, sd = X[a].mean(0), X[a].std(0) + 1e-9
                clf = LogisticRegression(class_weight='balanced', max_iter=2000).fit((X[a] - mu) / sd, y[a])
                s_a = clf.decision_function((X[a] - mu) / sd)
                t = seuil(list(s_a[y[a] == 0]))
                s_b = clf.decision_function((X[b] - mu) / sd)
                kfa += int((s_b[y[b] == 0] > t).sum()); nj += int((y[b] == 0).sum())
                kdet += int((s_b[y[b] == 1] > t).sum())
                kfem += int((s_b[(y[b] == 0) & fem[b]] > t).sum()); nfem += int(((y[b] == 0) & fem[b]).sum())
            nf = sum(n_f_tot)
            r = {'indices': noms, 'fa': kfa / nj if nj else None, 'fa_wilson95': wilson(kfa, nj), 'n_justes': nj,
                 'detection': kdet / nf if nf else None, 'n_fautes': nf, 'fa_femmes': (kfem / nfem, nfem) if nfem else None}
            res['regles'][f'{src}|{regle}::combinaison'] = {'croise': r}
            print(f'{src:5s} {regle:13s} COMBINAISON {"+".join(noms)} : FA={r["fa"]} DET={r["detection"]} femmes={r["fa_femmes"]}', flush=True)
    json.dump(res, open(f'{O}/qdat_resultats.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1, default=str)


if __name__ == '__main__':
    main()
