#!/bin/bash
# A5 — image du service, tests dans l'image, essai réel (modèle NeMo RNN-T) : sous le verrou commun
cd ~/awform-a5/services/ecoute-ia
L=~/a5/eval/service.log

flock ~/.awzid-e2e.lock bash -c '
set -x
date
docker build --target service -t awzid/ecoute-ia:local . 2>&1 | tail -3
# tests (modèle factice), conteneur en lecture seule comme en production
docker run --rm --read-only --tmpfs /tmp:size=256m -e HOME=/tmp -e ECOUTE_ESSAI=1 awzid/ecoute-ia:local \
  python -m pytest -q -p no:cacheprovider tests 2>&1 | grep -v -i warn | tail -15
# essai réel
docker rm -f a5-ecoute-essai >/dev/null 2>&1
docker run -d --name a5-ecoute-essai --read-only --tmpfs /tmp:size=1g,mode=1777 --cpus 6 -m 6g \
  -e HOME=/tmp -e NUMBA_CACHE_DIR=/tmp -e MPLCONFIGDIR=/tmp -e ECOUTE_NOM=nemo_rnnt -e ECOUTE_THREADS=3 -e ECOUTE_CONCURRENCE=2 \
  -e ECOUTE_MODELE=/model/stt_ar_fastconformer_hybrid_large_pcd_v1.0.nemo \
  -v ~/modeles-ia/nvidia_stt_ar_fastconformer_hybrid_large_pcd_v1.0:/model:ro -p 127.0.0.1:18765:8000 \
  awzid/ecoute-ia:local
for i in $(seq 1 90); do curl -s 127.0.0.1:18765/sante | grep -q "\"modeles_charges\":2" && break; sleep 2; done
curl -s 127.0.0.1:18765/sante; echo
docker stats --no-stream --format "{{.Name}} {{.MemUsage}}" a5-ecoute-essai
F=~/coran-audio-source/akhdar-hafs/10-002255-A02.mp3
ffprobe -v error -show_entries format=duration -of csv=p=0 $F
for k in 1 2; do /usr/bin/time -f "%e s" curl -s -o /tmp/a5-r.json -H "content-type: audio/mpeg" --data-binary @$F 127.0.0.1:18765/ecouter; head -c 400 /tmp/a5-r.json; echo; done
python3 -c "import json;r=json.load(open(\"/tmp/a5-r.json\"));print(\"duree\",r[\"duree\"],\"calcul\",r[\"calcul\"],\"mots\",len(r[\"mots\"]))"
# 2 envois simultanés (file de traitement)
for k in 1 2 3; do (curl -s -o /tmp/a5-p$k.json -w "%{http_code} %{time_total}\n" -H "content-type: audio/mpeg" --data-binary @$F 127.0.0.1:18765/ecouter &) ; done; sleep 40; cat /tmp/a5-p*.json | head -c 300; echo
# plus de 5 minutes : refus
ffmpeg -nostdin -loglevel error -f lavfi -i "sine=frequency=300:duration=310" -c:a libopus -b:a 24k -f webm /tmp/a5-long.webm -y
curl -s -w " %{http_code}\n" -H "content-type: audio/webm" --data-binary @/tmp/a5-long.webm 127.0.0.1:18765/ecouter
docker stats --no-stream --format "{{.Name}} {{.MemUsage}}" a5-ecoute-essai
echo "== fichiers modifiés dans le conteneur (doit être vide) :"; docker diff a5-ecoute-essai
docker exec a5-ecoute-essai sh -c "find /tmp -type f | grep -v -E \"/tmp/(tmp[a-z0-9_]+/)?(numba|matplotlib|hf)\" | head"
docker logs a5-ecoute-essai 2>&1 | grep -v -i warn | tail -5
docker rm -f a5-ecoute-essai >/dev/null
rm -f /tmp/a5-*.json /tmp/a5-long.webm
date
' > $L 2>&1
