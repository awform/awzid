# Écarts V1 — état réel du code par rapport au cahier des charges

Établi le 29/09/2026 (session cloud, branche `lot17-wip`, après le lot 17) à partir du code et des tests, pas du
journal seul. Mis à jour à la fin de chaque lot suivant (colonne « Lot prévu »).

Légende : **fait** (code + test) · **partiel** (une partie manque, dite) · **manquant** · **décision** (attend le
client, voir `DECISIONS_EN_ATTENTE.md`). Les tests marqués « livres » sont sautés sans `~/awform-content`.

## A. Cahier des charges § 2.1 — colonne V1

| Domaine | Attendu V1 | État | Preuve / ce qui manque | Lot prévu |
|---|---|---|---|---|
| Comptes | ado rattaché, enseignant, école, rôles, 2FA admin obligatoire | **partiel** | profils ado, enseignant et admin, TOTP obligatoire : `apps/api/src/auth/policy.ts` (`requiresMfa`), `apps/api/test/auth.test.ts` (livres), `admin.test.ts`. Pas de rôle « école » (direction) distinct de l'enseignant. | V1-a |
| Parcours | en1-en5, ado1-ado4, ad1-ad10, re1-re5 | **partiel** (contenu) | l'import prend tout livre gelé (`packages/db/src/cli/import.ts`) ; gelés à ce jour : en1-en3, ad1-ad4, ado1-ado2, re1-re2 (JOURNAL lot 16). Les autres livres ne sont pas écrits/gelés : dépend du contenu, pas du code. | — |
| Leçon interactive | 12 types Religion + réponses libres corrigées par l'enseignant | **fait** (lot 18) | types Religion : `apps/web/src/lib/religion/ReligionExercise.svelte` (lot 8) ; réponses libres (« question », « ouverte ») envoyées à l'enseignant et corrigées : `apps/api/src/corrections.ts`, `apps/api/test/lot18.test.ts` (6 tests). | — |
| Écriture | tracé des mots, dictée sur papier photographiée (option) | **partiel** | tracé des mots `?mot=` (`apps/web/src/routes/ecriture`, lot 6). Photo de dictée : **écartée** par le chef de projet (D5). | — |
| Hifẓ | tous les carnets, validation enseignant /20, récital, certificat de hifẓ | **partiel** | carnets E1-E3/N1-N4 (`packages/hifz`), validation /20 (`apps/api/src/hifz.ts`, `hifz.test.ts` livres), attestation (lot 13, `lot13.test.ts`). Récital (séance publique) : pas d'écran dédié ; attestation vérifiable par QR (lot 20). | V1-e |
| Révisions | FSRS de tout le vocabulaire et des mots coraniques | **partiel** | FSRS-5 : `apps/web/src/lib/fsrs.ts`, `fsrs.test.ts`. Mots coraniques : absents (aucune liste validée dans les livres). | contenu |
| Bilans et examens | notés, textes « non préparés », barèmes /20 et /100 | **fait** (lot 19) | sessions d'épreuve de l'enseignant, projection d'épreuve sans réponse, copie unique corrigée par le serveur (`packages/grading/src/exam.ts`, `apps/api/src/epreuves.ts`), textes non préparés et mots d'écoute pour l'enseignant seul, /20 bilan, /100 examen, remédiation < 8/20, tableau de suivi : `lot19.test.ts` (7), `exam.test.ts` (5). Réserve : D7. | — |
| Tableaux de bord | enseignant, école, administrateur | **partiel** | enseignant : tableau de suivi (`/api/v1/ecole/classes/:id/tableau`) ; admin : `apps/api/src/admin.ts`. Tableau « école » (plusieurs classes) : manquant. | V1-a |
| Classes et devoirs | classes, devoirs, correction, classe papier | **fait** | classes, groupes, devoirs, classe papier : `apps/api/src/school.ts` (lot 13) ; correction : lot 18 (`corrections.ts`, onglet « Corrections »). | — |
| Cours en ligne | liens de visio externes planifiés | **partiel** (lot 21) | tables `video_session`, `video_presence` (migration 0018) ; routes et écrans : **non faits** (arrêt des fonctionnalités pour les corrections d'audit). | après l'audit |
| Messagerie | messages enseignant ↔ parent et annonces de classe | **partiel** (lot 21) | schéma seulement : `message_thread`, `message` (corps chiffré), `message_read`, `message_report` (migration 0018) ; routes, chiffrement, modération et écrans : **non faits**. | après l'audit |
| Certificats | niveau et hifẓ **vérifiables par QR** | **fait** (lot 20) | registre (lot 13) + signature Ed25519 des champs du registre, code aléatoire, QR imprimé, page publique `/verifier/[numero]`, annulation : `apps/api/src/certsign.ts`, `verification.ts`, `lot20.test.ts` (6). Réserve : D8. | — |
| Papier ↔ application | codes d'activation imprimés dans les livres | **manquant** | aucun code d'activation (`packages/billing` : formules seulement). | V1-g |
| Paiement | abonnement en euros (prestataire) | **fait (mode simulé)** | `packages/billing`, `apps/api/src/billing.ts`, `lot10.test.ts` (7 tests, sans livres). Stripe : code prêt, **compte réel = décision** du client. | — |
| Audio | selon la décision du client | **décision** | architecture prête, boutons masqués ; audio Azure interdit ici. | — |

## B. Cahier des charges § 6.2 — lots V1

| Lot | Contenu | État | Preuve / ce qui manque | Lot prévu |
|---|---|---|---|---|
| V1-a Enseignants et classes | rôles école/enseignant, classes, devoirs, correction, classe papier, projection | **fait, sauf rôle « école »** | lot 13 + lot 18 : correction des réponses libres (`apps/api/src/corrections.ts`, `lot18.test.ts`), **mode projection** (`apps/web/src/routes/enseignant/projection/[unit]`). Reste : compte « direction d'école » voyant plusieurs classes. | plus tard |
| V1-b Épreuves | bilans et examens notés, sessions, textes non préparés, barèmes, remédiation | **fait** (lot 19) | voir § A ; décisions D6 (barème par exercice) et D7 (corrigés en entraînement). | — |
| V1-c Religion | 12 types, rubriques, renvois, carnet de pratique, suivi des sourates | **partiel** | lecteur et exercices (lot 8). Manque : carnet de pratique **signé par le parent** (aujourd'hui affiché, jamais enregistré), suivi des sourates apprises en religion. | lot 22 |
| V1-d Toutes filières | tous les livres et carnets, lectures graduées | **partiel (contenu)** | code générique ; livrets : `apps/api/src/library.ts` (lot 8). Reste = livres à geler. | — |
| V1-e FSRS, certificats | vocabulaire et mots coraniques ; certificats signés et vérifiables | **fait, sauf mots coraniques** | FSRS (lot 15) ; certificats signés et vérifiables (lot 20). Mots coraniques : aucune liste validée dans les livres (contenu). | contenu |
| V1-f Messagerie encadrée, visio (liens) | | **partiel** (lot 21) | schéma de la messagerie et de la visio (migration 0018, droits `roles.ts`) ; routes, écrans et tests fonctionnels à faire après les corrections d'audit. | après l'audit |
| V1-g Paiement €, codes d'activation, Google Play (TWA) | | **partiel** | paiement simulé (lot 10), APK de débogage Capacitor (lot 16, `apps/android`). Manque : codes d'activation. Publication Play : **interdite ici** (compte du client). | lot 23 |
| V1-h Stabilisation | audit Codex, RGAA, charge | **partiel** | axe-core dans les e2e (lot 14, 0 violation grave) ; performance 3G mesurée (`e2e/perf.spec.ts`). Manque : grille RGAA manuelle, **test de charge** (k6, p95 < 500 ms), budget de poids tenu (dépassé : 204 Ko pour 150, voir JOURNAL lot 17). | lot 24 |

## C. Hors V1 demandé par le client

| Sujet | État | Lot prévu |
|---|---|---|
| Interface en espagnol, allemand, arabe (RTL), « à relire par un locuteur natif » | **manquant** (FR relu, EN préparé) | lot 25 |
| Relais d'école (R1) | **fait** (lot 17) | — |
