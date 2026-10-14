# Performance de la bêta : diagnostic et corrections (13/10/2026)

Exigence du client (13/10) : application fiable et performante. Ce document donne les causes mesurées des deux
échecs persistants de la suite e2e, ce qui a été corrigé, et ce qui reste (reporté avant l'étape 2 de la bêta).

## 1. Ouverture en 3G simulée (`e2e/perf.spec.ts:40`, objectif < 3 s)

**Aucune régression de code.** Mesures sur la même VM, même machine, ouverture à froid, médiane des ouvertures
(CPU ×4, 150 ms, 1,6 Mbit/s) :

| Version construite | Octets 1re ouverture (Ko, Brotli) | Ouvertures mesurées (ms) |
|---|---|---|
| `avant-madjaliss-lot2` (af89435), charge ≈ 2,5 | 134,1 (JS 107) | 3948, 4589, 3758 (puis 3097, 3524, 2112 à la 2e passe) |
| main daf5328, charge ≈ 2 | 134,0 (JS 106,9) | 3723, 4296, 3992 |
| main daf5328, VM calme (aucun autre navigateur) | 134,0 | 1929, 2614, 2016 → médiane **2016 ms**, relance 765 ms |

- Le code du tag précédent donne **les mêmes 3,9 s** que main quand la VM est chargée : l'écart ne vient pas des
  changements de la bêta (bandeau, vérification d'accès). Entre les deux versions, les octets de la première
  ouverture sont identiques à 0,1 Ko près.
- Historique de `reports/perf-3g.json` : 1,8 à 2,6 s selon les jours pour des octets stables (123 à 134 Ko).
- La mesure dépend de la **charge de la VM** : le ralentissement CPU ×4 est émulé dans le navigateur de test, qui
  se dispute les 8 cœurs avec les autres sessions (une seule ouverture varie de 2,0 à 4,6 s dans une même suite).
- Chronologie d'une ouverture à froid, VM calme (CPU ×4) : document à 262 ms, feuilles de style à 460 ms,
  `entry/start`, `app` et nœuds à 570-750 ms, **chunk commun de 87 Ko reçu à 1130 ms** (le plus long : 0,6 s de
  transfert à 1,6 Mbit/s), puis `/api/v1/levels` et `/config` (1322 → 1522 ms), polices servies depuis le cache,
  `/api/v1/auth/me`, `suspensions`, `acces/statut`, `espace/arabe`, `fonctions` (1700 → 2020 ms) ; **premier rendu
  du titre « Mon arabe » à 2,06 s**. Les appels de la bêta (`acces/statut`, `contenu/suspensions`) partent en
  parallèle avec les autres et ne sont pas sur le chemin critique ; ils ne sont pas bloquants.

**Correction du test (pas du code)** : la médiane porte désormais sur **5** ouvertures (au lieu de 3) pour absorber
deux ouvertures perturbées par la charge. Le seuil de 3 s est inchangé. À relancer seul sur machine calme si la
suite complète tourne en même temps que d'autres sessions.

**Suite possible** (reportée, pas de refonte) : le chemin critique est le chunk commun de 87 Ko (runtime Svelte,
SvelteKit, catalogue `fr.json` ≈ 23 Ko Brotli, icônes). Pistes chiffrées : (a) sortir du catalogue du premier écran
les textes des écrans non affichés au démarrage (≈ 8 à 10 Ko de moins sur le chemin critique, ≈ 0,4 s en 3G) ;
(b) lancer en parallèle `levels` et `config` dès le document (`<link rel=preload as=fetch>`) : ≈ 0,15 s ;
(c) `modulepreload` du chunk commun dans le document : ≈ 0,1 s ; (d) service worker : la relance (0,8 s) est déjà bonne.

## 2. `e2e/coran-corrections.spec.ts:83` (vue versets, chaque récitateur et riwāya)

**Pas de régression du lecteur ; limite de durée.** Lancé seul sur machine calme dans un worktree neuf
(`~/awform-perf-beta`) : **réussi en 5,0 min**. Le test est borné à 300 s (`test.describe.configure`) : il
passe de justesse sur une machine calme et dépasse dès que la VM est chargée. Il dépend de la démo
(`demoReciters()` : récitateurs et audio réels de la base Docker `awform-db-1`), déjà **sauté** quand elle est
absente (`test.skip(!DEMO?.length, …)`) : pas de donnée manquante dans un worktree neuf ici, la démo est sur la VM.
Correction : délai porté à **600 s**. Comportement du lecteur du Coran inchangé.

## 3. Budget de l'appareil élève (JS + CSS + textes préchargés)

| | Avant | Après |
|---|---|---|
| Appareil d'un élève | 349,7 Ko (marge 0,3) | **343,6 Ko (marge 6,4)** |
| Première ouverture (accueil) | 113,2 Ko | 112,2 Ko |
| Page la plus lourde (`/coran/lecteur`) | 149,1 Ko | 149,2 Ko (limite 150) |

Changements (sans toucher au contenu religieux ni à l'affichage du lecteur) :
- pages qui n'ont de sens qu'en ligne, passées en « premier usage » (non préchargées, gardées à la première
  ouverture) : `/famille` (tableau de bord des parents), `/messages` (messagerie école-famille), `/connexion`,
  `/ma-classe` (rattachement à une classe) ; leurs morceaux sont séparés de `profils` dans `vite.config.ts` ;
- leurs 60 textes (clés `fam.*`, `msg.*`, `connexion.*`, `champ.*`, `parc.*` propres à ces pages…) passent de
  `fr.json` (dans la coquille) à `fr-rares.json` (chargé par ces pages, jamais préchargé) ; test des catalogues
  étendu en conséquence.
- **Budget bloquant** : `scripts/budget.mjs` échoue si la marge de l'appareil élève passe **sous 3 Ko**, et le
  test `budget de poids` de `e2e/perf.spec.ts` l'exécute.

**Objectif de 340 Ko (marge 10 Ko) non atteint : 343,6 Ko.** Le reste de la coquille est du code utilisé hors
ligne (lecteur 32 Ko, leçons 22 Ko, hifẓ 11 Ko, prières 11 Ko, runtime 87 Ko). Les 3,6 Ko restants demandent une
décision produit : par exemple passer en « premier usage » des écrans utilisables hors ligne seulement après une
première ouverture (qibla, activités, écriture du Coran : ≈ 2 Ko chacun), ou retirer 113 clés de texte non
citées (≈ 2 Ko ; à vérifier une à une, certaines sont composées dynamiquement).

## 4. Reporté avant l'étape 2 de la bêta (liste seulement)

Refonte du premier écran (voir § 1 suite) ; cache HTTP avancé et empreintes pour les fichiers non hachés
(`/i18n/*.json`, polices) ; stockage froid de l'audio ; dimensionnement de la VM à la charge mesurée ; retrait
des clés de texte mortes ; chargement à la demande des réglages du lecteur (sans effet sur le budget hors ligne).

## 5. Test de charge de la démonstration privée (14/10/2026)

Parcours réalistes à paliers (5 à 400 utilisateurs simultanés), conteneurs applicatifs limités à 2 cœurs pour émuler
l'e2-standard-2. **Plateau ≈ 350 req/s** ; p95 < 500 ms jusqu'à ≈ 220 req/s (≈ 130 à 150 utilisateurs virtuels, soit
~ 1 000 élèves actifs en hypothèse) ; 0 erreur jusqu'à 400 UV. Goulot : processeur (PostgreSQL d'abord, ≈ 2 à 2,7 ms par
requête ; puis l'API). Connexion : ≈ 45/s au plus (argon2id). **Écoute IA : ≈ 3,5 secondes-cœur par analyse de 10 s ;
réglages par défaut (6 CPU, 3 fils, concurrence 2) à ne pas garder sur 2 vCPU** (p95 de l'API ×10 pendant une analyse).
Détail, recommandations R1 à R10 : `application\beta\RAPPORT_CHARGE_SECURITE_14-10.md` ; outils `infra/charge/`.
