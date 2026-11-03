cd ~/t4
E=~/wt/tarteel-3/services/ecoute-ia/eval
TSV=$HOME/awform-content/coran/tanzil-uthmani.tsv
for p in b2 verif; do
case $p in b2) B=$HOME/tarteel2-banc2; L=lect-fen-i.json; P=lect-fen-i-prod.json; export IDS=$B/ids190.json; DET=det-p2a;; verif) B=$HOME/tarteel3-banc-verif; L=lect-fen.json; P=lect-fen-prod.json; unset IDS; DET=det-f1;; esac
python3 - $B $L $P <<'EOF'
import json, sys
B, L, P = sys.argv[1:4]
d = json.load(open(f'{B}/{L}'))
for x in d:
    for r in x['reads']:
        r['calcul'] = round(r['calcul'] * 1.7, 3)
json.dump(d, open(f'{B}/{P}', 'w'))
EOF
run() { # nom lect reglages
  EXTRA=$B/det-f1.json REGLAGES="$3" nice node $E/banc.mjs $TSV $B fen:$2 > $B/res-lat-$1.json
  python3 - $B $1 $2 <<'EOF'
import json, sys
B, n, l = sys.argv[1:4]
r = json.load(open(f'{B}/res-lat-{n}.json'))['resultat'][f'fen:{l}']
ev = r['erreurs_vues']
print(f'{n:12s}', 'erreur dite', r['delai_erreur_s'], '| vus', sum(int(v.split("/")[0]) for v in ev.values()), '| FA', r['fausses_alertes_normales']['seances'], '| mot', r['delai_mot_s']['mediane'], '| calcul', r['calcul_par_lecture_s']['mediane'])
EOF
}
echo "== $p"
run base $L '{}'
run prod $P '{}'
run forcer15 $L '{"forcer":1.5}'
run marge03 $L '{"margeDroite":0.3}'
run f15m03 $L '{"forcer":1.5,"margeDroite":0.3}'
run f15m03prod $P '{"forcer":1.5,"margeDroite":0.3}'
run f10m03 $L '{"forcer":1.0,"margeDroite":0.3,"tolerance":0.8}'
done
