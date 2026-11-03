"""Levier 4 bis : Abdou/quran-asr-small contre le modèle NeMo actuel (même 14 séances justes du banc neutre, 2 fenêtres de 10 s, mêmes références que palier2/wq.py)."""
import json, os, re, sys, time
import numpy as np
sys.path[:0] = ['/code', '/p3']
import asr, qas
TH = int(os.environ.get('TH', '1'))
exp = json.load(open('/bn/export-t3.json'))
HAR = re.compile('[ً-ٰٟۖ-ۭـ]')
def sq(w):
    w = HAR.sub('', w)
    return w.replace('ٱ', 'ا').replace('أ', 'ا').replace('إ', 'ا').replace('آ', 'ا').replace('ى', 'ي').replace('ة', 'ه')
def sq2(w):  # lenient : hamza portée = ء, alef ignorés (écarts de rasm)
    return sq(w).replace('ؤ', 'ء').replace('ئ', 'ء').replace('ا', '')
def wer(ref, hyp):
    n, m = len(ref), len(hyp)
    d = list(range(m + 1))
    for i in range(1, n + 1):
        p, d[0] = d[0], i
        for j in range(1, m + 1):
            p, d[j] = d[j], min(d[j] + 1, d[j - 1] + 1, p + (ref[i - 1] != hyp[j - 1]))
    return d[m], n
mods = {'nemo': asr.NemoRNNT('/model/stt_ar_fastconformer_hybrid_large_pcd_v1.0.nemo', TH),
        'qas_fp32': qas.QuranSmall(TH, False), 'qas_int8': qas.QuranSmall(TH, True)}
res = {k: {'a': [0, 0], 'b': [0, 0], 't': []} for k in mods}
k = 0
for sid, e in exp.items():
    if e['type'] != 'juste' or k >= 14: continue
    f = f'/bn/audio/{sid}.f32'
    if not os.path.exists(f): continue
    x = np.fromfile(f, dtype=np.float32); k += 1
    for a in (2, 14):
        if len(x) < (a + 10) * 16000: continue
        seg = x[a * 16000:(a + 10) * 16000]
        for nom, m in mods.items():
            t = time.time(); h = [w['w'] for w in m.transcrire(seg)]; dt = time.time() - t
            for key, fn in (('a', sq), ('b', sq2)):
                ref = [w for w in (fn(w) for w, i in zip(e['mots'], e['inst']) if i and a <= i[0] and i[1] <= a + 10) if w]
                hh = [w for w in (fn(w) for w in h) if w]
                er, n = wer(ref, hh); res[nom][key][0] += er; res[nom][key][1] += n
            res[nom]['t'].append(dt)
for nom, r in res.items():
    ts = sorted(r['t'])
    print(f"{nom}: WER squelette {100*r['a'][0]/r['a'][1]:.1f} % ({r['a'][0]}/{r['a'][1]}) ; WER tolérant (hamza/alef) {100*r['b'][0]/r['b'][1]:.1f} % ({r['b'][0]}/{r['b'][1]}) ; temps/fenêtre médiane {ts[len(ts)//2]:.2f} s max {ts[-1]:.2f} s ({len(ts)} fenêtres)")
