# Licences des données tierces

Données de tiers utilisées par l'application, avec leur licence vérifiée (texte, adresse, date) et l'endroit où
le crédit est affiché. Toute nouvelle donnée tierce est ajoutée ici AVANT d'entrer dans le dépôt.

## 1. Tajwid en couleurs — annotations « quran-tajweed » (lot 29)

| Élément | Valeur |
|---|---|
| Œuvre | Annotations du tajwid, riwāya Ḥafṣ ʿan ʿĀṣim (fichier `output/tajweed.hafs.uthmani-pause-sajdah.json`) |
| Auteur | Collin Fair |
| Adresse | https://github.com/cpfair/quran-tajweed |
| Version retenue | commit `496f71cd191da00fa2a37ded79dbbddb033bb0ad` (12/10/2021) ; fichier de données inchangé depuis le commit `6689c33` (15/04/2017) |
| Licence | **Creative Commons Attribution 4.0 International (CC BY 4.0)** — https://creativecommons.org/licenses/by/4.0/ |
| Texte de la licence dans la source | README du dépôt, section « Using the tajweed JSON file » : « This data file is licensed under a Creative Commons Attribution 4.0 International License » (lien vers creativecommons.org/licenses/by/4.0/) |
| Vérifiée le | 04/10/2026 (README et historique git du dépôt cloné sur la VM `awform-dev`) |
| Empreinte SHA-256 du fichier d'origine | `151d616ad37a4cc21a80f20d5e1104c5b408375107ddd4d71247dea4c05ebf67` |
| Copie dans le dépôt | `packages/content/tajwid-source/cpfair-quran-tajweed-496f71c.hafs.uthmani-pause-sajdah.json.gz` (gzip du fichier d'origine, octet pour octet) |
| Méthode de la source | règles posées par des arbres de décision établis d'après des Muṣḥaf de tajwid (Dar al-Maʿrifa, ReciteQuran.com) ; projet signalé « non maintenu » par son auteur. Relecture par le référent religieux : décision **D29**. |

**Modifications faites par l'application** (à signaler, CC BY 4.0 § 3.a.1.B) : positions recalées sur notre texte
Tanzil (plus récent que la copie de 2017, il contient en plus des petites mīm après les tanwins, des signes de pause
et le signe ۞) ; plages coupées autour des signes de pause insérés ; aucune règle ajoutée, retirée ni modifiée.
Générateur : `packages/content/src/cli-tajwid.ts` (`pnpm --filter @awform/content tajwid`) ; résultat :
`apps/web/static/tajwid/NNN.json` (une sourate par fichier). Le test `packages/content/test/tajwid.test.ts`
refait le calage depuis la source et exige des fichiers identiques.

**Crédit affiché** : dans l'application, sous le bouton « Tajwid en couleurs » (Lire, Mémoriser, Écouter en
Ḥafṣ), dès que les couleurs sont affichées : auteur, nom du jeu, licence, mention du recalage, lien vers la
source et lien vers la licence (clé `tj.credit`, composant `apps/web/src/lib/quran/TajwidBar.svelte`).

## 2. Texte Tanzil Uthmani 1.0.2 (copie d'avril 2017) — référence du calage du tajwid

| Élément | Valeur |
|---|---|
| Œuvre | Tanzil Quran Text (Uthmani, version 1.0.2), © 2008-2010 Tanzil.net |
| Adresse | copie fournie par le projet quran-tajweed : https://github.com/cpfair/quran-tajweed/files/7281388/quran-uthmani.txt (téléchargée par son auteur vers le 06/04/2017) ; site : https://tanzil.net |
| Licence | **Creative Commons Attribution 3.0** et conditions de Tanzil : copie verbatim permise, **modification interdite**, source (Tanzil.net) indiquée avec un lien, bloc de droits d'auteur conservé |
| Vérifiée le | 04/10/2026 (bloc de droits d'auteur à la fin du fichier) |
| Empreinte SHA-256 | `abe6447a5d29bb126383ba9120628060cf96dc9ef5b402a506fc251f6ed0b9a2` |
| Copie dans le dépôt | `packages/content/tajwid-source/tanzil-quran-uthmani-1.0.2-2017-04.txt.gz` (verbatim, bloc de droits compris) |
| Usage | seulement pour recaler les positions des annotations ; **jamais affiché** (l'application affiche le texte Tanzil des livres, `~/awform-content/coran/tanzil-uthmani.tsv`, octet pour octet) |

## 3. Texte et métadonnées Tanzil des livres (rappel)

- Texte coranique : Tanzil « quran-uthmani », riwāya Ḥafṣ — conditions de Tanzil (verbatim, source indiquée) ;
  crédit : clé `lecteur.credit`, page « Garanties » (`gar.coran`).
- Métadonnées (pages du Muṣḥaf de Médine, ajzāʾ, aḥzāb) : Tanzil.info, Quran Metadata 1.0, **CC BY 3.0**
  (`packages/content/src/qurandata.ts`) ; crédit : clé `lecteur.credit`.

## 4. Traductions du sens — QuranEnc.com (Muṣḥaf par page)

| Élément | Valeur |
|---|---|
| Œuvres | **Français — Rachid Maach** (`french_rashid`, version **1.0.3**) ; **Anglais — Rowwad Translation Center** (`english_rwwad`, version **1.0.19**, « Translated by the team of the Rowwad Translation Center, in cooperation with the Rabwah Dawah Association, the Islamic Content Service Association in Languages, and the IslamHouse.com website ») |
| Éditeur / source | QuranEnc.com — Encyclopédie des traductions du sens du Noble Coran : https://quranenc.com/fr/browse/french_rashid , https://quranenc.com/en/browse/english_rwwad ; fichiers : https://quranenc.com/downloads/sqlite/french_rashid.sqlite , https://quranenc.com/downloads/sqlite/english_rwwad.sqlite |
| Conditions (texte exact, page de chaque traduction, « Terms and Policies ») | « Contents of the translations can be downloaded and re-published, with the following terms and conditions: 1. No modification, addition, or deletion of the content. 2. Clearly referring to the publisher and the source (QuranEnc.com). 3. Mentioning the version number when re-publishing the translation. 4. Keeping the transcript information inside the document. 5. Notifying the source (QuranEnc.com) of any note on the translation. 6. Updating the translation according to the latest version issued from the source (QuranEnc.com). 7. Inappropriate advertisements must not be included when displaying translations of the meanings of the Noble Quran. » |
| Usage commercial | non restreint par ces conditions (republication permise sans réserve commerciale) ; l'application n'affiche aucune publicité |
| Vérifiée le | 04/10/2026 (page lue depuis la VM `awform-dev` ; liste des versions par l'API `https://quranenc.com/api/v1/translations/list/fr` et `/en`) |
| Empreintes SHA-256 (fichiers SQLite d'origine) | `french_rashid` : `1c8d1f66f3ab8d708ba84db79b8c069dede23a3e40fff253d3ca14deafba87bf` ; `english_rwwad` : `77e2ede3d8e6d6b5c6e16ff78eda2d2b6cc0a6b7489c94a5dde4f7481f5fdee8` |
| Copie dans le dépôt | `packages/content/traduction-source/quranenc-*.sqlite.gz` (gzip des fichiers d'origine, octet pour octet : les informations de la source y restent, condition 4) |
| Méthode | générateur `packages/content/src/cli-traductions.ts` (`pnpm --filter @awform/content traductions`) → `apps/web/static/traductions/<clé>/NNN.json` : texte et notes **recopiés tels quels** (condition 1) ; le test `packages/content/test/traductions.test.ts` contrôle l'empreinte, les 6 236 versets et l'identité des fichiers livrés avec la source |
| Mises à jour (condition 6) | à chaque nouvelle version publiée par QuranEnc : télécharger le fichier SQLite, le compresser dans `traduction-source/`, mettre à jour la version et l'empreinte (`cli-traductions.ts`, `lib/quran/translation.ts`, ce tableau), relancer le générateur |

**Crédit affiché** : sous le panneau de traduction de l'onglet « Muṣḥaf » : titre, version, « publiée par
QuranEnc.com (Encyclopédie des traductions du sens du Noble Coran), reproduite sans modification », lien vers la
page de la traduction (clé `mp.credit_traduction`). Les notes du traducteur sont affichées (« Notes du traducteur »).

## 5. Sources examinées et NON retenues (Muṣḥaf par page)

Voir `docs/projet/SOURCES_MUSHAF.md` : polices « par page » du Complexe (licence compatible, mais aucune donnée
de lignes officielle accessible), QUL et Quran Foundation (compte nécessaire), miroir `nuqayah/qpc-fonts`
(non officiel), traductions Tanzil (non commerciales), Hamidullah / Sahih International (protégées), texte Warsh
(non vérifiable avant A8 — voir § 6). **Rien n'est extrait de l'application Ayat.**

## 6. Muṣḥafs des riwāyāt — textes et polices du Complexe du Roi Fahd (chantier A8)

| Élément | Détail |
|---|---|
| Source | Complexe du Roi Fahd pour l'impression du Noble Coran (Médine), plateforme développeurs `https://download.qurancomplex.gov.sa/resources_dev/` (relevé du 04/10/2026, `W\application\licences\INVENTAIRE_COMPLEXE.md`) |
| Licence du texte (L-DEV) | « peut être utilisé dans le développement d'applications et de logiciels » (page de la plateforme) — mise à disposition déclarée pour les applications |
| Licence des polices | contrat inclus dans chaque police (table `name`, champ 13, lu le 05/10/2026) : droit **gratuit** d'utiliser, copier et distribuer ; la police ne peut être **ni vendue, ni modifiée, altérée, traduite, désassemblée** ; fournie « en l'état ». **Couvre l'usage dans l'application** à condition de servir le fichier TTF **tel quel** (aucune conversion WOFF2, aucun sous-ensemble) et de ne jamais le vendre (il est livré gratuitement avec le texte, comme le reste de l'espace Coran). Fichiers de la plateforme développeurs seulement : les polices du site fonts.qurancomplex.gov.sa (« tous droits réservés ») ne sont pas utilisées |
| Riwāyāt | Warsh, Qālūn (kfgqpc_*_v30, police 3.0), Shuʿba, as-Sūsī, al-Bazzī (v30, police 3.0), ad-Dūrī (UthmanicDouri v2.0, police 2.0). Ḥafṣ reste le texte **Tanzil** des livres (inchangé) |
| Archives (SHA-256 relevés au téléchargement, conformes aux empreintes publiées) | warsh `d79b0e9d…bbda`, qalun `32552185…65d9`, shubah `e2ec0e48…6288`, susi `c202fee4…714e`, bazzi `54700100…172b`, UthmanicDouri `84e55697…c0b1` (MD5 publié `a60bdd18…35c8`) ; empreintes complètes des fichiers JSON et TTF : `packages/content/src/riwayat.ts` |
| Copie dans le dépôt | `packages/content/riwayat-source/*.json.gz` (gzip du JSON d'origine, retrouvé octet pour octet) ; polices TTF d'origine dans `apps/web/static/riwayat/<riwāya>/` |
| Méthode | `packages/content/src/cli-riwayat.ts` (`pnpm --filter @awform/content riwayat [--from <dossier du Complexe>] [--check]`) → `apps/web/static/riwayat/<riwāya>/NNN.json` + `index.json` : texte et nom de sourate **recopiés tels quels** (aucune NFC, rien de retapé) ; test bloquant `packages/content/test/riwayat.test.ts` (empreintes, comptes officiels par sourate, identité des fichiers livrés avec la source) |
| Comptes relevés | Warsh et Qālūn 6 214, Shuʿba 6 236, as-Sūsī 6 218, **ad-Dūrī 6 217** (le fichier UthmanicDouri v2.0 numérote al-Mulk en 30 versets ; as-Sūsī : 31), al-Bazzī 6 220 (basmala = 1:1 d'al-Fātiḥa) |
| Mises à jour | nouvelle version du Complexe : décompresser l'archive, mettre à jour version et empreintes dans `riwayat.ts`, relancer `riwayat --from` |

**Crédit affiché** (Lire, Écouter, Muṣḥaf, clé `rw.credit`) : « Texte : Complexe du Roi Fahd pour l'impression du
Noble Coran (Médine), riwāya …, version … (plateforme développeurs) ; police du Complexe (version …), livrée sans
modification. »
