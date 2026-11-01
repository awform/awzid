"""
Awzid — RENFORT DU TAJWĪD : décodage des enregistrements d'apprenants de QDAT (obadx/qdat, MIT) et de qdat_bench
(obadx/qdat_bench, Apache-2.0), fautes RÉELLES étiquetées sur la fin du verset 5:109. Recherche interne, rien redistribué.

    python qdat_decoder.py qdat|bench   -> /out/qdat_<nom>.jsonl.gz : étiquettes + mesures étendues (mesures2) par enregistrement

L'audio n'est lu qu'en mémoire (octets WAV du parquet). Le texte est celui de Tanzil, octet pour octet : les mots de 5:109 qui
suivent le premier signe de pause (« قَالُوا۟ … ٱلْغُيُوبِ »), sans retaper ni normaliser quoi que ce soit.
"""
from __future__ import annotations

import gzip
import io
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, '/p')
import mesures2 as M  # noqa: E402
import tajwid_commun as tc  # noqa: E402
from pipeline_voix import Decodeur  # noqa: E402

SR = 16000


def texte_qdat():
    mots = tc.lire_tanzil()[(5, 109)].split(' ')
    # le premier signe de pause d'arrêt (pas le ۞ de début de ḥizb)
    k = next(i for i, w in enumerate(mots) if i > 0 and w and all(c in tc.PAUSES for c in w) and w != '\u06de')
    return ' '.join(mots[k + 1:])


def lire_wav(b):
    import soundfile as sf
    x, sr = sf.read(io.BytesIO(b), dtype='float32', always_2d=True)
    x = x.mean(1)
    if sr != SR:
        import scipy.signal as ss
        from math import gcd
        g = gcd(sr, SR)
        x = ss.resample_poly(x, SR // g, sr // g).astype(np.float32)
    return x


def main():
    import pyarrow.parquet as pq
    nom = sys.argv[1]
    fichiers = {'qdat': ['/d/qdat/train-00000-of-00002.parquet', '/d/qdat/train-00001-of-00002.parquet'],
                'bench': ['/d/qdat_bench/train-00000-of-00001.parquet']}[nom]
    T = texte_qdat()
    print('texte (Tanzil) :', T, flush=True)
    out = f'/out/qdat_{nom}.jsonl.gz'
    dejà = set()
    anciens = []
    if os.path.exists(out) and os.environ.get('REMESURER') != '1':
        anciens = [json.loads(l) for l in gzip.open(out, 'rt', encoding='utf-8')]
        dejà = {d['id'] for d in anciens}
    g = gzip.open(out + '.tmp', 'wt', encoding='utf-8')
    for d in anciens:
        g.write(json.dumps(d, ensure_ascii=False) + '\n')
    dec = Decodeur()
    os.makedirs(f'/out/qdat_cache_{nom}', exist_ok=True)
    n = 0
    for f in fichiers:
        pf = pq.ParquetFile(f)
        for rg in range(pf.num_row_groups):
            t = pf.read_row_group(rg)
            cols = [c for c in t.column_names if c not in ('audio', 'sifat')]
            meta = t.select(cols).to_pylist()
            sif = t.column('sifat').to_pylist() if 'sifat' in t.column_names else [None] * len(meta)
            for i, md in enumerate(meta):
                if md['id'] in dejà:
                    continue
                # QDAT : au plus MAX_REP répétitions par récitant (s<récitant>_<répétition>), elles sont très corrélées
                rep = str(md.get('original_id', '')).rsplit('_', 1)[-1]
                if nom == 'qdat' and rep.isdigit() and int(rep) > int(os.environ.get('MAX_REP', '4')):
                    continue
                a = t.column('audio')[i].as_py()
                x = lire_wav(a['bytes'])
                fz = f'/out/qdat_cache_{nom}/{md["id"]}.npz'
                if os.path.exists(fz):   # déjà décodé : on ne refait que les mesures (aucun modèle chargé)
                    z = np.load(fz)
                    lp = {k: z[k].astype(np.float32) for k in ('phonemes', 'ghonna', 'qalqla', 'tafkheem_or_taqeeq')}
                else:
                    lp = dec(x)
                    np.savez_compressed(fz, n=len(x), **{k: v.astype(np.float16) for k, v in lp.items()})
                mes = M.mesurer_verset(T, lp, len(x), x)
                ligne = dict(md, duree_audio=len(x) / SR, mesures=mes, sifat=sif[i],
                             transcription_modele=''.join(d['tok'] for d in M.glouton(lp['phonemes'])))
                g.write(json.dumps(ligne, ensure_ascii=False) + '\n')
                g.flush()
                n += 1
                if n % 50 == 0:
                    print(nom, n, flush=True)
    g.close()
    os.replace(out + '.tmp', out)
    print(nom, 'fini', n, flush=True)


if __name__ == '__main__':
    main()
