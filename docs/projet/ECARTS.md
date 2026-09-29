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
| Leçon interactive | 12 types Religion + réponses libres corrigées par l'enseignant | **partiel** | types Religion : `apps/web/src/lib/religion/ReligionExercise.svelte` (lot 8). **Manque** : la correction par l'enseignant des réponses libres (aujourd'hui renvoyées au cahier). | V1-a (correction) |
| Écriture | tracé des mots, dictée sur papier photographiée (option) | **partiel** | tracé des mots `?mot=` (`apps/web/src/routes/ecriture`, lot 6). Photo de dictée : **manquante** (option, données d'image d'enfant → décision). | décision |
| Hifẓ | tous les carnets, validation enseignant /20, récital, certificat de hifẓ | **partiel** | carnets E1-E3/N1-N4 (`packages/hifz`), validation /20 (`apps/api/src/hifz.ts`, `hifz.test.ts` livres), attestation (lot 13, `lot13.test.ts`). Récital (séance publique) : pas d'écran dédié ; certificat **non vérifiable par QR**. | V1-e |
| Révisions | FSRS de tout le vocabulaire et des mots coraniques | **partiel** | FSRS-5 : `apps/web/src/lib/fsrs.ts`, `fsrs.test.ts`. Mots coraniques : absents (aucune liste validée dans les livres). | contenu |
| Bilans et examens | notés, textes « non préparés », barèmes /20 et /100 | **partiel** | projection d'épreuve sans réponse : `packages/content/src/projection.ts` (`examProjection`, testée) mais **jamais servie** par l'API ; notes saisies à la main pour la classe papier (`apps/api/src/school.ts`, lot 13). **Manque** : sessions d'épreuve notées dans l'application, affichage des textes non préparés pour l'enseignant, remédiation. | V1-b |
| Tableaux de bord | enseignant, école, administrateur | **partiel** | enseignant : tableau de suivi (`/api/v1/ecole/classes/:id/tableau`) ; admin : `apps/api/src/admin.ts`. Tableau « école » (plusieurs classes) : manquant. | V1-a |
| Classes et devoirs | classes, devoirs, correction, classe papier | **partiel** | classes, groupes, devoirs, classe papier : `apps/api/src/school.ts`, `lot13.test.ts` (livres). Correction des réponses libres : manquante. | V1-a |
| Cours en ligne | liens de visio externes planifiés | **manquant** | aucune route ni table. | V1-f |
| Messagerie | enseignant ↔ parent, annonces de classe | **manquant** | aucune route ni table. | V1-f |
| Certificats | niveau et hifẓ **vérifiables par QR** | **partiel** | certificats numérotés et registre : `packages/school/src/certificates.ts`, `school.ts` (lot 13). Pas de signature ni de page publique de vérification. | V1-e |
| Papier ↔ application | codes d'activation imprimés dans les livres | **manquant** | aucun code d'activation (`packages/billing` : formules seulement). | V1-g |
| Paiement | abonnement en euros (prestataire) | **fait (mode simulé)** | `packages/billing`, `apps/api/src/billing.ts`, `lot10.test.ts` (7 tests, sans livres). Stripe : code prêt, **compte réel = décision** du client. | — |
| Audio | selon la décision du client | **décision** | architecture prête, boutons masqués ; audio Azure interdit ici. | — |

## B. Cahier des charges § 6.2 — lots V1

| Lot | Contenu | État | Preuve / ce qui manque | Lot prévu |
|---|---|---|---|---|
| V1-a Enseignants et classes | rôles école/enseignant, classes, devoirs, correction, classe papier, projection | **partiel** | fait : classes, devoirs, classe papier, tableau, exports (lot 13). Manque : **correction par l'enseignant** (réponses libres), **mode projection** (leçon affichée en grand au tableau de la classe), tableau « école ». | lot 18 |
| V1-b Épreuves | bilans et examens notés, sessions, textes non préparés, barèmes, remédiation | **partiel** | voir § A. Manque : sessions, correction automatique côté serveur à partir de la projection d'épreuve, barèmes /20 et /100 dans l'application, **remédiation sous 8/20**. | lot 19 |
| V1-c Religion | 12 types, rubriques, renvois, carnet de pratique, suivi des sourates | **partiel** | lecteur et exercices (lot 8). Manque : carnet de pratique **signé par le parent** (aujourd'hui affiché, jamais enregistré), suivi des sourates apprises en religion. | lot 22 |
| V1-d Toutes filières | tous les livres et carnets, lectures graduées | **partiel (contenu)** | code générique ; livrets : `apps/api/src/library.ts` (lot 8). Reste = livres à geler. | — |
| V1-e FSRS, certificats | vocabulaire et mots coraniques ; certificats signés et vérifiables | **partiel** | FSRS fait (lot 15) ; certificats non signés, non vérifiables. | lot 20 |
| V1-f Messagerie encadrée, visio | messages, annonces, liens de visio | **manquant** | — | lot 21 |
| V1-g Paiement €, codes d'activation, Google Play (TWA) | | **partiel** | paiement simulé (lot 10), APK de débogage Capacitor (lot 16, `apps/android`). Manque : codes d'activation. Publication Play : **interdite ici** (compte du client). | lot 23 |
| V1-h Stabilisation | audit Codex, RGAA, charge | **partiel** | axe-core dans les e2e (lot 14, 0 violation grave) ; performance 3G mesurée (`e2e/perf.spec.ts`). Manque : grille RGAA manuelle, **test de charge** (k6, p95 < 500 ms), budget de poids tenu (dépassé : 204 Ko pour 150, voir JOURNAL lot 17). | lot 24 |

## C. Hors V1 demandé par le client

| Sujet | État | Lot prévu |
|---|---|---|
| Interface en espagnol, allemand, arabe (RTL), « à relire par un locuteur natif » | **manquant** (FR relu, EN préparé) | lot 25 |
| Relais d'école (R1) | **fait** (lot 17) | — |
