# Test de charge (lot 24, V1-h)

Objectif du cahier des charges : **p95 < 500 ms** sur les routes chaudes. Toujours contre une instance de
**TEST** (base jetable), jamais la production.

## Sans k6 (lanceur Node, aucune dépendance)

```bash
# API lancée sur la base de test, inscriptions de test autorisées
AWFORM_SIGNUP_PER_HOUR=500 … node apps/api/dist/server.js &
AWFORM_CHARGE_URL=http://127.0.0.1:3100 AWFORM_CHARGE_VU=20 AWFORM_CHARGE_SECONDES=15 \
  node apps/api/dist/cli/charge.js
```

Garde-fou : API locale seulement (127.0.0.1, localhost), sauf `AWFORM_CHARGE_INSTANCE_DE_TEST=1` pour une
instance de TEST distante. Variables : `AWFORM_CHARGE_VU` (utilisateurs virtuels, un compte adulte chacun), `AWFORM_CHARGE_SECONDES`
(durée par route), `AWFORM_CHARGE_P95_MS` (objectif, 500), `AWFORM_CHARGE_UNITE` (leçon, `en1.l01`). Sortie :
tableau Markdown p50 / p95 / max par route ; code de sortie 1 si une route dépasse l'objectif ou renvoie une
erreur. Code : `apps/api/src/cli/charge.ts` (testé par `apps/api/test/charge.test.ts`).

## Avec k6

```bash
k6 run -e BASE=http://127.0.0.1:3100 -e PASSWORD='<phrase de test>' -e VU=20 -e DUREE=1m infra/charge/k6.js
```

Seuils k6 : `p(95)<500` par route, moins de 1 % d'erreurs.

## Routes mesurées

santé (`/health`), connexion (`/auth/login`), leçon (`/units/:id`), séance du jour (`/today/:id`),
synchronisation d'événements (`POST /attempts`, 5 événements par envoi), messages de la famille
(`/famille/messages`).

## Mesures

Voir `docs/projet/JOURNAL_DEV.md` (entrée « lot 24 ») : machine, contenu, résultats. À refaire sur le serveur
de production avant l'ouverture (même commande, base de test à côté de la base réelle).

## Parcours réalistes à paliers (14/10/2026) — démonstration privée seulement

Outils sans dépendance (Node), pour une pile Docker Compose locale (la démonstration) atteinte par `http://127.0.0.1` ;
**jamais la bêta ni une adresse externe** (garde-fou « local seulement » et récitants externes `qf-*` exclus).

```bash
# 1. comptes fictifs charge-<n>@demo.awform.test (mot de passe tiré au hasard dans ~/.awzid-charge/pw, jamais affiché)
docker exec -i -e AWFORM_CHARGE_N=50 -e AWFORM_CHARGE_PW="$(cat ~/.awzid-charge/pw)" awform-api-1 \
  node --input-type=module - < infra/charge/semis-comptes.mjs
# 2. ressources (CPU machine, CPU/mémoire de chaque conteneur par cgroup, connexions PostgreSQL)
node infra/charge/echantillon.mjs echant.jsonl 5 &
# 3. paliers (parcours : connexion, accueil, leçon + audio, Madjaliss + groupe bêta, Coran, hifẓ, synchronisation)
AWFORM_CHARGE_PALIERS=5,20,50,100 AWFORM_CHARGE_SECONDES=90 AWFORM_CHARGE_MONTEE=10 node infra/charge/parcours.mjs
#    sans pause (saturation) : AWFORM_CHARGE_PENSEE_MS=0,0 ; rafale de connexions : AWFORM_CHARGE_SCENARIO=connexion
# 4. tableaux Markdown (latences p50/p95/p99, erreurs, cœurs par conteneur, mémoire, connexions PG)
node infra/charge/analyse.mjs charge-resultats.json echant.jsonl
# 5. écoute IA (quelques sessions, MP3 de synthèse, jamais de voix humaine)
node infra/charge/ecoute.mjs
```

Pour émuler un e2-standard-2 sur une machine plus grosse : limiter les conteneurs applicatifs à 2 cœurs
(`docker update --cpuset-cpus 0-1 awform-{caddy,web,api,db,worker}-1`), lancer le générateur sur d'autres cœurs
(`taskset -c 4-7 …`), puis tout remettre (`--cpuset-cpus 0-7`). Résultats et capacité estimée :
`application\beta\RAPPORT_CHARGE_SECURITE_14-10.md` ; mesures brutes : `reports/charge-2026-10-14/`.
