# Suivi de la récitation « Tarteel titan » (1er novembre 2026)

Branche `tarteel-titan-wip` (depuis `main` = c8b539f), interrupteur `shazam_coran` (canal bêta, inchangé). Rapport chiffré, fonctions
ajoutées, reste à faire. Mesures faites sur la VM `awform-dev` le 01/11/2026 (service réel : NeMo FastConformer RNN-T + tête CTC,
processeur seul, 4 cœurs, `nice 10`, VM chargée par d'autres travaux : charge 3 à 10 pendant les mesures).

## 1. Résumé

| | Avant | Après |
|---|---|---|
| Mot dévoilé, de la FIN du mot à l'affichage (médiane / 90ᵉ centile) | 1,6 s / 5,2 s | **1,43 s / 2,84 s** |
| Mots dévoilés en moins de 1,5 s / de 3 s | 48 % / 72 % | **54 % / 92 %** |
| Mots récités retrouvés à la fin (suivis) | 839 / 839 | 835 / 839 (99,5 %) |
| Erreur signalée, de l'erreur à l'écran (médiane / 90ᵉ) | 8,5 s / 15,2 s (11 s sur le jeu de 2026-10) | **4,7 s / 5,5 s** |
| Fausses alertes, récitations NORMALES (76 séances, dont 54 normales) | **24 alertes dans 8 séances** (reprise 3/6, retour au verset précédent 5/5) | **1 alerte dans 1 séance** (retour au verset précédent, 1/5) |
| Fausses alertes, récitations justes, bruitées, au téléphone, avec pause de 6 s, mot redit | 0 | 0 |
| Erreurs simulées vues (oubli, remplacement, ajout, verset sauté) | 8 / 22 | 7 / 22 |
| Calcul du service par lecture (médiane) | 0,31 s (une lecture par seconde) | 0,57 s (une lecture toutes les 0,5 s) |

Lecture honnête : **la vitesse d'affichage des mots et le silence sur les récitations normales sont nettement meilleurs ; les erreurs
sont dites deux fois plus tôt (4,7 s au lieu de 8,5 s), mais l'objectif « moins de 3 s » n'est pas atteint pour les erreurs** (il l'est pour
92 % des mots dévoilés ; la médiane des mots, 1,43 s, passe sous 1,5 s). Le nombre d'erreurs vues ne progresse pas (7 contre 8 sur 22,
l'échantillon est petit) : on a choisi de se taire dans le doute. **Le coût de calcul est multiplié par environ 3,7** (§ 5).

## 2. Banc de mesure (reproductible)

`services/ecoute-ia/eval/banc.py` (séances et lectures), `banc.mjs` (analyse avec le code de l'appli), `banc.sh` (lancement sous le verrou
de la VM). Graine fixe. Récitations RÉELLES du Complexe (5 récitateurs Ḥafṣ, lecture seule), 76 séances, 59,5 min :

| Type | Séances | Vérité attendue |
|---|---|---|
| juste | 15 | aucune alerte |
| bruit (bruit blanc à 15 dB sous la voix) · téléphone (bande 200-3 800 Hz, bruit, Opus 24 kb/s) | 8 · 8 | aucune alerte |
| mot répété · reprise (l'élève reprend 3 à 5 mots en arrière) · retour au verset précédent · pause de 6 s | 6 · 6 · 5 · 6 | aucune alerte (récitation normale) |
| oubli · remplacement · ajout · verset sauté | 6 · 6 · 5 · 5 | un écart sur le mot visé (± 1 mot) |

La séance est REJOUÉE EN TEMPS RÉEL : l'audio arrive à la vitesse de la parole (paquets de 0,256 s comme le navigateur), le client envoie
dès que la requête précédente est revenue, le service met le temps de calcul MESURÉ, le réseau coûte 0,15 s aller-retour (variable `RTT`).
À chaque réponse, le code de production (`etatSuivi`, `FenetreSuivi`, `comparer` de `@awform/hifz`) dit ce qui serait montré. Les instants
de référence de chaque mot viennent de la lecture de TOUTE la séance (`instantsDesMots`). Relancer :

```
BANC_DIR=~/tarteel2-banc bash services/ecoute-ia/eval/banc.sh sessions         # séances (≈ 25 min)
BANC_DIR=~/tarteel2-banc bash services/ecoute-ia/eval/banc.sh lire base        # service d'avant (≈ 23 min)
BANC_DIR=~/tarteel2-banc bash services/ecoute-ia/eval/banc.sh lire fen         # fenêtre glissante (≈ 80 min)
node services/ecoute-ia/eval/banc.mjs <tanzil-uthmani.tsv> ~/tarteel2-banc base:lect-base.json fen:lect-fen.json
# HIFZ=<dossier dist> compare avec un autre état du code ; REGLAGES='{"margeDroite":1}' ; RTT=0.3 ; DIAG=1 détaille les fausses alertes
```

Limites du banc : récitateurs professionnels (et non des élèves) ; bruit et téléphone SIMULÉS ; les coupes sont faites dans l'audio (une
reprise ou un retour est un collage, avec 0,5 s de silence) ; 76 séances sur 8 passages seulement (peu de diversité de texte) ; les erreurs
vues portent sur 5 à 6 séances par type (les pourcentages bougent beaucoup avec une séance). Les chiffres du banc ne remplacent pas la
mesure en bêta avec de vraies voix (§ 7).

## 3. Ce qui a changé

1. **Suivi par fenêtre glissante** (`FenetreSuivi`, `packages/hifz/src/suivi.ts` ; service : `mode=fenetre` dans `ecoute.py`). L'appareil
   envoie 0,5 s d'audio dès que la requête précédente est revenue ; le service relit les 10 dernières secondes (deux lectures, un seul
   encodeur) et renvoie les mots avec leurs instants. Un mot n'est VALIDÉ (donc susceptible de faire signaler un écart) que s'il est à plus
   de 1 s du bord de la fenêtre ET lu pareil, au même endroit, par la lecture précédente (accord entre lectures successives) ; après 3,5 s
   sans accord, la lecture la plus récente tranche. Les mots non validés dévoilent seulement le texte. Le service ne décide de rien et ne
   garde que la fenêtre (10 s) en mémoire, effacée à la fin (garanties inchangées, testées). Mode par défaut ; `AWFORM_ECOUTE_SUIVI_MODE=suivi`
   ramène l'ancien mode (passages relus avec contexte), sans autre changement. L'essai précédent (fenêtre naïve, § 10.4 de ECOUTE_IA.md :
   20 à 38 fausses alertes sur 40) échouait parce que chaque mot venait d'une seule lecture, coupée n'importe où.
2. **Reprises, retours et mots redits jamais signalés** (`comparer`). Un mot entendu qui répète des mots déjà dits (suite de 2 mots, ou mot
   collé à son semblable) et qui ne correspond à aucun mot attendu est retiré, puis on recompare : un retour au verset précédent n'est plus
   pris pour des « mots remplacés » ou « ajoutés ». Un refrain du texte redit comme prévu n'est jamais retiré (il est apparié). À lui seul,
   ce changement fait passer le mode d'avant de 24 à 3 fausses alertes sur les mêmes lectures.
3. **Mots mal lus en série = doute** : au moins deux mots entendus de suite sans correspondant (la machine a « halluciné » : un mot lu
   « لفضيلة الدكتور »…) ne font plus signaler ni remplacement ni ajout. Un seul mot entendu à la place d'un autre reste signalé s'il est sûr.
   Contrepartie mesurée : l'ancien mode perd ses « versets sautés » (4/5 → 0/5) qui n'étaient vus qu'à travers de tels mots ; en fenêtre : 2/5.
4. **Séance « fenêtre » plus lourde** : compte 3 séances ordinaires dans `ECOUTE_DIRECT_MAX` (variable `ECOUTE_FENETRE_POIDS`).
5. **Historique des erreurs** (comparaison avec les applis de mémorisation) : dans « À revoir », types d'écart sur les dernières séances et
   versets qui REVIENNENT d'une séance à l'autre, avec lien pour les revoir (`statistiquesErreurs`, `bilans.ts`). Des comptes, jamais une
   note ; gardé sur l'appareil seulement ; 5 langues.
6. **« Un indice »** (texte caché) : montre 2,5 s le mot attendu ensuite, en gris ; le nombre d'indices demandés est affiché ; ce n'est pas
   une erreur. 5 langues.
7. Aide du suivi : « quelques secondes après » au lieu de « une dizaine de secondes après ».

## 4. Fonctions des autres applis (recherche web du 01/11/2026)

Sources : pages et blog de Tarteel (App Store, tarteel.ai/blog : « Introducing Automatic Recitation and Memorization », « Introducing Mistake
Detection », « Tarteel Tutorials: Memorization Mistake Detection »), fiches tierces (similarlabs.com, g2.com). Non vérifié sur l'appli
elle-même ; les deux recherches n'ont rien donné sur les autres applis (Hifz, Ayat, Quran Pal…) : à compléter.

| Fonction chez Tarteel | Chez Awzid |
|---|---|
| Suivi mot à mot de la récitation (gratuit chez eux) | oui (existant) |
| Mode mémorisation : mots non récités cachés, dévoilés au fur et à mesure | oui (existant, texte caché) |
| Détection d'erreurs en direct : mot manqué, ajouté, remplacé | oui, plus tôt et sans fausse alerte sur les reprises (ce chantier) |
| Peek / versets cachés : voir un mot pour se rappeler | **ajouté : « Un indice »** |
| Historique des erreurs (« Historical Mistake Tracking ») | **ajouté : types d'écart et versets qui reviennent** (+ existant : « À revoir », justesse par page, progression par sourate) |
| Objectifs de mémorisation et de révision, séances reprises | existant en partie (khatma, plan du jour) ; reprise de séance : non |
| Mode écoute passive | existant (lecteur, récitateurs) |
| Rappel espacé (un rapport tiers non vérifié parle de FSRS) | non : voir § 7 |

Pas copié : leur présentation, leurs noms, leur marque. Rien de payant bloqué : tout reste dans l'interrupteur `shazam_coran`.

## 5. Coût de calcul et limites de capacité (à lire avant d'ouvrir)

- Mode d'avant : 0,31 s de calcul par seconde d'audio (médiane) ; fenêtre : **1,14 s par seconde d'audio** (0,57 s par lecture, une lecture
  toutes les 0,5 s : le service est à la limite de la cadence tant que le processeur est occupé par autre chose). Avec 4 fils : environ UN élève
  suivi à la fois par tranche de 4 cœurs ; `ECOUTE_DIRECT_MAX=6` accepte donc 2 séances « fenêtre ». À grande échelle : serveur de calcul
  dédié ou carte graphique (déjà noté dans ECOUTE_IA.md § 4).
- Sous charge, le client attend le retour de la requête précédente avant d'envoyer : le délai augmente mais rien ne s'empile.
- Un essai à fenêtre de 6 s (calcul plus court) était prévu ; voir § 8 pour son état.

## 6. Fiabilité : ce qui reste

- 1 fausse alerte sur 54 séances normales : un retour au verset précédent où le texte attendu et le verset redit se ressemblent (deux versets
  du Coran presque identiques : « لعنة الله » / « غضب الله ») ; la machine a bien lu, c'est la comparaison qui ne peut pas savoir lequel est
  visé. À garder en tête pour les passages « mutashābih ».
- Les mots mal lus par le modèle (« تفسير سورة الأعراف الدرس » lu à la place d'une suite de mots) sont maintenant en doute quand ils sont en
  série ; un mot isolé mal lu avec une forte confiance peut encore être signalé (rare : 0 sur 15 séances justes).
- Premier et dernier mot de la portion : jamais signalés (inchangé), basmala facultative, istiʿādha, āmīn, ṣadaqa-llāh : jamais signalés
  (existant, testé).

**Questions religieuses / tajwīd, notées sans trancher** : (1) une reprise ou un retour en arrière est ici traité comme NORMAL (jamais une erreur) ;
c'est une décision de produit à faire confirmer par un maître : en examen de hifẓ, reprendre un mot peut compter comme une hésitation ;
(2) les arrêts (waqf) : aucun traitement nouveau, une pause de 6 s au milieu d'un verset n'est pas signalée ; la reprise après un waqf
« mauvais » (arrêt sur un mot qui ne le permet pas) n'est pas évaluée (c'est du tajwīd, hors périmètre) ; (3) « Un indice » : à valider par un
maître pour l'usage en mode hifẓ (il montre un mot ; il ne note rien).

## 7. Reste à faire (par ordre de valeur)

1. **Vraies voix** (30 adultes volontaires, puis enfants) avec le bouton « l'IA s'est trompée » ; remesurer ce banc avec leurs séances.
2. **Moins de 3 s pour les erreurs** : la limite est la comparaison (un oubli n'est sûr qu'après le mot SUIVANT validé), pas le calcul.
   Pistes : encodeur « cache-aware streaming » (le contexte reste dans l'encodeur : fenêtre bien plus courte, coût divisé), WebSocket au lieu
   d'une requête HTTP par 0,5 s (−0,1 à −0,2 s), serveur de calcul avec carte graphique.
3. Plus de diversité de texte dans le banc (8 passages seulement) et plus de séances par type d'erreur (≥ 20).
4. Rappel espacé des versets fragiles (les versets qui reviennent dans l'historique pourraient alimenter le plan de révision du carnet).
5. Reprise d'une séance interrompue ; statistiques par mot (pas seulement par verset) ; objectif de révision quotidien relié à l'historique.
6. Comparer avec d'autres applis que Tarteel (non couvert par la recherche faite).

## 8. Tests

- Unitaires : `packages/hifz` 87 (dont `suivi-fenetre.test.ts`, 7 : validation par accord, bord de fenêtre, mot instable, oubli, durée de
  dévoilement ; `ecoute.test.ts` : reprises, retour au verset précédent, refrain, mots mal lus en série) ; API `shazam.test.ts` 12 + `a5.test.ts`
  11 (mode par défaut, retour à l'ancien mode) ; web `src/lib/ecoute` + `i18n` 61 (historique des erreurs) ; service Python 17
  (`test_ecoute.py` : mode fenêtre, mémoire bornée à la fenêtre, rien sur le disque, poids d'une séance fenêtre).
- e2e : `e2e/shazam.spec.ts` (suivi par fenêtre de bout en bout avec le service factice `ecoute-essai.mjs`, qui sait maintenant le mode
  `fenetre` ; « Un indice »), `e2e/a5.spec.ts` ; lancés sous `flock ~/.awzid-e2e.lock` (résultat dans le journal de la branche).
