import json, sys, collections
B, F = sys.argv[1:3]
ev = json.load(open(f'{B}/{F}'))
exp = json.load(open(f'{B}/export-t3.json'))
typ = {s: e['type'] for s, e in exp.items()}
ev = [x for x in ev if x['marge'] and x['avant'] >= 1 and x['apres'] >= 2 and x['nv'] >= 3 and x['s'] in typ]
cnt = collections.Counter(typ.values())
if len(sys.argv) > 3:
    ids = set(json.load(open(f'{B}/{sys.argv[3]}')))
    ev = [x for x in ev if x['s'] in ids]
    cnt = collections.Counter(t for s, t in typ.items() if s in ids)
print(cnt)
for key in ('llr0', 'llr2', 'llr4'):
    for th in (-20, -40, -60, -80, -100, -140):
        hv, hf = set(), set()
        for x in ev:
            if x[key] <= th:
                (hv if x['vrai'] else hf).add(x['s'])
        tv = collections.Counter(typ[s] for s in hv)
        tf = collections.Counter(typ[s] for s in hf)
        print(key, th, 'oubli', tv['oubli'], 'remp', tv['remplacement'], '| FA', dict(tf))
