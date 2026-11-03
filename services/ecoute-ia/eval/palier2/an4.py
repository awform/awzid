import json, sys, collections
B, F, IDF = sys.argv[1:4]
ev = json.load(open(f'{B}/{F}'))
exp = json.load(open(f'{B}/export-t3.json'))
ids = set(json.load(open(f'{B}/{IDF}'))) if IDF != '-' else set(exp)
typ = {s: e['type'] for s, e in exp.items() if s in ids}
cnt = collections.Counter(typ.values())
ev = [x for x in ev if x['s'] in ids]
print(cnt, len(ev))
for key in ('d1', 'd3'):
    for nvmin in (2, 3, 5):
        for th in (-2, -5, -8, -12, -16, -24):
            hv, hf = set(), set()
            for x in ev:
                if x['nv'] >= nvmin and x[key] <= th:
                    (hv if x['vrai'] else hf).add(x['s'])
            tv = collections.Counter(typ[s] for s in hv)
            tf = collections.Counter(typ[s] for s in hf)
            print(key, 'nv>=', nvmin, th, 'remp', tv['remplacement'], 'oubli', tv['oubli'], '| FA', dict(tf))
