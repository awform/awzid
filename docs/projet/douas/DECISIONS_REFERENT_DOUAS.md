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
