"""
Détecteur « décodage contraint » appliqué aux lectures d'un banc (phase 3 de « Tarteel titan »).

  python detecteur.py <banc-dir> <export.json> <lectures.json> <sortie.json>

Entrées : export.json (banc.mjs, EXPORT=… : mots attendus, versets, vérité), lectures (banc.py : instants des lectures),
topk/<séance>.npz (banc.py TOPK=1). Sortie : {séance: [{t, type, i, fin}]} pour banc.mjs (EXTRA=…).
Réglages : R='{"ins":-8,…}' (voir contraint.REGLAGES) ; PERS=n (écart vu dans n lectures de suite) ; IDS=<fichier> ; PROC=3.
"""
import json, os, shutil, sys, tarfile, tempfile
from multiprocessing import Pool

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import contraint as C  # noqa: E402

MODELE = os.environ.get('ECOUTE_MODELE', '/model/stt_ar_fastconformer_hybrid_large_pcd_v1.0.nemo')
TOK = os.environ.get('TOKENIZER', '/work/tokenizer.model')


def tokenizer():
    import sentencepiece as spm
    if not os.path.exists(TOK):
        d = tempfile.mkdtemp()
        with tarfile.open(MODELE) as t:
            nom = [n for n in t.getnames() if n.endswith('tokenizer.model')][0]
            t.extract(nom, d)
        shutil.copy(os.path.join(d, nom), TOK)
    sp = spm.SentencePieceProcessor()
    sp.load(TOK)
    return sp


R = dict(C.REGLAGES)
R.update(json.loads(os.environ.get('R', '{}')))
PERS = int(os.environ.get('PERS', '1'))
SP = None


def init():
    global SP
    SP = tokenizer()


def une(args):
    B, sid, e, reads_t = args
    f = f'{B}/topk/{sid}.npz'
    if not os.path.exists(f):
        return sid, None
    blanc = SP.get_piece_size()
    cls = C.classes(SP) if R.get('squel') else None
    jetons = [C.variantes(SP, w, int(R['nvar']), cls) for w in e['mots']]
    g = C.Graphe(jetons, e['va'], blanc, e.get('fac'))
    z = np.load(f)
    ids, lp, dec, lec = z['ids'].astype(np.int64), z['lp'].astype(np.float32), z['decalage'], z['lecture']
    longs = (ids[:, :, 0] >= 0).sum(1)
    vus = {}  # (type,i,fin) -> [nombre de lectures de suite, dernière lecture]
    out = []
    for n in range(len(dec)):
        L = int(longs[n])
        if L < 5:
            continue
        t_lec = reads_t[int(lec[n])]['t']
        E, fb, f0, voix = C.emissions(ids[n, :L], lp[n, :L], blanc, blanc, R, C.classes(SP))
        chemin, entrees = C.viterbi(g, E, fb, f0, R)
        t_fin = int((t_lec - dec[n]) / C.FRAME)
        for (typ, i, fin, tr) in C.ecarts(g, chemin, entrees, voix, R, min(t_fin, L - 1), voix, reads_t[int(lec[n])].get('voix'), float(dec[n])):
            k = (typ, i, fin)
            c, der = vus.get(k, [0, -9])
            c = c + 1 if der == n - 1 else 1
            vus[k] = [c, n]
            if c == PERS:
                out.append({'t': t_lec, 'type': typ, 'i': int(i), 'fin': int(fin),
                            'inst': round(float(dec[n] + tr * C.FRAME), 2)})
    return sid, out


def main():
    B, EXP, LECT, OUT = sys.argv[1:5]
    exp = json.load(open(EXP, encoding='utf-8'))
    lect = {L['id']: [{'t': r['t'], 'voix': r.get('voix')} for r in L['reads']] for L in json.load(open(LECT, encoding='utf-8'))}
    ids = set(json.load(open(os.environ['IDS']))) if os.environ.get('IDS') else None
    tache = [(B, sid, e, lect[sid]) for sid, e in exp.items() if sid in lect and (ids is None or sid in ids)]
    if not os.path.exists(TOK):
        init()
    with Pool(int(os.environ.get('PROC', '3')), initializer=init) as p:
        res = dict(p.map(une, tache, chunksize=1))
    res = {k: v for k, v in res.items() if v is not None}
    json.dump(res, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False)
    print(len(res), 'séances,', sum(len(v) for v in res.values()), 'écarts', file=sys.stderr)


if __name__ == '__main__':
    main()
