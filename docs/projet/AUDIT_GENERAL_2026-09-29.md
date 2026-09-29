# Audit général indépendant — Awzid (ex-AWFORM) — 29/09/2026

*Auditeur indépendant, en lecture seule. Aucun code de l'application n'a été modifié ; seul ce fichier est poussé,
sur la branche `audit-dossier`. Rapport rédigé et poussé domaine par domaine : **version en cours de rédaction**.*

- Branche auditée : `main` = `d4be704` (lots 0 à 16). Branche en cours examinée : `lot17-wip` = `becf341`.
- Environnement de l'audit : Node 24.21.0, pnpm 10.34.5, PostgreSQL 18 (conteneur `postgres:18`), sans les livres
  (contenu privé) : les tests qui en dépendent sont sautés, ce qui est **normal et n'est pas compté comme défaut**.
- Preuves : chaque constat renvoie à une commande ou à un test temporaire (jamais commité). Un banc de preuve
  (`apps/api/audit/harness.ts`, hors dépôt) monte l'API Fastify réelle sur une base PostgreSQL 18 migrée, sans les
  livres ; les extraits utiles sont recopiés dans chaque preuve pour qu'elle soit rejouable.

> Sections à venir (en cours) : résumé, sécurité applicative, mineurs et RGPD, garde-fous du contenu, hors ligne,
> justesse métier, paiements, qualité, accessibilité et performance, conformité au cahier des charges, soupçons,
> points forts, 10 priorités.

---

## Domaine 8 — Infrastructure, CI, dépendances

### INF-1 — La CI est rouge sur `main` depuis le lot 9 (24 exécutions sur 24) — **BLOQUANT**

- **Fichiers** : `packages/school/test/school.test.ts:254-256`, `.github/workflows/ci.yml:44` et `:108`,
  `apps/android/android/gradlew` (mode 100644).
- **Constat** : le brief (§ 6) et le journal affirment que la CI exécute les tests sur base et la batterie du tuteur.
  En réalité, **la dernière exécution verte est le run 15 (lot 8, `61d26eb`)** ; les runs 16 à 39 (lots 9 à 16) sont tous
  en échec ou annulés. Sur le dernier commit `d4be704` (run 36561681698) : jobs `verifier`, `base-et-tuteur` et
  `android-debug` **en échec**, seul `images` est vert.
- **Causes (3)** :
  1. `school.test.ts:255` lit `certificats.js` **dans le corps** d'un `describe.skipIf(...)` : Vitest exécute ce corps
     pendant la collecte même quand le bloc est sauté → `ENOENT` → le fichier de test entier plante ;
  2. `pnpm test` = `pnpm -r` qui **s'arrête au premier paquet en échec** (`ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL`) :
     `school` passe avant `grading`, `tutor`, `web`, `db` et `api` → **la batterie adverse du tuteur et les tests
     sur base ne tournent jamais en CI** ; l'étape « rapport de la batterie » est `skipped` ;
  3. `android-debug` : `infra/android/build-debug.sh: line 18: ./gradlew: Permission denied` (fichier versionné
     sans le bit exécutable).
- **Preuve** :
  ```
  # API GitHub Actions (awform/awzid, workflow CI) — runs 16 → 39 : conclusion failure/cancelled ; run 15 : success
  # job verifier (109383791728), dernières lignes :
  ##[error]Error: ENOENT: no such file or directory, open '/home/runner/awform-content/data/eval/certificats.js'
   ❯ test/school.test.ts:255:15
   ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @awform/school@0.1.0 test: `vitest run`
  # job android-debug (109383791530) :
  infra/android/build-debug.sh: line 18: ./gradlew: Permission denied   → exit code 126
  # reproduction locale (mêmes variables que le job base-et-tuteur) :
  $ TEST_DATABASE_URL=postgres://…/awform_test AWFORM_CONTENT_DIR=infra/ci/contenu pnpm test
   FAIL  test/school.test.ts … ENOENT … infra/ci/contenu/data/eval/certificats.js   → EXIT 1
  $ git ls-files -s apps/android/android/gradlew
  100644 f5feea6d…  apps/android/android/gradlew
  ```
- **Correction** : lire le fichier dans un `beforeAll` (ou calculer le chemin et `readFileSync` dans chaque `it`) ;
  `git update-index --chmod=+x apps/android/android/gradlew` ; lancer `pnpm -r --no-bail test` en CI pour voir tous
  les échecs ; **protéger `main`** (fusion seulement si la CI est verte) ; afficher un badge d'état dans le README.

### INF-2 — En CI, les tests d'API sur base sont presque tous sautés (57 sur 87), même une fois INF-1 corrigé — **MAJEUR**

- **Fichiers** : `apps/api/test/{api,auth,hifz,lot6,lot8,lot9,lot11,lot12,lot13,lot15,packs}.test.ts` (ligne `READY`),
  `packages/db/test/*.test.ts`.
- **Constat** : `READY = !!URL && existsSync(join(contentDir(), 'data', 'index-lecons.js'))` : les tests d'API
  (authentification, cloisonnement, tuteur, école, paiements) exigent **les livres**, absents de la CI. Le job
  `base-et-tuteur` n'a que le texte Tanzil (`infra/ci/contenu/coran`). Toutes les protections d'accès (IDOR, 2FA,
  consentements) ne sont donc vérifiées **que sur la machine du développeur**, alors que le brief affirme
  « la CI exécute aussi les tests sur base PostgreSQL 18 ».
- **Preuve** (conditions exactes du job `base-et-tuteur`, avec `--no-bail` pour dépasser INF-1) :
  ```
  $ pnpm -r --no-bail --workspace-concurrency=1 test
  billing 13 ✓ | content 44 ✓ 15 sautés | hifz 26 ✓ 5 sautés | school : plante | grading 10 ✓ 1 sauté
  tutor 37 ✓ | web 55 ✓ | db 0 ✓ 10 sautés | api 30 ✓ 57 sautés (7 fichiers sur 16 exécutés)
  → 215 tests exécutés, 88 sautés (le journal annonce 832 tests « automatiques »)
  ```
- **Correction** : un **jeu de contenu synthétique** versionné (2 niveaux, 3 leçons, 1 carnet, sans texte religieux,
  généré) qui satisfait l'importeur ; `READY` ne doit dépendre que de la base ; garder les tests « livres réels » à part.

### INF-3 — Actions GitHub non épinglées par empreinte — **MINEUR**

- **Fichier** : `.github/workflows/ci.yml` (lignes 26, 29, 56, 93, 96, 111, 123, 126, 129, 141).
- **Preuve** : `grep -n "uses:" .github/workflows/ci.yml` → `actions/checkout@v4`, `actions/setup-node@v4`,
  `actions/setup-java@v4`, `actions/upload-artifact@v4` (étiquettes mobiles). Le journal de la CI signale aussi
  « Node.js 20 is deprecated » pour ces actions.
- **Correction** : épingler par SHA de commit (avec commentaire de version), Dependabot pour les actions.

### INF-4 — Dépendances : 2 vulnérabilités connues (outillage) — **MINEUR**

- **Preuve** : `pnpm audit` →
  `moderate esbuild <=0.24.2 (GHSA-67mh-4wv8-2f99) via packages__db>drizzle-kit>@esbuild-kit/…>esbuild` ;
  `low cookie <0.7.0 (GHSA-pxg6-pf52-xh8x) via apps__web>@sveltejs/kit>cookie` — `2 vulnerabilities found`.
  Les deux touchent l'outillage de développement / une dépendance transitive peu exposée (le nom du cookie est fixe) ;
  aucune vulnérabilité dans les dépendances d'exécution de l'API.
- **Correction** : `pnpm.overrides` (`esbuild >=0.25`, `cookie >=0.7`) ou mise à jour de drizzle-kit ; `pnpm audit`
  dans la CI (niveau `high` bloquant).

### INF-5 — Gradle téléchargé sans empreinte — **MINEUR**

- **Fichier** : `apps/android/android/gradle/wrapper/gradle-wrapper.properties`.
- **Preuve** : le fichier contient `distributionUrl=…gradle-8.11.1-all.zip` et `validateDistributionUrl=true`, mais
  **aucune** ligne `distributionSha256Sum` ; `build-debug.sh:18` retombe sur le téléchargement si `--offline` échoue.
- **Correction** : ajouter `distributionSha256Sum=` (valeur publiée par Gradle) ; action `gradle/actions/wrapper-validation`.

### INF-6 — `X-Forwarded-For` falsifiable : limites par adresse IP (inscription, connexion) contournées — **MAJEUR**

- **Fichiers** : `infra/prod/Caddyfile:13` (`trusted_proxies static private_ranges`), `infra/prod/compose.yml:80`
  (`TRUST_PROXY: '1'`), `apps/api/src/app.ts:78` (`trustProxy: true` → Fastify fait confiance à **tous** les sauts et
  prend l'adresse la plus à gauche), `apps/api/src/auth/routes.ts:191` (`signup:${req.ip}`) et `:263` (`login-ip:`).
- **Scénario** : le client passe par la passerelle Docker ou le réseau local (adresses privées, donc « de
  confiance » pour Caddy) : l'en-tête forgé est conservé ; l'API prend cette valeur comme adresse du client. Il suffit
  de changer l'en-tête à chaque requête pour ignorer « 20 inscriptions par heure et par IP » et le verrouillage par IP.
- **Preuve 1** (Caddyfile réel du dépôt dans `caddy:2`, écho en amont) :
  `curl -H 'X-Forwarded-For: 203.0.113.88' http://127.0.0.1:18080/api/v1/x` → en amont
  `xff=203.0.113.88, 172.18.0.1`.
- **Preuve 2** (banc, `TRUST_PROXY=1`, test `audit/infra-xff.test.ts`) : même en-tête → `201 ×20 puis 429 429` ;
  en-tête changé à chaque appel → `201 ×22`, `comptes créés : 42`.
- **Correction** : Caddy en bordure : `trusted_proxies` vide (ou `header_up X-Forwarded-For {remote_host}`) ;
  API : `trustProxy: 1` (un seul saut) ou l'adresse du réseau Docker, jamais `true`.

### INF-7 — `backup.sh` : un `pg_dump` en échec laisse une « sauvegarde » partielle, non journalisée, prise pour bonne — **MAJEUR**

- **Fichier** : `infra/prod/backup.sh:26-31`, `infra/prod/status.sh:26-30`.
- **Constat** : `pg_dump … | gpg … -o "$FILE"` : gpg crée le fichier avant l'échec ; `set -euo pipefail` fait sortir
  avant la ligne de journal ; aucun `trap` ne supprime le fichier ; `status.sh` ne regarde que l'**âge** du dernier
  fichier ; la rotation (`KEEP=14`) compte ces fichiers partiels et peut évincer les bonnes sauvegardes.
- **Preuve** : faux `docker` dans le `PATH` (écrit 50 octets puis `exit 1`), `HOME` temporaire,
  `backup-keygen.sh` puis `backup.sh` → `code backup.sh=1` ; fichier `awform-20260929-134804.dump.gpg` de 183 octets
  **conservé** ; `backup.log` : `(pas de journal)`.
- **Correction** : écrire dans `$FILE.part`, renommer seulement en cas de succès ; `trap` d'échec qui supprime et
  journalise « ÉCHEC » ; `status.sh` lit la dernière ligne `ok` du journal ; alerte si échec.

### INF-8 — Ni copie hors site, ni test de restauration automatique — **MAJEUR**

- **Fichiers** : `infra/prod/backup.sh:8`, `infra/prod/EXPLOITATION.md:73` (« Copie hors site : À BRANCHER »),
  `infra/prod/restore-test.sh:51`, `infra/prod/status.sh:32`.
- **Constat** : les sauvegardes restent sur le **même serveur** que la base (perte du disque = perte de tout) ;
  `restore-test.sh` est manuel (depuis le PC, clé privée) ; `status.sh` affiche la dernière restauration sans alerter
  si elle est ancienne ; `restore-test.sh` n'exige des lignes que dans `quran_verse` (une base vide « réussit »).
- **Preuve** : `grep -n "hors site" infra/prod/EXPLOITATION.md` → `73: … À BRANCHER` ; lecture des lignes citées.
- **Correction** : copie chiffrée hors site (stockage objet) ; restauration automatique mensuelle sur machine
  jetable avec seuils minimaux par table ; alerte si > 35 jours.

### INF-9 — Un déploiement `--demo` laisse le paiement SIMULÉ et le tuteur simulé actifs pour toujours — **MAJEUR**

- **Fichier** : `infra/prod/deploy.sh:76-78` (et `:52`).
- **Constat** : `AWFORM_PAIEMENT=simule`, `AWFORM_TUTEUR=simule`, `AWFORM_LANGUES_PREPARATION=on` sont **ajoutés** à
  `prod.env` avec `--demo` et **jamais retirés** par un déploiement ultérieur sans `--demo`. En mode simulé, tout
  utilisateur s'accorde un abonnement par `POST /api/v1/billing/simulate/:id` (voir PAY-1).
- **Preuve** : `grep -n "AWFORM_PAIEMENT" infra/prod/deploy.sh` → une seule occurrence, ligne 78 :
  `if [ "$DEMO" = 1 ] && ! grep -q '^AWFORM_PAIEMENT=' "$ENVF"; then echo "AWFORM_PAIEMENT=simule" >> "$ENVF"; fi`.
- **Correction** : sans `--demo`, supprimer ces clés ou **refuser** de déployer si elles sont présentes.

### INF-10 — Migrations sans retour arrière, appliquées avant la bascule — **MINEUR**

- **Fichier** : `infra/prod/deploy.sh:93` (migration) puis `:106` (bascule), `:109` (`exit 1` si la santé échoue).
- **Constat** : aucune migration descendante (`ls packages/db/migrations`), pas de retour automatique à l'image
  précédente, pas de sauvegarde juste avant migration.
- **Correction** : sauvegarde avant migration ; règle « expand / contract » écrite ; retour à l'image précédente
  si la santé échoue.

### INF-11 — Images Docker non épinglées par empreinte ; scripts : avertissements shellcheck — **MINEUR**

- **Preuve** : `infra/prod/Dockerfile:6,21` (`node:24-bookworm-slim`), `compose.yml:14,102` (`postgres:18`,
  `caddy:2`) ; `shellcheck 0.9.0` sur les 13 scripts : **aucune erreur**, avertissements SC2155
  (`android/build-debug.sh:17`, `deploy.sh:83`), SC2094 (`deploy.sh:59-61`), SC2015 (`env-check.sh:28`,
  `status.sh:42`), SC2012 (`backup.sh:30`, `restore-test.sh:17`, `status.sh:26`). `bash -n` : tous corrects.
  Divers : `EXPLOITATION.md:24` décrit encore l'ancienne `backup.key` symétrique.
- **Correction** : `image@sha256:…` + Dependabot ; traiter les avertissements.

**Soupçon (non prouvé ici)** : `deploy.sh:164-165` restreint 80/443 au réseau local par **ufw**, mais les ports
publiés par Docker (`compose.yml:105-106`, `'80:80'` sur 0.0.0.0) passent **avant** ufw (chaîne DOCKER) ; sur une
machine dotée d'une interface publique, le site serait exposé. À vérifier sur la machine ; corriger par
`127.0.0.1:`/IP LAN dans `ports:` ou des règles `DOCKER-USER`.
