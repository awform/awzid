"""
A5 — évaluation des modèles d'écoute sur des récitations RÉELLES du Complexe (justes) et des erreurs SIMULÉES
en découpant l'audio : mot coupé (oublié), mot remplacé, mot ajouté, deux mots inversés, verset sauté.
Conditions : « propre » (fichier du Complexe), « telephone » (bruit de fond + compression Opus 24 kb/s, comme
un enregistrement du navigateur), « aigue » (voix rendue plus aiguë, approximation grossière d'une voix d'enfant).

  python evaluer.py preparer                 -> /work/cas.json + /work/cas/*.f32 (audio des cas, données d'essai)
  python evaluer.py transcrire nemo|whisper  -> /work/hyp-<modele>.json (mots entendus, confiance, temps)
  python evaluer.py vitesse                  -> /work/vitesse.json (longues portions, fenêtres du direct)

Les fichiers du Complexe sont lus en lecture seule (/src). La comparaison au texte se fait ensuite avec le
même code que le service (@awform/hifz, mesurer.mjs).
"""
import json, os, random, re, subprocess, sys, time, unicodedata
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import asr  # noqa: E402

SR = asr.SR
W = '/work'
RECITANTS = ['akhdar-hafs', 'ayyoub-hafs', 'muaiqly-hafs', 'huthify-hafs', 'muhanna-hafs']
EXCLUS = {'muhanna-hafs': {42, 109, 110}}
PAR_RECITANT = int(os.environ.get('PORTIONS', '10'))

SIGNES = re.compile('[ؐ-ًؚ-ٟۖ-ۭـ]')


def cle(w):
    w = SIGNES.sub('', w).replace('ٰ', 'ا')
    for a, b in (('ٱ', 'ا'), ('آ', 'ا'), ('أ', 'ا'), ('إ', 'ا'), ('ؤ', 'و'), ('ئ', 'ي'), ('ى', 'ي'), ('ة', 'ه')):
        w = w.replace(a, b)
    return re.sub('[^ء-ي]', '', w)


def tanzil():
    t = {}
    for line in open('/content/coran/tanzil-uthmani.tsv', encoding='utf-8'):
        line = line.rstrip('\r\n')
        if '\t' not in line:
            continue
        k, v = line.split('\t', 1)
        s, a = k.replace('﻿', '').strip().split(':')
        t[(int(s), int(a))] = v.replace('﻿', '')
    return t


def mots(t, versets):
    out = []
    for (s, a) in versets:
        for k, w in enumerate(t[(s, a)].split(' ')):
            if re.search('[ء-ي]', w):
                out.append({'s': s, 'a': a, 'k': k, 'cle': cle(w)})
    return out


def lire(path):
    p = subprocess.run(['ffmpeg', '-nostdin', '-loglevel', 'error', '-i', path, '-ac', '1', '-ar', str(SR),
                        '-f', 'f32le', 'pipe:1'], capture_output=True, check=True)
    return np.frombuffer(p.stdout, dtype=np.float32).copy()


def pistes(rid):
    r = json.load(open(f'/rapports/verifier-{rid}.json', encoding='utf-8'))
    return {(x['sura'], x['aya']): (x['source'].replace('/source', '/src', 1), x['durationMs'] / 1000)
            for x in r['tracks'] if x['aya'] > 0}


def preparer():
    rnd = random.Random(5)
    T = tanzil()
    nemo = asr.charger('nemo', int(os.environ.get('THREADS', '4')))
    os.makedirs(f'{W}/cas', exist_ok=True)
    portions = []
    for rid in RECITANTS:
        P = pistes(rid)
        cles = sorted(k for k in P if k[0] not in EXCLUS.get(rid, set()))
        n = 0
        while n < PAR_RECITANT:
            s, a = rnd.choice(cles)
            vs, dur = [], 0.0
            for b in range(a, a + 4):
                if (s, b) not in P or dur + P[(s, b)][1] > 26:
                    break
                vs.append((s, b)); dur += P[(s, b)][1]
            if len(vs) < 2 or dur < 6:
                continue
            audio = [lire(P[v][0]) for v in vs]
            x = np.concatenate(audio)
            h = nemo.transcrire(x)
            ref = mots(T, vs)
            portions.append({'rid': rid, 'versets': vs, 'audio': audio, 'x': x, 'hyp': h, 'ref': ref})
            n += 1
            print(rid, vs[0], len(vs), round(dur, 1), 's', flush=True)
    # mots « solides » : reconnus avec confiance, uniques dans la portion -> frontières fiables pour couper
    for p in portions:
        rc = [m['cle'] for m in p['ref']]
        hc = [cle(w['w']) for w in p['hyp']]
        sol = []
        for j, w in enumerate(p['hyp']):
            c = hc[j]
            if w['conf'] >= 0.9 and len(c) >= 3 and rc.count(c) == 1 and hc.count(c) == 1:
                sol.append({'j': j, 'i': rc.index(c), 't0': w['t0'], 't1': w['t1'], 'cle': c})
        p['solides'] = sol
    cas = []
    num = [0]

    def ecrire(p, x, verite, typ):
        num[0] += 1
        nom = f'c{num[0]:04d}'
        x.astype(np.float32).tofile(f'{W}/cas/{nom}.f32')
        cas.append({'id': nom, 'type': typ, 'rid': p['rid'], 'versets': p['versets'], 'verite': verite,
                    'duree': round(len(x) / SR, 2)})

    def seg(x, t0, t1):
        return x[int(max(0, t0 - 0.04) * SR): int((t1 + 0.04) * SR)]

    for n, p in enumerate(portions):
        x = p['x']
        ecrire(p, x, [], 'juste')
        sol = p['solides']
        if sol:
            w = rnd.choice(sol)  # mot coupé
            y = np.concatenate([x[: int(max(0, w['t0'] - 0.04) * SR)], x[int((w['t1'] + 0.04) * SR):]])
            ecrire(p, y, [{'type': 'oublie', 'i': w['i'], 'fin': w['i']}], 'oubli')
        autres = [q for q in portions if q is not p and q['solides']]
        if sol and autres:
            w = rnd.choice(sol)  # mot remplacé par un mot d'une autre portion (absent de celle-ci)
            q = rnd.choice(autres)
            cands = [v for v in q['solides'] if v['cle'] not in {m['cle'] for m in p['ref']}]
            if cands:
                v = rnd.choice(cands)
                y = np.concatenate([x[: int(max(0, w['t0'] - 0.04) * SR)], seg(q['x'], v['t0'], v['t1']),
                                    x[int((w['t1'] + 0.04) * SR):]])
                ecrire(p, y, [{'type': 'remplace', 'i': w['i'], 'fin': w['i']}], 'remplacement')
            v = rnd.choice(rnd.choice(autres)['solides'])  # mot ajouté après un mot solide
            q2 = next(q for q in portions if any(z is v for z in q['solides']))
            if v['cle'] not in {m['cle'] for m in p['ref']}:
                w = rnd.choice(sol)
                cut = int((w['t1'] + 0.04) * SR)
                y = np.concatenate([x[:cut], seg(q2['x'], v['t0'], v['t1']), x[cut:]])
                ecrire(p, y, [{'type': 'ajoute', 'i': w['i'], 'fin': w['i']}], 'ajout')
        paires = [(u, v) for u, v in zip(sol, sol[1:]) if v['j'] == u['j'] + 1 and v['i'] == u['i'] + 1]
        if paires:
            u, v = rnd.choice(paires)  # deux mots voisins inversés
            a0, a1 = int(max(0, u['t0'] - 0.04) * SR), int((u['t1'] + 0.04) * SR)
            b0, b1 = int(max(0, v['t0'] - 0.04) * SR), int((v['t1'] + 0.04) * SR)
            if a1 <= b0:
                y = np.concatenate([x[:a0], x[b0:b1], x[a1:b0], x[a0:a1], x[b1:]])
                ecrire(p, y, [{'type': 'ordre', 'i': u['i'], 'fin': v['i']}], 'inversion')
        if len(p['versets']) >= 3:
            s, a = p['versets'][1]  # verset du milieu sauté
            y = np.concatenate([p['audio'][0]] + p['audio'][2:])
            idx = [i for i, m in enumerate(p['ref']) if (m['s'], m['a']) == (s, a)]
            ecrire(p, y, [{'type': 'verset_saute', 'i': idx[0], 'fin': idx[-1]}], 'saut_verset')
    json.dump(cas, open(f'{W}/cas.json', 'w', encoding='utf-8'), ensure_ascii=False)
    print(len(cas), 'cas', flush=True)


FILTRES = {
    'propre': None,
    # bruit de fond (≈ 25 dB sous la voix) + Opus 24 kb/s (MediaRecorder) + bande téléphone
    'telephone': 'telephone',
    # +3 demi-tons, même tempo (approximation d'une voix plus aiguë)
    'aigue': 'asetrate=16000*1.189,aresample=16000,atempo=0.841',
}


def condition(x, nom, rnd):
    if nom == 'propre':
        return x
    if nom == 'telephone':
        rms = float(np.sqrt(np.mean(x ** 2)) + 1e-9)
        y = x + rnd.standard_normal(len(x)).astype(np.float32) * rms * 0.056
        p = subprocess.run(['ffmpeg', '-nostdin', '-loglevel', 'error', '-f', 'f32le', '-ar', str(SR), '-ac', '1',
                            '-i', 'pipe:0', '-af', 'highpass=f=200,lowpass=f=3800', '-c:a', 'libopus', '-b:a', '24k',
                            '-f', 'ogg', 'pipe:1'], input=y.astype(np.float32).tobytes(), capture_output=True, check=True)
        return asr.decoder_audio(p.stdout)
    p = subprocess.run(['ffmpeg', '-nostdin', '-loglevel', 'error', '-f', 'f32le', '-ar', str(SR), '-ac', '1',
                        '-i', 'pipe:0', '-af', FILTRES[nom], '-ar', str(SR), '-f', 'f32le', 'pipe:1'],
                       input=x.astype(np.float32).tobytes(), capture_output=True, check=True)
    return np.frombuffer(p.stdout, dtype=np.float32).copy()


def transcrire(nom):
    m = asr.charger(nom, int(os.environ.get('THREADS', '4')))
    cas = json.load(open(f'{W}/cas.json', encoding='utf-8'))
    conds = os.environ.get('CONDITIONS', 'propre,telephone,aigue').split(',')
    out = []
    for c in cas:
        x0 = np.fromfile(f'{W}/cas/{c["id"]}.f32', dtype=np.float32)
        for cond in conds:
            x = condition(x0, cond, np.random.default_rng(int(c['id'][1:])))
            t = time.perf_counter()
            h = m.transcrire(x)
            dt = time.perf_counter() - t
            out.append({'id': c['id'], 'cond': cond, 'mots': h, 'voix': asr.zones_de_voix(x),
                        'duree': round(len(x) / SR, 2), 'calcul': round(dt, 3)})
        print(nom, c['id'], flush=True)
    json.dump(out, open(f'{W}/hyp-{nom}.json', 'w', encoding='utf-8'), ensure_ascii=False)


def vitesse():
    """Temps de calcul sur de longues portions (1, 2, 5 min) et sur les fenêtres courtes du suivi en direct."""
    P = pistes('akhdar-hafs')
    res = {'longues': [], 'fenetres': []}
    x = np.concatenate([lire(P[(2, a)][0]) for a in range(1, 30)])
    for nom in ['nemo', 'whisper']:
        for th in [4, 2]:
            m = asr.charger(nom, th)
            for minutes in [1, 2, 5]:
                y = x[: int(minutes * 60 * SR)]
                t = time.perf_counter(); m.transcrire(y); dt = time.perf_counter() - t
                res['longues'].append({'modele': nom, 'threads': th, 'minutes': minutes, 'calcul_s': round(dt, 2),
                                       'par_minute_s': round(dt / minutes, 2)})
                print(res['longues'][-1], flush=True)
            for sec in [2, 4, 8]:
                ts = []
                for k in range(6):
                    y = x[int(k * 7 * SR): int((k * 7 + sec) * SR)]
                    t = time.perf_counter(); m.transcrire(y); ts.append(time.perf_counter() - t)
                ts.sort()
                res['fenetres'].append({'modele': nom, 'threads': th, 'fenetre_s': sec,
                                        'mediane_s': round(ts[len(ts) // 2], 3), 'max_s': round(ts[-1], 3)})
                print(res['fenetres'][-1], flush=True)
            del m
    json.dump(res, open(f'{W}/vitesse.json', 'w'), indent=1)


if __name__ == '__main__':
    {'preparer': preparer, 'vitesse': vitesse}.get(sys.argv[1], lambda: transcrire(sys.argv[2]))()
