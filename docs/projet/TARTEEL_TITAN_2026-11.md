# Suivi de la récitation « Tarteel titan » (1er novembre 2026, phases 1 et 2, phase 3 palier 1 au § 11)

Branche `tarteel-titan-2-wip` (rebasée sur `origin/main` 9823ec5 ; la phase 1 reste sur `tarteel-titan-wip`), interrupteur `shazam_coran`
(canal bêta, inchangé). Mesures faites sur la VM `awform-dev` le 01/11/2026 : service réel (NeMo FastConformer RNN-T + tête CTC,
processeur seul), `nice 10`, au plus 4 cœurs, VM partagée et souvent saturée (charge 7 à 22) — **les durées de calcul, donc les latences,
dépendent de cette charge** (§ 5).

## 1. Ce qui est atteint et ce qui ne l'est pas

Banc 2 (§ 3) : 190 séances lues, dont 50 justes, 59 reprises / retours / mots répétés (récitation normale) et **81 séances avec une
erreur** (oubli, remplacement, ajout, verset sauté ; premier et dernier mot jamais visés).

| | Avant (ancien service + comparateur c8b539f) | Phase 1 (fenêtre, accord des 2 têtes) | **Phase 2 (défaut actuel)** |
|---|---|---|---|
| Erreurs vues, ensemble (81) | 9 (11 %) | 22 (27 %) | **49 (60 %)**, intervalle à 95 % : 50 à 70 % |
| Erreurs vues, moitié de **réglage** (41) | n. m. | 16 (39 %) | 31 (76 %), 61 à 86 % |
| Erreurs vues, moitié de **vérification** (40) | n. m. | 6 (15 %), 7 à 29 % | **18 (45 %), 31 à 60 %** |
| oubli / remplacement / ajout / verset sauté (sur 20 / 22 / 20 / 19) | 5 / 3 / 1 / 0 | 6 / 3 / 4 / 9 | 15 / 16 / 9 / 9 |
| Fausses alertes sur 50 séances **justes** | 2 | 1 | **0** |
| Fausses alertes sur 59 séances de **reprise, retour, mot répété** | 24 séances (reprise 9/20, retour 12/19, mot répété 3/20) | 8 séances | **3 séances** (reprise 2/20, retour 1/19) |
| Mots récités retrouvés à la fin | 97,7 % | 99,4 % | 99,8 % |
| Erreur dite : délai médian, pas de 0,5 s (32 séances) | 10,9 s | n. m. | **5,0 s** (fenêtre 10 s) / 4,9 s (fenêtre 6 s) |
| Mot dévoilé : médiane (pas de 0,5 s, mêmes 32 séances) | **1,24 s** | n. m. | 1,72 s (fenêtre 10 s) / 1,47 s (fenêtre 6 s) |
| Calcul par lecture, médiane (même période) | 0,31 s | — | 0,71 s / 0,61 s |

*n. m. = non mesuré sur ce découpage.* Intervalles : Wilson à 95 %.

**Objectifs NON atteints, à lire avant tout :**
1. **18 erreurs vues sur 22 (82 %) : non atteint.** 60 % sur l'ensemble, **45 % sur la moitié de vérification** (le chiffre à retenir). Les 76 %
   de la moitié de réglage sont optimistes (voir ci-dessous).
2. **Erreur dite en moins de 3 s : non atteint.** Médiane 4,9 à 5,0 s au pas de 0,5 s ; au mieux 3,8 s avec une fenêtre de 6 s et un
   réseau à 0,05 s (13 séances d'erreur seulement).
3. **Mot dévoilé en moins de 1,5 s : atteint à moitié.** Médiane 1,47 s avec la fenêtre de 6 s, mais **l'ancien mode était plus rapide
   (1,24 s) à charge égale** : la fenêtre calcule 2 fois plus par lecture. Ma conclusion de la phase 1 (« 1,6 → 1,43 s ») venait de deux
   périodes de charge différentes et **ne tient pas** ; elle est remplacée par ce tableau.
4. **Capacité : la fenêtre coûte environ 2,3 à 3,7 fois plus de calcul** que l'ancien mode (§ 5).

**Pourquoi 76 % puis 45 % ?** Les réglages (marge, veto, seuils : une vingtaine de combinaisons) ont été choisis sur la moitié « paire » des
séances, puis vérifiés sur la moitié « impaire ». L'écart (31 points ; test du χ² : p ≈ 0,005, intervalle de la différence ±21 points) n'est pas
du seul hasard de petit échantillon : (a) **sur-réglage** (la moitié de réglage a servi à choisir parmi ~20 configurations, ce qui gonfle son
score), et (b) **dispersion réelle** entre séances : les versets sautés sont vus 7 fois sur 10 dans une moitié et 2 sur 9 dans l'autre, selon que
les mots mal lus à la coupure tombent bien ou mal. Les gains des leviers eux-mêmes sont confirmés des deux côtés (phase 1 → phase 2 :
39 → 76 % et 15 → 45 %). La vraie performance attendue est donc **entre 45 et 60 %**, à confirmer avec de vraies voix (§ 9).

## 2. Décisions du référent appliquées (01/11/2026)

- **Entraînement** : la reprise, le retour en arrière et la pause ne sont jamais des erreurs ; « Un indice » est permis. Levier (4) conservé
  (§ 4) : on préfère rater une erreur que gronder un élève qui se reprend.
- **Mode « Récitation devant le maître » (test de hifẓ)**, ajouté : case sur l'écran de départ ; la reprise et la longue hésitation (silence de plus de
  4 s entre deux mots) sont comptées **à part** comme « hésitations », jamais comme des erreurs (`hesitations()` dans `@awform/hifz`, nombres
  renvoyés par l'API, jamais les mots) ; chaque « Un indice » est compté comme « **aide reçue** » ; le résultat affiche trois comptes distincts
  (erreurs signalées, hésitations avec le détail reprises / longues pauses, aides reçues) et rappelle que ce sont des comptes, pas une note ; le bilan de
  l'appareil garde ces deux nombres. Aucun mot n'est ajouté au texte coranique.
- **Waqf** : aucune règle nouvelle ; une pause n'est jamais signalée.

## 3. Banc 2 (reproductible)

`services/ecoute-ia/eval/` : `banc2.py` (séances), `banc.py` (lectures : `base` = ancien service, `fen` = fenêtre ; `TOPK=1` garde les
8 meilleurs jetons CTC par trame), `banc.mjs` (analyse en temps réel avec le code de l'appli), `banc.sh` (lancement), `sweep3.sh` (balayage de
réglages), `gop.py` (étude GOP). Graine fixe. 222 séances prévues, 205 lues pour la fenêtre (types bruit, téléphone, pause : 5 chacun seulement,
calcul limité ; 2 séances manquantes), 192 pour l'ancien service, 190 en commun.
- 44 passages, 11 récitateurs : les 5 du Complexe et 6 d'everyayah en **lecture seule** (`~/tajwid-donnees/everyayah` : Alafasy, Husary,
  Abdul Basit murattal, Sudais, Ali Jaber, Abu Bakr ash-Shaatree).
- 11 passages à **versets très proches** (mutashābihāt) trouvés par recouvrement des 3-grammes de mots du texte Tanzil (110 versets ont une
  sœur) ; 8 remplacements sont des « confusions » : le mot est remplacé par le mot du verset presque identique, du même récitateur.
- Quotas : juste 50, oubli 20, remplacement 22, ajout 20, verset sauté 19, mot répété 20, reprise 20, retour en arrière 19 (+ pause, bruit, téléphone).
- Lecture des séances au **pas de 1 s** (la VM saturée ne permettait pas mieux) ; la latence est mesurée à part au pas de 0,5 s sur 32 séances.
- Limites : récitateurs professionnels ; erreurs et reprises sont des collages d'audio (coupes) ; 44 passages ; les vraies voix d'élèves manquent.
- Incident de mesure : des conteneurs de lecture lancés par moi n'avaient pas été arrêtés par mes relances (le client `docker` tué ne les arrête
  pas) ; ils ont tourné en double pendant ~2 h, écrasé des fichiers de sortie et chargé la VM. Corrigé (arrêt par identifiant, séances relues ou
  reconstituées depuis les fichiers survivants, 205 séances uniques vérifiées). Aucun conteneur d'autrui n'a été touché.

## 4. Leviers essayés (réglage sur la moitié paire, vérification sur l'impaire)

**Retenus**
1. **Veto de la tête CTC** (`REGLAGES_ETAT.mode = 'veto'`) : un écart vu par le RNN-T est montré sauf si la CTC lit « ok » la moitié au moins des mots
   visés ; un mot **ajouté** exige toujours l'accord des deux. Moitié impaire : 7 → 17 erreurs vues sur 40 pour 1 fausse alerte de plus sur 25 justes.
2. **Marge de validation 0,5 s et attente d'accord 2,5 s** (avant : 1 s et 3,5 s) : +4 à +7 erreurs vues, 0 fausse alerte de plus sur les justes.
3. **Confiance minimale d'un remplacement 0,65** (avant 0,75) : +2 sur la moitié impaire.
4. **Attente en fin de liste (levier 4)** : en direct, un mot parmi les 2 derniers entendus n'est pas encore signalé « remplacé » ou « ajouté » (la suite peut
   montrer une reprise). Coût : ~10 points d'erreurs vues (70 → 60 % sur l'ensemble) ; gain : fausses alertes sur reprises / retours / mots répétés de
   12 % à 3 % des séances. **Conservé sur décision du référent.**
5. Les points 1 à 3 s'ajoutent aux acquis de la phase 1 : reprises et retours jamais « ajoutés », mots mal lus en série = doute.

**Essayés, non retenus (mesurés)** : tolérance aux lettres que la machine confond (ذ ز ظ ض د, ث س ص, ط ت, ح ه) : aucun gain, gardée désactivable
(`SEUILS.tolerance`) ; seuil « mot différent » plus haut : plus de fausses alertes ; coût plus élevé d'écarter un mot entendu qui ressemble au texte
(`coutAjFort`) : aucun gain, plus de fausses alertes ; ancrage d'un passage sauté (`ancrageMin`) : neutre sur ce banc, gardé (testé unitairement) ;
voix tolérée 2,5 ou 3 s : plus de fausses alertes. **GOP par alignement forcé CTC** (probabilité du mot attendu, pour séparer « mal lu » de « pas dit ») :
99,5 % des mots Tanzil sont tokenisables, mais sur 500 mots JUSTES le quart a un score ≤ −9,9 (−14 = absent) : inutilisable tel quel ; il faudrait un
treillis de segmentations et les logits complets. Non retenu.

**Pourquoi le reste est manqué** (32 manqués) : 11 ajouts dont le mot ajouté n'est pas lu par la machine (collage court, avalé) ; 10 versets sautés où
quelques mots entendus au hasard à la coupure s'attachent aux mots du passage sauté et sont tus par les règles « mots mal lus en série » ; des oublis
voisins de mots mal lus. Se taire dans le doute est le choix voulu.

## 5. Coût de calcul, latence et compromis (étape 3)

Pas de 0,5 s, 32 séances, mêmes séances pour les trois colonnes, VM chargée :

| | Ancien service | Fenêtre 10 s | Fenêtre 6 s |
|---|---|---|---|
| Calcul par lecture (médiane / 90ᵉ) | 0,31 / 0,78 s | 0,71 / 1,07 s | 0,61 / 0,84 s |
| Mot dévoilé (médiane) ; part < 1,5 s ; part < 3 s | 1,24 s ; 62 % ; 88 % | 1,72 s ; 42 % ; 87 % | 1,47 s ; 51 % ; 83 % |
| Erreur dite (médiane / 90ᵉ) | 10,9 s | 5,0 / 7,3 s | 4,9 / 5,7 s |
| Erreurs vues (13 séances d'erreur) | 1 | 6 | 6 |

- **Fenêtre de 6 s au lieu de 10 s** : −14 % de calcul, mot dévoilé −0,25 s, mêmes erreurs vues, une fausse alerte de moins. Meilleur compromis ;
  non basculé par défaut (13 séances d'erreur : trop peu pour trancher) — `ECOUTE_FENETRE_S=6` suffit à l'essayer.
- **Réseau** (fenêtre 6 s, aller-retour 0,30 / 0,15 / 0,05 s) : mot 1,67 / 1,47 / 1,24 s ; erreur 5,6 / 4,9 / 3,8 s.
- **Encodeur en streaming à contexte conservé** : non essayé ; le FastConformer de ce modèle (attention globale) n'a pas de version « cache-aware »
  disponible ; il faudrait un autre modèle (nouvelle évaluation de licence et de justesse).
- **Capacité** : 1,1 s de calcul par seconde d'audio en fenêtre contre 0,3 s : une séance « fenêtre » compte pour 3 séances ordinaires dans
  `ECOUTE_DIRECT_MAX` (`ECOUTE_FENETRE_POIDS`). Avec 6 : 2 séances à la fois sur 4 cœurs. À l'ouverture : serveur de calcul dédié ou carte graphique.
- **Piste à fort effet (non faite)** : séparer les deux rôles — dévoiler les mots par une lecture CTC courte (4 s, ~0,15 s de calcul, comme l'ancien
  mode) et décider des erreurs par la fenêtre. Rendrait le mot dévoilé aussi rapide que l'ancien mode (≈ 1,2 s) en gardant le gain sur les erreurs.

### Recommandation WebSocket (non codé)
- **Gain attendu** : chaque 0,1 s d'aller-retour en moins retire ≈ 0,1 à 0,15 s au mot dévoilé et ≈ 0,4 à 0,5 s à l'erreur dite (13 séances, bruité).
  Passer de 0,15 s à 0,05 s : mot 1,47 → 1,24 s (−16 %), erreur 4,9 → 3,8 s (−22 %). **Ne suffit pas** à passer sous 3 s.
- **Coût** : environ 3 à 4 jours (route WebSocket Fastify avec authentification à l'ouverture, relais vers le service avec file et contre-pression,
  reprise après coupure, configuration du proxy, tests unitaires et e2e), plus le risque d'exploitation (connexions longues, limites par compte).
  Le service gère déjà une file ; un seul canal par élève remplace une requête HTTP toutes les 0,5 s.
- **Recommandation** : (1) d'abord **mesurer l'aller-retour réel** des téléphones en bêta (une heure : horodater les requêtes actuelles) ;
  (2) faire la séparation « lecture rapide pour les mots » ci-dessus (gain de ≈ 0,5 s sur les mots, sans nouveau transport) ; (3) WebSocket seulement si
  l'aller-retour mesuré dépasse 0,2 s (réseaux mobiles d'Afrique de l'Ouest : probable), avec une cible de calcul ≤ 0,3 s par lecture (fenêtre 6 s,
  GPU ou modèle en flux continu) sinon le gain réseau est noyé dans l'attente.

## 6. Fonctions comparées aux autres applis (rappel, recherche du 01/11/2026)
Inchangé : suivi mot à mot, texte caché, détection d'erreurs, « Un indice » (peek), historique des erreurs (types, versets qui reviennent),
mode devant le maître (nouveau, hésitations et aide reçue à part). Sources : pages et blog de Tarteel, fiches tierces ; non vérifié sur l'appli ;
rien trouvé sur d'autres applis. Rien n'est copié de leur design ni de leur marque.

## 7. Questions religieuses / tajwīd (notées, non tranchées)
- Décidées par le référent (§ 2) : reprise, retour, pause, indice.
- À valider par un maître : le seuil de « longue hésitation » (4 s) ; qu'un verset sauté soit dit « sauté » (et pas « oublié ») ; le traitement
  des versets presque identiques (la machine ne sait pas lequel est visé : 1 fausse alerte sur 59 reprises / retours vient de « لعنة الله » / « غضب الله »).
- La tolérance aux lettres confondues (désactivée par défaut) mettrait de côté des différences de prononciation entre lettres proches : c'est du
  tajwīd, hors de ce que la machine juge.

## 8. Fichiers
`packages/hifz/src/{ecoute,suivi}.ts` (comparaison, veto, attente, ancrage, hésitations, fenêtre) ; `services/ecoute-ia/{ecoute,asr}.py` (mode
`fenetre`, poids des séances, top-k CTC) ; `apps/api/src/ecoute-ia.ts` (mode par défaut `fenetre`, `hesitations`) ;
`apps/web/src/lib/ecoute/` (fenêtre, indice, historique, mode devant le maître) ; `AWFORM_ECOUTE_SUIVI_MODE=suivi` ramène l'ancien mode.

## 9. Reste à faire (par ordre de valeur)
1. **Vraies voix** (30 adultes volontaires, puis enfants) avec le bouton « l'IA s'est trompée » ; remesurer ce banc : seule vraie réponse sur 45 ou 60 %.
2. Lecture rapide des mots + fenêtre pour les erreurs (§ 5) ; essayer la fenêtre de 6 s sur plus de séances.
3. Mesurer l'aller-retour réel en bêta, puis décider du WebSocket.
4. Ajouts non vus : détecter un mot de trop par la durée de voix inexpliquée plutôt que par le mot lu.
5. Versets sautés : meilleure gestion des mots mal lus à la coupure (ancrage plus tolérant, validé sur plus de séances).
6. Rappel espacé des versets fragiles ; reprise d'une séance interrompue ; autres applis à comparer.

## 10. Tests
- Unitaires : `packages/hifz` 94 (comparaison, reprises, mots mal lus en série, ancrage, hésitations, veto, fenêtre) ; API `shazam` + `a5` 23 ;
  web `src/lib/ecoute` + i18n 61 ; service Python 17 ; lint, prettier, svelte-check propres.
- e2e sous `flock ~/.awzid-e2e.lock` : `shazam.spec.ts` + `a5.spec.ts`, **16 réussis** (suivi par fenêtre, « Un indice », mode devant le maître, accessibilité AA).

## 11. Phase 3, palier 1 (01/11/2026) : décodage contraint par le texte attendu, détecteur de verset sauté, banc neutre

Branche `tarteel-titan-3-wip` (partie de 2a61e4b). Ce palier contient deux pistes et la partie neutre du banc. Les autres pistes viendront au palier suivant : treillis CTC pour les oublis, latence, autre modèle.

### Banc 3 : voix jamais utilisées pour le réglage
- Le **réglage** se fait sur le banc 2 seulement (190 séances, 11 voix).
- Le **banc 3** a été généré avec `banc2.py`, graines 301 et 302, sur 4 voix everyayah absentes du banc 2 (lecture seule) :
  - **vérification** : Abdullah Basfar et Muhsin al-Qasim, 147 séances ;
  - **neutre** : Ahmed al-Ajamy et Hani ar-Rifai, 147 séances.
- Chaque partie compte 88 erreurs (22 oublis, 22 remplacements, 22 ajouts, 22 versets sautés), 25 séances justes et 34 séances de reprise, retour ou mot répété.
- Les séances sont lues au pas de 1 s, fenêtre de 10 s, avec le top 16 des jetons CTC gardé par lecture.
- La partie neutre a été lue et mesurée **une seule fois**, après le gel des réglages.
- La vérification a servi à une seule comparaison (coût de saut −9 contre −7). La valeur réglée sur le banc 2 (−9) a été gardée.
- Husary Muallim et Abdul Basit Mujawwad sont écartés : ce sont les mêmes voix que dans le banc 2.

### Ce qui a été fait
1. **Décodage contraint** (`services/ecoute-ia/contraint.py`). Sur la tête CTC de chaque fenêtre, on cherche le meilleur chemin (Viterbi) dans un graphe construit à partir du texte attendu :
   - les mots attendus sont écrits en jetons du modèle. Jusqu'à 6 découpages par mot, avec et sans voyelles, car le modèle écrit parfois sans voyelles selon la voix. Les jetons sont comparés par squelette, et un jeton fait de voyelles seules compte comme un blanc ;
   - chaque mot peut être remplacé par un « bouche-trou » : un mot mal lu, ou écrit autrement par le modèle, n'est **pas** signalé par ce chemin ;
   - un chemin **hors texte** existe entre deux mots (mot ajouté) ;
   - les **retours en arrière** sont peu chers : reprise, retour au verset précédent, mot répété ;
   - des **sauts de 1 ou 2 versets entiers** sont possibles ;
   - le début et la fin sont libres.
   Un écart n'est dit que si au moins 2 mots reconnus suivent et s'il finit au moins 1 s avant le bord de la fenêtre. La règle du référent est donc tenue : rien sur les derniers mots entendus.
2. **Détecteur de verset sauté** : ce sont les arcs de saut du même graphe. Le saut l'emporte quand la suite entendue colle au début du verset n+2 ou n+3 et pas au verset n+1.
3. **Intégration** :
   - l'API envoie le texte attendu de la portion (mots Tanzil exacts, en mémoire seulement) au service, une fois, à l'ouverture d'une séance « fenêtre » : `POST /direct/{sid}/attendu` ;
   - le service ajoute `ecarts_texte` à chaque lecture ;
   - `FenetreSuivi` et `etatSuivi` (`@awform/hifz`) les ajoutent aux écarts, sans doublon avec la comparaison des mots ; les mots d'un verset sauté sont montrés oubliés ;
   - interrupteurs : `AWFORM_ECOUTE_TEXTE=off` (API), `ECOUTE_TEXTE=0` (service), `REGLAGES_ETAT.texte`.
   Le texte Tanzil n'est jamais modifié ni affiché autrement : la conversion vers l'écriture du modèle se fait en mémoire, pour le calcul seulement.
4. **Banc** :
   - `detecteur.py` rejoue le décodeur sur les lectures enregistrées ;
   - `banc.mjs` (`EXTRA=`) fait passer ses écarts **par le code de l'appli**, comme `ecarts_texte` ;
   - `banc.sh` accepte nice, mémoire, nom de conteneur, voix et graine ;
   - les pauses tiennent compte de la charge, de la mémoire et du disque ;
   - `fumee_texte.py` vérifie le décodeur dans le service, avec le vrai modèle : même résultat que le banc.

### Avant / après sur la partie NEUTRE (88 erreurs, voix al-Ajamy et Hani ar-Rifai ; intervalles de Wilson à 95 %)

| | Avant (phase 2) | **Après (palier 1)** |
|---|---|---|
| Erreurs vues | 39/88 (44 %) [34 ; 55] | **54/88 (61 %) [51 ; 71]** |
| oubli / remplacement / ajout / verset sauté (sur 22 chacun) | 13 / 11 / 4 / 11 | 14 / 11 / **8** / **21** |
| Fausses alertes, séances justes | 1/25 | 1/25 (même alerte, venue de la comparaison des mots) |
| Fausses alertes, reprise / retour / mot répété (séances) | 3/34 | 5/34 (+2 « ajouté » sur des reprises) |
| Fausses alertes, toutes séances normales | 4/59 (7 %) [3 ; 16] | 6/59 (10 %) [5 ; 20] |
| Erreur dite, délai médian / 90ᵉ (pas de 1 s) | 5,0 / 7,1 s | 4,7 / 6,9 s ; verset sauté : 3,8 s |
| Mot dévoilé, médiane | 1,18 s | 1,18 s (inchangé) |

- Le gain est apparié : 15 erreurs vues en plus, 0 perdue (test de McNemar, p < 0,001).
- **Vérification** (Basfar, Muhsin al-Qasim) :
  - 41/88 (47 %) [37 ; 57] → **59/88 (67 %) [57 ; 76]** ;
  - versets sautés 10 → **22/22**, ajouts 4 → 10/22 ;
  - fausses alertes inchangées : 0/25 justes, 2/59 séances normales.
- **Réglage** (banc 2) : 49/81 → 59/81 (73 %), fausses alertes 3/109 → 4/109.

### Ce qui a marché, ce qui n'a pas marché
- **Verset sauté : résolu sur ce banc.**
  - Le détecteur seul trouve 20 à 21 versets sautés sur 22, sans aucune fausse alerte.
  - Il les dit plus tôt (3,5 à 3,8 s, contre 5,5 s avant).
- **Ajouts : progrès modeste**, de 4 à 8 ou 10 sur 22.
  - Le mot ajouté est souvent absorbé : la tête CTC n'écrit presque rien (quelques trames de voix), ou le bouche-trou d'un mot voisin le couvre.
  - Baisser le coût du chemin hors texte (−10 au lieu de −12) ou le nombre de trames exigé (3 au lieu de 4) fait monter les fausses alertes sur les mots répétés et les reprises.
- **Essayés, non retenus** (mesurés sur le banc 2) :
  - « voix sans lettre lue entre deux mots » pour les ajouts que le modèle n'écrit pas : fausses alertes sur 46 à 109 des 109 séances normales, à cause des madd et des allongements. Option `trou`, laissée à 0 ;
  - persistance sur 2 lectures : moins d'ajouts vus, sans gain net ;
  - signalement des oublis par l'arc « oubli d'un mot » : 0 gain ;
  - bouche-trou moins cher : plus de fausses alertes.
- **Coût** :
  - environ 0,05 s de calcul Python par lecture (graphe limité à 70 mots autour de la position) ;
  - top 16 CTC pris sur le même encodeur, sans seconde lecture ;
  - fumée : 0,46 à 0,58 s par lecture au total, VM chargée.

### Objectifs
- **18 erreurs vues sur 22 (82 %) : NON atteint.** 61 % sur la partie neutre ; la borne haute de l'intervalle (71 %) reste sous 82 %.
- Ce qui manque, par type, sur la partie neutre :
  - versets sautés : 21/22, l'objectif est dépassé ;
  - ajouts : 8/22 ;
  - oublis : 14/22 ;
  - remplacements : 11/22.
- Pour atteindre 82 %, il faudrait environ 18 erreurs vues de plus sur 88. Elles ne peuvent venir que des oublis, des remplacements et des ajouts :
  - **oublis entourés de mots mal lus, et remplacements** : un score « mot présent / absent » par treillis complet (logits entiers, pas seulement le top 16) et un test de rapport de vraisemblance mot attendu contre bouche-trou. C'est la piste 3, prévue au palier 2 ;
  - **ajouts** : le modèle actuel n'écrit souvent pas le mot ajouté. Un détecteur acoustique (durée du mot anormale pour cette voix et ce mot) ou un modèle qui transcrit mieux les mots isolés serait nécessaire ;
  - **données** : de vraies erreurs d'élèves. Nos erreurs sont des collages de voix professionnelles, et le chiffre peut être optimiste ou pessimiste.
- **Erreur dite en moins de 3 s : NON atteint.** Médiane 4,4 à 4,7 s ; versets sautés 3,5 à 3,8 s. La latence est la piste 5 du palier 2.
- Fausses alertes : 2 séances de reprise de plus sur 59 dans la partie neutre (« ajouté »). Si le référent préfère zéro, on peut monter l'exigence à `apres: 3` (mesuré sur le banc 2 : 0 fausse alerte, mais 0 ajout vu par le détecteur).

### Tests
- service : 37 tests Python (dont 6 nouveaux pour `contraint`, 1 pour `/attendu`) ;
- `@awform/hifz` : 97 tests (dont 3 nouveaux pour `ecartsTexte`) ;
- API `shazam` et `a5` : 23 tests (texte attendu envoyé une fois en mode fenêtre, coupé par `AWFORM_ECOUTE_TEXTE=off`) ;
- web `src/lib/ecoute` : 25 tests ; `svelte-check`, `eslint` et `prettier` sont propres ;
- e2e sous `flock ~/.awzid-e2e.lock` : `shazam.spec.ts` et `a5.spec.ts`, 16 réussis (bureau et mobile).

## 12. Phase 3, palier 2 (03/11/2026) : treillis CTC, durée anormale, latence, autre modèle

Même branche, mêmes jeux que le palier 1 : réglage sur le banc 2 seulement (190 séances), puis banc 3 (vérification : Basfar, Muhsin al-Qasim ; neutre : al-Ajamy, ar-Rifai). Le disque de la VM ne contient plus l'audio des 4 voix everyayah de réserve : aucune voix neuve n'a pu être générée, la partie neutre a donc été vue une **seconde fois** (une seule configuration, celle gelée sur le banc 2). Scripts : `services/ecoute-ia/eval/palier2/`.

Règle de décision : un levier n'est gardé que s'il améliore la détection sans augmenter les fausses alertes sur les séances justes.

### Levier 1 : treillis CTC (oublis, remplacements) : NON GARDÉ (option `osub` laissée à 0)
- **Oubli** : un mot oublié apparaît dans le chemin comme un passage « bouche-trou » d'une trame sans voix entre deux mots reconnus. Règle `osub` : bouche-trou sans voix et mot attendu qui ne tient pas dans le trou (vraisemblance forcée − libre ≤ −30). Option `osub=1`, `o_llr=-30`.
- **Remplacement** : le mot attendu est-il moins bien expliqué que le meilleur AUTRE mot du Coran (lexique de 14 000 mots, treillis CTC groupé) ? Option `rsub=1`.

| | oubli | remplacement | ajout | verset sauté | fausses alertes séances normales (justes) |
|---|---|---|---|---|---|
| banc 2 (190), avant | 15/20 | 16/22 | 12/20 | 16/19 | 4/109 (0/50) |
| banc 2, `osub` | 17/20 | 16/22 | 12/20 | 16/19 | 4/109 (0/50) |
| banc 2, `osub` + `rsub` (−36) | 17/20 | 17/22 | 12/20 | 16/19 | 5/109 |
| banc 2, `osub` + `rsub` (−24) | 17/20 | 18/22 | 12/20 | 16/19 | 12/109 |
| vérification, avant → `osub` | 17 → 18/22 | 10 → 11/22 | 10/22 | 22/22 | 2/59 → 2/59 (0/25 → 0/25) |
| **neutre, avant → `osub`** | 14 → 16/22 | 11 → 12/22 | 8/22 | 21/22 | **6/59 → 12/59 (1/25 → 4/25)** |

- `osub` : +2 oublis sur le banc 2, +1 en vérification, +2 sur la partie neutre, mais les fausses alertes sur les séances justes passent de 1/25 à 4/25 sur la partie neutre (voix rapides qui avalent des mots courts). **Refusé** par la règle. Seuils plus stricts (−45, −60) : gain nul sur le banc 2.
- `rsub` : la vraisemblance d'un mot attendu contre un autre mot ne sépare pas un vrai remplacement d'un mot mal transcrit par le modèle (6 à 27 séances justes sur 50 déclenchées aux seuils qui trouvent 11 à 17 remplacements). Au seuil le plus sûr (−36) : +1 remplacement pour +1 fausse alerte. **Refusé.**
- Le code reste (option désactivée, `contraint.py` : `Lexique`, `vraisemblances`, `osub`, `rsub`) pour le palier suivant.

### Levier 2 : durée anormale (ajouts) : NON GARDÉ
Mesuré sur le banc 2 (13 700 frontières de mots) : durée du mot rapportée à la vitesse de la voix, et voix (VAD) dans le trou entre deux mots consécutifs.
- Durée ≥ 4 fois l'attendu : 4 ajouts sur 20, mais 23 séances justes sur 50 déclenchées.
- Voix dans le trou ≥ 1,6 s : 8 ajouts sur 20, 16 justes sur 50 déclenchées.
- Aucun seuil ne trouve des ajouts sans déclencher des justes (madd, pauses, respirations). Même cause que l'option `trou` du palier 1. Rien dans le code.

### Levier 3 : latence : objectif < 3 s NON ATTEINT
Erreur dite, médiane (pas de 1 s, fenêtre de 10 s) :

| | VM (banc 3 vérification) | estimation prod (1,5 CPU, 1 thread) |
|---|---|---|
| calcul par lecture (RNN-T + CTC) | 0,53 s (médiane) | 0,87 s, mesuré : 0,89 s (neutre) |
| mot dévoilé, médiane | 1,0 s | 1,75 s |
| erreur dite, médiane / 90ᵉ | 4,4 / 6,8 s | 5,2 / 7,8 s |

- Prod simulée : durées de calcul mesurées multipliées par 1,7 (rapport VM / prod mesuré sur des fenêtres de 10 s à 1,5 CPU, 1 thread), rejouées dans `banc.mjs`.
- `apres` et `marge` du décodage contraint (de 2 à 1, de 1,0 à 0 s) : résultats identiques à l'unité près. Le délai est fixé par la validation des mots de l'appli (accord entre deux lectures, marge droite 0,5 s, `forcer` 2,5 s), non par le décodeur.
- `forcer` 1,5 s : médiane 4,5 s (pas de gain) ; `forcer` 1,0 + marge 0,3 + tolérance 0,8 : 4,1 s, mais fausses alertes de 2/59 à 5/59. Non retenu.
- Encodeur en int8 (quantification dynamique des couches linéaires), 1 thread, 1,5 CPU : lecture double 1,37 s → 0,97 s, mais transcription RNN-T identique sur 9 fenêtres sur 14 et trames CTC identiques à 91 % : gain de 0,4 s sans effet sur l'objectif, précision à remesurer. Non retenu.
- Conclusion : < 3 s demande une autre architecture (modèle de flux à cache, lecture tous les 0,5 s, validation sans accord entre deux lectures), pas un réglage.

### Levier 4 : autre modèle : NON GARDÉ
- `tarteel-ai/whisper-base-ar-quran` (Apache, déjà sur la VM), 14 fenêtres de 10 s de séances justes du banc neutre, 1,5 CPU, 1 thread : erreurs de mots (squelette sans voyelles) **24,2 %** contre **18,3 %** pour le modèle actuel, et **19,6 s** par fenêtre contre 0,9 s. Pas de tête CTC ni d'instants de mots : inutilisable pour le direct.
- `Abdou/quran-asr-small` (MIT) et les données QDAT : non essayés (téléchargement non fait sans accord).

### Ce qui reste
Pas de gain ajouté sur le banc neutre : 54/88 (61 %) comme au palier 1. Piste suivante : un détecteur d'ajout et de remplacement appris sur de vraies erreurs d'élèves (données), un modèle CTC de flux, ou accepter ce niveau et signaler les mots ajoutés avec douceur.
