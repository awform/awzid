"""Idghām avec ghunna : pourquoi certaines occurrences justes sont-elles très courtes ? (Ayyūb, mesures2)"""
import collections
import gzip
import json

import numpy as np

C = [json.loads(l) for l in gzip.open('/out/ayyoub/correct.jsonl.gz', 'rt', encoding='utf-8')]
F = [json.loads(l) for l in gzip.open('/out/ayyoub/fautes.jsonl.gz', 'rt', encoding='utf-8')]
I = [d for d in C if d['regle'] == 'idgham_ghunna' and d.get('aligne') and d['cout'] <= 0.2 and d.get('r_tabii')]
court = [d for d in I if d['r_tabii'] < 0.5]
print('justes', len(I), 'courts (<0,5 ṭabīʿī)', len(court))
print('détail', collections.Counter(d['detail'] for d in court).most_common(6), '| tous', collections.Counter(d['detail'].split('>')[0] for d in I))
print('n unités (courts)', collections.Counter(d['n'] for d in court), '| n (tous)', collections.Counter(d['n'] for d in I))
print('durée du groupe précédent / ṭabīʿī (courts)', np.percentile([(d['t0'] - d['tp']) * d['fs'] / (d['duree'] / d['r_tabii']) for d in court], [10, 50, 90]).round(2))
print('durée du groupe précédent / ṭabīʿī (n=3)', np.percentile([(d['t0'] - d['tp']) * d['fs'] / (d['duree'] / d['r_tabii']) for d in I if d['n'] == 3], [10, 50, 90]).round(2))
print('versets des courts', [(d['s'], d['a'], d['detail']) for d in court[:12]])
# mesure « large » : du début du groupe précédent (voyelle du tanwīn ou du nūn) à la fin de la consonne d'arrivée
large = lambda d: (d['tn'] - d['tp']) * d['fs'] / (d['duree'] / d['r_tabii'])
v = sorted(large(d) for d in I)
print('r_large justes p1/p2/p5/p50', [round(v[int(q * len(v))], 2) for q in (0.01, 0.02, 0.05, 0.5)])
for typ in ('idgh_court', 'idgh_izhar'):
    L = [d for d in F if d['faute'] == typ and d.get('aligne') and d['cout'] <= 0.25 and d.get('r_tabii')]
    w = sorted(large(d) for d in L)
    print(typ, 'r_large fautes p10/p50/p90', [round(w[int(q * len(w))], 2) for q in (0.1, 0.5, 0.9)], 'n', len(w),
          'n unités', collections.Counter(d['n'] for d in L))
