# A12 — adhkār : ce qui est en place, ce qui reste à compléter par le référent

Règle : **aucun texte religieux n'est écrit dans l'application.** L'espace « Au quotidien » ne montre que des
invocations déjà présentes dans les livres gelés (rubriques `duas` des leçons, recopiées telles quelles :
arabe, sens, moment, source, degré) et les récitations coraniques que ces livres recommandent (versets = texte
Tanzil, références seulement dans le code). Sélection : `packages/content/src/adhkar.ts` ; contrôle sur les vrais
livres : `packages/content/test/adhkar.test.ts` (texte coranique = Tanzil octet par octet, hadiths fondateurs au
statut VERIFIE du registre, moment annoncé par le livre cohérent avec la catégorie).

Le classement par moment et le nombre de répétitions viennent du texte du livre. **À relire par le référent**
(sélection faite par le chef de projet le 05/10/2026, référent religieux provisoire).

## En place (21 entrées distinctes tirées des livres, 25 affichages)

| Moment | Entrées (leçon d'origine) |
|---|---|
| Matin (7) | réveil (re1.l23) · « Allāhumma bika aṣbaḥnā » (re4.l02) · Al-Ikhlāṣ, Al-Falaq, An-Nās ×3 (re3.l05, AD 5082, Tir. 3575) · « Bismi-llāhi lladhī lā yaḍurru » ×3 (re3.l05) · sayyid al-istighfār (ra2.l22, Bukhārī 6306) · « subḥāna-llāhi wa bi-ḥamdih » ×100 (ra2.l22, Muslim 2692) · refuge contre l'incapacité et la paresse (re5.l25, début) |
| Soir (6) | « Allāhumma bika amsaynā » (re4.l02) · « amsaynā wa amsā l-mulku li-llāh » (ra2.l22, Muslim 2723) · trois sourates ×3 · « Bismi-llāhi lladhī lā yaḍurru » ×3 · sayyid al-istighfār · « subḥāna-llāhi wa bi-ḥamdih » ×100 |
| Après la prière (6) | istighfār ×3 · « Allāhumma anta s-salām » · tasbīḥ, taḥmīd, takbīr ×33 · tahlīl pour faire 100 (re3.l21) · Ibrāhīm 14:40 (ra1.l23) · Al-Isrāʾ 17:24 (re1.l22) |
| Appel à la prière (2) | « lā ḥawla wa lā quwwata illā bi-llāh » · invocation après l'adhān (re4.l19) |
| Coucher (4) | āyat al-kursī (re3.l03, Bukhārī 2311) · trois sourates (re1.l23, Bukhārī 5017) · « bismika-llāhumma amūtu wa aḥyā » (re3.l03) · « Allāhumma anta l-awwal… » (re5.l01, extrait) |

## À compléter (références seulement — aucun texte écrit ici ; à faire entrer dans un livre ou un registre validé)

Numéros donnés **à vérifier** par le référent (numérotation sunnah.com) ; aucun n'est au registre des hadiths
au statut VERIFIE à ce jour, sauf mention.

### Matin et soir
1. Forme du MATIN de « aṣbaḥnā wa aṣbaḥa l-mulku li-llāh » en entier (le livre ra2.l22 ne donne que la forme du soir,
   avec une note pour le matin) — Muslim 2723 (au registre, VERIFIE).
2. Āyat al-kursī le matin et le soir — an-Nasāʾī, as-Sunan al-kubrā ; al-Ḥākim (à vérifier).
3. « Raḍītu bi-llāhi rabban… » ×3 — Abū Dāwūd 5072 ; at-Tirmidhī 3389 (à vérifier).
4. « Allāhumma ʿāfinī fī badanī… » ×3 — Abū Dāwūd 5090 (à vérifier).
5. « Yā ḥayyu yā qayyūmu bi-raḥmatika astaghīth… » — an-Nasāʾī, ʿAmal al-yawm wa l-layla ; al-Ḥākim (à vérifier).
6. « Aʿūdhu bi-kalimāti-llāhi t-tāmmāti min sharri mā khalaq » ×3 le soir — Muslim 2709 (à vérifier).
7. « Allāhumma innī asʾaluka l-ʿāfiya fī d-dunyā wa l-ākhira… » — Abū Dāwūd 5074 ; Ibn Māja 3871 (à vérifier).
8. « Lā ilāha illā-llāhu waḥdahu lā sharīka lah… » ×10 ou ×100 — al-Bukhārī 3293, Muslim 2691 (à vérifier).

### Après la prière
9. Āyat al-kursī après chaque prière prescrite — an-Nasāʾī, as-Sunan al-kubrā 9848 (à vérifier).
10. Les sourates protectrices après chaque prière — Abū Dāwūd 1523 ; at-Tirmidhī 2903 (à vérifier).
11. « Allāhumma aʿinnī ʿalā dhikrika wa shukrika wa ḥusni ʿibādatik » — Abū Dāwūd 1522 (à vérifier).
12. « Allāhumma lā māniʿa li-mā aʿṭayt… » — al-Bukhārī 844, Muslim 593 (à vérifier).

### Coucher
13. Les deux derniers versets d'Al-Baqara (2:285-286) la nuit — al-Bukhārī 5009 (au registre, VERIFIE) : le livre
    re4.l02 enseigne ces versets mais seul le guide de l'enseignant dit « chaque soir » ; une phrase de l'élève
    suffirait pour les ajouter (texte Tanzil déjà disponible).
14. Tasbīḥ 33, taḥmīd 33, takbīr 34 au coucher — al-Bukhārī 3113, Muslim 2727 (à vérifier).
15. « Bismika rabbī waḍaʿtu janbī… » — al-Bukhārī 6320, Muslim 2714 (à vérifier).
16. « Allāhumma qinī ʿadhābaka yawma tabʿathu ʿibādak » ×3 — Abū Dāwūd 5045 ; at-Tirmidhī 3398 (à vérifier).
17. Invocation d'al-Barāʾ (« Allāhumma aslamtu nafsī ilayk… ») — al-Bukhārī 247, Muslim 2710 (Muslim 2710 au
    registre, VERIFIE, usage ado3.l21 : vérifier si le texte y figure pour l'ajouter directement).

### Procédure pour ajouter une invocation
Le référent valide le texte arabe, le sens et la référence ; l'équipe des livres l'ajoute à une rubrique `duas`
d'une leçon (ou à un registre d'adhkār à créer, avec statut) et met le hadith au registre ; une ligne de
`ADHKAR_PICKS` suffit ensuite (le test des livres vérifie l'existence, la cohérence du moment et le statut).
