# Awzid — consignes pour toute session Claude (locale ou cloud)

Toujours répondre et écrire en **français** (code et identifiants en anglais, comme l'existant).

## Le projet
Awzid (ex-AWFORM) : application mondiale d'apprentissage de l'arabe, du Coran (hifẓ, lecture de Ḥafṣ),
des sciences islamiques (école mālikite) et de l'écriture ; école pilote au Sénégal.
Référence : `docs/projet/CAHIER_DES_CHARGES.md` (§2.1 carte des fonctionnalités par lot, §6.2 lots),
`docs/projet/ARCHITECTURE_V2.md` (§8.2 lots), `docs/projet/JOURNAL_DEV.md` (historique des lots 0 à 16).

## Règles absolues
- Ne jamais toucher le dépôt `awform/awform` (ancienne application abandonnée).
- Aucun contenu religieux généré : versets, hadiths, règles de fiqh viennent seulement des livres gelés
  (`packages/content`). Texte coranique Tanzil octet par octet, jamais retapé ni normalisé (NFC interdit).
- Aucun visage dans les illustrations. Aucune phonétique latine côté élève.
- Aucun secret dans le dépôt. Ne jamais créer de compte ni saisir de mot de passe réel ou de carte.
- `pnpm-lock.yaml` : ne jamais l'écraser à la main (crochet pre-commit).
- Tous les tests restent verts (unitaires et e2e). Chaque lot ajoute ses tests.
- Travailler sur une branche (`lot17-wip`, puis `lot18-wip`…), jamais de fusion dans `main` :
  le chef de projet (session locale) relit et fusionne.
- Si PostgreSQL ou Docker manquent dans l'environnement cloud, les installer si possible
  (apt), sinon le dire clairement dans le journal, sans prétendre que les tests sont passés.

## Travail en cours
Lot 17 (branche `lot17-wip`) : TERMINÉ (voir JOURNAL_DEV) —
1. consentement par pays, dont le Sénégal (CDP, loi 2008-12) ;
2. relais d'école hors Internet : `apps/relay`, `apps/api/src/relais.ts`, migration `0014_relais.sql`
   (mini-PC ou Raspberry Pi, synchronisation chiffrée, HTTPS local, mode d'emploi en français
   pour le directeur d'école, en langage simple) ;
3. synchronisation sûre : git seule source, refus d'écraser une modification plus récente
   (`infra/synchro.sh`, `infra/pc/synchro.ps1`, `infra/verifier-copie.sh`).
Lot 18 (branche `lot18-wip`, V1-a) : TERMINÉ — réponses libres corrigées par l'enseignant, mode projection.
Lot 19 (branche `lot19-wip`, V1-b) : TERMINÉ — épreuves notées, textes non préparés, remédiation.
Lot 20 (branche `lot20-wip`, V1-e) : TERMINÉ — certificats signés (Ed25519) et vérifiables par QR.
Lot 21 (branche `lot21-wip`, V1-f) : PARTIEL (schéma seulement) — arrêté pour les corrections d'audit.
Lot 27 (branche `lot27-api-wip`) : audio du Coran, partie SERVEUR TERMINÉE (fichiers du Complexe à recevoir ;
interface par un autre agent) — `apps/api/src/coran-audio.ts`, `packages/db/src/audio/`, EXPLOITATION § 7.
Corrections d'audit : branche `corrections-audit` — les 73 constats traités (corrigés, ou reportés avec leur
raison), suivi `docs/projet/CORRECTIONS_AUDIT.md`, bilan `docs/projet/RAPPORT_CLOUD.md` ; CI entièrement verte.
Tests : `apps/api/test/content.ts` (vrais livres, sinon contenu synthétique `infra/ci/contenu-synthetique`,
généré par `infra/ci/synthetique/generer.mjs`, sans texte religieux) ; `helpers.ts` pour les nouveaux lots.
État des lignes V1 : `docs/projet/ECARTS.md` ; décisions du client : `docs/projet/DECISIONS_EN_ATTENTE.md`.

Ensuite : lots suivants d'après §2.1 / §6.2 du cahier des charges, en choisissant ce qui n'est pas
encore fait (voir JOURNAL_DEV). Plus tard seulement, sur décision du client : audio Azure, tuteur IA réel.

## À la fin de chaque lot
Ajouter une entrée en tête de `docs/projet/JOURNAL_DEV.md` (date, contenu, commits, nombre de tests),
committer, pousser la branche.
