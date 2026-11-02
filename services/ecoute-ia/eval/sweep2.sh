# usage : sweep2.sh <banc-dir> <fichier-lectures> <fichier-configs> [pair|impair|tous]
# une configuration par ligne : étiquette|SEUILS json|REGLAGES json
cd ~/wt/tarteel-2/services/ecoute-ia/eval
B=$1; F=$2; C=$3; S=${4:-tous}
TSV=$HOME/awform-content/coran/tanzil-uthmani.tsv
while IFS='|' read -r nom seuils regl; do
  [ -z "$nom" ] && continue
  SEUILS="${seuils:-{\}}" REGLAGES="${regl:-{\}}" SOUS=$S nice node banc.mjs $TSV $B fen:$F > /tmp/t2-sw.json 2>/tmp/t2-sw.err || { echo "$nom ERREUR $(head -c 200 /tmp/t2-sw.err)"; continue; }
  node -e "
const v=Object.values(JSON.parse(require('fs').readFileSync('/tmp/t2-sw.json','utf8')).resultat)[0];
console.log('$nom :', v.resume);"
done < $C
