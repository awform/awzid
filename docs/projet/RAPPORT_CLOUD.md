# Rapport de la session cloud — lots 17 à 21 et corrections d'audit

Session du 29/09/2026. Aucune fusion dans `main` : le chef de projet relit et fusionne. Le dépôt `awform/awform`
n'a pas été touché, ni la branche `audit-dossier`.

## 1. Ce qui est fait

### Lots (avant l'arrêt des fonctionnalités)

| Lot | Branche | État | Contenu |
|---|---|---|---|
| 17 | `lot17-wip` | terminé | consentement par pays (Sénégal : CDP, loi 2008-12), relais d'école hors Internet, synchronisation sûre |
| 18 (V1-a) | `lot18-wip` | terminé | réponses libres corrigées par l'enseignant, mode projection |
| 19 (V1-b) | `lot19-wip` | terminé | épreuves notées (bilans /20, examens /100), textes non préparés, remédiation |
| 20 (V1-e) | `lot20-wip` | terminé | certificats signés (Ed25519), vérifiables par QR |
| 21 (V1-f) | `lot21-wip` | **partiel** | schéma de la messagerie encadrée et de la visio seulement (routes, écrans : non faits) |

Chaque branche part de la précédente ; détails dans `JOURNAL_DEV.md`, état V1 dans `ECARTS.md`.

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
| `corrections-audit` | voir `git log -1 origin/corrections-audit` (≈ 65 commits au-dessus de `lot21-wip`) |

Ordre de fusion conseillé : `lot17-wip` → … → `lot21-wip` → `corrections-audit` (chacune contient la précédente ;
fusionner `corrections-audit` suffit à tout prendre).

## 3. Tests

Conditions de la CI (PostgreSQL 18, contenu synthétique sans texte religieux, sans les livres réels) :
**488 verts, 37 sautés** (`pnpm -r --no-bail --workspace-concurrency=1 test` avec `TEST_DATABASE_URL`).

- **Sautés, et pourquoi** : les tests « livres réels » (37) demandent `~/awform-content` (livres gelés, hors
  dépôt) ; les **e2e Playwright** ne tournent pas ici pour la même raison (scénarios mis à jour quand un
  comportement a changé : paiements PAY-6, comptes, hifẓ) — **à relancer sur la VM**.
- Budget de poids : JavaScript initial de la page la plus lourde **103,2 Ko** (≤ 150).
- Batterie adverse du tuteur (fournisseur simulé) : **1 147 cas, 0 violation**, oracle indépendant du filtre.
- Environnement : PostgreSQL 18 installé depuis npm (`@embedded-postgres`, le dépôt apt PGDG répondait 403) ;
  Docker sans démon ici (images et Caddyfile validés par la CI).

## 4. À faire ensuite

1. **Sur la VM, avec les vrais livres** : tests « livres réels » et e2e ; vérifier les avertissements d'import
   `champ_retire_eleve` (CON-2 : aucun contenu légitime retiré) et les graphies des références de hadith (CON-3) ;
   vérifier le format de `guide.bareme` (D6).
2. **Brief d'audit** (`audit-dossier`) : le corriger avec le tableau des rectificatifs en tête de `JOURNAL_DEV.md`.
3. Reportés : QUA-3 (lot dédié), INF-5 (empreinte Gradle depuis la VM), images Docker par empreinte, WebKit/k6/ZAP.
4. Reprendre les fonctionnalités : lot 21 (messagerie, visio : routes et écrans), puis V1-c, V1-g (codes
   d'activation), V1-h (RGAA, charge), langues ES/DE/AR.

## 5. Décisions en attente du client (`DECISIONS_EN_ATTENTE.md`)

| # | Sujet | Provisoire retenu |
|---|---|---|
| D1 | Lois et autorités par pays (juriste ; formalités CDP) | tableau appliqué, marqué « à valider » |
| D2 | Domaine des relais d'école | rien de créé |
| D3 | Contact pour les directeurs d'école | « [à compléter] » |
| D8 | Vérification publique des certificats (juriste, domaine, rotation de clé) | page active, registre seulement |
| D9 | Durées de conservation (juriste) | journal 12 mois, tuteur 12/24 mois, sessions et paiements abandonnés 30 jours, verrous 24 h |
| D10 | Stockage hors site des sauvegardes et machine de restauration automatique | copie prête, non branchée ; alerte à 35 jours |

Décisions prises pendant la session : D4 (budget 150 Ko gardé — tenu), D5 (dictée photographiée écartée), D6
(barème du livre en priorité), D7 (corrigés masqués des bilans et examens), CI sur les branches de travail.
Toujours hors périmètre ici : audio Azure, tuteur IA réel, vrais paiements, création de comptes, publication
sur les stores.
