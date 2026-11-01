# Renfort de la détection du tajwīd : plus de données, vraies fautes, règles réparées

1er novembre 2026. Branche `tajwid-renfort-wip`, partie de `tajwid-seuils-wip` (6c1facd). Worktree : `~/wt/tajwid-2`.
**Rien n'est allumé en production.** `seuils_tajwid.json` n'est pas modifié : toutes les règles restent éteintes, sauf `madd_muttasil`, toujours en « indication » derrière l'interrupteur `tajwid_madd`, qui reste éteint.
Aucun texte coranique modifié : Tanzil est lu octet pour octet, sans NFC. Aucune synthèse vocale. Les fautes simulées sont des montages de l'audio du même récitant.

**Rapport PARTIEL**, et je le dis franchement. Les données réelles (QDAT) sont entièrement traitées, mais **les voix professionnelles nouvelles ne le sont pas encore** : 1 voix sur les 33 prévues est mesurée (Ayyūb). Les causes :
- la VM était saturée par les autres agents (charge de 7 à 54, mémoire disponible à 2 Go, swap plein) ;
- deux de mes conteneurs ont été tués par manque de mémoire (code 137) ;
- avec les règles fixées par le coordinateur (lancer seulement si la charge est ≤ 8, s'il reste 6 Go de mémoire et si le disque est sous 87,5 % ; pause si la charge dépasse 12 ou si la mémoire passe sous 2 Go), la chaîne attend depuis 10 h 35.

La chaîne `renfort/maitre.sh` reste en place et reprend seule (§ 9). Les chiffres « voix jamais vues » du § 6 sont donc **à venir**.

## 0. L'essentiel en 6 lignes

1. **Découverte la plus importante : la « ghunna très courte », déclarée « prête à valider » le 1/11, ne l'est pas.** Sur les récitations d'apprenants réels jugées justes (514 dans QDAT, 118 dans qdat_bench), le seuil du 1/11 (1,743) donne **40 à 43 % de fausses alertes**. La référence Ayyūb tient la ghunna très longtemps, alors qu'un apprenant correct la tient 2 temps.
2. Recalibrée sur des apprenants (validation croisée par récitant), la ghunna du nūn mushaddad atteint **60 à 73 % de détection pour 2 à 3,4 % de fausses alertes**, femmes comprises. C'est insuffisant : elle reste éteinte.
3. Sur vraies fautes : ikhfāʾ « ن clair » = **0 fausse alerte** sur les apprenants justes (0/332 dans QDAT, borne haute 1,1 % ; 0/64 dans qdat_bench), mais seulement 42 à 47 % de détection. Qalqala finale : environ 30 %. Toutes deux restent éteintes.
4. Les trois règles en échec ont chacune une **cause identifiée et un remède mesuré** (fautes simulées ; seuils appris sur les 5 voix du Coran entier, ou sur Ayyūb seul, ce qui est signalé comme optimiste) :
   - **lām léger** : 15 % → **100 %** avec le F2 de la voyelle suivante ;
   - **iqlāb « ن clair »** : 44 % → **88 %** avec « 1 − P(۾) » ;
   - **idghām avec ghunna** : 0 à 20 % → **72 à 88 %**. La tenue nasale du tanwīn est écrite dans la voyelle du tanwīn : il faut une fenêtre large.
5. Inventaire : 15 sources examinées et leurs licences (§ 1). Téléchargés : QDAT (MIT), qdat_bench (Apache-2.0) et 11 voix everyayah, soit 16 voix avec les 5 voix du Complexe. 17 autres voix sont prévues, chacune téléchargée puis effacée après mesure.
6. Il manque toujours des voix de femmes et d'enfants **en récitation complète**. QDAT n'apporte que la fin d'un seul verset (5:109), avec 120 femmes et 68 récitations d'enfants de moins de 15 ans.

## 1. Inventaire des sources (recherche web du 1/11)

Usage visé : calibration interne seulement. On garde des mesures, aucun audio n'est redistribué ni publié dans l'appli. Décisions du coordinateur (1/11) :
- everyayah : accepté, au même titre que l'audio déjà utilisé ;
- Quran.com : exclu ;
- QuranMB / IqraEval, RetaSy et al-ʿAzazy « avec enfants » : rien d'utilisé tant que la licence n'est pas connue.

| Source | Taille | Contenu, règles | Voix | Licence | Verdict | Utilisé |
|---|---|---|---|---|---|---|
| everyayah.com (`/data/<dossier>/SSSAAA.mp3`, zips par sourate) | environ 70 récitations Ḥafṣ, 6 236 versets chacune ; juz ʿAmma de 25 à 108 Mo par voix | récitation juste, au verset près | hommes seulement ; `Husary_Muallim_128kbps` = muʿallim lent | aucune mention | accepté (coordinateur) | **oui** : 11 voix, 17 en cours |
| `obadx/qdat_bench` (HF) | 159 enregistrements, 86 Mo | **fautes réelles réannotées par un expert**, fin de 5:109 : ghunna du nūn mushaddad (41 fautes), ikhfāʾ (94), qalqala finale (58), madd, ṣifāt par phonème | 120 femmes, 39 hommes, 5 à 68 ans | Apache-2.0 | oui | **oui** |
| `obadx/qdat` (HF), copie nettoyée de QDAT | 1 505 enregistrements, 784 Mo, 161 récitants | juste / faux pour la ghunna du nūn mushaddad, l'ikhfāʾ, le madd munfaṣil | 489 sur 642 retenus sont des femmes (code 0, déduit de qdat_bench) ; 68 de moins de 15 ans | MIT (copie) ; licence d'origine non trouvée | oui, avec cette réserve | **oui** (642, au plus 4 répétitions par récitant) |
| `obadx/muaalem-annotated-v3` (HF) | 848 h, 97 Go | ṣifāt par phonème, récitation experte juste | 22 hommes | MIT | oui, mais trop gros | non (piste : sous-ensembles) |
| `tarteel-ai/everyayah` (HF) | 117 Go | juste, texte diacritisé | pros | audio « non documenté » | ambigu, trop gros | non |
| `IqraEval/QuranMB.v2` (HF) | 1 642 clips, 441 Mo | **fautes délibérées** en arabe standard sans tajwīd (substitutions ت/ط, س/ص…) : utile pour les makhārij et les emphatiques | surtout des femmes | non trouvée | **à demander** (courriel § 10) | non |
| `IqraEval/Iqra_Extra_IS26` (accès restreint) | 1 333 énoncés | fautes humaines demandées | natifs | non trouvée | à demander | non |
| `IqraEval/Iqra_TTS` | 5,9 Go | voix de synthèse, fautes simulées | synthèse | non trouvée | non (synthèse vocale) | non |
| `RetaSy/quranic_audio_dataset` (HF) | 6 828 clips, 1,26 Go | apprenants de 11 pays et plus, jugement global juste / faux, sans règle précise | hommes, femmes | non trouvée | **à demander** (courriel § 10) | non |
| `Buraaq/quran-audio-text-dataset` | 36 Go | juste, au verset et au mot | hommes | non trouvée | ambigu, trop gros | non |
| Ar-DAD (Mendeley) | 30 récitateurs, sourates 78 à 114 | juste | hommes | CC BY 4.0 | oui | non (piste) |
| `Reinjin/Pelafalan_Huruf_Hijaiyah` (HF) | 8 904 clips, 238 Mo | lettres isolées d'élèves (Indonésie), sans étiquette de faute | élèves | AFL-3.0 | oui | non (piste makhārij) |
| QuranicAudio : al-ʿAzazy « avec enfants » | par sourate | enfants qui répètent | enfants | non trouvée | exclu (coordinateur) | non |
| Quran.com / Quran Foundation API | 12 récitations, minutage par mot | juste | hommes | **interdit pour l'apprentissage automatique sans accord écrit** | exclu | non |
| alquran.cloud, mp3quran, Tanzil audio | par sourate | juste | hommes | non commercial, ou non trouvée | ambigu | non |

Travaux universitaires sans données publiques : qalqala (Omran et al., 4 406 clips ; un autre article, 589 énoncés), étude indonésienne (1 344 clips, idghām / iẓhār / ikhfāʾ / iqlāb, en partie tirés de YouTube), « Horouf » de NYU Abu Dhabi (environ 10 000 lettres). **Aucun corpus public d'enfants récitant le Coran au verset près, et aucun jeu étiqueté par règle pour l'iqlāb ou l'idghām.**

**Téléchargé sur la VM** (audio et étiquettes seulement, aucun code exécuté), dans `~/tajwid-donnees/` :
- qdat_bench, 86 Mo ;
- qdat, 784 Mo ;
- 11 voix everyayah, juz ʿAmma, de 48 à 108 Mo chacune : Husary, Husary muʿallim, ʿAbd al-Bāsiṭ murattal et mujawwad, al-ʿAfāsī, Basfar, as-Sudays, ash-Shāṭirī, al-ʿAjamī, ar-Rifāʿī, Muḥsin al-Qāsim.

Le premier lot s'est arrêté seul quand le disque a atteint la limite de 90 % : 89,0 % réels, affichés « 90 % » par df qui arrondit vers le haut. Depuis, chaque voix est téléchargée, mesurée, puis ses mp3 sont effacés (plafond 87,5 %). Le disque est à 83,1 %.

## 2. Diagnostic des trois règles en échec

Données : les mesures de l'étude du 25/10 (`tajwid-correct8`, `tajwid-fautes8`), le Coran entier du 1/11 (`regles.jsonl.gz`) et les nouvelles mesures d'Ayyūb.

### 2.1 Lām de « Allāh » trop léger (avant : 15 %) : **mauvais indice**

- Le seuil du 1/11 lisait la tête tafkhīm du modèle, faute d'audio (le cache ne garde que les probabilités). La tête vaut de 0,012 à 0,234 sur les fautes et de 0,065 à 0,25 sur les justes : les deux plages se chevauchent.
- Le **deuxième formant (F2) de la voyelle « ā » qui suit** sépare parfaitement les deux cas sur les données du 25/10 : 5 voix, 222 justes, 39 fautes ; AUC 1,000 ; F2 des justes au plus 1 219 Hz, F2 des fautes au moins 1 561 Hz.
- F2 absolu changerait avec une voix de femme ou d'enfant. On le rapporte donc aux voyelles « a » neutres du même verset : `dF2`, `rF2`.
- Sur Ayyūb (519 justes, 25 nouvelles fautes) : 25 sur 25 détectées, avec un seuil pris au 98ᵉ centile d'Ayyūb lui-même. C'est optimiste, puisque c'est la même voix.
- La faute simulée (le segment « llā » d'un autre verset du même récitant) est réaliste : c'est un vrai lām léger.

### 2.2 Iqlāb (avant : 26 %) : **mauvais indice ET faute simulée irréaliste**

- Le score du 1/11 était max(P(ن), P(ں)). Or P(ں) monte sur des iqlāb justes, puisque la nasale est cachée dans les deux cas : elle noyait le signal.
- La faute simulée unique (« murmure ن de même durée ») n'est pas la faute courante d'un élève, qui prononce un ن clair et bref devant le ب, ou ne tient pas la ghunna. J'ai ajouté ces deux fautes simulées.
- Résultats sur Ayyūb, 25 fautes par type, seuils « ≤ 2 % pour chacune des 5 voix » sur les 2 404 iqlāb justes du Coran entier :

| Indice | murmure ن (faute du 25/10) | **ن clair et bref** | sans tenue (−60 %) |
|---|---|---|---|
| max(P(ن), P(ں)) (1/11) | 2/25 | 11/25 (44 %) | 0/25 |
| P(ن) seule | 8/25 | 16/25 (64 %) | 0/25 |
| **1 − P(۾)** (le modèle n'entend plus le mīm caché) | 12/25 | **22/25 (88 %)** | 0/25 |
| durée / ṭabīʿī du même verset (seuil d'Ayyūb, optimiste) | | 22/25 | **25/25** |

- La fermeture des lèvres (anti-formant du murmure, pente du F2 de la voyelle précédente) est mesurée (`m_creux`, `f2_pente`) mais pas encore évaluée : il faut les autres voix.
- Sur les justes du Coran entier, le seuil de « 1 − P(۾) » est fixé par muhanna (98ᵉ centile 0,44, contre 0,007 à 0,15 pour les autres voix) : la variabilité entre voix est forte. À confirmer sur les voix nouvelles.

### 2.3 Idghām avec ghunna (avant : 0 à 22 %) : **mauvaise segmentation**

- Sur les idghām justes d'Ayyūb, 58 sur 570 ont une « tenue » minuscule, de moins d'un demi-ṭabīʿī. **Toutes sont des tanwīn suivis de و ou de ي**, écrits en une seule unité.
- Dans ces cas, le groupe précédent, la voyelle du tanwīn, dure de 3,1 à 4,3 ṭabīʿī, contre 0,3 à 0,5 d'habitude : **le modèle écrit la tenue nasale à l'intérieur de la voyelle du tanwīn.** La fenêtre de mesure du 25/10 (le seul و/ي) la manquait. Le « bloc nasal », qui ajoute un groupe ن/ں/م écrit juste avant, ne suffit pas.
- **Remède : une fenêtre large**, du début de la voyelle qui précède jusqu'à la fin de la consonne d'arrivée, rapportée au ṭabīʿī du même verset. Sur les justes d'Ayyūb, elle vaut au moins 2,33 ṭabīʿī (1ᵉʳ centile).
- Détection sur Ayyūb, seuil au 98ᵉ centile d'Ayyūb (optimiste) : **« sans ghunna » 22/25 (88 %)** et **« ن clair » 18/25 (72 %)**. Avant : 0/25 et 1/25 avec la même fenêtre étroite, 5/25 avec P(ن).

### 2.4 Les règles éteintes faute de données

- **Qalqala** : de vraies fautes existent désormais (qdat_bench, 58 « sans qalqala » sur ب final), voir § 4. La mesure acoustique d'écho de l'étude ne fonctionne pas sur des enregistrements d'apprenants : 0 % de détection, à cause du bruit et du niveau. La tête qalqala du modèle détecte environ 28 %.
- **Madd lāzim** : nouvelle mesure, durée rapportée au ṭabīʿī du même verset (6 temps ≈ 3 ṭabīʿī), avec la faute « ramené à 2 temps ». Elle était en cours sur Ayyūb quand le conteneur a été tué : non évaluée.
- **Rāʾ, lettres emphatiques** : F1, F2 de la voyelle suivante, normalisés par timbre dans le verset, et tête tafkhīm sur la consonne. Ce sont des mesures sur les justes seulement. **Aucune faute réelle** : dans qdat_bench, le ghayn de ٱلْغُيُوبِ n'est jamais annoté trop léger. Il n'existe aucune faute simulée crédible (une substitution changerait la lettre). Ces règles restent éteintes.
- **Makhārij** : aucune source sous licence claire. QuranMB contient des substitutions ت/ط, س/ص… lues sans tajwīd : à demander.

## 3. Nouveaux indices (code `services/ecoute-ia/renfort/mesures2.py`)

Ils s'ajoutent aux mesures de l'étude du 25/10, sans modifier la transcription Tanzil ni l'alignement :
- **durée en temps du récitant** (`r_tabii`) : durée de la règle rapportée à la médiane des madd ṭabīʿī du même verset. Elle ne dépend d'aucune voix de référence, ce qui est indispensable pour un apprenant au débit irrégulier ;
- **fenêtre large** de l'idghām (`tp` → `tn`) et bloc nasal (`dn_bloc`, `ghunna_bloc`) ;
- iqlāb / ikhfāʾ shafawī : `P_n` seule, `1 − P(۾)`, spectre du murmure (5 bandes, creux 1 000 à 1 600 Hz contre 1 600 à 2 600 Hz), pente du F2 en fin de voyelle précédente ;
- lām / rāʾ / emphatiques : F1, F2, `dF2`, `rF2`, `dF1` (référence : voyelles neutres de même timbre dans le verset), tête tafkhīm sur la consonne seule ;
- qalqala : rebond, écho, écho relatif au niveau du verset, P(ڇ), tête qalqala ;
- madd long : type (lāzim / hamza / autre), `r_tabii`.

## 4. Fautes RÉELLES d'apprenants (QDAT, qdat_bench), le résultat le plus solide

- Méthode : les récitants sont répartis en deux moitiés (hachage de l'identifiant). Le seuil est appris sur les justes d'une moitié (≤ 2 %), puis mesuré sur l'autre moitié, et inversement.
- « Seuil du 1/11 » : la valeur de `seuils_tajwid.json`, appliquée telle quelle.
- Alignement : coût médian de 0,022 ; 5 récitations sur 159 sont trop mal reconnues et le système se tait.
- **Accord entre les deux annotations** des mêmes enregistrements (QDAT d'origine et réannotation experte) : ghunna 62/67 (93 %), ikhfāʾ 59/67 (88 %). Les étiquettes contiennent donc environ 7 à 12 % de désaccords, ce qui plafonne toute mesure.

| Règle (vraies fautes) | Indice | Jeu (justes / fautes) | Seuil du 1/11 : FA / détection | **Recalibré sur apprenants : FA (borne 95 %) / détection** | FA chez les femmes |
|---|---|---|---|---|---|
| Ghunna du nūn mushaddad trop courte | réf. Ayyūb / durée | qdat 514 / 128 | **42,9 %** / 72,7 % | 2,0 % (≤ 3,6 %) / **62,5 %** | 1,8 % (392) |
| | idem | bench 118 / 41 | **39,8 %** / 82,9 % | 2,5 % (≤ 7,2 %) / 63,4 % | 2,2 % (92) |
| | durée / ṭabīʿī (`r_tabii`) | qdat | | 2,9 % / 58,6 % | 3,3 % ; enfants 13,9 % (36) |
| | combinaison (3 indices) | bench | | 3,4 % / **73,2 %** | 4,4 % |
| Ikhfāʾ non faite | réf. Ayyūb / durée | qdat 332 / 310 | **14,5 %** / 60,0 % | 2,4 % / 53,2 % | 2,0 % |
| | **P(ن) > 0,0216** (ن écrit) | qdat | **0 / 332** / 46,5 % | 2,1 % / 53,9 % | 2,0 % |
| | idem | bench 64 / 94 | **0 / 64** / 41,5 % | | |
| | combinaison (4 indices) | qdat | | 2,4 % / 53,9 % | 2,8 % |
| Qalqala finale absente (ب) | 1 − tête qalqala | bench 101 / 58 | | 3,0 % / 27,6 % | 1,4 % |
| | écho acoustique (étude du 25/10) | bench | | 2,0 % / **0 %** | |
| | combinaison | bench | | 4,0 % / 32,8 % | 2,7 % |

Lecture :
- Les seuils du 1/11, appris sur 5 professionnels, **ne se transposent pas aux apprenants** pour les durées : 14 à 43 % de fausses alertes. Le seul signal qui tient tel quel est « ن écrit à la place de l'ikhfāʾ » : 0 fausse alerte (0/332 dans QDAT, borne haute 1,1 % ; 0/64 dans qdat_bench), pour 42 à 47 % de détection.
- Les durées doivent être jugées **par rapport au débit de l'élève lui-même** (`r_tabii`), ou recalibrées sur des apprenants. Même ainsi, la ghunna plafonne vers 60 à 73 % et l'ikhfāʾ vers 54 %.
- Les femmes ne posent pas de problème particulier dans ces données (FA de 1,4 à 4,4 %). Les **enfants** sont trop peu nombreux pour conclure (36 justes, FA de 0 à 14 % selon l'indice).

## 5. Statut règle par règle, avant et après

« Simulées » : fautes par montage. « Réelles » : QDAT. Aucune règle ne passe en « active » : la consigne reste un test sur de vraies voix.

| Règle | Avant (1/11) | Après (ce rapport) | Statut |
|---|---|---|---|
| Ghunna très courte | « prête à valider », 96,9 % simulées, FA 0,3 à 2 % (pros) | **réelles : 40 à 43 % de FA avec ce seuil** ; recalibrée : 60 à 73 % à 2 à 3,4 % de FA | **rétrogradée : éteinte**, observation |
| Iẓhār tenu | « prête à valider », 93,8 % simulées | `r_tabii` (Ayyūb) : 21/25 ; aucune faute réelle | prête à valider seulement sur pros ; **à revoir** : même biais de référence que la ghunna |
| Lām d'Allāh lourd après i | « prête à valider », 97,5 % | tête tafkhīm : 25/25 (Ayyūb), F2 : 24/25 ; aucune faute réelle | inchangé : prête à valider (pros), éteinte |
| Lām d'Allāh léger après a/u | 15 % | **100 %** (F2 relatif), seuil d'Ayyūb (optimiste) | prometteuse, **à confirmer** sur voix nouvelles et vraies voix |
| Iqlāb | 26 % | **88 %** « ن clair » (1 − P(۾), seuil des 5 voix) ; sans tenue 100 % (durée, optimiste) | prometteuse, éteinte |
| Idghām avec ghunna | 0 à 22 % | **72 à 88 %** (fenêtre large, optimiste) | prometteuse, éteinte |
| Idghām sans ghunna | 77,5 % | 21/25 (84 %) | indication, éteinte |
| Ikhfāʾ non tenue (durée) | 81 % | réelles : FA 14,5 % au seuil du 1/11, 53 % recalibrée | éteinte |
| Ikhfāʾ « ن clair » | 75 % | **réelles : 0 FA (0/332 et 0/64), 42 à 47 %** | **meilleure candidate « indication »** (silence dans plus de la moitié des fautes) |
| Qalqala | 0 à 52 % (simulées) | réelles : 28 à 33 % | éteinte |
| Madd muttaṣil | 80 % (10 cas) | non retesté | indication (inchangé) |
| Madd lāzim, rāʾ, emphatiques, makhārij | éteints | mesures prêtes ; ni fautes réelles ni voix | éteints |

## 6. Voix jamais vues : protocole prêt, chiffres à venir

- Séparation fixée à l'avance (`analyse_renfort.py`) :
  - **entraînement** (16 voix) : les 5 voix du Complexe, ʿAbd al-Bāsiṭ (murattal et mujawwad), al-ʿAfāsī, as-Sudays, Muḥsin al-Qāsim, ʿAlī Jābir, al-Maṭrūd, al-Qaḥṭānī, ad-Dawsarī, al-Budayr, al-Juhanī ;
  - **test** (17 voix) : Husary (murattal et muʿallim, même récitant, donc du même côté), Basfar, ash-Shāṭirī, al-ʿAjamī, ar-Rifāʿī, al-Ghāmidī, Fāris ʿAbbād, Niʿna, al-ʿAlaqimī, Sahl Yāsīn, al-Bannā, al-Qaṭāmī, al-Minshāwī, aṭ-Ṭablāwī, Jibrīl, ash-Shuraym.
- Seuil : ≤ 2 % pour chaque voix d'entraînement ayant au moins 40 occurrences, et pour le lot réuni.
- Une règle n'est « prête » que si, sur le test, le lot réuni a ≤ 2 % de FA, aucune voix ne dépasse 4 %, et la détection simulée est ≥ 90 %.
- **État au moment du rapport** : Ayyūb mesuré (2 264 versets, 17 621 occurrences, 325 fautes simulées) ; les 32 autres voix sont en file d'attente.

## 7. Ce qui reste impossible aujourd'hui, et pourquoi

1. **Ghunna, ikhfāʾ, qalqala sur de vrais élèves, au-delà de 60 à 70 %** : les fautes réelles sont plus subtiles que les montages, une ghunna « un peu courte » reste dans la variation naturelle, et les étiquettes humaines elles-mêmes divergent sur 7 à 12 % des cas.
2. **Makhārij et lettres emphatiques** : aucune faute réelle sous licence claire. Le modèle « corrige » les substitutions (étude du 25/10).
3. **Rāʾ** : aucune faute réelle, aucune faute simulée crédible. Il existe en plus des cas où les deux lectures sont permises (§ 8).
4. **Madd lāzim** : peu d'occurrences (surtout dans les lettres isolées), mesure prête mais non évaluée.
5. **Enfants** : 68 récitations seulement (36 justes mesurées), sur un seul verset.

## 8. Points de tajwīd à faire trancher (je n'ai rien tranché seul)

1. **Madd munfaṣil** : QDAT compte comme fautes des lectures en 2 temps. En Ḥafṣ par la Shāṭibiyya, c'est 4 ou 5 temps ; le qaṣr (2 temps) est permis par la voie de la Ṭayyiba. Je ne l'ai pas utilisé. Il faudra choisir la voie de référence d'Awzid avant toute règle sur le munfaṣil.
2. **Iqlāb et ikhfāʾ shafawī** : lèvres fermées, ou légère ouverture (furja) ? Les deux pratiques existent chez les enseignants contemporains. Un indice « fermeture des lèvres » ne doit pénaliser ni l'une ni l'autre tant que ce n'est pas tranché.
3. **Rāʾ** : des mots où les deux sont permis (فِرْقٍ ; مِصْرَ et ٱلْقِطْرِ à la pause ; يَسْرِ, نُذُرِ à la pause), et la imāla de مَجْر۪ىٰهَا (11:41). Il faut une liste d'exceptions validée avant toute règle.
4. **Madd ʿāriḍ** : 2, 4 ou 6 temps sont valables (étude du 25/10) ; qdat_bench les note en longueurs, jamais en fautes. Rien à signaler.
5. **Ghunna « 2 temps »** : la mesure `r_tabii` pose ghunna ≈ ṭabīʿī ≈ 2 temps. C'est la définition classique, mais certains maîtres tiennent plus long la ghunna mushaddada. Le seuil ne vise que « nettement moins qu'un ṭabīʿī ».

## 9. Ce qu'il faudrait comme vraies voix

Pour allumer quoi que ce soit, en commençant par l'ikhfāʾ « ن clair », la ghunna, l'iqlāb, l'idghām et le lām léger :
- **30 apprenants au moins** (dont 10 femmes et 10 enfants avec l'accord des parents), 20 versets courts chacun, lus une fois naturellement, puis une fois avec des fautes volontaires guidées : le protocole « juste, puis fautif » de `ETUDE_TAJWID_COMPLETE.md` § 7 ;
- l'étiquetage par 2 enseignants indépendants, pour mesurer l'accord (QDAT montre 7 à 12 % de désaccords) ;
- les versets choisis pour couvrir iqlāb, idghām avec ghunna (avec tanwīn), lām d'Allāh après a/u, rāʾ, qalqala au milieu et en fin, madd lāzim (الٓمٓ, ٱلطَّآمَّةُ, ٱلصَّآخَّةُ) ;
- 100 fautes au moins par règle pour estimer la détection à ± 6 points ;
- un téléphone ordinaire, dans une pièce ordinaire.

## 10. Courriel aux auteurs (QuranMB / IqraEval et RetaSy), à envoyer par le client

> **Subject:** Request for permission to use [QuranMB.v2 / RetaSy Quranic Audio Dataset] for internal evaluation
>
> Dear [authors / IqraEval organisers],
>
> I am writing on behalf of Awzid, an application that helps people learn Arabic and read the Qur'an (Ḥafṣ ʿan ʿĀṣim). We are building cautious feedback on tajwīd and pronunciation errors. Our rule is to stay silent unless we are confident, so before turning any check on we need to measure its false-alarm rate on real learners.
>
> Your dataset, [QuranMB.v2 on Hugging Face (IqraEval) / RetaSy/quranic_audio_dataset], would be very valuable for this. We could not find a license on the dataset card. We would therefore like to ask for your permission to use it under the following conditions:
>
> - internal evaluation and calibration only (measuring detection and false-alarm rates of our checks);
> - no redistribution of the audio or annotations, and nothing from the dataset is shipped inside the application or published;
> - the data is stored on a private server and deleted on request;
> - the dataset and your paper will be credited in our technical documentation.
>
> Awzid is a commercial application, which is why we prefer to ask rather than assume. If you have a preferred license or agreement, we will follow it. If you prefer that we do not use the data, we will of course respect that.
>
> Thank you very much for your work and for considering this request.
>
> Kind regards,
> [Name], for Awzid
> [contact address]

Adresses : iqraeval@googlegroups.com (IqraEval) ; pour RetaSy, les auteurs de l'article arXiv 2405.02675.

## 11. Fichiers, reproduction, chaîne en cours

Dans `services/ecoute-ia/renfort/` :
- `mesures2.py` : mesures étendues ;
- `pipeline_voix.py` : une voix, du décodage aux mesures et aux fautes simulées ; les fautes sont écrites une par une dans `fautes.partiel.jsonl`, donc un arrêt ne perd rien ;
- `qdat_decoder.py`, `qdat_analyse.py` : vraies fautes ;
- `analyse_renfort.py` : séparation entraînement / test, seuils, détection ;
- `ayyoub_eval.py`, `diag_idgham.py` : diagnostics de ce rapport ;
- `lancer_voix.sh`, `lancer_qdat.sh` : conteneur jetable en nice 19, poids CPU 2, poids disque 10, 3 cœurs, 6 Go ; flock par défaut, `SANS_VERROU=1` sur accord du coordinateur ;
- `maitre.sh` : la chaîne complète, un travail à la fois. Elle ne démarre que si la charge est ≤ 8, s'il reste 6 Go de mémoire et si le disque est sous 87,5 %. Elle télécharge une voix, la mesure, puis efface ses mp3 ;
- `garde.sh` : met le conteneur en pause si la charge dépasse 12 pendant plus de 2 minutes, si la mémoire passe sous 2 Go, ou si le disque atteint 87,5 % ;
- `redemarrer.sh` : `bash redemarrer.sh arret` arrête tout proprement. Ou bien `touch ~/tajwid-renfort/sorties/STOP`.

Résultats, sans audio : `services/ecoute-ia/renfort/resultats/` (`qdat_resultats.json`, `ayyoub_eval.json`). Les mesures brutes et les caches de décodage restent sur la VM : `~/tajwid-renfort/sorties/`, et `~/tajwid-donnees/` pour l'audio source.

Quand la chaîne aura fini (`MAITRE FINI` dans `~/tajwid-renfort/sorties/journal.log`) :
1. lancer `analyse_renfort.py` (conteneur, `-v ~/tajwid-renfort/sorties:/out`) ;
2. reporter au § 6 les fausses alertes sur les 17 voix de test et la détection des fautes simulées sur ces voix ;
3. relancer `qdat_analyse.py` avec les seuils « pro » ainsi obtenus (fichier `seuils_pro.json`).
