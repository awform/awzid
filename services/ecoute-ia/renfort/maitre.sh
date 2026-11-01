#!/bin/bash
# Awzid — renfort du tajwīd : chaîne UNIQUE de tous les traitements, un seul travail à la fois, HORS verrou (accord du
# coordinateur du 1/11) : conteneur en nice 19 / poids CPU et disque minimaux, 3 cœurs, 6 Go. Avant chaque travail, on attend
# que la charge sur 1 minute soit <= 8 (VM de 8 cœurs ; seuil relevé par le coordinateur) et que le disque soit <= PLAFOND_PCT (87,5 %).
# Voix everyayah supplémentaires : téléchargées une par une, mp3 effacés juste après la mesure. Reprenable.
R=$(cd "$(dirname "$0")" && pwd)
D=$HOME/tajwid-donnees/everyayah
O=$HOME/tajwid-renfort/sorties
J=$O/journal.log
PLAFOND_PCT=${PLAFOND_PCT:-87.5}
export SANS_VERROU=1
taux() { df -B1M --output=used,avail / | tail -1 | awk '{printf "%.2f", 100*$1/($1+$2)}'; }
attendre() {
  local n=0
  while :; do
    c=$(cut -d' ' -f1 /proc/loadavg)
    mem=$(awk '/MemAvailable/{print int($2/1024)}' /proc/meminfo)
    # le modèle prend environ 4 Go : on ne lance que s'il reste 6 Go disponibles (le 1/11, deux arrêts « 137 » par manque de mémoire)
    if awk -v c="$c" -v t="$(taux)" -v p="$PLAFOND_PCT" -v m="$mem" 'BEGIN{exit !(c<=8 && t<p && m>=6000)}'; then return 0; fi
    [ -f "$O/STOP" ] && { echo "$(date '+%F %T') STOP demandé" >> "$J"; exit 0; }
    n=$((n+1)); [ $((n % 15)) = 1 ] && echo "$(date '+%F %T') attente : charge $c, mémoire disponible $mem Mo, disque $(taux) %" >> "$J"
    sleep 60
  done
}
fait() { [ -f "$O/$1/fautes.jsonl.gz" ]; }
NV=(40 46 42 29 19 36 25 22 17 19 26 30 20 15 21 11 8 8 19 5 8 8 11 11 8 3 9 5 4 7 3 6 3 5 4 5 6)
telecharger() {   # $1 = dossier everyayah
  local v=$1
  mkdir -p "$D/$v"
  [ "$(ls "$D/$v" 2>/dev/null | grep -c mp3)" -ge 500 ] && return 0
  local tmp; tmp=$(mktemp -d)
  for s in $(seq 78 114); do
    S=$(printf %03d $s)
    wget -q -O "$tmp/$S.zip" "https://everyayah.com/data/$v/zips/$S.zip" && unzip -q -j -o "$tmp/$S.zip" '*.mp3' -d "$D/$v" 2>/dev/null
    rm -f "$tmp/$S.zip"
  done
  rmdir "$tmp"
  if [ "$(ls "$D/$v" | grep -c mp3)" -lt 500 ]; then   # pas de zips : verset par verset
    for i in $(seq 0 36); do
      s=$((78+i))
      for a in $(seq 1 ${NV[$i]}); do
        f=$(printf %03d%03d.mp3 $s $a)
        [ -s "$D/$v/$f" ] || wget -q -O "$D/$v/$f" "https://everyayah.com/data/$v/$f" || rm -f "$D/$v/$f"
      done
    done
  fi
  echo "$(date '+%F %T') $v téléchargé : $(ls "$D/$v" | grep -c mp3) mp3, $(du -sh "$D/$v" | cut -f1), disque $(taux) %" >> "$J"
}
voix_ea() {
  local v=$1
  fait "$v" && { rm -f "$D/$v"/*.mp3; return 0; }
  attendre
  telecharger "$v"
  EFFACER_AUDIO=1 bash "$R/lancer_voix.sh" "$v" everyayah 10 "$v"
  rm -f "$D/$v"/*.mp3
}
# 1. QDAT (fautes réelles), au plus 4 répétitions par récitant
[ -f "$O/qdat_qdat.jsonl.gz" ] || { attendre; bash "$R/lancer_qdat.sh" qdat; }
# 2. Ayyūb (la référence de durée du produit) avant les autres
fait ayyoub || { attendre; FRACTION=0.3 bash "$R/lancer_voix.sh" ayyoub complexe 25; }
# 3. voix everyayah : déjà sur le disque, puis les nouvelles
for v in Husary_128kbps Husary_Muallim_128kbps Abdul_Basit_Murattal_192kbps Abdul_Basit_Mujawwad_128kbps Alafasy_128kbps \
         Abdullah_Basfar_192kbps Abdurrahmaan_As-Sudais_192kbps Abu_Bakr_Ash-Shaatree_128kbps \
         Ahmed_ibn_Ali_al-Ajamy_128kbps_ketaballah.net Hani_Rifai_192kbps Muhsin_Al_Qasim_192kbps \
         Ali_Jaber_64kbps Abdullah_Matroud_128kbps Khaalid_Abdullaah_al-Qahtaanee_192kbps Yasser_Ad-Dussary_128kbps \
         Salah_Al_Budair_128kbps Abdullaah_3awwaad_Al-Juhaynee_128kbps Ghamadi_40kbps Fares_Abbad_64kbps Ahmed_Neana_128kbps \
         Akram_AlAlaqimy_128kbps Sahl_Yassin_128kbps mahmoud_ali_al_banna_32kbps Nasser_Alqatami_128kbps \
         Minshawy_Murattal_128kbps Mohammad_al_Tablaway_128kbps Muhammad_Jibreel_128kbps Saood_ash-Shuraym_128kbps; do
  voix_ea "$v"
done
# 4. les 4 autres voix de référence (fautes simulées d'entraînement)
for v in akhdar huthify muaiqly muhanna; do
  fait "$v" || { attendre; FRACTION=0.3 bash "$R/lancer_voix.sh" "$v" complexe 25; }
done
# 5. fautes d'Ayyūb interrompues (qalqala, madd)
if ! zcat "$O/ayyoub/fautes.jsonl.gz" | grep -q qalq_kubra_sans; then
  attendre; FRACTION=0.3 TYPES=qalq_kubra_sans,qalq_sughra_sans,madd_court bash "$R/lancer_voix.sh" ayyoub complexe 25
fi
echo "$(date '+%F %T') MAITRE FINI" >> "$J"
