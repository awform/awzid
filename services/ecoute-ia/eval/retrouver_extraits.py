"""
« Retrouve ce verset » : EXTRAITS de mesure (temps de réponse et justesse du service réel, bout en bout). Comme l'étude
(ETUDE_SHAZAM.md § 3) : un verset au hasard, un point de départ au hasard, 5 à 15 s en enchaînant les versets suivants,
silences du Complexe retirés et 0,6 s de pause entre les versets ; puis encodés en Opus 32 kb/s (WebM), comme
l'enregistrement du navigateur. Plusieurs récitateurs (pas seulement Ayyūb).
    python retrouver_extraits.py   -> /work/extraits/*.webm + /work/extraits/verite.json
Fichiers du Complexe lus en lecture seule (/src) ; les extraits restent dans le dossier de travail de la mesure.
"""
import json, os, random, subprocess, sys
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import asr  # noqa: E402
from evaluer import lire, pistes  # noqa: E402

SR = asr.SR
N = int(os.environ.get('N', '60'))
RECITANTS = os.environ.get('RECITANTS', 'ayyoub-hafs,akhdar-hafs,huthify-hafs,muaiqly-hafs').split(',')


def voix_seule(path):
    x = lire(path)
    z = asr.zones_de_voix(x)
    if z:
        x = x[int(max(0, z[0][0] - 0.1) * SR): int(min(len(x) / SR, z[-1][1] + 0.1) * SR)]
    return np.concatenate([x, np.zeros(int(0.6 * SR), dtype=np.float32)])


def main():
    rnd = random.Random(int(os.environ.get('GRAINE', '1025')))
    os.makedirs('/work/extraits', exist_ok=True)
    P = {rid: pistes(rid) for rid in RECITANTS}
    verite = []
    while len(verite) < N:
        rid = RECITANTS[len(verite) % len(RECITANTS)]
        cles = sorted(P[rid])
        k = rnd.randrange(len(cles))
        d = rnd.uniform(5, 15)
        x0 = voix_seule(P[rid][cles[k]][0])
        off = rnd.uniform(0, max(0.0, len(x0) / SR - 1.0))
        morceaux, presence, tot, j = [x0[int(off * SR):]], [], 0.0, k
        presence.append([cles[j], len(morceaux[0]) / SR])
        tot = presence[0][1]
        while tot < d and j + 1 < len(cles) and cles[j + 1][0] == cles[k][0]:
            j += 1
            x = voix_seule(P[rid][cles[j]][0])
            morceaux.append(x)
            presence.append([cles[j], len(x) / SR])
            tot += len(x) / SR
        audio = np.concatenate(morceaux)[: int(d * SR)]
        if len(audio) / SR < 4.5:
            continue
        reste = len(audio) / SR
        for p in presence:
            p[1] = round(min(p[1], max(0.0, reste)), 2)
            reste -= p[1]
        nom = f'x{len(verite):03d}.webm'
        subprocess.run(['ffmpeg', '-nostdin', '-loglevel', 'error', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', 'pipe:0',
                        '-c:a', 'libopus', '-b:a', '32k', '-f', 'webm', f'/work/extraits/{nom}'],
                       input=audio.astype(np.float32).tobytes(), check=True)
        verite.append({'fichier': nom, 'recitant': rid, 'duree': round(len(audio) / SR, 2),
                       'versets': [[f'{s}:{a}', t] for (s, a), t in presence if t > 0]})
    json.dump(verite, open('/work/extraits/verite.json', 'w'), indent=1)
    print(len(verite), 'extraits')


if __name__ == '__main__':
    main()
