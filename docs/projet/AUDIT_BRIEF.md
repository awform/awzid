# AWFORM (futur « Awzid ») — dossier pour l'audit indépendant

*Préparé le 29/09/2026 par l'équipe de développement. Audit prévu dans 1 à 2 jours, **en lecture seule sur GitHub** (dépôt `awform/awzid`, branche `main`, dernier commit à la mise à jour : `d4be704`, 29/09/2026 — lot 16). Ce dossier dit ce qui a été fait, pourquoi, ce que nous savons fragile, et ce que nous demandons de vérifier. Il n'est pas dans le dépôt ; il ne contient aucun secret.*

---

## 1. Le produit en une minute

Application d'apprentissage liée à une collection de livres papier (36 livres) : **arabe** (enfants, ados, adultes), **Coran et hifẓ** (mémorisation sur 3 à 7 ans, carnets, validation par l'enseignant), **sciences islamiques** (école mālikite, textes des livres tels quels), écriture guidée, petits livres de lecture, suivi des parents et des enseignants. Public : familles et écoles, **Afrique de l'Ouest d'abord** (bas débit, hors ligne, téléphones d'entrée de gamme), puis Europe et Amérique du Nord. **Mineurs** majoritaires.

Principes non négociables : le **texte coranique** vient uniquement du Tanzil et est contrôlé octet par octet ; seuls les **hadiths du registre au statut VERIFIE** sont cités avec leur numéro ; **aucun avis religieux** généré ; **aucun visage** dans les illustrations ; **minimisation des données** des enfants (pseudonyme, année de naissance, aucun e-mail).

## 2. Périmètre de l'audit

| Dans le périmètre | Hors périmètre |
|---|---|
| Tout le code du dépôt : `apps/` (api, web, worker), `packages/` (content, grading, hifz, db, tutor, billing), `infra/` (déploiement, sauvegardes, Caddy, crochets git), `.github/workflows` | Le contenu des livres (copie privée `~/awform-content`, hors dépôt) et sa validation religieuse (référent humain) |
| Sécurité applicative, données des mineurs, garde-fous IA, paiements, hors ligne, CI | Les comptes externes (hébergeur, Stripe, Anthropic…) : **aucun n'existe encore** |
| Les choix d'architecture et leurs risques | L'instance de démonstration (réseau local, identifiants fictifs) |

**Important** : depuis le 29/09, la CI exécute aussi les **tests sur base PostgreSQL 18** (service conteneur) et la **batterie adverse du tuteur** (fournisseur simulé) ; seuls les tests qui demandent les **livres** (contenu privé) et les tests de bout en bout restent sur la machine de développement (voir § 6). Nous n'avons **pas accès** à l'onglet Actions (aucun compte GitHub côté équipe) : merci de nous dire l'état réel des dernières exécutions.

## 3. Architecture

```
navigateur / PWA (SvelteKit 2, Svelte 5, mode SPA, service worker, IndexedDB)
        │ HTTPS (Caddy : TLS, en-têtes, compression)
        ├── /       → web (adapter-node)
        └── /api/*  → api (Fastify 5, Node 24, TypeScript 6)
                          │
                          ├── PostgreSQL 18 (Drizzle, migrations 0000 → 0009)
                          ├── worker (pg-boss 12 : purge RGPD, journal du tuteur, battement)
                          ├── @awform/tutor  (orchestrateur IA, filtre de sortie, batterie adverse)
                          └── @awform/billing (formules, droits, prestataires de paiement)
```

| Paquet | Rôle | Fichiers d'entrée |
|---|---|---|
| `packages/content` | lecture des livres (fichiers `.js` des livres, sans ressaisie), contrôles (versets = Tanzil, schémas, charte des personnages), **projections élève** (jamais le guide, les corrigés d'épreuve ni la translittération), masquage des numéros de hadiths non vérifiés | `src/importer.ts`, `src/projection.ts`, `src/hadith.ts`, `src/checks.ts` |
| `packages/grading` | correction des exercices (partagée appareil + serveur) | `src/` |
| `packages/hifz` | moteur de révision (trois pistes, roue 30/45/60 j, règle d'arrêt), rythmes 3-7 ans, simulateur, barème /20 | `src/engine.ts`, `src/plan.ts`, `src/load.ts` |
| `packages/db` | schéma, migrations, import d'édition, requêtes | `src/schema.ts`, `migrations/` |
| `packages/tutor` | tuteur IA : politique, classifieur local, banque d'explications validées, fournisseurs (simulé, hostile, Claude), filtre de sortie, mise en service contrôlée, batterie adverse | `src/orchestrator.ts`, `src/filter.ts`, `src/classify.ts`, `src/gate.ts`, `src/evals/` |
| `packages/billing` | formules, prix par zone, droits d'accès, `PaymentProvider` (simulé, Stripe, PayPal, mobile money, magasins) | `src/plans.ts`, `src/rights.ts`, `src/providers/` |
| `apps/api` | routes REST v1, authentification, profils, consentements, hifẓ, tuteur, paiements, administration | `src/app.ts`, `src/auth/`, `src/tutor.ts`, `src/billing.ts`, `src/admin.ts`, `src/today.ts` |
| `apps/web` | PWA, i18n (fr complet, en préparé), thème par jetons | `src/routes/`, `src/lib/`, `src/service-worker.ts`, `svelte.config.js` (CSP) |
| `infra/prod` | Docker Compose, Caddyfile, `deploy.sh` idempotent, `backup.sh` / `restore-test.sh`, `status.sh`, `EXPLOITATION.md` | |

## 4. Choix et raisons (résumé)

| Choix | Raison | Alternative écartée |
|---|---|---|
| TypeScript de bout en bout, un seul dépôt | un seul développeur ; même correction et même moteur de hifẓ sur l'appareil et le serveur | services séparés |
| PWA hors ligne d'abord (IndexedDB, file d'envoi idempotente UUIDv7) | coupures réseau et électricité, micro-forfaits | application native d'abord |
| Contenu importé tel quel des fichiers des livres, identifiants explicites figés | aucune ressaisie ; un QR imprimé ne doit jamais casser | CMS éditorial |
| Tanzil comme seule source du Coran, contrôle octet par octet, **aucune normalisation Unicode** (interdite par la CI) | éviter toute altération silencieuse | normaliser pour comparer |
| Sessions par cookie HttpOnly (haché en base) + en-tête `x-awform: 1` obligatoire sur toute requête qui modifie (CSRF) + SameSite=Lax | pas de jeton dans le stockage du navigateur | JWT |
| Argon2id (m = 19 MiB, t = 2, p = 1) ; TOTP obligatoire pour enseignants et administrateurs, secret chiffré (AES-256-GCM, clé serveur) | recommandations OWASP | — |
| Profils d'enfants sans e-mail, consentements séparés, datés, versionnés, retirables | RGPD, loi sénégalaise 2008-12, COPPA | — |
| Tuteur IA : **local d'abord**, classifieur avant le modèle, filtre après, **désactivé par défaut**, activation seulement après batterie réussie avec le vrai modèle | le modèle n'est jamais la seule barrière | IA générative libre |
| Paiement par pages hébergées des prestataires, webhooks signés et idempotents, droits indépendants du moyen de paiement | PCI DSS SAQ A, plusieurs prestataires (mobile money) | formulaire de carte |
| Déploiement Docker Compose sur un seul serveur, sauvegarde chiffrée nocturne, restauration testée | taille du projet au lancement | Kubernetes |

Documents de référence (hors dépôt, fournis sur demande) : `ARCHITECTURE_V2.md` (décisions, § 1 tuteurs, § 6 données, § 8 ter paiements), `JOURNAL_DEV.md` (historique lot par lot, anomalies), `CAHIER_DES_CHARGES.md`.

## 5. Risques connus (que nous vous demandons de confirmer ou d'infirmer)

1. ~~Caddy reçoit tout `prod.env`~~ — **corrigé le 29/09** : Caddy ne reçoit que `caddy.env` (adresses du site, aucun secret) et la base que `db.env` (son mot de passe) ; vérifié par `docker inspect`. **Complété au lot 13** : `prod.env` n'est plus monté dans AUCUN conteneur ; `env-split.sh` le découpe selon `infra/prod/env-scopes.conf` en `api.env` (base, clé de session, tuteur, paiements), `worker.env` et `outils.env` (la base seulement), `db.env`, `caddy.env` ; `web` ne reçoit rien. Vérifié par un test en CI (`apps/api/test/env-scopes.test.ts` : variables lues par le code ⊂ périmètre, aucun secret hors besoin, `compose.yml` conforme, fichiers produits en 600) et, sur la machine, par `env-check.sh` (noms des variables de chaque conteneur ; appelé par `deploy.sh` et `status.sh`). **Lot 14** : comptes PostgreSQL séparés — `awform_api` (contenu en lecture seule, journaux en ajout seul, aucune DDL), `awform_worker` (purges et file pg-boss seulement), propriétaire réservé aux outils ; droits table par table (`packages/db/src/roles.ts`), testés (`apps/api/test/roles.test.ts`, aussi en CI) et **toute la suite e2e tourne sous le compte api**.
2. ~~Clé de sauvegarde sur la même machine~~ — **corrigé le 29/09** : chiffrement à **clé publique** ; le serveur ne garde que la clé publique ; clé privée (et ancienne clé symétrique) sur le PC du client, dossier à accès restreint ; test de restauration réussi depuis le PC (clé importée en mémoire, effacée). Reste : deuxième copie hors ligne et coffre de secrets.
3. **Données hors ligne non chiffrées sur l'appareil** (IndexedDB : leçons, réponses en attente, enregistrements vocaux 7 jours) ; appareils partagés (mode école).
4. **CSP** : `style-src 'unsafe-inline'` (styles des composants Svelte).
5. **Classifieur du tuteur à base d'expressions régulières** (fr/en/ar) : faux positifs et faux négatifs possibles ; la batterie n'a été passée qu'avec un **fournisseur simulé** (le modèle réel n'a jamais été appelé).
6. **Détecteur de Coran par trigrammes « nus »** : risque de faux positifs (bloque une réponse légitime) et de contournement (variantes orthographiques, arabe translittéré hors lexique).
7. **Registre religieux** : statuts « VERIFIE » des hadiths établis par contrôle d'agent contre un miroir, **pas encore par un référent humain** ; règles de fiqh en majorité « à vérifier » (non citées par le tuteur).
8. **Paiements** : seule la vérification de signature Stripe est testée ; création de session Stripe, PayPal, mobile money et magasins = squelettes ; droits d'accès **non appliqués** au contenu (`AWFORM_DROITS=off`) ; secret du prestataire simulé tiré au hasard par processus.
9. **Limitation de débit** : throttling de connexion et du code parent, limite d'inscriptions par heure ; **pas de limitation générale** de l'API (le tuteur est plafonné en coût par profil, pas en nombre d'appels).
10. **Webhooks de paiement exemptés du contrôle CSRF** (signature vérifiée à la place) — à vérifier.
11. **Incident passé** : `pnpm-lock.yaml` incomplet versionné entre les lots 5 et 7 puis au lot 9 (corrigé ; crochet pre-commit bloquant ajouté le 29/09) ; la CI a pu être rouge pendant ces périodes.
12. **Performance** : démarrage mesuré sur profil **émulé** (CPU ×4, 3G : premier lancement 2,0 s, relance 0,5 s), pas encore sur un vrai Tecno/Itel.
13. **Interface anglaise** non relue ; accessibilité : contraste AA contrôlé par test, **pas d'audit complet** (lecteur d'écran, clavier) ; un écart de contraste connu (or des lettres étudiées).
14. ~~Jalons ḥizb~~ — **corrigé** : métadonnées officielles Tanzil importées (empreinte SHA-256 épinglée, invariants 30 / 240 / 604 contrôlés), jalons ḥizb et quarts, **pages réelles du Muṣḥaf de Médine** pour le hifẓ.
15. **Affichage des tanwins** (29/09) : transformation d'AFFICHAGE vers U+08F0-08F2 (`tanwinDisplay`) ; le texte stocké et comparé reste Tanzil ; l'inverse (`tanwinUndo`) est exact sur les 6 236 versets — vérifier qu'aucun chemin ne compare ou n'enregistre le texte transformé.
16. **Texte et métadonnées Tanzil versionnés dans `infra/ci/contenu/`** pour la CI (CC BY 3.0, copies verbatim).
20. **Nouveautés du lot 16** : (a) **livres gelés** importés (en1-3, ad1-4, ado1-2, re1-2, ra1-3 ; plus aucun « aperçu ») ; (b) **récitations envoyées à l'enseignant** (`apps/api/src/recitations.ts`, `packages/db/src/recitations.ts`) : accord « envoi_recitation » (code parent pour un enfant, à chaque envoi), AES-256-GCM avec clé hors base (`AWFORM_RECITATION_KEY`, API seulement), conservation réglée par la classe (1 à 30 jours, 14 par défaut) puis effacement par le travailleur, suppression par la famille, retrait de l'accord = effacement ; lecture réservée à l'enseignant de la classe tant que l'élève y est inscrit ; note sur la grille /20 commune ; aucun autre chemin ne lit l'audio (ni tuteur, ni export) — à vérifier ; (c) **notifications web push** : tout désactivé par défaut, heures calmes ≥ 8 h, une par jour au plus, enfants seulement avec le code parent, textes neutres sans nom ; clé VAPID privée dans le seul périmètre du travailleur ; (d) **Android** : emballage Capacitor de la PWA, APK de débogage reproductible (script + job CI) ; la licence du SDK Android n'a PAS été acceptée par l'équipe (à faire par le fondateur) ; (e) **correctif de sécurité trouvé pendant le lot** : un refus renvoyé par une fonction de contrôle attendue (`await guard(...)`) ne stoppait pas le traitement (réponse Fastify « thenable ») — dans `today.ts` (lot 11), un compte pouvait modifier le réglage de régularité d'un profil ado/adulte d'un autre compte en recevant pourtant 404. Corrigé partout (`if (reply.sent) return`), test de régression ; vérifier qu'aucun autre chemin n'emploie ce motif.
19. **Nouveautés du lot 15** : (a) **interface anglaise** complète (1 110 messages, pages légales et aide comprises), marquée « à relire par un locuteur natif » et **masquée par le serveur** tant que `AWFORM_LANGUES_PREPARATION` n'est pas à `on` (démonstration seulement ; absent en production) — vérifier que rien ne l'affiche en production (`/api/v1/config`, `routes/+layout.ts`) ; mécanisme prévu pour traduire plus tard les consignes des livres (`consigne_<langue>`, repli sur le français signalé par `lang`) ; (b) **FSRS-5** remplace Leitner pour les cartes de mots (sur l'appareil ; paramètres publiés ; migration des états Leitner sans changer les échéances ; tests) ; (c) activité **« construire un mot à partir de sa racine »** : 4 éléments EXTRAITS du livre gelé Adultes N2 (leçon 12), vérifiés mot pour mot à l'import (sinon écartés), racines de contexte coranique exclues ; (d) activité **« j'enseigne une lettre à mon parent »** : aucune donnée enregistrée ni envoyée (vérifié en e2e).
18. **Préparation de la mise en production (lot 14)** : pages légales en **brouillon** (mentions, CGU, confidentialité RGPD / COPPA / loi sénégalaise 2008-12, cookies) à faire valider par un juriste ; **aucune bannière de consentement** car un seul cookie strictement nécessaire (`awform_session`) et aucun traceur ni ressource tierce (vérifié en e2e) — à confirmer par le juriste ; page d'erreur de l'application ; page « service indisponible » servie par Caddy (503). Registre des certificats : numéro, nom, niveau, date et mention durables, document réduit 30 jours après le départ de l'élève (décision du pilote, **à confirmer par le juriste**).
17. **Espace école (lot 13) — données de mineurs saisies par l'école** : élèves « papier » (prénom + initiale recommandés, aucune date de naissance), notes des bilans, récitations, devoirs, registre des certificats. Accès : l'enseignant PROPRIÉTAIRE de la classe seulement (second facteur), jamais un autre enseignant ni un administrateur (test `apps/api/test/lot13.test.ts` sur toutes les routes) ; exports CSV et certificats journalisés (`audit_log`). Le certificat garde un **document figé** (nom complet saisi à la délivrance) même si l'élève est retiré de la classe (registre de l'établissement) : durée de conservation à fixer par le client. Le texte de l'attestation de hifẓ est un modèle de l'application, **à valider** (version arabe à rédiger par le comité, jamais improvisée).

## 6. Résultats des tests (29/09/2026, machine de développement)

| Suite | Résultat | Où |
|---|---|---|
| Tests unitaires et d'intégration (Vitest, 8 paquets, dont API sur base PostgreSQL de test) | **832 réussis**, 1 sauté | `pnpm test` |
| Correction des exercices en1/ad1 contre les corrigés des guides | 525 cas réussis | `packages/grading` |
| Tests de bout en bout (Playwright, Chromium téléphone + bureau) | **141 réussis** (dont audit d'accessibilité axe-core : 0 violation grave sur 27 écrans), 1 sauté (mesure de performance faite sur le profil téléphone seulement) | `apps/web/e2e` |
| Batterie adverse du tuteur (fournisseur simulé + fournisseur hostile) | **1 081 cas**, 15 critères bloquants « 0 » / « 100 % » tous verts | `packages/tutor/test/battery.test.ts`, CLI `packages/tutor/src/cli/eval.ts` |
| Budget de démarrage (CPU ×4, 3G) | premier lancement 2 014 ms (< 6 s), relance 493 ms (< 3 s) | `apps/web/e2e/perf.spec.ts` |
| Budget de poids | application ≈ 59 Ko de JavaScript ; niveau en1 ≈ 77 Ko | `pnpm --filter @awform/web budget` |
| Contraste WCAG AA des jetons de thème | 18 paires, 1 écart connu documenté | `apps/web/src/lib/theme/tokens.test.ts` |
| Restauration de sauvegarde | restauration dans une base temporaire, 9 tables comparées : ok | `infra/prod/restore-test.sh` |

**CI GitHub** (`.github/workflows/ci.yml`) : installation `--frozen-lockfile`, construction, typage, lint + Prettier, tests unitaires (ceux qui demandent le contenu ou PostgreSQL **se désactivent** en CI), budget de poids, interdiction de `.normalize(` et de fichiers `.env` ; job « images » : syntaxe des scripts et du crochet pre-commit, `docker compose config`, `caddy validate`, construction des images ; **job « base-et-tuteur »** (29/09) : PostgreSQL 18 en service conteneur, `pnpm test` avec le texte et les métadonnées Tanzil de `infra/ci/contenu` (tests sur base, batterie adverse avec fournisseur simulé, rapport en artefact). **Non exécutés en CI** : e2e et tests qui demandent les livres (contenu privé). Crochet pre-commit versionné : lockfile gelé et format obligatoires.

## 7. Questions précises à vérifier (30)

### Sécurité applicative
1. Toute route qui modifie exige-t-elle bien l'en-tête `x-awform: 1` (CSRF), sauf les webhooks de paiement — et cette exception (`app.ts`, crochet `onRequest`) est-elle sûre ?
2. Contrôle d'accès : toute route qui prend un `profileId` vérifie-t-elle `ownsProfile` (ou la classe de l'enseignant) ? Cherchez un IDOR (`today.ts`, `tutor.ts`, `billing.ts`, `hifz.ts`, `/attempts`, `/dashboard`).
3. Sessions : jeton haché, expiration (30 j famille, 12 h enseignant/admin), révocation à la déconnexion et au changement de mot de passe, attribut `Secure` en production (`COOKIE_SECURE=auto`) — correct ?
4. TOTP : anti-rejeu du pas de temps (`totpLastCounter`), fenêtre ±1, secret chiffré ; le second facteur est-il exigé **sur chaque route** enseignant et admin ?
5. Limitation des essais (connexion, code parent, achat avec code parent) : contournable (par compte, par IP, en parallèle) ?
6. Validation des entrées : schémas Fastify stricts (`additionalProperties: false`) partout ? Injection SQL impossible (requêtes Drizzle paramétrées ; `sql` brut dans `purge`, `dashboard`, `admin`) ?
7. CSP et en-têtes (SvelteKit + Caddy) : suffisants ? Risque XSS via le contenu des livres ou les réponses du tuteur (rendu Svelte échappé ; SVG des illustrations filtrés par liste blanche : `packages/content/src/illus.ts`) ?
8. Service worker : risque d'empoisonnement du cache ou de servir une version périmée après une faille corrigée ?
9. Secrets : aucun secret dans le dépôt (vérifier l'historique git) ; `prod.env` 600 ; découpage des secrets par conteneur (risque 1) suffisant ?
10. Chaîne d'approvisionnement : dépendances épinglées par le lockfile, crochet pre-commit (`infra/git-hooks/pre-commit`) et CI `--frozen-lockfile` ; dépendances à risque ?

### Données des mineurs
11. Minimisation : un profil d'enfant ne contient-il vraiment que pseudonyme, année de naissance, avatar sans visage, niveau ? Aucune donnée personnelle dans les journaux (Fastify masque `cookie` et `authorization`) ?
12. Consentements : séparés, datés, versionnés, retirables ; un mineur ne peut pas ouvrir seul un compte adulte ; le retrait d'un consentement (`partage_enseignant`, `tuteur_ia`) coupe-t-il immédiatement l'accès correspondant ?
13. Export et suppression (RGPD) : complets (y compris `tutor_log`, `tutor_question`, `subscription`, `profile_rhythm`) ? Purge à 30 jours effective (worker) ?
14. L'enseignant ne voit que les élèves inscrits par le parent avec code de classe et consentement (et ses propres élèves « papier ») ; l'administrateur ne voit que des e-mails masqués et n'a AUCUN accès à l'espace école (`apps/api/src/school.ts`, `needSchoolTeacher`) : correct ? Les exports CSV (`/ecole/classes/:id/export.csv`) sont-ils protégés contre l'injection de formules et ne sortent-ils que ce qui est nécessaire ?
15. Enregistrements vocaux : réellement jamais envoyés au serveur (aucune route ne les reçoit) et effacés à 7 jours sur l'appareil ?
16. Réglages protecteurs par défaut (`/api/v1/profiles/:id/protections`) : les valeurs affichées correspondent-elles au comportement réel du code ?

### Garde-fous IA
17. Le tuteur est-il **inaccessible** quand `AWFORM_TUTEUR` est absent, et **impossible à activer** avec Claude sans clé ni rapport de batterie réussi portant la même empreinte de rôles et les mêmes modèles (`gate.ts`) ?
18. Peut-on faire passer du texte coranique, un hadith hors registre, un numéro inventé ou un avis religieux à travers `filterDraft` (`filter.ts`) ? Essayez des variantes (autre script arabe, translittération, espaces insécables, balisage).
19. Le texte libre d'un enfant (< 13 ans) peut-il atteindre le modèle par une autre voie (bouton, paramètre `word`, réponse d'exercice) ?
20. Injection d'instructions : le message utilisateur (`providers/types.ts`, `userMessage`) sépare-t-il correctement données et consignes ? Le contexte peut-il contenir du contenu non validé ?
21. Protection : la détresse et les demandes de rencontre déclenchent-elles toujours le protocole et une alerte en base (`tutor_alert`) ? Qui la lit (procédure humaine à écrire) ?
22. Plafond de coût par profil et par mois : contournable (profils multiples, appels parallèles) ?

### Paiements
23. Webhooks : vérification de signature Stripe (`StripeProvider.verify`, tolérance 300 s) et simulé (HMAC) correctes, comparaison en temps constant, **idempotence** par `billing_event` (clé primaire prestataire + identifiant) robuste en concurrence ?
24. Un utilisateur peut-il obtenir un abonnement sans paiement (rejouer un événement, forger un `checkoutId`, appeler `/billing/simulate` quand `AWFORM_PAIEMENT` ≠ `simule`) ?
25. Aucune donnée de carte ne transite-t-elle par nos serveurs ? L'achat exige-t-il bien le code parent quand il existe ?
26. Les droits (`entitlementOf`) : un abonnement annulé garde ses droits jusqu'à la fin de période, un impayé les perd ; la licence d'école ne couvre que les élèves de l'enseignant dans la limite des places — correct ?

### Hors ligne
27. File d'envoi hors ligne : idempotence (UUIDv7 générés sur l'appareil), rejet des événements pour des profils d'un autre compte, rejeu malveillant d'événements anciens ?
28. Données en cache sur un appareil partagé (mode école, déconnexion) : que reste-t-il dans IndexedDB après déconnexion ?

### CI et exploitation
29. La CI couvre-t-elle suffisamment ce qui peut casser en production, sachant que e2e et tests sur base n'y tournent pas ? Que recommandez-vous (contenu synthétique, base éphémère) ?
30. Déploiement et sauvegardes (`deploy.sh`, `backup.sh`, `restore-test.sh`) : idempotence, gestion des secrets, rotation des sauvegardes, garde de la clé, retour arrière d'une migration ?

## 8. Comment lire le dépôt rapidement

- Point d'entrée API : `apps/api/src/app.ts` (enregistrement de tous les modules) ; authentification : `apps/api/src/auth/routes.ts`, `policy.ts`, `crypto.ts`.
- Schéma de données : `packages/db/src/schema.ts` et `packages/db/migrations/`.
- Tuteur : `packages/tutor/src/orchestrator.ts` → `classify.ts` → `filter.ts` ; batterie : `packages/tutor/src/evals/`.
- Paiements : `packages/billing/src/` et `apps/api/src/billing.ts`.
- Hors ligne : `apps/web/src/service-worker.ts`, `apps/web/src/lib/sync-core.ts`, `attempts.ts`, `offline.ts`.
- Exploitation : `infra/prod/EXPLOITATION.md`.

## 9. Ce que nous attendons du rapport

Pour chaque constat : gravité (critique, élevée, moyenne, faible), fichier et ligne, scénario d'exploitation, correction proposée. Les constats « critique » et « élevée » seront corrigés avant toute ouverture publique ; le suivi sera publié dans le journal de développement.
