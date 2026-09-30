# ADR 0003 — Certificats signés et vérifiables par QR (lot 20)

Date : 29/09/2026 (rédigé le 30/09/2026 d'après le code). Statut : accepté.

## Contexte

Les écoles délivrent des certificats de niveau et des attestations de hifẓ (jamais une ijāza). Un employeur,
une autre école ou une famille doit pouvoir vérifier qu'un certificat imprimé est authentique, sans compte et
sans exposer les données de l'élève.

## Décision

1. **Registre numéroté** en base (`certificate`) ; champs du registre **signés en Ed25519**
   (`apps/api/src/certsign.ts`) ; clé privée (`AWFORM_CERT_SIGN_KEY`, graine de 32 octets) dans le seul
   périmètre de l'API ; clé publique publiée avec son identifiant.
2. **QR imprimé** : adresse `/verifier/<numéro>?c=<code>` avec un **code aléatoire** propre au certificat ;
   sans le bon code, rien n'est montré (pas d'énumération) ; essais limités par adresse.
3. Page publique **légère, sans JavaScript** : nom affiché (prénom + initiale), niveau, mention, date, état
   (valide ou annulé, avec motif).
4. **Annulation** : le registre garde le certificat ; la vérification le montre annulé.

## Conséquences

- Vérification hors ligne possible avec la clé publique ; preuves : `apps/api/test/lot20.test.ts`.
- Données montrées à qui détient le QR : à valider par le juriste (D8).
- **Rotation de la clé** : la vérification compare l'identifiant de clé ; garder et publier l'ancienne clé
  publique, et étendre le code à plusieurs clés **avant** la première rotation (`docs/projet/EXPLOITATION.md`
  § 3).

## Options écartées

- Signature RSA : clés et signatures plus longues (QR plus dense) ; Ed25519 est natif dans Node.
- Blockchain ou service tiers de vérification : dépendance externe, données hors de notre contrôle.
