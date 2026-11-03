"""Instants de mots : écart du début de mot (s) entre la lecture et les instants de référence du banc, mots reconnus à l'identique (squelette)."""
import difflib, statistics
exec(open('/p3/wq2.py').read().split("res =")[0])
mods = {'nemo_rnnt': mods['nemo'], 'qas_fp32': mods['qas_fp32']}
ec = {k: [] for k in mods}; k = 0
for sid, e in exp.items():
    if e['type'] != 'juste' or k >= 14: continue
    f = f'/bn/audio/{sid}.f32'
    if not os.path.exists(f): continue
    x = np.fromfile(f, dtype=np.float32); k += 1
    a = 2; seg = x[a*16000:(a+10)*16000]
    R = [(sq2(w), i) for w, i in zip(e['mots'], e['inst']) if i and a <= i[0] and i[1] <= a + 10]
    for nom, m in mods.items():
        H = [(sq2(w['w']), w['t0'] + a) for w in m.transcrire(seg) if sq2(w['w'])]
        sm = difflib.SequenceMatcher(None, [r[0] for r in R], [h[0] for h in H], autojunk=False)
        for b in sm.get_matching_blocks():
            for d in range(b.size): ec[nom].append(abs(R[b.a+d][1][0] - H[b.b+d][1]))
for nom, v in ec.items():
    v.sort(); print(nom, f'mots appariés {len(v)}, écart de début : médiane {v[len(v)//2]:.2f} s, 90e {v[int(.9*len(v))]:.2f} s')
