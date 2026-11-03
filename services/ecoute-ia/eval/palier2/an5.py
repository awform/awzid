import json, sys, collections
B, F, IDF = sys.argv[1:4]
ev = json.load(open(f'{B}/{F}'))
exp = json.load(open(f'{B}/export-t3.json'))
ids = set(json.load(open(f'{B}/{IDF}'))) if IDF != '-' else set(exp)
typ = {s: e['type'] for s, e in exp.items() if s in ids}
cnt = collections.Counter(typ.values())
ev = [x for x in ev if x['s'] in ids and x['fin_ok']]
print(cnt, len(ev))
print('--- ratio (durée du mot / durée attendue pour cette voix)')
for th in (1.5, 2, 2.5, 3, 4):
    for gmin in (0, 0.3):
        hv, hf = set(), set()
        for x in ev:
            if x['ratio'] >= th and x['gv'] >= gmin:
                (hv if x['vrai'] else hf).add(x['s'])
        tf = collections.Counter(typ[s] for s in hf)
        print(f'ratio>={th} gv>={gmin}: ajout {len(hv)}/{cnt["ajout"]} | FA', dict(tf))
print('--- voix dans le trou (s) entre deux mots consécutifs')
for gv in (0.3, 0.5, 0.8, 1.2, 1.6):
    hv, hf = set(), set()
    for x in ev:
        if x['gv'] >= gv:
            (hv if x['vrai'] else hf).add(x['s'])
    tf = collections.Counter(typ[s] for s in hf)
    print(f'gv>={gv}: ajout {len(hv)}/{cnt["ajout"]} | FA', dict(tf))
