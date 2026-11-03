"""Latence : encodeur FastConformer fp32 contre int8 dynamique (couches linéaires), 1 thread, fenêtre de 10 s.
Mesure : temps d'une lecture double (RNN-T + CTC) et accord des mots / des trames CTC avec fp32."""
import glob, os, sys, time
import numpy as np
sys.path[:0] = ['/code']
import asr

TH = int(os.environ.get('TH', '1'))
m = asr.NemoRNNT('/model/stt_ar_fastconformer_hybrid_large_pcd_v1.0.nemo', TH)
torch = m.torch
fs = sorted(glob.glob('/bn/audio/*.f32'))[::7][:14]
wins = []
for f in fs:
    x = np.fromfile(f, dtype=np.float32)
    for a in (0, 12 * 16000):
        if len(x) >= a + 10 * 16000:
            wins.append(x[a:a + 10 * 16000])
print(len(wins), 'fenêtres de 10 s, threads', TH)


def lire(m, x):
    mots, ctc = m.transcrire_double(x)
    with torch.inference_mode():
        enc, el = m._encoder(x)
        top = m.m.ctc_decoder(encoder_output=enc)[0][: int(el[0])].argmax(-1).numpy()
    return [w['w'] for w in mots], top


def passe(m, nom):
    t = []
    res = []
    lire(m, wins[0])  # échauffement
    for x in wins:
        a = time.time()
        res.append(lire(m, x))
        t.append(time.time() - a)
    t.sort()
    print(f'{nom}: lecture double médiane {t[len(t)//2]:.2f} s  p90 {t[int(len(t)*0.9)]:.2f} s  max {t[-1]:.2f} s')
    return res


ref = passe(m, 'fp32')
enc0 = m.m.encoder
m.m.encoder = torch.quantization.quantize_dynamic(enc0, {torch.nn.Linear}, dtype=torch.qint8)
q = passe(m, 'int8')
accord_mots, accord_trames, n = 0, 0.0, 0
for (w0, t0), (w1, t1) in zip(ref, q):
    accord_mots += int(w0 == w1)
    k = min(len(t0), len(t1))
    accord_trames += float((t0[:k] == t1[:k]).mean())
    n += 1
print(f'accord : transcription RNN-T identique {accord_mots}/{n} fenêtres ; trames CTC identiques {100 * accord_trames / n:.1f} %')
import difflib
sim = [difflib.SequenceMatcher(None, ' '.join(a), ' '.join(b)).ratio() for (a, _), (b, _) in zip(ref, q)]
print('ressemblance moyenne des transcriptions RNN-T fp32 / int8 : %.3f' % (sum(sim) / len(sim)))
