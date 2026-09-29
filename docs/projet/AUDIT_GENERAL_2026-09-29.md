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

*(Constats d'exploitation — déploiement, sauvegardes, Caddy, images — : voir la suite de ce domaine, en cours.)*
