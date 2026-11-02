"""
BANC DU SUIVI DE LA RÉCITATION (chantier « Tarteel titan », 11/2026) — reproductible (graine fixe), récitations RÉELLES
du Complexe (5 récitateurs Ḥafṣ, lecture seule) + cas simulés en découpant / mélangeant l'audio.

  python banc.py sessions        -> /work/banc/sessions.json + /work/banc/audio/*.f32  (audio des cas : données d'essai)
  python banc.py lire base       -> /work/banc/lect-base.json   (service actuel : `ecoute._suivi`, morceaux d'1 s, avec partiels)
  python banc.py lire fen        -> /work/banc/lect-fen<TAG>.json (fenêtre glissante : lecture du dernier W s toutes les HOP s)

L'analyse (délais, mots suivis, fausses alertes) est faite ensuite par banc.mjs avec le code de l'appli (@awform/hifz).

Types de séances (QUOTAS) :
  juste, oubli, remplacement, ajout, saut_verset          fautes réelles à signaler (ou à ne pas rater)
  repete (mot dit deux fois), reprise (l'élève reprend les 3-5 derniers mots), retour (retour au verset précédent),
  pause (6 s de silence au milieu d'un verset)             récitation NORMALE : AUCUNE erreur ne doit être signalée
  bruit (bruit blanc, 15 dB sous la voix), telephone (bruit + bande téléphone + Opus 24 kb/s)   récitation juste dégradée
"""
import json, os, random, subprocess, sys, time
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('ECOUTE_ESSAI', '0')
import asr  # noqa: E402
import ecoute  # noqa: E402
from evaluer import condition, tanzil  # noqa: E402
from suivi_sim import avec_erreur, portions, seg, solides  # noqa: E402

SR = asr.SR
W = os.environ.get('BANC', '/work/banc')
RECITANTS = os.environ.get('RECITANTS', 'akhdar-hafs,ayyoub-hafs,huthify-hafs,muaiqly-hafs,muhanna-hafs').split(',')
PORTIONS = int(os.environ.get('PORTIONS', '3'))
QUOTAS = os.environ.get('QUOTAS', 'juste:15,oubli:6,remplacement:6,ajout:5,saut_verset:5,repete:6,reprise:6,retour:5,'
                                  'pause:6,bruit:8,telephone:8')
THREADS = int(os.environ.get('THREADS', '4'))


def attendre_charge(max_=float(os.environ.get('CHARGE_MAX', '7'))):
    """Pause entre deux séances tant que la charge de la machine dépasse `max_` (/proc/loadavg est celui de l'hôte)."""
    while True:
        charge = float(open('/proc/loadavg').read().split()[0])
        dispo = next((int(l.split()[1]) for l in open('/proc/meminfo') if l.startswith('MemAvailable')), 1 << 30) / 1048576
        st = os.statvfs(W)
        disque = 1 - st.f_bavail / max(1, st.f_blocks)
        if charge <= max_ and dispo >= float(os.environ.get('MEM_MIN_GO', '2')) and disque < 0.875:
            return
        time.sleep(20)


def silence(rnd, s):
    return (np.random.default_rng(rnd.randint(0, 2 ** 31)).standard_normal(int(s * SR)) * 1e-4).astype(np.float32)


def normal(rnd, p, typ):
    """Récitation NORMALE (aucune faute à signaler) : mot répété, reprise, retour en arrière, pause longue."""
    x, sol, ref = p['x'], p['solides'], p['ref']
    cut = lambda t: int(t * SR)  # noqa: E731
    if typ == 'retour':
        n = len(p['versets'])
        if n < 3:
            return None
        k = rnd.randint(1, n - 2)
        gap = silence(rnd, 0.5)
        parts = []
        for z in p['audio'][: k + 1]:
            parts += [z, gap]
        for z in p['audio'][k - 1:]:
            parts += [z, gap]
        return np.concatenate(parts[:-1])
    mid = [w for w in sol if 2 <= w['i'] <= len(ref) - 3]
    if not mid:
        return None
    w = rnd.choice(mid)
    a, b = cut(max(0, w['t0'] - 0.04)), cut(w['t1'] + 0.04)
    if typ == 'repete':  # mot dit deux fois de suite
        return np.concatenate([x[:b], silence(rnd, 0.15), x[a:b], x[b:]])
    if typ == 'pause':
        return np.concatenate([x[:b], silence(rnd, 6.0), x[b:]])
    if typ == 'reprise':  # l'élève s'arrête et reprend à quelques mots en arrière
        avant = [v for v in sol if 0.8 < w['t0'] - v['t0'] < 4.5 and v['i'] < w['i']]
        if not avant:
            return None
        v = min(avant, key=lambda v: v['t0'])
        s0 = cut(max(0, v['t0'] - 0.04))
        return np.concatenate([x[:b], silence(rnd, 0.5), x[s0:b], x[b:]])
    return None


def bruit_blanc(rnd, x, snr_db=15.0):
    rms = float(np.sqrt(np.mean(x ** 2)) + 1e-9)
    g = rms / (10 ** (snr_db / 20))
    return (x + rnd.standard_normal(len(x)).astype(np.float32) * g).astype(np.float32)


def sessions():
    os.makedirs(f'{W}/audio', exist_ok=True)
    rnd = random.Random(int(os.environ.get('GRAINE') or '31'))
    rng = np.random.default_rng(31)
    T = tanzil()
    modele = asr.charger('nemo_rnnt', THREADS)
    P = []
    for rid in RECITANTS:
        n0 = len(P)
        for p in portions(rnd, rid, PORTIONS):
            if len(p['versets']) >= 3 and sum(len(z) for z in p['audio']) / SR <= 50:
                P.append(p)
        print('portions', rid, len(P) - n0, flush=True)
    for p in P:
        solides(modele, p, T)
    plan = [(t, int(n)) for t, n in (z.split(':') for z in QUOTAS.split(','))]
    out, num = [], [0]

    def ecrire(p, x, typ, verite, cond='propre'):
        num[0] += 1
        sid = f'b{num[0]:03d}'
        x = x.astype(np.float32)
        x.tofile(f'{W}/audio/{sid}.f32')
        ref = modele.transcrire(x)  # lecture de toute la séance : instants de référence des mots
        out.append({'id': sid, 'type': typ, 'cond': cond, 'rid': p['rid'], 'versets': p['versets'],
                    'duree': round(len(x) / SR, 2), 'verite': verite, 'ref': ref,
                    'voix': asr.zones_de_voix(x)})
        print(sid, typ, p['rid'], round(len(x) / SR, 1), 's', flush=True)
        json.dump(out, open(f'{W}/sessions.json', 'w', encoding='utf-8'), ensure_ascii=False)

    for typ, n in plan:
        pris, ordre = 0, rnd.sample(P, len(P))
        for p in ordre * 3:
            if pris >= n:
                break
            autres = [q for q in P if q['rid'] != p['rid']]
            if typ == 'juste':
                ecrire(p, p['x'], typ, None)
            elif typ in ('oubli', 'remplacement', 'ajout', 'saut_verset'):
                y, v = avec_erreur(rnd, p, typ, autres)
                if y is None:
                    continue
                ecrire(p, y, typ, v)
            elif typ in ('repete', 'reprise', 'retour', 'pause'):
                y = normal(rnd, p, typ)
                if y is None:
                    continue
                ecrire(p, y, typ, None)
            elif typ == 'bruit':
                ecrire(p, bruit_blanc(rng, p['x']), typ, None, 'bruit')
            elif typ == 'telephone':
                ecrire(p, condition(p['x'], 'telephone', rng), typ, None, 'telephone')
            pris += 1
    json.dump(out, open(f'{W}/sessions.json', 'w', encoding='utf-8'), ensure_ascii=False)
    print(len(out), 'séances', round(sum(s['duree'] for s in out) / 60, 1), 'min', flush=True)


# ---------------------------------------------------------------- lectures

def charger_sessions():
    S = json.load(open(f'{W}/sessions.json', encoding='utf-8'))
    lim = int(os.environ.get('LIMITE', '0'))
    pas = int(os.environ.get('PAS', '1'))  # PAS=k : une séance sur k (essais rapides)
    S = S[::pas]
    # PART=k/n : les séances d'indice ≡ k (mod n) (plusieurs processus en parallèle) ; DEJA=<fichier> : sauter les séances déjà lues
    part = os.environ.get('PART')
    if part:
        k_, n_ = map(int, part.split('/'))
        S = [s for i, s in enumerate(S) if i % n_ == k_]
    deja = os.environ.get('DEJA')
    if deja and os.path.exists(deja):
        ids = {x['id'] for x in json.load(open(deja, encoding='utf-8'))}
        S = [s for s in S if s['id'] not in ids]
    ex = [x for x in os.environ.get('EXCLURE', '').split(',') if x]
    if ex:  # types laissés de côté (calcul limité)
        S = [s for s in S if s['type'] not in ex]
    if os.environ.get('SHUF'):  # ordre mélangé (graine fixe) : si on s'arrête avant la fin, tous les types sont représentés
        random.Random(5).shuffle(S)
    return S[:lim] if lim else S


def audio_de(s):
    return np.fromfile(f'{W}/audio/{s["id"]}.f32', dtype=np.float32)


def lire_base(modele, x):
    """Service actuel (mode suivi de production), morceaux d'1 s comme le client, partiels compris."""
    s = ecoute.Seance(suivi=True)
    blocs = [x[i: i + SR] for i in range(0, len(x), SR)] + [np.zeros(SR, dtype=np.float32)] * 3
    t, res = 0.0, []
    for bloc in blocs:
        t = round(t + len(bloc) / SR, 2)
        t0 = time.perf_counter()
        r = ecoute._suivi(modele, s, bloc, partiel_ok=True)
        dt = time.perf_counter() - t0
        res.append({'t': t, 'calcul': round(dt, 3), **r})
    return res


FEN_W = float(os.environ.get('FEN_W', '10'))
FEN_HOP = float(os.environ.get('FEN_HOP', '0.5'))
FEN_PAD = float(os.environ.get('FEN_PAD', '0.5'))
TOPK = os.environ.get('TOPK') == '1'


def lire_fenetre(modele, x):
    """Lecture du dernier FEN_W s toutes les FEN_HOP s (deux lectures : RNN-T et CTC, un seul encodeur)."""
    queue = np.zeros(int(3 * SR), dtype=np.float32)
    x = np.concatenate([x, queue])
    res, t, tops = [], FEN_HOP, []
    while t <= len(x) / SR + 1e-6:
        a = max(0.0, t - FEN_W)
        seg_ = x[int(a * SR): int(t * SR)]
        t0 = time.perf_counter()
        if len(seg_) > SR // 2:
            xr = asr.rembourrer(seg_, FEN_PAD)
            if TOPK:
                r, c, tk = modele.transcrire_double_topk(xr, int(os.environ.get('TOPK_K', '8')))
                tops.append((len(res), a - FEN_PAD, tk))
            else:
                r, c = asr.lecture_double(modele, xr)
            off = a - FEN_PAD
            r, c = asr.decaler(r, off), asr.decaler(c, off)
            voix = [[round(p + off, 2), round(q + off, 2)] for p, q in asr.zones_de_voix(xr)]
        else:
            r, c, voix = [], [], []
        dt = time.perf_counter() - t0
        res.append({'t': round(t, 2), 't0': round(a, 2), 'calcul': round(dt, 3), 'mots': r, 'mots_ctc': c,
                    'voix': voix})
        t += FEN_HOP
    lire_fenetre.tops = tops
    return res


def sauver_topk(sid, tops):
    """Top-k CTC de chaque lecture de la fenêtre : ids [R,T,K] int16, lp [R,T,K] float16, index de lecture, décalage (s) de la
    trame 0 de chaque lecture (la trame f commence à décalage + 0,08 f)."""
    if not tops:
        return
    T_ = max(tk[0].shape[0] for _, _, tk in tops)
    K = tops[0][2][0].shape[1]
    ids = np.full((len(tops), T_, K), -1, dtype=np.int16)
    lp = np.full((len(tops), T_, K), -30, dtype=np.float16)
    for n, (_, _, tk) in enumerate(tops):
        ids[n, : tk[0].shape[0]] = tk[0]
        lp[n, : tk[1].shape[0]] = tk[1]
    os.makedirs(f'{W}/topk', exist_ok=True)
    np.savez_compressed(f'{W}/topk/{sid}.npz', ids=ids, lp=lp, lecture=np.array([n for n, _, _ in tops]),
                        decalage=np.array([d for _, d, _ in tops], dtype=np.float32))


def lire(methode):
    modele = asr.charger('nemo_rnnt', THREADS)
    tag = os.environ.get('TAG', '')
    nom = f'{W}/lect-{methode}{tag}.json'
    S = charger_sessions()
    fn = {'base': lire_base, 'fen': lire_fenetre}[methode]
    out, debut = [], time.perf_counter()
    for k, s in enumerate(S):
        attendre_charge()
        out.append({'id': s['id'], 'reads': fn(modele, audio_de(s))})
        if TOPK and methode == 'fen':
            sauver_topk(s['id'], lire_fenetre.tops)
        print(k, s['id'], s['type'], round(s['duree']), 's', round(time.perf_counter() - debut), 's écoulées',
              flush=True)
        json.dump(out, open(nom, 'w', encoding='utf-8'), ensure_ascii=False)


if __name__ == '__main__':
    if sys.argv[1] == 'sessions':
        sessions()
    else:
        lire(sys.argv[2])
