"""QDAT : une seule sourate/verset (5:109), 4 règles de tajwid binaires par clip. Les clips « fautifs » contiennent-ils des mots ajoutés / remplacés ?
On transcrit 300 clips (quran-asr-small fp32) et on compare le squelette au verset, par valeur d'étiquette."""
import io, sys, re, collections, numpy as np, soundfile as sf, pyarrow.parquet as pq
from scipy.signal import resample_poly
sys.path[:0] = ['/p3']
import qas
exec(open('/p3/wq2.py').read().split("mods =")[0].split("import asr, qas")[1].replace("exp = json.load(open('/bn/export-t3.json'))", "").replace("TH = int(os.environ.get('TH', '1'))", ""))
REF = [sq2(w) for w in 'قالوا لا علم لنا إنك أنت علام الغيوب'.split()]
m = qas.QuranSmall(1, False)
t = pq.read_table('/q/qdat/train-00000-of-00002.parquet').slice(0, 300).to_pandas()
cols = ['separate_tide', 'the_tight_noon', 'concealment', 'target']
tot = collections.defaultdict(lambda: [0, 0, 0]); allc = collections.Counter()
for _, r in t.iterrows():
    w, sr = sf.read(io.BytesIO(r.audio['bytes']), dtype='float32', always_2d=True); w = w.mean(1)
    if sr != 16000:
        g = np.gcd(sr, 16000); w = resample_poly(w, 16000 // g, sr // g).astype(np.float32)
    h = [x for x in (sq2(z['w']) for z in m.transcrire(w)) if x]
    er, n = wer(REF, h)
    allc[len(h)] += 1
    for c in cols:
        k = (c, int(r[c])); tot[k][0] += er; tot[k][1] += n; tot[k][2] += 1
    if allc['ex'] < 6 and er: allc['ex'] += 1; print(h)
print('nb de mots transcrits', sorted((k, v) for k, v in allc.items() if k != 'ex'))
for k, (er, n, c) in sorted(tot.items()): print(k, f'clips {c}, WER vs verset {100*er/n:.1f} %')
