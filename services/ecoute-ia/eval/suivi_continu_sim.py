"""
SUIVI EN CONTINU (tarteel-egal-wip, 29/10/2026) : peut-on raccourcir le délai (~11 s) en envoyant l'audio par morceaux
de 2 à 3 s et en relisant une FENÊTRE GLISSANTE (4 s de contexte déjà validé + le nouveau) au lieu d'attendre la fin du
passage suivant ?
  - morceau de C secondes ; à chaque morceau, lecture double (RNN-T et CTC) de [contexte validé 4 s | audio nouveau] ;
  - les mots dont le milieu est avant (t - L) deviennent « stables » (L = recul : la fin de la fenêtre est la zone la
    moins fiable, un mot coupé y serait mal lu) ; les suivants restent provisoires (ils dévoilent, ne signalent rien) ;
  - comparaison à la méthode retenue (mode suivi : pause 0,35 s, coupe 10 s), sur les MÊMES séances.
Même format de sortie que suivi_sim.py : l'analyse est faite par suivi.mjs (code de l'appli, deux lectures d'accord).
    python suivi_continu_sim.py  -> /work/suivi-continu<TAG>.json
Aucun audio n'est écrit : seulement mots, instants et temps de calcul.
"""
import json, os, random, sys, time
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('ECOUTE_ESSAI', '0')
import asr  # noqa: E402
import ecoute  # noqa: E402
import suivi_sim as S  # noqa: E402
from evaluer import tanzil  # noqa: E402

SR = asr.SR
CTX_S = float(os.environ.get('CTX_S', '4'))
#: variantes : nom:morceau(s):recul(s)
VARS = [(n, float(c), float(l)) for n, c, l in
        (v.split(':') for v in os.environ.get('CONTINU', 'K1:2:1.0,K2:2:1.5,K3:2:2.0,K4:3:1.5,K5:3:2.0').split(','))]
BASE = os.environ.get('BASE', '1') == '1'


def mid(w):
    return (w['t0'] + w['t1']) / 2


def continu(modele, x, C, L):
    """Rejoue x par morceaux de C s ; renvoie la liste d'événements (même forme que le mode suivi)."""
    blocs = [x[i: i + int(C * SR)] for i in range(0, len(x), int(C * SR))] + [np.zeros(int(C * SR), dtype=np.float32)] * 2
    buf = np.zeros(0, dtype=np.float32)
    base = 0.0       # instant (séance) du début de buf
    c = 0.0          # tout ce qui est avant c est déjà stable
    t = 0.0
    ev = []
    for bloc in blocs:
        buf = np.concatenate([buf, bloc])
        t = round(t + len(bloc) / SR, 2)
        t0 = time.perf_counter()
        fin_stable = t - L
        if len(buf) > SR // 2 and fin_stable > c:
            r, k = asr.lecture_double(modele, asr.rembourrer(buf))
            d = base - asr.REMBOURRAGE_S
            r, k = asr.decaler(r, d), asr.decaler(k, d)
            st = [w for w in r if c <= mid(w) < fin_stable]
            stc = [w for w in k if c <= mid(w) < fin_stable]
            voix = [[max(c, round(a + base, 2)), min(fin_stable, round(b + base, 2))]
                    for a, b in asr.zones_de_voix(buf, SR) if a + base < fin_stable and b + base > c]
            prov = [w for w in r if mid(w) >= fin_stable]
            provc = [w for w in k if mid(w) >= fin_stable]
            c = fin_stable
            drop = int((c - CTX_S - base) * SR)
            if drop > 0:
                buf = buf[drop:].copy(); base += drop / SR
            ev.append({'t': t, 'calcul': round(time.perf_counter() - t0, 3), 'stables': st, 'stables_ctc': stc,
                       'voix': voix, 'provisoires': prov, 'provisoires_ctc': provc})
        elif len(buf) > int((CTX_S + C + L + 6) * SR):  # sécurité : silence prolongé
            drop = int((t - CTX_S - base) * SR); buf = buf[drop:].copy(); base += drop / SR
    return ev


def baseline(modele, x):
    s = ecoute.Seance(suivi=True)
    s.pause, s.coupe = 0.35, 10.0
    ev = []
    blocs = [x[i: i + SR] for i in range(0, len(x), SR)] + [np.zeros(SR, dtype=np.float32)] * 2
    t = 0.0
    for bloc in blocs:
        t = round(t + len(bloc) / SR, 2)
        t0 = time.perf_counter(); r = ecoute._suivi(modele, s, bloc, partiel_ok=False); dt = time.perf_counter() - t0
        if r['stables'] or r['voix'] or 'provisoires' in r:
            ev.append({'t': t, 'calcul': round(dt, 3), **{k: v for k, v in r.items() if k != 'partiel'}})
    return ev


def main():
    rnd = random.Random(int(os.environ.get('GRAINE', '25')))
    T = tanzil()
    modele = asr.charger('nemo_rnnt', int(os.environ.get('THREADS', '4')))
    recitants = S.RECITANTS
    P = []
    for rid in recitants:
        P += S.portions(rnd, rid, S.JUSTES)
    for p in P:
        S.solides(modele, p, T)
    seances = [{'p': p, 'x': p['x'], 'verite': None} for p in P]
    plan = [(t, int(n)) for t, n in (z.split(':') for z in S.ERREURS.split(','))]
    for rid in recitants:
        mien = [p for p in P if p['rid'] == rid]
        autres = [q for q in P if q['rid'] != rid]
        for typ, n in plan:
            pris = 0
            for p in rnd.sample(mien, len(mien)):
                if pris >= n:
                    break
                y, v = S.avec_erreur(rnd, p, typ, autres)
                if y is not None:
                    seances.append({'p': p, 'x': y, 'verite': v}); pris += 1
    lim = int(os.environ.get('LIMITE', '0'))
    if lim:  # sous-ensemble équilibré pour la mesure de calcul au calme
        seances = seances[:lim // 2] + seances[-(lim - lim // 2):]
    out = []
    t_debut = time.perf_counter()
    for k, se in enumerate(seances):
        r = {}
        if BASE:
            r['suivi_BASE'] = baseline(modele, se['x'])
        for n, c, l in VARS:
            r[f'suivi_{n}'] = continu(modele, se['x'], c, l)
        out.append({'rid': se['p']['rid'], 'versets': se['p']['versets'], 'duree': round(len(se['x']) / SR, 2),
                    'verite': se['verite'], **r})
        print(k, se['p']['rid'], se['verite']['type'] if se['verite'] else 'juste', round(len(se['x']) / SR, 1), 's',
              round(time.perf_counter() - t_debut), 's écoulées', flush=True)
        json.dump(out, open(f'/work/suivi-continu{os.environ.get("TAG", "")}.json', 'w', encoding='utf-8'),
                  ensure_ascii=False)


if __name__ == '__main__':
    main()
