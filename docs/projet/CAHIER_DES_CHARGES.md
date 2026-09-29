# AWFORM — Cahier des charges de l'application en ligne

*Version 1.0 du 28/09/2026. Document de conception rédigé par Claude, **avant** le codage (qui commencera après la fin des livres). Aucun code n'a été écrit. Ce document s'appuie sur l'état réel du dossier de production au 28/09/2026 : `awform\REGLES_PERMANENTES.md`, `ETAT.md`, `SCHEMA.md`, `programme\*.md`, `registre\`, `NOTE_DIFFUSION.md`, `ADAPTATION_PAYS.md`, `TACHES_CLIENT.md`, les fichiers de données `awform\data\` et le moteur `awform\awform.js`.*

**Conventions de lecture**
- **[DÉCISION]** : choix de conception recommandé par Claude, à contester si besoin.
- **[ESTIMATION]** : chiffre calculé ou estimé, à confirmer (devis, grille tarifaire, mesure réelle).
- **[À VÉRIFIER]** : point juridique ou tarifaire qu'un professionnel (juriste, comptable) ou le client doit confirmer.
- **[MVP]** : fait partie du premier lot livrable ; **[V1]**, **[V2]** : lots suivants (section 6).
- Les codes de livres suivent le dossier de production : `en1`…`en5` (Enfants), `ado1`…`ado4` (Ados), `ad1`…`ad10` (Adultes), `re1`…`re5` (Religion Enfants), `ra1`…`ra4` (Religion Ados/Adultes, à venir), `qc1`…`qc3` (Lecture du Coran, à venir).

**Décisions du client prises en compte** : application **neuve**, conçue et codée de A à Z par Claude sur le curriculum AWFORM ; développement sur une **VM Linux** installée par le client (Ubuntu 26.04.1 LTS recommandée) ; l'ancienne application n'est pas reprise ; **Codex** n'intervient qu'en **audit indépendant, en lecture seule** ; codage **après la fin des livres** ; **audio en pause** (Azure TTS et récitations sous licence étudiées), mais l'architecture doit pouvoir l'accueillir sans refonte ; papier + PDF + application forment **un seul écosystème** et **le papier doit suffire seul** (REGLES §6).

---

## Résumé exécutif (une page)

| Question | Réponse courte |
|---|---|
| Quoi ? | Une **application web progressive (PWA)** installable sur Android, iPhone et ordinateur, qui reprend **exactement** les leçons des livres AWFORM (mêmes identifiants, mêmes exercices, mêmes corrigés) et y ajoute ce que le papier ne peut pas faire : correction immédiate, suivi, révisions espacées, suivi du hifẓ, tableaux de bord, classes et devoirs, certificats vérifiables. |
| Pour qui ? | Enfants (avec un parent), ados, adultes, enseignants, parents, responsables d'école, administrateur AWFORM ; Europe connectée et Afrique de l'Ouest à connexion faible. |
| Comment ? | **TypeScript de bout en bout** : interface **SvelteKit** (PWA, hors ligne, légère), API **Fastify** (Node.js 22 LTS), **PostgreSQL 16**, stockage objet S3 européen, tâches de fond **pg-boss**, déploiement **Docker Compose** derrière **Caddy**, hébergement **en Union européenne**. |
| Contenu | **Importé automatiquement** depuis `awform\data\*\lNN.js` (JSON strict via `AW.lesson`) : aucune ressaisie ; chaque import crée une **édition** versionnée ; les versets sont contrôlés **octet par octet** contre Tanzil. |
| Premier lot utile (MVP) | **Enfants N1 (en1) + Adultes N1 (ad1) + carnets de hifẓ E1 et N1 + compte parent avec profils enfants + compte adulte**, hors ligne, sans audio (mode « l'adulte lit »), en bêta privée gratuite pour la classe pilote. |
| Effort | **MVP ≈ 50 jours de travail de Claude** ; **V1 complète (toutes filières, enseignants, bilans, paiements) ≈ 115 à 135 jours** au total [ESTIMATION]. |
| Coût d'exploitation | **≈ 40 à 120 €/mois** au lancement, **≈ 150 à 400 €/mois** vers 5 000 à 10 000 comptes actifs [ESTIMATION], hors frais de paiement et hors audio. |
| Ce que le client doit faire | Créer lui-même les comptes (hébergeur, domaine, paiement, e-mail, dépôt de code, magasins), fournir la VM, choisir la structure juridique, faire relire CGU/CGV/confidentialité (section 7). |

---

## 1. Vision, publics et contextes

### 1.1 Vision

AWFORM enseigne l'arabe, le Coran, les sciences islamiques et l'écriture à des **francophones**. Le curriculum existe déjà sous forme de livres (livre de l'élève, cahier d'écriture ou d'activités, guide de l'enseignant) pour 24 niveaux publiés ou en cours, plus des carnets de hifẓ, des lectures graduées et un dispositif d'évaluation. L'application n'invente pas un nouveau programme : elle **donne vie au même programme**.

Principes directeurs **[DÉCISION]** :
1. **Un seul curriculum, trois supports.** Une leçon de l'application = la leçon du livre (même identifiant `en1.l05`, même titre, même numéro affiché « Leçon 5 » ou « Bilan 1 », mêmes exercices, mêmes réponses). Un élève peut passer du papier à l'écran et inversement sans se perdre.
2. **Le papier suffit seul ; l'application ajoute.** Aucune activité indispensable n'existe *uniquement* dans l'application. Ce qu'elle apporte : correction immédiate, suivi, répétition espacée, audio (plus tard), tableaux de bord, organisation de classe.
3. **Sobriété numérique.** L'application doit fonctionner sur un Android d'entrée de gamme, avec une connexion 3G intermittente et des données chères : téléchargements explicites et mesurés, fonctionnement hors ligne, pas de vidéo imposée.
4. **Fidélité religieuse et pédagogique non négociable.** Ḥafṣ uniquement, texte coranique Tanzil exact, aucune phonétique latine pour les élèves, aucun visage, école mālikite, bienveillance (on encourage, on ne sanctionne pas).
5. **Protection des mineurs et minimisation des données** dès la conception (RGPD, art. 25 : protection des données dès la conception et par défaut).
6. **Indépendance et réversibilité.** Code, données et comptes appartiennent au client ; technologies ouvertes et courantes ; pas de dépendance à un service propriétaire difficile à quitter.

### 1.2 Le curriculum à servir (état au 28/09/2026)

| Filière | Codes | Contenu dans `awform\data\` | Particularités pour l'application |
|---|---|---|---|
| Enfants (5-12 ans) | en1 → en5 | 26 fichiers en1 (dont `book.js`), 25 leçons/bilans par niveau ensuite | lettres colorées (balisage `[..]`), scènes illustrées, tracé des lettres, étoiles, dictées lues par l'adulte |
| Ados (13-17 ans) | ado1 → ado4 | 25 unités par niveau | encadrés `defi`, `mise_en_route_fr`, ton « collège/lycée », parents désignés « الْأُمُّ / الْأَبُ » |
| Adultes | ad1 → ad10 | 25 unités par niveau (ad10 en cours de rédaction : 16 fichiers au 28/09) | `travail_perso_fr`, `lexique`, séances de 2 × 1 h 15 à 3 × 1 h 40, consignes de plus en plus en arabe seul |
| Religion Enfants | re1 → re5 | 27 unités par niveau | `rubriques[]` (aqida, sira, anbiya, fiqh, adab, dua, hadith), 12 types d'exercices propres, carnet de pratique, suivi des sourates |
| Religion Ados/Adultes | ra1 → ra4 | à venir (architecture en cours) | réutilise le moteur Religion |
| Lecture du Coran | qc1 → qc3 | à venir (qāʿida + tajwīd) | tracé et lecture de syllabes, fort besoin d'audio |
| Hifẓ | `data/hifz/<code>.js` | 13 carnets (E1-E5, N1-N8) + `commun.js`, `adab.js`, `tajwid.js` ; N9-N10 à faire | plan de portions par semaine, répétition espacée J+1…J+30, roue du manzil, validation par le maître /20 |
| Lectures graduées | `data/lect/<niveau>-NN.js` + `catalogue.js` | 62 livrets rédigés (2 séries) | pages illustrées, traduction repliable, questions, glossaire, tampon « J'ai lu ce livre » |
| Évaluations | `data/eval/*.js` | référentiel (150 descripteurs), tests de positionnement E/A, règles, certificats, livret | positionnement, bulletins, certificats et diplôme |

Volume mesuré le 28/09/2026 : **602 fichiers de leçons et bilans** (≈ 28 Mo de JSON), **4 316 exercices** répartis en **20 types**, registre de **731 versets**, **≈ 813 références de hadiths**, **202 règles de fiqh**, 49 fichiers d'illustrations SVG (≈ 1,3 Mo).

### 1.3 Publics et besoins

| Public | Âge / profil | Ce qu'il fait dans l'application | Contraintes |
|---|---|---|---|
| **Enfant avec parent** | 5-12 ans (en1-en5, re1-re5) | fait les exercices de sa leçon, trace les lettres, gagne des étoiles, coche son carnet de hifẓ et de pratique, lit ses petits livres | pas de compte à lui (profil rattaché au parent) ; pas d'e-mail ; pas de messagerie ; écrans simples, gros boutons, peu de texte français à lire seul en E1-E2 ; consignes lues par l'adulte |
| **Ado** | 13-17 ans (ado1-ado4) | travaille en autonomie, reçoit des devoirs, voit sa progression, défis | compte propre possible **rattaché à un parent** (consentement parental sous 15 ans, section 4.6) ; messagerie limitée à l'enseignant, visible du parent |
| **Adulte** | 14 ans et plus en ad1, adultes ensuite | parcours complet ad1-ad10 et religion ra1-ra4, hifẓ, révisions, examens | autonomie, sessions longues sur ordinateur en Europe, courtes sur téléphone en Afrique |
| **Parent / tuteur** | adulte responsable | crée les profils de ses enfants, donne les consentements, suit la progression, signe le carnet de pratique et le carnet de hifẓ (validation « d'entraînement »), lit les consignes d'écoute et les dictées, paie l'abonnement | souvent peu arabophone : tout le guide parent est en français ; parfois un seul téléphone pour toute la famille |
| **Enseignant** | école du week-end, madrasa, daara, professeur particulier, formateur en ligne | crée des classes, assigne des leçons et devoirs, corrige ce qui ne se corrige pas automatiquement (oral, dictée, production, questions ouvertes), valide le hifẓ (validation « officielle »), saisit les notes d'une **classe papier**, projette une leçon en classe, organise des cours en visio | doit pouvoir travailler avec des élèves **sans écran** (saisie des notes de bilans papier) ; guide et corrigés accessibles à lui seul |
| **Responsable d'école** | directeur, coordinateur | gère les enseignants, les classes, les licences d'élèves, les certificats de son école, les statistiques agrégées | données de son établissement uniquement |
| **Administrateur AWFORM** | le client et son équipe | importe et publie les éditions du contenu, gère les comptes et les écoles, les tarifs et codes d'activation, la modération, suit le **registre** (statuts VERIFIE, REFERENCE_A_CONFIRMER, VALIDATION_HUMAINE_REQUISE…), supervise | accès fort, journalisé, authentification à deux facteurs obligatoire |
| **Référent religieux** (rôle distinct) | enseignant mālikite qualifié désigné par le client | consulte la liste des points du registre à valider, les valide ou les commente ; **c'est le seul rôle qui peut poser `validation_humaine = vrai`** | accès en lecture au contenu et au registre, écriture limitée à la validation ; chaque validation est signée (nom, date) et journalisée |

### 1.4 Contextes d'usage

**Europe connectée (France, Belgique, Suisse)** : smartphones récents, ordinateurs, tablettes ; fibre ou 4G/5G ; paiement par carte ou prélèvement SEPA ; attentes élevées de finition ; usage familial le soir et le week-end, écoles du week-end ; exigences fortes RGPD et accessibilité.

**Afrique de l'Ouest (Sénégal, Mali, Côte d'Ivoire, Guinée, Burkina Faso)** : téléphones Android d'entrée de gamme (1 à 3 Go de mémoire vive, 16 à 32 Go de stockage souvent saturé, marques Tecno, Infinix, itel, Samsung série A) ; données mobiles achetées par petits forfaits, connexion 3G/4G intermittente, coupures d'électricité ; paiement par **mobile money** (Wave, Orange Money, MTN) ; beaucoup de familles et de daaras **sans écran** (papier seul) ; partage de fichiers par **WhatsApp** et clé USB ; monnaies **FCFA (XOF)** et **franc guinéen (GNF)**.

Conséquences de conception **[DÉCISION]** :
- **Hors ligne d'abord** : une fois un niveau téléchargé, toutes les leçons, exercices, tracés et carnets fonctionnent sans réseau ; la progression est synchronisée au retour du réseau.
- **Budget de poids** : application initiale ≤ 250 Ko transférés (compressés) avant la première leçon ; un **paquet de niveau** (leçons + illustrations) ≤ 1,5 Mo compressé [ESTIMATION à mesurer, section 4.3] ; le poids s'affiche **avant** chaque téléchargement ; option « télécharger seulement en Wi-Fi ».
- **Pas de vidéo** dans le parcours obligatoire ; l'audio, quand il reviendra, sera téléchargeable par niveau ou à la demande, jamais en lecture automatique.
- **Écrans lisibles au soleil** (contraste élevé), **tailles de police arabe généreuses** (30 px en E1-E2, 26 px en E3-N1, 22 px au-delà, comme les lectures graduées), boutons de 48 px minimum.
- **Un téléphone, plusieurs profils** : changement de profil rapide, parent protégé par un code.
- **Pont avec le papier** : QR code par leçon, saisie des notes d'une classe papier, PDF et fiches imprimables générés par l'application.

---

## 2. Parcours et fonctionnalités

### 2.1 Carte des fonctionnalités par lot

| Domaine | MVP | V1 | V2 et plus tard |
|---|---|---|---|
| Comptes | parent + profils enfants, adulte, consentements, suppression | ado rattaché, enseignant, école, rôles, 2FA admin obligatoire | connexion par carte QR de classe, SSO école |
| Parcours | en1, ad1 | toutes les filières disponibles : en1-en5, ado1-ado4, ad1-ad10, re1-re5 | ra1-ra4, qc1-qc3, maternelle, guide des parents |
| Leçon interactive | 8 types « langue » corrigés automatiquement | 12 types Religion + réponses libres corrigées par l'enseignant | exercice `bd`, dialogue au format « messages » (souhaits Ados) |
| Écriture | tracé guidé des lettres (couloir + sens d'écriture) | tracé des mots, dictée sur papier photographiée (option) | reconnaissance simple des lettres isolées |
| Hifẓ | carnets E1 et N1 : plan, 3 pistes quotidiennes, répétition espacée, validation parent | tous les carnets, validation par l'enseignant /20, récital, certificat de hifẓ | enregistrement vocal pour l'enseignant (sous conditions strictes) |
| Révisions | révision des mots de la leçon (cartes) | répétition espacée FSRS de tout le vocabulaire et des mots coraniques | révision personnalisée par compétence du référentiel |
| Bilans et examens | bilans en mode entraînement (sans note officielle) | bilans et examens notés, textes « non préparés », barèmes /20 et /100 | positionnement en ligne |
| Tableaux de bord | parent et adulte | enseignant, école, administrateur | statistiques pédagogiques par item |
| Classes et devoirs | — | classes, devoirs, correction, classe papier | calendrier de séances, présence |
| Cours en ligne | — | liens de visio externes planifiés | intégration d'un service de visio européen |
| Messagerie | — | messages enseignant ↔ parent et annonces de classe | messages enseignant ↔ ado (visibles du parent) |
| Certificats | — | certificats de niveau et de hifẓ vérifiables par QR | diplôme AWFORM, livret de progression complet |
| Papier ↔ application | QR par leçon (page publique de la leçon) | codes d'activation imprimés dans les livres | fiches imprimables personnalisées |
| Paiement | — (bêta gratuite) | abonnement en euros (prestataire de paiement) | passes FCFA/GNF par mobile money, licences d'école |
| Audio | architecture prête, boutons masqués | selon la décision du client | voix humaines, récitations sous licence |

### 2.2 Parcours par filière

Chaque filière est un **parcours ordonné de niveaux** ; chaque niveau est une **suite d'unités** (leçons, bilans, examen) dans l'ordre du livre (`n` = rang du fichier). L'application respecte les **raccordements** prévus par les architectures de programme.

**Règles communes [DÉCISION]**
- L'ordre du livre est l'ordre par défaut ; une leçon est **« ouverte »** si la précédente a été commencée (pas de blocage dur : l'enseignant ou le parent peut tout déverrouiller ; un adulte peut sauter une leçon).
- **Progression d'une leçon** = moyenne des exercices notés faits (score par item) ; une leçon est **« terminée »** quand tous les exercices notés ont été faits au moins une fois et que l'auto-évaluation (`checklist`) est cochée ; **« maîtrisée »** quand le score est ≥ 80 %.
- **Bilans** : notés sur 20 (barème `guide.bareme`), seuil de reprise **8/20** (REGLES §4) ; en dessous, l'application propose les leçons à revoir (celles couvertes par le bilan) et la remédiation du guide.
- **Examen de fin de niveau** : /100 selon la grille de chaque cycle (`regles.js`, programme § 4) ; ≥ 80 mention, 60-79 validé, 40-59 validé avec plan de remédiation, < 40 reprise.
- **Test de positionnement** (V2) : `pos-en.js`, `pos-ad.js` ; en V1, l'enseignant ou le parent choisit le niveau de départ, avec les raccordements ci-dessous affichés comme conseils.

**Enfants (en1 → en5)**
- Profil enfant créé par le parent (prénom ou pseudonyme, année de naissance, niveau). Consignes françaises **lues par l'adulte** en E1-E2 (bouton « lire la consigne » pour le parent, pas de synthèse vocale imposée).
- Écran de leçon calqué sur le gabarit du livre : ouverture illustrée, je découvre, je lis (syllabes, ligne de lecture, vedette, phrases), mes mots, j'écris (renvoi au tracé), je m'entraîne (exercices), je parle (dialogue), Coran et tajwid, adab, mon bilan en étoiles.
- **Récompenses** : étoiles par exercice et par leçon, comme dans le livre ; **aucun classement** entre enfants (voir section 3.6).
- Lectures graduées placées après la leçon indiquée (`place_apres`) : « Je lis mon petit livre ».
- Carnet de hifẓ E1-E5 en parallèle (section 2.6) ; carnet de pratique de la collection Religion (re1-re5) coché par l'enfant et **signé par un parent**.

**Ados (ado1 → ado4)**
- Entrées prévues par `ados_architecture.md` : débutant de 13 ans et plus → ado1 L1 ; lecteur fluide → ado1 L9 (voie rapide) ; sortie de E3 → ado2 ; sortie de E4 → ado2 ou ado3 après test ; sortie de E5 → ado3.
- Sorties : **ado n ≡ Adultes N(n+1)** ; bascule possible vers Adultes à la fin de chaque niveau (l'application propose le niveau correspondant).
- Encadrés `defi` (défis chronométrés facultatifs, sans classement public), `mise_en_route_fr`, projets de fin de niveau (travail rendu à l'enseignant).

**Adultes (ad1 → ad10)**
- Parcours en 5 cycles de 2 niveaux (jalons certifiants en N2, N4, N6, N8, N10).
- `travail_perso_fr` affiché comme devoir personnel ; `lexique` alimente les révisions espacées.
- Mode « séance » : l'adulte peut suivre le déroulé du guide en autonomie (séance 1 / séance 2), avec un minuteur facultatif.
- À partir de N7, textes authentiques longs : lecture confortable (taille réglable, mode sans voyelles/avec voyelles quand le livre le prévoit), pas de défilement horizontal.

**Religion Enfants (re1 → re5) et Religion Ados/Adultes (ra1 → ra4, à venir)**
- Les rubriques (`aqida`, `sira`, `anbiya`, `fiqh`, `adab`, `dua`, `hadith`) s'affichent comme dans le livre, avec leurs pastilles de couleur (`codes`).
- Renvois `renvoi_langue` / `renvoi_religion` : liens cliquables vers la leçon correspondante de l'autre collection (grâce à l'index des leçons, `index-lecons.js`).
- Suivi des sourates (`book.js` → `sourates`) relié au carnet de hifẓ.
- Carnet de pratique (`carnet`) : 7 cases par ligne, cochées par l'enfant, signature du parent ; **jamais noté**, jamais de message culpabilisant (règle du livre : « le carnet sert à encourager, jamais à sanctionner »).

**Lecture du Coran (qc1 → qc3, à venir)**
- Même lecteur de leçons ; forte dépendance à l'audio (qāʿida) : en l'absence d'audio, mode « l'enseignant lit » (section 2.3.3).

**Hifẓ** : section 2.6. **Lectures graduées** : section 2.7.

### 2.3 La leçon interactive

#### 2.3.1 Principe de rendu

Le lecteur de leçon est un **nouveau moteur de rendu** écrit en composants (Svelte), qui reproduit le rendu du moteur des livres (`awform.js`, 140 Ko) **au pixel près là où c'est utile** (couleurs des lettres, scènes, blocs Coran) et l'adapte à l'écran de téléphone (une section par écran, défilement vertical). Le moteur des livres sert de **spécification de référence** ; les règles de visibilité qu'il applique sont reprises à l'identique :
- le balisage `[..]` colore la lettre étudiée selon sa position dans `lettres` (rouge, bleu, vert, or), avec reconnaissance des digraphes par préfixe le plus long ; segments hors `lettres` en or ;
- les champs `tr` (translittération) ne sont **jamais** affichés ;
- les champs du guide (`guide.*`, `fiqh_adab.guide_fr`, `coran.tajwid.guide_fr`, `sources_fr`, corrigés) ne sont **jamais envoyés** à un appareil d'élève (section 5.4 : projection « élève ») ;
- bilans et examens : rendu `lectureBilan` (textes, dialogues, versets sans traduction, `fiqh_adab.points` seuls), `lecture.phrases_masquees` non rendues, traductions masquées pour `type:"examen"` et `lecture.sans_traduction:true`, textes `non_prepare` remplacés par l'encadré « Texte remis par l'enseignant le jour de l'épreuve » (section 2.8) ;
- scènes composées à partir de `scene` (lieu + personnages + objets), personnages **sans visage** (`illus/zz-sansvisage.js` appliqué en dernier).

#### 2.3.2 Types d'exercices du moteur (inventaire complet)

Inventaire établi en lisant `awform.js` (fonctions `exercise`, `EXR`, `ansBlock`, `ANS`, `NOSCORE`) et en comptant les exercices des 602 fichiers le 28/09/2026. Normalisation de comparaison du moteur : `plain(s)` retire les crochets `[..]` ; `bare(s)` retire en plus voyelles, tanwīn, chadda, soukoun, petit alif et tatwīl.

**A. Types « langue » (toutes collections) — tous corrigés automatiquement**

| Type | Nb | Format de données | Interaction à l'écran | Correction |
|---|---|---|---|---|
| `premiere_lettre` | 27 | `items[{img, suite, reponse, options[3], mot, fr}]` | image + mot amputé de sa 1re lettre ; choisir la lettre | **auto** : choix = `reponse` |
| `chasse` | 18 | `{cible, grille[18]}` | grille de 18 lettres ; toucher toutes les occurrences | **auto** : `bare(case) = bare(cible)` ; total = nombre d'occurrences |
| `relier` | 290 | `items[{ar, img?, fr}]` (4) | relier chaque mot arabe à son image (ou à son sens français si pas d'image) ; colonne de droite décalée | **auto** : paire (i, i) |
| `ecoute` | 224 | `items[{options[3], dit, reponse?}]` | écouter, puis choisir | **auto** : choix = `plain(reponse ‖ dit)` ; **dépend de l'audio** (voir 2.3.3) |
| `vrai_faux` | 499 | `items[{img?, ar, fr, vrai, correction_ar}]` | phrase (sous une image) ; vrai ou faux | **auto** ; après réponse, `correction_ar` affichée si faux |
| `complete` | 1 563 | `items[{avant, apres, options, reponse, fr}]` | phrase à trou ; choisir l'option | **auto** : `plain(choix) = plain(reponse)` ; `fr` affiché (jamais la réponse) |
| `contient` | 234 | `{cible, mots[8]{ar, oui}, oui_fr?, non_fr?}` | toucher les mots qui contiennent la lettre (ou tri épais/fin…) | **auto** : total = nombre de `oui` |
| `ordre` | 415 | `items[{mots[], phrase, fr}]` | remettre les étiquettes dans l'ordre ; bouton « recommencer » | **auto** : concaténation (espace, ou collée si `phrase` sans espace : ordre de syllabes) = `plain(phrase)` |

**B. Types « Religion » notés — corrigés automatiquement**

| Type | Nb | Format de données | Interaction | Correction |
|---|---|---|---|---|
| `qcm` | 137 | `items[{q_ar?, q_fr, img?, options[] (texte, clé d'image ou {ar, fr, img}), reponse (texte ou index)}]` | choisir une réponse | **auto** : index calculé (`qAns`) |
| `etapes` | 51 | `items[{ar?, fr, img?}]` dans l'ordre correct | toucher les étapes dans l'ordre | **auto** : ordre des indices |
| `frise` | 53 | `items[{ar?, fr, img?, rang, date_fr?}]` | placer les événements sur une frise | **auto** : ordre par `rang` |
| `classer` | 113 | `colonnes[{ar?, fr}]`, `items[{ar?, fr, img?, col}]` | déposer chaque carte dans sa colonne (toucher-toucher, sans glisser obligatoire) | **auto** : `col` |
| `trous` | 115 | `texte_ar` ou `texte_fr` avec `___`, `reponses[]`, `banque[]?` | remplir chaque trou depuis la banque de mots | **auto** : `plain(mot) = plain(reponses[i])` |
| `qui_suis_je` | 81 | `items[{indices_fr[], reponse_ar?, reponse_fr}]` | plusieurs items : choisir la bonne identité ; un seul item : « je vérifie la réponse » | **auto** si ≥ 2 items ; **auto-évaluation** si 1 item |

**C. Types sans note (NOSCORE dans le moteur)**

| Type | Nb | Format | Dans l'application | Correction |
|---|---|---|---|---|
| `question` | 100 | `items[{q_ar?, q_fr, lignes, reponse_fr (réponse modèle), criteres_fr?}]` | réponse libre (clavier, ou « j'ai répondu sur mon cahier ») ; réponse modèle visible **après** envoi (mode autonome) ou seulement par l'enseignant (mode classe) | **par l'enseignant** (facultatif) ou **auto-évaluation** comparée à la réponse modèle ; jamais de note |
| `tracer` | 126 | `formules[]` (mots ou formules à tracer) | tracé au doigt sur pointillés (section 2.4) | **guidage automatique** du tracé (sens, couloir) ; pas de note |
| `coloriage` | 124 | `img`, `consigne_fr` | coloriage de l'image SVG par zones (toucher une zone + couleur) | aucune |
| `carnet` | 123 | `jours`, `lignes[{ar, fr}]` | tableau de cases à cocher sur 7 jours + « signature » du parent (validation dans son espace) | aucune (encouragement) |
| `memo` | 75 | `sourate`, `versets[]` | suivi de mémorisation (J'écoute, Je répète, Je récite seul, Validé par l'enseignant), relié au carnet de hifẓ | validation par l'enseignant (4e colonne) |
| `dessin` | 48 | `cadre` | « Je dessine sur mon cahier » ; photo facultative envoyée à l'enseignant (V2, sans visage, section 3.4) | aucune |

**D. Autres éléments évalués hors `exercices`**

| Élément | Source | Correction |
|---|---|---|
| Dictée | `ecriture.dictee[]`, `dictee_n` | l'adulte dicte (texte visible dans son espace) ; l'élève écrit **sur papier** ; l'adulte coche mot par mot les mots justes → score ; option V2 : saisie au clavier arabe par l'ado/adulte → comparaison automatique `bare()` puis stricte (voyelles) |
| Copie, mots, liaisons | `ecriture.mots`, `lier`, `copie` | tracé guidé (section 2.4) ou papier |
| Production écrite | `ecriture.production` | **enseignant** (grille du guide) ; saisie clavier ou photo du cahier |
| Oral | `oral` (bilans, examen Religion), `guide.bareme` | **enseignant** (grille), en présentiel ou en visio ; saisie de la note |
| Auto-évaluation | `checklist`, `retiens` | l'élève coche « je sais… » ; non noté |
| Lectures : `ouverte` | `questions[].type = "ouverte"`, `items[{ar, fr, reponse_ar}]` | réponse modèle affichée après tentative ; auto-évaluation ou enseignant |
| Évaluations : rubriques | `pos-*.js` : `lire`, `texte`, `verset`, `question`, `oral`, `ecrit`, `ecoute`, `complete` | `complete`, `ecoute`, `question` fermée : **auto** ; `lire`, `texte`, `verset`, `oral`, `ecrit` : **enseignant** avec grille |

**Bilan** : 4 316 exercices au 28/09 ; **3 820 corrigés automatiquement** (types A et B, dont 81 `qui_suis_je` en partie en auto-évaluation), **496 sans note** (type C). Les éléments D sont corrigés par l'adulte, sauf les dictées tapées au clavier (V2).

**Exigence de parité [DÉCISION]** : la bibliothèque de correction (`@awform/correction`) est **unique** et **partagée** entre l'appareil (correction immédiate hors ligne) et le serveur (recalcul des notes officielles). Elle est testée contre **les 4 316 exercices réels** : pour chacun, la réponse du corrigé doit obtenir 100 % et chaque mauvaise option 0 (tests générés automatiquement à partir des données, dans l'esprit de `controle-corriges.ps1` et des tests des corrigés du 27/09 : 1 003 exercices, 0 réponse fausse).

**Règles d'affichage des réponses [DÉCISION]**
- Mode **entraînement** (leçons) : retour immédiat par item (juste / à revoir), deuxième essai permis, puis affichage de la bonne réponse ; score conservé = premier essai (pour les statistiques) et meilleur essai (pour l'élève).
- Mode **évaluation** (bilan noté, examen) : aucune correction pendant l'épreuve ; notes et corrigé visibles après clôture par l'enseignant ; **réponses jamais présentes sur l'appareil** avant la clôture (section 4.8).

#### 2.3.3 Exercices d'écoute sans audio (audio en pause)

224 exercices `ecoute`, les dictées, les syllabes et l'apprentissage par talqīn (hifẓ E1-E2) supposent une voix. Tant que l'audio est en pause **[DÉCISION]** :
- **Mode « l'adulte lit »** (par défaut en Enfants) : l'écran de l'exercice affiche au parent ou à l'enseignant, derrière un appui long ou dans son espace, le texte `dit` à prononcer ; l'enfant choisit ensuite. C'est exactement le fonctionnement du livre papier (script dans le guide).
- **Mode classe** : l'enseignant projette ou lit ; les élèves répondent sur leur appareil ou sur papier.
- **Synthèse vocale du navigateur** : **désactivée par défaut** (qualité très variable et souvent absente en arabe sur Android d'entrée de gamme ; risque de prononciation fautive). Activable par l'administrateur pour les adultes seulement, avec la mention « voix de synthèse ».
- Les boutons de son ne s'affichent **que** si un fichier audio validé existe pour ce texte (section 4.10).

#### 2.3.4 Autres blocs de la leçon

- **Dialogue** : répliques avec le nom du personnage (`qui_ar`), sans visage ; affichage réplique par réplique ; mode « jeu de rôle » (l'élève choisit son personnage, les autres répliques sont masquées puis révélées).
- **Coran** : versets en **Amiri Quran**, texte exact (section 3), référence, consigne ; traduction AWFORM repliable (jamais dans un bilan) ; mots coraniques ; tafsir ; tajwid avec exemple. Boutons de récitation masqués tant qu'aucune récitation sous licence n'est disponible (section 4.10).
- **Fiqh / adab** : points, avec la mention de l'école mālikite quand le livre la porte ; hadiths avec leur source et leur degré tels qu'écrits dans le livre.
- **Travail personnel, mot aux parents** (`travail_perso_fr`, `parents_fr`) : affichés dans l'espace parent / adulte.
- **Guide de l'enseignant** : consultable par l'enseignant (déroulé minuté, erreurs typiques, différenciation, devoirs, corrigés), jamais par l'élève.

### 2.4 Écriture : tracé des lettres au doigt ou au stylet

**Faisabilité** : bonne pour un **tracé guidé** ; moyenne pour une **reconnaissance simple de lettres isolées** ; **non réaliste** (et non souhaitable) pour la reconnaissance de l'écriture libre de mots vocalisés.

**Tracé guidé [V1, première version dès le MVP pour en1/ad1]**
- Zone de dessin sur `<canvas>` avec Pointer Events (doigt, stylet, souris), suppression du défilement pendant le tracé, lignes d'écriture identiques au cahier (ligne de base, ligne haute pointillée) ; les 3 étapes du cahier : repasser les pointillés, tracer sur la lettre claire, écrire seul.
- **Modèles de tracé** : pour chaque lettre et chacune de ses formes (isolée, début, milieu, fin : ≈ 112 formes, plus lām-alif et les signes), un fichier de **traits ordonnés** (points de passage, sens, ordre, points diacritiques en dernier). **Ces modèles n'existent pas dans le dossier** : ce sont des données à produire (≈ 3 à 4 jours de travail de Claude, relus par un enseignant) ; source de la forme : la police Noto Naskh Arabic utilisée par le cahier.
- **Vérifications automatiques simples** : le tracé reste dans un couloir autour du modèle (tolérance réglable par âge) ; sens **de droite à gauche** pour les traits horizontaux ; ordre corps puis points ; nombre et position des points (dessus / dessous, 1, 2 ou 3). Retour visuel doux (le trait devient vert ; sinon « recommence en partant de la droite »), **jamais de note**.
- Mots et formules (`tracer.formules`, `ecriture.mots`, `copie`) : repasser sur le mot en pointillés ; vérification par couloir seulement.

**Reconnaissance simple [V2]** : reconnaissance des **lettres isolées** par un algorithme géométrique léger et hors ligne (famille des reconnaisseurs « $P / $Q » à nuage de points, publiés et sans apprentissage lourd), entraîné sur les modèles ci-dessus et quelques dizaines d'exemples par lettre ; usage : « écris la lettre que tu entends » (avec l'adulte qui dicte). Taux d'erreur attendu non négligeable chez les petits : la reconnaissance **propose** (« tu as écrit ب ? »), l'adulte confirme.

**Écriture sur papier** : reste le mode principal ; l'application sert à guider (vidéo-dessin animé du tracé en SVG, léger) et à **consigner** (le parent coche « fait sur le cahier »). Photo du cahier envoyée à l'enseignant : V2, cadrée sur la page, **sans visage**, visible par l'enseignant seul, supprimée automatiquement 90 jours après correction.

### 2.5 Révisions espacées

- **Vocabulaire et mots coraniques [V1]** : cartes générées automatiquement à partir de `mots`, `coran.mots`, `lexique`, `vocabulaire_cible` des lectures, avec l'image de la leçon quand elle existe. Recto : mot arabe vocalisé (et image) ; verso : sens français. Aucune translittération. Algorithme **FSRS** (algorithme libre de répétition espacée, bibliothèque sous licence MIT) calculé **sur l'appareil**, hors ligne ; synchronisation des révisions.
- **Pour les enfants** : pas de cartes « à retourner » seules en E1-E2 ; révision par mini-jeux (relier, écoute avec l'adulte), 5 minutes maximum.
- **Pour le hifẓ** : **pas d'algorithme adaptatif** ; l'application applique **exactement** la méthode AWFORM des carnets (J+1, J+2, J+3, J+7, J+14, J+30 puis roue du manzil) pour rester fidèle au livre et au maître (section 2.6).
- Rappels : notification (si autorisée) au plus **une par jour**, à l'heure choisie ; aucune notification entre 21 h et 7 h pour un profil enfant ; aucun texte coranique dans les notifications.

### 2.6 Suivi du hifẓ

Source : `data/hifz/<code>.js` (`AW.hifz`) + `commun.js`, `adab.js`, `tajwid.js` ; méthode : `programme\hifz_architecture.md`.

**Fonctions [MVP pour E1 et N1 ; V1 pour tous les carnets]**
1. **Plan de l'année** : parcours **socle** (sourates du manuel) ou **renforcé**, portions par semaine (`portions[{s, v, l, t}]` quand elles existent, sinon répartition au prorata des semaines 1 à 28 ; 29-30 : révision et récital), sourates déjà apprises (`revision:true`), lien vers la leçon du manuel (`l`).
2. **Page de la semaine** (reprise de la page du carnet) : les **trois pistes** — ① nouveau (الْجَدِيدُ), ② récent (الْقَرِيبُ), ③ ancien (الْبَعِيدُ) — à cocher chaque jour ; les 5 gestes de la nouvelle portion (j'écoute, je lis, je répète, je relie, je récite) ; minutes ; « écouté par » (parent, camarade, maître) ; mot-pont ; verset difficile ; ressenti (symboles sans visage : soleil / nuage / pluie, section 3.4).
3. **Répétition espacée des portions** : chaque portion validée génère ses rappels J+1, J+2, J+3, J+7 (devant un parent ou un camarade), J+14 (devant le maître), J+30 (dans une prière) puis entre dans la **roue du manzil** (taille des parts selon l'acquis : `manzil_parts`, tableau § 4.4 du carnet). **Règle d'arrêt** appliquée : si à J+3 ou J+7 la portion a demandé plus d'une aide, l'application **ne propose pas de nouvelle portion** le lendemain.
4. **Deux niveaux de validation** : **validation d'entraînement** (parent ou camarade, à la maison) et **validation officielle** par l'enseignant (seule comptée pour le certificat). Barème identique au carnet : **mémorisation /10** (aide − 1, hésitation − 0,5, verset sauté − 1,5, verset oublié − 2), **tajwid /6** (faute claire − 1, faute discrète sur une règle du niveau − 0,5, règle non étudiée 0), **fluidité et adab /4** ; mentions 18-20 Excellent, 16-17,5 Très bien, 14-15,5 Bien, 12-13,5 À consolider (nouvelle récitation sous 2 semaines), < 12 À reprendre ; **règle absolue** : un verset oublié deux fois → « à reprendre ». L'enseignant saisit des **compteurs** (aides, hésitations, fautes) et l'application calcule la note.
5. **E1-E2** : l'enfant ne voit que l'étoile et une phrase positive ; la note /20 reste dans l'espace de l'enseignant et du parent.
6. **Récital de fin de niveau** : tirage au sort de 3 sourates du socle (+ 1 du renforcé si parcours renforcé) + sourate au choix ; jury (maître + second récitant facultatif) ; conversion **note Coran /15 = récital /20 × 0,75** pour l'examen du manuel.
7. **Arbre du hifẓ** (enfants) ou **minaret** (adultes) : visualisation de l'acquis, sourate par sourate.
8. **Versets jumeaux** (mutashābihāt) : fiche personnelle, pré-remplie avec les exemples du carnet.
9. **Fiches tajwid** du niveau (`fiches_tajwid`, `tajwid_ex`, `tajwid_lecons`) : consultables.

**Limites assumées [DÉCISION]** : l'application **ne remplace ni le muṣḥaf ni le maître** (talaqqī) ; elle **ne reproduit pas** les sourates à apprendre (comme le carnet) — elle renvoie au muṣḥaf de Médine ; elle **ne délivre jamais d'ijāza** ; **aucun classement** de hifẓ entre élèves (sincérité, bienveillance). Enregistrement vocal : non au MVP ni en V1 (voix d'un mineur = donnée personnelle ; V2 éventuelle : enregistrement envoyé au seul enseignant, conservé 30 jours, consentement explicite du parent).

### 2.7 Lectures graduées

- Catalogue par niveau (`catalogue.js`, 51 titres de la 1re série, puis 2e série) ; livres rédigés = cliquables ; autres = fiche « à paraître ».
- Lecture page par page : scène illustrée composée, texte vocalisé en grand corps, traduction **repliable et fermée par défaut**, jamais proposée en mode « examen ».
- « Je comprends » (exercices `vrai_faux`, `relier`, `complete`, `ordre`, `ouverte`), « Mes mots » (glossaire avec la leçon où le mot a été appris), page parents / pour aller plus loin, **tampon « J'ai lu ce livre »** (date + étoiles + visa du parent ou de l'enseignant).
- **Placement** : le livret est proposé automatiquement après la leçon `place_apres` du manuel.
- Le **contrôle de lexique** (`lect_check.ps1`, 100 % des mots dans le lexique acquis) reste un contrôle de production, fait avant l'import.

### 2.8 Bilans et examens (y compris textes « non préparés »)

**Types d'épreuves**
| Épreuve | Source | Mode application |
|---|---|---|
| Bilan | `type:"bilan"` (4 par niveau) | **entraînement** (MVP : l'élève le fait seul, corrigé auto des parties auto, pas de note officielle) ou **noté** (V1 : ouvert par l'enseignant) |
| Examen de fin de niveau | `type:"examen"` | **noté seulement**, sous le contrôle d'un enseignant ou d'un examinateur, en présentiel ou en visio |
| Récital de hifẓ | carnet | enseignant (section 2.6) |
| Positionnement | `data/eval/pos-*.js` | V2 en ligne ; en V1 : fiches PDF |

**Déroulé d'une épreuve notée [V1]**
1. L'enseignant **programme** l'épreuve pour une classe (date, heure, durée, présentiel ou à distance).
2. À l'ouverture, l'appareil de l'élève télécharge l'épreuve **sans les réponses**. Les parties auto sont corrigées **sur le serveur** à la remise ; l'appareil peut travailler hors ligne pendant l'épreuve et remettre dès le retour du réseau (horodatage du début et de la fin, remise tardive signalée à l'enseignant).
3. Parties « enseignant » (oral, dictée, production, questions ouvertes) : grille issue de `guide.bareme` ; saisie par l'enseignant ; total **/20** (bilan) ou **/100** (examen).
4. **Clôture** par l'enseignant → notes, corrigé et remédiation visibles par l'élève et le parent.

**Textes « non préparés » [V1]** (convention du 28/09 : `lecture.non_prepare`, `coran.non_prepare`, `coran.versets[i].non_prepare`)
- Dans la leçon ordinaire et dans la consultation du bilan, **le texte n'existe pas sur l'appareil de l'élève** : l'application affiche l'encadré « Texte remis par l'enseignant le jour de l'épreuve » (نَصٌّ يُوَزِّعُهُ الْمُعَلِّمُ يَوْمَ الِاخْتِبَارِ), exactement comme le livre.
- Le texte est **révélé** seulement pendant la session d'épreuve ouverte par l'enseignant (le serveur l'envoie à ce moment-là), sans traduction pour un examen ou un bilan `sans_traduction`, avec la référence et la consigne des versets.
- En classe papier, l'enseignant imprime depuis son espace la **« feuille à photocopier et distribuer le jour de l'épreuve »** (équivalent de `npSheet`).
- Le titre du bloc Coran ne nomme pas le passage non préparé.
- Hors épreuve (parent, adulte autodidacte) : le texte non préparé reste masqué ; un adulte seul peut demander une **« épreuve d'entraînement »** : il accepte que l'épreuve devienne non officielle, puis le texte est révélé.

**Remédiation** : sous 8/20 à un bilan, liste des leçons couvertes à revoir, fiches de remédiation du guide (pour l'enseignant), exercices de la leçon remis en file de révision.

### 2.9 Tableaux de bord

| Tableau | Contenu | Lot |
|---|---|---|
| **Élève (enfant)** | « Ma carte » du niveau (leçons en îles ou chemin), étoiles, prochaine leçon, carnet de hifẓ de la semaine, livres lus | MVP |
| **Élève (ado, adulte)** | progression par leçon et par compétence (lire, écrire, parler, Coran, adab), révisions du jour, notes de bilans, hifẓ, temps de travail de la semaine | MVP (adulte) / V1 (ado) |
| **Parent** | un résumé par enfant : dernière activité, leçons faites cette semaine, points à revoir, carnet de pratique à signer, carnet de hifẓ à valider (entraînement), messages de l'enseignant ; conseils du mot aux parents (`parents_fr`) | MVP |
| **Enseignant** | par classe : tableau élèves × leçons (fait / maîtrisé / à revoir), items les plus échoués (pour la remédiation), copies à corriger, validations de hifẓ à faire, devoirs en cours, saisie des notes d'une classe papier | V1 |
| **École** | effectifs, licences, classes, enseignants, taux d'activité, certificats délivrés | V1 |
| **Administrateur** | éditions de contenu, import, contrôles, registre, comptes, paiements, codes, modération, santé technique | MVP (partiel) / V1 |

Les statistiques sont calculées sur le serveur à partir des **événements de tentative** (section 5.6), jamais à partir de données de suivi publicitaire. Aucune donnée n'est vendue ni partagée.

### 2.10 Classes et devoirs [V1]

- **Classe** : nom, établissement, enseignant(s), niveau(x), filière, élèves (comptes existants rattachés par code d'invitation, ou profils créés par l'enseignant avec accord du parent), option **« classe papier »** (élèves sans appareil).
- **Devoir** : une leçon, une partie de leçon (exercices choisis), une lecture graduée, une portion de hifẓ ou une révision ; date limite ; consigne ; visible par l'élève et son parent.
- **Correction** : file des éléments à corriger (réponses libres, productions, dictées cochées par le parent à valider, oraux à noter), avec la réponse modèle et les critères du guide.
- **Classe papier** : l'enseignant saisit les **notes des bilans et examens papier** (grille /20 ou /100 par partie) et les validations de hifẓ ; les élèves obtiennent le même suivi et les mêmes certificats que les élèves connectés. C'est la condition pour que l'écosystème serve les daaras et écoles sans écrans.
- **Mode projection** : une leçon affichée en grand (télévision, vidéoprojecteur) avec contrôle par l'enseignant (étape suivante, révéler la réponse), sans données d'élèves à l'écran.

### 2.11 Cours en ligne (visio) [V1 : intégration externe]

**[DÉCISION]** : **ne pas développer** de visioconférence. L'application gère le **planning** (séance, classe, lien), les **rappels** et la **présence** ; la visio elle-même passe par un service externe :
- **Recommandé** : un service de visio **hébergé en Europe**, sans compte obligatoire pour les participants (par exemple une instance **Jitsi Meet** ou **BigBlueButton** chez un hébergeur européen spécialisé, ou auto-hébergée plus tard sur un serveur séparé) [À VÉRIFIER : offre et prix au moment du lancement].
- **Toléré** : liens Zoom, Google Meet ou Teams collés par l'enseignant (l'application avertit que les données passent alors par ce service).
- **Protection des mineurs** : pas d'enregistrement des séances avec des mineurs (sauf accord écrit des parents et finalité précise) ; lien de séance réservé aux membres de la classe ; salle d'attente activée ; un parent peut assister ; caméra facultative pour les élèves (règle « aucun visage » des contenus AWFORM ; la caméra des participants relève du choix des familles, jamais imposée).

### 2.12 Messagerie encadrée (protection des mineurs) [V1]

Règles **[DÉCISION]** :
1. **Aucune messagerie entre élèves**, à aucun âge (pas de discussion privée, pas de groupe d'élèves).
2. **Enseignant ↔ parent** : messages privés ; **annonces de classe** (enseignant → tous les parents et élèves de la classe, sans réponse collective).
3. **Enseignant ↔ ado** (V2) : uniquement dans un fil lié à un devoir ou à la classe, **visible du parent** ; aucun message privé caché entre un adulte et un mineur.
4. **Pièces jointes** : images et PDF seulement, venant de l'enseignant ; taille limitée ; analyse du type réel du fichier ; pas de lien raccourci.
5. **Signalement** : bouton « signaler » sur chaque message → file de modération de l'administrateur ; procédure écrite (section 7) incluant l'orientation vers les numéros d'aide du pays (119 en France, 116 au Sénégal, en Côte d'Ivoire, au Burkina Faso, etc. : `ADAPTATION_PAYS.md`, affichés selon le pays du compte).
6. **Horaires** : pas de notification de message à un profil mineur entre 21 h et 7 h.
7. **Conservation** : messages conservés 12 mois après la fin de l'année scolaire puis supprimés [DÉCISION à valider avec le juriste].
8. **Journal** : les consultations de messages par la modération sont journalisées.

### 2.13 Certificats [V1]

- Modèles issus de `data/eval/certificats.js` : certificat de niveau Enfants, de niveau Adultes, de palier CECRL (ad2, ad4, ad6, ad8, ad10), diplôme AWFORM, attestation de positionnement, attestation de fin de parcours Enfants (après en5), **certificat de hifẓ** (carnet § 6.3 : « a récité par cœur, devant nous, les sourates suivantes… », jamais de formule d'ijāza).
- Délivrance seulement après une épreuve **notée et clôturée par un enseignant** (ou la saisie d'une classe papier), selon les règles `regles.js`.
- PDF A4 paysage généré sur le serveur à partir du même gabarit HTML que les livres, avec **numéro unique**, **QR code de vérification** (page publique `…/verifier/<numéro>` affichant nom tel que choisi par le titulaire, niveau, date, école ; rien d'autre) et **signature numérique** du contenu (clé de signature détenue par le serveur).
- Mention claire : certificat privé AWFORM, **pas un diplôme d'État** ; les correspondances CECRL sont indicatives.
- Révocation possible (erreur, fraude) : la page de vérification affiche alors « certificat annulé ».

### 2.14 Lien papier ↔ application

1. **QR code par leçon** : chaque leçon imprimée porte un QR vers une **URL courte et stable pour toujours**, par exemple `https://<domaine>/l/en1-05` (identifiant du fichier de leçon, pas le numéro affiché, qui peut changer d'une édition à l'autre). L'URL ouvre :
   - si l'application est installée et le niveau téléchargé : la leçon dans l'application ;
   - sinon, une **page publique légère** (rendu serveur, sans JavaScript indispensable, < 100 Ko) : titre, objectifs, mots avec images, et, quand l'audio existera, le son de la leçon ; bouton « continuer dans l'application ». **Jamais de corrigé** sur cette page.
   - La table de redirection `/l/<id>` est conservée pour toutes les éditions (une leçon supprimée redirige vers sa remplaçante ou vers le niveau).
2. **Emplacement du QR dans la mise en page** : à décider avec la mise en page d'impression (ETAT : « emplacement QR dans la mise en page » à faire) ; proposition : bandeau de pied de la première page de chaque leçon, 15 mm, avec l'URL courte en clair pour ceux qui ne scannent pas.
3. **Code d'activation** (V1) : chaque livre vendu peut contenir un code à gratter ou une étiquette donnant un accès au niveau pendant 12 mois (pack niveau, `NOTE_DIFFUSION.md` § 5.3). Codes générés par lots dans l'administration, à usage unique, exportables pour l'imprimeur ou les dépôts.
4. **Du numérique vers le papier** : l'enseignant et le parent peuvent imprimer depuis l'application la fiche de la semaine de hifẓ, la feuille de dictée, la feuille « non préparé », le bulletin, le certificat.
5. **Partage WhatsApp** : lien de leçon partageable (page publique), jamais de lien donnant accès au compte.

### 2.15 Mode hors ligne

| Fonction | Hors ligne ? | Détail |
|---|---|---|
| Ouvrir l'application | oui | coquille de l'application en cache (service worker) |
| Leçons, lectures, carnets d'un niveau téléchargé | oui | paquet de niveau stocké dans IndexedDB ; mise à jour différentielle quand une nouvelle édition est publiée |
| Exercices d'entraînement et correction | oui | bibliothèque de correction sur l'appareil ; réponses des exercices **d'entraînement** incluses dans le paquet (comme le corrigé est inclus dans le guide papier, il n'y a pas de secret) |
| Tracé, carnet de hifẓ, carnet de pratique, révisions | oui | enregistrés localement puis synchronisés |
| Bilans en mode entraînement | oui | idem |
| Bilans notés, examens | ouverture en ligne, travail hors ligne possible, remise au retour du réseau | réponses jamais sur l'appareil |
| Messagerie, visio, paiement, certificats | non | messages rédigés hors ligne mis en file d'envoi |
| Changement de profil sur un appareil partagé | oui | profils déjà connectés sur l'appareil |

**Synchronisation [DÉCISION]** : chaque action d'apprentissage est un **événement horodaté et immuable** (tentative d'exercice, case de carnet, validation…) avec un identifiant généré sur l'appareil ; l'appareil envoie sa file d'attente dès qu'il y a du réseau ; le serveur ignore un événement déjà reçu (idempotence) ; les états (progression, planning de hifẓ, cartes de révision) sont **recalculés** à partir des événements → pas de conflit à résoudre à la main. Les réglages (préférences) suivent la règle « la dernière modification gagne ». L'appareil demande au navigateur un **stockage persistant** pour éviter l'effacement des paquets ; l'espace utilisé est affiché, avec un bouton « libérer de la place » (supprimer un niveau terminé).

---

## 3. Règles de contenu à respecter dans l'application

Ces règles viennent de `REGLES_PERMANENTES.md`, `CONVENTIONS.md`, `SCHEMA.md` et des décisions du client. Elles s'appliquent **à tout ce que l'application affiche**, y compris ce qu'elle génère elle-même (libellés, notifications, badges, messages d'erreur, pages publiques, courriels, certificats). Chaque règle est accompagnée de son **contrôle automatique** : une règle sans contrôle finit par être violée (leçon tirée du journal `ERREURS_SYSTEMIQUES.md`).

### 3.1 Coran : Ḥafṣ uniquement, texte Tanzil exact

| Règle | Mise en œuvre | Contrôle automatique |
|---|---|---|
| Riwāya **Ḥafṣ ʿan ʿĀṣim** uniquement | aucun sélecteur de lecture (qirāʾa), aucun contenu Warsh (l'exercice Warsh d'ad8 a été retiré le 28/09) ; récitations futures : récitants de Ḥafṣ seulement | liste blanche des récitants dans la configuration ; refus de tout fichier audio coranique sans métadonnée `riwaya = hafs` |
| Texte **Tanzil « quran-uthmani »** copié **octet par octet** | le texte coranique de référence est chargé une fois depuis `coran\tanzil-uthmani.tsv` (6 236 versets) dans une table en lecture seule ; les versets des leçons sont importés tels quels | à chaque import : chaque verset de leçon (crochets `[..]` de couleur retirés) est comparé octet par octet au verset de référence (ou à une portion exacte pour les extraits) ; **tout écart bloque la publication**, sauf s'il figure dans la liste des **écarts voulus** (`ECARTS_VERSETS.md` : 65 écarts voulus recensés — basmala, extraits, signes) importée comme liste blanche |
| **Aucune normalisation Unicode** du texte arabe | ni NFC, ni NFD, ni NFKC, en base, dans l'API, dans l'interface ; l'ordre « chadda puis voyelle » (ordre Tanzil, normalisé sur toute la collection le 26/09) est conservé | test d'intégration : aller-retour import → base → API → navigateur sur 100 % des versets, comparaison d'octets ; règle d'analyse statique interdisant `.normalize(` sur les chaînes de contenu |
| Le texte coranique **n'est pas modifiable** dans l'administration | l'éditeur d'administration n'offre aucun champ d'édition pour un verset ; une correction passe par les fichiers sources et une nouvelle édition | droits : aucune route d'API d'écriture sur la table du Coran |
| Graphie simple (imlāʾī) interdite pour une citation coranique | règle déjà appliquée dans les livres ; l'application n'affiche que ce que contiennent les données | contrôle d'import repris de `fix-citations.ps1` (mots coraniques hors versets alignés sur Tanzil) |
| Traductions = **traductions AWFORM** | jamais une traduction tierce ; traduction jamais affichée dans un bilan (`versets[].fr` retiré de la projection élève d'un bilan) | test de projection |
| Mention de la licence Tanzil | page « À propos et licences » : texte Tanzil, licence Creative Commons Attribution 3.0, copie à l'identique, lien tanzil.net, reproduction de la notice | test de présence de la page |

### 3.2 Police Amiri Quran

- **Versets** : police **Amiri Quran** (licence SIL OFL, meilleur rendu des signes Tanzil, décision du 27/09) ; **texte arabe courant** : **Noto Naskh Arabic** (OFL) ; texte français : une police lisible libre (par exemple Nunito, déjà utilisée par le moteur, ou une police système).
- **Jamais la police KFGQPC** (licence non commerciale, accord écrit du Complexe du roi Fahd nécessaire).
- Polices **embarquées** dans l'application (fichiers WOFF2 servis par nos serveurs, jamais par un service tiers de polices, pour la vie privée et le hors ligne) ; **sous-ensembles** (subsetting) pour alléger Noto Naskh ; Amiri Quran conservée **complète** pour ne perdre aucun signe coranique.
- `font-display: block` pour les blocs coraniques (ne jamais afficher un verset dans une police de remplacement qui déplacerait les signes) ; test visuel automatique des signes rares (ٱ, petit alif, ۟, ۥ, ۦ, ۢ, signes de pause ۚ ۖ ۗ ۛ, madda ٓ) sur un échantillon de versets.
- Test de rendu sur **Chrome Android ancien, Samsung Internet et Safari iOS** (mise en forme des signes empilés : chadda + voyelle + madd).

### 3.3 Aucune phonétique latine pour les élèves

- Les champs `tr` des données **ne sont jamais envoyés** à un appareil d'élève (retirés de la projection élève, section 5.4).
- Les libellés de l'interface élève ne contiennent **aucune translittération** destinée à faire prononcer l'arabe ; formules religieuses en **arabe vocalisé + sens français** ; termes techniques en français + arabe entre parenthèses (`GLOSSAIRE_TERMES.md` fait foi).
- **Exceptions documentées** (REGLES §4) : noms de signes francisés (alif, hamza, fatha, damma, kasra, soukoun, chadda, tanwin) ; emprunts (siwak, mihrab, imam, hadj, halal, cheikh, djinn, tajwid, omra) ; lieux et villes sous leur forme française usuelle (La Mecque, Médine, Arafat, Mina, Muzdalifa, Safa, Marwa, Kaaba, Jérusalem / al-Quds) ; mois hégiriens usuels (Ramadan, Chawwal, Dhou al-Hijja) ; noms propres usuels (Allah, Muḥammad ﷺ, prophètes, sourates, savants, recueils).
- **Espace enseignant** : la translittération savante reste permise dans les champs du guide, comme dans le guide papier.
- **Contrôle** : un analyseur de textes (lancé à l'import et sur les fichiers de libellés de l'interface) signale les séquences latines typiques de translittération (ā, ī, ū, ḥ, ṣ, ḍ, ṭ, ẓ, ʿ, ʾ, et une liste de mots issus du glossaire) dans tout champ élève ; les exceptions ci-dessus sont en liste blanche.

### 3.4 Aucun visage, aucune représentation interdite

- Illustrations : uniquement les clés des fichiers `illus\*.js`, chargées dans le **même ordre** que les pages des livres, **`zz-sansvisage.js` en dernier** (ses dessins remplacent les personnages à visage).
- Les **12 personnages** de la charte seulement (youssouf, maryam, fatou, papa, maman, grandpere, grandmere, adam, khadija, ilyas, imam, hadj), dessinés sans visage ; **aucune représentation d'Allah, des anges, des prophètes, des Compagnons**, pas même de dos ou en silhouette.
- **Interface** : aucun émoji-visage (décision du 27/09) — ni 😊 ni ☺ ; le ressenti du carnet (« ☺ 😐 ☹ » dans le modèle papier du carnet) devient **soleil / nuage / pluie** ; avatars choisis dans une bibliothèque d'**avatars sans visage** (motifs, animaux stylisés, objets) ; **aucune photo de profil**.
- **Contenus envoyés par les utilisateurs** (photo de cahier, dessin) : consigne « sans visage » affichée, visibles par l'enseignant seul, suppression automatique ; pas de galerie publique.
- **Contrôle** : test automatique qui refuse toute clé d'illustration de personnage hors liste ; liste noire des émojis-visages (plages Unicode des visages) dans les libellés et dans les messages de l'interface.

### 3.5 École mālikite et prudence religieuse

- Le **contenu élève suit l'école mālikite** (REGLES §3, CONVENTIONS §8) ; les divergences figurent dans le guide avec la formule « ce livre suit l'école mālikite ». L'application **affiche ce que disent les livres**, sans réécrire.
- **Aucune fonctionnalité religieuse ajoutée par l'application** qui ne soit pas dans le curriculum (calcul des horaires de prière, de la zakāt, avis juridiques, questions-réponses religieuses automatiques, agent conversationnel) **sans décision du client et validation du référent** ; si un jour une telle fonction est ajoutée, elle suit l'école mālikite et porte le statut `VALIDATION_HUMAINE_REQUISE` jusqu'à validation.
- **Aucune génération automatique** de contenu religieux (pas d'IA qui « explique » un verset ou un hadith à l'élève).
- **Hadiths** : affichés avec la source et le degré tels qu'écrits dans le livre ; hadith faible gardé et signalé (jamais base d'une règle obligatoire) ; aucun numéro ajouté par l'application.
- **Récits** : pas d'isrāʾīliyyāt ni de récit faible dans le contenu élève (règle de rédaction déjà appliquée aux livres).
- **Adab du Coran** dans l'interface : pas de texte coranique dans les notifications, les courriels publicitaires, les écrans de chargement ou les contextes ludiques (pas de verset comme « récompense » de jeu) ; **pas de publicité** dans l'application.
- **Sons de l'interface** : aucun jingle musical ; retours sonores sobres et désactivables (charte : pas de musique instrumentale mise en avant).
- **Mixité** : option de classe « groupe filles / groupe garçons / mixte » laissée au choix de l'école ; aucune fonction qui mette en relation des élèves entre eux (section 2.12).

> **Note du 28/09/2026 (arbitrage du pilote, voir `ARCHITECTURE_V2.md` § 0, écart E1, et § 1.6)** : le fondateur demande des tuteurs IA. L'interdiction de « génération automatique de contenu religieux » est **maintenue et précisée** : les tuteurs ne génèrent **jamais** de contenu religieux nouveau ; texte coranique **uniquement** depuis Tanzil (le modèle place une référence, l'application insère le texte) ; hadiths, invocations, règles de fiqh et récits **uniquement** depuis les livres et le registre validés (statut `VERIFIE`), cités à l'identique avec leur référence, chaque citation étant contrôlée automatiquement avant affichage ; ils peuvent reformuler une explication pédagogique déjà validée, encourager, corriger la langue, organiser la révision et analyser la récitation ; toute question religieuse hors du corpus validé est transmise à l'enseignant ou au référent (« je transmets ta question à ton enseignant »). Garde-fous testés (tests adverses) et journalisés. Aucun avis religieux, aucune validation, aucune ijāza par l'IA.

### 3.6 Bienveillance, sincérité, âge

- **Aucun classement public** entre élèves (ni hifẓ, ni scores, ni défis) : les étoiles récompensent l'effort personnel ; le carnet encourage, ne sanctionne pas.
- Messages d'échec formulés positivement (« Essaie encore », jamais « Faux ! » en rouge vif pour un enfant de 5 ans).
- Pas de mécanique addictive (séries à ne pas « casser », récompenses aléatoires, compte à rebours culpabilisant).
- Temps d'écran : pour un profil enfant, rappel doux après 20 minutes d'affilée, réglable par le parent.

### 3.7 Contenu sensible et adaptation par pays

- Les **numéros d'aide** (119, 3018, 3114, 116…) varient selon le pays (`ADAPTATION_PAYS.md`) : l'application les affiche **selon le pays du compte** à partir d'une table administrable et datée (revérification annuelle), avec la mention « à vérifier » tant que le relecteur local n'a pas validé (le 3020 n'est plus le numéro du harcèlement scolaire depuis le 01/01/2024 : erreur signalée dans ado4 l19-l20, à corriger dans les livres).
- **Monnaies des exemples** : l'application affiche les montants tels que les livres les écrivent ; les prix de vente, eux, sont en € / FCFA / GNF selon le pays.
- Leçons comportant des **séances sensibles** (puberté, prévention des abus, `guide.sensible_fr`) : consignes du guide affichées à l'enseignant et au parent **avant** que l'enfant ne les ouvre ; le parent peut choisir de faire cette leçon avec l'enfant.

### 3.8 Statuts du registre visibles pour l'administrateur

- Le registre canonique (`registre\coran.json`, `hadiths.json`, `fiqh.json`, puis `invocations.json`) est **importé** avec chaque édition ; les statuts `VERIFIE`, `VERIFIE_AVEC_RESERVE`, `REFERENCE_A_CONFIRMER`, `VALIDATION_HUMAINE_REQUISE` et les étapes (`SOURCE_IDENTIFIEE`, `TEXTE_ARABE_VERIFIE`, `REFERENCE_VERIFIEE`, `TRADUCTION_VERIFIEE`, `DEGRE_DOCUMENTE`, `COHERENCE_MALIKITE_VERIFIEE`) sont affichés **dans l'administration et dans l'espace du référent religieux**, jamais aux élèves.
- **Console du registre** : filtres par statut, livre, leçon ; pour chaque élément, les leçons qui l'utilisent (champ `usages`), les sources de vérification, les notes ; indicateur par leçon et par niveau (« 3 points en validation humaine dans ce niveau »).
- **Validation humaine** : seul le rôle **référent religieux** peut passer `validation_humaine` à vrai, avec son nom, la date et un commentaire ; l'action est journalisée et **réécrite dans le registre source** lors du prochain export (le registre des fichiers reste la source de vérité de la production ; l'application ne diverge jamais silencieusement, section 5.7).
- **Règle d'affichage** : un contrôle d'agent n'est **jamais** présenté comme une validation humaine (REGLES §2) ; l'application n'affiche jamais « validé par un savant » ni équivalent sans `validation_humaine = vrai`.
- Question ouverte au client (section 8) : les leçons contenant un point `VALIDATION_HUMAINE_REQUISE` sont-elles publiées normalement (recommandation : oui, comme les livres, sans mention côté élève) ou retenues ?

---

## 4. Architecture technique recommandée

### 4.1 Vue d'ensemble

```
 Appareils (Android d'entrée de gamme, iPhone, ordinateur)
 ┌──────────────────────────────────────────────────────────────┐
 │ PWA SvelteKit : coquille en cache (service worker)             │
 │  ├ lecteur de leçons, tracé, hifẓ, révisions (FSRS)            │
 │  ├ @awform/correction (même code que le serveur)               │
 │  ├ IndexedDB : paquets de niveaux + file d'événements          │
 │  └ polices Amiri Quran / Noto Naskh embarquées                 │
 └───────────────┬──────────────────────────────────────────────┘
                 │ HTTPS (TLS 1.2+), JSON, compression Brotli
 ┌───────────────▼──────────────────────────────────────────────┐
 │ Caddy (TLS automatique, en-têtes de sécurité, statiques)       │
 │  ├ web : SvelteKit (pages publiques en rendu serveur : QR,     │
 │  │       catalogue, vérification de certificat)                │
 │  ├ api : Fastify (Node.js 22 LTS), OpenAPI, validation zod     │
 │  └ worker : tâches de fond pg-boss (e-mails, PDF, paquets,     │
 │             import d'édition, purges RGPD, statistiques)       │
 ├───────────────────────────────────────────────────────────────┤
 │ PostgreSQL 16 (données + contenu JSONB + file de tâches)       │
 │ Stockage objet S3 européen (paquets, PDF, médias, sauvegardes) │
 └───────────────────────────────────────────────────────────────┘
 Services externes (tous remplaçables) : paiement, e-mail
 transactionnel, CDN (facultatif), visio (lien), suivi d'erreurs.
```

Un **dépôt unique** (monorepo pnpm) :
| Dossier | Rôle |
|---|---|
| `apps/web` | SvelteKit : application (PWA, mode SPA hors ligne) + pages publiques (rendu serveur) |
| `apps/api` | Fastify : API REST JSON documentée (OpenAPI), authentification, droits |
| `apps/worker` | tâches de fond |
| `packages/content-schema` | schémas zod de tous les formats de données (leçon, bilan, book, hifz, lecture, eval, registre) |
| `packages/correction` | correction des 20 types d'exercices, normalisations `plain` / `bare` |
| `packages/render` | composants de rendu des leçons (reprise fidèle d'`awform.js`), scènes, illustrations |
| `packages/importer` | import des fichiers `data\` → édition en base, contrôles |
| `packages/hifz` | calcul du plan, répétition espacée J+n, roue du manzil, barème |
| `packages/srs` | révisions espacées FSRS (vocabulaire) |
| `docs/` | décisions d'architecture (ADR), guide d'exploitation, briefs d'audit |

### 4.2 Choix et justification

| Besoin | Choix | Pourquoi | Écartés |
|---|---|---|---|
| Langage | **TypeScript** partout | un seul langage pour un seul développeur ; **même code de correction** sur l'appareil (hors ligne) et le serveur (notes officielles) ; types partagés entre contenu, API et interface | Python/Django (correction à dupliquer en JS), PHP/Laravel (idem) |
| Interface | **SvelteKit** + **Svelte 5** | compile en JavaScript léger (important sur Android d'entrée de gamme et 3G) ; rendu serveur **et** SPA hors ligne dans le même outil ; service worker intégré | React/Next.js (plus lourd), Flutter (téléchargement lourd, web moins bon, RTL arabe coranique moins maîtrisé), application native (2 codes à maintenir) |
| API | **Fastify** (Node.js 22 LTS) | rapide, validation par schéma, écosystème mûr, OpenAPI | Express (moins structuré), NestJS (lourd pour un seul développeur) |
| Base | **PostgreSQL 16** | fiable, libre ; relationnel pour comptes, classes, notes ; **JSONB** pour le contenu des leçons tel quel ; recherche plein texte ; file de tâches (pg-boss) sans Redis | MongoDB (intégrité référentielle faible), SQLite (serveur multi-utilisateur) |
| Accès aux données | **Drizzle ORM** (SQL typé) + migrations versionnées | SQL lisible et auditable par Codex, typage | ORM « magiques » |
| Tâches de fond | **pg-boss** | utilise PostgreSQL : un composant de moins | Redis + BullMQ |
| Stockage des fichiers | **S3 européen** (Scaleway, OVHcloud ou équivalent) | paquets de niveaux, PDF, médias (audio plus tard), sauvegardes ; standard S3 = réversible | disque local seul |
| Serveur web | **Caddy** | TLS automatique, configuration courte, HTTP/3 | Nginx + Certbot (plus de réglages) |
| Déploiement | **Docker Compose** sur 1 serveur au lancement, 2 ensuite | simple à comprendre, à auditer et à reprendre ; pas de Kubernetes | Kubernetes, « serverless » propriétaire |
| Stockage hors ligne | **IndexedDB** (bibliothèque Dexie) | seul stockage navigateur adapté aux gros volumes | localStorage (5 Mo, synchrone) |
| Tests | **Vitest** (unitaires), **Playwright** (bout en bout), **axe-core** (accessibilité), **k6** (charge) | standards, exécutables sur la VM | — |

Toutes les dépendances sont **libres** (licences MIT, Apache, BSD, OFL pour les polices) ; leur liste et leur licence sont tenues à jour automatiquement (fichier SBOM).

### 4.3 PWA installable et hors ligne, performance

- **Installation** : manifeste web, icônes, écran d'accueil ; sur Android, installation depuis Chrome ; publication **Google Play** possible par **Trusted Web Activity** (application enveloppe de la PWA, sans second code) [V1] ; sur iPhone, installation depuis Safari (« sur l'écran d'accueil ») ; **App Store** repoussé (enveloppe type Capacitor, règles d'Apple sur les achats intégrés, section 8).
- **Service worker** : coquille (HTML, JS, CSS, polices) mise en cache à l'installation ; mises à jour en arrière-plan, appliquées au prochain démarrage (jamais au milieu d'une leçon).
- **Paquets de niveau** : un fichier compressé par niveau et par édition (leçons en projection élève + illustrations SVG utilisées + index), servi avec une empreinte dans son nom (cache immuable) ; **mise à jour différentielle** à la publication d'une nouvelle édition (seules les leçons modifiées sont retéléchargées).
- **Poids estimés [ESTIMATION à mesurer au lot 1]** : JSON d'un niveau ≈ 0,5 à 1,8 Mo brut (moyenne 28 Mo / 24 niveaux ≈ 1,2 Mo, guide compris) ; projection élève ≈ 50 à 60 % ; compression Brotli ≈ ÷ 5 à 7 sur ce type de texte → **≈ 100 à 300 Ko par niveau** ; illustrations : ensemble SVG ≈ 1,3 Mo brut, ≈ 250 Ko compressé, partagé entre niveaux ; polices : Amiri Quran + Noto Naskh (sous-ensemble) ≈ 300 à 500 Ko, une seule fois.
- **Budgets vérifiés en intégration continue** : JavaScript initial ≤ 150 Ko compressé ; première leçon affichée en **≤ 5 s sur un Android d'entrée de gamme en 3G simulée** au premier lancement, ≤ 1,5 s ensuite (hors ligne) ; mémoire ≤ 150 Mo ; aucune animation lourde.
- **Navigateurs cibles** : Chrome Android ≥ 100 (Android 8 et plus), Samsung Internet récent, Safari iOS ≥ 16, Firefox et Edge récents. **Non pris en charge** : Opera Mini en mode « extrême » et KaiOS (pas de service worker fiable) → la **page publique de la leçon** (rendu serveur) et les PDF restent accessibles.
- **Mode économie de données** : aucune image lourde, audio jamais préchargé, avertissement avant tout téléchargement > 1 Mo, option « Wi-Fi seulement ».

### 4.4 API et logique serveur

- **API REST JSON** versionnée (`/api/v1/…`), décrite en **OpenAPI** (documentation générée), validation de chaque entrée et sortie par les schémas zod ; pagination ; erreurs normalisées.
- **Événements d'apprentissage** reçus par lots (`POST /sync` : liste d'événements avec identifiant unique UUIDv7 généré sur l'appareil, horodatage appareil + horodatage serveur) ; recalcul des états en tâche de fond.
- **Droits centralisés** dans un module de politiques unique (« qui peut faire quoi sur quelle ressource ») : parent → ses enfants ; enseignant → ses classes ; école → son établissement ; référent → registre ; administrateur → tout, avec journal. Chaque route déclare sa politique ; un test vérifie qu'aucune route n'en est dépourvue.
- **Multi-établissement** : chaque donnée d'élève porte l'établissement ou la famille qui la contrôle ; contrôle applicatif systématique, complété par la **sécurité au niveau des lignes** de PostgreSQL (Row-Level Security) sur les tables les plus sensibles (tentatives, notes, messages) en V1.
- **Tâches de fond** : génération des paquets de niveau à la publication d'une édition, PDF (certificats, fiches, feuilles « non préparé ») par un navigateur sans interface (Chromium) à partir des gabarits HTML, e-mails, purges RGPD programmées, agrégats statistiques.

### 4.5 Base de données et stockage des médias

- **PostgreSQL 16** : schéma relationnel pour les comptes, classes, notes, hifẓ, paiements ; **JSONB** pour le contenu (leçon complète, projections) ; index sur les identifiants stables ; contraintes d'intégrité ; encodage UTF-8, **aucune normalisation** du texte (section 3.1).
- **Stockage objet** (S3 européen) : `packs/<édition>/<niveau>.<empreinte>.json.br`, `pdf/…`, `media/audio/<sha1>.mp3` (plus tard), `uploads/…` (photos de cahier, V2 ; chiffrement côté serveur ; durée de vie automatique), `backups/…` (compartiment séparé, autre région, verrouillage des objets).
- **Médias** : servis via des URL signées à durée limitée pour les contenus privés ; statiques publics (paquets, polices) avec cache long et, si utile, un **CDN européen** avec points de présence en Afrique [À VÉRIFIER : couverture Dakar / Abidjan / Conakry du fournisseur retenu].

### 4.6 Authentification, comptes et RGPD

**Modèle de comptes [DÉCISION]**
| Compte | Identifiant | Connexion | Remarques |
|---|---|---|---|
| Parent / tuteur | e-mail (V1 : ou numéro de téléphone pour l'Afrique) | mot de passe (haché Argon2id) ; lien magique par e-mail en option ; clés d'accès (passkeys) en V2 | titulaire des profils enfants, donne les consentements, paie |
| Profil enfant | aucun identifiant personnel ; prénom ou pseudonyme, **année** de naissance, niveau | ouvert depuis l'appareil du parent (sélecteur de profils) ; retour à l'espace parent protégé par un **code à 4 chiffres** | pas d'e-mail, pas de mot de passe, pas de photo |
| Élève d'une classe (V1) | créé par l'enseignant avec **accord du parent** ou rattaché par code d'invitation | **carte de connexion** imprimable (QR + code image à 4 symboles) pour les appareils de l'école | le parent reçoit la carte et peut rattacher le profil à son compte |
| Ado (13-17 ans) | e-mail ou pseudonyme | mot de passe ; compte **rattaché à un parent** ; sous 15 ans, consentement du parent requis (voir ci-dessous) | le parent voit la progression et les messages |
| Adulte | e-mail | mot de passe | autonome |
| Enseignant, responsable d'école | e-mail professionnel ou personnel | mot de passe + **2FA** (application d'authentification TOTP) | invitation par l'école ou par l'administrateur |
| Administrateur, référent religieux | e-mail | mot de passe + **2FA obligatoire** ; sessions courtes ; journal de toutes les actions | comptes nominatifs, jamais partagés |

**Sessions** : jeton de session aléatoire stocké en base, cookie `HttpOnly`, `Secure`, `SameSite=Lax` ; expiration glissante (30 jours pour un appareil familial, 12 h pour l'administration) ; révocation de toutes les sessions depuis le compte ; limitation des tentatives et verrouillage progressif ; réinitialisation du mot de passe par lien à usage unique (15 min). Module écrit sur des primitives éprouvées (Argon2id, générateur aléatoire cryptographique), suivant l'**OWASP ASVS** (section 4.8) ; pas de fournisseur d'identité externe au MVP (données de mineurs, simplicité, souveraineté).

**RGPD et protection des mineurs [À VÉRIFIER par un juriste]**
- **Responsable de traitement** : la structure juridique du client (à créer, `TACHES_CLIENT.md`). Pour une école qui utilise l'application avec ses élèves, l'école peut être responsable de traitement et AWFORM sous-traitant : prévoir un **accord de traitement de données (art. 28)** type pour les écoles.
- **Bases légales** : exécution du contrat (compte, abonnement, suivi pédagogique) ; consentement pour ce qui est facultatif (notifications, photos de cahier, enregistrement vocal futur, statistiques non essentielles) ; obligation légale (facturation).
- **Mineurs** : en France, un mineur peut consentir seul à partir de **15 ans** pour les traitements fondés sur le consentement (loi Informatique et Libertés, art. 45) ; en dessous, **consentement conjoint** du parent et du mineur. Mise en œuvre : profil enfant créé **uniquement** par un parent ; compte ado de moins de 15 ans activé seulement après confirmation du parent (e-mail au parent) ; information rédigée en mots simples pour les enfants (CNIL : recommandations sur les droits des mineurs en ligne).
- **Minimisation** : pas de date de naissance complète (année seulement), pas d'adresse postale sauf facturation, pas de photo, pas de géolocalisation, pas d'identifiant publicitaire, pas de traceur tiers ; pays du compte seulement pour les prix, les numéros d'aide et la monnaie.
- **Mesure d'audience** : aucune au MVP, ou un outil **sans cookie et auto-hébergé** (statistiques agrégées) exempté de consentement selon les conditions de la CNIL [À VÉRIFIER].
- **Droits** : export de toutes les données d'un compte (fichier JSON + PDF lisible) et **suppression** du compte depuis l'application (effacement définitif sous 30 jours, sauf données de facturation conservées selon la loi) ; purge automatique des comptes inactifs depuis 3 ans après préavis [DÉCISION à valider].
- **Documents** : registre des traitements, **analyse d'impact (AIPD)** recommandée (données de mineurs à grande échelle, suivi de l'apprentissage) [À VÉRIFIER], politique de confidentialité, information des enfants, contrats de sous-traitance (hébergeur, e-mail, paiement).
- **Afrique de l'Ouest** : les pays visés ont leurs propres lois et autorités de protection des données (par exemple la CDP au Sénégal, l'ARTCI en Côte d'Ivoire, l'APDP au Mali) ; les formalités éventuelles (déclaration, transfert de données hors du pays) sont **à vérifier pays par pays** avant l'ouverture commerciale [À VÉRIFIER].

### 4.7 Hébergement européen, sauvegardes, supervision

- **Hébergeur** : un fournisseur **européen** avec centres de données dans l'UE (par exemple **OVHcloud** ou **Scaleway** en France, **Hetzner** en Allemagne/Finlande) ; contrat de sous-traitance RGPD ; pas de fournisseur soumis à une obligation de transfert hors UE pour les données personnelles. Choix final par le client (section 8).
- **Environnements** : `dev` (la VM du client), `recette` (petit serveur, données fictives, pour les jalons de recette du client), `production`.
- **Sauvegardes [DÉCISION]** : sauvegarde continue des journaux de PostgreSQL (WAL, outil type pgBackRest ou WAL-G) + sauvegarde complète quotidienne, **chiffrées**, envoyées vers un stockage objet **d'une autre région** ; rétention 30 jours (quotidiennes) + 12 mois (mensuelles) ; **objectif de perte de données ≤ 15 min, de reprise ≤ 4 h** ; **test de restauration mensuel automatisé** (restauration dans un conteneur, contrôle d'intégrité, rapport) ; sauvegarde du stockage objet (versionnage) ; la clé de chiffrement des sauvegardes est aussi conservée **hors ligne par le client**.
- **Supervision** : disponibilité (sonde externe toutes les minutes, alerte par e-mail/SMS), erreurs applicatives (outil compatible Sentry **auto-hébergé**, par exemple GlitchTip, avec suppression des données personnelles des rapports), journaux structurés (JSON) conservés 30 jours, métriques système (processeur, mémoire, disque, base) ; tableau de bord d'exploitation ; alertes sur : erreurs en hausse, file de tâches bloquée, disque > 80 %, certificat TLS, échec de sauvegarde ou de test de restauration.
- **Mises à jour** : correctifs de sécurité du système automatiques ; dépendances mises à jour chaque mois (et immédiatement pour une faille critique) ; déploiement **sans interruption** (bascule de conteneurs), retour arrière en une commande.

### 4.8 Sécurité (OWASP)

Référentiel : **OWASP ASVS 4.0, niveau 2** (application manipulant des données de mineurs et des paiements) et **OWASP Top 10** ; conformité vérifiée à chaque jalon et par l'audit Codex (section 6.6).

| Risque | Mesures |
|---|---|
| Contrôle d'accès défaillant | module de politiques unique, refus par défaut, tests d'autorisation automatiques pour chaque route et chaque rôle (y compris « parent A ne voit pas l'enfant de B ») ; identifiants non devinables (UUID) |
| Défaillances cryptographiques | TLS partout (HSTS), Argon2id, secrets hors du dépôt (fichier `/etc/awform/*.env` lisible par le seul service, ou coffre de secrets de l'hébergeur), chiffrement des sauvegardes |
| Injection | requêtes paramétrées uniquement (Drizzle), validation zod de toutes les entrées, aucun SQL construit par concaténation |
| Conception non sécurisée | modélisation des menaces par lot (fichier `docs/securite/menaces.md`), revue Codex |
| Mauvaise configuration | en-têtes de sécurité (CSP stricte sans script en ligne, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` : caméra/micro désactivés sauf besoin), conteneurs non root, ports fermés, base non exposée sur Internet |
| Composants vulnérables | analyse automatique des dépendances (osv-scanner / npm audit) en intégration continue, SBOM, mises à jour mensuelles |
| Authentification | limitation de débit, verrouillage progressif, 2FA des rôles sensibles, sessions révocables, détection de mots de passe compromis (liste locale de mots de passe courants) |
| Intégrité des données | journal d'audit immuable des actions sensibles (notes, validations, certificats, rôles) ; signature des certificats ; vérification des signatures des notifications de paiement (webhooks) et idempotence |
| Journalisation | journaux sans données sensibles (pas de mot de passe, pas de contenu de message), alertes |
| SSRF et téléversements | aucune récupération d'URL fournie par un utilisateur ; téléversements limités (type réel vérifié, taille, ré-encodage des images, suppression des métadonnées EXIF, dont la géolocalisation) |
| Tricherie aux épreuves | réponses des épreuves notées jamais envoyées avant clôture ; correction sur le serveur ; horodatage ; l'enseignant garde la main (oral) |
| Secrets du projet | **la clé Azure du dossier `awform\audio` n'est jamais lue, copiée ni versionnée** ; `.gitignore` et analyse de secrets (gitleaks) bloquent tout secret dans le dépôt |

### 4.9 Accessibilité, arabe de droite à gauche, internationalisation

- **Référentiels** : **RGAA 4.1** (déclinaison française des WCAG) et **WCAG 2.2 niveau AA** comme cible ; déclaration d'accessibilité publiée ; audit automatique (axe-core) à chaque version et contrôle manuel à chaque jalon. L'**Acte européen sur l'accessibilité** (directive 2019/882, applicable depuis le 28/06/2025) peut concerner la vente en ligne de services numériques au consommateur ; les microentreprises de services en sont exemptées [À VÉRIFIER selon la taille de la structure].
- **Arabe (RTL)** : interface en français (gauche à droite) contenant des segments arabes marqués `lang="ar" dir="rtl"`, isolés (`<bdi>` / `unicode-bidi: isolate`) pour éviter les inversions de ponctuation ; propriétés CSS logiques (`margin-inline-start`…) ; exercices `ordre` et `relier` pensés de droite à gauche pour l'arabe ; clavier arabe à l'écran fourni pour les saisies (V2 : dictée tapée), avec voyelles.
- **Couleurs des lettres** : la couleur ne doit pas être la seule information (WCAG 1.4.1) : chaque lettre colorée reçoit aussi un **soulignement de style différent** (plein, tirets, pointillés, double) activable dans les réglages d'accessibilité ; contrastes ≥ 4,5:1.
- **Lecteurs d'écran** : textes alternatifs des scènes (`alt_fr` des données), boutons nommés, ordre de lecture logique ; les lecteurs d'écran lisent mal l'arabe vocalisé : prévoir une **alternative audio** quand l'audio existera.
- **Réglages** : taille du texte arabe (3 crans), contraste renforcé, réduction des animations, police adaptée à la dyslexie pour le français (V2 ; `ETAT.md` : accessibilité gros caractères et dyslexie prévue plus tard).
- **Internationalisation** : interface **en français d'abord** ; tous les libellés dans des fichiers de messages (format ICU : pluriels, genres), aucune chaîne en dur ; formats de nombre, de date et de monnaie selon le pays (€, FCFA, GNF) ; l'anglais existe partiellement côté livres (`en1-en.html`, `i18n\en`, `AW.pack`) : structure prête pour une interface en anglais puis en langues africaines, sans en faire un objectif du MVP ; les langues étrangères du contenu sont en pause (consigne client).

### 4.10 Audio : prévu dans l'architecture, activé plus tard

L'audio est en pause, mais **rien ne devra être refait** pour l'ajouter **[DÉCISION]** :
- **Clé d'un texte audio** : identique à celle du moteur des livres (`AW.audioKey` : texte sans crochets, tatwīl, petits signes coraniques ; ٱ→ا ; espaces réduits) et **SHA-1 du texte normalisé** = nom du fichier (`audio/<sha1>.mp3`), exactement comme `gen-audio.ps1`. *Seule exception à la règle « aucune normalisation » : cette clé sert à retrouver un fichier, elle n'est jamais affichée.*
- **Table `media_asset`** : clé, type (`tts`, `humain`, `recitation`), voix ou récitant, riwāya (Ḥafṣ obligatoire pour le Coran), **statut** (`provisoire`, `valide`), **licence** et ayant droit, niveaux concernés, taille, durée. Priorité d'affichage : humain validé > synthèse validée > rien.
- **Récitations coraniques** : par verset (`SSSVVV`), enchaînées pour une référence « 1:1-7 » (analyseur de références repris d'`AW.parseRef`). **EveryAyah n'est pas utilisable dans un produit payant sans autorisation** (`NOTE_DIFFUSION.md` § 4.6) : l'application n'appellera **aucun** serveur tiers de récitations ; les fichiers seront hébergés par AWFORM avec leur licence.
- **Voix de synthèse** (option Azure étudiée) : génération **hors application**, par lot, par un script de production (la clé reste chez le client, jamais dans l'application ni dans le dépôt) ; relevé du 25/09 : ≈ 5 117 textes uniques, ≈ 187 000 caractères pour 12 niveaux [ESTIMATION du coût : quelques dizaines d'euros au plus pour toute la collection, à vérifier sur la grille de prix du moment].
- **Hors ligne et données** : audio téléchargeable par niveau (« paquet audio », taille affichée) ou à la demande ; MP3 mono 64 kbit/s (≈ 0,5 Mo par minute) ; aussi distribuable hors application (MP3 par leçon via WhatsApp / clé USB, `ETAT.md`).
- **Interface** : le bouton son n'apparaît que si le fichier existe ; les exercices `ecoute` basculent automatiquement du mode « l'adulte lit » au mode audio.

### 4.11 Paiements

**Principe absolu [DÉCISION]** : **aucune donnée de carte bancaire ni de compte mobile money ne transite ou n'est stockée chez AWFORM** ; tout passe par des pages de paiement hébergées par le prestataire ; AWFORM ne reçoit que des notifications signées (webhooks) et conserve l'identifiant de la transaction.

| Zone | Produit | Prestataire recommandé | Remarques |
|---|---|---|---|
| Europe (€) | **abonnement** mensuel / annuel par famille (nombre de profils enfants plafonné), licence école par élève et par an | **Stripe** (Stripe Checkout + Billing ; carte, SEPA ; entité européenne) ; alternative : un **« marchand officiel »** (Merchant of Record, type Paddle) qui gère lui-même la TVA sur les services numériques, plus cher mais plus simple [À VÉRIFIER] | TVA sur les services numériques : taux du pays du client (guichet unique OSS) — à faire valider par un comptable (le taux réduit du livre ne s'applique pas à l'abonnement, `NOTE_DIFFUSION.md` § 4.4) ; droit de rétractation de 14 jours et renonciation expresse pour un accès immédiat (CGV) |
| Afrique UEMOA (FCFA) et Guinée (GNF) | **passes prépayés** (1, 3, 12 mois) plutôt qu'un prélèvement récurrent (peu adapté au mobile money) ; **codes d'activation** vendus par les écoles et les dépôts | un **agrégateur** (PayDunya, CinetPay) couvrant Wave, Orange Money, MTN, cartes ; Wave Business en direct possible [À VÉRIFIER : pays et frais couverts, en particulier la Guinée et le GNF] | prix fixés par le client après le pilote ; **codes d'activation** = solution hors ligne qui marche aussi sans compte mobile money |
| Google Play / App Store | — | — | les magasins imposent en principe leur propre système de facturation (commission) pour les achats numériques **dans** l'application ; l'application vendue sur le web et consultée dans l'enveloppe Play doit respecter leurs règles [À VÉRIFIER au moment de la publication] ; au MVP et en V1 : **vente sur le site web**, pas d'achat intégré |

Fonctionnalités : page de prix, essai gratuit, gestion de l'abonnement (portail du prestataire), factures, codes promotionnels, **codes d'activation** (livres, écoles), licences d'école (nombre d'élèves, période), relances de paiement, fin d'accès propre (la progression est conservée, le contenu déjà téléchargé reste lisible selon la règle choisie par le client).

### 4.12 Coûts mensuels estimés [ESTIMATION, prix publics à revérifier au moment de la commande]

| Poste | Lancement (bêta, < 1 000 comptes) | Croissance (5 000 à 10 000 comptes actifs) |
|---|---|---|
| Serveur de production (4 vCPU, 8-16 Go, SSD) | 15 à 40 € | 2 serveurs ou base gérée : 80 à 200 € |
| Base PostgreSQL gérée (option, sinon sur le serveur) | 0 à 30 € | 40 à 100 € |
| Serveur de recette | 5 à 15 € | 10 à 20 € |
| Stockage objet + sauvegardes (autre région) | 2 à 10 € | 10 à 40 € |
| E-mail transactionnel (fournisseur européen) | 0 à 20 € | 20 à 50 € |
| CDN (facultatif) | 0 à 10 € | 10 à 30 € |
| Nom de domaine | ≈ 1 à 2 € | ≈ 1 à 2 € |
| Supervision et suivi d'erreurs (auto-hébergés) | 0 € | 0 à 10 € |
| **Total hors paiement** | **≈ 40 à 120 €/mois** | **≈ 150 à 400 €/mois** |
| Frais de paiement | commission par transaction (carte en Europe ≈ 1,5 % + 0,25 €, mobile money ≈ 1 à 3 %) [À VÉRIFIER] | idem |
| Ponctuels | Google Play : 25 $ une fois ; Apple : 99 $/an (plus tard) ; téléphones de test : 2 × 60 à 120 € | — |
| Audio (quand décidé) | synthèse : quelques dizaines d'euros une fois ; récitations sous licence : selon contrat | stockage audio : + 5 à 20 €/mois |
| VM de développement | fournie par le client (poste existant ou VM louée ≈ 20 à 40 €/mois) | — |

---

## 5. Modèle de données et import du contenu

### 5.1 Principe : les fichiers des livres restent la source de vérité

Le contenu est produit, vérifié et versionné dans `awform\data\` (et `registre\`). L'application **n'est pas un outil de rédaction** : elle **importe** une photographie datée de ces fichiers, appelée **édition**, sans aucune ressaisie. Toute correction de contenu se fait dans les fichiers sources (avec le protocole de checkpoints), puis une nouvelle édition est importée.

### 5.2 Identifiants stables

| Objet | Identifiant | Exemple | Stabilité |
|---|---|---|---|
| Niveau | code du dossier | `en1`, `ad5`, `re3` | définitive |
| Unité (leçon, bilan, examen) | `<niveau>.l<NN>` = clé de `index-lecons.js` | `ad1.l05` (bilan 1) | définitive ; le numéro **affiché** (`num_lecon`, `num_bilan`) est un attribut qui peut changer |
| Exercice | `<unité>.ex<k>` + empreinte du contenu | `en1.l05.ex2#a91f…` | position stable tant que l'ordre ne change pas ; voir ci-dessous |
| Item d'exercice | `<exercice>.i<j>` | `en1.l05.ex2.i3` | idem |
| Lecture graduée | code du fichier | `en2-04` | définitive |
| Carnet de hifẓ | code | `hifz.ad1` | définitive |
| Descripteur du référentiel | `id` du référentiel | (champ `descripteurs[].id`) | définitive |
| Verset | `QUR_sss_vvv` | `QUR_002_255` | définitive |
| Hadith | `HAD_<recueil>_<numéro>` | `HAD_MUS_02699` | définitive (numéros alternatifs à part) |
| Règle de fiqh | `FIQH_MAL_<CODE>_l<NN>_<k>` | `FIQH_MAL_AD6_l03_1` | liée à la leçon d'origine |
| URL de QR | `/l/<niveau>-<NN>` | `/l/en1-05` | **éternelle** (table de redirection) |

**Point d'attention** : les exercices n'ont **pas d'identifiant propre** dans les fichiers (seulement leur position). Si un exercice est inséré ou déplacé dans une édition future, les positions changent. Deux solutions :
1. **[Recommandée]** après la stabilisation des livres et l'audit, un script ajoute à chaque exercice un champ `id` court (`"id": "e3k9"`), **invisible à l'impression**, que les rédacteurs conservent ensuite. Cela ne modifie ni le rendu ni le texte des livres (question au client, section 8).
2. Sinon, l'import rapproche les exercices d'une édition à l'autre par position, type et empreinte, et enregistre la correspondance dans une table `exercise_lineage` ; les cas ambigus sont listés pour décision manuelle.

### 5.3 Chaîne d'import (sans ressaisie)

1. **Lecture des fichiers** :
   - leçons (`data\<code>\lNN.js`), carnets (`data\hifz\*.js`), lectures (`data\lect\*.js`), évaluations (`data\eval\*.js`) : chaque fichier est **un appel `AW.xxx(<JSON strict>);`**. L'importeur extrait le texte entre la première `(` et la dernière `)` (exactement comme la commande de validation de `SCHEMA.md`) et le lit avec un analyseur JSON **strict** ; un fichier non conforme bloque l'import et est signalé ;
   - `book.js` et `index-lecons.js` : **objets JavaScript non stricts** (clés sans guillemets). L'importeur les évalue dans un **bac à sable** isolé (fonction `AW.book` factice, aucun accès au réseau ni aux fichiers, délai maximal), puis valide le résultat ;
   - illustrations (`illus\*.js`, `AW.illus(clé, viewBox, svg)`) : même méthode, dans l'ordre de chargement des pages, `zz-sansvisage.js` en dernier ; le SVG est **assaini** (liste blanche d'éléments et d'attributs, aucun script).
2. **Validation** par les schémas de `packages/content-schema` (un schéma par type d'unité et par type d'exercice, reprenant `SCHEMA.md` et `religion_SCHEMA_ext.md`).
3. **Contrôles de contenu** (portage des scripts de production) : versets = Tanzil octet par octet, sauf écarts voulus (section 3.1) ; `ecoute.dit` (ou `reponse`) ∈ `options` ; `complete.reponse` ∈ `options` ; `ordre.phrase` = concaténation exacte des `mots` ; `trous` : autant de réponses que de `___` ; `qcm.reponse` résolue ; clés d'illustration existantes et personnages autorisés ; aucune translittération dans les champs élève ; aucun champ visible d'un bilan ne contient une réponse (règles d'AUDIT_BILANS : contrôle heuristique, avertissement) ; renvois « leçon N » cohérents avec `num_lecon`.
4. **Calculs** : empreinte SHA-256 de chaque unité (sur le JSON canonique, **sans normaliser** le texte), projections (5.4), cartes de révision, liens vers le registre (5.7), paquets de niveaux.
5. **Rapport d'import** lisible (nouveau, modifié, supprimé, erreurs, avertissements) → **aperçu** de l'édition dans l'administration (serveur de recette) → **publication** atomique par l'administrateur → génération des paquets et notification de mise à jour aux appareils.

L'import est **idempotent** : réimporter la même édition ne change rien ; il a son **checkpoint** (protocole `CHECKPOINTS.md`).

### 5.4 Projections : ce que chaque rôle reçoit

| Projection | Contenu | Destinataire |
|---|---|---|
| **élève — entraînement** | leçon sans `guide`, sans `tr`, sans `sources_fr`, sans `*.guide_fr`, sans `parents_fr`/`travail_perso_fr` (envoyés à l'espace parent/adulte), **avec** les réponses des exercices d'entraînement (correction hors ligne) | paquet de niveau |
| **élève — épreuve** | bilan/examen **sans aucune réponse**, sans traduction des versets, sans `phrases_masquees`, textes `non_prepare` absents | envoyée à l'ouverture de la session d'épreuve |
| **parent / adulte** | + `parents_fr`, `travail_perso_fr`, scripts `ecoute.dit` et dictées (mode « l'adulte lit ») | espace parent |
| **enseignant** | leçon **complète** (guide, corrigés, barèmes, remédiation, pages « non préparé ») | espace enseignant, en ligne ou paquet enseignant chiffré |
| **publique (QR)** | titre, objectifs, mots et images, sans exercices ni réponses | page `/l/<id>` |

Les projections sont **calculées par une seule fonction testée**, dérivée des règles du moteur (`lectureBilan`, `npSheet`, conventions des bilans du 28/09).

### 5.5 Principales tables

**Contenu (par édition)** : `edition` (code `2027.1`, date, empreinte de l'archive source, statut brouillon/publiée/retirée, notes de version) · `level` (code, filière, rang, métadonnées de `book.js` en JSONB) · `unit` (id stable, niveau, rang `n`, type lecon/bilan/examen, `num_lecon`, `num_bilan`, titres) · `unit_version` (unité × édition : JSON complet, projections, empreinte) · `exercise` / `exercise_version` (type, noté ou non, nombre d'items, empreinte) · `illustration` (clé, viewBox, SVG assaini, version) · `reading_book`, `hifz_plan`, `eval_descriptor`, `certificate_template` · `redirect` (URL courte → unité).

**Registre** : `reg_quran` (id, référence, texte Tanzil exact, statut) · `reg_hadith` (id, recueil, numéro, système de numérotation, numéros alternatifs, texte, rapporteur, degré et qui l'établit, statut, étapes, sources, `validation_humaine`, notes) · `reg_fiqh` (id, sujet, règle mālikite, autres écoles, niveau, sources, statut, `validation_humaine`) · `reg_dua` (plus tard) · `reg_usage` (élément × unité × édition, état `identique` / `a_verifier`) · `reg_validation` (validation humaine : référent, date, commentaire).

**Personnes et organisation** : `account` (e-mail ou téléphone, mot de passe haché, 2FA, pays, langue) · `person_profile` (enfant/ado/adulte, pseudonyme, année de naissance, avatar sans visage, filière) · `guardianship` (parent ↔ profil, consentements datés) · `school`, `school_member` (rôle) · `class`, `class_member`, `assignment` (devoir) · `session` · `consent` (type, version du texte, date, retrait).

**Apprentissage** : `event` (journal immuable : id UUIDv7, profil, type, unité/exercice/item, réponse, score, horodatages appareil et serveur, appareil, édition) · `progress` (état recalculé par profil × unité) · `srs_card` (état FSRS par profil × mot) · `hifz_log` (jour, pistes, minutes, écouté par) · `hifz_portion` (état J+n, manzil) · `hifz_validation` (compteurs, note /20, mention, validateur, type entraînement/officielle) · `exam_session`, `exam_submission`, `grade` (note par partie, barème, correcteur) · `certificate` (numéro, signature, statut) · `message`, `report` (signalement).

**Commerce** : `plan`, `subscription`, `payment` (référence prestataire uniquement), `activation_code` (lot, statut, niveau, durée), `license` (école, nombre d'élèves, période).

**Traçabilité** : `audit_log` (qui, quoi, quand, avant/après, pour les actions sensibles).

### 5.6 Suivi de l'apprentissage par événements

Chaque réponse est un **événement** rattaché à l'**édition** et à l'**empreinte** de l'exercice au moment de la réponse. Avantages : fonctionnement hors ligne sans conflit (section 2.15), statistiques par item (« item le plus échoué du niveau »), et **migration propre** quand le contenu change (5.8). Volume [ESTIMATION] : ≈ 50 à 150 événements par élève et par leçon ; 10 000 élèves actifs × 3 leçons/semaine ≈ 3 millions d'événements par semaine, ≈ 1 Go par an : volume confortable pour PostgreSQL (partitionnement par mois prévu).

### 5.7 Registre canonique dans l'application

- Import de `registre\coran.json`, `hadiths.json`, `fiqh.json` (et `invocations.json` quand il existera) avec chaque édition ; les liens leçon ↔ élément viennent des **`usages`** calculés par `build-registre.ps1` (les leçons ne portent pas elles-mêmes les identifiants `HAD_…` / `QUR_…` : ils sont déduits des références écrites dans le texte) ; l'importeur recalcule ces liens par le même algorithme (porté en TypeScript) pour vérifier la cohérence.
- **Sens des mises à jour** : les fichiers du registre restent la source de vérité de la production. La seule écriture faite dans l'application est la **validation humaine** du référent : elle est exportée (fichier JSON signé `validations_humaines_<date>.json`) pour être fusionnée dans le registre source par le processus de production, qui ne rétrograde jamais un statut (règle du registre).
- Le texte du Coran de référence est chargé depuis `coran\tanzil-uthmani.tsv` complet (6 236 versets), pas seulement les 731 versets utilisés, pour contrôler tout nouvel usage.

### 5.8 Versionnage des éditions

- **Numérotation** : édition `AAAA.n` (`2027.1`, `2027.2`…), alignée sur les éditions imprimées (« Édition 1.0 » dans les crédits, `AW.meta.version`) ; une édition imprimée et une édition numérique qui partagent le même contenu portent le même numéro.
- **Contenu d'une édition** : liste des unités avec leur empreinte ; une unité non modifiée est **partagée** entre éditions (pas de copie).
- **Publication** : une seule édition « courante » à la fois ; retour à l'édition précédente possible en un clic.
- **Élèves en cours** : un élève reste sur l'édition de son paquet jusqu'à la mise à jour (proposée hors leçon) ; ses réponses restent liées à leur édition ; si un exercice a changé (empreinte différente), ses anciennes réponses sont conservées dans l'historique mais **ne comptent plus** pour l'état « maîtrisé » de cet exercice ; une leçon dont seul le texte a changé garde son état.
- **Errata** : chaque édition a ses notes de version (liste des corrections, reprise de `ERREURS_SYSTEMIQUES.md` et des rapports `RESOLUTION_*`), visibles des enseignants.
- **Épreuves** : une session d'épreuve est figée sur une édition (on ne change jamais un examen en cours).

---

## 6. Plan de réalisation, tests et audit

### 6.1 Périmètre du MVP (minimum utile)

**Objectif** : que les familles et adultes de la **classe pilote** (déjà prévue sur Enfants N1 et Adultes N1, `TACHES_CLIENT.md`) utilisent l'application **à côté du livre**, hors ligne, et que l'on mesure ce qui sert vraiment.

**Inclus** : comptes parent (profils enfants) et adulte, consentements, suppression/export ; parcours **en1** et **ad1** complets (leçons + bilans en mode entraînement + examen en consultation) ; **8 types d'exercices langue** corrigés automatiquement ; mode « l'adulte lit » pour l'écoute et la dictée ; **tracé guidé des lettres** (modèles en1/ad1) ; **carnets de hifẓ E1 et N1** (plan, 3 pistes, J+n, validation d'entraînement par le parent) ; cartes de révision des mots de la leçon ; tableaux de bord parent et adulte ; **hors ligne** complet ; pages publiques des **QR** ; administration minimale (import, aperçu, publication d'édition, console du registre en lecture) ; déploiement en recette puis en production ; **bêta privée gratuite** sur invitation.

**Exclu du MVP** : enseignants et classes, épreuves notées, religion (re*), autres niveaux, paiement, messagerie, visio, certificats, audio.

### 6.2 Lots et estimation [ESTIMATION en jours de travail de Claude sur la VM]

| Lot | Contenu | Jours |
|---|---|---|
| **MVP** | | |
| L0 Fondations | outillage de la VM, dépôt, intégration continue, conteneurs, base, schémas de contenu, squelettes web/api/worker | 6 |
| L1 Import et éditions | importeur (JSON strict, bac à sable `book.js`, illustrations), contrôles (Tanzil, corrigés, translittération, visages), projections, registre, rapport, publication | 7 |
| L2 Lecteur de leçon | rendu des blocs (lettres colorées, scènes sans visage, lecture, mots, dialogue, Coran, adab), 8 types d'exercices, bibliothèque de correction testée sur les 4 316 exercices | 12 |
| L3 Hors ligne | service worker, paquets de niveau, IndexedDB, file d'événements, synchronisation idempotente | 5 |
| L4 Comptes et RGPD | parent, profils enfants, adulte, sessions, consentements, export/suppression, 2FA administrateur | 5 |
| L5 Hifẓ E1/N1 | plan, page de la semaine, J+n, manzil, validation d'entraînement | 4 |
| L6 Tracé, révisions, tableaux, QR | modèles de tracé des lettres, tracé guidé, cartes de mots, tableaux parent/adulte, pages `/l/<id>` | 6 |
| L7 Mise en service | sécurité (ASVS L2), accessibilité, performance Android, sauvegardes et supervision, déploiement, corrections de recette | 5 |
| **Total MVP** | | **≈ 50** (fourchette 45 à 58) |
| **V1** | | |
| V1-a Enseignants et classes | rôles école/enseignant, classes, devoirs, correction, classe papier, projection | 10 |
| V1-b Épreuves | bilans et examens notés, sessions, textes non préparés, barèmes, remédiation | 7 |
| V1-c Religion | 12 types Religion, rubriques, renvois, carnet de pratique, suivi des sourates | 7 |
| V1-d Toutes filières | en2-en5, ado1-ado4, ad2-ad10, re1-re5, tous les carnets de hifẓ (validation officielle, récital), lectures graduées | 8 |
| V1-e Révisions FSRS, certificats | vocabulaire et mots coraniques ; certificats signés et vérifiables | 7 |
| V1-f Messagerie encadrée, visio (liens) | | 5 |
| V1-g Paiement € et codes d'activation, Google Play (TWA) | | 7 |
| V1-h Stabilisation | audit Codex et corrections, accessibilité RGAA, charge | 5 |
| **Total V1** | | **≈ 56** (+ 15 % d'aléas) |
| **V2** (au fil des besoins) | mobile money FCFA/GNF (5), positionnement en ligne (4), reconnaissance des lettres (6), audio (4 à 6 selon l'option), ra1-ra4 et qc1-qc3 (3 à 5), messages enseignant ↔ ado, photos de cahier (3) | ≈ 25 à 30 |

**Total MVP + V1 ≈ 115 à 135 jours** avec les aléas. Un « jour de travail de Claude » = une journée de session de développement effective ; le calendrier réel dépend des **délais de recette du client** et des quotas d'usage. Ordre de grandeur calendaire [ESTIMATION] : MVP en **8 à 12 semaines** après le démarrage, V1 **3 à 4 mois** plus tard.

### 6.3 Jalons de recette par le client

| Jalon | Quand | Ce que le client vérifie (sur le serveur de recette, avec un téléphone réel) | Décision |
|---|---|---|---|
| **R0** | fin L1 | rapport d'import de toute la collection (erreurs = 0, avertissements expliqués) ; une leçon en1 et une ad1 affichées | go / corrections |
| **R1** | fin L3 | parcours en1 et ad1 complets en mode avion sur un Android d'entrée de gamme ; fidélité au livre (10 leçons tirées au sort comparées au PDF) | go / corrections |
| **R2** | fin MVP | création de compte parent + 2 enfants, hifẓ, tableaux, suppression de compte ; test par 3 à 5 familles pilotes | **ouverture de la bêta privée** |
| **R3** | fin V1 | enseignant avec une vraie classe (dont une classe papier), épreuve notée avec texte non préparé, paiement de test, certificat vérifié | **ouverture commerciale** |

Chaque jalon : note de livraison (fonctions, limites connues, résultats des tests), procès-verbal de recette signé par le client (liste des anomalies classées bloquante / majeure / mineure).

### 6.4 Plan de tests

| Niveau | Outil | Contenu | Seuil |
|---|---|---|---|
| Unitaires | Vitest | correction (20 types), normalisations, hifẓ (plan, J+n, barème, règle « verset oublié deux fois »), FSRS, projections, droits | couverture ≥ 90 % sur `correction`, `hifz`, projections, droits |
| **Tests générés depuis le contenu** | Vitest | pour **chaque** exercice des 602 fichiers : le corrigé obtient 100 %, chaque mauvaise option 0 ; chaque verset = Tanzil ; aucune réponse dans une projection d'épreuve ; aucun `tr` ni champ du guide dans une projection élève | 100 % |
| Intégration | Vitest + PostgreSQL en conteneur | API, synchronisation (doublons, désordre, hors ligne long), import d'éditions successives, migration de progression | 100 % des routes |
| Bout en bout | Playwright (Chromium, WebKit, émulation mobile, RTL) | parcours parent, enfant, adulte, hifẓ, mode avion, mise à jour d'édition ; plus tard enseignant, épreuve, paiement de test | parcours critiques verts avant chaque livraison |
| Visuels | Playwright (captures) | rendu des versets (signes coraniques), lettres colorées, scènes sans visage, comparés à des références | 0 différence non expliquée |
| **Android d'entrée de gamme** | 2 téléphones réels (ex. gammes Tecno Spark / itel / Samsung A0x, Android Go si possible) + Chrome DevTools à distance ; réseau 3G simulé et coupures | temps d'affichage, mémoire, installation, stockage persistant, tracé au doigt, lisibilité au soleil | budgets de la section 4.3 |
| Accessibilité | axe-core + grille RGAA manuelle | écrans principaux | 0 erreur critique |
| Sécurité | tests d'autorisation, analyse des dépendances, recherche de secrets, scan dynamique (OWASP ZAP de base) | à chaque livraison | 0 faille haute ou critique ouverte |
| Charge | k6 | 500 utilisateurs simultanés, pic de synchronisation du dimanche soir | p95 < 500 ms |

L'intégration continue refuse toute fusion si un test échoue. Les tests générés depuis le contenu sont **relancés à chaque nouvelle édition** : ils protègent aussi les livres.

### 6.5 Méthode de travail de Claude

- Travail par lots avec **checkpoint** (`CHECKPOINTS.md`, tâche `app-<lot>`) : reprise sans perte après une coupure, conformément à la règle d'autonomie de reprise.
- Décisions d'architecture écrites (`docs/adr/NNN-*.md`), journal des modifications, guide d'exploitation (démarrer, déployer, restaurer une sauvegarde, faire tourner une clé).
- Aucune donnée réelle d'élève sur la VM de développement ; données fictives générées.
- Aucun secret dans le dépôt ni dans les messages ; les secrets de production sont saisis **par le client** sur le serveur.

### 6.6 Protocole d'audit indépendant par Codex (lecture seule)

1. **Accès** : Codex reçoit un accès **en lecture seule** au dépôt (collaborateur « lecture » du dépôt privé, ou archive du dépôt à un commit donné) ; **aucun** accès aux serveurs, à la base de production, aux secrets, aux comptes de paiement. Il peut exécuter les tests dans **sa propre copie**, jamais pousser de code.
2. **Moments** : à la fin de L1 (import et règles de contenu), du MVP (avant bêta), de V1-b (épreuves), de V1-g (paiement), puis avant chaque ouverture (R2, R3) et une fois par an.
3. **Dossier remis à Codex** (`docs/audit/BRIEF_<jalon>.md`) : commit audité, périmètre, schéma d'architecture, modèle de menaces, commandes pour lancer les tests, et **grilles** : OWASP ASVS niveau 2 (points applicables), RGPD (minimisation, droits, durées, mineurs), règles de contenu (Tanzil octet par octet, aucune normalisation, pas de translittération élève, aucun visage, Ḥafṣ seul, réponses jamais envoyées en épreuve, statuts du registre invisibles aux élèves), performance hors ligne.
4. **Rendu attendu de Codex** : `AUDIT_<jalon>.md` : constats numérotés avec gravité (critique, haute, moyenne, basse, remarque), fichier et ligne, scénario de reproduction, recommandation.
5. **Réponse de Claude** : `AUDIT_<jalon>_REPONSES.md` : pour chaque constat, correction (commit), justification d'un refus, ou report daté ; tout constat critique ou haut est corrigé **avant** l'ouverture concernée.
6. **Contre-vérification** : Codex relit les corrections des constats critiques et hauts.
7. Le client reçoit une synthèse d'une page ; les échanges restent dans le dépôt (traçabilité).

---

## 7. Prérequis côté client

### 7.1 La VM de développement

| Élément | Recommandation |
|---|---|
| Système | **Ubuntu Server 26.04.1 LTS** (64 bits), à jour |
| Processeur / mémoire / disque | **4 vCPU minimum (8 conseillés), 16 Go de RAM (8 Go minimum), 150 Go SSD** (images de conteneurs, navigateurs de test Playwright, sauvegardes locales) |
| Réseau | accès Internet sortant stable ; aucun port entrant nécessaire sauf SSH pour le client ; adresse IP fixe facultative |
| Virtualisation imbriquée | à activer **si** l'on veut un émulateur Android sur la VM (sinon, tests sur les téléphones réels branchés au PC du client) |
| Comptes | un utilisateur dédié (ex. `awform`) avec `sudo` pendant l'installation de l'outillage (Docker, Node.js, pnpm, PostgreSQL client, Playwright), `sudo` retiré ensuite si le client le souhaite |
| Claude | Claude Code installé sur la VM, avec le dépôt de code |
| Sauvegarde de la VM | instantané avant le démarrage puis hebdomadaire (par l'hyperviseur du client) ; le code est de toute façon poussé chaque jour sur le dépôt distant |

### 7.2 Comptes à créer PAR LE CLIENT lui-même (au nom de la structure AWFORM)

Claude ne crée **aucun** compte et ne saisit **aucun** identifiant de paiement ni mot de passe réel ; le client crée les comptes, active la double authentification et transmet seulement les **clés techniques** nécessaires en les déposant lui-même sur le serveur.

| Compte | Quand | Remarques |
|---|---|---|
| **Dépôt de code privé** (GitHub ou GitLab, organisation au nom d'AWFORM) | avant L0 | le client est propriétaire ; Claude y pousse le code ; Codex reçoit un accès lecture |
| **Nom de domaine** (registraire européen) | avant R0 | ex. domaine de la marque + sous-domaines `app.`, `recette.` ; vérifier la marque à l'INPI/OAPI (`TACHES_CLIENT.md`) |
| **Hébergeur européen** (serveurs, stockage objet) | avant R0 | contrat de sous-traitance RGPD à accepter par le client |
| **E-mail transactionnel** (fournisseur européen) | avant R2 | domaine d'envoi authentifié (SPF, DKIM, DMARC) |
| **Paiement** : Stripe (ou marchand officiel) | avant V1-g | vérification d'identité de la structure, compte bancaire |
| **Agrégateur mobile money** (PayDunya, CinetPay) et/ou Wave Business | V2 | demander les grilles de frais par écrit (`NOTE_DIFFUSION.md`) |
| **Google Play Console** (25 $) | V1-g | compte « organisation » |
| **Apple Developer** (99 $/an) | plus tard | seulement si publication App Store |
| **Service de visio européen** | V1-f | selon l'offre choisie |
| **Azure Speech** ou contrat de récitations | quand l'audio reprend | la clé reste chez le client |

### 7.3 Juridique et conformité [À VÉRIFIER par des professionnels]

- **Structure juridique** de l'éditeur (association ou société) : prérequis à tout le reste (responsable de traitement, contrats, facturation).
- **Mentions légales** (loi pour la confiance dans l'économie numérique) : éditeur, directeur de la publication, hébergeur.
- **CGU** (règles d'usage, messagerie, signalement, suspension), **CGV** (abonnement, prix TTC, rétractation et renonciation, résiliation, codes d'activation, licences d'école), **politique de confidentialité** (et version pour enfants), **politique de cookies** (aucun traceur non essentiel prévu).
- **RGPD / CNIL** : registre des traitements, AIPD, contrats de sous-traitance, procédure de violation de données (72 h), procédure d'exercice des droits, désignation d'un référent (DPO si nécessaire).
- **Protection des mineurs** : charte de la messagerie et de la visio, procédure de signalement et d'orientation (numéros d'aide par pays), vérification des enseignants par les écoles (l'école répond de ses enseignants ; AWFORM peut exiger une attestation).
- **Licences** : mention Tanzil (CC BY 3.0), polices OFL, audio sous licence (EveryAyah exclu du produit payant sans autorisation).
- **Afrique de l'Ouest** : formalités de protection des données et de paiement pays par pays avant l'ouverture commerciale.

---

## 8. Risques, angles morts et questions ouvertes

### 8.1 Risques et angles morts

| # | Risque | Impact | Parade |
|---|---|---|---|
| 1 | **Audio absent** alors que 224 exercices d'écoute, les dictées, la qāʿida (qc) et le talqīn E1-E2 en dépendent | expérience incomplète pour un enfant seul | mode « l'adulte lit » (2.3.3) ; architecture audio prête (4.10) ; décision audio à prendre avant V1 |
| 2 | Récitations EveryAyah non licenciées pour un produit payant | juridique | aucune récitation tierce ; contrat avec un récitant ou licence explicite |
| 3 | **Exercices sans identifiant propre** | progression perdue si le contenu est réordonné | ajout d'un `id` par script (5.2) ou rapprochement automatique |
| 4 | Normalisation silencieuse de l'arabe (erreur systémique déjà rencontrée avec l'outil Edit) | verset altéré | aucun `.normalize`, tests octet par octet à chaque édition (3.1) |
| 5 | Fuite des corrigés et des guides (vendus sur papier) | commerce, triche | projections par rôle, épreuves sans réponses, guides réservés aux enseignants vérifiés |
| 6 | Téléphones très anciens, Opera Mini, KaiOS | exclusion d'une partie du public africain | page publique légère + PDF + papier ; tests sur appareils réels |
| 7 | Coût des données | abandon | paquets légers, téléchargement explicite, Wi-Fi seulement, pas de vidéo |
| 8 | Règles des magasins (facturation intégrée) | commission, rejet | vente sur le web ; TWA seulement pour la présence sur Google Play |
| 9 | Mineurs : messagerie, visio, photos | protection de l'enfance, réputation | pas de messages entre élèves, messages visibles du parent, pas d'enregistrement, pas de photos de visages |
| 10 | Le hifẓ déclaré à la maison n'est pas vérifiable | fausse assurance | deux niveaux de validation ; seul le maître certifie ; aucune ijāza |
| 11 | Validation humaine religieuse incomplète (points `VALIDATION_HUMAINE_REQUISE`) | contenu contesté | console du registre, validation par le référent, errata par édition |
| 12 | Dépendance à un seul développeur (Claude) et à ses quotas | arrêt du projet | code standard et documenté, ADR, audits Codex, comptes et secrets détenus par le client, checkpoints de reprise |
| 13 | Numéros d'aide et exemples locaux erronés (ex. 3020) | sécurité des enfants | table par pays datée, revérifiée chaque année |
| 14 | Certificats pris pour des diplômes officiels | juridique | mention « certificat privé », CECRL indicatif |
| 15 | Livres encore en production (ad10, ra, qc, carnets N9-N10) pendant la conception | reprises | l'application importe par éditions ; les nouveaux livres arrivent sans code nouveau (sauf nouveaux types d'exercices) |
| 16 | Nouveaux types d'exercices souhaités par les livres (`bd`, dialogue « messages ») | retard | tout nouveau type = schéma + rendu + correction + tests ; à annoncer avant rédaction |

### 8.2 Questions ouvertes au client (courtes)

1. **Nom et domaine** : la marque « AWFORM » est-elle confirmée (INPI/OAPI) et quel nom de domaine réserver ?
2. **Structure juridique** : association ou société, et quand ? (responsable de traitement, contrats, paiement)
3. **Modèle d'accès** : gratuit, gratuit + abonnement, ou accès inclus avec le livre (code) ? Prix indicatifs € et FCFA/GNF ?
4. **MVP sans audio** : acceptez-vous une bêta où l'adulte lit les exercices d'écoute et les dictées ?
5. **Identifiants d'exercices** : accord pour ajouter par script un champ `id` invisible à chaque exercice, après stabilisation des livres ?
6. **Points en validation humaine** : les leçons concernées sont-elles publiées normalement (recommandé) ou retenues jusqu'à validation ?
7. **Hébergeur** : préférence entre OVHcloud, Scaleway (France) et Hetzner (Allemagne) ?
8. **Écoles** : les licences d'école et l'espace enseignant sont-ils prioritaires dès V1 (recommandé) ?
9. **Afrique** : quel pays ouvrir en premier (Sénégal ?) et avec quel partenaire (école, dépôt) ?
10. **Téléphones de test** : pouvez-vous acheter 2 Android d'entrée de gamme (≈ 60 à 120 € chacun) et, si possible, en garder un au Sénégal/Mali pour un testeur local ?
11. **Référent religieux** : qui tiendra le rôle dans l'application (nom, disponibilité) ?
12. **Pilote** : combien de familles et d'adultes pour la bêta (proposition : 10 à 20 familles en1, 10 adultes ad1) ?

