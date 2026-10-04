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
| **Quran Foundation (API de Quran.com)** — `api-docs.quran.foundation/legal/developer-terms/` (dernière mise à jour lue : 04/10/2026) | `line_number`, `page_number`, codes de glyphes V1/V2 par mot | Applications payantes **permises** (« subscriptions, in-app purchases… ») si le contenu n'est affiché que dans l'application, sans revente ; mise en cache limitée à **1 semaine** sauf « Content Sync APIs » ; polices et images du Muṣḥaf conservables « if the Developer maintains an active account » ; **compte développeur et clés obligatoires**. | **Écarté pour l'instant** (compte à créer par le client). Voie la plus solide pour la mise en page exacte, à décider (D30). |
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
