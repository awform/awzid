# A5 — L'IA qui écoute la récitation (prototype du canal bêta)

Chantier A5, branche `a5-ecoute-wip`. Décision du client : prototype maintenant, derrière l'interrupteur
`ecoute_ia` (canal bêta). Ce document est le rapport chiffré (évaluation, choix du modèle, faisabilité du direct),
l'architecture et les limites. Mesures faites sur la VM `awform-dev` (8 cœurs, 4 utilisés), le 06/10/2026.

## 1. Règles appliquées (cahier des charges A5)

| Règle | Où elle est tenue |
|---|---|
| La machine ne repère QUE des mots (oublié, ajouté, remplacé, ordre, verset sauté), comparés au texte Tanzil (Ḥafṣ) | `packages/hifz/src/ecoute.ts` (`comparer`) ; aucune sortie phonétique, aucun modèle de prononciation (muʿallim écarté) |
| Jamais de tajwīd, jamais de note, jamais « valide » | textes `ec.*` ; e2e `a5.spec.ts` vérifie l'absence de « valid », « /20 », « parfait », « excellent » |
| Toujours une confiance ; en cas de doute : se taire | chaque écart a `confiance` ≥ 0,6 ; sinon « doute » (compté, jamais montré comme erreur) ; trop peu reconnu → « Je n'ai pas bien entendu, réessaie » |
| Mieux vaut rater une erreur que d'en signaler une fausse | seuils choisis sur les fausses alertes (§ 3) : **0 fausse alerte** sur 609 écoutes et 6 189 mots |
| En appui du maître | rappel permanent « Seul ton maître juge ta récitation » ; bouton « Envoyer au maître » (envoi du lot 16, son propre accord) |
| Voix jamais conservée | § 5 : mémoire seulement (memfd), conteneur en lecture seule, rien en base ni dans les journaux, tests |
| Accord « analyse vocale par IA » ; mineurs : parent | consentement F3 `analyse_vocale_ia` demandé au premier usage ; enfant : code parent ; mineur inscrit seul : refusé |
| Licences compatibles avec une application payante | `LICENCES.md` § 9 : NVIDIA FastConformer **CC-BY-4.0** (attribution) retenu |

## 2. Modèles comparés

| Modèle | Licence | Rôle |
|---|---|---|
| NVIDIA STT Arabic FastConformer Hybrid Large PCD v1.0 — **tête CTC** (décodage glouton maison) | CC-BY-4.0 | candidat rapide |
| le même — **décodeur RNN-T** (principal, confiance « max_prob » par mot) | CC-BY-4.0 | **retenu** |
| tarteel-ai/whisper-base-ar-quran | Apache-2.0 | candidat |
| obadx/muaalem-model-v3_2 | MIT (incomplète) | **écarté sans essai** : modèle de prononciation (phonèmes, tajwīd) — contraire aux règles |
| obadx/recitation-segmenter-v2 | MIT | non nécessaire (découpe aux pauses faite par l'énergie du signal) |

## 3. Évaluation

**Données** : récitations RÉELLES et justes du Complexe (fichiers par verset, 5 récitateurs Ḥafṣ : al-Akhḍar,
Ayyūb, al-Muʿayqilī, al-Ḥudhayfī, al-Muhannā), 40 portions de 2 à 4 versets tirées au hasard (graine fixe),
6 à 26 s chacune. **Erreurs simulées en découpant l'audio** (frontières des mots données par la machine, coupe au
milieu des intervalles entre mots) : mot coupé (oublié), mot remplacé par un mot d'une autre portion, mot ajouté,
deux mots voisins inversés, verset du milieu sauté — **203 cas** (40 justes, 163 erreurs), **2 063 mots**,
74 min d'audio. **Trois conditions** : `propre` (fichier du Complexe), `telephone` (bruit de fond ≈ 25 dB sous la
voix, bande 200-3 800 Hz, Opus 24 kb/s comme l'enregistrement du navigateur), `aigue` (+3 demi-tons, approximation
grossière d'une voix d'enfant). Une détection compte si un écart tombe sur le mot visé (± 1 mot) ; toute autre
alerte est une **fausse alerte**.

Outils : `services/ecoute-ia/eval/` (`evaluer.py` prépare et transcrit, `mesurer.mjs` compare avec le code de
l'appli, `diag.mjs` explique chaque cas manqué, `direct_sim.py` / `direct.mjs` pour le direct).

### 3.1 Résultats (seuils retenus : `SEUILS` de `ecoute.ts`)

NeMo **RNN-T** (retenu) :

| Condition | Fausses alertes | Oubli | Remplacement | Ajout | Inversion | Verset sauté | Calcul |
|---|---|---|---|---|---|---|---|
| propre | **0** (0 / 2 063 mots) | 50 % (67 % hors bords) | 53 % (58 %) | 62 % (67 %) | 71 % (78 %) | 78 % | 2,9 s par minute d'audio |
| téléphone | **0** | 55 % (73 %) | 55 % (55 %) | 62 % (67 %) | 71 % (78 %) | 78 % | 2,9 s/min |
| voix aiguë | **0** | 60 % (80 %) | 57 % (61 %) | 59 % (64 %) | 83 % (85 %) | 78 % | 3,0 s/min |

« Hors bords » : sans les erreurs portant sur le PREMIER ou le DERNIER mot de la portion, qui ne sont jamais
signalées par principe (on ne distingue pas « oublié » de « commencé plus loin » ou « arrêté avant ») ; l'appli dit
seulement, sans le compter en erreur, « la suite n'a pas été entendue (à partir du verset n) » ou « le tout début
n'a pas été entendu ». Récitations justes déclarées « pas compris » : 0 sur 40 ; erreurs : 2 à 3 sur 163.

NeMo **CTC** (mêmes seuils) — propre : fausses alertes 0 ; oubli 53 %, remplacement 45 %, ajout 28 %, inversion
66 %, verset sauté 78 % ; voix aiguë : **2 fausses alertes**. Plus rapide (2,2 s par minute) mais tronque des fins
de mots et colle des mots voisins (« لِلْمُتَّق », « المومنينعتذر ») : moins bon pour les ajouts.

Whisper (Tarteel) : voir § 3.3.

### 3.2 Calibrage (ce que les chiffres ont appris)

- Les instants donnés par les modèles sont des **pics** : le « trou » entre deux mots contient la fin prolongée
  (madd) des voisins. Le premier réglage (doute dès 0,3 s de voix dans le trou) faisait taire presque tous les
  oublis (38 %) ; à 1,5 s : 57 % sans fausse alerte de plus (CTC, propre).
- Les fausses alertes restantes venaient de mots COURTS avalés par la machine (« هو », « فهم ») ou de deux mots
  entendus en un (« نزل بساحتهم » → « نزاحتهم ») : un mot court oublié seul exige des voisins très sûrs (≥ 0,92),
  et un voisin reconnu imparfaitement (ressemblance < 0,9) fait douter → **0 fausse alerte** (au prix de 4 à 8
  points de détection sur les oublis).
- Confiance minimale d'un mot ajouté ou remplacé : 0,75 (au lieu de 0,8) : +6 à +12 points sur ces deux types,
  aucune fausse alerte de plus.
- Ces seuils ont été choisis SUR ces données : à revérifier sur de vraies récitations d'élèves (§ 7).

### 3.3 Whisper (Tarteel) — écarté

Évalué sur les 60 premiers cas, condition propre (périmètre égal pour les trois modèles, `SOUS=whisper`) :

| Modèle | Fausses alertes | Oubli | Remplacement | Ajout | Inversion | Calcul par minute d'audio |
|---|---|---|---|---|---|---|
| NeMo RNN-T | 0 | 42 % | 42 % | 50 % | 80 % | 2,5 s |
| NeMo CTC | 0 | 50 % | 50 % | 25 % | 80 % | 2,5 s |
| Whisper base (Tarteel) | 0 | 33 % | 50 % | 42 % | 70 % | **22,1 s** |

Whisper n'est pas meilleur, ne donne pas d'instants par mot (les oublis ne peuvent pas être vérifiés par le
silence) et calcule **9 fois plus lentement** : écarté. Entre les deux têtes de NeMo, le RNN-T l'emporte sur
l'ensemble des 609 écoutes (ajouts 62 % contre 28 %, voix aiguë sans fausse alerte) : **retenu**.

### 3.4 Vitesse sur processeur

(complété après les mesures de vitesse)

## 4. Suivi en direct (« comme chez Tarteel ») — faisabilité sur processeur

(complété ci-dessous après la simulation)

## 5. Architecture

```
appareil (lecteur Mémoriser, carnet)          API (Fastify)                         service « ecoute » (Python, CPU)
  « Réciter et vérifier » ──audio (Opus)──► POST /profiles/:id/ecoute/verifier ──► POST /ecouter
     accord au 1er usage                     interrupteur, accord, portion Tanzil      memfd → ffmpeg → RNN-T
     texte surligné ◄── écarts + positions ── comparer() (@awform/hifz)  ◄── mots, confiance, instants, zones de voix
  suivi en direct : PCM 16 kHz / 1 s ──────► POST /ecoute/direct/:sid ───────────► POST /direct/:sid
     comparer() sur l'appareil ◄──────────── mots sûrs (aux pauses) + partiels ◄──  passage transcrit puis effacé
```

- **Comparaison** (`packages/hifz/src/ecoute.ts`, partagée serveur / appareil) : normalisation pour COMPARER
  seulement (le texte Tanzil affiché n'est jamais modifié), alignement de coût minimal (mot pour mot, un mot écrit
  en un entendu en deux et l'inverse, lettres isolées « alif lām mīm », basmala facultative), puis décisions
  prudentes : oubli (silence à sa place, voisins sûrs), remplacement (mot sûr, différent), ajout (sûr, ni
  répétition de l'élève qui se reprend, ni isti'ādha / basmala / āmīn), ordre, verset sauté.
- **Service** (`services/ecoute-ia/ecoute.py`, `asr.py`) : file de traitement (2 calculs à la fois, 8 en
  attente, sinon 503 « réessaie dans un instant »), refus au-delà de 5 min, modèle monté en lecture seule.
- **API** (`apps/api/src/ecoute-ia.ts`) : interrupteur, accord (enfant : code parent), portion Tanzil, quota
  (60 vérifications par heure et par compte), séances du direct propres au compte, journal sans contenu.
- **Appli** (`apps/web/src/lib/ecoute/`) : bouton (coquille, 1 Ko), panneau, liste « À revoir » et bilans chargés
  À LA DEMANDE et jamais préchargés (`_app/ecoute.json`) ; textes `static/i18n/fr-ecoute.json` (+ 4 langues).

## 6. Voix jamais conservée — garanties testées

- Service : audio décodé depuis un **fichier anonyme en mémoire** (memfd, aucun nom, aucun disque) ; en direct,
  chaque passage transcrit est **effacé aussitôt**, la séance entière à la fin, après 20 s sans morceau ou à 5 min ;
  conteneur **en lecture seule**, `/tmp` en mémoire, aucun port, aucun secret, journal d'accès coupé.
  Tests `services/ecoute-ia/tests/test_ecoute.py` : aucun fichier créé (dossiers temporaires, mémoire partagée,
  dossier de travail) ni descripteur laissé ouvert après traitement ; séance effacée ; refus > 5 min ; file pleine.
- API : corps gardé en mémoire le temps de l'appel, jamais en base ni dans les journaux ; `a5.test.ts` vérifie
  qu'aucune récitation n'est enregistrée et que le journal ne contient ni audio ni mot entendu ;
  `a5-compose.test.ts` vérifie lecture seule, `/tmp` en mémoire, aucun port, aucun secret.
- Appareil : l'enregistrement reste en mémoire le temps du panneau ; il n'est gardé (7 jours, sur l'appareil)
  que si l'élève choisit « Envoyer au maître » ; les bilans ne gardent que des positions de mots.

## 7. Limites (à dire au client)

1. **Pas encore de vraies voix d'élèves** : évaluation sur des récitateurs professionnels (dont certains sont
   probablement dans les données d'entraînement du modèle) ; bruit et voix aiguë seulement simulés. Les fausses
   alertes et la détection doivent être remesurées en bêta, avec l'accord des familles — sans garder la voix :
   l'élève (ou le maître) dit « l'IA s'est trompée », seul le signalement est compté.
2. Environ **une erreur sur trois n'est pas signalée** (choix voulu : se taire dans le doute).
3. Le premier et le dernier mot de la portion ne sont jamais signalés (seulement « non entendu »).
4. Mots très courts (« لا », « ما », « هو ») : souvent tus.
5. Ḥafṣ seulement ; riwāyāt : non.
6. Le modèle n'a jamais été évalué sur des enfants réels ; la voix aiguë simulée n'en est qu'une approximation.
7. Lettres isolées (الم…) : jamais vérifiées.

## 8. Pour aller plus loin

- Mesurer en bêta avec le bouton « l'IA s'est trompée » (compteur sans voix) ; ajuster `SEUILS`.
- Si le direct est ouvert largement : passer en WebSocket et en flux continu (voir § 4).
- Attribution CC-BY-4.0 à ajouter dans « Garanties » à la sortie du canal bêta.
