"""
Contrôle par ASR des récitations du Complexe (chantier A1) — LECTURE SEULE des fichiers audio.
Pour chaque récitation : échantillon = premier et dernier verset de chaque sourate + 300 versets tirés au hasard
(graine fixe) ; transcription par NVIDIA FastConformer arabe (CC-BY-4.0) ; comparaison au texte attendu
normalisé (sans diacritiques) ; détection des décalages de numérotation (un verset voisin ressemble davantage
à l'audio que le verset attendu). Aucun fichier source n'est modifié : conversion WAV 16 kHz dans /tmp.

  python asr_controle.py <id> [<id>...]   (configuration dans RECITATIONS ci-dessous)
"""
import glob, json, os, random, re, subprocess, sys, tempfile, time, unicodedata
from difflib import SequenceMatcher

SRC = '/src'
TXT = '/textes'
OUT = '/out'
MODEL = '/model/stt_ar_fastconformer_hybrid_large_pcd_v1.0.nemo'

X = '/src/_extras'
RECITATIONS = {
    'ayyoub-hafs': ('hafs', [SRC + '/ayyoub-hafs'], ['10-SSSVVV-A03.mp3']),
    'muaiqly-hafs': ('hafs', [SRC + '/muaiqly-hafs'], ['10-SSSVVV-A08.mp3']),
    'huthify-hafs': ('hafs', [SRC + '/huthify-hafs', X + '/huthify-hafs/الحذيفي-ايات/002 Al-Baqarah البقرة'],
                     ['10-SSSVVV-A01.mp3', '10-SSSVVV-001.mp3']),
    'muhanna-hafs': ('hafs', [SRC + '/muhanna-hafs'], ['10-SSSVVV-A06.mp3']),
    'akhdar-hafs': ('hafs', [SRC + '/akhdar-hafs'], ['10-SSSVVV-A02.mp3']),
    'huthify-shuba': ('shuba', [SRC + '/huthify-shuba'], ['09-SSSVVV-A01.mp3']),
    'juhani-duri': ('duri', [SRC + '/juhani-duri'], ['05-SSSVVV-A09.mp3']),
    'sediki-susi': ('susi', [SRC + '/sediki-susi'],
                    ['06-SSSVVVA10.mp3.mp3', '06-SSSVVVA10.wav.mp3', '06-SSVVVA10.wav.mp3']),
    'huthify-qalun': ('qalun', [SRC + '/huthify-qalun'],
                      ['01-SSSVVV-A01.mp3', '01-SSSVVV-001.mp3', '01-SSSVVVA01.mp3']),
}
# textes de référence : imlāʾī du Complexe pour Ḥafṣ et Shuʿba (même numérotation koufie, graphie la plus proche
# de la sortie ASR) ; texte officiel de la riwāya sinon (ad-Dūrī : texte d'as-Sūsī, même lecture d'Abū ʿAmr et
# même compte 6 218)
TEXTES = {'hafs': ('texte-hafs-v30', 'aya_text_emlaey'), 'shuba': ('texte-hafs-v30', 'aya_text_emlaey'),
          'susi': ('texte-susi-v30', 'aya_text_unicode'), 'duri': ('texte-susi-v30', 'aya_text_unicode'),
          'qalun': ('texte-qalun-v30', 'aya_text_unicode')}
EXTRA = {'muhanna-hafs': [(109, 1), (109, 2), (109, 3), (110, 1)], 'sediki-susi': [(67, 29), (67, 30)],
         'juhani-duri': [(67, 30), (67, 31)]}


def compile_pattern(p):
    order, rx = [], ''
    for tok in re.findall(r'S+|V+|[^SV]+', p):
        if tok[0] in 'SV':
            order.append(tok[0]); rx += r'(\d{1,3})' if len(tok) == 1 else r'(\d{%d})' % len(tok)
        else:
            rx += re.escape(tok)
    r = re.compile('^' + rx + '$', re.I)
    def f(name):
        m = r.match(name)
        if not m: return None
        v = [int(x) for x in m.groups()]
        return v[order.index('S')], v[order.index('V')]
    return f


def strip(s):
    s = unicodedata.normalize('NFKD', s)
    out = []
    for ch in s:
        o = ord(ch)
        if ch in 'ٱأإآ': ch = 'ا'
        elif ch == 'ى': ch = 'ي'
        elif ch == 'ة': ch = 'ه'
        elif ch == 'ؤ': ch = 'و'
        elif ch == 'ئ': ch = 'ي'
        cat = unicodedata.category(ch)
        if cat.startswith('M') or ch == 'ـ': continue
        if 0x0621 <= ord(ch) <= 0x064A: out.append(ch)
        elif ch.isspace(): out.append(' ')
    return re.sub(r'\s+', ' ', ''.join(out)).strip()


def sim(a, b):
    a, b = a.replace(' ', ''), b.replace(' ', '')
    if not a or not b: return 0.0
    return SequenceMatcher(None, a, b, autojunk=False).ratio()


def main(ids):
    import nemo.collections.asr as nemo_asr
    import torch
    torch.set_num_threads(int(os.environ.get('THREADS', '8')))
    model = nemo_asr.models.ASRModel.restore_from(MODEL, map_location='cpu')
    model.eval()
    for rid in ids:
        riw, dirs, pats = RECITATIONS[rid]
        parsers = [compile_pattern(p) for p in pats]
        files = {}
        for d in dirs:
            if not os.path.isdir(d): continue
            for n in sorted(os.listdir(d)):
                for p in parsers:
                    v = p(n)
                    if v: files.setdefault(v, os.path.join(d, n)); break
        if not files:
            print(rid, 'aucun fichier'); continue
        tdir, field = TEXTES[riw]
        data = json.load(open(glob.glob(f'{TXT}/{tdir}/*data*/*.json')[0], encoding='utf-8'))
        ref = {(int(x['sura_no']), int(x['aya_no'])): strip(x[field]) for x in data}
        last = {}
        for (s, a) in ref: last[s] = max(last.get(s, 0), a)
        sample = set()
        for s in range(1, 115):
            sample.add((s, 1)); sample.add((s, last[s]))
        rng = random.Random(42)
        pool = sorted(k for k in ref if k not in sample)
        sample |= set(rng.sample(pool, 300))
        sample |= set(EXTRA.get(rid, []))
        sample = sorted(sample)
        absent = [k for k in sample if k not in files]
        todo = [k for k in sample if k in files]
        t0 = time.time()
        rows = []
        with tempfile.TemporaryDirectory() as tmp:
            for i in range(0, len(todo), 16):
                chunk = todo[i:i + 16]
                wavs = []
                for (s, a) in chunk:
                    w = f'{tmp}/{s:03d}{a:03d}.wav'
                    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', files[(s, a)], '-ac', '1', '-ar', '16000', w],
                                   check=True)
                    wavs.append(w)
                hyps = model.transcribe(wavs, batch_size=8, verbose=False)
                if isinstance(hyps, tuple): hyps = hyps[0]
                for (s, a), h in zip(chunk, hyps):
                    text = h.text if hasattr(h, 'text') else str(h)
                    hyp = strip(text)
                    exp = sim(hyp, ref[(s, a)])
                    neigh = {}
                    for k in [(s, a - 1), (s, a + 1), (s, a - 2), (s, a + 2)]:
                        if k in ref: neigh[f'{k[0]}:{k[1]}'] = round(sim(hyp, ref[k]), 3)
                    # verset voisin + suivant (fichier qui contiendrait deux versets)
                    if (s, a + 1) in ref:
                        neigh[f'{s}:{a}+{a + 1}'] = round(sim(hyp, ref[(s, a)] + ' ' + ref[(s, a + 1)]), 3)
                    best_k, best = max(neigh.items(), key=lambda kv: kv[1]) if neigh else ('', 0)
                    court = len(ref[(s, a)].replace(' ', '')) < 15
                    statut = 'ok'
                    if best > exp + 0.15 and best >= 0.5 and '+' not in best_k:
                        statut = 'suspect_decalage'
                    elif best > exp + 0.15 and best >= 0.5:
                        statut = 'suspect_deux_versets'
                    elif exp < 0.45:
                        statut = 'incertain_court' if court else 'suspect_texte'
                    rows.append({'sura': s, 'aya': a, 'fichier': os.path.relpath(files[(s, a)], SRC),
                                 'score': round(exp, 3), 'meilleur_voisin': best_k, 'score_voisin': best,
                                 'statut': statut, 'asr': hyp, 'attendu': ref[(s, a)]})
                print(f'{rid} {min(i + 16, len(todo))}/{len(todo)} {time.time() - t0:.0f}s', flush=True)
        ok = sum(1 for r in rows if r['statut'] == 'ok')
        sus = [r for r in rows if r['statut'].startswith('suspect')]
        inc = [r for r in rows if r['statut'] == 'incertain_court']
        rep = {'recitation': rid, 'riwaya': riw, 'texte_reference': f'{tdir}:{field}', 'modele': os.path.basename(MODEL),
               'echantillon': len(sample), 'transcrits': len(rows), 'absents': [f'{s}:{a}' for s, a in absent],
               'correspondance': ok, 'taux': round(ok / max(1, len(rows)), 4),
               'score_median': sorted(r['score'] for r in rows)[len(rows) // 2] if rows else 0,
               'suspects': [{k: r[k] for k in ('sura', 'aya', 'fichier', 'score', 'meilleur_voisin', 'score_voisin', 'statut', 'asr')} for r in sus],
               'incertains_courts': [f"{r['sura']}:{r['aya']} ({r['score']})" for r in inc],
               'duree_s': round(time.time() - t0), 'lignes': rows}
        json.dump(rep, open(f'{OUT}/asr-{rid}.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        print(f"== {rid} : {ok}/{len(rows)} conformes ({rep['taux']:.1%}), {len(sus)} suspect(s), "
              f"{len(inc)} incertain(s) court(s), absents {len(absent)}, médiane {rep['score_median']}", flush=True)


if __name__ == '__main__':
    main(sys.argv[1:])
