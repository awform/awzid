"""
A5 — faisabilité du SUIVI EN DIRECT sur processeur : on rejoue des récitations réelles du Complexe par morceaux
d'une seconde dans la MÊME logique que le service (`ecoute._direct` : passages coupés aux pauses, mots sûrs et
partiels), et on note pour chaque morceau le temps de calcul et les mots rendus. La comparaison au texte (fausses
alertes en direct, retard des mots sûrs) est faite ensuite par direct.mjs avec le code de l'appli.
    python direct_sim.py <modele> [<modele>...]   -> /work/direct-<modele>.json
"""
import json, os, random, sys, time
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('ECOUTE_ESSAI', '0')
import asr  # noqa: E402
import ecoute  # noqa: E402
from evaluer import lire, pistes  # noqa: E402

SR = asr.SR


def seances():
    rnd = random.Random(11)
    out = []
    for rid in ['akhdar-hafs', 'ayyoub-hafs', 'huthify-hafs']:
        P = pistes(rid)
        cles = sorted(P)
        n = 0
        while n < 3:
            s, a = rnd.choice(cles)
            vs, dur = [], 0.0
            for b in range(a, a + 12):
                if (s, b) not in P or dur + P[(s, b)][1] > 60:
                    break
                vs.append((s, b)); dur += P[(s, b)][1]
            if len(vs) < 3 or dur < 25:
                continue
            audio = [lire(P[v][0]) for v in vs]
            out.append({'rid': rid, 'versets': vs, 'x': np.concatenate(audio), 'saut': None})
            if n == 0:  # même portion, verset du milieu sauté (détection en direct)
                k = len(vs) // 2
                out.append({'rid': rid, 'versets': vs, 'x': np.concatenate(audio[:k] + audio[k + 1:]),
                            'saut': list(vs[k])})
            n += 1
    return out


def main(noms):
    S = seances()
    for nom in noms:
        ecoute.etat['modele'] = asr.charger(nom, int(os.environ.get('THREADS', '4')))
        res = []
        for k, se in enumerate(S):
            s = ecoute.Seance()
            x = se['x']
            morceaux = []
            for i in range(0, len(x), SR):
                bloc = x[i: i + SR]
                t = time.perf_counter()
                r = ecoute._direct(s, bloc)
                morceaux.append({'t': round((i + len(bloc)) / SR, 2), 'calcul': round(time.perf_counter() - t, 3),
                                 'mots': r['mots'], 'partiel': r['partiel'], 'voix': r['voix']})
            # fin : une seconde de silence pour clore le dernier passage (comme l'appli)
            t = time.perf_counter()
            r = ecoute._direct(s, np.zeros(SR, dtype=np.float32))
            morceaux.append({'t': round(len(x) / SR + 1, 2), 'calcul': round(time.perf_counter() - t, 3),
                             'mots': r['mots'], 'partiel': r['partiel'], 'voix': r['voix'], 'fin': True})
            res.append({'rid': se['rid'], 'versets': se['versets'], 'saut': se['saut'], 'morceaux': morceaux})
            print(nom, k, len(morceaux), 'morceaux', flush=True)
        json.dump(res, open(f'/work/direct-{nom}.json', 'w', encoding='utf-8'), ensure_ascii=False)
        del ecoute.etat['modele']


if __name__ == '__main__':
    main(sys.argv[1:])
