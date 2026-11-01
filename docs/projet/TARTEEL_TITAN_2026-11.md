# Suivi de la récitation « Tarteel titan » (1er novembre 2026, phases 1 et 2)

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
