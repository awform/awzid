"""Aperçu préliminaire de qdat_bench : distributions des indices chez les apprenants justes / fautifs (étiquettes expertes).
Référence de durée : Ayyūb sur 5:109 (cache8), mesuré avec mesures2."""
import collections
import gzip
import json
import sys

import numpy as np

sys.path.insert(0, '/r')
sys.path.insert(0, '/p')
import mesures2 as M  # noqa: E402
import tajwid_commun as tc  # noqa: E402
from muaalem import lire_audio  # noqa: E402

z = np.load('/cache8/ayyoub/5_109.npz')
lp = {k: z[k].astype(np.float32) for k in ('phonemes', 'ghonna', 'qalqla', 'tafkheem_or_taqeeq')}
x = lire_audio('/src/ayyoub-hafs/10-005109-A03.mp3')
ay = M.mesurer_verset(tc.lire_tanzil()[(5, 109)], lp, int(z['n']), x)
refd = {}
for m in ay:
    if m.get('aligne'):
        refd[m['regle']] = m  # le dernier de chaque règle = celui de la fin du verset
print('réf Ayyūb', {k: round(v['dn'], 3) for k, v in refd.items() if 'dn' in v})
Q = [json.loads(l) for l in gzip.open(sys.argv[1], 'rt', encoding='utf-8')]
print('enregistrements', len(Q), 'coût médian', np.median([q['mesures'][0]['cout'] for q in Q if q['mesures']]))
print('coût > 0.25 :', sum(1 for q in Q if not q['mesures'] or q['mesures'][0]['cout'] > 0.25))


def occ(q, regle, deb=None):
    L = [m for m in q['mesures'] if m['regle'] == regle and m.get('aligne') and (deb is None or str(m['detail']).startswith(deb))]
    return L[-1] if L else None


def ghayn(q):
    for s in q['sifat'] or []:
        if s['phonemes'].startswith('غ'):
            return s['tafkheem_or_taqeeq'] == 'moraqaq'


def montre(nom, L):
    for etiq in (False, True):
        v = sorted(round(x, 3) for x, e in L if e == etiq)
        if v:
            print(f'  {nom:28s} {"FAUTE" if etiq else "juste"} n={len(v):3d} p2={v[int(.02*len(v))]} p10={v[int(.1*len(v))]} '
                  f'p50={v[len(v)//2]} p90={v[int(.9*len(v))]} p98={v[min(len(v)-1, int(.98*len(v)))]}')


lab = {'ghunna': lambda q: {1: False, 0: True}.get(q['noon_moshaddadah_len']),
       'ikhfa': lambda q: {2: False, 0: True}.get(q['noon_mokhfah_len']),
       'qalqala_kubra': lambda q: {1: False, 0: True}.get(q['qalqalah']),
       'emphatique': ghayn}
for regle, fl in lab.items():
    print(regle, collections.Counter(fl(q) for q in Q))
    feats = collections.defaultdict(list)
    for q in Q:
        e = fl(q)
        m = occ(q, regle, 'غ' if regle == 'emphatique' else None)
        if e is None or m is None or m['cout'] > 0.25:
            continue
        r = refd.get(regle)
        if r and 'dn' in m and m['dn'] > 0:
            feats['ref/dn'].append((r['dn'] / m['dn'], e))
        for k in ('P', ):
            for t in ('ن', 'ں', 'ڇ'):
                feats[f'P_{t}'].append((m['P'][t], e))
        for k in ('r_tabii', 'n_tabii', 'echo_db', 'rebond_db', 'echo_rel_db', 'P_rebond', 'qalqala_tete', 'tafkhim_cons', 'tafkhim_tete', 'dF2', 'F2', 'ghunna', 'm_creux'):
            if m.get(k) is not None:
                feats[k].append((m[k], e))
        feats['tok=' + m['tok']].append((1.0, e))
    for k, L in feats.items():
        montre(k, L)
