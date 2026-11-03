import json, sys, collections, itertools
B, F = sys.argv[1:3]
ev = json.load(open(f'{B}/{F}'))
exp = json.load(open(f'{B}/export-t3.json'))
ids = set(json.load(open(f'{B}/ids190.json'))) if len(sys.argv) > 3 else set(exp)
typ = {s: e['type'] for s, e in exp.items() if s in ids}
cnt = collections.Counter(typ.values())
print(cnt)
ev = [x for x in ev if x['s'] in ids and x['marge'] and x['avant'] >= 1 and x['apres'] >= 2]


def sess(pred):
    hit_v, hit_f = set(), set()
    for x in ev:
        if pred(x):
            (hit_v if x['vrai'] else hit_f).add(x['s'])
    tv = collections.Counter(typ[s] for s in hit_v)
    tf = collections.Counter(typ[s] for s in hit_f)
    return tv, tf


print('profil des événements (vrai vs faux) : nv, llr2')
for lab in (True, False):
    xs = [x for x in ev if x['vrai'] == lab]
    print(lab, len(xs), 'nv<=1:', sum(x['nv'] <= 1 for x in xs), 'nv 2-4:', sum(2 <= x['nv'] <= 4 for x in xs), 'nv>=5:', sum(x['nv'] >= 5 for x in xs))
print('--- grille : (nv_max, llr2_max) -> oubli/remp vus ; fausses séances par type')
for nvmax in (0, 1, 2, 4, 99):
    for th in (-30, -20, -12, -8, -4, 0):
        tv, tf = sess(lambda x: x['nv'] <= nvmax and x['llr2'] <= th)
        print(f'nv<={nvmax:2d} llr2<={th:4d}  oubli {tv["oubli"]}/{cnt["oubli"]} remp {tv["remplacement"]}/{cnt["remplacement"]} | FA',
              dict(tf))
