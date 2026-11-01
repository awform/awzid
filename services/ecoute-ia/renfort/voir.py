"""Aperçu rapide d'un fichier de mesures (fautes ou correct) : python3 voir.py FICHIER.jsonl.gz [champs...]"""
import gzip
import json
import sys

champs = sys.argv[2:] or ['faute', 'regle', 'aligne', 'cout', 'tok', 'dn', 's', 'a']
for l in gzip.open(sys.argv[1], 'rt', encoding='utf-8'):
    d = json.loads(l)
    print(' '.join(str(round(d.get(c), 3) if isinstance(d.get(c), float) else d.get(c)) for c in champs))
