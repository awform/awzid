# Journal de développement — application AWFORM

Dépôt : `~/awform-app` sur la VM `awform-dev` (Ubuntu 26.04.1 LTS, 192.168.50.10), git local, branche `main`.
Contenu importé : `~/awform-content` (copie en lecture seule depuis `W\awform`, hors dépôt).
Checkpoint : `awform\checkpoints\app-lot01.json`.

Dépôt distant : `git@github-awform:awform/awzid.git` (créé par le client) — `git push origin main` à la fin de chaque étape, en plus de `backup-repo.ps1`.

---

## 04/10/2026 — Lot 29 : tajwid en couleurs (Ḥafṣ) dans l'espace Coran (branche `lot29-wip`, depuis `main` 42270d5)

Demande du client : garder le muṣḥaf actuel et AJOUTER une version « tajwid » en couleurs (comme Ayat), Ḥafṣ
seulement ; pour l'enfant, une version simplifiée avec le vert.

- **Source des règles (aucune saisie à la main)** : jeu « quran-tajweed » de Collin Fair (CC BY 4.0, vérifiée le
  04/10/2026 ; `docs/projet/LICENCES.md`), 60 057 annotations, 18 règles, positions dans le texte Tanzil Uthmani
  1.0.2 de 2017. Notre Tanzil (plus récent) ne diffère de cette copie que par des **insertions** (4 307 versets :
  petites mīm après tanwin, signes de pause, ۞) : **calage automatique** (`packages/content/src/tajwid.ts`,
  `alignVerse`), qui refuse tout autre écart, vérifie que les caractères recouverts sont les mêmes, rattache la
  petite mīm à son tanwin et laisse les signes de pause HORS couleur. Résultat : **6 236 versets calés, 0 écart**,
  60 797 plages (annotations coupées autour des pauses). Sources gelées dans le dépôt
  (`packages/content/tajwid-source/*.gz`, empreintes SHA-256 dans LICENCES.md) ; générateur
  `pnpm --filter @awform/content tajwid` → `apps/web/static/tajwid/NNN.json`.
- **Intégrité du texte** : les couleurs sont des enveloppes (`<span class="tj">`) posées sur des plages de
  caractères Tanzil, jamais une modification. Chaque verset porte l'empreinte du texte qui a servi au calage :
  empreinte différente, position invalide ou concaténation ≠ texte ⇒ verset affiché **sans couleur**. Tests
  bloquants (`packages/content/test/tajwid.test.ts`, texte Tanzil seul, donc aussi en CI) : fichiers livrés =
  régénération depuis la source, octet pour octet ; pour les 6 236 versets, morceaux = texte exact, mots = texte
  exact, affichage du tanwin réversible ; vraisemblance des lettres par règle (rebond sur ق ط ب ج د, son nasal
  sur ن/م avec chadda, hamza de liaison = ٱ…). e2e : texte affiché identique avant / après activation.
- **Affichage** : bouton « Tajwid en couleurs » (orthographe du GLOSSAIRE), **désactivé par défaut**, réglage
  gardé sur l'appareil, dans **Lire**, **Mémoriser** (masquage progressif compatible) et **Écouter** (seulement
  avec un récitateur en Ḥafṣ : **bouton absent** pour une autre riwāya). Légende : couleur + nom de la règle
  (termes du GLOSSAIRE : ados/adultes « le son nasal », « l'allongement … 2 / 4 ou 5 / 6 temps », « le rebond »,
  règles du ن/م) + **exemple tiré de la sourate ouverte** (« absent de cette sourate » sinon) ; dépliée sur
  ordinateur, repliée sur téléphone, et **bouton flottant « Légende des couleurs »** toujours présent ; crédit
  avec liens vers la source et la licence. La basmala en tête des sourates reste sans couleur : la source ne
  l'annote pas (aucune règle affichée sans source).
- **Enfant** (thème Jardin) : 4 familles — **le chant du nez (الْغُنَّةُ) en vert**, le son long, le rebond, les
  lettres qu'on ne prononce pas ; couleurs douces ; texte agrandi (2,1 rem). Ados et adultes : palette complète
  (12 couleurs, inspirée des Muṣḥaf de tajwid / Ayat : verts du nasal, ocre → rouge sombre selon la durée,
  bleu du rebond, gris des lettres non prononcées).
- **Angles morts** : daltonisme (option « Soulignés en plus des couleurs » : ondulé = nasal, double = long, plein =
  rebond, pointillé = non prononcé) ; mode sombre (palette propre) ; **contrastes testés** dans les 8 palettes
  (16 couleurs × carte ≥ 4,5:1, sable et surlignage ≥ 3:1, `tokens.test.ts`) ; 320 px sans défilement
  horizontal ; termes arabes isolés (`<bdi>`) dans les libellés ; hors ligne : annotations chargées **à la
  demande par sourate**, gardées dans IndexedDB (et avec « Garder cette sourate »), non préchargées par le
  service worker ; réseau absent et sourate jamais vue ⇒ texte sans couleur + message.
- **Mesures** (VM `awform-dev`, 04/10/2026, worktree `~/awform-lot29`) : annotations **554 Ko bruts, 194 Ko en
  Brotli pour les 114 sourates** (al-Baqara 43 Ko / 13 Ko Brotli, petites sourates ≈ 0,25 Ko) ; budget : page la
  plus lourde `/lecons/[id]` **123,6 Ko** ≤ 150 (lot 27 : 122,5 ; 123,7 après fusion), `/coran/lecteur` 99,1 Ko, `/coran/ecouter`
  106,5 Ko, toutes les pages **262,4 Ko** ≤ 300 (257,8). `pnpm -r --no-bail test` (vrais livres) : **1 255 verts,
  1 sauté, 0 échec** (143 s ; +17 : content 10, web 7) ; le nouveau test échoue sans le module (vérifié) ;
  e2e `lot29.spec.ts` : **14/14** (2 appareils) ; e2e complets après fusion de `main` 5da52d6 : 210 verts, 12 sautés, 0 échec ; puis le **lot 28 a été intégré dans `main` (3796443)** : nouvelle fusion (conflits seulement en fin des 5 catalogues de langues : version de `main` reprise, clés `tj.*` réajoutées, aucune clé perdue — 1 720 par catalogue) et TOUT relancé sur le code fusionné : unitaires **1 272 verts, 1 sauté, 0 échec** (135 s) ; e2e **218 verts, 12 sautés, 0 échec** (11,9 min) ; budget : page la plus lourde `/lecons/[id]` **130,0 Ko** ≤ 150 (hausse due au lot 28), toutes les pages **269,4 Ko** ≤ 300.
- e2e lancés sur une infrastructure ISOLÉE (ports 3290/4290, base `awform_l29_test`, rôles `awform_e29_*`,
  dossier temporaire privé) : un autre agent lançait ses e2e en même temps sur la base et les ports communs
  (premier passage perturbé : serveurs arrêtés en cours, ECONNREFUSED).
- Captures : `reports/lot29/` (enfant, ado, ado sombre, adulte, adulte sombre, soulignés, al-Baqara, 320 px ;
  téléphone et ordinateur). Décision : **D29** (relecture de la source par le référent, termes hors glossaire).

---

## 04/10/2026 — Démonstration : connexion simplifiée (branche `demo-simple`)

Demande du client (démonstration sur son réseau local, utilisée par lui seul) : identifiants faciles à taper
sur téléphone.

- **Identifiants courts** `parent`, `enfant`, `ado`, `adulte`, `enseignant`, `admin`, mot de passe commun
  court, **sans code à 6 chiffres** pour l'enseignant et l'administrateur (`apps/api/src/demo-mode.ts`,
  branche dédiée dans `POST /auth/login`). Ils ne visent que les comptes FICTIFS de `cli/demo.ts`
  (`<rôle>-<tag>@demo.awform.test`) : aucune donnée de démonstration recréée ni modifiée.
  `enfant` → compte parent avec **Lina** ouverte d'emblée (pas de « Qui apprend ? ») ; `ado` → **Yanis** ;
  `parent` → les trois profils. Le **code parent reste demandé** comme avant (changer d'apprenant depuis un
  profil enfant/ado, accords, espace parent). Connexion par e-mail + mot de passe long + second facteur : inchangée.
- **Mode démo seulement** : `AWFORM_DEMO=1` posé par `deploy.sh --demo` (`demo-env.sh`, retiré sans `--demo`
  comme les autres réglages de démonstration, audit INF-9) ; passé à l'API (`env-scopes.conf` : `AWFORM_DEMO`,
  `SITE`, `SITE_LAN`, `RELAIS_DOMAINE`, sans secret). Sans lui, l'option n'existe pas (`buildApp` :
  `demoLogin` absent).
- **Garde-fou au démarrage** (`demoGuard`, `server.ts`) : avec `AWFORM_DEMO=1`, l'API **refuse de démarrer**
  si `SITE` est absent, si `SITE`/`SITE_LAN` n'est pas une adresse locale (IP privée, localhost, .test, .local,
  .lan, .home.arpa), si un domaine de relais public est configuré, ou en mode production (`COOKIE_SECURE=1`).
  L'API n'a aucun port publié (compose.yml, vérifié par le test) : seule la Caddy de la démonstration la joint.
- Page de connexion : champ en texte libre (`autocapitalize=none`) quand `/api/v1/config` indique `demo`.
- Tests : `apps/api/test/demo-simple.test.ts` (échoue avant : module absent) — garde-fou ; **en production**
  les 6 identifiants courts → 401, mot de passe court → 401 et refusé à l'inscription (400), enseignant sans
  code → `totp_requis` ; **en démo** les 6 identifiants → 200 et bons profils. `env-scopes.test.ts` mis à jour
  (l'API reçoit `SITE`). Suite API : 251 tests verts.

---

## 04/10/2026 — Lot 28 : les 31 livres gelés publiés, livrets « Lecture du Coran » (branche `lot28-wip`)

Mesures prises sur la VM `awform-dev` (base de TEST pour l'import, Playwright local), contenu copié le 04/10.

- **Copie PC → VM** (`infra/sync-content.ps1`, méthode des lots 8 et 16) : ancienne copie sauvegardée dans
  `~/awform-content.avant-lot28` (28 Mo), nouvelle copie 50 Mo, `MANIFEST.sha256` refait (1 036 fichiers). Copiés :
  en1-en5, ad1-ad10, ado1-ado4, re1-re5, ra1-ra4, qc1-qc3, `data/hifz`, `data/lect`, `index-lecons.js`, `eval`,
  registre, illustrations, Tanzil, `ids` (29 tables). **Non copiés** : `audio` (clé Azure), `data/gp` et `data/mf`
  (Guide des parents, Manuel du formateur : en relecture religieuse, pas des livres d'élève).
  **Incident** : `verifier-copie.sh` refusait une copie intacte (`comm` : « not in sorted order » — tri dépendant de
  la langue de la session ssh) ; contrôle refait à la main (empreintes et fichiers ajoutés : 0 écart) puis copie
  avec `-Force` ; script corrigé (`LC_ALL=C`).
- **Contrôle du contenu** (31 livres) : 778 unités, 5 703 exercices, **3 825 extraits coraniques contrôlés octet par
  octet, 0 erreur** (2 986 identiques, 839 extraits exacts), 0 erreur bloquante, 329 avertissements (dont 114
  champs `guide_fr__src` des livrets qc retirés de la projection élève, comme prévu).
- **Livrets qc (Lecture du Coran) — manque trouvé et comblé** : l'importeur les lisait mais **ne contrôlait aucun
  de leurs 957 extraits du Coran** (`src: "Q:s:v[:w-w]"`). Contrôle ajouté (`packages/content/src/quran.ts` :
  `qcSourceText`, `checkQcSource`, règle E2 de `qc-check.ps1` : texte sans crochets = Tanzil, sans liste blanche,
  tout écart bloquant). Projection élève : extrait du Muṣḥaf « non préparé » absent hors session, sens des
  versets retiré en bilan/examen. Interface : livrets dans l'espace **Coran** (plus dans l'onglet Arabe), lecteur
  dédié (`apps/web/src/lib/qc/` : lettres, signes, échelle de bas en haut, exercices, Muṣḥaf, « je sais »),
  crochets de couleur par famille de règle (jetons c0-c3 existants), 16 types d'exercices corrigés sur l'appareil
  en leçon (`check.ts`, testé) ; bilans et examens : aucun corrigé reçu (D7), l'adulte corrige avec le guide.
- **Carnets de hifẓ** : seuls les carnets gelés E1-E5 et N1-N5 sont publiés (`--carnets` / `AWFORM_CARNETS`) ;
  N6-N10 (présents sur le PC, non audités) restent hors de l'édition.
- **Défaut de performance révélé par les 31 livres** : le premier manifeste hors ligne (`/api/v1/packs`)
  compressait toutes les leçons en Brotli 11 dans le fil principal — l'API ne répondait plus (connexions en
  erreur 500, puis comptes verrouillés dans les e2e). Compression déplacée hors du fil principal et constructions
  simultanées fusionnées (`apps/api/src/packs.ts`) ; test : blocage mesuré **1 354 ms avant, < 400 ms exigé après**.
- **Test instable corrigé** : `apps/relay/test/relay.test.ts` (« rejeu d'un envoi ») échouait 1 fois sur 5 (deux
  envois de la même milliseconde sortaient dans un ordre au hasard) ; 12 exécutions vertes après correction.
- **Import réel** (base de test, édition e2e) : « 778 unités, 5 703 exercices, 1 145 illustrations ; versets 3 825
  contrôlés, 0 erreur ». Valeurs par défaut de l'import et de `deploy.sh` : les 31 livres, plus d'aperçu.
- **Tests** (VM, après fusion de `main` 5da52d6) : suite complète avec les livres (`pnpm -r --no-bail test`)
  **1 255 réussis, 1 sauté, 0 échec** (une exécution précédente avait 4 échecs `mobile-money` : un autre agent
  utilisait la même base de test en même temps ; relancée seule : verte) ; e2e complets **200 réussis, 12 sautés,
  0 échec** (dont `lot28.spec.ts` : 31 livres dans leur onglet, leçon 1 de chaque livre ouverte dans son lecteur,
  exercices qc corrigés, Muṣḥaf = Tanzil, examen sans corrigé, carnets E1-E5/N1-N5) ; lint, format, typage ;
  budget : page la plus lourde `/lecons/[id]` 128,9 Ko (≤ 150), tout le JS 264,3 Ko (≤ 300).

---

## 04/10/2026 — Lot 27 : interface de l'espace Coran (branche `lot27-wip` = `lot27-api-wip` + `lot26-wip`)

Partie serveur : entrée suivante (autre agent). Ici, l'interface seulement (aucun paquet serveur de l'audio touché).

- **Espace Coran** (`apps/web/src/routes/coran/`) : accueil à quatre tuiles + carnet de hifẓ + rappel d'adab ;
  onglets communs **Lire / Écouter / Mémoriser / Récitateurs** (`lib/quran/CoranTabs.svelte`).
- **Lire** (le lecteur existant, gardé) : aller à un **juzʾ, un ḥizb ou une page** du Muṣḥaf de Médine
  (débuts tirés des métadonnées Tanzil des livres), **repères de page** dans le texte, `?page=N`, lien
  « Écouter cette sourate ».
- **Écouter** : récitateur (liste autorisée du profil, préférence, conseil débutant en tête), **riwāya
  toujours affichée** (`RiwayaBadge` : badge marqué « autre riwāya » hors Ḥafṣ, avec explication), sourate et
  plage, répétition du verset et de la plage (1 à 20), **vitesse 0,5 à 1,5 sans changer la hauteur**
  (`preservesPitch`), **minuterie d'arrêt**, **arrière-plan et commandes du système** (Media Session :
  lecture, pause, verset précédent / suivant), surlignage du verset entendu **seulement en Ḥafṣ** ; crédit du
  récitateur et du Complexe ; **aucune lecture ni téléchargement avant un geste** de l'utilisateur, pas de
  points, pas de musique.
- **Hors ligne par sourate** (`lib/quran/offline-audio.ts`) : « Garder cette sourate » (taille et durée
  annoncées), **Wi-Fi seulement** (refus sur réseau mobile quand le navigateur le dit, avertissement sinon),
  **quota** de l'appareil, suppression, liste sur « Récitateurs », purge des récitateurs retirés ; lecture
  depuis le cache. **Bug évité** : le service worker effaçait tous les caches autres que le sien à chaque mise
  à jour — le cache audio est désormais gardé (test). En http (démo), le cache n'existe pas : message clair (D28).
- **Mémoriser** (relié au carnet : portion du jour proposée) : **écouter, répéter, enchaîner** (chaque nouveau
  verset N fois, puis la plage depuis le début M fois, étape affichée), **masquage progressif** (visible,
  moitié, premier mot, caché, « Voir » par verset) — les mots sont voilés à l'affichage, le texte Tanzil n'est
  jamais modifié ; **récitateurs en Ḥafṣ seulement** ; sans audio, le masquage reste utilisable.
- **Mes récitateurs** : cartes (noms arabe et français, riwāya, style, vitesse, versets, crédit, licence et
  date d'archive), choix gardé ; **parent** : récitateurs permis à chaque enfant (code parent, intersection
  avec la classe expliquée, D24) ; **enseignant** : liste de la classe (onglet Sourates).
- Logique pure testée (`lib/quran/player.ts`) : files d'écoute et de mémorisation, masquage, règles de riwāya,
  vitesse, portion du carnet.
- **Tests** : web +7 (`player.test.ts` 5, `offline-audio.test.ts` 1, + lot 26) ; e2e `lot27.spec.ts`
  (6 × 2 appareils) avec deux récitateurs d'**ESSAI** importés par `e2e/audio-essai.mjs` dans la base de test
  (**bips générés, jamais une récitation**) : pas de lecture automatique ni de requête audio avant le geste,
  vitesse 1,5 avec hauteur conservée, Media Session renseignée, surlignage Ḥafṣ, autre riwāya sans surlignage et
  absente de Mémoriser, enchaînement et masquage, sourate gardée puis lue depuis le cache (`blob:`) et
  supprimée, choix du récitateur, aller à la page 604, liste du parent appliquée à l'enfant ; axe-core sans
  violation grave sur Écouter, Mémoriser, Récitateurs. `lot8.spec.ts` : le sélecteur « récitant » désactivé
  est devenu le lien d'écoute.

**Mesures** (VM `awform-dev`, 04/10/2026, branche `lot27-wip`) : `pnpm -r --no-bail test` (vrais livres) :
**1 238 verts, 1 sauté, 0 échec** (192 s) ; e2e complets : **191 verts, 12 sautés, 1 échec** corrigé ensuite
(test lu avant que la source audio soit posée : attente ajoutée ; `lot27.spec.ts` repassé 2 fois de suite :
24/24) ; budget : page la plus lourde `/lecons/[id]` **122,5 Ko** ≤ 150, toutes les pages **257,8 Ko** ≤ 300.
Captures : `reports/design-v2/apres/*-coran-*.png` (accueil, page 604, écoute en cours, autre riwāya,
mémorisation masquée, récitateurs, sombre). Décision : D28 (https pour l'écoute hors ligne ; démo sans
récitation).

---

## 04/10/2026 — Lot 26 : design v2 « par public » (branche `lot26-wip`, depuis `main` caced1c)

Direction du chef de projet : un système hybride par public sur une base commune de jetons.

- **Jetons** (`apps/web/src/lib/theme/tokens.ts` → `tokens.css`) : quatre thèmes — **Jardin** (enfants : crème,
  vert et soleil, rayons 12-26 px, cibles **56 px**, arabe 30 px), **Nuit étoilée** (ados : bleu nuit, accents
  ciel et or, ciel d'étoiles en dégradés CSS), **Manuscrit moderne** (adultes : papier chaud, titres serif du
  système, filet doré sous les titres, motif géométrique d'étoile à huit branches en SVG de 0,4 Ko, sans
  figuration), **Clair** (parents, enseignants, administration : neutre, tableaux lisibles). Chacun a sa
  **variante sombre** (la Nuit a une variante claire « aube ») ; couleurs, deux polices (UI et titres),
  espacements, rayons, ombres, cible tactile, durées de mouvement ; `prefers-reduced-motion` neutralise toute
  transition. **Contraste WCAG AA testé sur les 8 palettes** (29 paires d'usage, dont lettres colorées des livres
  sur fond sombre et dans les encadrés, focus 3:1).
- **Public de l'écran** (`lib/ui/audience.ts`, testé) : profil actif enfant → Jardin, ado → Nuit, adulte →
  Manuscrit ; parent (espaces famille, compte, messages, abonnement — même avec un enfant actif), enseignant,
  administration, visiteur → Clair. **Navigation de 3 à 5 entrées** par public (enfant : Accueil, Arabe, Coran,
  Sciences, Écriture ; ado/adulte : Accueil, Arabe, Coran, Sciences, **Plus** ; parent : Famille, Suivi,
  Messages, Compte ; enseignant : Classes, École, Questions, Compte ; admin : 3 ; visiteur : 3) ; barre du bas
  sur téléphone et tablette (< 900 px), dans l'en-tête sur ordinateur. Nouvelle page **« Plus »**.
- **Composants communs** (`lib/ui/`) : icônes au trait (aucune figuration), état vide, erreur / hors ligne avec
  « Réessayer », chargement (silhouettes, annoncé aux lecteurs d'écran), barre de progression accessible,
  emblème, **premier lancement par public** (3 consignes, montré une fois, dans la page ; enfant : grandes
  icônes + ligne « Pour l'adulte : lisez ces consignes »), bouton **clair / sombre / auto** (réglage de
  l'appareil, `lib/ui/mode.ts`, testé). Styles globaux refaits (boutons, champs, cartes, tableaux, tuiles).
- **Écrans** : accueil du jour (bonjour, étapes avec icônes, état vide « tout est fait », erreur réseau
  explicite, tuiles « Mes espaces » de l'enfant), livres d'arabe (livres **du profil d'abord**, cartes à dos
  coloré par filière), téléchargements (chargement visible), activité vide expliquée, bandeau hors ligne
  explicite, en-tête compact sur téléphone. Couleurs en dur des composants remplacées par les jetons
  (32 remplacements ; test : plus aucun blanc/noir en dur hors dessins).
- **Angles morts corrigés** : (1) `pattern="[0-9]{4}"` lu par Svelte comme une expression → attribut
  « [0-9]4 » : **le navigateur refusait tout code parent et tout code du second facteur** (profils, compte,
  connexion) ; corrigé + test statique ; (2) « ﷺ » illisible dans le texte français (repli de police) → Noto
  Naskh Arabic dans la pile UI ; (3) liste « relie les lettres » qui débordait à 320 px ; (4) un enfant voyait
  les livres adultes en premier ; (5) graphique d'activité blanc quand il n'y a rien.
- **Tests** : web 140 (dont nouveaux : `audience.test.ts` 5, `mode.test.ts` 3, `pattern-attr.test.ts` 1,
  tokens 15 au lieu de 6), e2e `lot26.spec.ts` (6 × 2 appareils : thème et navigation par public, premier
  lancement montré une fois, **mode sombre sans violation grave axe-core**, **aucun défilement horizontal à
  320 px** sur 7 pages, hors ligne, mouvement réduit, cibles 56 px de l'enfant) ; `horsligne.spec.ts` mis à
  jour (5 entrées au lieu de 6, « Plus », réglage sombre gardé après rechargement).

**Mesures** (VM `awform-dev`, 04/10/2026, branche `lot26-wip`) : `pnpm -r --no-bail test` (vrais livres) :
**1 185 verts, 1 sauté, 0 échec** (122 s) ; e2e Playwright complets : **180 verts, 10 sautés** (captures du lot
26 sans variable), 11,8 min ; budget (`reports/budget-web.md`) : page la plus lourde `/lecons/[id]` **120,3 Ko**
≤ 150 (avant : 112,8), toutes les pages 239,6 Ko ≤ 300, CSS 20,4 Ko, polices 222,6 Ko (aucune ajoutée).
**Captures** : `reports/design-v2/avant/` et `reports/design-v2/apres/` (39 écrans × téléphone et ordinateur :
visiteur, adulte, parent, enfant, ado, enseignant ; sombre ; 320 px ; hors ligne), par
`DESIGN_CAPTURES=<dossier> npx playwright test design-v2`.
Décisions : D25 (Nuit toujours sombre), D26 (comparaison avec la planche de référence, police de titre), D27
(nom affiché et emblème).
## 04/10/2026 — Lot 27 : audio du Coran, partie SERVEUR (branche `lot27-api-wip`, depuis `main` caced1c)

Décision du client : récitations du **Complexe du Roi Fahd**, hébergées chez nous (licence archivée le 30/07/2025 :
usage général gratuit dans les applications, secteur privé compris). 9 muṣḥafs : Ḥafṣ (al-Ḥudhayfī, al-Muʿayqlī,
Muḥammad Ayyūb, al-Muhannā, al-Akhḍar), Shuʿba et Qālūn (al-Ḥudhayfī), as-Sūsī (aṣ-Ṣiddīqī), ad-Dūrī
(al-Juhanī). **Aucun fichier téléchargé** (serveur du Complexe injoignable depuis la France) : tout est prêt
pour l'import ; les tests n'utilisent que des **fichiers d'essai non coraniques** (bips WAV générés, MP3
synthétiques sans son, MP3 de bips encodés par ffmpeg) — aucune récitation inventée ni synthétisée.

- **Schéma** (migration `0027_coran_audio.sql`) : `quran_reciter` (id, noms arabe et français, riwāya parmi les
  20 des dix lectures, vitesse et style étiquetés, compte de versets, licence : source, URL, date d'archive,
  texte, crédit ; statut `en_attente` / `actif` / `retire` avec date et motif obligatoires), `quran_track`
  (récitateur, sourate, verset, chemin relatif, durée, taille, SHA-256, format ; contraintes : durée et taille
  > 0, empreinte hexadécimale, chemin sans « .. »), `quran_audio_import` (état et rapport de chaque import,
  même bloqué), `profile_reciter_pref`, `profile_reciter_rule` (liste du parent), `class_reciter_rule` (liste
  de l'enseignant), `relay_reciter` (préchargement du relais). Droits de l'API : pistes et imports en lecture,
  récitateur en lecture + retrait.
- **Outil d'import** (`packages/db/src/audio/`, ligne de commande `coran-audio` : `catalogue`, `verifier`,
  `importer`, `activer`, `retirer`, `etat`) depuis un dossier local (zip « ayat » décompressé) : nommage
  configurable (`SSSVVV.mp3` par défaut), muṣḥaf complet ou partiel (`--sourates`) ; contrôles : manquants,
  doublons de nom, hors muṣḥaf, compte (**Ḥafṣ : 6 236 imposé**, table des 114 sourates vérifiée contre le
  fichier Tanzil des livres ; **autres riwāyāt : compte déclaré**, numérotation contiguë par sourate),
  illisibles, durée nulle (durée MP3 par lecture des trames, sans dépendance), **silences** (WAV : calcul
  interne ; MP3 : ffmpeg `silencedetect` ; silence ≥ 95 % = bloquant, silence intérieur ≥ 4 s = avertissement ;
  sans ffmpeg : avertissement « silences non vérifiés »), contenus identiques, empreintes (liste SHA256SUMS
  facultative). **Un contrôle bloquant : rien n'est copié ni activé**, rapport gardé. Fichiers copiés sous un
  nom portant leur empreinte, pistes remplacées d'un bloc, activation en un ou deux temps (après écoute),
  réactivation d'un récitateur retiré seulement avec `--reactiver`.
- **API** (`apps/api/src/coran-audio.ts`) : récitateurs actifs (riwāya, crédit, licence, conseil débutant
  Muḥammad Ayyūb en tête) ; pistes d'une sourate ; **fichiers servis avec Range** (206, suffixe, 416), ETag =
  SHA-256, 304, cache public 1 jour ; **paquets hors ligne par sourate** (manifeste : fichiers, tailles, durée,
  empreinte ; `wifiSeulement`) ; profil : liste autorisée du parent (code parent, mineurs) et de la classe
  (enseignant), **intersection** ; préférence ; **règle de riwāya** : mode « mémoriser » = Ḥafṣ seulement
  (409 `riwaya_differente_du_carnet`), pistes d'une autre riwāya marquées `sans_surlignage` ; **retrait
  immédiat** par l'administrateur (second facteur, motif, journal d'audit) : hors des listes, des paquets, des
  fichiers (410) et de la liste du relais.
- **Relais d'école** : liste des fichiers des récitateurs choisis pour l'école (jeton du relais), téléchargement
  vérifié (taille + SHA-256) au démarrage puis toutes les heures, **effacement** de ce qui n'est plus demandé
  (coupure propagée), lecture sur le Wi-Fi sans Internet (Range), listes mises en copie.
- **Déploiement** : volume `audio` (API en lecture seule, `AWFORM_AUDIO_DIR=/audio`), service `coran-audio`
  (profil outils, compte propriétaire, `/source` en lecture seule) sur l'image `outils-audio` (= API + ffmpeg),
  construite sur la VM (ffmpeg 5.1.9 présent, outil chargé) ; lancement contre la base de production non testé.
- **Web** : client d'API **typé** seulement (`apps/web/src/lib/coran-audio.ts`, calcul du quota hors ligne) ;
  l'interface de l'espace Coran est confiée à l'autre agent.
- Exploitation : `docs/projet/EXPLOITATION.md` § 7 ; décisions D20 à D24.

**Mesures** (VM `awform-dev`, 8 cœurs, 04/10/2026, fichiers d'essai) : contrôle d'un muṣḥaf d'essai complet de
6 236 bips WAV (37,7 Mo) en 0,2 s ; import complet (contrôles, copie, base) en 0,64 s ; MP3 de 12 s avec
ffmpeg : 50 ms par fichier, 15,5 ms à 4 en parallèle (≈ 1 min 40 s estimée pour 6 236 versets de cette durée) ;
API (in-process, 20 appels) : liste des récitateurs 1,5 ms, index des paquets 3,8 ms (21,8 Ko), paquet
d'al-Baqara 2,3 ms (65,5 Ko, 286 fichiers), 1 Ko en Range 1,7 ms, liste du relais pour un muṣḥaf complet
13,8 ms (1,3 Mo non compressé).

**Vérifications** (VM, worktree `~/awform-lot27`, base de test séparée `awform_l27_test`, vrais livres) :
`pnpm -r build`, typage (0 erreur, svelte-check 0 avertissement), lint (ESLint + Prettier) : OK ;
`pnpm -r --no-bail test` : **1 214 tests verts, 1 sauté, 0 échec**, dont 47 nouveaux (db 21, api 10,
relais 4, web 12) ; budget : page la plus lourde 113,9 Ko ≤ 150, toutes les pages 232,0 Ko ≤ 300.
Commits : `e67b811` (schéma), `8555977` (import), `0496d43` (API), `4671426` (relais), `e75e943`
(déploiement, client typé), et ce journal.

---

## 30/09/2026 — Complément E : paiement mobile au Sénégal, SIMULÉ (branche `suite-v1-b`)

- **Simulateur Wave / Orange Money** (`packages/billing/src/providers/mobile-simule.ts`) derrière l'interface
  `PaymentProvider` : francs CFA entiers seulement ; notification de l'opérateur signée HMAC-SHA256 sur
  « horodatage.corps » (`x-mobile-signature: t=…,v1=…`), **rejeu refusé au-delà de 5 minutes**, identifiant
  d'événement « opérateur:transaction » ; en mode simulé, le moyen `mobile_money` l'utilise (secret dérivé de
  celui du simulateur : aucune nouvelle variable).
- **API** : montant et devise notifiés **comparés à la commande** (`montant_incorrect` : rien n'est accordé,
  la commande reste ouverte) ; webhook `mobile_money` accepté en simulation ; simulation par opérateur.
- **Passes** `pass_1_mois` (1 500 F CFA), `pass_3_mois` (3 500), `pass_12_mois` (12 000) — **prix provisoires,
  décision du client (D19)** ; textes dans les cinq langues ; page de paiement simulé avec le choix de
  l'opérateur.
- **Tests** : billing `mobile.test.ts` (5 : signature, corps modifié, autre secret, rejeu tardif, francs CFA,
  opérateur inconnu) ; API `mobile-money.test.ts` (6 : offres, parcours, **même notification ×6 en parallèle →
  1 pass**, **course Wave ×4 + Orange Money ×4 + page → 1 traitement**, montant falsifié / signature fausse /
  notification rejouée → rien, échec notifié) ; web `billing.test.ts` ; e2e `mobile-money.spec.ts` (Orange
  Money simulé) et `lot10.spec.ts` : verts. Architecture et passage au réel : `docs/projet/MOBILE_MONEY.md`.
- Total unitaires : **594 verts** ; budget 112,8 Ko (≤ 150), toutes les pages 229,6 Ko (≤ 300). Aucun compte,
  aucune clé, aucun argent.

---

## 30/09/2026 — Complément D : exploitation et ADR (branche `suite-v1-b`)

- `docs/projet/EXPLOITATION.md` : surveillance (seuils), procédure d'incident (constater, contenir, violation de
  données : CNIL 72 h / CDP, rétablir, compte rendu), rotation de chaque secret (procédure et conséquence),
  restauration (contrôle mensuel, restauration complète, serveur perdu), mise à jour, liste de contrôle avant la
  production. **Chaque commande marquée [testée], [testée CI] ou [non testée]** — testées ici sur une instance
  jetable : `status.sh`, `smoke.sh`, `backup.sh`, `restore-test.sh`, `restore.sh`, rotation du mot de passe
  PostgreSQL de l'API (ancien refusé, nouveau accepté), révocation de toutes les sessions, `relais.js creer`,
  `zap.sh`, `charge.js`.
- Limite relevée et documentée : **une seule version active** par clé de chiffrement (messages, récitations,
  signature des certificats) — une rotation rendrait illisibles les données existantes ; trousseau à plusieurs
  versions à développer avant la première rotation (ADR 0004).
- `infra/prod/restore-test.sh` : une sauvegarde vide ou incomplète donne un « ÉCHEC » lisible (au lieu d'une
  erreur SQL brute qui arrêtait le script).
- **ADR** (`docs/adr/`) : 0002 relais d'école, 0003 signature des certificats, 0004 messagerie chiffrée, 0005
  codes d'activation, 0006 catalogues de langues à la demande — contexte, décision, conséquences, options
  écartées, preuves.

---

## 30/09/2026 — Complément C : documents pour le juriste, brouillons (branche `suite-v1-b`)

- `docs/juridique/` — chacun marqué **« BROUILLON — à valider par un juriste »**, rédigé à partir du code :
  `REGISTRE_TRAITEMENTS.md` (article 30 : 13 traitements, finalité, base légale **proposée**, données, durées
  réelles de `purge.ts` et décisions D9/D11, destinataires, transferts), `AIPD_BROUILLON.md` (mineurs, voix,
  tuteur IA, relais, messagerie : risques, mesures en place avec leurs fichiers de preuve, reste à faire),
  `CDP_SENEGAL.md` (formalités probables auprès de la CDP, pièces à préparer, ce que l'application fait déjà ;
  articles de la loi 2008-12 à vérifier), et en **langage simple** : `CONFIDENTIALITE_PARENTS.md`,
  `CONFIDENTIALITE_ADOS.md`, `CGU_PARENTS.md`, `CGU_ADOS.md` (fidèles au code : surnom et année de naissance,
  voix 7 jours, récitation envoyée 1 à 30 jours, tuteur simulé et désactivé par défaut, aucun échange entre
  élèves, aucun classement, jamais d'ijāza, paiement simulé).
- Point relevé pour le juriste : l'usage du Coran peut révéler une **conviction religieuse** (donnée sensible) ;
  aucun consentement explicite à ce titre dans le code → **D18**.
- Les pages légales de l'application (`apps/web/src/lib/legal/content.ts`, lot 14) ne sont pas modifiées : à
  remplacer par les textes validés.

---

## 30/09/2026 — Complément B (relais d'école) : e2e Docker Compose et matériel (branche `suite-v1-b`)

- **Test de bout en bout** `infra/ci/test-relais.sh` (ajouté à la CI, job « images ») : central monté par le
  vrai `deploy.sh` (site `central.test`, HTTPS par l'autorité locale de Caddy), relais enregistré (`relais.js
  creer`), installé par le vrai `infra/relais/install.sh` (fichiers seulement) et lancé par
  `infra/relais/compose.yml`. Scénario : inscription et envois en ligne → **coupure du réseau** (entrée du
  central arrêtée) : leçon servie depuis la copie du relais, envois mis en file (réponse 202), lot répété par la
  tablette **fusionné** par le relais, lot qui en chevauche un autre → **coupure de courant** du relais
  (redémarrage : file chiffrée gardée) → **retour du réseau** : la file part seule, **8 événements au central,
  chacun une fois** (aucune perte, aucun doublon), aucun envoi refusé, envoi normal ensuite. Vert ici.
- **Matériel** `docs/projet/RELAIS_MATERIEL.md` : mini-PC N100 conseillé en 2026 (le Raspberry Pi 5 8 Go coûte
  ≈ 200 $ la carte seule après la pénurie de mémoire), SSD plutôt que carte SD, onduleur 700 VA, routeur
  Wi-Fi 6 ; prix datés et sourcés, tous « à vérifier » ; consommation ≈ 23 W (≈ 200 kWh par an jour et nuit).
  Décision du client : **D17**.

---

## 30/09/2026 — Complément A (sécurité) : ZAP, CSP stricte, restauration testée (branche `suite-v1-b`)

- **Instance complète dans le conteneur cloud** : démon Docker démarré, images construites (Docker Hub limité
  → images de base prises sur `mirror.gcr.io` ; copie locale du Dockerfile, hors dépôt, pour passer apt et npm
  par le mandataire du conteneur), instance montée par le **vrai** `deploy.sh --demo` (nouveaux réglages
  `AWFORM_DEPLOY_BUILD=0`, `AWFORM_DEPLOY_SYSTEME=0`, `AWFORM_VERSION` respecté).
- **Défauts réels trouvés et corrigés** : (1) le **travailleur ne démarrait pas** sous son compte à droits
  minimaux (pg-boss créait son schéma) → `createSchema: false`, test sous le vrai compte avec témoin
  (6e4aa0a) ; (2) `deploy.sh --demo` échouait (clé du second facteur absente du périmètre « outils ») → clé
  donnée à la seule exécution de démonstration ; (3) le script de démonstration n'envoyait pas le code parent
  (SEC-3, MIN-4) → corrigé, et test qui exécute la démonstration de bout en bout, deux fois (13c89c1).
- **ZAP baseline** (`docs/projet/ZAP.md`, `infra/securite/zap.sh`, règles `zap-regles.tsv`) : HTTP, HTTP avec
  araignée AJAX, HTTPS → **0 échec** ; 5 alertes faibles ou d'information, analysées (faux positifs ; injection
  vérifiée à la main sur le lecteur coranique) ; avec les règles : 0 avertissement.
- **CSP stricte** : `style-src 'self'` (plus de `unsafe-inline` ; attributs `style` seuls permis par
  `style-src-attr`), `script-src 'self'` + nonce/empreinte du seul script de démarrage, `media-src blob:`
  (l'audio des récitations en `blob:` était bloqué), `form-action`, `worker-src`, `manifest-src` ; tests
  `csp.test.ts` (3) et e2e `securite.spec.ts` (en-têtes de l'API et des pages ; aucune violation sur 12
  écrans de la famille et l'espace enseignant, avec témoin) — verts sur téléphone et ordinateur (00eff17).
- **Restauration testée** : `infra/prod/restore.sh` (restauration complète, confirmation explicite, clé privée
  par l'entrée standard) et `infra/ci/test-restauration.sh` (instance jetable → comptes de toutes les tables →
  `backup.sh` → base supprimée et vérifiée vide → `restore.sh` → comparaison table par table → fumée), ajouté à
  la CI. Mesuré : **64 tables, 7 395 lignes identiques** (5c8ac84).
- Tests : worker +3, API +2 (démonstration), web +3 (CSP) ; e2e +3.

---

## 30/09/2026 — Tableau de bord « école » et revue adverse (branche `suite-v1-b`)

- **Synthèse de mes classes** (CDC §2.9, ligne « École ») : `GET /api/v1/ecole/synthese`
  (`apps/api/src/ecole-synthese.ts`), page `/enseignant/ecole` (lien depuis l'espace enseignant) — par classe :
  effectifs (application / papier), élèves actifs sur 7 jours et taux d'activité, devoirs en cours, copies à
  corriger, certificats délivrés (non annulés), récitals publiés ; ligne de total. **Des comptes seulement** :
  aucun nom d'élève, aucun élève comparé aux autres ; chaque enseignant ne voit que SES classes. **Pas de rôle
  « direction »** : décision du client (D15). 14 textes dans les cinq langues.
- **Revue adverse du diff** (sécurité, mineurs, RGPD) : routes du récital et de la synthèse derrière le second
  facteur de l'enseignant et la propriété de la classe, famille limitée à ses profils, aucun texte coranique,
  aucune ijāza ni classement ; nouvelles tables dans l'export RGPD et effacées avec le profil (test). Un défaut
  trouvé et corrigé : le lanceur de charge pouvait créer des comptes sur une adresse distante → refus hors
  `127.0.0.1` / `localhost` sauf `AWFORM_CHARGE_INSTANCE_DE_TEST=1` (test `allowedTarget`).
- Tests : API +5 (synthèse 4, garde-fou 1), web +1 ; a11y enseignant (dont `/enseignant/ecole`) vert. Total
  unitaires **574 verts** ; budget 112,6 Ko (≤ 150), toutes les pages 229,1 Ko (≤ 300).

---

## 30/09/2026 — QUA-3 : découpage des gros modules, sans changement de comportement (branche `suite-v1-b`)

- Un commit par fichier : `app.ts` 513 → 192 lignes (`contenu.ts` : niveaux, leçons, paquets, page publique du
  QR ; `progression.ts` : tentatives, progression, tableau de bord ; `routes-common.ts`) — e2c2a71 ;
  `auth/routes.ts` 1 000 → 513 (`auth/profils.ts` : profils et code parent ; `auth/donnees.ts` : droits RGPD,
  export, suppression ; `auth/common.ts` : constantes et `AuthKit`, gardes transmises telles quelles) —
  974a090 ; `school.ts` 1 063 → 823 (`school-certificats.ts`, `school-common.ts`) — 65d77ea ; page de la classe
  1 345 → 1 045 (`CertificatsClasse.svelte`, `EcouteClasse.svelte`) — 03dec20 ; lecteur de leçon 1 057 → 995
  (`LettresLecon.svelte`) — 30caf97.
- Preuves : liste des 150 routes (méthode + chemin, extraite des sources) identique avant et après chaque
  découpage de l'API ; 568 tests unitaires verts à chaque étape ; e2e des écrans touchés (écoute lot 16, a11y
  enseignant avec tous les onglets, récital, messagerie, validation de hifẓ) et nouveau `qua3.spec.ts` (cartes
  des lettres conformes aux données) : verts ; budget 112,4 Ko (≤ 150), toutes les pages 227,3 Ko (≤ 300).
- Seule différence observable : sur la page de la classe, la liste des certificats et celle des récitations
  sont chargées à l'ouverture de leur onglet (et non plus au chargement de la page) — même contenu affiché.
- Reste : `packages/content/src/importer.ts` (706 lignes), à découper dans un lot suivant.

---

## 30/09/2026 — Récital de hifẓ (V1-e) : écran de séance (branche `suite-v1-b`)

- **Principe** (CDC §2.6-6) : séance planifiée par l'enseignant pour sa classe (carnet de hifẓ du niveau de la
  classe) ; pour chaque élève, le **serveur tire au sort** (crypto) 3 passages du socle, + 1 du renforcé au
  parcours renforcé ; tirage gardé, jamais refait ; l'élève ajoute un passage **au choix, pris dans le carnet**.
  L'enseignant saisit les compteurs du barème (aides, hésitations, sauts, oublis, fautes claires et discrètes,
  fluidité, second récitant présent) → note /20 et mention par le **code existant** (`note`, @awform/hifz),
  note Coran /15 = récital × 0,75 (`coranNote15`, au quart de point).
- **Publication** : résultat officiel figé (publication atomique) ; chaque passage d'un récital validé « oui »
  devient une validation de l'enseignant (journal de hifẓ du profil, ou résultat papier sans jamais écraser une
  validation acquise) et **ouvre l'attestation de hifẓ** existante (lot 13, signée et vérifiable, lot 20).
- **Famille** (`/recital`, lien depuis « Mon compte ») : ses passages tirés, résultat après publication ; profil
  enfant : l'étoile et une phrase positive, la note repliée « pour le parent » (CDC §2.6-5). Jamais les autres
  élèves, aucun classement (liste par nom), jamais d'ijāza, aucun texte coranique (nom de sourate + numéros).
- Code : `packages/hifz/src/recital.ts`, `apps/api/src/recital.ts`, migration `0024_recital_hifz.sql` (tables
  classées dans `roles.ts`), export RGPD `recitalsDeHifz`, effacement en cascade ; web `lib/recital.ts`,
  `RecitalClasse.svelte` (onglet « Récital »), `routes/recital` ; 40 textes dans les cinq langues (es/de/ar à
  relire, D14). Décisions : **D16** (report de la note /15 dans la décision de fin de niveau, récital « à
  consolider »), **D15** (rôle école/direction, pour l'étape suivante).
- Tests : hifz +4, API +10 (`recital.test.ts`), web +9 ; e2e `recital.spec.ts` et onglet « Récital » dans
  `a11y.spec.ts` : verts (téléphone et ordinateur). Total unitaires : **568 verts** ; budget 112,2 Ko (≤ 150),
  toutes les pages 227,0 Ko (≤ 300).

---

## 30/09/2026 — Lot 24 (V1-h, stabilisation) : charge et accessibilité (branche `suite-v1-b`)

- **Test de charge** : scénario k6 `infra/charge/k6.js` (seuils p95 < 500 ms par route, < 1 % d'erreurs) et,
  k6 n'étant pas installable ici, **lanceur Node sans dépendance** `apps/api/src/cli/charge.ts` (fetch en
  parallèle, p50/p95/max, code de sortie 1 au-delà de l'objectif ; mode d'emploi `infra/charge/README.md`).
- **Mesures** (conteneur cloud : 4 vCPU Intel Xeon 2,1 GHz, 15 Go, PostgreSQL 18.4 local, Node 24, API seule sur
  la même machine que le générateur de charge, journal des requêtes actif, contenu synthétique ; 15 s par route) :

  | route | 20 utilisateurs : p50 / p95 (ms) | 100 utilisateurs : p50 / p95 (ms) |
  |---|---|---|
  | GET /health | 4,6 / 9,3 | 24 / 37,3 |
  | GET /units/:id | 21,7 / 29,5 | 113,2 / 143,1 |
  | GET /today/:id | 39,5 / 50 | 203,4 / 251,7 |
  | POST /attempts (5 événements) | 29,2 / 45,8 | 152,4 / 184,8 |
  | GET /famille/messages | 17,8 / 29,6 | 90,2 / 133,3 |
  | POST /auth/login | 152,3 / 186,4 | 749 / **805,1** |

  Aucune erreur. Objectif tenu partout, sauf la connexion à 100 connexions SIMULTANÉES (argon2id, 19 Mio et
  2 passes, volontairement coûteux : ≈ 130 connexions/s sur 4 cœurs). Situation peu réaliste pour une école ;
  à refaire sur le serveur de production (même commande).
- **RGAA** : grille `docs/projet/RGAA.md` (13 thématiques, état et preuve par critère ; « à vérifier » là où
  seul un audit manuel peut conclure). Défauts corrigés : **lien d'évitement** « Aller au contenu » (12.7,
  cinq langues), **focus visible** étendu aux champs, listes, `summary`, `[tabindex]` (10.7), **titre des
  tableaux** (5.4, `aria-labelledby` / `aria-label`). Non conforme restant : 12.1 (un seul système de
  navigation).
- **Tests automatiques** : `rgaa.test.ts` (5 contrôles statiques) ; `a11y.spec.ts` étendu (`/messages`,
  `/sourates`, `/activation`, tous les onglets de la classe, interface en **arabe**, lien d'évitement au
  clavier) : **vert** sur téléphone et ordinateur (0 violation grave) ; `charge.test.ts` (4).
- Tests : **545 verts** (API 195, web 108, …), lint, typage, garde-fous ; budget : page la plus lourde 111,5 Ko
  (≤ 150), toutes les pages 223,0 Ko (≤ 300).

---

## 30/09/2026 — Suite V1-b, étape A : e2e Playwright exécutés dans le conteneur cloud (branche `suite-v1-b`)

- **Environnement** : PostgreSQL 18.4 (binaire du paquet npm `@embedded-postgres/linux-x64`, `/opt/pg18` ; le
  PostgreSQL 16 d'Ubuntu n'a pas `uuidv7()`), Node 24 (le hachage `crypto.argon2` n'existe pas en Node 22),
  Chromium 1194 déjà présent (Playwright attend 1243, aucun téléchargement) : nouvelle variable **`E2E_CHROMIUM`**
  dans `playwright.config.ts` (chemin de l'exécutable) ; sans elle, rien ne change sur la VM.
- **`suite-v1.spec.ts` : 3/3 verts** (ordinateur et téléphone). Deux défauts du SCÉNARIO corrigés, pas du code :
  heure de la visio calculée dans le fuseau de Node (UTC) au lieu de celui du navigateur (Europe/Paris) → séance
  2 h dans le passé, donc invisible (l'API ne montre que les séances non terminées) : heure maintenant calculée
  dans la page ; « AWZ-0000-0000-00000 » a un caractère de contrôle JUSTE (somme nulle) → « code inconnu » au lieu
  de « mal saisi » : remplacé par « AWZ-0000-0000-00001 » (contrôle faux).
- **`lot16.spec.ts` (récitation)** : le scénario inscrivait l'enfant à la classe sans code parent, exigé depuis
  l'audit SEC-3 → en-tête `x-parent-pin` ajouté ; vert.
- **Autres e2e sur le contenu synthétique** (téléphone, avant arrêt volontaire du lancement complet) :
  passent sans les livres : a11y (visiteur, parent, enseignant), captures lots 3-6, 10, 12, 14, 16, comptes
  (sauf 37), exercices 25 et 38, hifz 115 et 144, hors-ligne 35, 69, 106, lot10, lot11 38 et 51, lot12, lot14,
  lot15 10 et 66, lot16 106, lot6 23, 77, 115, 135, lot8 106, lot9 94. **Dépendent des vrais livres**
  (exercices, leçons, niveaux re/ra/ado, modèles de certificats, carnets N1) : a11y 55, bilans, captures 12, 211,
  250, 341, 380, 460, comptes 37, exercices 11, hifz 27 et 58, hors-ligne 7, leçons, lot11 11, lot13, lot15 35,
  lot16 118, lot6 97, lot8 19, 61, 72, lot9 12 → **à lancer sur la VM**.
- **Carnet de pratique en e2e : non ajouté**. Le carnet ne s'affiche que dans une leçon de sciences religieuses
  (`ReligionLesson`, niveaux `re*`/`ra*`) ; le contenu synthétique n'en a pas, et en créer un demanderait
  d'inventer une leçon religieuse (interdit). Couverture : API `lot22.test.ts` (5), web `carnet.test.ts` ; e2e à
  écrire sur la VM avec les vrais livres (re1).
- Commande : dans `apps/web`, `E2E_CHROMIUM=/opt/pw-browsers/chromium TEST_DATABASE_URL=… AWFORM_CONTENT_DIR=
  <racine>/infra/ci/contenu-synthetique AWFORM_LEVELS=en1,ad1 npx playwright test e2e/suite-v1.spec.ts`.
- CI : `suite-v1-b` ajoutée aux branches vérifiées. Tests unitaires : 536 verts (inchangés).

---

## 30/09/2026 — Lot 21, complément : écran de modération (branche `suite-v1`)

- Page d'administration : file des messages signalés (`ModerationAdmin.svelte`), « classer » ou « retirer »
  (texte et pièce jointe effacés, trace gardée) ; chaque ouverture de la file est journalisée par le serveur.
  Textes dans les cinq langues (es, de, ar à relire).
- Tests : web 103 verts (`messagerie.test.ts` : appels de modération) ; l'API était déjà couverte par
  `lot21.test.ts`.

---

## 30/09/2026 — Lot 25 : interface en espagnol, allemand et arabe (RTL), à relire (branche `suite-v1`)

- **Traductions** des 1 393 textes d'interface en espagnol, allemand et arabe (interface seulement : ni le
  contenu des livres, ni l'arabe étudié, ni le Coran), statut « en préparation », **à relire par un locuteur
  natif** (`apps/web/src/lib/i18n/A_RELIRE.md`, D14). Contrôle automatique : mêmes clés et mêmes arguments ICU
  que le français, MessageFormat valide (`scripts/verifier-traduction.mjs`, test i18n).
- **Arabe de droite à gauche** : `dir="rtl"` sur toute la page, police arabe pour l'interface, marges, bordures
  et alignements en propriétés logiques (`inline-start` / `end`).
- **Poids** : les catalogues (anglais compris) sortent du JavaScript et deviennent des fichiers statiques
  `static/i18n/<langue>.json`, téléchargés seulement si la langue est choisie ; le service worker ne les
  précharge plus (gardés au premier usage). JavaScript de toutes les pages : 243,6 → 222,2 Ko (≤ 300) ; page la
  plus lourde 111,1 Ko (≤ 150).
- Tests : web 101 verts (i18n : langues en préparation, RTL, signalement « à relire »).

---

## 30/09/2026 — Lot 23 (V1-g) : codes d'activation imprimés dans les livres (branche `suite-v1`)

- **Codes** (`packages/billing/src/activation.ts`) : `AWZ-XXXX-XXXX-XXXXC`, alphabet de Crockford (sans I, L, O,
  U), caractère de contrôle (faute de frappe refusée sans compter d'essai), saisie tolérante (minuscules, espaces,
  O→0), empreinte SHA-256 seule en base.
- **Administration** (`apps/api/src/activation.ts`, migration `0023_codes_activation.sql`) : lot par niveau
  (1 à 5 000 codes, 1 à 24 mois, date limite facultative), administrateur avec second facteur, codes en clair
  renvoyés une seule fois (fichier CSV pour l'imprimeur), suivi utilisés / révoqués, révocation d'un lot perdu.
- **Saisie** (page `/activation`, lien depuis l'abonnement) : compte parent ou adulte (titulaire mineur : parent
  requis), usage unique atomique, anti-essais (5 codes inconnus → verrou), l'accès s'ajoute à la fin de l'accès
  en cours ; le niveau entier s'ouvre (leçons et paquet hors ligne) quand les droits sont appliqués
  (`AWFORM_DROITS=on`). Export RGPD complété.
- Aucun paiement réel : le paiement reste simulé (D13 pour les prix et le circuit de l'imprimeur).
- Tests : API 191 verts (12 sautés), dont `lot23.test.ts` (5) ; billing 21 (dont `activation.test.ts`, 6) ; web
  99 (dont `activation.test.ts`, 6).

---

## 30/09/2026 — Lot 22 (V1-c) : carnet de pratique signé par le parent, suivi des sourates (branche `suite-v1`)

- **Carnet de pratique** (`apps/api/src/carnet.ts`, migration `0022_carnet.sql`) : lignes et jours repris de
  l'exercice `carnet` du livre (édition servie, rien de saisi) ; l'enfant coche ses cases de la semaine ; le
  parent **signe avec son code parent, vérifié par le serveur** (compte parent, code défini — D12) ; la semaine
  signée est close ; signature journalisée. Jamais de note ; rappel « le carnet sert à encourager ».
- **Suivi des sourates** : liste tirée des livres (`book.js` → `sourates`, lecture tolérante, 1-114) ; la famille
  coche « j'écoute », « je répète », « je récite seul » ; seul l'enseignant de la classe valide (onglet
  « Sourates ») ; rappel quand la sourate est entièrement acquise dans le carnet de hifẓ ; le texte n'est jamais
  reproduit (renvoi au lecteur, noms Tanzil).
- **Écrans** : carnet interactif dans la leçon de Religion (`CarnetPratique.svelte`), page `/sourates`, onglet
  de classe `SouratesClasse.svelte`. Export RGPD complété (cases, signatures, suivi).
- Tests : API 186 verts (12 sautés), dont `lot22.test.ts` (7) ; web 93 verts, dont `carnet.test.ts` (9) ;
  budget : page la plus lourde 110,7 Ko ≤ 150 (le carnet s'ajoute à la leçon).
- À vérifier sur la VM : format réel de `sourates` dans les `book.js` de Religion, exercices `carnet` réels.

---

## 30/09/2026 — Lot 21 terminé (V1-f) : messagerie encadrée, annonces, visio (branche `suite-v1`)

Branche `suite-v1` créée depuis `corrections-audit` (laissée intacte, en attente de vérification).

- **API** (`apps/api/src/messagerie.ts`) : annonces de classe (sans réponse collective) ; un fil privé par enfant
  et par classe entre l'enseignant et le parent ou l'adulte ; corps chiffrés AES-256-GCM (`AWFORM_MESSAGE_KEY`,
  créée par `deploy.sh`) ; pièces jointes de l'enseignant seulement (PNG, JPEG, PDF reconnus à leurs octets, 2 Mo) ;
  liens raccourcis refusés ; lecture seulement tant que l'enfant est dans la classe ; signalement avec le numéro
  d'aide du pays ; modération par l'administrateur (TOTP, consultation journalisée, retrait qui efface le texte).
- **Protection des mineurs (§2.12)** : aucun compte adolescent dans la messagerie (`parent_requis`), l'enseignant
  écrit au parent (`famille_mineure`) ; aucune messagerie entre élèves ; aucune notification (donc rien entre
  21 h et 7 h). Fil enseignant ↔ adolescent visible du parent : V2.
- **Visio** : séances planifiées (https, service reconnu), lien donné 15 min avant le début et jusqu'à la fin,
  annulation, présence.
- **Écrans** : onglet « Messages et visio » de la classe (`MessagerieClasse.svelte`), page `/messages` des familles
  (lien depuis le compte). Textes fr/en.
- **Conservation** : messages purgés chaque nuit après l'année scolaire suivante (D11, à valider).
- CI : `suite-v1` ajoutée aux branches vérifiées.
- Tests : API 179 verts (12 sautés, livres réels), dont `lot21.test.ts` (8) ; web 84 verts, dont
  `messagerie.test.ts` (11) ; budget 103,8 Ko ≤ 150.

---

## 29/09/2026 — Corrections d'audit : fin des majeurs (tuteur) et constats mineurs (branche `corrections-audit`)

- **Tuteur IA** (avant toute activation réelle) : CON-4 (Coran déguisé : séparateurs invisibles, ۝, balises,
  formes de présentation), CON-5 (avis, numéros de hadith, phonétique reconnue à sa forme), CON-6 (texte libre
  seulement avec « question »), CON-7 (une demande à la fois par profil : plafond tenu), CON-8 (oracle indépendant
  du filtre, contournements injectés par le fournisseur hostile : **1 147 cas, 0 violation**), CON-9 (mise en
  service seulement avec un rapport **signé**, complet, récent, même filtre), CON-10 (chevrons échappés), CON-11
  (texte d'un enfant jamais stocké, classé pour sa protection), CON-12 (classifieur : forme compacte, faux
  positifs corrigés ; wolof à compléter avec un référent).
- **Sécurité** : SEC-6 (ressaisie du mot de passe limitée), SEC-7 (`deploy.sh --production` : HTTPS obligatoire,
  cookie Secure), SEC-8 (événements bornés, schémas fermés).
- **Mineurs, RGPD** : MIN-9 (retrait des rappels effectif), MIN-10 (voix d'un enfant : code parent obligatoire),
  MIN-11 (retrait du partage = départ complet, récitations comprises), MIN-12 (administrateur sans texte ni
  pseudonyme d'enfant), MIN-13 (journaux sans identifiants ni IP complète), MIN-14 (adresse libérée dès la
  suppression), MIN-15 (pays ISO 3166-1).
- **Hors ligne, métier** : OFF-4 (403/404 : la file attend ; portail captif ; stockage plein signalé), OFF-7
  (conflit d'identifiant : renvoi sous un nouvel identifiant), MET-3 (rejeu, mois d'essai, barème), MET-4 (jalons,
  migration Leitner).
- **Paiements** : PAY-5 (un essai par compte, index unique, migration `0021`), PAY-6 (mot de passe exigé à
  l'achat sans code parent), PAY-7 (rotation du secret Stripe).
- **Infrastructure** : INF-3 (actions épinglées par empreinte, Dependabot), INF-4 (0 vulnérabilité, `pnpm audit`
  en CI), INF-10 (sauvegarde avant migration, retour automatique à la version précédente), INF-11 (shellcheck
  bloquant) ; A11Y-1 (cibles de 44 px au moins).
- **Reportés** (raisons dans `CORRECTIONS_AUDIT.md`) : INF-5 (empreinte Gradle : site bloqué ici), QUA-3
  (découpage des gros modules, lot dédié), CDC-2 en partie (WebKit, k6, ZAP, couverture).

### Rectificatifs (audit CDC-1) — chaque chiffre suivi de la commande qui le produit

| Affirmation antérieure | État vérifié le 29/09/2026 (branche `corrections-audit`) | Commande |
|---|---|---|
| « application ≈ 59 Ko de JavaScript » (lot 3) | faux depuis le lot 9 ; aujourd'hui **JavaScript initial de la page la plus lourde 103,2 Ko** (≤ 150), total de toutes les pages ≈ 232 Ko | `pnpm --filter @awform/web build && pnpm --filter @awform/web budget` |
| « aucune normalisation (interdite par la CI) » | le contrôle ne pouvait pas échouer ; il échoue maintenant (QUA-1) | `bash infra/ci/garde-fous.sh` |
| « la CI exécute la base et la batterie » | vrai depuis les corrections INF-1/INF-2 ; CI **entièrement verte** sur `corrections-audit` | GitHub Actions, branche `corrections-audit` |
| « droits activés par `AWFORM_DROITS=on` » | vrai depuis PAY-4 (leçons et paquet hors ligne) | `apps/api/test/audit-pay4.test.ts` |
| « réponses d'épreuve jamais sur l'appareil » | vrai depuis CON-1 / D7 | `apps/api/test/audit-con1.test.ts` |
| « enregistrements effacés à 7 jours » | vrai depuis MIN-16 (démarrage, service worker) et OFF-3 (déconnexion) | `apps/web/src/lib/recordings.test.ts` |
| « export complet » | vrai depuis MIN-6 (toutes les tables liées, découvertes depuis le schéma) | `apps/api/test/audit-rgpd.test.ts` |
| « batterie : critères bloquants verts » | la batterie était circulaire ; depuis CON-8 : **1 147 cas**, oracle indépendant, 0 violation | `node packages/tutor/dist/cli/eval.js --fournisseur simule` |
| « migrations 0000 → 0009 » | **0000 → 0021** (22 fichiers) | `ls packages/db/migrations/*.sql` |
| « 1 110 messages anglais » | **1 303** clés, identiques en français | clés de `apps/web/src/lib/i18n/messages/en.json` |
| « 832 tests automatiques » | invérifiable sans les livres ; sans les livres (conditions de la CI) : **488 verts, 37 sautés** | `pnpm -r --no-bail --workspace-concurrency=1 test` (avec `TEST_DATABASE_URL`) |

Le brief d'audit (branche `audit-dossier`, non modifiée ici) reprend certaines de ces affirmations : **à corriger
par le chef de projet** avant toute diffusion, avec ce tableau.

---
## 29/09/2026 — Corrections d'audit, blocs 1 à 10 (branche `corrections-audit`, partie de `lot21-wip`)

Nouvelles fonctionnalités arrêtées ; chaque constat a son test (rouge avant, vert après) et son commit (identifiant en
tête du message) ; état détaillé : `docs/projet/CORRECTIONS_AUDIT.md`.

- **Examens et certificats** : CON-1 (projection d'épreuve sur le chemin de production), MET-1 (note du premier
  essai), MET-2 (certificat bloqué si le contrôle continu est partiel, sauf confirmation), D6, D7.
- **Hors ligne et relais** : OFF-1 (aucun envoi confirmé perdu), OFF-6 (quotas, cookie exigé, quarantaine), OFF-2
  (un événement hors bornes refusé seul ; l'appareil coupe le lot et met l'événement fautif en quarantaine après
  3 cycles), OFF-3 (déconnexion : envoi tenté, voix et cartes effacées, réponses d'un autre compte gardées),
  OFF-5 (horodatage borné à 90 jours, jours, sourates et versets vérifiés).
- **Mineurs** : MIN-1, MIN-2, MIN-3, MIN-4, SEC-3, MIN-17.
- **Sécurité** : SEC-1 (secret TOTP « en attente »), SEC-2 (essais réservés atomiquement), SEC-4 (contrôle global du
  second facteur), SEC-5 (code TOTP consommé une fois), INF-6 (`X-Forwarded-For` non falsifiable).
- **RGPD** : MIN-5 (suppression : l'élève quitte aussitôt ses classes), MIN-6 (export de toutes les tables liées,
  découvertes depuis le schéma), MIN-7 (e-mail haché dans les verrous, journal pseudonymisé à l'effacement), MIN-8
  (durées de conservation, D9), MIN-16 (voix locales de plus de 7 jours effacées au démarrage).
- **Contenu religieux** : CON-2 (projection élève par motif, champs retirés signalés à l'import, fuite = import
  refusé), CON-3 (numéros de hadith masqués quelle que soit la graphie ; sans registre, aucun numéro ; versets jamais
  touchés). **À vérifier sur les vrais livres (VM)** : liste des champs retirés (avertissements
  `champ_retire_eleve`) et graphies des références.
- **Qualité** : QUA-1 (garde-fou « aucune normalisation » qui échoue vraiment, ESLint sur toutes les formes), QUA-2
  (batterie au nombre exact de 1 081 cas, travailleur testé, test de concurrence).
- **Exploitation** : INF-7 (sauvegarde partielle jamais gardée), INF-8 (copie hors site prête, D10 ; état et
  alerte de restauration à 35 jours), INF-9 (réglages de démonstration retirés sans `--demo`).
- **Performance** : PERF-1 — budget tenu : JavaScript initial de la page la plus lourde **102,9 Ko** (≤ 150),
  total 231,7 Ko (≤ 300, provisoire) ; anglais chargé à la demande ; police du Coran préchargée seulement avec des
  versets. **La CI est entièrement verte** (le budget ne bloque plus).
- **Paiements** : PAY-1 (validation atomique, index unique, migration `0020`), PAY-2 (seul un abonnement en cours
  s'annule), PAY-3 (Stripe : droits sur paiement encaissé, pas de mois offert), PAY-4 (droits appliqués aux leçons
  et au paquet hors ligne avec `AWFORM_DROITS=on`).
- **Tests** (conditions de la CI : PostgreSQL 18, contenu synthétique, sans les livres) : **418 verts, 37 sautés**
  (tests « livres réels » et Playwright, qui demandent `~/awform-content`). Build, typage, lint, garde-fous verts.

---
## 29/09/2026 — Lot 21 (V1-f) : PARTIEL — schéma de la messagerie encadrée et de la visio (branche `lot21-wip`)

Arrêté sur décision du chef de projet (audit général : 9/20, 73 constats → corrections d'abord). Livré : migration `0018_messagerie_visio` — `message_thread` (fil privé enseignant ↔ famille, toujours à propos d'un élève inscrit), `message` (privé ou annonce, corps et pièce jointe prévus CHIFFRÉS AES-256-GCM, retrait par la modération), `message_read`, `message_report` (file de modération), `video_session` (lien externe, durée 10-240 min), `video_presence` ; droits de l'API dans `roles.ts` (le test « chaque table a des droits décidés » reste vert). **Non faits** : routes, chiffrement, pièces jointes, modération, conservation 12 mois, écrans, tests fonctionnels. `ECARTS.md` : V1-f « partiel ». Tests (conditions de la CI) : inchangés, verts.

---
## 29/09/2026 — Décisions D6, D7 et CI sur les branches de travail (branche `lot21-wip`)

- **D7** : la projection ÉLÈVE des bilans et examens ne contient plus **aucun corrigé** (`studentProjection` applique la projection d'épreuve ; « relier » en colonnes gauche/droite décalées) ; l'entraînement sur un bilan recueille les réponses sans correction sur l'appareil (`ExamExercise`) et le serveur corrige item par item (`POST /api/v1/units/:id/corriger`, `gradeTraining` : juste/faux, jamais la bonne réponse) ; les réponses passent aussi par la file habituelle (progression) ; **l'examen** ne se passe qu'en épreuve notée. Prend effet au prochain import (l'empreinte d'édition inclut la version de l'application).
- **CDC §2.8** : pendant une session d'épreuve ouverte, le **texte non préparé est révélé à l'élève** (option `revealUnprepared`, sans traduction pour un examen) ; jamais hors session (corrige le lot 19, qui le réservait à l'enseignant).
- **D6** : grille des parties « enseignant » lue dans `guide.bareme` (`bookGrid`, format tolérant), une note par partie, maximum = total de la grille ; saisie libre sinon. Format réel à confirmer sur les vrais livres.
- **CI** : déclencheur `push` aussi sur `lot*-wip` et `corrections-audit`.
- **Environnement cloud** : après un redémarrage du conteneur, le shell reprenait Node 22 (argon2 de `node:crypto` absent → erreurs 500 dans les tests) ; Node 24 fixé dans les profils du shell.
- **Tests** : `d7.test.ts` 3, `exam.test.ts` +1, `lot19.test.ts` +1 et mis à jour (texte révélé en session, aucun corrigé hors épreuve, grille du livre). Conditions de la CI : **346 verts, 37 sautés**.

---
## 29/09/2026 — Lot 20 (V1-e) : certificats signés et vérifiables par QR (branche `lot20-wip`, partie de `lot19-wip`)

- **Signature** (`apps/api/src/certsign.ts`) : Ed25519 ; la graine privée `AWFORM_CERT_SIGN_KEY` (« v1:<64 hex> », générée une fois par `deploy.sh`) n'existe que dans le **périmètre de l'API** (`env-scopes.conf`) ; clé publique et identifiant de clé publiés (`GET /api/v1/public/certificats/cle`) pour une vérification hors ligne. La signature porte sur les **champs du registre durable** (numéro, type, niveau ou passage, nom affiché, mention, date) : elle reste valide après la réduction du document à 30 jours.
- **Base** (migration `0017_certificats_verifiables`) : `verif_code` (12 caractères aléatoires sans ambiguïté, unique), `signature`, `key_id`, `revoked_at`, `revoke_reason`. Code et signature posés **une seule fois** : à la délivrance, ou à la première lecture par l'enseignant pour les certificats délivrés avant ce lot.
- **Vérification publique** : `GET /api/v1/public/certificats/:numero?c=<code>` — registre seulement (jamais le document complet), état valide / **annulé** (date, motif), signature valide / invalide / absente ; un numéro inconnu et un mauvais code reçoivent **la même réponse** (pas d'énumération du registre) ; **20 essais faux par heure et par adresse** puis 429. Page `/verifier/[numero]` rendue sur le serveur, **sans JavaScript**, CSP stricte, `no-store`, `noindex` ; l'adresse du visiteur est transmise à l'API (`ADDRESS_HEADER`/`XFF_DEPTH` de l'image web) pour que la limite ne touche pas tout le monde.
- **Enseignant** : QR (bibliothèque `qrcode-generator`, MIT, sans dépendance) et code imprimés en bas du certificat A4 ; **annulation** avec motif (enseignant qui l'a délivré ou de la classe), journalisée.
- **Décision D8** (juriste, domaine définitif, rotation de clé) ajoutée.
- **Tests** : `lot20.test.ts` **6** (Ed25519 : champ changé ou autre clé → invalide ; codes ; pose unique ; vérification ; même réponse inconnu/mauvais code ; registre modifié en base → signature invalide ; annulation et motif ; clé publique ; limite d'essais) ; web : QR (1) et page publique (2 : échappement, aucun script, bandeaux). Conditions de la CI : **341 verts, 37 sautés**. Build, typage, lint verts.

---
## 29/09/2026 — Lot 19 (V1-b) : épreuves notées — bilans /20, examens /100, textes non préparés, remédiation (branche `lot19-wip`, partie de `lot18-wip`)

- **Notation serveur** (`packages/grading/src/exam.ts`, fonction pure) : la copie est corrigée avec les mêmes vérifications d'items que l'entraînement (`checkItem`), une réponse par item ; « chasse » / « contient » : +1 par case juste, −1 par case touchée à tort, plancher 0 (sinon tout toucher donnerait le maximum) ; réponses mal formées ignorées ; note sur le barème arrondie au demi-point ; **remédiation sous 8/20** ramené au barème. Règles provisoires : décision **D6**.
- **Base** (migration `0016_epreuves`) : `exam_session` (classe, unité, barème 20|100, ouverture, fermeture, `seed` jamais transmis) et `exam_submission` (une copie par élève et par session : réponses, points automatiques, détail par exercice, partie de l'enseignant, note) ; droits de l'API ; copies effacées quand l'élève quitte la classe, et avec le profil.
- **API** (`apps/api/src/epreuves.ts`) : enseignant de la classe (2FA) — ouverture (bilan ou examen **du niveau de la classe**, 30 jours au plus), liste, détail avec **textes non préparés** (lecture non préparée, versets non préparés, scripts de dictée du livre) et **mots à dire** des exercices d'écoute (retirés de la copie de l'élève), partie hors application (points ≤ maximum), fermeture ; famille — liste (à venir, ouverte, envoyée, notée), **projection d'épreuve sans aucune réponse** (`examProjection`), colonne de droite des « relier » **mélangée pour chaque élève** (réponse non déductible de l'ordre affiché), copie unique (code parent pour un enfant), **note visible à la fermeture seulement**, leçons à revoir en remédiation (celles que couvre le bilan ; toutes pour l'examen). Tableau de suivi : la note officielle entre dans les bilans/l'examen (la saisie « classe papier » de l'enseignant prime, puis l'épreuve, puis l'entraînement).
- **Web** : carte « Épreuves de la classe » sur « Aujourd'hui » (passer, envoyée, note, leçons à revoir), page `/epreuves/[sid]` (composant `ExamExercise` : recueille les réponses **sans correction immédiate**), onglet **« Épreuves »** de l'espace école (ouvrir, textes non préparés, mots à dire, copies, partie hors application, remédiation signalée, fermer).
- **Corrections en route** : (1) les positions d'exercices de l'importeur commencent à 1 — le lien « réponse libre » du lot 18 prenait l'exercice suivant (`ReligionLesson.svelte`) ; corrigé, et les outils de test numérotent comme l'importeur ; (2) le mode projection du lot 18 n'installait pas les illustrations (contexte et planche SVG) ; corrigé.
- **Réserve (D7)** : les bilans restent servis en entraînement AVEC leurs corrigés ; tant que le client n'a pas tranché, l'épreuve notée se passe en classe, sous surveillance.
- **Tests** : `exam.test.ts` 5 ; API `lot19.test.ts` **7** sur l'édition synthétique importée par le vrai importeur (ouverture et refus, projection sans réponse ni texte non préparé, mélange stable par élève, code parent, copie unique, correction 16/16 → 20/20, « tout toucher » → 0, partie de l'enseignant, cloisonnement enseignant/famille, note à la fermeture, remédiation et leçons à revoir, tableau de suivi, examen /100, départ de la classe). Conditions de la CI (`base-et-tuteur`, sans les livres) : **332 verts, 37 sautés**. Build, typage, lint verts. E2e : non exécutables ici.

---
## 29/09/2026 — Corrections d'audit INF-1 et INF-2 : CI verte sans les livres (branche `lot18-wip`, avant le lot 19)

Demandé par le chef de projet d'après `docs/projet/AUDIT_GENERAL_2026-09-29.md` (branche `audit-dossier`).

- **INF-1 (CI rouge depuis le lot 9)** : (1) `packages/school/test/school.test.ts` lit `certificats.js` dans un `beforeAll` (le corps d'un `describe.skipIf` est exécuté à la collecte : `ENOENT` faisait planter le fichier) ; (2) la CI et `pnpm test` lancent `pnpm -r --no-bail --workspace-concurrency=1 test` : un paquet en échec n'empêche plus les suivants (base, tuteur) de tourner ; (3) `apps/android/android/gradlew` versionné avec le bit exécutable (`100755`).
- **INF-2 (tests d'API sautés en CI)** : **contenu synthétique versionné** `infra/ci/contenu-synthetique/` produit par `infra/ci/synthetique/generer.mjs` (2 niveaux en1 et ad1, 8 unités dont bilans et examens, les 8 types « langue » avec corrigés, un exercice ouvert, guide et translittération à retirer, carnets de hifẓ **réduits à leur structure** — numéros de sourates et de versets, aucun texte ; le Coran de référence est le Tanzil de `infra/ci/contenu/coran` par lien symbolique) ; **aucun texte religieux** (test `synthetique.test.ts` : importable sans erreur bloquante, aucun bloc Coran/hadith/fiqh/rubriques, aucun caractère arabe dans les carnets, générateur à jour). `apps/api/test/content.ts` et `packages/db/test/content.ts` : vrais livres s'ils sont là, sinon contenu synthétique ; `READY` ne dépend plus que de la base. Les vérifications propres aux **vrais livres** (26 unités d'en1, versets, religion, registre, illustrations, 4 bilans et modèles de certificats d'en1) sont marquées `REAL_BOOKS` et restent à part.
- **Résultat, conditions exactes de la CI, sans les livres** : job `verifier` (sans base) **225 verts, 132 sautés** ; job `base-et-tuteur` (PostgreSQL 18, `AWFORM_CONTENT_DIR=infra/ci/contenu`) **320 verts, 37 sautés** (avant : 45 tests d'API exécutés, désormais 100 : authentification, cloisonnement, hifẓ, tuteur, école, paquets hors ligne) ; batterie adverse du tuteur (fournisseur simulé) : exécutée. Build, typage, lint et format verts. **Reste rouge, comme prévu** : l'étape « budget de poids » (lot 24, décision D4). `android-debug` : non vérifiable ici (pas de SDK Android) ; la cause connue (bit exécutable) est corrigée.
- Les 37 tests encore sautés en `base-et-tuteur` demandent les vrais livres (import réel en1/ad1/re1/ra1/ad2, registre, illustrations, modèles de certificats) : ils tournent sur la VM.

---
## 29/09/2026 — Lot 18 (V1-a) : correction par l'enseignant des réponses libres, mode projection (branche `lot18-wip`, partie de `lot17-wip`, session cloud)

**Avant le lot** : `docs/projet/ECARTS.md` (chaque ligne V1 du §2.1 et chaque lot V1 du §6.2 : fait / partiel / manquant, avec la preuve) et `docs/projet/DECISIONS_EN_ATTENTE.md` (D1-D3 en attente ; D4 : budget de 150 Ko gardé, allègement au lot 24 ; D5 : dictée photographiée écartée).

**(1) Réponses libres corrigées par l'enseignant** (CDC §2.1, ligne « Leçon interactive » V1) — exercices des livres sans corrigé automatique (`question`, `ouverte`) :
- base : table `free_answer` (migration `0015_reponses_libres`) : une réponse par élève, classe, exercice et item (2 000 caractères), appréciation fermée `acquis | en_cours | a_reprendre` (aucune note chiffrée inventée), commentaire ≤ 600 caractères ; droits de l'API seulement (`roles.ts`) ; **effacée quand l'élève quitte la classe** (`leaveClass`) et avec le profil ; incluse dans l'**export RGPD** (`reponsesLibres`) ;
- API (`apps/api/src/corrections.ts`) : famille — envoi (profil du compte, **code parent pour un enfant**, classe de l'élève, exercice ouvert de l'édition servie, item existant ; un nouvel envoi remplace le texte et remet la correction à zéro), lecture, suppression ; enseignant de la classe (second facteur) — liste « à corriger / corrigées » des élèves encore inscrits avec la **consigne telle que dans le livre**, correction journalisée ; un autre enseignant, un parent ou un élève parti : refusés ;
- web : « Envoyer à mon enseignant » sous chaque exercice ouvert d'une leçon (si l'élève a une classe ; champ code parent pour un enfant ; correction affichée), onglet **« Corrections »** de l'espace école (`CorrectionsClasse.svelte`) ;
- `apps/api/src/guards.ts` : contrôles communs (profil de la famille, code parent, enseignant 2FA) qui renvoient un booléen — l'appelant s'arrête explicitement (leçon du lot 16) ; `apps/api/test/helpers.ts` : base de test avec contenu **synthétique** (aucun texte religieux), comptes, enseignant 2FA, classe — pour les lots suivants.

**(2) Mode projection** (`/enseignant/projection/[unit]`, lien « Projeter » dans l'onglet Devoirs) : la leçon en grand au tableau, une partie à la fois (titre et famille de lettres, lettres, « je lis », mots illustrés, dialogue, Coran), flèches du clavier et plein écran ; **projection élève** du livre (ni guide, ni corrigé, ni texte non préparé), depuis l'appareil si le niveau est téléchargé ; aucune donnée d'élève. Versets affichés par le même composant que la leçon (texte du livre contrôlé à l'import, tanwins d'affichage seulement).

**Reste de V1-a** : compte « direction d'école » voyant plusieurs classes (non demandé en priorité).

**Tests** : API lot 18 : **6** (envoi et ses refus, cloisonnement enseignant/parent, correction, remplacement sans doublon, adulte et export RGPD, suppression et départ de la classe). Total session cloud : **263 verts, 90 sautés** (livres absents). Build, typage, lint verts. E2e non exécutables ici (import des livres obligatoire). Budget web : 210,5 Ko (décision D4 : traité au lot 24).

---
## 29/09/2026 — Lot 17 : consentement par pays, relais d'école hors Internet, synchronisation sûre (branche `lot17-wip`, session cloud, commits `f43e290` → fin de lot)

Repris du commit « Lot 17 (en cours) » (relais `apps/relay`, routes `apps/api/src/relais.ts`, migration `0014_relais.sql`, idempotence des récitations) et terminé dans une session cloud (conteneur jetable, sans les livres).

**(1) Consentement par pays** (`apps/api/src/auth/policy.ts`, `countryRules`) : pour chaque pays, âge du consentement, accords obligatoires (titulaire, enfant < 13 ans / ≥ 13 ans), accord exprès au transfert hors du pays, **loi applicable et autorité de contrôle**. Entrées seulement quand la loi et l'autorité sont connues avec certitude (FR CNIL, BE APD, LU CNPD, CH nLPD/PFPDT, GB ICO, US COPPA/FTC, CA LPRPDE, **SN loi 2008-12 / CDP**, MA 09-08 / CNDP, TN 2004-63 / INPDP, DZ 18-07 / ANPDP, CI 2013-450 / ARTCI, ML 2013-015 / APDP) ; autres pays de l'UE : RGPD + « autorité de votre pays » ; ailleurs : mention générique (aucune autorité inventée). Tout est marqué `aValider` (juriste). Route publique `GET /api/v1/pays/:code/regles` ; l'inscription affiche la loi, l'autorité et l'âge sous lequel un parent crée le profil, et prend du serveur la nécessité de l'accord au transfert (calcul local en secours). **Preuve** : chaque accord donné à l'inscription garde la loi et l'autorité (`consent.evidence`). Sénégal : sans l'accord exprès au transfert, pas de compte (test).

**(2) Relais d'école** — installation, HTTPS local, guides :
- Serveur central : Caddy délivre « à la demande » un certificat pour `*.RELAIS_DOMAINE` **seulement** si l'API confirme un relais enregistré et actif (`on_demand_tls ask …/relais/tls-autorise`) ; service `certsrelais` (`infra/prod/relais-certs.sh`) qui copie **les seuls** certificats des relais (un niveau sous le domaine, noms stricts) vers un volume lu par l'API (droits 600) — l'API ne lit jamais le stockage de Caddy ni la clé du site principal ; service d'outils `relais` (`creer | revoquer | liste`, compte propriétaire) ; `deploy.sh --relais-domaine`.
- Boîtier (`infra/relais/`) : `compose.yml` (relay, web → relay, Caddy), `Caddyfile` (HTTPS avec le certificat de l'école, aucune demande ACME, page d'état accessible par l'IP en HTTP), cible `relay` du Dockerfile, `install.sh` idempotent (jeton **jamais en argument** — clavier ou variable —, `relais.env`/`caddy.env` en 600, clé locale générée une seule fois et gardée, certificat provisoire, systemd au démarrage, **rechargement de Caddy à l'arrivée d'un certificat** par une unité `.path`, dnsmasq facultatif pour le DNS du Wi-Fi). Le relais écrit le certificat reçu de façon atomique.
- `INSTALLATION.md` (équipe technique) et **`MODE_EMPLOI_DIRECTEUR.md`** (langage simple : à quoi il sert, où le mettre, rien à faire chaque jour, page d'état, que faire en cas de problème, ce qu'il ne faut jamais faire, vol ou perte).
- Caddyfile du central et du relais validés avec Caddy 2.10.2 ; CI : syntaxe des scripts du relais, `compose config`, validation des Caddyfile, image `relay`.

**(3) Synchronisation sûre** (cause des incidents des lots 15 et 16) : `infra/synchro.sh` (et `infra/pc/synchro.ps1`, même logique via le bash de Git for Windows) — **git seule source** : refus si des modifications ne sont pas enregistrées (fichiers suivis ou nouveaux), refus en cas de divergence (aucun commit perdu), avance « fast-forward » si seul le distant a avancé, envoi sans `--force` avec `--envoyer`. Contenu des livres : `infra/verifier-copie.sh` refuse de remplacer une copie de la VM modifiée depuis la dernière synchronisation (MANIFEST.sha256 : fichier modifié, ajouté ou supprimé) ; `sync-content.ps1` l'appelle avant de remplacer (`-Force` pour abandonner les modifications en connaissance de cause). Les anciens `awapp-push.ps1`/`awapp-pull.ps1` (hors dépôt) sont à retirer du PC.

**Corrections trouvées en route** : test `@awform/school` qui lisait `certificats.js` même quand le bloc était sauté (échouait en CI sans les livres) ; erreur de lint dans `apps/relay/src/relay.ts` ; caractère parasite « `n » dans `env-scopes.conf`.

**Tests** : relais 13 (dont 7 d'infrastructure : copie des certificats, installation, compose, Caddyfile), API lot 17 : 10 (dont consentement par pays 4), synchronisation 5, périmètres des secrets mis à jour. Session cloud : Node 24.21, **PostgreSQL 18.4** (binaires `@embedded-postgres`, le dépôt apt PGDG étant bloqué par le proxy) : **257 tests automatiques verts, 90 sautés** (ils demandent les livres, absents du dépôt : `~/awform-content`). Build, typage, lint et format verts. **Non exécutés ici** : les **e2e** Playwright (import d'une édition depuis les livres obligatoire) — à rejouer sur la VM.

**Écart signalé (préexistant)** : le budget de poids de la coquille web est **dépassé sur `main`** (JavaScript 204,2 Ko Brotli pour 150 Ko ; 205,6 Ko après ce lot, +1,4 Ko de messages) : l'étape « budget » de la CI échoue donc déjà. Non corrigé ici (le seuil n'a pas été touché) ; piste : charger à la demande les catalogues de langue et les écrans lourds, et mesurer la page d'entrée plutôt que la somme de toutes les pages.

---
## 29/09/2026 — Lot 16 : livres gelés, écoute des récitations, notifications, préparation Android (checkpoint `app-lot16`, commits `61a3362` → `d4be704`)

**(1) Livres gelés** (ETAT.md) : en3, ad3, ado1, ado2, ra1, ra2, puis **ad4 et ra3 gelés pendant le lot** — synchronisés (`sync-content.ps1`), importés et publiés (355 unités, 2 619 exercices, 1 405 versets contrôlés, 0 erreur ; carnets de hifẓ E3/N3/N4 avec leurs livres) ; **plus aucun « aperçu »** (défauts de `import.js`, `deploy.sh`, e2e). Interface indépendante de la liste des livres : libellés « Enfants — niveau 3 », « Carnet Adultes N3 »… (`lib/levels.ts`), niveaux proposés à la création d'un profil et carnets du hifẓ lus dans l'édition.

**(2) Écoute des récitations par l'enseignant** : la famille choisit d'envoyer UN enregistrement (déjà fait sur l'appareil) à l'enseignant de la classe — accord « envoi_recitation » (code parent pour un enfant, exigé à chaque envoi), audio **chiffré AES-256-GCM** (clé `AWFORM_RECITATION_KEY` hors base, API seulement, version de clé), **3 Mo** au plus, conservé **1 à 30 jours** selon la classe (14 par défaut) puis effacé par le travailleur, **supprimable par la famille**, retrait de l'accord = effacement de tous les envois ; l'enseignant de la classe seulement (second facteur, élève encore inscrit) écoute (audio déchiffré à la volée, `no-store`, journalisé) et **note sur la grille /20 commune** — la note entre dans le journal de hifẓ ; **jamais utilisé pour entraîner une IA** (aucun autre chemin ne lit l'audio). Protections, garanties, pages légales (FR/EN) et export RGPD mis à jour. Tests : API (accord, code parent, audio, classe, chiffrement vérifié dans la base, accès refusé à un autre enseignant / au parent / à l'administrateur, note, suppression, échéance, retrait) et e2e (famille → enseignant → note → suppression).

**(3) Notifications web push** : abonnement par appareil, préférences **toutes désactivées par défaut** ; profils mineurs seulement si le parent l'accepte (code parent) ; **heures calmes** (≥ 8 h, 20 h → 8 h par défaut, heure locale), au plus une notification « devoirs » par jour (la veille de l'échéance, après 17 h) et le rapport le dimanche ; textes neutres sans nom ni culpabilisation (« Un devoir est prévu pour demain. Bonne séance ! ») ; envoi par le travailleur (`web-push`, clé VAPID **privée dans son seul périmètre**, publique dans l'API) ; abonnements refusés (404/410) supprimés. Clés générées par `deploy.sh` (openssl) ; validées dans le conteneur du travailleur. Le service de notification du navigateur est mentionné dans la politique de confidentialité.

**(4) Android** : emballage **Capacitor 7** de la PWA (`apps/android`, projet Gradle généré et versionné) qui ouvre le site AWFORM ; scripts `infra/android/setup-sdk.sh` (JDK 21, outils en ligne de commande, plateforme 35 / build-tools 35.0.0 épinglés, empreinte à vérifier) et `build-debug.sh` (lockfile gelé, horodatage du commit, APK + empreinte) ; job CI `android-debug` (SDK de l'image GitHub) qui publie l'APK en artefact ; procédure de publication future (`infra/android/ANDROID.md` : compte Play du client, identifiant définitif, clé de signature dans le coffre, AAB, fiche, « Sécurité des données », programme Familles). **Non fait par moi** : télécharger le SDK et **accepter la licence du SDK Android** (acte à faire par une personne) — l'APK n'a donc pas été construit sur la VM ; il le sera par la CI ou après `setup-sdk.sh`.

**Correctif de sécurité trouvé pendant le lot** : un refus renvoyé par une fonction de contrôle appelée avec `await` ne stoppait pas le traitement (une réponse Fastify est « thenable » : `await` la résout en `undefined`). Conséquence réelle depuis le lot 11 : `PUT /profiles/:id/regularite` d'un profil **ado/adulte** d'un autre compte recevait 404 mais écrivait quand même. Corrigé partout (`if (reply.sent) return`), relais de développement du web corrigé aussi (en-tête code parent, corps binaire), test de régression. Signalé dans AUDIT_BRIEF.

**Incident** : une synchronisation PC ← VM a de nouveau écrasé une modification non envoyée (liste des livres de `sync-content.ps1`) ; refaite et vérifiée.

**Tests** : **832** automatiques + **141 e2e** (1 sauté) verts ; lint, format, typage. Démo redéployée (`prod-58b5fcc4f4`, 14 livres publiés, clés générées, notifications et envoi ouverts).

---
## 29/09/2026 — Lot 15 : interface anglaise, FSRS, activités « racines » et « j'enseigne à mon parent » (checkpoint `app-lot15`, commits `1c27150` → `57e071a`)

**(1) Anglais** : les 1 110 messages de l'interface existent en anglais (relus pour la cohérence : « hifẓ », « surah », « booklet », « progress check » pour les bilans — « review » était réservé aux révisions —, apostrophes et pluriels ICU) ; **pages légales en brouillon et aide traduites** (`lib/legal/content-en.ts`, test de parité : mêmes pages, sections, paragraphes, questions et mêmes « [à compléter] »). Langue marquée « à relire par un locuteur natif ». **Drapeau** : `GET /api/v1/config` → `AWFORM_LANGUES_PREPARATION` (« on » posé par `deploy.sh --demo` seulement, dans le périmètre de l'API) ; sans lui, l'option « langues en préparation » disparaît et une langue non relue déjà choisie retombe sur le français (`routes/+layout.ts`) — donc **jamais en production** tant que la traduction n'est pas relue. **Consignes des livres** : mécanisme seulement (`lib/i18n/content-text.ts`) — un champ `consigne_en` / `titre_en` livré plus tard dans le contenu sera choisi selon la langue, sinon le français est gardé et annoncé (`lang="fr"`) ; branché sur les exercices ; l'arabe étudié et le Coran ne passent jamais par ce mécanisme.

**(2) FSRS-5** pour les cartes de mots (`lib/fsrs.ts`) : difficulté, stabilité, rappel R(t) = (1 + 19/81·t/S)^−0,5, paramètres publiés par défaut, rétention visée 90 %, intervalle 1 à 365 jours ; deux réponses seulement (« je savais » = Good, « à revoir » = Again). **Migration** des états Leitner à la lecture (boîte → stabilité = intervalle de la boîte, échéance inchangée, réenregistrée). Les cartes échues passent d'abord par ordre d'échéance. Tests : formules, première réponse (3 jours / lendemain), intervalles croissants, oubli, retard, migration.

**(3) Activités** (inspirées de l'étude comparative) :
- **« Construire un mot à partir de sa racine »** (`/activites/racines`) : racine + schème du pluriel → quel mot ? Éléments **extraits** du livre gelé Adultes N2, leçon 12 (« les trois consonnes de la racine (ك ت ب، ب ي ت، ق ل م) », « Huit schèmes fréquents… », « ك ت ب + فُعُلٌ = كُتُبٌ ») : 4 éléments (كُتُبٌ، مَكَاتِبُ، بُيُوتٌ، أَقْلَامٌ), distracteurs pris dans la même liste du livre. **À l'import, chaque chaîne doit figurer mot pour mot dans la leçon source**, sinon l'élément est écarté et signalé (le test l'a prouvé : un distracteur mal saisi a été rejeté) ; racines de contexte coranique (ر ح م، ع ب د، ص ب ر) **exclues** car le registre ne vérifie pas les racines. Pas de hasard ni de note.
- **« J'enseigne une lettre à mon parent »** (`/activites/enseigner`) : l'enfant choisit une lettre qu'il sait écrire seul (jalon existant), la montre, la nomme, la trace en l'air et dit un mot ; le parent coche ; **rien n'est enregistré ni envoyé** (vérifié en e2e : aucune requête d'écriture).
- Liens sur « Aujourd'hui » (enfant ayant une lettre ; profils Adultes N2 et plus).

**(4) AUDIT_BRIEF** : point 19 ajouté. Accessibilité : 27 écrans audités (racines et révisions ajoutés), 0 violation grave.

**Incident** : une synchronisation PC ← VM a écrasé des modifications locales non encore envoyées (mise en page, compte, exercices, pages légales) ; refaites aussitôt. Règle appliquée désormais : toujours envoyer avant de rapatrier.

**Tests** : **820** automatiques + **133 e2e** (1 sauté) verts ; lint, format, typage. Démo redéployée (`prod-a6539078f3`, anglais autorisé).

---
## 29/09/2026 — Décisions du pilote et Lot 14 : comptes PostgreSQL séparés, préparation de l'audit et de la mise en production (checkpoint `app-lot14`, commits `fd77d34` → `7219aa7`)

**Décisions du pilote appliquées** : (1) titre du certificat = titre du livre (déjà le cas) ; (2) **moyenne des bilans arrondie à l'unité avant le contrôle continu**, exactement comme l'exemple de `data/eval/regles.js` (72,5 → 73, CC 73,6, NF 73) — test ajouté ; (3) **registre des certificats** : numéro, nom affiché, niveau, date et mention conservés durablement (colonnes `holder_name`, `mention`, migration 0012) ; le document complet est réduit à ces champs **30 jours après le départ de l'élève** (tâche nocturne du travailleur, `purgeCertificateDocuments`) — marqué « à confirmer par le juriste » (code, page de confidentialité, AUDIT_BRIEF) ; (4) **attestation de hifẓ en arabe vocalisé** : formules reprises des modèles des livres quand elles existent (« تَشْهَدُ إِدَارَةُ… », « وَلَيْسَتْ هٰذِهِ الشَّهَادَةُ إِجَازَةً… »), passage en chiffres (« الْآيَاتِ مِنْ ١ إِلَى ٤ مِنَ السُّورَةِ رَقْمِ ١١٢ », aucun nom de sourate improvisé), aucun titre d'ijāza ; modèle marqué **VALIDATION_HUMAINE_REQUISE** (affiché à l'enseignant).

**Comptes PostgreSQL séparés** : `awform_api` (lecture seule du contenu et du Coran, journaux en ajout seul — réponses : ajout et effacement avec le profil —, écriture des données des comptes et de l'école, aucune DDL), `awform_worker` (suppression des comptes échus, journal du tuteur, réduction du registre, schéma pgboss qui lui appartient), propriétaire `awform` réservé aux outils (migrations, import, rôles, démonstration). `packages/db/src/roles.ts` (une ligne par table ; un test échoue si une table n'est pas classée), CLI `roles.js` rejouée à chaque déploiement ; `env-scopes.conf` accepte `VAR=SOURCE` : chaque service reçoit SON `DATABASE_URL`. Tests : `roles.test.ts` (matrice des droits, API et travailleur sous leur compte : DDL, retouche du Coran, modification du journal refusées ; tourne aussi en CI) ; **toute la suite e2e tourne désormais sous le compte api**. Démo : `awform_api` et `awform_worker` connectés, travailleur (pg-boss) démarré sous son compte. Deux pièges PostgreSQL 16+ réglés : un compte CREATEROLE non superutilisateur ne peut pas poser NOREPLICATION/NOBYPASSRLS sur un rôle existant, et doit « pouvoir devenir » le travailleur pour lui donner le schéma pgboss.

**Préparation de l'audit et de la mise en production** :
- **Pages légales en brouillon** (`/legal/mentions`, `/cgu`, `/confidentialite`, `/cookies`), rédigées d'après le fonctionnement réel du code : données minimisées, bases légales, enfants (RGPD art. 8, COPPA, loi sénégalaise n° 2008-12, CDP), sous-traitants prévus, durées, droits, sécurité ; informations du client entre crochets « [à compléter] » ; bandeau BROUILLON — à valider par un juriste. Français seulement (l'anglais l'indique).
- **Pas de bannière de consentement** : un seul cookie (`awform_session`, HttpOnly, SameSite=Lax), stockage local nécessaire au hors ligne, aucun cookie tiers ni ressource externe → exemption (article 82 ; à confirmer par le juriste). Test e2e : aucune requête vers un autre site, un seul cookie.
- **Aide / FAQ** (`/aide`), **pied de page** (aide, garanties, pages légales) sur tous les écrans.
- **Erreurs** : page d'erreur de l'application (`+error.svelte`, sans détail technique, retour à « Aujourd'hui ») ; **page « service momentanément indisponible »** servie par Caddy (503, `Retry-After`) quand l'application ou l'API ne répond pas, JSON `service_indisponible` pour l'API — vérifié sur la démo (services arrêtés → 503 et page, redémarrés → 200).
- **Accessibilité** : audit axe-core (WCAG 2.1 A/AA) dans les e2e sur 25 écrans (visiteur, adulte, parent, enseignant et espace école), téléphone et ordinateur : **0 violation grave ou critique**. Corrections : or des lettres (#c98a0b, hérité des livres, 2,9:1) assombri en **#9a6a00** (4,7:1), l'écart connu du thème est supprimé ; textes verts passés sur le jeton `ok-ink`. À revoir avec la direction artistique.

**Tests** : **804** automatiques + **123 e2e** (1 sauté) verts ; lint, format, typage. Démo redéployée (édition `prod-bc8cb1c19c`).

---
## 29/09/2026 — Lot 13 : secrets par service, espace école pour la rentrée de l'école pilote (checkpoint `app-lot13`, commits `e4690fc` → `dffc1b6`)

**(1) Secrets de l'API et du travailleur séparés** : `prod.env` reste la source unique (600) mais n'est plus monté dans aucun conteneur ; `infra/prod/env-split.sh` le découpe selon `env-scopes.conf` (un fichier par service, écriture atomique, 600) — API : base, clé de session, tuteur, paiements ; travailleur et outils (migration, import) : la base seulement ; base : son mot de passe ; Caddy : adresses ; web : rien. `compose.yml` n'utilise plus qu'`AWFORM_ENV_DIR`. **Test** `apps/api/test/env-scopes.test.ts` (6 cas, tourne en CI) : les variables lues par le code de l'API et du travailleur sont dans leur périmètre, aucun secret hors besoin, chaque service de `compose.yml` reçoit son fichier, `env-split.sh` ne transmet rien d'autre. **Sur la machine** : `env-check.sh` (noms des variables de chaque conteneur, jamais les valeurs) appelé par `deploy.sh` et `status.sh` → « périmètres des secrets : conformes » (API 2 secrets, travailleur 1, base 1, web 0, Caddy 0). `AUDIT_BRIEF.md` mis à jour (risque 1 clos, risque 17 ajouté, question 14).

**(2) Espace école** (`/enseignant/classe/[id]`, bouton « Espace école » de chaque classe ; API `apps/api/src/school.ts` ; paquet `@awform/school`, sans dépendance, partagé API/navigateur ; migration 0011) :
- **Classes et groupes** : réglages (livre suivi, établissement et ville — aussi en arabe —, année scolaire), groupes ; liste de classe = profils inscrits par leur parent (pseudonyme de la famille, non modifiable par l'école) + élèves **« classe papier »** saisis par l'enseignant (prénom + initiale, genre facultatif pour les textes, nom arabe facultatif ; aucune date de naissance).
- **Devoirs** (leçon, passage de hifẓ, petit livre) avec **échéance**, pour la classe ou un groupe ; suivi automatique pour les élèves de l'application (leçon terminée, passage appris ou validé après la date du devoir), coches de l'enseignant pour tous (elles priment) ; côté famille : carte « Devoirs de la classe » sur « Aujourd'hui », **jamais de « retard » affiché à l'élève**.
- **Tableau de suivi** : leçons terminées, bilans (%), examen, contrôle continu, **note finale et décision selon `data/eval/regles.js`** (NF = 60 % examen + 40 % CC arrondie au demi-point ; 80/70/60/40 ; examen ≥ 50 sinon validation conditionnelle), dernière récitation, devoirs faits / en retard. **Classe papier** : saisie des notes des bilans et de l'examen du livre papier (sur 20 ou 25 ; elles priment sur l'application), récitations et productions ; récitation de hifẓ d'un élève papier avec les relevés du barème (/20).
- **Certificats de niveau** : modèles `niveau_enfants / adultes / ados / religion` de `data/eval/certificats.js` **lus tels quels** (importés par édition, table `eval_doc`, avec le référentiel des niveaux et les règles) ; variantes féminines arabes et françaises choisies selon le genre, chiffres arabes orientaux et mois de la charte, champs manquants signalés ; délivrables seulement si la décision le permet. **Attestation de hifẓ** pour une récitation validée « oui » : modèle de l'application, français seulement, **« elle n'est pas une ijāza »**, marqué *à valider* (version arabe à rédiger par le comité). **Registre** : numéro unique `AWF-EN1-2026-0001` / `AWF-HZ-…`, document figé à la délivrance.
- **Export** : CSV (tableau, devoirs, registre ; « ; », BOM, virgule décimale, formules neutralisées) ; **PDF** par les pages imprimables (tableau A4 paysage, certificat A4 paysage français/arabe) et « Enregistrer au format PDF » du navigateur — vérifié en e2e par le moteur PDF de Chromium.
- **Mineurs** : tout est réservé à l'enseignant propriétaire de la classe avec second facteur ; ni autre enseignant, ni administrateur, ni parent (test API sur chaque route) ; exports, saisies et certificats journalisés ; retirer un élève efface ses résultats, le registre garde le certificat (document figé).
- Apparence : jetons du thème uniquement (aucune couleur en dur), pas de refonte. Démo : classe de l'enseignant réglée pour en1, trois élèves **fictifs** notés, deux devoirs.

**Incidents** : collision de clés i18n (`ecole.titre`, `ecole.reglages` existaient pour le mode école du lot 3 : un doublon JSON écrase sans bruit) → clés du lot 13 en `classe.*` et **nouveau test** « aucune clé en double ». Débordement horizontal sur téléphone (la grille de mise en page prend la largeur minimale d'un tableau large) → largeurs bornées en `vw`. Migration 0011 : journal Drizzle écrasé par une synchronisation PC → entrée remise.

**Questions au client** : (a) titres des certificats : le livre en1 s'intitule « Je lis et j'écris l'arabe », le référentiel « Je découvre les lettres » — le certificat prend le titre **du livre** ; (b) l'exemple AD4 des règles arrondit la moyenne des bilans (72,5 → 73) avant le CC ; le calcul de l'application ne l'arrondit pas (même note finale, 73) ; (c) texte de l'attestation de hifẓ à valider et à traduire ; (d) durée de conservation du registre des certificats.

**Tests** : **799** automatiques (dont `@awform/school` 15, API lot 13 : 7, périmètres des secrets : 6) + **109 e2e** (1 sauté) verts ; lint, format, typage. Démo redéployée (édition `prod-96f8ba57a7`).

---
## 29/09/2026 — Lot 12 : métadonnées officielles du Coran, tanwins du Muṣḥaf de Médine, corrections avant audit (checkpoint `app-lot12`, commits `7828efe` → fin de lot)

**(1) Métadonnées Tanzil** (`W\coran\tanzil-quran-data.js`, Quran Metadata 1.0, CC BY 3.0, attribution affichée dans le lecteur) : synchronisées vers la VM (`sync-content.ps1`), lues **sans exécution** (`parseQuranData`, paires numériques seulement), contrôlées (`checkQuranData` : SHA-256 épinglé `9e9930c5…4ca4`, 114 sourates, 6 236 versets, 30 ajzāʾ, 240 quarts, 604 pages, 7 manāzil, ordre croissant, chaque juzʾ au quart i×8) ; erreur bloquante à l'import. Table `quran_division` (migration 0010), remplacée seulement si elle change. **Pages réelles du Muṣḥaf de Médine** pour le hifẓ (`buildMeta(tanzil, divisions)` : chaque page pèse 1, total 604 ; cache web `quranMeta.v2`) — effet visible : la première portion du rythme devient 1:1-4 (au lieu de l'estimation précédente), test e2e ajusté. **Jalons ḥizb et quarts de ḥizb** sur « Aujourd'hui ». Tests : 30 / 240 / 604 (contenu), API (Fātiḥa = 1 page, 2:1-5 = 1 page), jalons sur les 8 derniers quarts.

**Tanwins (affichage seulement)**, portage du correctif d'`awform.js` : `tanwinDisplay` (Tanzil ً/ٌ/ٍ + ۭ/ۢ → U+08F0-08F2 pour idghām/ikhfāʾ ; iqlāb → voyelle simple + petite mīm ; crochet de couleur éventuel conservé) appliqué dans le lecteur (mot à mot), le hifẓ, les leçons, le tuteur, les exercices « ordre », la religion et la page QR. Stocké et comparé : Tanzil. `tanwinUndo` exact sur les 6 236 versets (test) ; les e2e comparent après inversion ; nouveau `e2e/lot12.spec.ts`.

**(2) Corrections avant audit** : **moindre privilège** — Caddy ne reçoit que `caddy.env` (adresses), la base que `db.env` (son mot de passe), vérifié par `docker inspect` ; **sauvegardes à clé publique** (`backup-keygen.sh`, ed25519/cv25519) : le serveur ne garde que la clé publique ; clé privée et ancienne clé symétrique récupérées sur le PC (`infra/pc/recuperer-cle-sauvegarde.ps1`, empreinte contrôlée, `shred` côté serveur, ACL) dans `Documents\khadija\AWFORM-production\cles-sauvegarde\` ; test de restauration depuis le PC réussi (`infra/pc/test-restauration.ps1`, clé en `/dev/shm`, 9 tables identiques) ; `status.sh` alerte si une clé secrète revient sur le serveur. Bizarrerie : gpg répondait « Bad secret key » avec un répertoire temporaire nommé `awform-gpg.*` — nommé `rst.*`, tout fonctionne (cause non élucidée, sans effet). **CI** : job `base-et-tuteur` (PostgreSQL 18 en service, texte + métadonnées Tanzil versionnés dans `infra/ci/contenu`, `pnpm test`, batterie du tuteur avec fournisseur simulé, rapport en artefact) — rejoué à l'identique sur la VM ; l'exécution sur GitHub Actions n'est pas visible de mon côté (à confirmer par le client). `AUDIT_BRIEF.md` mis à jour (risques 1, 2 et 14 corrigés, nouveaux points 15-16).

**Tests** : 770 automatiques + **103 e2e** verts (1 sauté). Démo redéployée (`DEMO_ACCES.md` : commande de remise à zéro avec `db.env`/`caddy.env`). Rapport client : lot 12, capture du lecteur (tanwins), deuxième copie hors ligne de la clé demandée.

---
## 29/09/2026 — Lot 11 : recommandations « à adopter tout de suite » de l'étude des plateformes, dossier d'audit (checkpoint `app-lot11`, commits `c871b8a` → `4ac5b95`)

Apparence inchangée (jetons de thème ; direction artistique en attente du fondateur). Seules les recommandations qui ne dépendent ni du style ni d'une décision du client :
- **(a) « Aujourd'hui »** (`/aujourdhui`, écran de démarrage de la PWA et lien du logo ; lien en tête de l'onglet Arabe) : séance du jour = portion de hifẓ (trois pistes, temps du moteur), leçon en cours (première leçon non terminée du niveau, API `GET /api/v1/today/:id`), 5 min de mots si des cartes sont dues ; **durée annoncée**. Les onglets restent.
- **(b) Jalons de maîtrise** : lettres écrites seules (tracé réussi à l'étape 3), leçons terminées / maîtrisées, sourates complètes, ajzāʾ complets (bornes `JUZ_STARTS`) — jamais de points ni de classement. **Ḥizb et quarts de ḥizb : non calculés**, la table officielle des aḥzāb (métadonnées Tanzil) n'est pas dans la copie des livres ; aucune borne inventée — à ajouter côté contenu (`W\awform\coran`).
- **(c) Régularité sans punition** : ados et adultes seulement — « N jours de travail cette semaine (objectif) », semaine du lundi au dimanche, objectif 3 à 6 jours et jours de repos choisis (table `profile_rhythm`, migration 0009) ; aucune série, aucune perte, aucune notification ; **rien pour les enfants** (API refuse le réglage, écran sans compteur).
- **(d) « Nos garanties »** (`/garanties`, publique) : 11 engagements, chacun avec sa vérification (Tanzil, hadiths VERIFIE, IA, voix des enfants, traceurs, enfants, récompenses, paiement, résiliation, données, hors ligne) ; liens depuis Connexion, Offres, Mon compte.
- **(e) Rapport hebdomadaire** (`/suivi/rapport`, API `GET /api/v1/rapport-hebdo/:id`) : semaine du lundi au dimanche (dernier dimanche par défaut, semaines précédentes consultables) : réponses, hifẓ, mots, tracés, leçons terminées, récitations validées, réponses de l'enseignant, jalons ; **aucun compteur de jours pour un enfant**, aucune comparaison. Rédaction par le conseiller IA : plus tard (V1).
- **(f) Budget de démarrage** mesuré en e2e (`e2e/perf.spec.ts`, profil téléphone, CPU ×4, 3G 150 ms 1,6 Mbit/s) : premier lancement **2,0 s** (budget 6 s), relance de l'application installée **0,5 s** (budget 3 s). À confirmer sur un vrai Tecno/Itel (grille de `TEST_APPAREILS.md`).
- **(g) Réglages protecteurs des mineurs** : état lisible par le parent (`/compte/protections`, API `GET /api/v1/profiles/:id/protections`) : tuteur IA, texte libre, partage enseignant, rappels désactivés par défaut ; pas de compteur pour l'enfant ; pas de personnalisation comportementale, de monnaie virtuelle, de lecture automatique, de publicité, d'envoi d'enregistrements (n'existent pas dans le code).

**Dossier d'audit** : `application/AUDIT_BRIEF.md` (architecture, choix et raisons, 14 risques connus dont Caddy qui reçoit tout `prod.env` et la clé de sauvegarde sur la même machine, résultats des tests, périmètre, 30 questions : sécurité, données des mineurs, IA, paiements, hors ligne, CI).

**Tests** : 762 automatiques + **99 e2e** verts (+ mesure de performance). Démo redéployée.

---

## 29/09/2026 — Garde-fou du lockfile, thème par jetons, démo multi-rôles, Lot 10 : paiements (checkpoint `app-lot10`, commits `d463df2` → `aad2555`)

**Garde-fou `pnpm-lock.yaml` (définitif)** — cause des trois incidents : mon script d'envoi PC → VM recopiait un lockfile local ancien. Corrections : (1) `awapp-push.ps1` n'envoie PLUS jamais `pnpm-lock.yaml` (la VM en est la seule source ; retour au PC par `awapp-pull.ps1`) ; (2) crochet **pre-commit bloquant** versionné `infra/git-hooks/pre-commit` (activé sur la VM par `git config core.hooksPath infra/git-hooks`) : `pnpm install --frozen-lockfile` doit réussir sans modifier le lockfile, et les fichiers indexés doivent être au format Prettier — testé : un `package.json` modifié sans lockfile → « COMMIT REFUSÉ » ; il a aussi refusé un commit mal formaté pendant ce lot. La CI garde son `--frozen-lockfile`. Sur un nouveau clone : `git config core.hooksPath infra/git-hooks`.

**Thème par jetons (préparation de la direction artistique, apparence inchangée)** : `apps/web/src/lib/theme/tokens.ts` = source unique (couleurs sémantiques, polices, tailles, rayons, ombres, motifs), thèmes « adultes » / « enfants » (identiques pour l'instant ; `data-theme` posé selon le profil actif), `pnpm --filter @awform/web theme` génère `tokens.css` ; `app.css` et 25 composants lisent les jetons (83 couleurs en dur remplacées) ; `prefers-reduced-motion` respecté ; test : CSS synchronisé, plus aucune couleur de jeton en dur, **contraste WCAG AA** des 18 paires d'usage. Écart connu, documenté : l'or des lettres (#c98a0b, hérité des livres) a un contraste < 3:1 sur blanc — à corriger avec la direction choisie. Contrôle : captures **identiques au pixel** avant/après.

**Démonstration multi-rôles (demande du fondateur)** : compte **administrateur** (second facteur) et **tableau de bord admin en lecture seule** (`/admin` : utilisateurs avec e-mails masqués, éditions, niveaux, questions du tuteur, alertes, abonnements, journal d'audit ; API `GET /api/v1/admin/overview`, réservée aux admins avec 2FA) ; profil **ado** Yanis (15 ans) ; les cinq rôles vérifiés par connexion réelle sur la démo (parent + 3 profils, adulte, enseignant 2FA, admin 2FA). Accès depuis le Wi-Fi : `deploy.sh --lan-ip` (certificat aussi pour l'IP Wi-Fi du PC, 192.168.1.106, vérifié avec l'autorité locale) ; redirection de port et pare-feu Windows à faire par le fondateur (commandes administrateur non exécutées) : guide `application/TEST_APPAREILS.md` (+ grille de 15 tests pour le téléphone d'entrée de gamme, et tout retirer). Identifiants dans `DEMO_ACCES.md` seulement.

**Lot 10 — paiements** (`packages/billing`, ARCHITECTURE_V2 § 8 ter.3) :
- **Formules** : gratuit (5 premières leçons par livre), découverte (14 jours, une fois, sans moyen de paiement), famille / adulte mensuel et annuel, **pass 3 mois** (mobile money, sans renouvellement), **licence école** (par élève et par an) ; **prix par zone et par devise** (F CFA, €, $) en un seul fichier, **à valider par le client**.
- **Droits d'accès** indépendants du moyen de paiement (`entitlementOf`, `canOpenUnit`) ; licence d'école → élèves des classes de l'enseignant si places suffisantes. **Non appliqués au contenu** tant que le client n'a pas fixé l'offre gratuite (`AWFORM_DROITS=on`).
- **Prestataires** (interface `PaymentProvider`) : **simulé** (page de paiement de l'application, événement signé HMAC), **Stripe** (Checkout hébergé ; vérification de signature des webhooks implémentée et testée ; création de session à valider avec le compte de test du client), **PayPal**, **mobile money par agrégateur** (Wave / Orange Money / Free Money via PayDunya, CinetPay ou PayTech), **Apple / Google** (squelettes) ; sans clé → non proposés. Routage : mobile money d'abord en Afrique de l'Ouest, carte et PayPal ailleurs.
- **Base** : migration 0008 (`billing_checkout`, `subscription`, `billing_event`). **API** : offres, mon abonnement, souscription (barrière parentale : code parent exigé s'il existe), page de paiement simulé, webhook signé **idempotent** (sans en-tête CSRF, corps brut), annulation (droits jusqu'à la fin de la période). `AWFORM_PAIEMENT=off` par défaut ; démo : `simule`.
- **Web** : « Offres » (formules de la zone, droits, moyens), page de paiement simulé (« aucun argent n'est prélevé »), « Mon abonnement » (formule, droits, profils couverts, paiements, arrêt du renouvellement) ; liens dans Mon compte.

**Tests** : ≈ 750 automatiques (billing 13, API +9) + **90 e2e** verts. Démo à jour (paiement et tuteur simulés).

---

## 29/09/2026 — Lot 9 : socle des tuteurs IA, sans clé réelle (checkpoint `app-lot09`, commits `d4dfd5b` → `f89f7e7`)

**Paquet `@awform/tutor`** (ARCHITECTURE_V2 § 1) :
- **Orchestrateur** : politique (moins de 13 ans : boutons seulement ; pas de tuteur enfant entre 21 h et 7 h ; 300 caractères ; plafond de coût par élève et par mois : 1 $ enfant, 3 $ ado/adulte → tuteur local), **classifieur local** avant tout modèle (détresse, rencontre, injection, avis religieux, polémique, données personnelles, Coran, hadith, identité) → réponses types ; **local d'abord** (indice, « que dit ma leçon », mots : banque d'explications validées tirée de la projection élève des livres gelés, jamais le bloc Coran) ; appel au fournisseur (contexte en lecture seule) ; **filtre de sortie** ; rendu.
- **Filtre de sortie** : schéma JSON strict ; `{{coran:s:a-b}}` → Tanzil octet par octet (basmala d'en-tête retirée, 20 versets au plus) ; détecteur de Coran hors référence (index des trigrammes « nus » du Tanzil, 3 mots) ; citation sans `{{registre:HAD_…}}` VERIFIE, numéro de hadith → bloqué ; avis religieux formulé, polémique, phonétique latine, données personnelles, identité humaine, émoji visage → bloqué ; enfant : aucun arabe hors leçon. Violation → réponse de repli locale.
- **Rôles versionnés** (empreinte) : enfant Claude Haiku 4.5, ado/adulte Claude Sonnet 5 (décision de l'architecture ; surchargeables par variables d'environnement).
- **Fournisseurs** : interface abstraite ; `simule` (déterministe) ; `simule-hostile` (enfreint toutes les règles, pour prouver le filtre) ; **adaptateur Claude** (SDK officiel `@anthropic-ai/sdk` 0.129, sortie structurée `output_config.format` json_schema, invite système en cache, effort bas sauf Haiku, `refusal` → transmis à l'humain, erreurs typées → repli). Clé : `ANTHROPIC_API_KEY` de l'environnement uniquement.
- **Mise en service** (`gate.ts`) : `AWFORM_TUTEUR` = off (défaut) | local | simule | claude ; `claude` refusé sans clé ET sans rapport de batterie RÉUSSI avec `claude`, même empreinte de rôles et mêmes modèles (`AWFORM_TUTEUR_BATTERIE`).
- **Batterie adverse** : **1 081 cas** (777 + 304 « modèle seul » sans classifieur, défense en profondeur) : texte coranique (versets tirés du Tanzil à l'exécution), hadiths inventés, avis religieux, polémiques, protection des mineurs, injection, texte libre d'un enfant, horaires, plafond, pédagogie, fournisseur hostile ; 15 critères bloquants « 0 » / « 100 % » : **tous verts** avec le simulé. CLI `node packages/tutor/dist/cli/eval.js --fournisseur claude --confirmer` pour le vrai modèle (≈ 350 appels, ≈ 3-5 $). La batterie a trouvé et fait corriger 9 défauts du classifieur (sourates « Yā-Sīn », « Al-Wāqiʿa », « sin » anglais, « Boko Haram » pris pour un avis, etc.).

**Base** : migration 0007 (`tutor_log` journal 12 mois, purge par le worker ; `tutor_question` ; `tutor_alert`). **API** : `/tutor/status`, `/tutor/:id/ask` (leçons d'ARABE seulement, jamais la religion ; accord `tuteur_ia` du parent requis pour le modèle chez un enfant/ado), questions, journal, signalement, `PUT /profiles/:id/tuteur`, `/teacher/questions` (+ réponse). **Web** : « Demander au tuteur » dans chaque leçon d'arabe (boutons ; texte encadré ados/adultes ; « je suis un programme » ; signaler ; réponses de l'enseignant), « Questions en attente » (enseignant), « Tuteur » dans Mon compte (accord, journal). Démonstration : tuteur SIMULÉ (`deploy.sh --demo` pose `AWFORM_TUTEUR=simule`), une question en attente pour l'enseignant de démonstration.

**Anomalie (évitée)** : mon script d'envoi a de nouveau écrasé `pnpm-lock.yaml` (dépendances du tuteur absentes) — détecté avant le commit, lockfile régénéré, `--frozen-lockfile` vérifié.

**Tests** : ≈ 727 automatiques (dont batterie) + 86 e2e verts. GitHub Actions : toujours non consultable (consigne au client).

---

## 29/09/2026 — Lot 8 : livres gelés, Sciences islamiques, bibliothèque des livrets, lecteur coranique C1 (checkpoint `app-lot08`, commits `a96189b` → `61d26eb`)

**Livres importés (ids explicites, `application/ids`)** : GELÉS en1, ad1, en2, ad2, re1, re2 + carnets de hifẓ E1/N1/E2/N2 (défaut de `cli/import.js`, variable `AWFORM_LEVELS`). Livres en relecture (ra1, ra2) : option `--apercu` / `AWFORM_APERCU` → marqués « aperçu », **démonstration seulement** (`deploy.sh --demo` : `ra1,ra2` par défaut ; production : rien). Édition `prod-<empreinte>` = contenu + niveaux + aperçu + version. Contrôle en1…ra2 : 0 erreur bloquante, 15 avertissements.
- **Écart signalé** : interlocuteur de dialogue hors charte (Sami, re2 l24) passé d'erreur bloquante à avertissement `interlocuteur_hors_charte` (personnage non dessiné : affiché sans portrait). À trancher côté livres.
- **Hadiths** : `maskHadithNumbers` retire des projections élève tout numéro de hadith absent du registre en statut VERIFIE (1 numéro masqué dans l'édition de démonstration) ; clés `vh`/`controle` jamais envoyées.

**Sciences islamiques** : onglet dédié (re Enfants / ra Ados-Adultes ; l'onglet Arabe ne montre plus la religion). Lecteur de leçon `ReligionLesson` : accroche, objectifs, scène, rubriques (texte, points, noms, bulles, situations, hadiths avec rāwī et grade, duʿāʾ, extraits d'ouvrages, tableau, divergences par école, carte, « le saviez-vous », cas, versets), Coran (lien vers le lecteur), mots, dialogue, exercices livre/cahier, « je retiens », carnet de pratique (jamais noté). `ReligionExercise` : QCM/cas/écoute, vrai-faux, classer, trous, tableau, relier, étapes/frise, qui suis-je, calcul, question, réponse ouverte ; sans corrigé → renvoi au cahier.

**Lectures** : table `booklet` (migration 0006, 97 livrets de `data/lect` + `catalogue.js`), `GET /api/v1/booklets[/:code]` (projection élève, illustrations + décor des scènes). Bibliothèque par niveau, livret gardé sur l'appareil (un ou tout le niveau, IndexedDB) → lecture sans réseau ; pages, traduction repliable, « Je comprends », « Mes mots », tampon « J'ai lu ce livre ».

**Lecteur coranique C1 (sans audio)** : `/coran/lecteur` — sourate (1-114), texte Tanzil découpé aux seules espaces (concaténation = Tanzil octet par octet, testé), plage de versets, répétition N fois, pause « À toi », vitesse, lecture guidée mot à mot (surlignage prêt pour l'audio), récitant et page du Muṣḥaf « bientôt ». Lien depuis les leçons de religion (`?s=`).

**Correctifs** : course entre deux sourates choisies vite (jeton de requête) ; test hifẓ hors ligne rendu déterministe (attente du service worker) ; retour « ← Sciences islamiques » depuis un niveau de religion.

**GitHub Actions** : pas d'accès (aucun compte) → consigne ajoutée au rapport client.

**Tests** : ≈ 681 automatiques + 78 e2e verts (+ captures). Démonstration redéployée : http://192.168.50.10 (guide de visite, étape 6, dans `DEMO_ACCES.md`).

---

## 29/09/2026 — Lot 7 : mise en service, instance de démonstration permanente (checkpoint `app-lot07`, commit `905f8bb`)

**Décisions du pilote enregistrées** : (1) QR code en bas de la page d'ouverture de chaque leçon du livre de l'élève, 2 cm, mention « Écouter et réviser » (mise en page au passage en B5 ; ARCHITECTURE_V2 § 8 bis ter) ; (2) points de départ du tracé ajoutés à la liste de relecture humaine `application/A_RELIRE_ENSEIGNANT.md` (propositions gardées) ; (3) tableau rythme × tour à valider par l'école pilote, défauts gardés.

**Production (sans compte externe)** — `infra/prod/` :
- `Dockerfile` multi-cibles (api, worker, web ; `pnpm deploy --prod`), `compose.yml` (Caddy, web, api, worker, PostgreSQL 18 ; base non exposée ; journaux tournants ; `restart: unless-stopped`), `Caddyfile` (HTTP local, HTTPS par autorité interne avec `default_sni` pour l'adresse IP, en-têtes de sécurité ; CSP à nonce fournie par SvelteKit) ;
- `apps/worker` : pg-boss 12 (purge RGPD à 3 h 15, battement toutes les 5 min) ;
- `deploy.sh` idempotent (secrets générés sur la machine, migration, import `prod-<empreinte>` inchangé si même contenu, attente de santé, systemd au démarrage, sauvegarde nocturne, pare-feu 80/443 réseau local seulement, fumée) — relancé : « inchangé », « démonstration déjà présente » ;
- `backup.sh` (pg_dump chiffré GnuPG AES-256, empreinte, 14 gardées), `restore-test.sh` (restauration dans une base temporaire, comparaison de 9 tables : **ok**), `status.sh` (conteneurs, santé, âge de la sauvegarde, battement, disque, erreurs) ;
- `EXPLOITATION.md` : exploitation, restauration réelle, retour arrière, **liste des comptes à créer par le client** (§ 7).
- API : `COOKIE_SECURE=auto` (Secure quand la requête arrive en HTTPS derrière Caddy) ; `cli/demo.js` (données fictives par les vraies routes : consentements, second facteur, classe, activité) ; identifiants générés sur la VM et recopiés uniquement dans `application/DEMO_ACCES.md`.
- Web : SHA-256 de secours pour les codes image (sans `crypto.subtle` en HTTP simple).
- **Vérifié** : accès depuis le PC (http 200, https 200 après `default_sni`), connexion du parent démo, tableau de bord et carnet de hifẓ remplis, sauvegarde + restauration testée, `status.sh` sans alerte, **redémarrage de la VM → service de retour sans intervention**.

**Anomalie corrigée** : `pnpm-lock.yaml` versionné ne contenait pas les paquets `hifz` (lot 5) ni `worker` : mon script d'envoi recopiait un lockfile local ancien sur la VM. Conséquence probable : l'intégration continue GitHub (installation gelée) en échec depuis le lot 5 — je ne peux pas consulter GitHub Actions sans compte. Lockfile resynchronisé et recopié localement ; `pnpm install --frozen-lockfile` vérifié sur la VM. Nouveau job CI « images » (syntaxe des scripts, `compose config`, `caddy validate`, construction des images).

**Tests** : 671 automatiques + 70 e2e verts ; fumée de production ok.

**Adresse de démonstration** : http://192.168.50.10 (https://192.168.50.10 ; hors ligne complet par `ssh -N -L 8080:127.0.0.1:80 awform-dev` → http://localhost:8080).

---

## 29/09/2026 — Lot 6 terminé : tracé, cartes de mots, tableau de bord, QR (checkpoint `app-lot06`, commits `daf70fb`, `d4982f7`)

**Tracé guidé** (`/ecriture`, cahier § 2.4) : zone de dessin (Pointer Events : doigt, stylet, souris ; pas de défilement pendant le tracé), lignes du cahier, trois étapes (repasser les pointillés, tracer sur la lettre claire, écrire seul), 28 lettres + lām-alif, quatre formes (liaisons par joint sans chasse). **Modèle = la lettre dessinée par la police du cahier** (Noto Naskh Arabic) : corps et signes séparés par composantes connexes ; vérifications : couloir (tolérance), couverture du corps, départ (à droite ; en haut pour ا ل ك لا), chaque point touché (dessus / dessous), points après le corps. Messages doux, **jamais de note**. Mots de la leçon à repasser (`?mot=`, couloir et couverture seulement). Liens depuis « Mon cahier d'écriture » de chaque leçon.
**Cartes de mots** (`/revisions`, § 2.5) : mots des leçons commencées (sinon des trois premières), recto arabe + image, verso sens ; **aucune translittération** ; boîtes de Leitner (1, 2, 4, 8, 16 jours) hors ligne. Enfants E1-E2 : mini-jeu « relier le mot et l'image » avec l'adulte, 5 manches ou 5 minutes au plus.
**Tableau de bord** (`/suivi`) : le parent voit chaque enfant, l'adulte son parcours : leçons par état et part finie, activité des 14 derniers jours (barres + tableau), tracés réussis, mots sus, hifẓ ; aucun classement. API `GET /dashboard/:id` (titulaire seulement).
**QR** (`/l/<niveau>-<NN>`, § 2.14) : page publique rendue sur le serveur, **sans JavaScript**, < 100 Ko, CSP stricte, lettres colorées comme le livre, mots illustrés, « continuer dans l'application » ; **ni exercice ni corrigé** (projection publique). Le service worker ouvre directement `/lecons/<id>` quand la leçon est sur l'appareil.
**Données** : migration `0005_entrainement` (`practice_event`, journal immuable, file hors ligne, export RGPD, suppression en cascade) ; appliquée à `awform_dev`. Limite d'inscriptions par IP réglable (`AWFORM_SIGNUP_PER_HOUR`, 200 en e2e).
**Tests** : 669 automatiques (content 46, grading 525, hifz 30, db 10, api 32, web 26) + **70 e2e** (tracé alif : départ à l'envers refusé puis « Bravo », gribouillis hors lettre ; cartes ; mini-jeu E1 ; QR léger ; ouverture directe hors ligne ; captures 29 à 32).
**Écarts** : le cahier prévoyait des modèles de traits ordonnés (points de passage, ≈ 3-4 jours) ; remplacés par la lettre de la police + départ par lettre (même vérifications, sans animation du geste) — l'animation SVG du tracé et l'ordre fin des traits restent à produire (V1) ; départs à relire par un enseignant. FSRS remplacé par Leitner au MVP (FSRS en V1, comme prévu). Emplacement du QR dans la mise en page des livres : à décider.

---

## 29/09/2026 — Hifẓ : charge selon l'acquis, tour de la roue réglable (commit `ba28fd6`)

**Décision du pilote** : la charge de fin de parcours dépend de la quantité mémorisée, pas du rythme. Réalisé : (1) temps affichés partout en fourchette « début → fin » (tableau des rythmes, plan du jour, ARCHITECTURE_V2 § 2.2, note `application/NOTE_CARNETS_HIFZ_TEMPS.md` pour les carnets papier) ; (2) tour de la roue réglable par l'enseignant (30, 45, 60 jours ; défaut 30 pour 3-4 ans, 45 pour 5-7 ans), charge recalculée et affichée (`/hifz`, `/enseignant`), migration `0004` (`hifz_plan.cycle_days`) ; (3) simulateur relancé pour chaque rythme × tour (`simulate()` dans `@awform/hifz`, texte Tanzil réel). Tableau À VALIDER par l'école pilote :

| Rythme | Tour | Prévu début → fin | Simulé (régulier) début → fin | Durée régulier / irrégulier | Allègements (régulier) | Attente max (absences comprises) |
|---|---|---|---|---|---|---|
| 3 ans | 30 j (défaut) | 30 → 130 min | 27 → 122 min | 3,1 / 4,7 ans | 2 | 48 j |
| 3 ans | 45 j | 30 → 97 min | 27 → 84 min | 3,1 / 4,8 ans | 5 | 64 j |
| 3 ans | 60 j | 30 → 80 min | 27 → 76 min | 3,1 / 5,1 ans | 0 | 76 j |
| 4 ans | 30 j (défaut) | 23 → 123 min | 25 → 110 min | 3,8 / 6,3 ans | 2 | 44 j |
| 4 ans | 45 j | 23 → 90 min | 25 → 79 min | 3,8 / 6,6 ans | 3 | 61 j |
| 4 ans | 60 j | 23 → 73 min | 25 → 66 min | 3,7 / 6,7 ans | 0 | 71 j |
| 5 ans | 30 j | 18 → 118 min | 20 → 104 min | 5,0 / 7,9 ans | 0 | 41 j |
| 5 ans | 45 j (défaut) | 18 → 85 min | 20 → 78 min | 5,1 / 8,2 ans | 17 | 66 j |
| 5 ans | 60 j | 18 → 68 min | 20 → 63 min | 5,1 / 7,6 ans | 13 | 81 j |
| 6 ans | 30 j | 15 → 115 min | 16 → 105 min | 6,0 / 10,0 ans | 6 | 45 j |
| 6 ans | 45 j (défaut) | 15 → 82 min | 16 → 73 min | 6,1 / 10,1 ans | 15 | 63 j |
| 6 ans | 60 j | 15 → 65 min | 16 → 61 min | 6,0 / 9,5 ans | 6 | 77 j |
| 7 ans | 30 j | 13 → 113 min | 15 → 105 min | 6,8 / 11,1 ans | 9 | 49 j |
| 7 ans | 45 j (défaut) | 13 → 80 min | 15 → 71 min | 6,9 / 11,3 ans | 18 | 64 j |
| 7 ans | 60 j | 13 → 63 min | 15 → 59 min | 6,6 / 11,1 ans | 2 | 74 j |

Tests : simulateur 3 rythmes × 3 tours × 3 profils (budget tenu, aucune attente au-delà du tour sans alerte, fin de parcours atteinte) ; API (tour 30/45/60, refus de 50) ; e2e (fourchette affichée, changement de tour → charge recalculée). 653 tests + 58 e2e verts.

---

## 28/09/2026 (nuit, fin) — Lot 5 terminé : carnets de hifẓ (checkpoint `app-lot05`, commits `f399109`, `9fffd04`)

**Moteur** (`packages/hifz`, partagé appareil + serveur, sans dépendance) : cinq rythmes (3 à 7 ans), ordre des sourates « rebours » ou « partie 30 d'abord », séquence de versets, portion du jour (sourates courtes entières, coupe au verset le plus proche, jamais au milieu d'une autre sourate), parts de la roue ≈ 1 page, révision récente J+1, J+2, J+3, J+7, J+14, J+30 puis roue (cycle selon l'acquis, jamais plus de 30 jours), solidité S pondérée par la source (maître 1, voix 0,6, parent 0,5, auto 0,3), roue plafonnée au budget avec les parts fragiles d'abord, dette signalée et allègement PROPOSÉ après 7 jours (réduire de moitié, suspendre une semaine, changer de rythme), règle d'arrêt des carnets, mois d'essai avec rythme proposé, barème /20 des carnets. Carnets E1/N1 lus tels quels (semaines, portions « n »/« r », parcours renforcé, versets jumeaux, roue de 3 ou 4 parts).
**Simulateur** (élèves virtuels, 10 ans max, rythmes 3/5/7, profils régulier / oublieux / irrégulier) : révision toujours dans le budget, aucune part > 30 jours sans alerte, règle d'arrêt respectée, Coran parcouru. **Constat** : à 45-60 min, le rythme « 7 ans » accumule une dette de révision en fin de parcours (≈ 100 min par séance nécessaires) → affiché honnêtement (ARCHITECTURE_V2 § 2.3, angle mort A46).
**Texte coranique** : uniquement la table Tanzil importée (contrôle octet par octet à l'import) ; routes `/quran/meta`, `/quran/verses` ; affichage tel quel, basmala d'en-tête posée sur sa ligne (sous-chaînes exactes, basmala chaddée reconnue sans modification) ; tests API et e2e comparant les octets affichés au TSV. Pages ESTIMÉES à partir du nombre de lettres (licence QUL non vérifiée). Aucun audio.
**Données** : migration `0003_hifz` (`hifz_plan`, `hifz_event` journal immuable, `class_group`, `class_member`) appliquée à `awform_dev` ; nouvelle édition dev `2026-09-28-lot5` publiée. Événements hifẓ dans la MÊME file hors ligne que les réponses (serveur : sources « auto »/« parent » seulement ; le maître passe par sa route). Export RGPD complété.
**Enseignant** : `/enseignant` (2FA), classes avec code de 8 caractères ; c'est le PARENT qui inscrit l'enfant (consentement « partage_enseignant », retirable → sortie de la classe) ; validation officielle (relevés → note /20 calculée, « à reprendre » si verset oublié deux fois) ; l'enseignant peut décider du rythme après le mois d'essai.
**Famille** : `/hifz` (carnet ou rythme, trois pistes, réciter de mémoire, auto-évaluation, écoute du parent derrière le code parent, frise, validations : étoile + phrase positive pour E1-E2, note /20 sinon), suivi parent dans `/suivi`, enregistrement de récitation **local seulement** (IndexedDB v2, jamais envoyé, effacé après 7 jours, autorisation du parent pour un enfant). **Mode école** : réglages et sortie protégés par le code de l'adulte (parent ou enseignant ; le code est ouvert à tous les comptes).
**Identifiants d'exercices** : en1/ad1 gelés avec `id` explicite ; l'import vérifie chaque `id` contre `ids/en1-ad1-correspondance.json` (copié par `sync-content.ps1`), refuse doublons et `id` invalides ; l'empreinte ignore le champ `id` (aucune réponse périmée). Correspondance identique aux identifiants de position : aucune migration des réponses nécessaire.
**Tests** : 652 automatiques (content 46, grading 525, hifz 30, db 10, api 27, web 14) + **58 e2e** (mobile + bureau). Corrigé en route : relais `/api` sans PUT, formulaire de rythme débordant sur téléphone.
**Écarts / à décider** : temps des rythmes 4-6 ans estimés et charge de fin de parcours (pilote) ; licence de mise en page du Muṣḥaf (lignes/pages) ; noms des sourates à relire par le référent ; écoute des enregistrements par l'enseignant et reconnaissance vocale reportées (S4, consentement + chiffrement) ; attestations de partie et classe papier (S2).

---

## 28/09/2026 (nuit, suite) — Intégration continue + Lot 4 terminé : comptes, consentements, internationalisation (checkpoint `app-lot04`, commits `1d8f489` → `15aadaf`)

**Intégration continue** (`.github/workflows/ci.yml`, sans aucun secret, `permissions: contents: read`) : installation figée, build, typecheck, lint, tests unitaires, budget de poids, interdiction de `.normalize(` et de tout `.env` suivi. Les tests qui demandent le contenu des livres ou PostgreSQL sont ignorés en CI (contenu hors dépôt) ; le bout en bout reste sur la VM.

**Comptes (API, OWASP ASVS niveau 2 pour l'authentification)**
- Types : **parent** (profils enfants **sans e-mail** : pseudonyme, **année** de naissance, avatar sans visage), **adulte** autonome (profil créé avec le compte), **enseignant** et **admin** (créés en ligne de commande : `node apps/api/dist/cli/staff.js`, mot de passe lu dans `AWFORM_STAFF_PASSWORD`, jamais en argument).
- Mots de passe : argon2id (`node:crypto`, m = 19 MiB, t = 2, p = 1), 12 à 128 caractères, liste des mots de passe courants, aucune règle de composition, aucune normalisation ; message générique en cas d'échec ; verrouillage progressif (5 échecs → 1, 2, 4… ≤ 60 min) par compte et par adresse IP ; 20 inscriptions/h par IP.
- Sessions : jeton aléatoire 256 bits, **empreinte SHA-256** seule en base, cookie `HttpOnly; SameSite=Lax; Secure`, 30 jours glissants (famille) / 12 h (enseignant, admin), révocation (déconnexion, partout, changement de mot de passe). Anti-CSRF : en-tête `x-awform: 1` exigé sur toute écriture.
- **Second facteur TOTP obligatoire** pour enseignant et admin (RFC 6238, secret chiffré AES-256-GCM avec `AWFORM_SECRET_KEY`, anti-rejeu).
- Réinitialisation du mot de passe : **désactivée** (503) tant qu'aucun service d'e-mail n'est choisi par le client.

**Consentements et conformité** : consentements séparés, jamais cochés d'avance, datés, version du texte (`2026-09-28`), pays et preuve (`ré-authentification du parent + déclaration`) ; âge du consentement numérique par pays (FR 15, US 13, SN 18, défaut 16) ; **transfert hors pays** exigé hors UE/EEE/CH/GB (dont le Sénégal, loi 2008-12) ; **COPPA** (US < 13 ans) ; retrait des consentements facultatifs ; **export JSON** de toutes les données (RGPD art. 15/20) ; **suppression** immédiate de l'accès et purge définitive à 30 jours (`node packages/db/dist/cli/purge.js`) ; journal d'audit. Migration `0002_comptes.sql` (appliquée à `awform_dev`).

**Tentatives** : le mode développement (`AWFORM_DEV_ATTEMPTS`, profils fictifs `--demo`) est **supprimé** ; les réponses et la progression exigent une session et un profil **du compte connecté** (sinon 401/403 ; la file hors ligne est gardée jusqu'à reconnexion).

**Interface** : `/inscription`, `/connexion`, `/profils` (« Qui apprend ? », ajout d'un enfant avec consentement et mot de passe du parent, **code parent** pour revenir à l'espace parent), `/compte` (langue, profils, code parent, consentements, export, mot de passe, 2FA, déconnexion partout, suppression) ; mode école sur les profils du compte.

**Internationalisation** (priorité client) : `intl-messageformat` 12.1 (ICU : pluriels, sélections), catalogues `fr.json` (**complet, relu**) et `en.json` (**préparé**, non relu, caché sauf « langues en préparation ») ; repli FR ; dates et nombres par `Intl` ; `lang`/`dir` sur `<html>`. Test : parité des clés et des arguments, messages ICU valides, toutes les clés utilisées existent, **aucun texte en dur** dans le balisage. Plan international (vagues de langues, COPPA, paiements multi-prestataires, magasins, CDN) : ARCHITECTURE_V2 § 8 ter.

**Tests** : API 20, unitaires web 14, contenu 525, grading 44, db 10 ; **bout en bout 48/48** (mobile + bureau) avec comptes de test créés au lancement (mot de passe et clé tirés au hasard, adresses `.test`).

**Écarts / à décider**
| Sujet | État | Qui |
|---|---|---|
| Réinitialisation du mot de passe, vérification d'adresse | désactivées : il faut un fournisseur d'e-mail (clé à créer) | client |
| COPPA « vérifiable » | méthode actuelle faible ; méthode FTC (paiement 0 €, tiers) avant ouverture US | lot P1 + juriste |
| Déclaration CDP (Sénégal) | modèle à fournir, dépôt par le client | client |
| Consignes et titres de livres en anglais | l'interface est traduite, pas encore le contenu pédagogique | vagues I1+ |
| Bout en bout en CI | nécessite le contenu (hors dépôt) et PostgreSQL | plus tard (contenu de test synthétique) |

---

## 28/09/2026 (nuit) — Lot 3 terminé : hors ligne complet (checkpoint `app-lot03`, commits `304688c` → `a9007b9`)

Référence : cahier §2.15, §4.3 et **ARCHITECTURE_V2 §3.2 à §3.4** (désormais référence avec le cahier).

**Réalisé**
1. **Paquets par niveau** (`GET /api/v1/packs`, `GET /api/v1/packs/:niveau`) : leçons en projection élève + identifiants/empreintes d'exercices + illustrations utilisées ; compressés une fois en **Brotli** (qualité 11), **ETag** (304 si l'appareil est à jour) ; le manifeste donne le poids compressé et l'empreinte de chaque leçon → **mise à jour différentielle** (seules les leçons modifiées sont retéléchargées ; paquet complet si plus de la moitié a changé).
2. **Appareil** : IndexedDB (paquets, leçons, illustrations, file d'événements, réglages) ; application monopage (rendu sur l'appareil) ; les leçons se lisent d'abord sur l'appareil, sinon sur le réseau ; **service worker** : coquille en cache, navigation sans réseau servie par la coquille, nouvelle version appliquée au **prochain démarrage** (jamais au milieu d'une leçon), **Background Sync**.
3. **Synchronisation différée sans conflit** : chaque réponse est rangée tout de suite dans IndexedDB (UUIDv7), envoyée par lots de 100 dans l'ordre, dès le retour du réseau (événement « online », réessai toutes les 5 s tant qu'il reste des réponses, ou service worker) ; doublons ignorés et états recalculés par le serveur ; refus définitifs retirés de la file ; badge « n réponses en attente ».
4. **Budget de données mesuré** (rapports `reports/budget-donnees.md`, `reports/budget-web.md`, contrôlés par les tests) : **en1 = 76,6 Ko, ad1 = 121,8 Ko** pour le niveau entier (leçon moyenne 3,4 à 6 Ko, max 8,2 Ko ; budget ≤ 40 Ko/leçon, ≤ 1 Mo/niveau) ; JavaScript de toute l'application **58,9 Ko** (budget 150 Ko), CSS 4 Ko, polices **222,6 Ko une seule fois**.
5. **Mode « données économes »** (par défaut si le navigateur signale un réseau lent ou l'économiseur de données) : aucun téléchargement automatique, confirmation au-delà de 200 Ko, pas de préchargement des pages ; sinon le niveau ouvert est téléchargé en arrière-plan. Page « Mes téléchargements » : poids avant téléchargement, mise à jour, « libérer de la place » (les progrès sont gardés), données du mois, stockage persistant, réponses en attente.
6. **Mode école** (tablette partagée) : grille des élèves (images sans visage), **code image** de 4 symboles (empreinte SHA-256, jamais en clair), retour automatique à la grille après 1/5/10/20 min d'inactivité, « effacer ses données de la tablette » (après envoi des réponses en attente). Profils fictifs tant que les comptes (lot 4) n'existent pas.
7. **Navigation par matière** (demande du client) : barre de 6 onglets — Coran, Arabe, Sciences islamiques, Écriture, Lectures, Mon suivi — en haut sur ordinateur, en bas sur téléphone ; écrans Coran / Sciences / Écriture / Lectures annoncent leur lot ; « Mon suivi » (état des leçons, réponses en attente, dernier envoi).
8. **Maquette** (agent d'aide, contrôlé) : barre d'onglets sur tous les écrans élève + nouvel écran `sciences.html` (niveaux re1-re5, ra1 ; leçon type ra1.l14 avec extrait mālikite d'al-Akhḍarī et hadith référencé, tout l'arabe tiré des données) ; `_src/build.ps1` relancé par moi : **7 blocs coraniques identiques au Tanzil, 0 erreur**.
9. **ARCHITECTURE_V2.md** : section « 7 bis. Angles morts — tableau de suivi » (A1-A36 + R1-R16 du cahier, lot et statut ; A19, A20, R7 passés à « traité », A21 « en partie » après ce lot) ; **§ 8.2 bis Lecteur coranique « Awzid » inspiré d'Ayat** (lot C1, ≈ 7 jours, non codé) : choix du récitant sous licence, verset par verset, surlignage mot à mot (minutage sous licence), répétition N fois avec pause, vitesse, page du Muṣḥaf (mise en page sous licence), hors ligne par sourate ; **aucun audio sans licence** ; l'onglet Coran l'annonce.
10. **Rapport visuel pour le client** : `W\application\rapport\index.html` (page autonome, non publiée) + `rapport\img\` (16 captures WebP, 12 à 32 Ko chacune).

**Tests** : content 44, grading 525, db 10, api 12 (+ paquets, budget, ETag, Brotli), web 8 (IndexedDB simulée : paquets, mise à jour différentielle, libérer de la place, file hors ligne, lots, refus) → **599 verts** ; **34 e2e verts** (Chromium mobile + bureau), dont : niveau téléchargé puis **leçon ouverte et faite en mode avion** (rechargement complet sans réseau), réponses envoyées au retour du réseau et progression recalculée ; données économes (aucune requête de paquet) ; mode école (mauvais code refusé, bon code accepté, retour à la grille après inactivité, horloge simulée) ; 6 onglets et barre en bas sur téléphone. Stabilité vérifiée par 4 exécutions successives.

**Écarts** : les pages publiques en rendu serveur (QR) ne sont pas encore faites (lot 6) : l'application est désormais une application monopage (rendu sur l'appareil) ; Background Sync n'existe pas sur Safari/Firefox → repli par la page (retour du réseau + réessai) ; alerte « mémoire presque pleine » prévue (A20) ; mise à jour différentielle des illustrations seulement par leçon.

**Prochain lot (4)** : comptes parent/adulte, profils enfants, consentements, sessions, suppression/export, 2FA administrateur ; les routes de tentatives quitteront le mode « développement ». Tuteurs IA (V1 IA) : aucune génération de contenu religieux, citation du seul corpus validé (arbitrage du pilote).

---

## 28/09/2026 (soir) — Lot 2 terminé : lecteur de leçon (checkpoint `app-lot02`, commit `1dd7742`)

**Décisions du pilote intégrées** : Q5 = un champ `id` explicite sera ajouté aux exercices des livres après leur gel (l'identifiant calculé reste le repli ; table ancien → nouveau à générer à ce moment) ; tuteurs IA : aucune génération de contenu religieux, citation du seul corpus validé (à respecter au lot 3+, cf. ARCHITECTURE_V2.md).

**Sauvegarde du dépôt (en attendant un dépôt distant)** : `application\backup-repo.ps1` → `git bundle --all` sur la VM, `git bundle verify`, copie contrôlée par SHA-256 dans `application\backups\` et `Documents\khadija\AWFORM-production\app-backups\`, rotation des 14 derniers ; restauration testée (`git clone` du bundle). Appel ajouté à la fin de `W\sauvegarde.ps1` (dans un try/catch : une VM éteinte ne fait pas échouer la sauvegarde des livres) ; script testé de bout en bout. À lancer à la fin de chaque lot.

**Réalisé**
1. **Import complet** : illustrations `illus\*.js` (1 096 retenues, ordre des pages des livres, `zz-sansvisage.js` en dernier) évaluées dans le bac à sable ; SVG **validé par liste blanche** (g, path, rect, circle, ellipse, polygon… ; aucun script, lien, texte, `url()`) ; les 12 personnages viennent obligatoirement de `zz-sansvisage.js` (sinon erreur bloquante). Contrôles par unité : personnages hors charte (scène, dialogue) = erreur ; illustration absente, translittération dans un champ élève, réponse visible dans un bilan = avertissement. Rapport d'import Markdown (`--rapport`). Table `illustration` (migration `0001`).
2. **Projections** (une seule fonction chacune, testée sur les 51 unités) : élève (sans guide/`tr`/parents/dictées ; textes `non_prepare` et `phrases_masquees` ABSENTS ; bilans/examens sans traduction des versets ; examen/`sans_traduction` sans traduction de la lecture ; bilans Enfants réduits à lettres + « Je relis » + exercices, comme `lectureBilan`), parent, enseignant, **épreuve (aucune clé de corrigé ; `relier` en deux colonnes décalées)**, publique (QR).
3. **Correction item par item** (`checkItem`, identique appareil/serveur) + **progression recalculée** (`computeUnitProgress` : score = 1er essai, meilleur score = points trouvés ; terminée = tous les points + auto-évaluation ; maîtrisée ≥ 80 %).
4. **Rendu fidèle** (ordre et règles d'`awform.js`) : scènes composées (portage de `scene()`), objectif, cartes des lettres, tableau des formes, notion, syllabes (sans translittération), ligne de lecture + mot vedette, phrases, mots illustrés, dialogue (avatars sans visage), lexique, Coran (Amiri Quran, mots coraniques, tajwid), adab, oral, « Mon bilan » (je retiens + auto-évaluation à étoiles), cahier d'écriture (le tracé guidé viendra au lot 6), encadré « Texte remis par l'enseignant le jour de l'épreuve ».
5. **8 types interactifs** (premiere_lettre, chasse, relier, ecoute avec « Pour l'adulte : texte à lire », vrai_faux, complete, contient, ordre) : nouvel essai permis, « Essaie encore ! », score ★.
6. **Tentatives** : `POST /api/v1/attempts` (lot d'événements, UUIDv7 de l'appareil, idempotent, empreinte de l'exercice contrôlée, correction RECALCULÉE par le serveur, progression renvoyée) ; `GET /api/v1/progress`. Côté appareil : file d'attente locale renvoyée jusqu'à accusé. **Actif seulement en développement** (`AWFORM_DEV_ATTEMPTS=1`) et pour 2 profils **fictifs** de démonstration (aucune donnée personnelle) tant que les comptes (lot 4) n'existent pas.
7. **Captures** : 28 captures (mobile + bureau) dans `W\application\captures\` (accueil, liste en1, ouverture de leçon avec scène, lettres, mots, exercices, dialogue, Coran, texte non préparé, bilan à étoiles, leçon entière).

**Tests** : content 44, grading 525 (dont 257 exercices × corrigé global et 257 × item par item), db 10, api 9 → **588 verts** ; **24 e2e verts** (Chromium mobile + bureau : 8 types résolus par l'interface sur en1.l03/l04/l15 et ad1.l04, message doux et nouvel essai, leçon réussie + auto-évaluation → « maîtrisée » et état dans la liste, bilans Enfants/Adultes, texte non préparé absent des données, scène et illustrations). Build, typecheck (0 avertissement), lint : OK.

**Rapport d'import (en1 + ad1)** : 0 erreur, 5 avertissements à transmettre aux livres : `en1/l01.js` non strict ; **réponse visible dans un bilan** : en1.l26 (يَكْتُبُ يُوسُفُ وَتَقْرَأُ مَرْيَمُ) et ad1.l11 (أَنَا مِنْ لِيُونَ / أَسْكُنُ فِي بَارِيسَ) — heuristique, à vérifier ; **translittération dans des champs élève** : noms de signes non francisés (fatḥa, ḍamma, tanwīn…) et quelques noms (ʿAbdullāh, Al-Māʾida…), REGLES §4.

**Écarts** : pas encore d'authentification (lot 4) → tentatives limitées aux profils fictifs en développement ; `ecoute.dit` présent dans la projection d'entraînement (nécessaire à la correction hors ligne, affiché seulement dans « Pour l'adulte ») ; tafsir non affiché à l'élève (comme le moteur).

**Prochain lot (3, hors ligne)** : paquets de niveau (projection élève + illustrations), IndexedDB, service worker complet, file d'événements synchronisée en arrière-plan, mode avion en e2e.

---

## 28/09/2026 — Lots 0 et 1 terminés

### Lot 0 — socle de la VM (`infra/provision.sh`, idempotent, relancé 4 fois sans erreur)

| Élément | Version / réglage |
|---|---|
| Système | Ubuntu 26.04.1 LTS, noyau 7.0, 8 vCPU, 28 Go, 98 Go disque ; mises à jour appliquées |
| Outils | git, build-essential, curl, jq, unzip, rsync |
| Node.js | **24.21.0** (LTS « Krypton », dépôt officiel NodeSource `node_24.x`) |
| pnpm | **10.34.5** via corepack (figé dans `package.json` → `packageManager`) |
| PostgreSQL | **18.6** (dépôts Ubuntu), écoute **127.0.0.1 seulement** ; rôle `awform` (sans superutilisateur) ; bases `awform_dev`, `awform_test` |
| Docker | Engine **29.8.1** + compose **5.5.1** (dépôt officiel Docker `resolute`) ; `awzid` dans le groupe docker ; aucun conteneur |
| Pare-feu ufw | actif ; entrant refusé par défaut ; **22/tcp** ouvert ; **5173, 4173, 3000** depuis **192.168.50.0/24 seulement** ; SSH vérifié après activation |
| Fuseau / langue | Europe/Paris ; locale fr_FR.UTF-8 générée |
| Tests navigateur | dépendances système Playwright (Chromium) |
| Secrets de dev | générés localement dans `~/.config/awform/dev.env` (droits 600, hors dépôt) → `.env` (ignoré par git) par `infra/dev-env.sh` |

### Lot 1 — fondations du code

1. **Monorepo pnpm** : `apps/web` (SvelteKit 2.70 / Svelte 5.57 / Vite 8, adapter-node, service worker, manifeste PWA), `apps/api` (Fastify 5.12), `packages/content`, `packages/grading`, `packages/db` (Drizzle 0.45 + pg) ; TypeScript 6.0 strict (`noUncheckedIndexedAccess`), ESLint 10 + typescript-eslint + eslint-plugin-svelte, Prettier 3, Vitest 5, Playwright 1.63 ; README, ADR `docs/adr/0001-socle-technique.md`. Règle ESLint : tout appel `.normalize(` est interdit.
2. **Import du contenu (sans ressaisie, sans toucher aux livres)** : `infra/sync-content.ps1` copie en1, ad1, `index-lecons.js`, `hifz/*.js`, `registre/*.json`, `ECARTS_VERSETS.md`, `coran/tanzil-uthmani.tsv` (+ manifeste SHA-256). Parseur : `AW.xxx(<JSON strict>)` entre la 1re `(` et la dernière `)` ; fichiers non stricts (`book.js`, `index-lecons.js`, `en1/l01.js`) évalués dans un bac à sable `node:vm` (contexte sans prototype hôte, génération de code interdite, 1 s max ; tests d'évasion inclus). Identifiants : unité `en1.l05`, exercice `en1.l05.ex2` + empreinte SHA-256 du JSON canonique (clé `en1.l05.ex2#<12 hex>`), stables d'un import à l'autre. **Contrôle Coran** : chaque verset (crochets de couleur retirés) comparé octet par octet à Tanzil (basmala du verset 1, séparateur ۝, extraits exacts, liste blanche des écarts VOULUS lue dans ECARTS_VERSETS.md) ; écart non voulu = erreur bloquante.
   - Résultat : **51 unités (en1 26, ad1 25), 257 exercices, 2 carnets de hifẓ (E1, N1) + commun/adab/tajwid ; 154 versets contrôlés : 154 identiques, 0 erreur** ; registre : 1 188 versets (tous = Tanzil), 1 361 hadiths, 358 règles de fiqh. **0 erreur bloquante, 1 avertissement** : `en1/l01.js` n'est pas en JSON strict (à convertir côté livres).
3. **`@awform/grading`** : portage fidèle d'`awform.js` (attributs de `exercise()`, gestionnaire de clic, `exTotal`, `plain`, `bare`) pour premiere_lettre, chasse, relier, ecoute, vrai_faux, complete, contient, ordre ; nouvel essai permis, erreurs comptées sans retrait de points. **257 tests générés** (un par exercice réel d'en1 et d'ad1) : corrigé = 100 % ; chaque mauvaise option / valeur / case / appariement / ordre refusé.
4. **Schéma PostgreSQL** (migration `0000_initial.sql`, 19 tables) : édition, niveau (+ version), unité (+ version : contenu JSONB, projection élève, empreinte), exercice (+ version, empreinte), carnets de hifẓ, Coran de référence (6 236 versets, lecture seule), registre (statuts, `validation_humaine`), redirections QR `/l/en1-05`, comptes (parent / adulte / admin), profils (pseudonyme, année de naissance seulement, avatar sans visage), tutelle + consentements, sessions (haché du jeton), tentatives (journal immuable, id UUIDv7 de l'appareil), progression, journal d'audit. Aucune donnée personnelle. Import atomique et idempotent (réimport = « inchangé ») ; édition `dev` publiée dans `awform_dev`.
5. **API** : `GET /api/v1/health`, `/levels`, `/levels/:code/units`, `/units/:id` (projection élève : sans `tr`, `guide`, `*guide_fr`, `sources_fr`, `parents_fr`, `travail_perso_fr` ; traduction des versets retirée des bilans/examens) ; validation des paramètres, erreurs normalisées, en-têtes de sécurité. **Web** : liste des niveaux, liste des leçons (« Leçon N » / « Bilan k »), leçon (lettres colorées `[..]` selon la règle du moteur, `lang="ar" dir="rtl"`, Noto Naskh Arabic, versets en **Amiri Quran** `font-display: block`, Nunito, tailles 30/26/22 px, boutons 48 px) ; exercices à choix déjà interactifs via `@awform/grading` ; polices embarquées (OFL), CSP sans ressource tierce ; JS client ≈ 41 Ko gzip.

### Résultats des vérifications (`pnpm check` + `pnpm e2e`)

| Commande | Résultat |
|---|---|
| `pnpm -r build` | OK (5 paquets) |
| `pnpm typecheck` (tsc + svelte-check) | 0 erreur, 0 avertissement |
| `pnpm lint` (ESLint + Prettier) | OK |
| tests `content` | 30/30 |
| tests `grading` | 265/265 (dont 257 générés depuis en1 + ad1) |
| tests `db` (PostgreSQL réel, aller-retour octet par octet fichiers → base → lecture) | 7/7 |
| tests `api` | 5/5 |
| e2e Playwright (Chromium mobile + bureau) | 4/4 : liste d'en1 (26 unités), leçon en1.l17 (RTL, Amiri Quran chargée, versets affichés = API = livres), exercice corrigé |

Aucun secret dans le dépôt ni dans l'historique (vérifié par recherche du mot de passe de dev) ; `.env` non suivi.

### Commandes

```bash
ssh awform-dev
cd ~/awform-app
bash infra/provision.sh && bash infra/dev-env.sh && pnpm install
pnpm check                                   # build + typecheck + lint + tests
pnpm e2e                                     # bout en bout
node packages/content/dist/cli.js en1 ad1    # rapport d'import sans base
node packages/db/dist/cli/import.js --edition dev --publish
pnpm dev:api    # 127.0.0.1:3000
pnpm dev:web    # http://192.168.50.10:5173 depuis le PC
```
Mise à jour du contenu depuis le PC : `.\infra\sync-content.ps1 -W "<W>"` (copie locale du script dans le dépôt).

### Écarts avec le cahier des charges (et pourquoi)

| Cahier | Fait | Raison |
|---|---|---|
| Node.js 22 LTS | Node **24** LTS | LTS active en septembre 2026 ; 22 en maintenance |
| PostgreSQL 16 | **18** | version des dépôts Ubuntu 26.04 ; `uuidv7()` natif |
| `packages/content-schema`, `importer`, `correction`, `render` | `content` (types + import), `grading`, `db` | découpage plus simple pour le lot 1 ; `render` viendra au lot 2 |
| Validation zod + OpenAPI | schémas JSON natifs de Fastify | suffisant pour 3 routes en lecture ; zod/OpenAPI avec les routes d'écriture (lots 3-4) |
| @vite-pwa | service worker natif de SvelteKit | plus léger ; hors ligne complet au lot 3 |
| TypeScript « récent » | 6.0 (pas 7.0) | typescript-eslint et SvelteKit ne supportent pas encore TS 7 |
| Icônes PNG de la PWA | icône SVG seule | à produire avec la charte (installabilité Android à vérifier au lot 3) |
| Tests générés sur les 4 316 exercices | 257 (en1 + ad1, périmètre MVP) | les autres niveaux entreront avec leurs lots |
| `en1/l01.js` JSON strict | lu en bac à sable + avertissement | fichier historique non strict ; conversion à faire côté livres (non modifié) — **fait côté livres le 28/09** (awform\AUDIT_MVP_EN1.md, reprise 2) : relancer sync-content, l'avertissement doit disparaître |

Remarque : le registre coran.json porte parfois une **étape** (`TEXTE_ARABE_VERIFIE`) dans le champ `statut` ; importé tel quel.

### Questions au client (cahier §8.2) devenues utiles / bloquantes
- **Q5 (identifiants d'exercices)** : non bloquant aujourd'hui (position + empreinte), mais à trancher **avant** que les élèves pilotes ne répondent (lot 3), sinon tout réordonnancement dans les livres rompra le lien réponses ↔ exercices.
- **Q1 (nom, domaine)** : « Awzid » envisagé (ETAT 28/09) ; non bloquant pour le code (libellés centralisables), bloquant pour la recette R0 (serveur de recette, TLS).
- **Q7 (hébergeur)** et compte de **dépôt de code distant** (§7.2, « avant L0 ») : le dépôt n'existe qu'en local sur la VM — **risque de perte** ; à créer par le client (je ne crée aucun compte).
- Q4 (bêta sans audio) : conditionne le mode « l'adulte lit » (déjà prévu, non bloquant pour le lot 2).

### Prochain lot (lot 2 — lecteur de leçon, cahier L1/L2)
Import complet de l'édition (illustrations `illus\*.js` assainies, `zz-sansvisage.js` en dernier, contrôles translittération / personnages / corrigés d'AUDIT_BILANS), projections enseignant / parent / épreuve, rapport d'import lisible ; rendu fidèle de tous les blocs (scènes sans visage, lecture, mots avec images, dialogue, Coran/tajwid, adab, bilans `lectureBilan`, textes non préparés) ; les 8 types interactifs (relier, chasse, contient, ordre en plus) ; enregistrement des tentatives ; tests visuels des signes coraniques rares.
