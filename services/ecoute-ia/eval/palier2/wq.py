"""Levier 4 (faisabilité) : tarteel-ai/whisper-base-ar-quran (Apache) contre le modèle NeMo actuel, sur des fenêtres de 10 s de séances JUSTES du banc neutre.
Référence = texte Tanzil de la séance (mots dont l'instant tombe dans la fenêtre). Mesure : taux d'erreur de mots (squelette sans voyelles) et temps (1 thread)."""
import json, os, re, sys, time
import numpy as np
sys.path[:0] = ['/code']
import asr

TH = int(os.environ.get('TH', '1'))
exp = json.load(open('/bn/export-t3.json'))
HAR = re.compile('[ً-ٰٟۖ-ۭـ]')


def sq(w):
    w = HAR.sub('', w)
    return w.replace('ٱ', 'ا').replace('أ', 'ا').replace('إ', 'ا').replace('آ', 'ا').replace('ى', 'ي').replace('ة', 'ه')


def wer(ref, hyp):
    n, m = len(ref), len(hyp)
    d = list(range(m + 1))
    for i in range(1, n + 1):
        p, d[0] = d[0], i
        for j in range(1, m + 1):
            p, d[j] = d[j], min(d[j] + 1, d[j - 1] + 1, p + (ref[i - 1] != hyp[j - 1]))
    return d[m], n


nem = asr.NemoRNNT('/model/stt_ar_fastconformer_hybrid_large_pcd_v1.0.nemo', TH)
wh = asr.WhisperQuran('/whisper', TH)
res = {'nemo': [0, 0, []], 'whisper': [0, 0, []]}
k = 0
for sid, e in exp.items():
    if e['type'] != 'juste' or k >= 14:
        continue
    f = f'/bn/audio/{sid}.f32'
    if not os.path.exists(f):
        continue
    x = np.fromfile(f, dtype=np.float32)
    k += 1
    for a in (2, 14):
        if len(x) < (a + 10) * 16000:
            continue
        ref = [sq(w) for w, i in zip(e['mots'], e['inst']) if i and a <= i[0] and i[1] <= a + 10]
        ref = [w for w in ref if w]
        seg = x[a * 16000:(a + 10) * 16000]
        for nom, m in (('nemo', nem),) + ((('whisper', wh),) if not os.environ.get('SANS_WHISPER') else ()):
            t = time.time()
            h = [sq(w['w']) for w in m.transcrire(seg)]
            dt = time.time() - t
            h = [w for w in h if w]
            er, n = wer(ref, h)
            res[nom][0] += er
            res[nom][1] += n
            res[nom][2].append(dt)
for nom, (er, n, ts) in res.items():
    if not ts:
        continue
    ts.sort()
    print(f'{nom}: erreurs de mots {er}/{n} = {100 * er / max(n, 1):.1f} %, temps par fenêtre de 10 s : médiane {ts[len(ts)//2]:.2f} s, max {ts[-1]:.2f} s ({len(ts)} fenêtres)')
