"""
BANC 2 DU SUIVI DE LA RÉCITATION (phase 2 du chantier « Tarteel titan », 11/2026) : plus de séances (≥ 20 par type), plus de
passages (≥ 25, dont des versets très proches : mutashābihāt), plusieurs récitateurs — les 5 du Complexe et 6 d'everyayah
(~/tajwid-donnees/everyayah, LECTURE SEULE). Même format que banc.py : `banc.sh lire base|fen` et `banc.mjs` s'appliquent tels quels.

  python banc2.py sessions        -> /work/sessions.json + /work/audio/*.f32   (SCRIPT=banc2.py bash banc.sh sessions)

Types (QUOTAS) : juste, oubli, remplacement (dont des « confusions » : le mot est remplacé par le mot d'un verset presque
identique, du même récitateur), ajout, saut_verset ; récitation normale : repete, reprise, retour, pause ; juste dégradée : bruit,
telephone. Les portions proches (mutashābihāt) sont trouvées par recouvrement des 3-grammes de mots dans le texte Tanzil.
"""
import json, os, random, sys
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('ECOUTE_ESSAI', '0')
import asr  # noqa: E402
import banc  # noqa: E402
from banc import SR, W, bruit_blanc, normal  # noqa: E402
from evaluer import cle, condition, lire, mots, pistes, tanzil  # noqa: E402
from suivi_sim import avec_erreur, solides  # noqa: E402

EA = os.environ.get('EVERYAYAH', '/everyayah')
RECITANTS_COMPLEXE = ['akhdar-hafs', 'ayyoub-hafs', 'huthify-hafs', 'muaiqly-hafs', 'muhanna-hafs']
RECITANTS_EA = os.environ.get(
    'RECITANTS_EA',
    'Alafasy_128kbps,Husary_128kbps,Abdul_Basit_Murattal_192kbps,Abdurrahmaan_As-Sudais_192kbps,'
    'Ali_Jaber_64kbps,Abu_Bakr_Ash-Shaatree_128kbps').split(',')
PORTIONS = int(os.environ.get('PORTIONS', '3'))
QUOTAS = os.environ.get('QUOTAS', 'juste:50,oubli:20,remplacement:22,ajout:20,saut_verset:20,repete:20,reprise:20,retour:20,'
                                  'pause:10,bruit:10,telephone:10')
THREADS = int(os.environ.get('THREADS', '4'))
DUREE_MIN, DUREE_MAX = 16.0, 34.0


def pistes_ea(nom):
    """{(sourate, verset): chemin} d'un récitateur everyayah (fichiers SSSVVV.mp3)."""
    out = {}
    for f in os.listdir(f'{EA}/{nom}'):
        if len(f) == 10 and f.endswith('.mp3') and f[:6].isdigit():
            out[(int(f[:3]), int(f[3:6]))] = f'{EA}/{nom}/{f}'
    return out


def pistes_de(rid):
    if rid in RECITANTS_COMPLEXE:
        return {k: v[0] for k, v in pistes(rid).items()}
    return pistes_ea(rid)


def soeurs(T, n_max=14):
    """Versets du texte Tanzil très proches d'un autre (≥ 8 mots, recouvrement des 3-grammes de mots ≥ 0,5, textes différents)."""
    sq = {k: [cle(w) for w in v.split(' ') if cle(w)] for k, v in T.items()}
    gr = {}
    for k, ws in sq.items():
        g = {tuple(ws[i:i + 3]) for i in range(len(ws) - 2)}
        gr[k] = g
    index = {}
    for k, g in gr.items():
        for x in g:
            index.setdefault(x, []).append(k)
    paires = {}
    for k, g in gr.items():
        if len(sq[k]) < 8 or len(g) < 6:
            continue
        compte = {}
        for x in g:
            for k2 in index[x]:
                if k2 != k:
                    compte[k2] = compte.get(k2, 0) + 1
        for k2, c in compte.items():
            if len(sq[k2]) >= 8 and sq[k] != sq[k2]:
                j = c / len(g | gr[k2])
                if j >= 0.5 and (k not in paires or j > paires[k][1]):
                    paires[k] = (k2, j)
    return paires


def portion(rnd, rid, P, depart, modele, T):
    """Portion de versets consécutifs à partir de `depart`, 16 à 34 s ; None si un fichier manque ou si c'est trop long."""
    vs, aud, dur = [], [], 0.0
    s, a = depart
    while dur < DUREE_MIN and len(vs) < 4:
        if (s, a) not in P or (s, a) not in T:
            return None
        x = lire(P[(s, a)])
        if dur + len(x) / SR > DUREE_MAX:
            return None
        vs.append((s, a)); aud.append(x); dur += len(x) / SR
        a += 1
    if len(vs) < 2 or dur < DUREE_MIN * 0.8:
        return None
    p = {'rid': rid, 'versets': vs, 'audio': aud}
    solides(modele, p, T)
    return p


def sessions2():
    os.makedirs(f'{W}/audio', exist_ok=True)
    rnd = random.Random(int(os.environ.get('GRAINE', '77')))
    rng = np.random.default_rng(77)
    T = tanzil()
    modele = asr.charger('nemo_rnnt', THREADS)
    pa = soeurs(T)
    print('versets avec sœur proche :', len(pa), flush=True)
    # départs de portions : mutashābihāt (verset à sœur) + départs au hasard
    dep_m = sorted(k for k in pa if (k[0], k[1] + 1) in T)
    dep_h = sorted(k for k in T if k[1] <= 30 and (k[0], k[1] + 1) in T and len(T[k].split(' ')) <= 14)
    P_all, rec = [], RECITANTS_COMPLEXE + RECITANTS_EA
    for rid in rec:
        P = pistes_de(rid)
        n_m = n_h = 0
        for _ in range(400):
            if n_m < max(1, PORTIONS // 2) and dep_m:
                d, mut = rnd.choice(dep_m), True
            elif n_h < PORTIONS:
                d, mut = rnd.choice(dep_h), False
            else:
                break
            if rid in ('muhanna-hafs',) and d[0] in (42, 109, 110):
                continue
            p = portion(rnd, rid, P, d, modele, T)
            if p is None:
                continue
            p['mut'] = mut
            if mut:  # portion de la sœur du premier verset, du même récitateur (donneur des « confusions »)
                s2 = pa[d][0]
                if s2 in P:
                    q = {'rid': rid, 'versets': [s2], 'audio': [lire(P[s2])]}
                    solides(modele, q, T)
                    p['soeur'] = q
            P_all.append(p)
            if mut:
                n_m += 1
            else:
                n_h += 1
        print('portions', rid, n_m, n_h, flush=True)
    print(len(P_all), 'portions', sum(1 for p in P_all if p['mut']), 'à versets proches', flush=True)
    plan = [(t, int(n)) for t, n in (z.split(':') for z in QUOTAS.split(','))]
    out = []

    def ecrire(p, x, typ, verite, cond='propre', extra=None):
        sid = f'c{len(out) + 1:03d}'
        x = x.astype(np.float32)
        x.tofile(f'{W}/audio/{sid}.f32')
        out.append({'id': sid, 'type': typ, 'cond': cond, 'rid': p['rid'], 'versets': p['versets'],
                    'duree': round(len(x) / SR, 2), 'verite': verite, 'ref': modele.transcrire(x),
                    'voix': asr.zones_de_voix(x), 'mut': bool(p.get('mut')), **(extra or {})})
        print(sid, typ, p['rid'], round(len(x) / SR, 1), 's', flush=True)
        json.dump(out, open(f'{W}/sessions.json', 'w', encoding='utf-8'), ensure_ascii=False)

    for typ, n in plan:
        pris, essais = 0, 0
        while pris < n and essais < n * 30:
            essais += 1
            p = rnd.choice(P_all)
            autres = [q for q in P_all if q['rid'] != p['rid']]
            if typ == 'juste':
                ecrire(p, p['x'], typ, None)
            elif typ == 'remplacement':
                conf = pris < 8 and p.get('soeur') is not None  # 8 « confusions » avec le mot d'un verset presque identique
                y, v = avec_erreur(rnd, p, typ, [p['soeur']] if conf else autres)
                if y is None:
                    continue
                ecrire(p, y, typ, v, extra={'confusion': conf})
            elif typ in ('oubli', 'ajout', 'saut_verset'):
                if typ == 'saut_verset' and len(p['versets']) < 3:
                    continue  # le dernier verset sauté ne se voit pas (jamais signalé par principe)
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
    print(len(out), 'séances', round(sum(s['duree'] for s in out) / 60, 1), 'min', len(P_all), 'portions', flush=True)


if __name__ == '__main__':
    sessions2()
