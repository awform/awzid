# Rapport de la session cloud — lots 17 à 25, corrections d'audit, suite V1 et suite V1-b

Sessions du 29 et du 30/09/2026. Aucune fusion dans `main` : le chef de projet relit et fusionne. Le dépôt `awform/awform`
n'a pas été touché, ni la branche `audit-dossier`.

## 1. Ce qui est fait

### Lots (avant l'arrêt des fonctionnalités)

| Lot | Branche | État | Contenu |
|---|---|---|---|
| 17 | `lot17-wip` | terminé | consentement par pays (Sénégal : CDP, loi 2008-12), relais d'école hors Internet, synchronisation sûre |
| 18 (V1-a) | `lot18-wip` | terminé | réponses libres corrigées par l'enseignant, mode projection |
| 19 (V1-b) | `lot19-wip` | terminé | épreuves notées (bilans /20, examens /100), textes non préparés, remédiation |
| 20 (V1-e) | `lot20-wip` | terminé | certificats signés (Ed25519), vérifiables par QR |
| 21 (V1-f) | `lot21-wip`, terminé sur `suite-v1` | terminé | messagerie encadrée enseignant ↔ parent, annonces de classe, visio planifiée, protection des mineurs §2.12 |

### Suite V1 (branche `suite-v1`, créée depuis `corrections-audit`, laissée intacte)

Décision du chef de projet du 30/09 : quatre étapes, dans l'ordre, un commit par étape, CI verte à chaque push.

| Étape | Commit | Contenu | Tests ajoutés |
|---|---|---|---|
| Lot 21 (V1-f) terminé | `890fe26`, `80d3bd7` | messagerie chiffrée enseignant ↔ parent, annonces sans réponse collective, pièces jointes de l'enseignant seulement, signalement avec numéro d'aide, modération par l'administrateur (2FA), aucun échange entre élèves ni avec un adolescent sans son parent, pas de notification ; visio planifiée (https, lien 15 min avant) ; conservation limitée (D11) | `lot21.test.ts` (8), `messagerie.test.ts` (11) |
| Lot 22 (V1-c) | `2f84e5c` | carnet de pratique : lignes reprises du livre, cases de l'enfant, **signature du parent avec code parent vérifié par le serveur**, semaine close (D12) ; suivi des sourates tiré des livres, validation par l'enseignant seulement, rappel du carnet de hifẓ, renvoi au lecteur (texte jamais reproduit) | `lot22.test.ts` (7), `carnet.test.ts` (9) |
| Lot 23 (V1-g) | `70364b5` | codes d'activation imprimés : lots par niveau (administrateur 2FA), codes montrés une fois (CSV pour l'imprimeur), empreinte seule en base, usage unique atomique, caractère de contrôle, anti-essais, révocation ; niveau entier ouvert 12 mois ; **paiement toujours simulé** (D13) | `lot23.test.ts` (5), billing `activation.test.ts` (6), web `activation.test.ts` (6) |
| Lot 25 | `e87ec38`, `0edef34` | interface en espagnol, allemand et arabe (RTL), **à relire par un locuteur natif** (statut « en préparation », `A_RELIRE.md`, D14) ; catalogues de langues hors du JavaScript, téléchargés à la demande | tests i18n (3 de plus) |

Migrations ajoutées : `0022_carnet.sql`, `0023_codes_activation.sql` (droits `roles.ts` à jour). Export RGPD complété
(carnet, sourates, accès par code).

Chaque branche part de la précédente ; détails dans `JOURNAL_DEV.md`, état V1 dans `ECARTS.md`.

### Suite V1-b (branche `suite-v1-b`, créée depuis `suite-v1` au commit `d0efd2f`, laissée intacte)

| Étape | Commits | Contenu | Tests ajoutés |
|---|---|---|---|
| A — e2e dans le conteneur | `2217cad` | Chromium local par `E2E_CHROMIUM` (sans effet sur la VM) ; `suite-v1.spec.ts` **3/3 verts** (défauts des scénarios corrigés : fuseau horaire de la visio, code « mal saisi » dont le contrôle était juste) ; `lot16.spec.ts` mis à jour (code parent exigé depuis SEC-3) ; liste des e2e qui passent sans les livres et de ceux qui en dépendent (journal) ; e2e du carnet : impossible sans leçon de religion (non inventée) | — |
| B — Lot 24 (V1-h) | `2cd71ba` | charge : scénario k6 + lanceur Node sans dépendance, **p95 < 500 ms** sur toutes les routes chaudes à 20 et 100 utilisateurs, sauf la connexion à 100 connexions simultanées (805 ms, argon2id) ; **grille RGAA 4.1** (`RGAA.md`) ; corrigés : lien d'évitement, focus visible, titres des tableaux | `charge.test.ts`, `rgaa.test.ts`, `a11y.spec.ts` étendu (arabe, messagerie, sourates, activation, onglets) |
| C — Récital de hifẓ (V1-e) | `f431b19` | séance planifiée, **tirage au sort par le serveur** dans le carnet, barème existant → /20, mention, **note Coran /15** ; publication = résultat officiel qui ouvre l'attestation de hifẓ ; vue famille (étoile pour l'enfant) ; migration `0024` ; D15, D16 | hifz 4, API 10, web 9, e2e `recital.spec.ts` |
| D — QUA-3 | `e2c2a71`, `974a090`, `65d77ea`, `03dec20`, `30caf97`, `026b97d` | découpage sans changement de comportement : `app.ts`, `auth/routes.ts`, `school.ts`, page de la classe, lecteur de leçon ; mêmes 150 routes avant et après | e2e `qua3.spec.ts` |
| E — Tableau « école » et revue | `5444f9d` | synthèse de toutes les classes de l'enseignant (comptes seulement, pas de rôle direction : D15) ; revue adverse : garde-fou du lanceur de charge | API 5, web 1 |

Travail complémentaire demandé par le chef de projet (même branche), dans l'ordre :

| Bloc | Commits | Contenu | Tests ajoutés |
|---|---|---|---|
| A — Sécurité | `6e4aa0a`, `13c89c1`, `00eff17`, `5c8ac84`, `ca1eea0` | instance Docker Compose complète montée par le vrai `deploy.sh --demo` ; **scan OWASP ZAP baseline** HTTP, AJAX, HTTPS : **0 échec** (`ZAP.md`) ; **CSP stricte** (plus de `style-src 'unsafe-inline'`, `media-src blob:`) ; **restauration testée automatiquement** (sauvegarde, base supprimée, `restore.sh`, 64 tables et 7 395 lignes identiques, dans la CI). Défauts réels trouvés et corrigés : **le travailleur ne démarrait pas** sous son compte à droits minimaux (pg-boss), `deploy.sh --demo` et le script de démonstration cassés depuis l'audit | worker 3, API 2, web 3, e2e `securite.spec.ts` (3), `test-restauration.sh` |
| B — Relais | `dfb656a`, `70530c6`, `a741ab9` | **e2e du relais** avec Docker Compose (coupure du réseau, coupure de courant, retour : 8 événements au central, aucun doublon), dans la CI ; `RELAIS_MATERIEL.md` (mini-PC N100 conseillé en 2026, prix datés « à vérifier », consommation ≈ 23 W) | `test-relais.sh` |
| C — Juriste | `ddf62a3` | brouillons `docs/juridique/` : registre art. 30, AIPD, CDP Sénégal, confidentialité et CGU (parents, ados) ; point relevé : **donnée religieuse** (D18) | — |
| D — Exploitation | `f186099` | `EXPLOITATION.md` (incident, rotation, restauration, mise à jour, surveillance, mise en production ; commandes marquées testées / non testées) ; ADR 0002 à 0006 ; limite relevée : **une seule version par clé de chiffrement** | — |
| E — Mobile money | `85c0861` | Wave et Orange Money **simulés** : passes 1, 3, 12 mois en FCFA (prix : D19), notifications HMAC horodatées, montant contrôlé, idempotence, courses (`MOBILE_MONEY.md`) | billing 5, API 6, web 1, e2e `mobile-money.spec.ts` |

### Corrections d'audit (branche `corrections-audit`, partie de `lot21-wip`)

Les **73 constats** de l'audit sont traités, dans l'ordre demandé, **un commit par constat** (identifiant en tête
du message ; quelques constats qui touchent exactement les mêmes lignes sont regroupés et le disent), chacun avec
un test qui échouait avant et passe après. Tableau complet : `docs/projet/CORRECTIONS_AUDIT.md`.

- **Corrigés** : 63 constats (dont CDC-1 pour le journal ; le brief est sur `audit-dossier`), et **2 déjà
  corrigés** par un lot antérieur à la branche.
- **Corrigés en partie** (6, raison écrite) : MIN-14 (réponse neutre à l'inscription : il faut un service
  d'e-mail), MIN-15 (pays imposé aux familles d'une classe sénégalaise : à décider avec l'école pilote), QUA-2
  (couverture mesurée, a11y « moderate »), INF-8 (stockage hors site : D10), INF-11 (images par empreinte), CDC-2
  (WebKit, k6, ZAP).
- **Reportés** (2) : QUA-3 (découpage des gros modules : lot dédié, sans changement de comportement) ; INF-5
  (empreinte de la distribution Gradle : `services.gradle.org` est bloqué par le proxy de cet environnement).

Points forts de l'état final : **CI entièrement verte** (budget de poids tenu, garde-fous qui échouent vraiment,
`pnpm audit` et shellcheck bloquants, actions épinglées) ; tuteur IA verrouillé (oracle indépendant, 1 147 cas,
rapport signé exigé pour Claude) ; RGPD (export complet, effacement réel, durées de conservation) ; paiements
atomiques et droits appliqués (`AWFORM_DROITS=on`).

## 2. Branches et derniers commits

| Branche | Dernier commit |
|---|---|
| `lot17-wip` | `becf341` |
| `lot18-wip` | `8e8784f` |
| `lot19-wip` | `069ef4e` |
| `lot20-wip` | `f53df9b` |
| `lot21-wip` | `70a9e6b` |
| `corrections-audit` | `844cd95` (inchangée depuis, en attente de vérification) |
| `suite-v1` | `d0efd2f` (lots 21, 22, 23, 25 au-dessus de `corrections-audit`) |
| `suite-v1-b` | voir `git log -1 origin/suite-v1-b` (au-dessus de `suite-v1`) |

Ordre de fusion conseillé : `lot17-wip` → … → `lot21-wip` → `corrections-audit` → `suite-v1` (chacune contient la
précédente ; fusionner `suite-v1-b` suffit à tout prendre).

## 3. Tests

**Branche `suite-v1-b` (30/09/2026)** : **594 tests unitaires verts** (API 218, plus 12 sautés sans les livres ;
web 122, billing 26, db, worker, hifz, relais…), lint, typage, svelte-check, garde-fous ; budget : page la plus
lourde **112,8 Ko** (≤ 150), toutes les pages **229,6 Ko** (≤ 300). CI GitHub : verte à chaque étape, sauf
trois envois (106 à 108) rouges à cause du premier essai du test du relais (passerelle de l'hôte filtrée sur le
runner), corrigé par `a741ab9`. Dans le conteneur cloud : **PostgreSQL 18.4** (paquet npm
`@embedded-postgres`), **Node 24**, **Docker** démarré (images de base par `mirror.gcr.io`, Docker Hub
limité), **Chromium 1194** par `E2E_CHROMIUM`. e2e verts ici : `suite-v1`, `a11y` (hors écrans des livres),
`recital`, `securite`, `qua3`, `mobile-money`, `lot10`, `lot16` (écoute), `hifz` 144 ; liste complète de ce qui
dépend des livres : `JOURNAL_DEV.md` (étape A).

Avant `suite-v1-b` :

Conditions de la CI (PostgreSQL 18, contenu synthétique sans texte religieux, sans les livres réels) : à la fin
de `corrections-audit`, **488 verts, 37 sautés** ; sur `suite-v1`, API **191 verts** (12 sautés), web **101**,
billing **21**, db et travailleur verts ; CI GitHub verte à chaque étape.

- **Sautés, et pourquoi** : les tests « livres réels » (37) demandent `~/awform-content` (livres gelés, hors
  dépôt) ; les **e2e Playwright** ne tournent pas ici pour la même raison (scénarios mis à jour quand un
  comportement a changé : paiements PAY-6, comptes, hifẓ) — **à relancer sur la VM**.
- Budget de poids : JavaScript initial de la page la plus lourde **111,1 Ko** (≤ 150, le carnet de pratique
  s'ajoute à la leçon) ; JavaScript de toutes les pages **222,2 Ko** (≤ 300, en baisse : langues hors du paquet).
- Batterie adverse du tuteur (fournisseur simulé) : **1 147 cas, 0 violation**, oracle indépendant du filtre.
- Environnement : PostgreSQL 18 installé depuis npm (`@embedded-postgres`, le dépôt apt PGDG répondait 403) ;
  Docker sans démon ici (images et Caddyfile validés par la CI).

## 4. À faire ensuite

1. **Sur la VM, avec les vrais livres** : tous les e2e (`apps/web/e2e`, dont ceux qui dépendent des livres :
   leçons, bilans, lecteur complet, niveaux re/ra/ado, modèles de certificats, carnets N1) ; e2e du **carnet de
   pratique** (leçon de religion re1) ; formats réels de `sourates`, `carnet`, `guide.bareme` (D6).
2. **Mesures sur la VM et le serveur** : charge (`charge.js`), scan ZAP sur le domaine public, **téléphone
   d'entrée de gamme** (Android, réseau 3G), restauration mensuelle depuis le PC (`test-restauration.ps1`).
3. **Accessibilité** : audit manuel au lecteur d'écran (NVDA, TalkBack), second système de navigation
   (RGAA 12.1), tracé des lettres au clavier (7.3).
4. **Clés de chiffrement** : trousseau à plusieurs versions (messages, récitations, signature des certificats)
   avant toute rotation en production (ADR 0004, `EXPLOITATION.md` § 3).
5. **Juridique** : faire valider `docs/juridique/` (D1, D8, D9, D11, D18), formalités CDP, puis remplacer les
   pages légales de l'application.
6. **Relais** : image ARM (Raspberry Pi), chiffrement du disque, achat du matériel (D17).
7. QUA-3 restant : `packages/content/src/importer.ts` (706 lignes).
8. Sur décision du client seulement : paiement réel (mobile money D19, carte), tuteur IA réel, audio Azure,
   rôle « direction » (D15), publication sur les stores.

## 5. Décisions en attente du client (`DECISIONS_EN_ATTENTE.md`)

| # | Sujet | Provisoire retenu |
|---|---|---|
| D1 | Lois et autorités par pays (juriste ; formalités CDP) | tableau appliqué, marqué « à valider » |
| D2 | Domaine des relais d'école | rien de créé |
| D3 | Contact pour les directeurs d'école | « [à compléter] » |
| D8 | Vérification publique des certificats (juriste, domaine, rotation de clé) | page active, registre seulement |
| D9 | Durées de conservation (juriste) | journal 12 mois, tuteur 12/24 mois, sessions et paiements abandonnés 30 jours, verrous 24 h |
| D10 | Stockage hors site des sauvegardes et machine de restauration automatique | copie prête, non branchée ; alerte à 35 jours |
| D11 | Conservation des messages école ↔ famille (juriste) | effacés après l'année scolaire suivante |
| D12 | Signature du carnet de pratique | code parent obligatoire |
| D13 | Codes d'activation : prix, durée, circuit de l'imprimeur, CGV | 12 mois, toute la famille, aucun lot créé |
| D14 | Relecture de l'espagnol, de l'allemand, de l'arabe (et de l'anglais) | « en préparation », jamais proposées par défaut |
| D15 | Rôle « école / direction » distinct de l'enseignant | aucun rôle créé ; synthèse de ses propres classes pour l'enseignant |
| D16 | Récital : report de la note /15 dans la décision de fin de niveau ; récital « à consolider » | note /15 affichée seulement ; seuls les récitals « oui » valident les passages |
| D17 | Matériel du relais d'école (achat, fournisseur, budget) | liste conseillée, prix « à vérifier » ; rien d'acheté |
| D18 | Donnée révélant une conviction religieuse (RGPD art. 9, loi 2008-12) | aucun consentement explicite dans le code ; signalé au juriste |
| D19 | Mobile money : prix des passes, prestataire, passes seulement ou aussi les formules renouvelables | simulé ; 1 500 / 3 500 / 12 000 F CFA provisoires |

Décisions prises pendant la session : D4 (budget 150 Ko gardé — tenu), D5 (dictée photographiée écartée), D6
(barème du livre en priorité), D7 (corrigés masqués des bilans et examens), CI sur les branches de travail.
Toujours hors périmètre ici : audio Azure, tuteur IA réel, vrais paiements, création de comptes, publication
sur les stores.
