"""Fumée : le décodage contraint DANS le service (ecoute._fenetre, vrai modèle) sur 3 séances du banc de vérification."""
import json, os, sys, time
import numpy as np
sys.path.insert(0, '/code')
os.environ.setdefault('ECOUTE_ESSAI', '0')
import asr, ecoute  # noqa: E402

B = '/work'
exp = json.load(open(f'{B}/export-t3.json'))
m = asr.charger('nemo_rnnt', 3)
for sid in sys.argv[1:]:
    e = exp[sid]
    x = np.fromfile(f'{B}/audio/{sid}.f32', dtype=np.float32)
    s = ecoute.Seance()
    s.fenetre = True
    s.attendu = {'mots': e['mots'], 'versets': e['va'], 'fac': e['fac']}
    x = np.concatenate([x, np.zeros(3 * asr.SR, dtype=np.float32)])
    dts, vu = [], None
    for k in range(0, len(x), asr.SR):
        t0 = time.perf_counter()
        r = ecoute._fenetre(m, s, x[k: k + asr.SR])
        dts.append(time.perf_counter() - t0)
        if r.get('ecarts_texte') and vu is None:
            vu = (r['t'], r['ecarts_texte'])
    print(sid, e['type'], e['verite'], '->', vu, 'final', r.get('ecarts_texte'), 'calcul médian', round(float(np.median(dts)), 2))
