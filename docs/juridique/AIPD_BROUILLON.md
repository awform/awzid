# Analyse d'impact relative à la protection des données (AIPD)

> **BROUILLON — à valider par un juriste** (et, pour la méthode, par le DPO s'il est désigné). Rédigé le
> 30/09/2026 d'après le code de la branche `suite-v1-b` ; chaque mesure renvoie au fichier qui la met en œuvre
> ou au test qui la prouve. Méthode suivie : celle de la CNIL (contexte, principes, risques).

## 1. Pourquoi une AIPD

Plusieurs critères de la liste des lignes directrices européennes (WP248) sont réunis : **personnes
vulnérables** (enfants, dès 5 ans), **données sensibles probables** (l'usage du hifẓ et des sciences
islamiques peut révéler une conviction religieuse — voir D18), **usage innovant** (tuteur d'intelligence
artificielle, même simulé aujourd'hui), **voix** d'enfants, **grande échelle** visée (école pilote puis monde).
L'AIPD est donc **obligatoire** avant l'ouverture publique.

## 2. Contexte

Application web et Android (PWA) d'apprentissage de l'arabe, du Coran (hifẓ, lecture de Ḥafṣ), des sciences
islamiques et de l'écriture ; comptes parent, adulte, enseignant, administrateur ; enfants **sans e-mail**, créés
par le parent ; espace école ; relais d'école hors Internet ; hébergement dans l'Union européenne. Traitements :
`docs/juridique/REGISTRE_TRAITEMENTS.md`.

## 3. Principes — état

| Principe | Mise en œuvre | Preuve |
|---|---|---|
| Minimisation | enfant : pseudonyme et **année** de naissance seulement, aucune photo ni nom réel ; élève papier : prénom + initiale ; nom complet seulement pour un certificat | `packages/db/src/schema.ts` (profile, class_pupil) ; `apps/api/src/auth/policy.ts` (`ageFromYear`) |
| Consentement du parent, prouvé | accords datés, versionnés (`TEXT_VERSION`), avec méthode, pays, loi ; code parent exigé pour un accord donné pour un mineur (audit SEC-3) | `apps/api/src/auth/profils.ts`, `apps/api/src/guards.ts` (`parentGate`) ; tests `apps/api/test/auth.test.ts`, `audit-mineurs.test.ts`, `audit-sec.test.ts` |
| Limitation des durées | purges nocturnes (compte 30 jours, journal 12 mois, tuteur 12/24 mois, messages D11, voix 1 à 30 jours) | `packages/db/src/purge.ts`, `apps/worker/src/tasks.ts` ; tests `apps/worker/test/tasks.test.ts`, `apps/api/test/roles.test.ts` |
| Droits des personnes | export complet (JSON) et suppression depuis « Mon compte » ; retrait des accords facultatifs | `apps/api/src/auth/donnees.ts` ; e2e `comptes.spec.ts` (« export puis suppression ») |
| Aucune publicité ni traceur | un seul cookie de session ; aucune ressource tierce (CSP) | `apps/web/svelte.config.js`, test `csp.test.ts`, e2e `lot14.spec.ts` (« aucun traceur »), `securite.spec.ts` |
| Transparence | pages légales (brouillons) ; tuteur qui dit être un programme | `apps/web/src/lib/legal/content.ts` ; `docs/juridique/CONFIDENTIALITE_*.md` |

## 4. Risques et mesures

Échelle : vraisemblance et gravité **1** (négligeable) à **4** (maximale), évaluées **après** les mesures en place.

| Risque | Source | Mesures déjà en place (preuves) | Vraisemblance | Gravité | Reste à faire |
|---|---|---|---|---|---|
| **Accès illégitime aux données d'un enfant** (autre famille, autre enseignant) | erreur de droits, vol de session | contrôle de propriété à chaque route (`ownsProfile`, `teacherClass`) ; cookie HttpOnly, SameSite, Secure en HTTPS ; en-tête anti-CSRF `x-awform` ; second facteur des enseignants (`apps/api/src/auth/routes.ts`, audit SEC-4) ; tests d'isolement (`lot21.test.ts`, `recital.test.ts`, `ecole-synthese.test.ts`) | 1 | 3 | test d'intrusion externe avant l'ouverture |
| **Révélation d'une conviction religieuse** | fuite, inscription visible | aucune donnée transmise à un tiers ; aucune publicité ; hébergement UE ; export et suppression | 2 | 3 | **consentement explicite ou autre fondement (D18)** ; mention claire dans la politique |
| **Contact d'un enfant par un adulte malveillant** | messagerie | aucun échange entre élèves ; enseignant ↔ famille seulement ; pas d'adolescent sans son parent ; signalement avec numéro d'aide ; modération journalisée ; pas de notification (`apps/api/src/messagerie.ts`, `lot21.test.ts`) | 1 | 4 | numéros d'aide par pays à confirmer (D11) |
| **Voix d'un enfant réutilisée** | fuite, entraînement d'IA | voix **locale 7 jours** ; envoi seulement par choix de la famille (code parent) ; chiffrée AES-256-GCM ; écoutée par l'enseignant seul ; effacée après 1 à 30 jours ; jamais transmise à une IA (`apps/api/src/recitations.ts`, `lot16.test.ts`) | 1 | 3 | — |
| **Réponse inadaptée du tuteur** (contenu religieux inventé, danger) | modèle d'IA | fournisseur **simulé** (aucun modèle réel) ; désactivé par défaut pour l'enfant, accord du parent ; filtres (Coran jamais écrit par le modèle, jugements religieux bloqués), questions religieuses transmises à l'enseignant, alertes de détresse ; **batterie adverse de 1 147 cas, 0 violation** (`packages/tutor`, CI) | 1 | 3 | réévaluer cette AIPD **avant** tout fournisseur réel (décision du client) |
| **Perte des données** (panne, rançongiciel) | incident | sauvegarde chiffrée chaque nuit, clé privée hors du serveur ; **restauration complète testée automatiquement** dans la CI (64 tables, lignes identiques) (`infra/prod/backup.sh`, `restore.sh`, `infra/ci/test-restauration.sh`) | 2 | 2 | stockage **hors site** à brancher (D10) |
| **Fuite par le relais d'école** (vol du mini-PC) | vol | file des envois chiffrée avec une clé propre au relais, effacée à la réception ; contenus publics seulement en clair ; le relais n'a aucun droit propre (authentification de l'élève) (`apps/relay/src/store.ts`, `relay.test.ts`, `infra/ci/test-relais.sh`) | 2 | 2 | chiffrement du disque du relais (à ajouter à l'installation) |
| **Compromission du serveur** | faille | comptes PostgreSQL à droits minimaux, secrets par service, conteneurs sans privilèges, CSP stricte, scan ZAP sans échec, dépendances auditées (`pnpm audit`) (`packages/db/src/roles.ts`, `docs/projet/ZAP.md`) | 1 | 4 | procédure d'incident et rotation des clés (`docs/projet/EXPLOITATION.md`) |
| **Consentement mal recueilli** (pays, âge) | règles par pays | âge du consentement numérique par pays ; tout mineur sénégalais passe par un parent ; COPPA : accord parental avant collecte (`apps/api/src/auth/policy.ts`) | 2 | 3 | faire valider `countryRules` (D1) ; méthode de vérification COPPA |

## 5. Conclusion provisoire

Risques résiduels **acceptables** sous réserve de : (1) fondement de la donnée religieuse (D18) ; (2) validation
des règles par pays (D1) et des durées (D9, D11) ; (3) stockage hors site des sauvegardes (D10) ; (4) formalités
auprès de la CDP (`CDP_SENEGAL.md`) ; (5) nouvelle AIPD avant d'activer un tuteur d'IA réel ou un paiement réel.
**Avis du DPO et décision du responsable : [à compléter].**
