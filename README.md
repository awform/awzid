# AWFORM — application (monorepo)

Application web progressive pour enseigner l'arabe, le Coran, les sciences islamiques et l'écriture,
construite **sur le curriculum des livres AWFORM** (mêmes leçons, mêmes exercices, mêmes corrigés).
Cahier des charges : `W\application\CAHIER_DES_CHARGES.md` ; journal : `W\application\JOURNAL_DEV.md`.

## Structure

| Dossier | Rôle |
|---|---|
| `apps/web` | PWA SvelteKit (Svelte 5) : liste des leçons, lecteur de leçon (arabe RTL, Amiri Quran pour le Coran, Noto Naskh Arabic, Nunito), service worker |
| `apps/api` | API REST Fastify (`/api/v1/health`, `/levels`, `/levels/:code/units`, `/units/:id`) |
| `packages/content` | modèle typé du contenu, lecture des fichiers des livres (JSON strict + bac à sable), contrôle Coran octet par octet, identifiants d'exercices, projection élève |
| `packages/grading` | correction **partagée** appareil / serveur des 8 types « langue » (portage fidèle d'`awform.js`) |
| `packages/db` | schéma PostgreSQL (Drizzle), migrations SQL versionnées, import d'éditions |
| `infra` | `provision.sh` (socle de la VM, idempotent), `dev-env.sh` (.env local), `sync-content.ps1` (copie du contenu depuis le PC) |

## Démarrer (VM de développement)

```bash
bash infra/provision.sh          # une fois (idempotent) : Node 24, pnpm, PostgreSQL, Docker, ufw…
bash infra/dev-env.sh            # écrit .env (ignoré par git) depuis ~/.config/awform/dev.env
pnpm install
pnpm build
pnpm db:migrate
node packages/db/dist/cli/import.js --edition dev --publish   # importe en1 + ad1 depuis ~/awform-content
pnpm dev:api                     # API sur 127.0.0.1:3000
pnpm dev:web                     # PWA sur 0.0.0.0:5173 (réseau local seulement, ufw)
```

Le contenu (`~/awform-content`) est copié depuis le PC Windows par `infra/sync-content.ps1`
(lecture seule côté PC). Contrôle sans base : `node packages/content/dist/cli.js en1 ad1`.

## Vérifier

```bash
pnpm check        # build + typecheck + lint + tests (unitaires, générés depuis le contenu, intégration PostgreSQL)
pnpm e2e          # bout en bout Playwright (Chromium, mobile et bureau)
```

## Règles non négociables (rappel)

- Texte coranique = Tanzil **octet par octet** ; **aucune** normalisation Unicode (`.normalize(` interdit par ESLint).
- Jamais de translittération (`tr`) ni de champ du guide envoyés à un appareil d'élève (projection élève).
- Aucun secret dans le dépôt (`.env` ignoré) ; la clé Azure du dossier des livres n'est jamais lue.
- Polices servies par l'application (jamais par un service tiers) ; aucune ressource externe (CSP).
