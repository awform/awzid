# Dossier Douas — phase 1 (recherche documentaire)

**Statut de toutes les entrées : `A_VERIFIER_REFERENT`.** Dossier préparé le 12/10/2026 pour le référent. Aucune doua rédigée ni reformulée ; aucune traduction écrite par le chercheur.

## 1. Méthode et garde-fous

- **Textes arabes des hadiths** : extraits du HTML de sunnah.com (une page par hadith, téléchargée le 12/10/2026), puis **contrôlés par programme** : chaque `texte_ar` est une sous-chaîne exacte du texte de la page (après décodage HTML et réduction des espaces). Les 50 textes arabes retenus et 8 des 10 écartés passent ce contrôle.
- Exceptions signalées : DOU-SOM-07 et DOU-PLU-05 (ponctuation de sunnah.com `‏.‏` et accolades `{ }` retirées, remplacées par « ... ») ; ECA-06 et ECA-08 marqués **INDICATIF** (pas de source primaire en ligne accessible).
- Les marques « ... », « (×3) », « (×7) » et « * » sont de la **mise en forme** du chercheur (passage narratif retiré ou répétition), pas du texte source.
- **Attention technique** : sunnah.com écrit la *shadda* avant la *fatha* (ex. `اللَّهُمَّ` = ل + shadda + fatha). Une saisie au clavier inverse souvent cet ordre. Copier toujours depuis le JSON, ne jamais retaper ; ne pas normaliser (NFC) si l'on veut garder la forme source.
- **Coran** : référence seule (sourate:verset), texte à prendre dans la copie Tanzil. Pour les hadiths qui contiennent un passage coranique (43:13-14, 2:156, 13:13, 21:87), le passage est signalé.
- **Degrés** : al-Bukhārī et Muslim = ṣaḥīḥ. Abū Dāwūd : jugement d'al-Albānī affiché par sunnah.com. At-Tirmidhī, Ibn Mājah, an-Nasāʾī : sunnah.com affiche le jugement de l'équipe **Darussalam** (Ḥāfiẓ Zubayr ʿAlī Zaʾī), pas celui d'al-Albānī ; les jugements d'al-Albānī cités pour ces livres viennent d'une recherche web et sont marqués « à confirmer ».
- **dorar.net** a bloqué l'accès automatique (Cloudflare) : aucune copie n'en vient. Les mentions « selon dorar » proviennent de résumés de moteur de recherche.
- Le texte arabe cité **dans les notes** (variantes, formes populaires) est indicatif, pour le référent : il n'est pas destiné à l'affichage.
- **Traductions françaises** : laissées vides. Source publiée à examiner par le référent : la version française de *Ḥiṣn al-Muslim* (« La citadelle du musulman », Saʿīd al-Qaḥṭānī), qui couvre la plupart de ces douas.

## 2. Vue d'ensemble

| Rubrique | Retenues | Dont Coran |
|---|---|---|
| Réveil et sommeil | 7 | 0 |
| Entrer et sortir de la maison | 3 | 0 |
| Toilettes | 2 | 0 |
| Avant et après le repas | 5 | 0 |
| Après les ablutions | 2 | 0 |
| Entrer et sortir de la mosquée | 2 | 0 |
| S'habiller et nouvel habit | 2 | 0 |
| Voyage et monture | 4 | 0 |
| Pluie, vent, tonnerre | 5 | 0 |
| Visite au malade et maladie | 4 | 0 |
| Angoisse, tristesse et épreuve | 8 | 0 |
| Pour les parents | 4 | 4 |
| Pour le savoir | 3 | 1 |
| Repentir et pardon | 5 | 0 |
| Éternuement | 1 | 0 |
| Douas du Coran | 10 | 10 |
| **Total** | **67** | **15** |

Écartées : 10 (section 4). Miroir : aucune doua authentique trouvée (voir ECA-06).

## 3. Douas retenues

### Réveil et sommeil

#### DOU-SOM-01 — Au coucher : « En Ton nom, ô Allah, je meurs et je vis »

- **Moment** : En se couchant pour dormir.
- **Type** : hadith
- **Texte arabe** (copié de la source) :

<div dir="rtl" lang="ar">

بِاسْمِكَ اللَّهُمَّ أَمُوتُ وَأَحْيَا

</div>

- **Texte copié depuis** : https://sunnah.com/bukhari:6324
- **Référence** : al-Bukhari 6324 (variantes : al-Bukhari 6312 sans « اللَّهُمَّ » ; al-Bukhari 6314 « اللَّهُمَّ بِاسْمِكَ أَمُوتُ وَأَحْيَا » ; Muslim 2711 « اللَّهُمَّ بِاسْمِكَ أَحْيَا وَبِاسْمِكَ أَمُوتُ ») — https://sunnah.com/bukhari:6324
- **Degré** : sahih — al-Bukhari (Sahih)
- **Traduction française publiée** : (vide)
- **Note** : Plusieurs formulations authentiques coexistent (voir reference). La fiche akh.f050 utilise la forme de Bukhari 6324 : conforme.
- **Livres Awzid** : Occurrences (mot-cle) : ado1 l07 ; en1 l19, l22 ; en4 l01 ; re1 l23, l26, l27 ; re3 l01, l03, l05, l23 ; re5 l22 ; fiche akhlaq akh.f050
- **Registre Awzid (registre/hadiths.json)** : HAD_BUK_06324, HAD_BUK_06312
- **Statut** : `A_VERIFIER_REFERENT`

#### DOU-SOM-02 — Au reveil : « Louange a Allah qui nous a rendu la vie »

- **Moment** : Au reveil.
- **Type** : hadith
- **Texte arabe** (copié de la source) :

<div dir="rtl" lang="ar">

الْحَمْدُ لِلَّهِ الَّذِي أَحْيَانَا بَعْدَ مَا أَمَاتَنَا، وَإِلَيْهِ النُّشُورُ

</div>

- **Texte copié depuis** : https://sunnah.com/bukhari:6324
- **Référence** : al-Bukhari 6324 (aussi al-Bukhari 6312, Muslim 2711) — https://sunnah.com/bukhari:6324
- **Degré** : sahih — al-Bukhari (Sahih)
- **Traduction française publiée** : (vide)
- **Note** : Fiches akh.f046 et akh.f050 : texte identique.
- **Livres Awzid** : Occurrences : en1 l19 ; re1 l23, l26, l27 ; fiches akh.f046, akh.f050
- **Registre Awzid (registre/hadiths.json)** : HAD_BUK_06324
- **Statut** : `A_VERIFIER_REFERENT`

#### DOU-SOM-03 — Au coucher : « En Ton nom, mon Seigneur, je pose mon flanc »

- **Moment** : En se couchant, apres avoir epousseté le lit.
- **Type** : hadith
- **Texte arabe** (copié de la source) :

<div dir="rtl" lang="ar">

بِاسْمِكَ رَبِّ وَضَعْتُ جَنْبِي، وَبِكَ أَرْفَعُهُ، إِنْ أَمْسَكْتَ نَفْسِي فَارْحَمْهَا، وَإِنْ أَرْسَلْتَهَا فَاحْفَظْهَا بِمَا تَحْفَظُ بِهِ عِبَادَكَ الصَّالِحِينَ

</div>

- **Texte copié depuis** : https://sunnah.com/bukhari:6320
- **Référence** : al-Bukhari 6320 — https://sunnah.com/bukhari:6320
- **Degré** : sahih — al-Bukhari (Sahih)
- **Traduction française publiée** : (vide)
- **Note** : Le hadith prescrit d'abord d'epousseter le lit avec le pan de son pagne. At-Tirmidhi 3401 donne « رَبِّي » au lieu de « رَبِّ ».
- **Livres Awzid** : Non trouve par mot-cle
- **Registre Awzid (registre/hadiths.json)** : absent
- **Statut** : `A_VERIFIER_REFERENT`

#### DOU-SOM-04 — Au coucher : « Ô Allah, je T'ai soumis mon visage »

- **Moment** : En se couchant, apres les ablutions, sur le cote droit ; derniere parole avant de dormir.
- **Type** : hadith
- **Texte arabe** (copié de la source) :

<div dir="rtl" lang="ar">

اللَّهُمَّ أَسْلَمْتُ وَجْهِي إِلَيْكَ، وَفَوَّضْتُ أَمْرِي إِلَيْكَ، وَأَلْجَأْتُ ظَهْرِي إِلَيْكَ، رَغْبَةً وَرَهْبَةً إِلَيْكَ، لاَ مَلْجَأَ وَلاَ مَنْجَا مِنْكَ إِلاَّ إِلَيْكَ، اللَّهُمَّ آمَنْتُ بِكِتَابِكَ الَّذِي أَنْزَلْتَ، وَبِنَبِيِّكَ الَّذِي أَرْسَلْتَ

</div>

- **Texte copié depuis** : https://sunnah.com/bukhari:247
- **Référence** : al-Bukhari 247 (aussi Muslim 2710) — https://sunnah.com/bukhari:247
- **Degré** : sahih — al-Bukhari (Sahih)
- **Traduction française publiée** : (vide)
- **Note** : Formulation populaire fautive : « وَرَسُولِكَ الَّذِي أَرْسَلْتَ ». Dans le hadith meme, le Prophete corrige al-Bara' : « non : وَنَبِيِّكَ الَّذِي أَرْسَلْتَ ».
- **Livres Awzid** : Non trouve par mot-cle
- **Registre Awzid (registre/hadiths.json)** : HAD_BUK_00247
- **Statut** : `A_VERIFIER_REFERENT`

#### DOU-SOM-05 — Au coucher : « Ô Allah, preserve-moi de Ton chatiment »

- **Moment** : En se couchant, la main droite sous la joue.
- **Type** : hadith
- **Texte arabe** (copié de la source) :

<div dir="rtl" lang="ar">

اللَّهُمَّ قِنِي عَذَابَكَ يَوْمَ تَبْعَثُ عِبَادَكَ

</div>

- **Texte copié depuis** : https://sunnah.com/abudawud:5045
- **Référence** : Abu Dawud 5045 (aussi at-Tirmidhi 3398 : « يَوْمَ تَجْمَعُ عِبَادَكَ أَوْ تَبْعَثُ عِبَادَكَ ») — https://sunnah.com/abudawud:5045
- **Degré** : sahih (sans la mention « trois fois ») — al-Albani : « صحيح دون قوله ثلاث مرار » (sunnah.com) ; at-Tirmidhi : hasan sahih ; Darussalam : sahih
- **Traduction française publiée** : (vide)
- **Note** : La repetition « trois fois » n'est pas retenue par al-Albani : ne pas l'afficher comme sunna.
- **Livres Awzid** : Non trouve par mot-cle
- **Registre Awzid (registre/hadiths.json)** : absent
- **Statut** : `A_VERIFIER_REFERENT`

#### DOU-SOM-06 — Au reveil : « Louange a Allah qui m'a donne la sante »

- **Moment** : Au reveil.
- **Type** : hadith
- **Texte arabe** (copié de la source) :

<div dir="rtl" lang="ar">

الْحَمْدُ لِلَّهِ الَّذِي عَافَانِي فِي جَسَدِي وَرَدَّ عَلَىَّ رُوحِي وَأَذِنَ لِي بِذِكْرِهِ

</div>

- **Texte copié depuis** : https://sunnah.com/tirmidhi:3401
- **Référence** : at-Tirmidhi 3401 — https://sunnah.com/tirmidhi:3401
- **Degré** : hasan — at-Tirmidhi : hasan ; Darussalam : sahih
- **Traduction française publiée** : (vide)
- **Note** : Verifier le jugement d'al-Albani (non affiche sur sunnah.com pour at-Tirmidhi).
- **Livres Awzid** : Non trouve par mot-cle
- **Registre Awzid (registre/hadiths.json)** : absent
- **Statut** : `A_VERIFIER_REFERENT`

#### DOU-SOM-07 — Reveil pendant la nuit

- **Moment** : Quand on se reveille la nuit.
- **Type** : hadith
- **Texte arabe** (copié de la source) :

<div dir="rtl" lang="ar">

لاَ إِلَهَ إِلاَّ اللَّهُ وَحْدَهُ لاَ شَرِيكَ لَهُ، لَهُ الْمُلْكُ، وَلَهُ الْحَمْدُ، وَهُوَ عَلَى كُلِّ شَىْءٍ قَدِيرٌ ... الْحَمْدُ لِلَّهِ، وَسُبْحَانَ اللَّهِ، وَلاَ إِلَهَ إِلاَّ اللَّهُ، وَاللَّهُ أَكْبَرُ، وَلاَ حَوْلَ وَلاَ قُوَّةَ إِلاَّ بِاللَّهِ ... اللَّهُمَّ اغْفِرْ لِي‏

</div>

- **Texte copié depuis** : https://sunnah.com/bukhari:1154
- **Référence** : al-Bukhari 1154 — https://sunnah.com/bukhari:1154
- **Degré** : sahih — al-Bukhari (Sahih)
- **Traduction française publiée** : (vide)
- **Note** : Le « ... » marque « ثُمَّ قَالَ » dans le hadith (passage narratif retire). Le texte contient un caractere de ponctuation sunnah.com (‏.‏) a nettoyer.
- **Livres Awzid** : Non trouve
- **Registre Awzid (registre/hadiths.json)** : absent
- **Statut** : `A_VERIFIER_REFERENT`

### Entrer et sortir de la maison

#### DOU-MAI-01 — En sortant de la maison : « Au nom d'Allah, je m'en remets a Allah »

- **Moment** : En sortant de chez soi.
- **Type** : hadith
- **Texte arabe** (copié de la source) :

<div dir="rtl" lang="ar">

بِسْمِ اللَّهِ تَوَكَّلْتُ عَلَى اللَّهِ لاَ حَوْلَ وَلاَ قُوَّةَ إِلاَّ بِاللَّهِ

</div>

- **Texte copié depuis** : https://sunnah.com/abudawud:5095
- **Référence** : Abu Dawud 5095 (aussi at-Tirmidhi 3426) — https://sunnah.com/abudawud:5095
- **Degré** : sahih — al-Albani (sunnah.com) ; at-Tirmidhi 3426 note da'if par Darussalam
- **Traduction française publiée** : (vide)
- **Note** : Divergence de jugement entre al-Albani (sahih) et Darussalam (da'if, sur la voie d'at-Tirmidhi) : a trancher par le referent.
- **Livres Awzid** : Non trouve par mot-cle
- **Registre Awzid (registre/hadiths.json)** : HAD_ABD_05095
- **Statut** : `A_VERIFIER_REFERENT`

#### DOU-MAI-02 — En sortant : « Ô Allah, je cherche refuge aupres de Toi contre l'egarement »

- **Moment** : En sortant de chez soi.
- **Type** : hadith
- **Texte arabe** (copié de la source) :

<div dir="rtl" lang="ar">

اللَّهُمَّ إِنِّي أَعُوذُ بِكَ أَنْ أَضِلَّ أَوْ أُضَلَّ أَوْ أَزِلَّ أَوْ أُزَلَّ أَوْ أَظْلِمَ أَوْ أُظْلَمَ أَوْ أَجْهَلَ أَوْ يُجْهَلَ عَلَىَّ

</div>

- **Texte copié depuis** : https://sunnah.com/abudawud:5094
- **Référence** : Abu Dawud 5094 (variante plurielle : at-Tirmidhi 3427) — https://sunnah.com/abudawud:5094
- **Degré** : sahih — al-Albani (sunnah.com) ; la variante at-Tirmidhi 3427 est notee da'if par Darussalam
- **Traduction française publiée** : (vide)
- **Note** : Retenir la forme d'Abu Dawud (singulier).
- **Livres Awzid** : Non trouve
- **Registre Awzid (registre/hadiths.json)** : absent
- **Statut** : `A_VERIFIER_REFERENT`

#### DOU-MAI-03 — En entrant a la maison : mentionner Allah

- **Moment** : En entrant chez soi (et en mangeant).
- **Type** : hadith
- **Texte arabe** (copié de la source) :

<div dir="rtl" lang="ar">

إِذَا دَخَلَ الرَّجُلُ بَيْتَهُ فَذَكَرَ اللَّهَ عِنْدَ دُخُولِهِ وَعِنْدَ طَعَامِهِ قَالَ الشَّيْطَانُ لاَ مَبِيتَ لَكُمْ وَلاَ عَشَاءَ

</div>

- **Texte copié depuis** : https://sunnah.com/muslim:2018a
- **Référence** : Muslim 2018a — https://sunnah.com/muslim:2018a
- **Degré** : sahih — Muslim (Sahih)
- **Traduction française publiée** : (vide)
- **Note** : Le hadith ne fixe pas de formule : il demande de mentionner Allah (ex. « بِسْمِ اللَّهِ »). La formule populaire « بِسْمِ اللَّهِ وَلَجْنَا... » (Abu Dawud 5096) est da'if : voir ecartees. Ici texte_ar = le hadith lui-meme (consigne), pas une doua.
- **Livres Awzid** : Non verifie
- **Registre Awzid (registre/hadiths.json)** : HAD_MUS_02018
- **Statut** : `A_VERIFIER_REFERENT`

### Toilettes

#### DOU-TOI-01 — En entrant aux toilettes

- **Moment** : Avant d'entrer aux toilettes.
- **Type** : hadith
- **Texte arabe** (copié de la source) :

<div dir="rtl" lang="ar">

اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنَ الْخُبُثِ وَالْخَبَائِثِ

</div>

- **Texte copié depuis** : https://sunnah.com/bukhari:142
- **Référence** : al-Bukhari 142 (aussi Muslim 375) — https://sunnah.com/bukhari:142
- **Degré** : sahih — al-Bukhari (Sahih)
- **Traduction française publiée** : (vide)
- **Note** : « بِسْمِ اللَّهِ » avant d'entrer : at-Tirmidhi 606, chaine faible selon at-Tirmidhi lui-meme et Darussalam (voir ecartees ; d'autres savants le renforcent par d'autres voies : au referent). On entend souvent « الْخُبْثِ » (sukun) : les deux lectures sont connues ; sunnah.com vocalise « الْخُبُثِ ».
- **Livres Awzid** : Occurrences : ad1 l04 ; en1 l07 ; en4 l06 ; ra1 l13 ; re1 l17, l19, l27 ; fiche akh.f001
- **Registre Awzid (registre/hadiths.json)** : HAD_BUK_00142
- **Statut** : `A_VERIFIER_REFERENT`

#### DOU-TOI-02 — En sortant des toilettes : « Ton pardon »

- **Moment** : En sortant des toilettes.
- **Type** : hadith
- **Texte arabe** (copié de la source) :

<div dir="rtl" lang="ar">

غُفْرَانَكَ

</div>

- **Texte copié depuis** : https://sunnah.com/abudawud:30
- **Référence** : Abu Dawud 30 (aussi at-Tirmidhi 7) — https://sunnah.com/abudawud:30
- **Degré** : sahih — al-Albani (sunnah.com)
- **Traduction française publiée** : (vide)
- **Note** : L'ajout populaire « الْحَمْدُ لِلَّهِ الَّذِي أَذْهَبَ عَنِّي الأَذَى وَعَافَانِي » (Ibn Majah 301) est da'if : voir ecartees.
- **Livres Awzid** : Occurrences : ad1 l04 ; en1 l07 ; en4 l06 ; fiche akh.f001
- **Registre Awzid (registre/hadiths.json)** : HAD_ABD_00030
- **Statut** : `A_VERIFIER_REFERENT`

### Avant et après le repas

#### DOU-REP-01 — Avant de manger : « Au nom d'Allah »

- **Moment** : Avant de manger.
- **Type** : hadith
- **Texte arabe** (copié de la source) :

<div dir="rtl" lang="ar">

يَا غُلاَمُ سَمِّ اللَّهَ، وَكُلْ بِيَمِينِكَ وَكُلْ مِمَّا يَلِيكَ

</div>

- **Texte copié depuis** : https://sunnah.com/bukhari:5376
- **Référence** : al-Bukhari 5376 ; formule « بِسْمِ اللَّهِ » explicite dans Abu Dawud 3767 et at-Tirmidhi 1858 — https://sunnah.com/bukhari:5376
- **Degré** : sahih — al-Bukhari (Sahih)
- **Traduction française publiée** : (vide)
- **Note** : Formule a afficher : « بِسْمِ اللَّهِ » (tiree d'Abu Dawud 3767). L'ajout « الرَّحْمَنِ الرَّحِيمِ » a table n'est pas dans ces hadiths : au referent de dire s'il le signale.
- **Livres Awzid** : Nombreuses occurrences de « بسم الله » ; fiche akh.f030
- **Registre Awzid (registre/hadiths.json)** : HAD_BUK_05376
- **Statut** : `A_VERIFIER_REFERENT`

#### DOU-REP-02 — Si on a oublie de dire « Bismillah »

- **Moment** : En cours de repas, si on a oublie au debut.
- **Type** : hadith
- **Texte arabe** (copié de la source) :

<div dir="rtl" lang="ar">

بِسْمِ اللَّهِ أَوَّلَهُ وَآخِرَهُ

</div>

- **Texte copié depuis** : https://sunnah.com/abudawud:3767
- **Référence** : Abu Dawud 3767 (at-Tirmidhi 1858 : « بِسْمِ اللَّهِ فِي أَوَّلِهِ وَآخِرِهِ ») — https://sunnah.com/abudawud:3767
- **Degré** : sahih — al-Albani (sunnah.com) ; Darussalam : sahih (Tirmidhi 1858)
- **Traduction française publiée** : (vide)
- **Note** : Deux formulations authentiques (avec ou sans « فِي »).
- **Livres Awzid** : Occurrences : en1 l03 ; en3 l13 ; re1 l01, l23, l27 ; re2 l12 ; fiche akh.f030
- **Registre Awzid (registre/hadiths.json)** : HAD_ABD_03767
- **Statut** : `A_VERIFIER_REFERENT`

#### DOU-REP-03 — Apres le repas : « Louange a Allah qui m'a nourri »

- **Moment** : Apres avoir mange.
- **Type** : hadith
- **Texte arabe** (copié de la source) :

<div dir="rtl" lang="ar">

الْحَمْدُ لِلَّهِ الَّذِي أَطْعَمَنِي هَذَا الطَّعَامَ وَرَزَقَنِيهِ مِنْ غَيْرِ حَوْلٍ مِنِّي وَلاَ قُوَّةٍ

</div>

- **Texte copié depuis** : https://sunnah.com/abudawud:4023
- **Référence** : Abu Dawud 4023 ; at-Tirmidhi 3458 (« أَطْعَمَنِي هَذَا » sans « الطَّعَامَ ») — https://sunnah.com/abudawud:4023
- **Degré** : hasan (sans l'ajout « وَمَا تَأَخَّرَ » dans la promesse) — al-Albani : « حسن دون زيادة وما تأخر » ; Darussalam : hasan (Tirmidhi 3458)
- **Traduction française publiée** : (vide)
- **Note** : La promesse authentique est le pardon des peches passes ; ne pas ecrire « passes et futurs ». La fiche akh.f031 donne les deux formes : conforme.
- **Livres Awzid** : Occurrences : re2 l02, l06, l22, l27 ; fiche akh.f031
- **Registre Awzid (registre/hadiths.json)** : HAD_ABD_04023, HAD_TIR_03458
- **Statut** : `A_VERIFIER_REFERENT`

#### DOU-REP-04 — Apres le repas : « Louange abondante, bonne et benie »

- **Moment** : Quand on leve la nappe, a la fin du repas.
- **Type** : hadith
- **Texte arabe** (copié de la source) :

<div dir="rtl" lang="ar">

الْحَمْدُ لِلَّهِ كَثِيرًا طَيِّبًا مُبَارَكًا فِيهِ، غَيْرَ مَكْفِيٍّ، وَلاَ مُوَدَّعٍ وَلاَ مُسْتَغْنًى عَنْهُ، رَبَّنَا

</div>

- **Texte copié depuis** : https://sunnah.com/bukhari:5458
- **Référence** : al-Bukhari 5458 — https://sunnah.com/bukhari:5458
- **Degré** : sahih — al-Bukhari (Sahih)
- **Traduction française publiée** : (vide)
- **Note** : « رَبَّنَا » se lit aussi « رَبُّنَا » selon les commentateurs : au referent.
- **Livres Awzid** : Non trouve
- **Registre Awzid (registre/hadiths.json)** : absent
- **Statut** : `A_VERIFIER_REFERENT`

#### DOU-REP-05 — Pour celui qui nous a invites a manger

- **Moment** : Chez un hote, apres le repas.
- **Type** : hadith
- **Texte arabe** (copié de la source) :

<div dir="rtl" lang="ar">

اللَّهُمَّ بَارِكْ لَهُمْ فِي مَا رَزَقْتَهُمْ وَاغْفِرْ لَهُمْ وَارْحَمْهُمْ

</div>

- **Texte copié depuis** : https://sunnah.com/muslim:2042
- **Référence** : Muslim 2042 — https://sunnah.com/muslim:2042
- **Degré** : sahih — Muslim (Sahih)
- **Traduction française publiée** : (vide)
- **Note** : La formule populaire « اللَّهُمَّ بَارِكْ لَنَا فِيمَا رَزَقْتَنَا وَقِنَا عَذَابَ النَّارِ » n'a pas ete trouvee sur sunnah.com ; elle est generalement jugee faible (voir ecartees).
- **Livres Awzid** : Non trouve
- **Registre Awzid (registre/hadiths.json)** : absent
- **Statut** : `A_VERIFIER_REFERENT`

### Après les ablutions

#### DOU-ABL-01 — Apres les ablutions : les deux temoignages

- **Moment** : Apres avoir termine les ablutions.
- **Type** : hadith
- **Texte arabe** (copié de la source) :

<div dir="rtl" lang="ar">

أَشْهَدُ أَنْ لاَ إِلَهَ إِلاَّ اللَّهُ وَحْدَهُ لاَ شَرِيكَ لَهُ وَأَنَّ مُحَمَّدًا عَبْدُهُ وَرَسُولُهُ

</div>

- **Texte copié depuis** : https://sunnah.com/abudawud:169
- **Référence** : Abu Dawud 169 ; Muslim 234a (« أَشْهَدُ أَنْ لاَ إِلَهَ إِلاَّ اللَّهُ وَأَنَّ مُحَمَّدًا عَبْدُ اللَّهِ وَرَسُولُهُ ») — https://sunnah.com/abudawud:169
- **Degré** : sahih — Muslim (Sahih) ; al-Albani pour Abu Dawud 169
- **Traduction française publiée** : (vide)
- **Note** : Sunnah.com, Muslim 234a, porte la forme courte ; « وَحْدَهُ لاَ شَرِيكَ لَهُ » et « عَبْدُهُ » viennent d'Abu Dawud 169 (et d'autres voies de Muslim 234 : a verifier dans une edition imprimee).
- **Livres Awzid** : Occurrences : ad1 l07 ; en1 l10 ; en2 l12 ; re1 l18, l19, l21 ; re2 l18
- **Registre Awzid (registre/hadiths.json)** : HAD_MUS_00234
- **Statut** : `A_VERIFIER_REFERENT`

#### DOU-ABL-02 — Ajout : « Ô Allah, fais de moi l'un de ceux qui se repentent »

- **Moment** : Apres les deux temoignages, a la fin des ablutions.
- **Type** : hadith
- **Texte arabe** (copié de la source) :

<div dir="rtl" lang="ar">

أَشْهَدُ أَنْ لاَ إِلَهَ إِلاَّ اللَّهُ وَحْدَهُ لاَ شَرِيكَ لَهُ وَأَشْهَدُ أَنَّ مُحَمَّدًا عَبْدُهُ وَرَسُولُهُ اللَّهُمَّ اجْعَلْنِي مِنَ التَّوَّابِينَ وَاجْعَلْنِي مِنَ الْمُتَطَهِّرِينَ

</div>

- **Texte copié depuis** : https://sunnah.com/tirmidhi:55
- **Référence** : at-Tirmidhi 55 — https://sunnah.com/tirmidhi:55
- **Degré** : CONTESTE : sahih selon al-Albani ; da'if selon Darussalam — al-Albani (Sahih at-Tirmidhi 55, selon recherche web, a confirmer) ; Darussalam : da'if (sunnah.com) ; at-Tirmidhi lui-meme signale un trouble (idtirab) dans la chaine
- **Traduction française publiée** : (vide)
- **Note** : A trancher par le referent. Si retenue, afficher l'ajout comme « rapporte par at-Tirmidhi ».
- **Livres Awzid** : Occurrence : re2 l18
- **Registre Awzid (registre/hadiths.json)** : absent
- **Statut** : `A_VERIFIER_REFERENT`

### Entrer et sortir de la mosquée

#### DOU-MOS-01 — En entrant et en sortant de la mosquee

- **Moment** : Entree : « ouvre-moi les portes de Ta misericorde » ; sortie : « je Te demande de Ta grace ».
- **Type** : hadith
- **Texte arabe** (copié de la source) :

<div dir="rtl" lang="ar">

اللَّهُمَّ افْتَحْ لِي أَبْوَابَ رَحْمَتِكَ ‏.‏ وَإِذَا خَرَجَ فَلْيَقُلِ اللَّهُمَّ إِنِّي أَسْأَلُكَ مِنْ فَضْلِكَ

</div>

- **Texte copié depuis** : https://sunnah.com/muslim:713a
- **Référence** : Muslim 713a — https://sunnah.com/muslim:713a
- **Degré** : sahih — Muslim (Sahih)
- **Traduction française publiée** : (vide)
- **Note** : Deux douas : entree = « اللَّهُمَّ افْتَحْ لِي أَبْوَابَ رَحْمَتِكَ » ; sortie = « اللَّهُمَّ إِنِّي أَسْأَلُكَ مِنْ فَضْلِكَ ». Le hadith ajoute de saluer le Prophete (salam) avant : le texte « فليسلم على النبي » est dans d'autres voies (Abu Dawud 465) a verifier. Fiche akh.f038 : conforme.
- **Livres Awzid** : Occurrences : ad2 l12, l15 ; ad5 l16, l20 ; ado1 l14, l15 ; en1 l14, l17, l26 ; en3 l24, l25 ; en5 l03 ; fiche akh.f038
- **Registre Awzid (registre/hadiths.json)** : HAD_MUS_00713
- **Statut** : `A_VERIFIER_REFERENT`

#### DOU-MOS-02 — En entrant a la mosquee : refuge contre Satan

- **Moment** : En entrant a la mosquee.
- **Type** : hadith
- **Texte arabe** (copié de la source) :

<div dir="rtl" lang="ar">

أَعُوذُ بِاللَّهِ الْعَظِيمِ وَبِوَجْهِهِ الْكَرِيمِ وَسُلْطَانِهِ الْقَدِيمِ مِنَ الشَّيْطَانِ الرَّجِيمِ

</div>

- **Texte copié depuis** : https://sunnah.com/abudawud:466
- **Référence** : Abu Dawud 466 — https://sunnah.com/abudawud:466
- **Degré** : sahih — al-Albani (sunnah.com)
- **Traduction française publiée** : (vide)
- **Livres Awzid** : Non trouve
- **Registre Awzid (registre/hadiths.json)** : absent
- **Statut** : `A_VERIFIER_REFERENT`

### S'habiller et nouvel habit

#### DOU-HAB-01 — En s'habillant : « Louange a Allah qui m'a vetu »

- **Moment** : En mettant un vetement.
- **Type** : hadith
- **Texte arabe** (copié de la source) :

<div dir="rtl" lang="ar">

الْحَمْدُ لِلَّهِ الَّذِي كَسَانِي هَذَا الثَّوْبَ وَرَزَقَنِيهِ مِنْ غَيْرِ حَوْلٍ مِنِّي وَلاَ قُوَّةٍ

</div>

- **Texte copié depuis** : https://sunnah.com/abudawud:4023
- **Référence** : Abu Dawud 4023 — https://sunnah.com/abudawud:4023
- **Degré** : hasan (sans « وَمَا تَأَخَّرَ ») — al-Albani : « حسن دون زيادة وما تأخر »
- **Traduction française publiée** : (vide)
- **Note** : Meme remarque que DOU-REP-03 sur la promesse. Fiche akh.f009 : conforme.
- **Livres Awzid** : Occurrences : en3 l14, l15, l25 ; re3 l23, l26, l27 ; fiche akh.f009
- **Registre Awzid (registre/hadiths.json)** : HAD_ABD_04023
- **Statut** : `A_VERIFIER_REFERENT`

#### DOU-HAB-02 — Nouvel habit : « Ô Allah, a Toi la louange, c'est Toi qui m'en as vetu »

- **Moment** : En mettant un vetement neuf (en le nommant : turban, chemise...).
- **Type** : hadith
- **Texte arabe** (copié de la source) :

<div dir="rtl" lang="ar">

اللَّهُمَّ لَكَ الْحَمْدُ أَنْتَ كَسَوْتَنِيهِ أَسْأَلُكَ مِنْ خَيْرِهِ وَخَيْرِ مَا صُنِعَ لَهُ وَأَعُوذُ بِكَ مِنْ شَرِّهِ وَشَرِّ مَا صُنِعَ لَهُ

</div>

- **Texte copié depuis** : https://sunnah.com/abudawud:4020
- **Référence** : Abu Dawud 4020 ; at-Tirmidhi 1767 (« أَسْأَلُكَ خَيْرَهُ » sans « مِنْ ») — https://sunnah.com/abudawud:4020
- **Degré** : sahih — al-Albani (sunnah.com) ; Darussalam : hasan (Tirmidhi 1767)
- **Traduction française publiée** : (vide)
- **Note** : C'est la seule doua authentique trouvee pour le nouvel habit. Celle qu'on dit a autrui (« الْبَسْ جَدِيدًا... ») est ecartee.
- **Livres Awzid** : Non trouve
- **Registre Awzid (registre/hadiths.json)** : HAD_ABD_04020
- **Statut** : `A_VERIFIER_REFERENT`

### Voyage et monture

#### DOU-VOY-01 — En montant sur sa monture (ou en vehicule)

- **Moment** : En montant : « بِسْمِ اللَّهِ » au pied sur l'etrier, « الْحَمْدُ لِلَّهِ » une fois installe, puis le verset, puis 3x « الْحَمْدُ لِلَّهِ », 3x « اللَّهُ أَكْبَرُ », puis la demande de pardon.
- **Type** : hadith
- **Texte arabe** (copié de la source) :

<div dir="rtl" lang="ar">

بِسْمِ اللَّهِ ... الْحَمْدُ لِلَّهِ ... سُبْحَانَ الَّذِي سَخَّرَ لَنَا هَذَا وَمَا كُنَّا لَهُ مُقْرِنِينَ * وَإِنَّا إِلَى رَبِّنَا لَمُنْقَلِبُونَ ... الْحَمْدُ لِلَّهِ (×3) ... اللَّهُ أَكْبَرُ (×3) ... سُبْحَانَكَ إِنِّي ظَلَمْتُ نَفْسِي فَاغْفِرْ لِي فَإِنَّهُ لاَ يَغْفِرُ الذُّنُوبَ إِلاَّ أَنْتَ

</div>

- **Coran** : 43:13-14 (passage coranique a prendre dans Tanzil) — texte à prendre dans Tanzil
- **Texte copié depuis** : https://sunnah.com/abudawud:2602
- **Référence** : Abu Dawud 2602 ; at-Tirmidhi 3446 — https://sunnah.com/abudawud:2602
- **Degré** : sahih — al-Albani (Abu Dawud 2602) ; Darussalam : sahih (Tirmidhi 3446)
- **Traduction française publiée** : (vide)
- **Note** : Les « ... » et « (×3) » sont des marques de mise en forme ajoutees par le chercheur, pas du texte source. Le passage 43:13-14 est coranique : l'afficher depuis Tanzil.
- **Livres Awzid** : Occurrences « سخر لنا هذا » : ad3 l19 ; ado2 l19 ; en3 l19, l20, l25 ; en4 l03 ; fiche akh.f102
- **Registre Awzid (registre/hadiths.json)** : absent
- **Statut** : `A_VERIFIER_REFERENT`

#### DOU-VOY-02 — Doua du voyage (au depart)

- **Moment** : En partant en voyage, une fois installe sur la monture, apres trois « اللَّهُ أَكْبَرُ ».
- **Type** : hadith
- **Texte arabe** (copié de la source) :

<div dir="rtl" lang="ar">

سُبْحَانَ الَّذِي سَخَّرَ لَنَا هَذَا وَمَا كُنَّا لَهُ مُقْرِنِينَ وَإِنَّا إِلَى رَبِّنَا لَمُنْقَلِبُونَ اللَّهُمَّ إِنَّا نَسْأَلُكَ فِي سَفَرِنَا هَذَا الْبِرَّ وَالتَّقْوَى وَمِنَ الْعَمَلِ مَا تَرْضَى اللَّهُمَّ هَوِّنْ عَلَيْنَا سَفَرَنَا هَذَا وَاطْوِ عَنَّا بُعْدَهُ اللَّهُمَّ أَنْتَ الصَّاحِبُ فِي السَّفَرِ وَالْخَلِيفَةُ فِي الأَهْلِ اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنْ وَعْثَاءِ السَّفَرِ وَكَآبَةِ الْمَنْظَرِ وَسُوءِ الْمُنْقَلَبِ فِي الْمَالِ وَالأَهْلِ

</div>

- **Coran** : 43:13-14 (debut coranique) — texte à prendre dans Tanzil
- **Texte copié depuis** : https://sunnah.com/muslim:1342
- **Référence** : Muslim 1342 — https://sunnah.com/muslim:1342
- **Degré** : sahih — Muslim (Sahih)
- **Traduction française publiée** : (vide)
- **Note** : Le debut reprend 43:13-14 : pour l'affichage, decider si on prend le texte du hadith (sunnah.com) ou de Tanzil pour cette partie.
- **Livres Awzid** : Voir DOU-VOY-01 ; fiche akh.f102
- **Registre Awzid (registre/hadiths.json)** : HAD_MUS_01342
- **Statut** : `A_VERIFIER_REFERENT`

#### DOU-VOY-03 — Au retour de voyage

- **Moment** : Au retour : on redit la doua du voyage et on ajoute cette phrase.
- **Type** : hadith
- **Texte arabe** (copié de la source) :

<div dir="rtl" lang="ar">

آيِبُونَ تَائِبُونَ عَابِدُونَ لِرَبِّنَا حَامِدُونَ

</div>

- **Texte copié depuis** : https://sunnah.com/muslim:1342
- **Référence** : Muslim 1342 ; al-Bukhari 1797 (retour de Hajj, ghazwa ou Umra) : « آيِبُونَ تَائِبُونَ عَابِدُونَ سَاجِدُونَ لِرَبِّنَا حَامِدُونَ » — https://sunnah.com/muslim:1342
- **Degré** : sahih — Muslim ; al-Bukhari
- **Traduction française publiée** : (vide)
- **Note** : La fiche akh.f102 contient « سَاجِدُونَ » : c'est la forme d'al-Bukhari 1797 (contexte Hajj/Umra/expedition), absente de Muslim 1342. Preciser la source dans la fiche.
- **Livres Awzid** : Fiche akh.f102
- **Registre Awzid (registre/hadiths.json)** : HAD_MUS_01342, HAD_BUK_01797
- **Statut** : `A_VERIFIER_REFERENT`

#### DOU-VOY-04 — En s'arretant dans un lieu

- **Moment** : En faisant halte dans un endroit (voyage, hotel...).
- **Type** : hadith
- **Texte arabe** (copié de la source) :

<div dir="rtl" lang="ar">

أَعُوذُ بِكَلِمَاتِ اللَّهِ التَّامَّاتِ مِنْ شَرِّ مَا خَلَقَ

</div>

- **Texte copié depuis** : https://sunnah.com/muslim:2708a
- **Référence** : Muslim 2708a — https://sunnah.com/muslim:2708a
- **Degré** : sahih — Muslim (Sahih)
- **Traduction française publiée** : (vide)
- **Note** : Fiche akh.f102 : conforme.
- **Livres Awzid** : Fiche akh.f102
- **Registre Awzid (registre/hadiths.json)** : HAD_MUS_02708
- **Statut** : `A_VERIFIER_REFERENT`

### Pluie, vent, tonnerre

#### DOU-PLU-01 — Quand il pleut : « pluie abondante et utile »

- **Moment** : En voyant la pluie.
- **Type** : hadith
- **Texte arabe** (copié de la source) :

<div dir="rtl" lang="ar">

صَيِّبًا نَافِعًا

</div>

- **Texte copié depuis** : https://sunnah.com/bukhari:1032
- **Référence** : al-Bukhari 1032 — https://sunnah.com/bukhari:1032
- **Degré** : sahih — al-Bukhari (Sahih)
- **Traduction française publiée** : (vide)
- **Note** : Forme populaire : « اللَّهُمَّ صَيِّبًا نَافِعًا ». Dans al-Bukhari 1032 (sunnah.com) il n'y a pas « اللَّهُمَّ » ; la forme avec « اللَّهُمَّ » existe dans d'autres recueils (an-Nasa'i, Ibn Majah) : a verifier avant de l'afficher.
- **Livres Awzid** : Occurrences : en2 l08 ; en3 l17, l20, l25 ; re3 l01, l05, l06, l27 ; re5 l21, l26
- **Registre Awzid (registre/hadiths.json)** : HAD_BUK_01032
- **Statut** : `A_VERIFIER_REFERENT`

#### DOU-PLU-02 — Apres la pluie : « Nous avons recu la pluie par la grace d'Allah »

- **Moment** : Apres la pluie.
- **Type** : hadith
- **Texte arabe** (copié de la source) :

<div dir="rtl" lang="ar">

مُطِرْنَا بِفَضْلِ اللَّهِ وَرَحْمَتِهِ

</div>

- **Texte copié depuis** : https://sunnah.com/bukhari:846
- **Référence** : al-Bukhari 846 (hadith qudsi) — https://sunnah.com/bukhari:846
- **Degré** : sahih — al-Bukhari (Sahih) ; aussi dans le Muwatta' de Malik
- **Traduction française publiée** : (vide)
- **Note** : Le hadith oppose cette parole a « بِنَوْءِ كَذَا » (attribuer la pluie aux astres) : utile pour la note pedagogique.
- **Livres Awzid** : Non trouve par mot-cle
- **Registre Awzid (registre/hadiths.json)** : HAD_BUK_00846
- **Statut** : `A_VERIFIER_REFERENT`

#### DOU-PLU-03 — Quand la pluie devient excessive

- **Moment** : Quand on craint les degats d'une pluie trop forte.
- **Type** : hadith
- **Texte arabe** (copié de la source) :

<div dir="rtl" lang="ar">

اللَّهُمَّ حَوَالَيْنَا وَلاَ عَلَيْنَا، اللَّهُمَّ عَلَى الآكَامِ وَالْجِبَالِ وَالآجَامِ وَالظِّرَابِ وَالأَوْدِيَةِ وَمَنَابِتِ الشَّجَرِ

</div>

- **Texte copié depuis** : https://sunnah.com/bukhari:1013
- **Référence** : al-Bukhari 1013 — https://sunnah.com/bukhari:1013
- **Degré** : sahih — al-Bukhari (Sahih)
- **Traduction française publiée** : (vide)
- **Livres Awzid** : Non trouve
- **Registre Awzid (registre/hadiths.json)** : HAD_BUK_01013
- **Statut** : `A_VERIFIER_REFERENT`

#### DOU-PLU-04 — Quand le vent souffle fort

- **Moment** : Par vent violent.
- **Type** : hadith
- **Texte arabe** (copié de la source) :

<div dir="rtl" lang="ar">

اللَّهُمَّ إِنِّي أَسْأَلُكَ خَيْرَهَا وَخَيْرَ مَا فِيهَا وَخَيْرَ مَا أُرْسِلَتْ بِهِ وَأَعُوذُ بِكَ مِنْ شَرِّهَا وَشَرِّ مَا فِيهَا وَشَرِّ مَا أُرْسِلَتْ بِهِ

</div>

- **Texte copié depuis** : https://sunnah.com/muslim:899b
- **Référence** : Muslim 899b — https://sunnah.com/muslim:899b
- **Degré** : sahih — Muslim (Sahih)
- **Traduction française publiée** : (vide)
- **Livres Awzid** : Non trouve
- **Registre Awzid (registre/hadiths.json)** : HAD_MUS_00899 (a verifier : peut correspondre a une autre voie)
- **Statut** : `A_VERIFIER_REFERENT`

#### DOU-PLU-05 — En entendant le tonnerre (parole d'un Compagnon)

- **Moment** : En entendant le tonnerre : on cesse de parler et on dit cette phrase.
- **Type** : athar (mawquf sur 'Abd Allah ibn az-Zubayr)
- **Texte arabe** (copié de la source) :

<div dir="rtl" lang="ar">

سُبْحَانَ الَّذِي ... يُسَبِّحُ الرَّعْدُ بِحَمْدِهِ وَالْمَلاَئِكَةُ مِنْ خِيفَتِهِ

</div>

- **Coran** : 13:13 (la fin est un passage coranique) — texte à prendre dans Tanzil
- **Texte copié depuis** : https://sunnah.com/adab:723
- **Référence** : al-Adab al-Mufrad 723 ; Muwatta' Malik, livre 56, n° 26 (https://sunnah.com/malik/56/26 : le texte arabe y est tronque sur sunnah.com) — https://sunnah.com/adab:723
- **Degré** : sahih (mawquf : parole de Compagnon, pas du Prophete) — al-Albani, Sahih al-Adab al-Mufrad 556 (releve via recherche web / dorar, non affiche sur sunnah.com : a confirmer) ; an-Nawawi (selon dorar)
- **Traduction française publiée** : (vide)
- **Note** : Interessant pour une ecole malikite : rapporte par l'imam Malik dans le Muwatta'. A presenter comme pratique d'un Compagnon. Les accolades et marques ‏ viennent de sunnah.com : a nettoyer. La doua « اللَّهُمَّ لاَ تَقْتُلْنَا بِغَضَبِكَ » (Tirmidhi 3450) est ecartee.
- **Livres Awzid** : Non trouve
- **Registre Awzid (registre/hadiths.json)** : absent
- **Statut** : `A_VERIFIER_REFERENT`

### Visite au malade et maladie

#### DOU-MAL-01 — En rendant visite a un malade : « Pas de mal, c'est une purification »

- **Moment** : Aupres d'un malade.
- **Type** : hadith
- **Texte arabe** (copié de la source) :

<div dir="rtl" lang="ar">

لاَ بَأْسَ طَهُورٌ إِنْ شَاءَ اللَّهُ

</div>

- **Texte copié depuis** : https://sunnah.com/bukhari:3616
- **Référence** : al-Bukhari 3616 — https://sunnah.com/bukhari:3616
- **Degré** : sahih — al-Bukhari (Sahih)
- **Traduction française publiée** : (vide)
- **Note** : Fiche akh.f103 : conforme.
- **Livres Awzid** : Fiche akh.f103
- **Registre Awzid (registre/hadiths.json)** : HAD_BUK_03616
- **Statut** : `A_VERIFIER_REFERENT`

#### DOU-MAL-02 — Pour la guerison d'un malade : « Seigneur des hommes, ote le mal »

- **Moment** : Aupres d'un malade (roqya).
- **Type** : hadith
- **Texte arabe** (copié de la source) :

<div dir="rtl" lang="ar">

اللَّهُمَّ رَبَّ النَّاسِ أَذْهِبِ الْبَاسَ، اشْفِهِ وَأَنْتَ الشَّافِي، لاَ شِفَاءَ إِلاَّ شِفَاؤُكَ، شِفَاءً لاَ يُغَادِرُ سَقَمًا

</div>

- **Texte copié depuis** : https://sunnah.com/bukhari:5743
- **Référence** : al-Bukhari 5743 (al-Bukhari 5675 : « أَذْهِبِ الْبَاسَ رَبَّ النَّاسِ، اشْفِ وَأَنْتَ الشَّافِي... ») — https://sunnah.com/bukhari:5743
- **Degré** : sahih — al-Bukhari (Sahih)
- **Traduction française publiée** : (vide)
- **Note** : Le mot « الْبَاسَ » est ecrit sans hamza sur sunnah.com (lecture allegee de « الْبَأْسَ ») : verifier l'orthographe dans une edition imprimee.
- **Livres Awzid** : Non trouve
- **Registre Awzid (registre/hadiths.json)** : absent
- **Statut** : `A_VERIFIER_REFERENT`

#### DOU-MAL-03 — Pour un malade, sept fois

- **Moment** : Aupres d'un malade, 7 fois.
- **Type** : hadith
- **Texte arabe** (copié de la source) :

<div dir="rtl" lang="ar">

أَسْأَلُ اللَّهَ الْعَظِيمَ رَبَّ الْعَرْشِ الْعَظِيمِ أَنْ يَشْفِيَكَ

</div>

- **Texte copié depuis** : https://sunnah.com/abudawud:3106
- **Référence** : Abu Dawud 3106 ; at-Tirmidhi 2083 — https://sunnah.com/abudawud:3106
- **Degré** : sahih — al-Albani (sunnah.com) ; Darussalam : sahih (Tirmidhi 2083)
- **Traduction française publiée** : (vide)
- **Livres Awzid** : Occurrences : ad3 l16 ; ad5 l09 ; ado4 l13, l15
- **Registre Awzid (registre/hadiths.json)** : HAD_ABD_03106
- **Statut** : `A_VERIFIER_REFERENT`

#### DOU-MAL-04 — Quand on a mal quelque part

- **Moment** : La main sur l'endroit douloureux : « بِاسْمِ اللَّهِ » 3 fois, puis la phrase 7 fois.
- **Type** : hadith
- **Texte arabe** (copié de la source) :

<div dir="rtl" lang="ar">

بِاسْمِ اللَّهِ (×3) ... أَعُوذُ بِاللَّهِ وَقُدْرَتِهِ مِنْ شَرِّ مَا أَجِدُ وَأُحَاذِرُ (×7)

</div>

- **Texte copié depuis** : https://sunnah.com/muslim:2202
- **Référence** : Muslim 2202 — https://sunnah.com/muslim:2202
- **Degré** : sahih — Muslim (Sahih)
- **Traduction française publiée** : (vide)
- **Note** : Les marques « ... », « (×3) », « (×7) » sont de mise en forme, pas du texte source.
- **Livres Awzid** : Non trouve
- **Registre Awzid (registre/hadiths.json)** : absent
- **Statut** : `A_VERIFIER_REFERENT`

### Angoisse, tristesse et épreuve

#### DOU-ANG-01 — Dans la detresse (karb)

- **Moment** : En cas d'angoisse ou de grande difficulte.
- **Type** : hadith
- **Texte arabe** (copié de la source) :

<div dir="rtl" lang="ar">

لاَ إِلَهَ إِلاَّ اللَّهُ الْعَظِيمُ الْحَلِيمُ، لاَ إِلَهَ إِلاَّ اللَّهُ رَبُّ الْعَرْشِ الْعَظِيمِ، لاَ إِلَهَ إِلاَّ اللَّهُ رَبُّ السَّمَوَاتِ، وَرَبُّ الأَرْضِ، وَرَبُّ الْعَرْشِ الْكَرِيمِ

</div>

- **Texte copié depuis** : https://sunnah.com/bukhari:6346
- **Référence** : al-Bukhari 6346 (aussi Muslim 2730) — https://sunnah.com/bukhari:6346
- **Degré** : sahih — al-Bukhari (Sahih)
- **Traduction française publiée** : (vide)
- **Livres Awzid** : Occurrence : ado4 l14
- **Registre Awzid (registre/hadiths.json)** : HAD_BUK_06346
- **Statut** : `A_VERIFIER_REFERENT`

#### DOU-ANG-02 — La doua de Yunus (Dhu n-Nun)

- **Moment** : Dans toute difficulte.
- **Type** : hadith (texte coranique)
- **Coran** : 21:87 (passage « لَّآ إِلَٰهَ إِلَّآ أَنتَ سُبْحَٰنَكَ إِنِّى كُنتُ مِنَ ٱلظَّٰلِمِينَ » a prendre dans Tanzil) — texte à prendre dans Tanzil
- **Texte copié depuis** : https://sunnah.com/tirmidhi:3505
- **Référence** : at-Tirmidhi 3505 (merite) ; Coran 21:87 (texte) — https://sunnah.com/tirmidhi:3505
- **Degré** : sahih — Darussalam : sahih ; al-Albani : sahih (a confirmer)
- **Traduction française publiée** : (vide)
- **Note** : Texte coranique : afficher depuis Tanzil (fin du verset 21:87).
- **Livres Awzid** : Non trouve par mot-cle
- **Registre Awzid (registre/hadiths.json)** : HAD_TIR_03505
- **Statut** : `A_VERIFIER_REFERENT`

#### DOU-ANG-03 — Doua de l'angoisse : « C'est Ta misericorde que j'espere »

- **Moment** : En cas d'angoisse.
- **Type** : hadith
- **Texte arabe** (copié de la source) :

<div dir="rtl" lang="ar">

اللَّهُمَّ رَحْمَتَكَ أَرْجُو فَلاَ تَكِلْنِي إِلَى نَفْسِي طَرْفَةَ عَيْنٍ وَأَصْلِحْ لِي شَأْنِي كُلَّهُ لاَ إِلَهَ إِلاَّ أَنْتَ

</div>

- **Texte copié depuis** : https://sunnah.com/abudawud:5090
- **Référence** : Abu Dawud 5090 — https://sunnah.com/abudawud:5090
- **Degré** : hasan (chaine) — al-Albani : « حسن الإسناد »
- **Traduction française publiée** : (vide)
- **Livres Awzid** : Non trouve
- **Registre Awzid (registre/hadiths.json)** : absent
- **Statut** : `A_VERIFIER_REFERENT`

#### DOU-ANG-04 — Quand un malheur frappe

- **Moment** : Lors d'une epreuve, d'un deces, d'une perte.
- **Type** : hadith
- **Texte arabe** (copié de la source) :

<div dir="rtl" lang="ar">

إِنَّا لِلَّهِ وَإِنَّا إِلَيْهِ رَاجِعُونَ اللَّهُمَّ أْجُرْنِي فِي مُصِيبَتِي وَأَخْلِفْ لِي خَيْرًا مِنْهَا

</div>

- **Coran** : 2:156 (debut coranique) — texte à prendre dans Tanzil
- **Texte copié depuis** : https://sunnah.com/muslim:918a
- **Référence** : Muslim 918a — https://sunnah.com/muslim:918a
- **Degré** : sahih — Muslim (Sahih)
- **Traduction française publiée** : (vide)
- **Note** : La premiere phrase est 2:156. Beaucoup ne disent que « إِنَّا لِلَّهِ... » : le hadith ajoute la demande.
- **Livres Awzid** : Occurrences « انا لله وانا اليه راجعون » : ad4 l23 ; ad5 l09, l10, l13 ; ad7 l14 ; ado4 l13, l15 ; re5 l09, l12
- **Registre Awzid (registre/hadiths.json)** : HAD_MUS_00918
- **Statut** : `A_VERIFIER_REFERENT`

#### DOU-ANG-05 — Contre le souci et la tristesse

- **Moment** : A tout moment, notamment en cas de souci.
- **Type** : hadith
- **Texte arabe** (copié de la source) :

<div dir="rtl" lang="ar">

اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنَ الْهَمِّ وَالْحَزَنِ، وَالْعَجْزِ وَالْكَسَلِ، وَالْجُبْنِ وَالْبُخْلِ، وَضَلَعِ الدَّيْنِ، وَغَلَبَةِ الرِّجَالِ

</div>

- **Texte copié depuis** : https://sunnah.com/bukhari:6369
- **Référence** : al-Bukhari 6369 (al-Bukhari 6363 : « وَالْبُخْلِ وَالْجُبْنِ », ordre inverse) — https://sunnah.com/bukhari:6369
- **Degré** : sahih — al-Bukhari (Sahih)
- **Traduction française publiée** : (vide)
- **Livres Awzid** : Non trouve
- **Registre Awzid (registre/hadiths.json)** : HAD_BUK_06369
- **Statut** : `A_VERIFIER_REFERENT`

#### DOU-ANG-06 — Dans la detresse : « Allah, Allah est mon Seigneur »

- **Moment** : Dans la detresse.
- **Type** : hadith
- **Texte arabe** (copié de la source) :

<div dir="rtl" lang="ar">

اللَّهُ اللَّهُ رَبِّي لاَ أُشْرِكُ بِهِ شَيْئًا

</div>

- **Texte copié depuis** : https://sunnah.com/abudawud:1525
- **Référence** : Abu Dawud 1525 — https://sunnah.com/abudawud:1525
- **Degré** : sahih — al-Albani (sunnah.com)
- **Traduction française publiée** : (vide)
- **Note** : Enseignee par le Prophete a Asma' bint 'Umays.
- **Livres Awzid** : Non trouve
- **Registre Awzid (registre/hadiths.json)** : absent
- **Statut** : `A_VERIFIER_REFERENT`

#### DOU-ANG-07 — « Ô Vivant, ô Subsistant, par Ta misericorde j'implore secours »

- **Moment** : Quand une affaire inquiete.
- **Type** : hadith
- **Texte arabe** (copié de la source) :

<div dir="rtl" lang="ar">

يَا حَىُّ يَا قَيُّومُ بِرَحْمَتِكَ أَسْتَغِيثُ

</div>

- **Texte copié depuis** : https://sunnah.com/tirmidhi:3524
- **Référence** : at-Tirmidhi 3524 — https://sunnah.com/tirmidhi:3524
- **Degré** : hasan — Darussalam : hasan (sunnah.com) ; jugement d'al-Albani a confirmer
- **Traduction française publiée** : (vide)
- **Livres Awzid** : Non trouve
- **Registre Awzid (registre/hadiths.json)** : absent
- **Statut** : `A_VERIFIER_REFERENT`

#### DOU-ANG-08 — Doua du souci : « Ô Allah, je suis Ton serviteur, fils de Ton serviteur »

- **Moment** : En cas de souci ou de tristesse.
- **Type** : hadith
- **Texte arabe** (copié de la source) :

<div dir="rtl" lang="ar">

TEXTE A COPIER PAR LE REFERENT (sunnah.com n'a pas Ahmad 3712 ; dorar.net bloque l'acces automatique)

</div>

- **Référence** : Ahmad 3712 (aussi Ibn Hibban 972) — 
- **Degré** : sahih — al-Albani, as-Silsila as-Sahiha 199 (releve via recherche web : a confirmer) ; jugement de Shu'ayb al-Arna'ut non trouve
- **Traduction française publiée** : (vide)
- **Note** : Doua tres demandee. Ne pas l'afficher tant que le texte n'est pas copie d'une source fiable.
- **Livres Awzid** : Non verifie
- **Registre Awzid (registre/hadiths.json)** : absent
- **Statut** : `A_VERIFIER_REFERENT`

### Pour les parents

#### DOU-PRT-01 — « Seigneur, fais-leur misericorde comme ils m'ont eleve tout petit »

- **Moment** : Pour ses parents, a tout moment.
- **Type** : coran
- **Coran** : 17:24 (fin : « رَّبِّ ٱرْحَمْهُمَا كَمَا رَبَّيَانِى صَغِيرًا ») — texte à prendre dans Tanzil
- **Référence** : Coran 17:24 — https://quran.com/17/24
- **Degré** : Coran
- **Traduction française publiée** : (vide)
- **Note** : Fiche akh.f058 : deja citee avec la source 17:24.
- **Livres Awzid** : Occurrences : ad2 l17 ; ad7 l16, l20 ; ado1 l21 ; en1 l15, l17 ; en2 l04, l14, l15 ; en5 l22, l24 ; fiche akh.f058
- **Registre Awzid (registre/hadiths.json)** : coran.json
- **Statut** : `A_VERIFIER_REFERENT`

#### DOU-PRT-02 — Doua d'Ibrahim : « Seigneur, pardonne-moi ainsi qu'a mes parents »

- **Moment** : Pour soi, ses parents et les croyants.
- **Type** : coran
- **Coran** : 14:41 — texte à prendre dans Tanzil
- **Référence** : Coran 14:41 — https://quran.com/14/41
- **Degré** : Coran
- **Traduction française publiée** : (vide)
- **Note** : Le verset 14:40 (« رَبِّ ٱجْعَلْنِى مُقِيمَ ٱلصَّلَوٰةِ ») peut etre joint.
- **Livres Awzid** : Non verifie
- **Registre Awzid (registre/hadiths.json)** : coran.json
- **Statut** : `A_VERIFIER_REFERENT`

#### DOU-PRT-03 — Doua de Nuh : « Seigneur, pardonne-moi, a mes parents »

- **Moment** : Pour ses parents et les croyants.
- **Type** : coran
- **Coran** : 71:28 — texte à prendre dans Tanzil
- **Référence** : Coran 71:28 — https://quran.com/71/28
- **Degré** : Coran
- **Traduction française publiée** : (vide)
- **Note** : La fin du verset (contre les injustes) : decider si on l'affiche en entier.
- **Livres Awzid** : Non verifie
- **Registre Awzid (registre/hadiths.json)** : coran.json
- **Statut** : `A_VERIFIER_REFERENT`

#### DOU-PRT-04 — « Seigneur, inspire-moi de remercier Ton bienfait sur moi et sur mes parents »

- **Moment** : Gratitude pour soi et ses parents.
- **Type** : coran
- **Coran** : 46:15 (a partir de « رَبِّ أَوْزِعْنِىٓ ») ; voir aussi 27:19 — texte à prendre dans Tanzil
- **Référence** : Coran 46:15 — https://quran.com/46/15
- **Degré** : Coran
- **Traduction française publiée** : (vide)
- **Livres Awzid** : Non verifie
- **Registre Awzid (registre/hadiths.json)** : coran.json
- **Statut** : `A_VERIFIER_REFERENT`

### Pour le savoir

#### DOU-SAV-01 — Apres la priere de l'aube : « science utile, subsistance bonne, oeuvre acceptee »

- **Moment** : Apres le salam de la priere de l'aube.
- **Type** : hadith
- **Texte arabe** (copié de la source) :

<div dir="rtl" lang="ar">

اللَّهُمَّ إِنِّي أَسْأَلُكَ عِلْمًا نَافِعًا، وَرِزْقًا طَيِّبًا، وَعَمَلاً مُتَقَبَّلاً

</div>

- **Texte copié depuis** : https://sunnah.com/ibnmajah:925
- **Référence** : Ibn Majah 925 — https://sunnah.com/ibnmajah:925
- **Degré** : sahih — Darussalam : sahih (sunnah.com) ; al-Albani : sahih (a confirmer)
- **Traduction française publiée** : (vide)
- **Livres Awzid** : Non trouve
- **Registre Awzid (registre/hadiths.json)** : absent
- **Statut** : `A_VERIFIER_REFERENT`

#### DOU-SAV-02 — Refuge contre une science inutile

- **Moment** : A tout moment.
- **Type** : hadith
- **Texte arabe** (copié de la source) :

<div dir="rtl" lang="ar">

اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنْ عِلْمٍ لاَ يَنْفَعُ وَمِنْ قَلْبٍ لاَ يَخْشَعُ وَمِنْ نَفْسٍ لاَ تَشْبَعُ وَمِنْ دَعْوَةٍ لاَ يُسْتَجَابُ لَهَا

</div>

- **Texte copié depuis** : https://sunnah.com/muslim:2722
- **Référence** : Muslim 2722 (fin du hadith) — https://sunnah.com/muslim:2722
- **Degré** : sahih — Muslim (Sahih)
- **Traduction française publiée** : (vide)
- **Note** : Extrait de la fin d'une doua plus longue (le debut : « اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنَ الْعَجْزِ وَالْكَسَلِ... آتِ نَفْسِي تَقْوَاهَا... »). Au referent de choisir extrait ou texte complet.
- **Livres Awzid** : Non trouve
- **Registre Awzid (registre/hadiths.json)** : HAD_MUS_02722
- **Statut** : `A_VERIFIER_REFERENT`

#### DOU-SAV-03 — « Seigneur, accrois-moi en science »

- **Moment** : Avant d'etudier, a tout moment.
- **Type** : coran
- **Coran** : 20:114 (fin du verset : « رَّبِّ زِدْنِى عِلْمًا ») — texte à prendre dans Tanzil
- **Référence** : Coran 20:114 — https://quran.com/20/114
- **Degré** : Coran
- **Traduction française publiée** : (vide)
- **Note** : Fiche akh.f082 : verset deja cite.
- **Livres Awzid** : Occurrences : ad10 l12, l15, l24, l25 ; ad6 l21 ; ad9 l23 ; ado1 l01 ; ado2 l11, l12 ; en2 l01 ; en3 l18, l19 ; fiche akh.f082
- **Registre Awzid (registre/hadiths.json)** : coran.json
- **Statut** : `A_VERIFIER_REFERENT`

### Repentir et pardon

#### DOU-PAR-01 — Le maitre de la demande de pardon (sayyid al-istighfar)

- **Moment** : Le matin et le soir.
- **Type** : hadith
- **Texte arabe** (copié de la source) :

<div dir="rtl" lang="ar">

اللَّهُمَّ أَنْتَ رَبِّي، لاَ إِلَهَ إِلاَّ أَنْتَ، خَلَقْتَنِي وَأَنَا عَبْدُكَ، وَأَنَا عَلَى عَهْدِكَ وَوَعْدِكَ مَا اسْتَطَعْتُ، أَعُوذُ بِكَ مِنْ شَرِّ مَا صَنَعْتُ، أَبُوءُ لَكَ بِنِعْمَتِكَ عَلَىَّ وَأَبُوءُ لَكَ بِذَنْبِي، فَاغْفِرْ لِي، فَإِنَّهُ لاَ يَغْفِرُ الذُّنُوبَ إِلاَّ أَنْتَ

</div>

- **Texte copié depuis** : https://sunnah.com/bukhari:6306
- **Référence** : al-Bukhari 6306 — https://sunnah.com/bukhari:6306
- **Degré** : sahih — al-Bukhari (Sahih)
- **Traduction française publiée** : (vide)
- **Livres Awzid** : Non trouve par mot-cle
- **Registre Awzid (registre/hadiths.json)** : HAD_BUK_06306
- **Statut** : `A_VERIFIER_REFERENT`

#### DOU-PAR-02 — Doua enseignee a Abu Bakr : « J'ai commis envers moi-meme une grande injustice »

- **Moment** : Dans la priere (avant le salam) et a tout moment.
- **Type** : hadith
- **Texte arabe** (copié de la source) :

<div dir="rtl" lang="ar">

اللَّهُمَّ إِنِّي ظَلَمْتُ نَفْسِي ظُلْمًا كَثِيرًا، وَلاَ يَغْفِرُ الذُّنُوبَ إِلاَّ أَنْتَ، فَاغْفِرْ لِي مَغْفِرَةً مِنْ عِنْدِكَ، وَارْحَمْنِي، إِنَّكَ أَنْتَ الْغَفُورُ الرَّحِيمُ

</div>

- **Texte copié depuis** : https://sunnah.com/bukhari:6326
- **Référence** : al-Bukhari 834 ; al-Bukhari 6326 — https://sunnah.com/bukhari:834
- **Degré** : sahih — al-Bukhari (Sahih)
- **Traduction française publiée** : (vide)
- **Note** : Une autre voie (Muslim 2705) porte « كَبِيرًا » au lieu de « كَثِيرًا » : les deux sont rapportees.
- **Livres Awzid** : Non trouve
- **Registre Awzid (registre/hadiths.json)** : absent
- **Statut** : `A_VERIFIER_REFERENT`

#### DOU-PAR-03 — « Je demande pardon a Allah, le Vivant, le Subsistant »

- **Moment** : A tout moment.
- **Type** : hadith
- **Texte arabe** (copié de la source) :

<div dir="rtl" lang="ar">

أَسْتَغْفِرُ اللَّهَ الَّذِي لاَ إِلَهَ إِلاَّ هُوَ الْحَىُّ الْقَيُّومُ وَأَتُوبُ إِلَيْهِ

</div>

- **Texte copié depuis** : https://sunnah.com/abudawud:1517
- **Référence** : Abu Dawud 1517 — https://sunnah.com/abudawud:1517
- **Degré** : sahih — al-Albani (sunnah.com)
- **Traduction française publiée** : (vide)
- **Note** : Forme populaire : « أَسْتَغْفِرُ اللَّهَ الْعَظِيمَ الَّذِي... » : « الْعَظِيمَ » n'est pas dans Abu Dawud 1517 (sunnah.com). Il figure dans d'autres voies (at-Tirmidhi 3577) : a verifier.
- **Livres Awzid** : « استغفر الله » tres frequent (41 fichiers) : sens non verifie
- **Registre Awzid (registre/hadiths.json)** : absent
- **Statut** : `A_VERIFIER_REFERENT`

#### DOU-PAR-04 — « Seigneur, pardonne-moi et accepte mon repentir »

- **Moment** : Le Prophete la disait cent fois dans une meme assemblee.
- **Type** : hadith
- **Texte arabe** (copié de la source) :

<div dir="rtl" lang="ar">

رَبِّ اغْفِرْ لِي وَتُبْ عَلَىَّ إِنَّكَ أَنْتَ التَّوَّابُ الرَّحِيمُ

</div>

- **Texte copié depuis** : https://sunnah.com/abudawud:1516
- **Référence** : Abu Dawud 1516 ; at-Tirmidhi 3434 (fin « التَّوَّابُ الْغَفُورُ ») — https://sunnah.com/abudawud:1516
- **Degré** : sahih — al-Albani (Abu Dawud) ; Darussalam : sahih (Tirmidhi 3434)
- **Traduction française publiée** : (vide)
- **Note** : Deux fins rapportees : « التَّوَّابُ الرَّحِيمُ » (Abu Dawud) et « التَّوَّابُ الْغَفُورُ » (at-Tirmidhi).
- **Livres Awzid** : « التواب الرحيم » : ad7 l06 (sens non verifie)
- **Registre Awzid (registre/hadiths.json)** : absent
- **Statut** : `A_VERIFIER_REFERENT`

#### DOU-PAR-05 — « Ô Allah, Tu es Celui qui efface, Tu aimes effacer »

- **Moment** : Surtout pendant les nuits du Destin (Laylat al-Qadr).
- **Type** : hadith
- **Texte arabe** (copié de la source) :

<div dir="rtl" lang="ar">

اللَّهُمَّ إِنَّكَ عَفُوٌّ تُحِبُّ الْعَفْوَ فَاعْفُ عَنِّي

</div>

- **Texte copié depuis** : https://sunnah.com/ibnmajah:3850
- **Référence** : Ibn Majah 3850 ; at-Tirmidhi 3513 — https://sunnah.com/ibnmajah:3850
- **Degré** : sahih — Darussalam : sahih ; at-Tirmidhi : hasan sahih (a confirmer) ; al-Albani : sahih (a confirmer)
- **Traduction française publiée** : (vide)
- **Note** : ATTENTION : sunnah.com affiche pour at-Tirmidhi 3513 « عَفُوٌّ كَرِيمٌ ». Le mot « كَرِيمٌ » ne figure pas dans la plupart des manuscrits (islamqa 260806, d'apres les editeurs du Musnad) : retenir la forme d'Ibn Majah 3850, sans « كَرِيمٌ ».
- **Livres Awzid** : « تحب العفو » : ad3 l08, l10 ; ado2 l07, l10 ; re3 l22, l26, l27 ; re5 l05 — verifier si « كريم » y figure
- **Registre Awzid (registre/hadiths.json)** : HAD_TIR_03513, HAD_IBM_03850
- **Statut** : `A_VERIFIER_REFERENT`

### Éternuement

#### DOU-ETE-01 — L'eternuement : ce que dit chacun

- **Moment** : Celui qui eternue : « الْحَمْدُ لِلَّهِ » ; celui qui l'entend : « يَرْحَمُكَ اللَّهُ » ; reponse : « يَهْدِيكُمُ اللَّهُ وَيُصْلِحُ بَالَكُمْ ».
- **Type** : hadith
- **Texte arabe** (copié de la source) :

<div dir="rtl" lang="ar">

الْحَمْدُ لِلَّهِ ... يَرْحَمُكَ اللَّهُ ... يَهْدِيكُمُ اللَّهُ وَيُصْلِحُ بَالَكُمْ

</div>

- **Texte copié depuis** : https://sunnah.com/bukhari:6224
- **Référence** : al-Bukhari 6224 ; variante Abu Dawud 5033 : « الْحَمْدُ لِلَّهِ عَلَى كُلِّ حَالٍ » (al-Albani : sahih) — https://sunnah.com/bukhari:6224
- **Degré** : sahih — al-Bukhari (Sahih) ; al-Albani (Abu Dawud 5033)
- **Traduction française publiée** : (vide)
- **Note** : Les « ... » separent les trois paroles (mise en forme). Fiche akh.f024 : conforme.
- **Livres Awzid** : Occurrences : ad4 l21 ; ad8 l14 ; en1 l18, l22 ; re2 l25, l26, l27 ; fiche akh.f024
- **Registre Awzid (registre/hadiths.json)** : HAD_BUK_06224
- **Statut** : `A_VERIFIER_REFERENT`

### Douas du Coran

#### DOU-COR-01 — « Seigneur, donne-nous belle part ici-bas et dans l'au-dela »

- **Moment** : A tout moment ; la doua la plus frequente du Prophete (al-Bukhari 6389).
- **Type** : coran
- **Coran** : 2:201 — texte à prendre dans Tanzil
- **Référence** : Coran 2:201 — https://quran.com/2/201
- **Degré** : Coran
- **Traduction française publiée** : (vide)
- **Note** : Afficher a partir de « رَبَّنَآ ».
- **Livres Awzid** : Occurrences : en5 l12 ; re4 l09
- **Registre Awzid (registre/hadiths.json)** : coran.json
- **Statut** : `A_VERIFIER_REFERENT`

#### DOU-COR-02 — « Seigneur, ne nous charge pas au-dela de nos forces »

- **Moment** : A tout moment ; fin de sourate al-Baqara.
- **Type** : coran
- **Coran** : 2:286 (a partir de « رَبَّنَا لَا تُؤَاخِذْنَآ ») — texte à prendre dans Tanzil
- **Référence** : Coran 2:286 — https://quran.com/2/286
- **Degré** : Coran
- **Traduction française publiée** : (vide)
- **Livres Awzid** : Non verifie
- **Registre Awzid (registre/hadiths.json)** : coran.json
- **Statut** : `A_VERIFIER_REFERENT`

#### DOU-COR-03 — « Seigneur, ne fais pas devier nos coeurs »

- **Moment** : A tout moment.
- **Type** : coran
- **Coran** : 3:8 — texte à prendre dans Tanzil
- **Référence** : Coran 3:8 — https://quran.com/3/8
- **Degré** : Coran
- **Traduction française publiée** : (vide)
- **Livres Awzid** : Non verifie
- **Registre Awzid (registre/hadiths.json)** : coran.json
- **Statut** : `A_VERIFIER_REFERENT`

#### DOU-COR-04 — Doua d'Adam et Hawwa' : « Seigneur, nous nous sommes fait du tort »

- **Moment** : Repentir.
- **Type** : coran
- **Coran** : 7:23 — texte à prendre dans Tanzil
- **Référence** : Coran 7:23 — https://quran.com/7/23
- **Degré** : Coran
- **Traduction française publiée** : (vide)
- **Livres Awzid** : Non verifie
- **Registre Awzid (registre/hadiths.json)** : coran.json
- **Statut** : `A_VERIFIER_REFERENT`

#### DOU-COR-05 — « Seigneur, donne-nous en nos epouses et nos descendants la joie des yeux »

- **Moment** : Pour la famille.
- **Type** : coran
- **Coran** : 25:74 — texte à prendre dans Tanzil
- **Référence** : Coran 25:74 — https://quran.com/25/74
- **Degré** : Coran
- **Traduction française publiée** : (vide)
- **Livres Awzid** : Non verifie
- **Registre Awzid (registre/hadiths.json)** : coran.json
- **Statut** : `A_VERIFIER_REFERENT`

#### DOU-COR-06 — Doua de Musa : « Seigneur, ouvre-moi ma poitrine »

- **Moment** : Avant de parler, d'etudier, d'un examen.
- **Type** : coran
- **Coran** : 20:25-28 — texte à prendre dans Tanzil
- **Référence** : Coran 20:25-28 — https://quran.com/20/25-28
- **Degré** : Coran
- **Traduction française publiée** : (vide)
- **Note** : Usage « avant un examen » : coutume, pas une sunna precise ; a formuler avec prudence.
- **Livres Awzid** : Occurrences : ad9 l06 ; en5 l23, l25
- **Registre Awzid (registre/hadiths.json)** : coran.json
- **Statut** : `A_VERIFIER_REFERENT`

#### DOU-COR-07 — Doua des gens de la caverne

- **Moment** : Pour demander la bonne direction dans une affaire.
- **Type** : coran
- **Coran** : 18:10 (a partir de « رَبَّنَآ ءَاتِنَا ») — texte à prendre dans Tanzil
- **Référence** : Coran 18:10 — https://quran.com/18/10
- **Degré** : Coran
- **Traduction française publiée** : (vide)
- **Livres Awzid** : Non verifie
- **Registre Awzid (registre/hadiths.json)** : coran.json
- **Statut** : `A_VERIFIER_REFERENT`

#### DOU-COR-08 — « Seigneur, pardonne-nous ainsi qu'a nos freres qui nous ont precedes dans la foi »

- **Moment** : Pour les croyants.
- **Type** : coran
- **Coran** : 59:10 (a partir de « رَبَّنَا ٱغْفِرْ لَنَا ») — texte à prendre dans Tanzil
- **Référence** : Coran 59:10 — https://quran.com/59/10
- **Degré** : Coran
- **Traduction française publiée** : (vide)
- **Livres Awzid** : Non verifie
- **Registre Awzid (registre/hadiths.json)** : coran.json
- **Statut** : `A_VERIFIER_REFERENT`

#### DOU-COR-09 — Doua d'Ibrahim et Isma'il : « Seigneur, accepte ceci de notre part »

- **Moment** : Apres une bonne oeuvre.
- **Type** : coran
- **Coran** : 2:127 (a partir de « رَبَّنَا تَقَبَّلْ مِنَّآ ») — texte à prendre dans Tanzil
- **Référence** : Coran 2:127 — https://quran.com/2/127
- **Degré** : Coran
- **Traduction française publiée** : (vide)
- **Livres Awzid** : Non verifie
- **Registre Awzid (registre/hadiths.json)** : coran.json
- **Statut** : `A_VERIFIER_REFERENT`

#### DOU-COR-10 — « Seigneur, pardonne et fais misericorde »

- **Moment** : A tout moment.
- **Type** : coran
- **Coran** : 23:118 — texte à prendre dans Tanzil
- **Référence** : Coran 23:118 — https://quran.com/23/118
- **Degré** : Coran
- **Traduction française publiée** : (vide)
- **Livres Awzid** : Non verifie
- **Registre Awzid (registre/hadiths.json)** : coran.json
- **Statut** : `A_VERIFIER_REFERENT`

## 4. Douas écartées

### ECA-01 — Abu Dawud 5096

<div dir="rtl" lang="ar">

اللَّهُمَّ إِنِّي أَسْأَلُكَ خَيْرَ الْمَوْلِجِ وَخَيْرَ الْمَخْرَجِ بِسْمِ اللَّهِ وَلَجْنَا وَبِسْمِ اللَّهِ خَرَجْنَا وَعَلَى اللَّهِ رَبِّنَا تَوَكَّلْنَا

</div>

- **Source** : https://sunnah.com/abudawud:5096
- **Raison** : Da'if selon al-Albani (sunnah.com). Tres repandue pour l'entree a la maison : la remplacer par la simple mention d'Allah (Muslim 2018).

### ECA-02 — Ibn Majah 301

<div dir="rtl" lang="ar">

الْحَمْدُ لِلَّهِ الَّذِي أَذْهَبَ عَنِّي الأَذَى وَعَافَانِي

</div>

- **Source** : https://sunnah.com/ibnmajah:301
- **Raison** : Da'if selon Darussalam (sunnah.com). Souvent ajoutee apres « غُفْرَانَكَ ».

### ECA-03 — at-Tirmidhi 606

<div dir="rtl" lang="ar">

سَتْرُ مَا بَيْنَ أَعْيُنِ الْجِنِّ وَعَوْرَاتِ بَنِي آدَمَ إِذَا دَخَلَ أَحَدُهُمُ الْخَلاَءَ أَنْ يَقُولَ بِسْمِ اللَّهِ

</div>

- **Source** : https://sunnah.com/tirmidhi:606
- **Raison** : At-Tirmidhi : « gharib, chaine pas forte » ; Darussalam : da'if. Certains savants le renforcent par d'autres voies : a trancher par le referent (dire « بِسْمِ اللَّهِ » avant les toilettes est par ailleurs repandu chez les fuqaha').

### ECA-04 — at-Tirmidhi 3450

<div dir="rtl" lang="ar">

اللَّهُمَّ لاَ تَقْتُلْنَا بِغَضَبِكَ وَلاَ تُهْلِكْنَا بِعَذَابِكَ وَعَافِنَا قَبْلَ ذَلِكَ

</div>

- **Source** : https://sunnah.com/tirmidhi:3450
- **Raison** : Da'if selon Darussalam (sunnah.com). Doua populaire pour le tonnerre ; remplacee par la parole d'Ibn az-Zubayr (Muwatta').

### ECA-05 — Ibn Majah 3558

<div dir="rtl" lang="ar">

الْبَسْ جَدِيدًا وَعِشْ حَمِيدًا وَمُتْ شَهِيدًا

</div>

- **Source** : https://sunnah.com/ibnmajah:3558
- **Raison** : Da'if selon Darussalam (sunnah.com). Certains (al-Albani) l'ont juge authentique selon des sources secondaires : divergence a trancher, ecartee par prudence.

### ECA-06 — Ibn as-Sunni et autres

<div dir="rtl" lang="ar">

[INDICATIF, non copie d'une source] اللَّهُمَّ أَنْتَ حَسَّنْتَ خَلْقِي فَحَسِّنْ خُلُقِي

</div>

- **Source** : https://islamqa.info/ar/answers/239755
- **Raison** : Lien avec le miroir juge faible (al-Albani, Irwa' al-Ghalil 74, selon islamqa). La phrase « اللَّهُمَّ أَحْسَنْتَ خَلْقِي فَأَحْسِنْ خُلُقِي » sans lien avec le miroir est rapportee par Ahmad (al-Albani : sahih, Sahih al-Jami' 1307, selon islamqa) : texte a copier depuis une source primaire si on veut l'ajouter. Pas de doua authentique du miroir.

### ECA-07 — at-Tirmidhi 3599 ; Ibn Majah 251

<div dir="rtl" lang="ar">

اللَّهُمَّ انْفَعْنِي بِمَا عَلَّمْتَنِي وَعَلِّمْنِي مَا يَنْفَعُنِي وَزِدْنِي عِلْمًا

</div>

- **Source** : https://sunnah.com/ibnmajah:251
- **Raison** : Da'if selon Darussalam (les deux) ; chaine avec Musa ibn 'Ubayda ar-Rabadhi (faible, selon Shu'ayb al-Arna'ut via dorar) ; al-Albani l'aurait juge sahih (Sahih Ibn Majah, selon kalemtayeb). Divergence : ecartee en attendant le referent.

### ECA-08 — Ibn as-Sunni, 'Amal al-yawm wa l-layla (non verifie)

<div dir="rtl" lang="ar">

[INDICATIF, non copie d'une source] اللَّهُمَّ بَارِكْ لَنَا فِيمَا رَزَقْتَنَا وَقِنَا عَذَابَ النَّارِ

</div>

- **Source** : (aucune URL)
- **Raison** : Non trouvee sur sunnah.com ; reputee faible. Tres repandue avant le repas : a la place, « بِسْمِ اللَّهِ ».

### ECA-09 — Ibn Majah 3885

<div dir="rtl" lang="ar">

بِسْمِ اللَّهِ لاَ حَوْلَ وَلاَ قُوَّةَ إِلاَّ بِاللَّهِ التُّكْلاَنُ عَلَى اللَّهِ

</div>

- **Source** : https://sunnah.com/ibnmajah:3885
- **Raison** : Da'if selon Darussalam (variante de la doua de sortie).

### ECA-10 — at-Tirmidhi 3427

<div dir="rtl" lang="ar">

(variante plurielle) بِسْمِ اللَّهِ تَوَكَّلْتُ عَلَى اللَّهِ اللَّهُمَّ إِنَّا نَعُوذُ بِكَ مِنْ أَنْ نَزِلَّ أَوْ نَضِلَّ...

</div>

- **Source** : https://sunnah.com/tirmidhi:3427
- **Raison** : Da'if selon Darussalam ; la forme d'Abu Dawud 5094 (al-Albani : sahih) est retenue a la place.

## 5. Présence dans les livres et l'application Awzid

Recherche en lecture seule dans `Documents\Awzid-sauvegarde\awform\data` (fichiers `.js` des livres, fiches `.json` du module akhlāq), sur le texte sans voyelles. Une occurrence signifie que **le mot-clé apparaît** dans la leçon : le contexte n'a pas été relu. Les codes (en1 l19, re1 l23…) désignent livre et leçon.

- Fiches akhlāq qui contiennent déjà une doua (champ `dire`) : akh.f001 (toilettes), f009 (habit), f024 (éternuement), f030 (oubli de la basmala), f031 (après le repas), f038 (mosquée), f046 et f050 (sommeil, réveil), f058 (parents, 17:24), f082 (20:114), f102 (voyage), f103 (malade). Elles sont conformes aux textes retenus, avec deux points à signaler :
  - **akh.f102** : « آيِبُونَ تَائِبُونَ عَابِدُونَ سَاجِدُونَ لِرَبِّنَا حَامِدُونَ » est la forme d'al-Bukhārī 1797 (retour de Ḥajj, ʿUmra ou expédition), pas celle de Muslim 1342 (sans « سَاجِدُونَ »). Préciser la source.
  - Les champs `src` des entrées `dire` sont vides pour les hadiths (seuls les versets ont une source) : à relier au registre `HAD_...`.
- Registre `awform\registre\hadiths.json` : 31 des douas retenues renvoient à un hadith y figurent déjà (identifiants dans chaque fiche). Les autres sont à y ajouter après validation.
- Douas absentes des livres (par mot-clé) : sortie de la maison, « اللَّهُمَّ أَسْلَمْتُ وَجْهِي », sayyid al-istighfār, vent, miroir, « ظَلَمْتُ نَفْسِي ظُلْمًا كَثِيرًا », science utile, doua de Yūnus (aucune occurrence du mot-clé testé).

## 6. Points à trancher par le référent

1. **DOU-ABL-02** (ajout « اللَّهُمَّ اجْعَلْنِي مِنَ التَّوَّابِينَ… ») : ṣaḥīḥ selon al-Albānī, ḍaʿīf selon Darussalam, chaîne troublée selon at-Tirmidhī.
2. **DOU-MAI-01** (sortie de la maison) : ṣaḥīḥ selon al-Albānī (Abū Dāwūd 5095), ḍaʿīf selon Darussalam (voie d'at-Tirmidhī 3426).
3. **ECA-03** (« بِسْمِ اللَّهِ » avant les toilettes) et **ECA-07** (« اللَّهُمَّ انْفَعْنِي بِمَا عَلَّمْتَنِي ») : écartées par prudence, mais jugées acceptables par d'autres savants.
4. **DOU-PAR-05** : retenir la forme sans « كَرِيمٌ » (sunnah.com l'affiche pour at-Tirmidhī 3513).
5. **DOU-PLU-01** : afficher « صَيِّبًا نَافِعًا » (al-Bukhārī) ou « اللَّهُمَّ صَيِّبًا نَافِعًا » (autres recueils, non vérifié).
6. **DOU-PLU-05** (tonnerre) : parole de Compagnon rapportée dans le *Muwaṭṭaʾ* de Mālik ; à présenter comme telle.
7. **DOU-ANG-08** (« اللَّهُمَّ إِنِّي عَبْدُكَ… », Aḥmad 3712) : texte à copier depuis une source primaire. Le chercheur n'a pas pu y accéder.
8. Préciser pour les ajouts de répétition : « trois fois » de DOU-SOM-05 n'est pas retenu par al-Albānī.
