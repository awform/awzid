# ADR 0005 — Codes d'activation imprimés dans les livres (lot 23)

Date : 30/09/2026. Statut : accepté.

## Contexte

Les livres papier vendus doivent ouvrir le niveau correspondant dans l'application, sans paiement en ligne
(famille sans carte bancaire), sans fraude facile et sans que le serveur ne garde des codes réutilisables.

## Décision

1. Format **`AWZ-XXXX-XXXX-XXXXC`** : 12 caractères de l'alphabet de **Crockford** (sans I, L, O, U : pas de
   confusion à la lecture) + **1 caractère de contrôle** (somme pondérée modulo 32 : une faute de frappe ou deux
   caractères inversés sont détectés sans consulter la base ni compter d'essai) ; saisie tolérante (minuscules,
   espaces, O→0, I/L→1). Code : `packages/billing/src/activation.ts`.
2. Seule l'**empreinte SHA-256** du code normalisé est gardée ; codes en clair montrés **une fois** à
   l'administrateur (fichier CSV pour l'imprimeur).
3. **Usage unique atomique** (mise à jour conditionnelle `redeemed_at IS NULL`) ; anti-essais : 5 codes
   inconnus → verrou ; lot révocable (livres perdus) ; date limite facultative.
4. L'accès (12 mois par défaut) **s'ajoute** à la fin de l'accès en cours ; il ouvre le niveau et son paquet
   hors ligne.
5. Aucun paiement réel : prix, durée et circuit de l'imprimeur sont des décisions du client (D13).

## Conséquences

- Une fuite de la base ne donne aucun code utilisable ; preuves : `apps/api/test/lot23.test.ts`,
  `packages/billing/test/activation.test.ts`, e2e `suite-v1.spec.ts` (code mal saisi).
- Le fichier des codes est un **secret** entre l'administrateur et l'imprimeur (transmission sûre à organiser).
- Le caractère de contrôle ne détecte pas toutes les fautes multiples : elles tombent dans l'anti-essais.
