"""
SUIVI DE LA RÉCITATION « comme Tarteel » (interrupteur shazam_coran) : peut-on signaler les erreurs PENDANT la
récitation sans fausse alerte ? On rejoue des récitations RÉELLES du Complexe (5 récitateurs Ḥafṣ) par morceaux d'une
seconde, dans la MÊME logique que le service, avec deux méthodes :
  - « direct » (A5, en place) : chaque passage coupé à une pause est transcrit SEUL ;
  - « suivi » (nouveau, `ecoute._suivi`) : chaque passage est relu avec son contexte (4 s avant, le passage suivant
    après), en deux lectures (RNN-T et CTC, un seul encodeur).
Séances : 55 justes (11 par récitateur, 25 à 60 s) et 50 avec UNE erreur simulée en découpant l'audio (mot oublié,
mot remplacé par un mot d'une autre séance, mot ajouté, verset sauté), comme l'évaluation A5 (`evaluer.py`).
La comparaison au texte (fausses alertes, erreurs vues, délai) est faite ensuite par suivi.mjs avec le code de l'appli.
    python suivi_sim.py   -> /work/suivi-sim.json
Les fichiers du Complexe sont lus en lecture seule (/src) ; rien d'autre n'est écrit que le résultat (mots, instants).
"""
import json, os, random, sys, time
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('ECOUTE_ESSAI', '0')
import asr  # noqa: E402
import ecoute  # noqa: E402
from evaluer import cle, lire, mots, pistes, tanzil  # noqa: E402

SR = asr.SR
RECITANTS = os.environ.get('RECITANTS', 'akhdar-hafs,ayyoub-hafs,huthify-hafs,muaiqly-hafs,muhanna-hafs').split(',')
EXCLUS = {'muhanna-hafs': {42, 109, 110}}
JUSTES = int(os.environ.get('JUSTES', '11'))
ERREURS = os.environ.get('ERREURS', 'oubli:3,remplacement:3,ajout:2,saut_verset:2')


def portions(rnd, rid, n):
    P = pistes(rid)
    cles = sorted(k for k in P if k[0] not in EXCLUS.get(rid, set()))
    out = []
    while len(out) < n:
        s, a = rnd.choice(cles)
        vs, dur = [], 0.0
        for b in range(a, a + 14):
            if (s, b) not in P or dur + P[(s, b)][1] > 60:
                break
            vs.append((s, b)); dur += P[(s, b)][1]
        if len(vs) < 3 or dur < 25:
            continue
        out.append({'rid': rid, 'versets': vs, 'audio': [lire(P[v][0]) for v in vs]})
    return out


def solides(modele, p, T):
    """Mots « solides » (lus avec confiance, uniques dans la portion) : frontières fiables pour couper l'audio."""
    x = np.concatenate(p['audio'])
    _, H = asr.lecture_double(modele, x)  # tête CTC : instants en pics, coupe au milieu des intervalles (A5)
    ref = mots(T, p['versets'])
    rc = [m['cle'] for m in ref]
    hc = [cle(w['w']) for w in H]
    sol = []
    for j, w in enumerate(H):
        c = hc[j]
        if w['conf'] >= 0.9 and len(c) >= 3 and rc.count(c) == 1 and hc.count(c) == 1:
            a = (H[j - 1]['t1'] + w['t0']) / 2 if j > 0 else max(0.0, w['t0'] - 0.2)
            b = (w['t1'] + H[j + 1]['t0']) / 2 if j + 1 < len(H) else w['t1'] + 0.3
            sol.append({'j': j, 'i': rc.index(c), 't0': a + 0.04, 't1': b - 0.04, 'cle': c})
    p['x'], p['ref'], p['solides'] = x, ref, sol


def seg(x, t0, t1):
    return x[int(max(0, t0 - 0.04) * SR): int((t1 + 0.04) * SR)]


def avec_erreur(rnd, p, typ, autres):
    """Copie de la portion avec UNE erreur ; vérité : type, mots attendus visés, instant de l'erreur."""
    x, sol = p['x'], p['solides']
    if typ == 'saut_verset':
        k = len(p['versets']) // 2
        s, a = p['versets'][k]
        idx = [i for i, m in enumerate(p['ref']) if (m['s'], m['a']) == (s, a)]
        t = sum(len(z) for z in p['audio'][:k]) / SR
        return np.concatenate(p['audio'][:k] + p['audio'][k + 1:]), {'type': typ, 'i': idx[0], 'fin': idx[-1], 't': t}
    # erreurs de mot : jamais sur le premier ni le dernier mot (jamais signalés par principe)
    sol = [w for w in sol if 0 < w['i'] < len(p['ref']) - 1]
    if not sol:
        return None, None
    w = rnd.choice(sol)
    a0, a1 = int(max(0, w['t0'] - 0.04) * SR), int((w['t1'] + 0.04) * SR)
    if typ == 'oubli':
        return np.concatenate([x[:a0], x[a1:]]), {'type': 'oublie', 'i': w['i'], 'fin': w['i'], 't': a0 / SR}
    cles = {m['cle'] for m in p['ref']}
    cands = [(q, v) for q in autres for v in q['solides'] if v['cle'] not in cles]
    if not cands:
        return None, None
    q, v = rnd.choice(cands)
    if typ == 'remplacement':
        y = np.concatenate([x[:a0], seg(q['x'], v['t0'], v['t1']), x[a1:]])
        return y, {'type': 'remplace', 'i': w['i'], 'fin': w['i'], 't': a0 / SR}
    y = np.concatenate([x[:a1], seg(q['x'], v['t0'], v['t1']), x[a1:]])  # ajout après le mot w
    return y, {'type': 'ajoute', 'i': w['i'], 'fin': w['i'], 't': a1 / SR}


def direct_double(modele, s, morceau):
    """Méthode A5 en place (`ecoute._direct` : passages transcrits SEULS), avec les deux lectures du passage."""
    s.buf = np.concatenate([s.buf, morceau]); s.total += len(morceau)
    out, ctc, voix = [], [], []
    while True:
        cut = ecoute._coupe(s.buf, SR)
        if cut is None:
            break
        off = s.decal / SR
        x = s.buf[:cut]
        r, c = asr.lecture_double(modele, x) if len(x) > SR // 2 else ([], [])
        out += asr.decaler(r, off); ctc += asr.decaler(c, off)
        voix += [[round(a + off, 2), round(b + off, 2)] for a, b in asr.zones_de_voix(x, SR)]
        s.buf = s.buf[cut:].copy(); s.decal += cut
    return {'mots': out, 'mots_ctc': ctc, 'voix': voix}


#: réglages des passages du mode suivi comparés : nom:pause:coupe forcée (secondes)
VARIANTES = [(n, float(p), float(c)) for n, p, c in
             (v.split(':') for v in os.environ.get('VARIANTES', 'A:0.6:25,B:0.35:10,C:0.35:6').split(','))]


def rejouer(modele, x):
    sd = ecoute.Seance()
    ss = {}
    for nom, pause, coupe in VARIANTES:
        ss[nom] = ecoute.Seance(suivi=True)
        ss[nom].pause, ss[nom].coupe = pause, coupe
    res = {'direct': [], **{f'suivi_{n}': [] for n in ss}}
    # fin : deux secondes de silence pour clore le dernier passage
    blocs = [x[i: i + SR] for i in range(0, len(x), SR)] + [np.zeros(SR, dtype=np.float32)] * 2
    t = 0.0
    for bloc in blocs:
        t = round(t + len(bloc) / SR, 2)
        t0 = time.perf_counter(); r = direct_double(modele, sd, bloc); dt = time.perf_counter() - t0
        if r['mots'] or r['voix']:
            res['direct'].append({'t': t, 'calcul': round(dt, 3), **r})
        for nom, s in ss.items():
            t0 = time.perf_counter(); r = ecoute._suivi(modele, s, bloc, partiel_ok=False); dt = time.perf_counter() - t0
            if r['stables'] or r['voix'] or 'provisoires' in r:
                res[f'suivi_{nom}'].append({'t': t, 'calcul': round(dt, 3),
                                            **{k2: v for k2, v in r.items() if k2 != 'partiel'}})
    return res


def main():
    rnd = random.Random(int(os.environ.get('GRAINE', '25')))
    T = tanzil()
    modele = asr.charger('nemo_rnnt', int(os.environ.get('THREADS', '4')))
    P = []
    for rid in RECITANTS:
        P += portions(rnd, rid, JUSTES)
        print('portions', rid, flush=True)
    for p in P:
        solides(modele, p, T)
    seances = [{'p': p, 'x': p['x'], 'verite': None} for p in P]
    plan = [(t, int(n)) for t, n in (z.split(':') for z in ERREURS.split(','))]
    for rid in RECITANTS:
        mien = [p for p in P if p['rid'] == rid]
        autres = [q for q in P if q['rid'] != rid]
        for typ, n in plan:
            pris = 0
            for p in rnd.sample(mien, len(mien)):
                if pris >= n:
                    break
                y, v = avec_erreur(rnd, p, typ, autres)
                if y is not None:
                    seances.append({'p': p, 'x': y, 'verite': v}); pris += 1
    out = []
    t_debut = time.perf_counter()
    for k, se in enumerate(seances):
        r = rejouer(modele, se['x'])
        out.append({'rid': se['p']['rid'], 'versets': se['p']['versets'], 'duree': round(len(se['x']) / SR, 2),
                    'verite': se['verite'], **r})
        print(k, se['p']['rid'], se['verite']['type'] if se['verite'] else 'juste', round(len(se['x']) / SR, 1), 's',
              round(time.perf_counter() - t_debut), 's écoulées', flush=True)
        json.dump(out, open(f'/work/suivi-sim{os.environ.get("TAG", "")}.json', 'w', encoding='utf-8'), ensure_ascii=False)


if __name__ == '__main__':
    main()
