"""Récupère les lignes complètes d'un fichier .jsonl.gz.tmp interrompu (conteneur arrêté) : python3 recuperer_tmp.py SRC DST"""
import gzip
import json
import sys

ok = []
try:
    with gzip.open(sys.argv[1], 'rt', encoding='utf-8') as f:
        for l in f:
            try:
                ok.append(json.loads(l))
            except ValueError:
                break
except (EOFError, OSError):
    pass
with gzip.open(sys.argv[2], 'wt', encoding='utf-8') as g:
    for d in ok:
        g.write(json.dumps(d, ensure_ascii=False) + '\n')
print('lignes récupérées', len(ok))
