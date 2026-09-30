# Rapport de la session cloud — lots 17 à 25 et corrections d'audit

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

1. **Sur la VM, avec les vrais livres** : tests « livres réels » et e2e ; vérifier les avertissements d'import
   `champ_retire_eleve` (CON-2 : aucun contenu légitime retiré) et les graphies des références de hadith (CON-3) ;
   vérifier le format de `guide.bareme` (D6).
2. **Brief d'audit** (`audit-dossier`) : le corriger avec le tableau des rectificatifs en tête de `JOURNAL_DEV.md`.
3. Reportés : QUA-3 (lot dédié), INF-5 (empreinte Gradle depuis la VM), images Docker par empreinte, WebKit/k6/ZAP.
4. Sur la VM : vérifier le format réel de `sourates` et des exercices `carnet` dans les livres de Religion ;
   relancer les e2e (nouveaux écrans : `/messages`, `/sourates`, `/activation`, onglets de classe).
5. Relecture des langues par des locuteurs natifs (D14) ; décisions D11 à D13.
6. Suite : V1-h (RGAA, charge, lot 24), QUA-3 ; paiement réel et publication Play seulement sur décision du client.

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

Décisions prises pendant la session : D4 (budget 150 Ko gardé — tenu), D5 (dictée photographiée écartée), D6
(barème du livre en priorité), D7 (corrigés masqués des bilans et examens), CI sur les branches de travail.
Toujours hors périmètre ici : audio Azure, tuteur IA réel, vrais paiements, création de comptes, publication
sur les stores.
