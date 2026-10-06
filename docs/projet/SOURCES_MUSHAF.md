# Sources pour l'espace « Muṣḥaf par page » (style Ayat) — recherche du 04/10/2026

Règle du client (03/10) : **rien n'est extrait de l'application Ayat** (images de pages, polices, audio,
traductions : propriétaires ; ses audios viennent d'EveryAyah, sans licence). On ne reprend que l'ergonomie.
Une source n'entre dans le dépôt que si sa licence permet l'usage dans une application avec services payants,
vérifiée (texte exact, adresse, date) et consignée dans `LICENCES.md`, avec crédit affiché.

Vérifications faites depuis la VM `awform-dev` et le poste du chef de projet, le 04/10/2026.

## 1. Mise en page exacte des 604 pages (polices « par page » du Complexe)

| Source | Ce qu'elle apporte | Licence / accès | Verdict |
|---|---|---|---|
| **Complexe du Roi Fahd — « Muṣḥaf al-Madīna numérique »** : `qurancomplex.gov.sa/Downloads/Fonts/Data.zip` (polices `QCF_P001…604`, édition 1405, + `QCF_BSML`) et `nashr.qurancomplex.gov.sa/download/Al_Madinah_Mushaf_Win_Setup_25-2-2015.rar` (polices `QCF2001…2604`, édition 1421) | une police par page, un glyphe par mot (ordre de lecture `U+FB51…`), signes de fin de verset compris | Site du Complexe **injoignable** depuis la VM (et depuis la France) ; fichiers **officiels** récupérés par leurs adresses d'origine dans les archives de la Wayback Machine (captures du 23-29/03/2015 et du 01/07/2017 ; SHA-256 `7fe7a871…edb8` et `fe7fed92…bfe0`). Conditions du Complexe (page « Copyright » de dm.qurancomplex.gov.sa, capture Wayback du 19/08/2019) : « Mus'haf al-Madinah in these previous formats [Illustrator, PDF, images, **True Type Font**] can be used for free in all personal, **individual businesses**, … digital publishing, … can be used also in **websites, software**, and other similar intermediates » ; réserve : impression du Coran en Arabie saoudite / importation pour la vente (décrets royaux). Licence intégrée aux polices : « may not be reproduced, **modified** without the express written approval » ⇒ fichiers servis **tels quels** (ni sous-ensemble, ni conversion woff2). | **Licence compatible, mais insuffisant seul** : les polices ne contiennent **pas les fins de ligne**. Les données du paquet (`WordsPos.txt`, `mmp.txt`, `Oth.txt`) sont un index de recherche (sourate, verset, mot), sans page ni ligne ; vérifié aussi : les largeurs des glyphes ne permettent pas de retrouver les lignes. **Non intégré** (voir § 6). |
| **QUL (Tarteel)** — `qul.tarteel.ai/resources/mushaf-layout/15` (V1 1405) et `/10` (V2 1421) : lignes, pages, positions des mots | données de mise en page exactes (mot → ligne) | Téléchargement **réservé aux comptes** (`/users/sign_in`) ; FAQ : « Yes, you can use QUL data in commercial projects. However, please review the licensing terms for each resource » ; aucune licence affichée sur ces ressources ; conditions générales = celles de Tarteel (`tarteel.ai/terms`). Code du dépôt GitHub sous MIT (ne couvre pas les données). | **Écarté pour l'instant** : création de compte interdite à l'agent ; licence de la ressource non écrite. Alternative : le client crée un compte, et nous vérifions la licence de la ressource. |
| **Quran Foundation (API de Quran.com)** — `api-docs.quran.foundation/legal/developer-terms/` (dernière mise à jour lue : 04/10/2026) | `line_number`, `page_number`, codes de glyphes V1/V2 par mot | Applications payantes **permises** (« subscriptions, in-app purchases… ») si le contenu n'est affiché que dans l'application, sans revente ; mise en cache limitée à **1 semaine** sauf « Content Sync APIs » ; polices et images du Muṣḥaf conservables « if the Developer maintains an active account » ; **compte développeur et clés obligatoires**. | **Retenu par « Content Sync » SEULEMENT (A34, 06/10/2026)** : compte créé par le client ; copie tenue à jour sur le serveur, jamais dans le dépôt ni la construction — voir § 7. |
| Miroir `github.com/nuqayah/qpc-fonts` (polices V1.5, V2, V4, `mushaf-v2.txt`) | polices + glyphes par ligne (V2) | Renvoie à la page « Copyright » du Complexe ; « v1.5 » = polices **modifiées** par des tiers ; provenance des lignes de `mushaf-v2.txt` non documentée | **Écarté** (non officiel ; sert seulement à la comparaison pendant la recherche, rien n'est copié). |

**Conclusion** : vue par page **aux pages exactes du Muṣḥaf de Médine** (débuts de page : métadonnées Tanzil,
CC BY 3.0, déjà dans le dépôt), texte Tanzil, **mise en page fluide** (lignes non exactes), en double page
« livre » sur ordinateur et une page à la fois sur téléphone. Mise en page exacte ligne par ligne : décision D30.

## 2. Muṣḥaf tajwīd coloré

| Source | Verdict |
|---|---|
| Polices QPC « V4 » du Complexe (`QCF4_Hafs_xx_W`, « Mushaf Publisher », nashr.qurancomplex.gov.sa) | mêmes conditions du Complexe, mêmes limites (police par juzʾ/mot, **aucune donnée de lignes**, couleurs liées à la mise en page exacte). **Non intégré.** |
| Annotations « quran-tajweed » de Collin Fair (CC BY 4.0, lot 29, déjà dans le dépôt) | **Retenu** : couleurs posées sur le texte Tanzil de la vue par page (même module, mêmes tests, même crédit). |

## 3. Warsh

Le Complexe publie une version numérique Warsh (page « Copyright » : mêmes conditions) et une police
« Uthmanic Warsh » ; mais le **texte** Warsh n'est accessible que par des miroirs tiers (le site du Complexe est
injoignable, aucune capture d'archive du fichier) et nous n'avons **aucune référence pour contrôler son
intégrité** (notre contrôle repose sur Tanzil, qui ne publie que Ḥafṣ). **Reporté** : le sélecteur affiche
« Warsh » **clairement étiqueté et désactivé** (« bientôt : en attente du texte officiel du Complexe »).

## 4. Traductions du sens

| Source | Licence (texte exact) | Verdict |
|---|---|---|
| Tanzil (traductions) | « for non-commercial purposes only » | **Écarté** |
| Hamidullah, Sahih International (Dar Abul-Qasim), Noor International | droits d'éditeurs, pas de licence commerciale publiée | **Écartés** |
| **QuranEnc.com** (Encyclopédie des traductions du sens du Noble Coran, Centre de traduction Rowwad) — `quranenc.com/fr/browse/french_rashid` | « Contents of the translations can be downloaded and re-published, with the following terms and conditions: 1. No modification, addition, or deletion of the content. 2. Clearly referring to the publisher and the source (QuranEnc.com). 3. Mentioning the version number when re-publishing the translation. 4. Keeping the transcript information inside the document. 5. Notifying the source (QuranEnc.com) of any note on the translation. 6. Updating the translation according to the latest version issued from the source (QuranEnc.com). 7. Inappropriate advertisements must not be included when displaying translations of the meanings of the Noble Quran. » (lu le 04/10/2026). Republication **autorisée**, aucune restriction commerciale ; obligations : texte intégral et non modifié (notes comprises), source, version, mises à jour, pas de publicité inconvenante (l'application n'en a aucune). | **Retenus** : **français — Rachid Maach** (`french_rashid`, v1.0.3) ; **anglais — Rowwad Translation Center** (`english_rwwad`, v1.0.19). Fichiers SQLite officiels de QuranEnc gardés tels quels (SHA-256 dans LICENCES.md). |

Choix de la traduction à faire valider par le référent religieux (D30).

## 5. Cadre orné

Dessiné par nous (SVG géométrique : entrelacs à huit pointes et rinceaux floraux stylisés, **sans figuration**),
quelques centaines d'octets, couleurs par les jetons du thème.

## 6. Ce qui reste à décider (D30)

1. **Mise en page exacte** : (a) le client crée un compte développeur Quran Foundation (conditions lues : apps
   payantes permises, contenu non revendu, synchronisation pour le hors ligne) ; ou (b) un compte QUL et une
   licence écrite pour la ressource « KFGQPC V1/V2 layout » ; ou (c) une demande écrite au Complexe (données de
   lignes). Les polices officielles du Complexe sont déjà identifiées et leur licence permet l'usage.
2. **Warsh** : texte officiel du Complexe (demande écrite ou fichier reçu) + méthode de contrôle.
3. **Traductions** : validation du choix (Rachid Maach, Rowwad) par le référent.

## 7. A34 — Mise en page exacte par « Content Sync » de Quran Foundation (06/10/2026)

Conditions relues le 06/10/2026 (page « Developer Terms », mise à jour du **04/10/2026**, https://api-docs.quran.foundation/legal/developer-terms/ ; guide
Content Sync, https://api-docs.quran.foundation/docs/tutorials/content-sync/getting-started/) :

| Point | Texte (extraits courts) | Conséquence pour Awzid |
|---|---|---|
| Garder hors ligne | « Cache or store QF Content longer than 1 week unless it is obtained and maintained through the Content Sync APIs » (interdit) ; Content Sync est « the only permitted path for obtaining and maintaining an offline copy » | les lignes ne sont gardées que via Content Sync (ressource `mushafs:<id>` : fiche, pages, **mots positionnés** avec `page_number`, `line_number`, glyphe) |
| Fréquence | « at least every 7 days when connectivity to QF permits » ; sans connexion plus de 7 jours, l'application peut continuer avec la copie déjà synchronisée | minuteur hebdomadaire sur le serveur ; l'API signale `enRetard` au-delà de 7 jours ; l'appareil revalide ses pages au-delà de 7 jours quand il est en ligne |
| Livraison groupée | « The Content Sync storage exception does not itself authorize distributing a prepackaged database or build-time bundle of QF Content » | **aucun** `lignes-v1.json` dans le dépôt, dans la construction ou préchargé : la copie vit sur le serveur (`AWFORM_QF_MUSHAF_DIR`) et l'API la sert **une page à la fois** aux utilisateurs connectés ; l'appareil ne garde que les pages consultées |
| Revente / API | « QF Content and raw API data are not sold, sublicensed, or redistributed » ; redistribuer = les offrir « as data—for example, through the Developer's own API » | pas d'API ouverte : route réservée aux comptes connectés, non documentée publiquement, contenu affiché seulement dans l'application ; une licence commerciale écrite serait nécessaire pour toute autre diffusion |
| Application payante | « charge for an Application, offer subscriptions or in-app purchases … provided that QF Content is displayed only as part of the Application's end-user experience » | compatible avec les services payants d'Awzid |
| Compte et crédit | compte actif dans la « Developer Console » et crédit de Quran Foundation « in a reasonably accessible place » | crédit affiché sous la page et sur la page « Garanties » ; compte du client à garder actif |
| Fin | à la résiliation : « promptly delete QF Content » | ressource retirée (`RESOURCE_DELETE`) → publication supprimée par l'outil ; état « indisponible » → l'appareil efface ses pages gardées ; en cas de résiliation, supprimer `AWFORM_QF_MUSHAF_DIR` |

**Polices** : les glyphes `code_v1` (« QCF V1 ») désignent l'édition **1405** du Muṣḥaf de Médine, une police par
page dont le premier mot est U+FB51 (ex. 2:1 mot 1 = page 2, ligne 3, « ﭑ »). Vérifié le 06/10/2026 en dessinant
les polices officielles du Complexe (`Data.zip`, SHA-256 `7fe7a871…edb8`) : dans `QCF_P002`, U+FB51 = « الٓمٓ »,
U+FB52 = fin du verset 1, puis les mots de 2:2 à 2:5 dans l'ordre (les signes de pause de 2:2 sont des glyphes
à part, U+FB57 et U+FB59) ; `QCF_BSML` : basmala = U+FB51-FB53, « سورة » = U+FB8C, noms des sourates 1-37 =
U+FB8D-FBB1 et 38-114 = U+FBD3-FC1F. Nous servons **ces polices du Complexe** (pas celles de Quran Foundation),
TELLES QUELLES (fichiers TTF d'origine, seul le nom est uniformisé en `.ttf`), depuis `AWFORM_QCF_DIR` :
605 fichiers, **95,4 Mo** bruts (page : 81 à 180 Ko ; environ 51 Mo au total une fois compressés en Brotli). Le contrôle bloquant de l'outil vérifie que **chaque glyphe
des données existe dans la police de sa page** (table `cmap`) : un écart d'édition (V1 ≠ 1405) serait refusé.

**Outils** : `infra/outils/qf-lignes/qf-lignes.mjs` (`sync` / `verifier` / `inspecter`),
`installer-polices.sh` ; logique et contrôle : `apps/web/src/lib/quran/mushaf-exact.ts` (testé :
`mushaf-exact.test.ts`) ; API : `apps/api/src/mushaf-exact.ts` ; composant : `MushafPageExacte.svelte`
(non branché sur l'écran Coran tant que la première synchronisation n'est pas validée).
Le texte **Tanzil** reste la référence (recherche, copie, audio, lecteurs d'écran) ; les glyphes n'en sont
qu'une présentation, et chaque verset doit avoir exactement le même nombre de mots, dans le même ordre.

## 8. A2 — Récitateurs EN LIGNE de Quran Foundation (06/10/2026)

Conditions relues le 06/10/2026 (« Developer Terms », mise à jour du **04/10/2026**,
https://api-docs.quran.foundation/legal/developer-terms/ ; documentation audio : `/recitations/{id}/by_chapter/{sourate}`,
`/recitations/{id}/by_ayah/{verset}`, fichier de sourate des « chapter reciters » avec minutage par verset ; guide Content Sync,
https://api-docs.quran.foundation/docs/tutorials/content-sync/getting-started/) :

| Point | Texte (extraits courts) | Conséquence pour Awzid |
|---|---|---|
| Définition | « QF Content » = « Quran text, translations, metadata, audio … returned by the APIs » | les adresses et métadonnées audio sont du contenu QF |
| Lecture en continu dans une app payante | « A Developer may charge for an Application, offer subscriptions or in-app purchases » si le contenu est « displayed only as part of the Application’s end-user experience » ; « Serving QF Content from a Developer-controlled backend within the Application's end-user experience is not, by itself, redistribution » | **permis** : l’appareil joue le fichier depuis l’adresse renvoyée par QF, à l’intérieur de l’application (abonnements compris) ; l’audio n’est jamais vendu à part |
| Enregistrements | « Recitation metadata and audio URLs are distinct from the underlying recordings » | QF licencie les métadonnées et les adresses, **pas** les enregistrements : aucune copie des fichiers chez nous ni sur l’appareil, aucun relais d’école, pas de mandataire qui réémet l’audio |
| Cache | interdit de « Cache or store QF Content longer than 1 week unless it is obtained and maintained through the Content Sync APIs » ; Content Sync est « the only permitted path » pour une copie hors ligne (les groupes `recitations` et `chapter_recitations` y figurent) | réponses de QF gardées **24 h en mémoire** du serveur (jamais sur disque), réponse au navigateur `private, max-age=3600` ; **aucun téléchargement hors ligne** : Content Sync ne porte que les lignes (adresses, minutages), pas les fichiers audio, et les conditions ne donnent aucun droit de copie des enregistrements |
| Redistribution | interdit de les offrir « to others as data—for example, through the Developer’s own API » | adresses servies seulement aux **comptes connectés** de l’application (401 sinon), route non documentée publiquement |
| Compte et crédit | compte actif dans la « Developer Console » ; crédit de Quran Foundation « in a reasonably accessible place » | crédit sur chaque récitateur (« écoute en ligne fournie par Quran Foundation »), étiquette « En ligne », page « Nos garanties » (5 langues) ; compte du client à garder actif |
| Débit | interdit de « Exceed published rate limits » | une requête par sourate et par récitateur au plus toutes les 24 h (cache), une seule à la fois |
| Fin | à la résiliation, « promptly delete QF Content » | rien n’est stocké : retirer les identifiants (`QF_CLIENT_ID`, `QF_CLIENT_SECRET`) suffit ; le cache mémoire disparaît au redémarrage de l’API |

**Conclusion** : la lecture en continu des récitations de QF dans Awzid, application payante, est **permise** par
les conditions du 04/10/2026, à condition de (1) jouer les fichiers depuis les adresses de QF à l’intérieur de
l’application, (2) ne garder les réponses que 24 h (≤ 1 semaine), (3) ne faire **aucune** copie durable des
enregistrements (pas de mode hors ligne pour ces récitateurs), (4) ne pas réexposer les adresses comme une API
ouverte, (5) afficher le crédit de Quran Foundation et garder le compte développeur actif. Les droits des
enregistrements eux-mêmes restent à leurs titulaires (les conditions le disent) : une confirmation écrite de QF
est recommandée avant la production si le client veut un jour un mode hors ligne pour ces voix.

**Identifiants** (« Ayah-by-ayah recitation ID ») : prélancement vérifié par le chef de projet : 6 (al-Ḥuṣarī),
7 (al-ʿAfāsī). Production : liste publique de l’API v4 relevée le 06/10/2026 (à confirmer avec
`infra/outils/qf-audio/qf-recitateurs.mjs` et les identifiants de production) :

| Awzid | Récitateur | Style | id QF production |
|---|---|---|---|
| `qf-husary` | Maḥmūd Khalīl al-Ḥuṣarī — محمود خليل الحصري | murattal | 6 |
| `qf-husary-muallim` | al-Ḥuṣarī (muʿallim) | muʿallim | 12 |
| `qf-afasy` | Mishārī Rāshid al-ʿAfāsī — مشاري راشد العفاسي | murattal | 7 |
| `qf-sudais` | ʿAbd ar-Raḥmān as-Sudays — عبد الرحمن السديس | murattal | 3 |
| `qf-shuraym` | Saʿūd ash-Shuraym — سعود الشريم | murattal | 10 |
| `qf-shatri` | Abū Bakr ash-Shāṭirī — أبو بكر الشاطري | murattal | 4 |
| `qf-minshawi` | Muḥammad Ṣiddīq al-Minshāwī — محمد صديق المنشاوي | murattal | 9 |
| `qf-minshawi-mujawwad` | al-Minshāwī (mujawwad) | mujawwad | 8 |
| `qf-abdulbasit` | ʿAbd al-Bāsiṭ ʿAbd aṣ-Ṣamad — عبد الباسط عبد الصمد | murattal | 2 |
| `qf-abdulbasit-mujawwad` | ʿAbd al-Bāsiṭ (mujawwad) | mujawwad | 1 |
| `qf-rifai` | Hānī ar-Rifāʿī — هاني الرفاعي | murattal | 5 |

Non retenus pour l’instant : Muḥammad aṭ-Ṭablāwī (id 11, disponible, non demandé) ; **ʿAbd Allāh al-Maṭrūd** (deux
enregistrements demandés) : absent de la liste verset par verset ; seulement parmi les « chapter reciters »
(fichier par sourate + minutage par verset, `/chapter_recitations`), dont la liste demande les identifiants →
à relever avec `qf-recitateurs.mjs`, puis lecture « sourate minutée » à ajouter au lecteur (non fait).

