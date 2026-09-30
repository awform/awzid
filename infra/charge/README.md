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

Variables : `AWFORM_CHARGE_VU` (utilisateurs virtuels, un compte adulte chacun), `AWFORM_CHARGE_SECONDES`
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
