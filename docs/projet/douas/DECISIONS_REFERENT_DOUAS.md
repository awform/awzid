# Douas, phase 1 : décisions du référent

*12/10/2026, Claude, référent provisoire (école mālikite). Ces décisions portent sur la section 6 de `DOSSIER_DOUAS_PHASE1.md`. Tout reste marqué `VALIDATION_HUMAINE_REQUISE` jusqu'à la relecture du comité.*

## Règle générale
- Le texte affiché est la chaîne **exacte** copiée depuis la source (`douas_phase1.json`). Il n'est jamais retapé ni normalisé (pas de NFC).
- Le degré est affiché derrière ⓘ, avec le nom de celui qui a jugé le hadith. Quand les spécialistes divergent, on le dit sobrement.
- Une répétition (« trois fois »…) ne s'affiche que si elle figure dans le texte retenu.

## Décisions
| N° | Doua | Décision |
| --- | --- | --- |
| 1 | DOU-ABL-02 : « اللَّهُمَّ اجْعَلْنِي مِنَ التَّوَّابِينَ… » après les ablutions | **Retenue comme ajout facultatif**, affichée après la shahāda (Muslim), qui reste la doua principale. Note : « rapporté par at-Tirmidhī ; jugé authentique par al-Albānī ; d'autres savants ont discuté sa chaîne ». |
| 2 | DOU-MAI-01 : sortie de la maison | **Retenue**, avec le texte d'Abū Dāwūd 5095 (jugé authentique par al-Albānī) ; la divergence est signalée derrière ⓘ. |
| 3 | ECA-03 : « بِسْمِ اللَّهِ » avant les toilettes | **Pas une doua à part.** La doua principale reste celle d'al-Bukhārī (« الخبث والخبائث »). Une note indique que la basmala avant d'entrer est rapportée par at-Tirmidhī (606), jugée authentique par al-Albānī. |
| 3 bis | ECA-07 : « اللَّهُمَّ انْفَعْنِي بِمَا عَلَّمْتَنِي… » | **À réintégrer** dans la rubrique « savoir » dès que le texte est copié depuis une source primaire (at-Tirmidhī 3599 ou Ibn Mājah 251, jugée authentique par al-Albānī). En attendant, elle n'est pas affichée. |
| 4 | DOU-PAR-05 : « اللَّهُمَّ إِنَّكَ عَفُوٌّ… » | **Forme sans « كَرِيمٌ »**, conforme aux manuscrits retenus par les spécialistes. Note : l'ajout courant n'est pas établi. |
| 5 | DOU-PLU-01 : pluie | **On affiche exactement le texte d'al-Bukhārī tel que copié** (source primaire), sans rien ajouter. |
| 6 | DOU-PLU-05 : tonnerre | **Retenue et présentée comme la parole d'un Compagnon** (ʿAbd Allāh ibn az-Zubayr), rapportée par Mālik dans le *Muwaṭṭaʾ*. C'est une référence de premier ordre pour notre école. |
| 7 | DOU-ANG-08 : « اللَّهُمَّ إِنِّي عَبْدُكَ… » (Aḥmad 3712) | **En attente**, non affichée tant que le texte n'est pas copié d'une édition du Musnad ou d'as-Silsila aṣ-Ṣaḥīḥa (199). |
| 8 | DOU-SOM-05 : « trois fois » | **Pas de nombre affiché** : le texte retenu ne le contient pas. |

## Écartées (confirmé)
Les 10 douas écartées par le dossier le restent : la doua du miroir (aucune doua authentique), l'entrée dans la maison d'Abū Dāwūd 5096, et les autres. Elles ne s'affichent pas, et rien ne les remplace.

## Correction au fil, à faire dans les livres
- **Fiche akhlāq akh.f102** : la formule du retour de voyage avec « سَاجِدُونَ » vient d'**al-Bukhārī 1797**, pas de Muslim 1342. Corriger la source (`src`) dans la fiche ; c'est à faire avec le tri de l'audit des livres.
- Les champs `src` vides des 12 fiches akhlāq sont à remplir depuis le dossier.

## Suite
1. Copier les textes en attente (ECA-07, DOU-ANG-08) depuis une source primaire.
2. Reprendre les traductions françaises d'une source publiée (piste : « La citadelle du musulman », Ḥiṣn al-Muslim, à vérifier pour les droits). Sinon, le comité traduit.
3. Construire l'écran « Douas » dans « Vivre l'islam » à partir de `douas_phase1.json` et de ces décisions. Les douas du Coran viennent de Tanzil, octet par octet, sans voix de synthèse.
4. Inscrire au registre `hadiths.json` les hadiths qui n'y sont pas encore.

## Ajout du 12/10 (affichage)

*Décisions du référent sur les trois questions de l'écran (12/10/2026), et relecture des captures par le pilote.*

1. **Panneau « Source », version de l'élève** : le recueil et le numéro (lien « Voir sur sunnah.com », jamais d'URL brute dans le texte), le degré en français (« authentique », « bon », « parole d'un Compagnon »), le savant qui a jugé quand ce n'est ni al-Bukhārī ni Muslim. Les notes internes du chercheur (« à confirmer », « relevé via recherche web »…) ne sont jamais montrées. Un degré encore à confirmer s'affiche « degré en cours de vérification ». Table de correspondance relue ci-dessous (`apps/web/scripts/douas-presentation.json`, champ `source`).
2. **Versets cités dans un hadith** (DOU-VOY-01, DOU-VOY-02, DOU-PLU-05, DOU-ANG-04) : la formulation du hadith est gardée telle que la source la rapporte (récit du narrateur), sans la remplacer par Tanzil ; jamais de voix de synthèse ; une note sous la doua : « Contient un passage du Coran ».
3. **Marques du chercheur** : U+200F retirés ; « ... » remplacés par « … » (extrait d'un hadith plus long) ; « (×3) », « (×7) » retirés du texte arabe, le nombre étant dit en français dans le moment (« trois fois »), car il est dans le hadith. Ce sont les SEULES exceptions à « chaîne exacte », listées ci-dessous avec l'avant et l'après, et contrôlées par le test (`douas.test.ts`, liste explicite). DOU-ETE-01 (« ... » entre les trois paroles) a été ajoutée à la liste des cinq par cohérence : à confirmer par le référent.
4. f2:143 (code TOTP dépendant de l'heure) est un e2e instable toléré.
5. **Titres** (relecture du pilote) : le titre ne garde que le MOMENT (« Au coucher », « En entendant le tonnerre »…), sans citation traduite : le sens viendra avec les traductions validées.
6. **Présentation** (relecture du pilote) : « (parole d'un Compagnon) » retiré du titre du tonnerre (la pastille le dit) ; la ligne du moment ne répète pas le titre, elle ne donne que la précision.

### Table de correspondance du panneau « Source »

| Doua | Recueil | Degré | Jugé par |
|---|---|---|---|
| DOU-SOM-01 | al-Bukhārī 6324 | authentique | — |
| DOU-SOM-02 | al-Bukhārī 6324 | authentique | — |
| DOU-SOM-03 | al-Bukhārī 6320 | authentique | — |
| DOU-SOM-04 | al-Bukhārī 247 | authentique | — |
| DOU-SOM-05 | Abū Dāwūd 5045 | authentique | al-Albānī |
| DOU-SOM-06 | at-Tirmidhī 3401 | bon | at-Tirmidhī |
| DOU-SOM-07 | al-Bukhārī 1154 | authentique | — |
| DOU-MAI-01 | Abū Dāwūd 5095 | authentique | al-Albānī |
| DOU-MAI-02 | Abū Dāwūd 5094 | authentique | al-Albānī |
| DOU-MAI-03 | Muslim 2018 | authentique | — |
| DOU-TOI-01 | al-Bukhārī 142 | authentique | — |
| DOU-TOI-02 | Abū Dāwūd 30 | authentique | al-Albānī |
| DOU-REP-01 | al-Bukhārī 5376 | authentique | — |
| DOU-REP-02 | Abū Dāwūd 3767 | authentique | al-Albānī |
| DOU-REP-03 | Abū Dāwūd 4023 | bon | al-Albānī |
| DOU-REP-04 | al-Bukhārī 5458 | authentique | — |
| DOU-REP-05 | Muslim 2042 | authentique | — |
| DOU-ABL-01 | Abū Dāwūd 169 (et Muslim 234) | authentique | al-Albānī |
| DOU-ABL-02 | at-Tirmidhī 55 | authentique | al-Albānī |
| DOU-MOS-01 | Muslim 713 | authentique | — |
| DOU-MOS-02 | Abū Dāwūd 466 | authentique | al-Albānī |
| DOU-HAB-01 | Abū Dāwūd 4023 | bon | al-Albānī |
| DOU-HAB-02 | Abū Dāwūd 4020 | authentique | al-Albānī |
| DOU-VOY-01 | Abū Dāwūd 2602 | authentique | al-Albānī |
| DOU-VOY-02 | Muslim 1342 | authentique | — |
| DOU-VOY-03 | Muslim 1342 (et al-Bukhārī 1797) | authentique | — |
| DOU-VOY-04 | Muslim 2708 | authentique | — |
| DOU-PLU-01 | al-Bukhārī 1032 | authentique | — |
| DOU-PLU-02 | al-Bukhārī 846 | authentique | — |
| DOU-PLU-03 | al-Bukhārī 1013 | authentique | — |
| DOU-PLU-04 | Muslim 899 | authentique | — |
| DOU-PLU-05 | al-Adab al-Mufrad 723 (et le Muwaṭṭaʾ de l'imam Mālik) | parole d'un Compagnon — degré en cours de vérification | — |
| DOU-MAL-01 | al-Bukhārī 3616 | authentique | — |
| DOU-MAL-02 | al-Bukhārī 5743 | authentique | — |
| DOU-MAL-03 | Abū Dāwūd 3106 | authentique | al-Albānī |
| DOU-MAL-04 | Muslim 2202 | authentique | — |
| DOU-ANG-01 | al-Bukhārī 6346 | authentique | — |
| DOU-ANG-02 | at-Tirmidhī 3505 (texte : Coran 21:87) | authentique | Zubayr ʿAlī Zaʾī (éd. Darussalam) |
| DOU-ANG-03 | Abū Dāwūd 5090 | bon | al-Albānī |
| DOU-ANG-04 | Muslim 918 | authentique | — |
| DOU-ANG-05 | al-Bukhārī 6369 | authentique | — |
| DOU-ANG-06 | Abū Dāwūd 1525 | authentique | al-Albānī |
| DOU-ANG-07 | at-Tirmidhī 3524 | bon | Zubayr ʿAlī Zaʾī (éd. Darussalam) |
| DOU-SAV-01 | Ibn Mājah 925 | authentique | Zubayr ʿAlī Zaʾī (éd. Darussalam) |
| DOU-SAV-02 | Muslim 2722 | authentique | — |
| DOU-SAV-03 | Coran 20:114 | — | — |
| DOU-PAR-01 | al-Bukhārī 6306 | authentique | — |
| DOU-PAR-02 | al-Bukhārī 834 | authentique | — |
| DOU-PAR-03 | Abū Dāwūd 1517 | authentique | al-Albānī |
| DOU-PAR-04 | Abū Dāwūd 1516 | authentique | al-Albānī |
| DOU-PAR-05 | Ibn Mājah 3850 | authentique | Zubayr ʿAlī Zaʾī (éd. Darussalam) |
| DOU-ETE-01 | al-Bukhārī 6224 | authentique | — |
| DOU-COR-01 | Coran 2:201 | — | — |
| DOU-COR-02 | Coran 2:286 | — | — |
| DOU-COR-03 | Coran 3:8 | — | — |
| DOU-COR-04 | Coran 7:23 | — | — |
| DOU-COR-05 | Coran 25:74 | — | — |
| DOU-COR-06 | Coran 20:25-28 | — | — |
| DOU-COR-07 | Coran 18:10 | — | — |
| DOU-COR-08 | Coran 59:10 | — | — |
| DOU-COR-09 | Coran 2:127 | — | — |
| DOU-COR-10 | Coran 23:118 | — | — |
| DOU-PRT-01 | Coran 17:24 | — | — |
| DOU-PRT-02 | Coran 14:41 | — | — |
| DOU-PRT-03 | Coran 71:28 | — | — |
| DOU-PRT-04 | Coran 46:15 | — | — |

### Exceptions à « chaîne exacte » (avant → après)

- **DOU-SOM-07** (U+200F retirés, « ... » → « … » ; 1 U+200F) :
  - avant : لاَ إِلَهَ إِلاَّ اللَّهُ وَحْدَهُ لاَ شَرِيكَ لَهُ، لَهُ الْمُلْكُ، وَلَهُ الْحَمْدُ، وَهُوَ عَلَى كُلِّ شَىْءٍ قَدِيرٌ ... الْحَمْدُ لِلَّهِ، وَسُبْحَانَ اللَّهِ، وَلاَ إِلَهَ إِلاَّ اللَّهُ، وَاللَّهُ أَكْبَرُ، وَلاَ حَوْلَ وَلاَ قُوَّةَ إِلاَّ بِاللَّهِ ... اللَّهُمَّ اغْفِرْ لِي⟨U+200F⟩
  - après : لاَ إِلَهَ إِلاَّ اللَّهُ وَحْدَهُ لاَ شَرِيكَ لَهُ، لَهُ الْمُلْكُ، وَلَهُ الْحَمْدُ، وَهُوَ عَلَى كُلِّ شَىْءٍ قَدِيرٌ … الْحَمْدُ لِلَّهِ، وَسُبْحَانَ اللَّهِ، وَلاَ إِلَهَ إِلاَّ اللَّهُ، وَاللَّهُ أَكْبَرُ، وَلاَ حَوْلَ وَلاَ قُوَّةَ إِلاَّ بِاللَّهِ … اللَّهُمَّ اغْفِرْ لِي
- **DOU-MOS-01** (U+200F retirés ; 2 U+200F) :
  - avant : اللَّهُمَّ افْتَحْ لِي أَبْوَابَ رَحْمَتِكَ ⟨U+200F⟩.⟨U+200F⟩ وَإِذَا خَرَجَ فَلْيَقُلِ اللَّهُمَّ إِنِّي أَسْأَلُكَ مِنْ فَضْلِكَ
  - après : اللَّهُمَّ افْتَحْ لِي أَبْوَابَ رَحْمَتِكَ . وَإِذَا خَرَجَ فَلْيَقُلِ اللَّهُمَّ إِنِّي أَسْأَلُكَ مِنْ فَضْلِكَ
- **DOU-VOY-01** (« ... » → « … », « (×n) » retirés) :
  - avant : بِسْمِ اللَّهِ ... الْحَمْدُ لِلَّهِ ... سُبْحَانَ الَّذِي سَخَّرَ لَنَا هَذَا وَمَا كُنَّا لَهُ مُقْرِنِينَ * وَإِنَّا إِلَى رَبِّنَا لَمُنْقَلِبُونَ ... الْحَمْدُ لِلَّهِ (×3) ... اللَّهُ أَكْبَرُ (×3) ... سُبْحَانَكَ إِنِّي ظَلَمْتُ نَفْسِي فَاغْفِرْ لِي فَإِنَّهُ لاَ يَغْفِرُ الذُّنُوبَ إِلاَّ أَنْتَ
  - après : بِسْمِ اللَّهِ … الْحَمْدُ لِلَّهِ … سُبْحَانَ الَّذِي سَخَّرَ لَنَا هَذَا وَمَا كُنَّا لَهُ مُقْرِنِينَ * وَإِنَّا إِلَى رَبِّنَا لَمُنْقَلِبُونَ … الْحَمْدُ لِلَّهِ … اللَّهُ أَكْبَرُ … سُبْحَانَكَ إِنِّي ظَلَمْتُ نَفْسِي فَاغْفِرْ لِي فَإِنَّهُ لاَ يَغْفِرُ الذُّنُوبَ إِلاَّ أَنْتَ
- **DOU-PLU-05** (« ... » → « … ») :
  - avant : سُبْحَانَ الَّذِي ... يُسَبِّحُ الرَّعْدُ بِحَمْدِهِ وَالْمَلاَئِكَةُ مِنْ خِيفَتِهِ
  - après : سُبْحَانَ الَّذِي … يُسَبِّحُ الرَّعْدُ بِحَمْدِهِ وَالْمَلاَئِكَةُ مِنْ خِيفَتِهِ
- **DOU-MAL-04** (« ... » → « … », « (×n) » retirés) :
  - avant : بِاسْمِ اللَّهِ (×3) ... أَعُوذُ بِاللَّهِ وَقُدْرَتِهِ مِنْ شَرِّ مَا أَجِدُ وَأُحَاذِرُ (×7)
  - après : بِاسْمِ اللَّهِ … أَعُوذُ بِاللَّهِ وَقُدْرَتِهِ مِنْ شَرِّ مَا أَجِدُ وَأُحَاذِرُ
- **DOU-ETE-01** (« ... » → « … ») :
  - avant : الْحَمْدُ لِلَّهِ ... يَرْحَمُكَ اللَّهُ ... يَهْدِيكُمُ اللَّهُ وَيُصْلِحُ بَالَكُمْ
  - après : الْحَمْدُ لِلَّهِ … يَرْحَمُكَ اللَّهُ … يَهْدِيكُمُ اللَّهُ وَيُصْلِحُ بَالَكُمْ
