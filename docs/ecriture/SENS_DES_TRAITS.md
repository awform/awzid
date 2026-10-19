# Sens et ordre des traits des lettres arabes (naskh scolaire, au stylo)

Dossier de recherche pour les vidéos vivantes du livre Adultes niveau 1 (ad1).
Date : 19/10/2026. Statut : **dossier à trancher** par le référent (chef de projet).
Données réutilisables pour l'animation : `traits_lettres.json` (même dossier).

Public visé : adultes débutants qui écrivent **au stylo**. Le dossier privilégie donc l'usage scolaire au stylo. La calligraphie au calame n'est citée que pour expliquer les écarts.

---

## 0. En bref : les règles proposées

1. On écrit de droite à gauche. Chaque groupe de lettres attachées se trace d'un seul geste, sans lever le stylo. On ne lève le stylo qu'après une lettre qui ne s'attache pas (ا د ذ ر ز و) ou à la fin du mot. *(AB)*
2. On trace d'abord le corps, et seulement ensuite les traits « ajoutés » : points, barre de ك, hampe de ط et ظ, hamza, madda. On les pose **après le squelette du mot entier**, de droite à gauche. Les voyelles et les autres signes viennent en troisième étape. *(AB explicite ; BSE l'observe chez les scripteurs réels.)* Pour une lettre seule, on trace le corps puis les points.
3. Une hampe qui commence un trait se trace de haut en bas (ا seul, ل et ك au début, hampe de ط). Une hampe atteinte par une liaison se trace en montant depuis la ligne, puis en redescendant sur le même trait (ـل ـك ـد, dent médiane). Exception : ـا final monte et s'arrête. *(AB, SK)*
4. Lettres à dent (ب ت ث ن ي) :
   - au début, on part du haut de la dent, on descend, puis on file vers la gauche ;
   - au milieu, on arrive par la ligne, on monte au sommet de la dent et on redescend sur le même trait. *(SK, AB)*
5. Les boucles suivent le sens qui prolonge le mouvement sans à-coup :
   - tête de و ف ق, boucle de ص ض ط ظ, م seule ou initiale : **sens horaire** ;
   - م médiane et finale, ـه et ـة après liaison : **sens antihoraire** ;
   - tête de ع et de ء : en « c », sens antihoraire ;
   - grandes cuvettes sous la ligne : celles de ن ي ق ل س ص s'ouvrent vers le haut (sens horaire) ; celles de ج ح خ ع غ s'ouvrent vers la droite (sens antihoraire). *(AB, SK, détail §2.7)*
6. ج ح خ :
   - seuls ou au début, le petit trait du haut part de sa pointe gauche, va **vers la droite**, puis le stylo repart en diagonale vers le bas et la gauche ;
   - au milieu et à la fin, la liaison arrive par le haut et le trait du haut se fait de droite à gauche. *(SK, AB)*
7. ك : seule ou finale, la hampe se trace de haut en bas puis la base vers la gauche, d'un seul geste ; le petit signe intérieur vient après. Au début et au milieu, on trace le corps, puis la barre oblique après le mot. *(AB)*
8. Hamza : on trace d'abord le support (ا, و, dent), puis la hamza en dernier. Elle se trace d'un trait : un petit « c », puis le trait de base. *(AB, livre)*
9. لا : deux possibilités sont attestées. AB enseigne deux traits, avec levée du stylo. Le livre décrit un seul mouvement. Le référent doit choisir (§4).

---

## 1. Sources

| Code | Référence | Nature | Consultée ? | Ce qu'elle dit vraiment | Fiabilité |
|---|---|---|---|---|---|
| **AB** | Kristen Brustad, Mahmoud Al-Batal, Abbas Al-Tonsi, *Alif Baa: Introduction to Arabic Letters and Sounds*, Georgetown University Press. Texte des unités 1 à 10 en ligne (Middlebury College) : `https://cr.middlebury.edu/Arabic%20Resources/vocimages/arabic%20data%20source/Alif%20Baa%20Publication%20Version/` (fichiers « abj. intro & 1 », « abj. 2,3 », « abj. 4, 5 », « abj. 6 », « abj. 7 »…) | Manuel universitaire de référence pour non-arabophones (filière Al-Kitaab). Écriture **manuscrite au stylo** (forme courante), comparée à l'imprimé. | Oui, texte intégral. Les caractères arabes sont abîmés dans l'extraction ; on identifie les lettres par le contexte. La version en ligne semble être une ancienne édition (la date n'est pas affichée). | Consignes verbales lettre par lettre : départ, sens, levées de stylo, points en dernier, voyelles en 3e étape. Citations au §3. | **Haute** pour le stylo. C'est la seule source verbale complète consultée. |
| **SK** | Mamoun Sakkal, *Arabic Alphabet Chart in Naskh Style: With Teaching Notes*, 2016 : `https://www.sakkal.com/articles/sakkal_arabic_alphabet.html`. Image : `…/sakkal_arabic_alphabet_chart.jpg` | Calligraphe et typographe (auteur de la police Sakkal Majalla). Tableau de flèches par lettre et par forme, **naskh au calame** (biseau à 70°). | Oui. Notes lues en texte ; tableau examiné en image agrandie. L'image ne fait que 439 × 1117 px : les grands tracés sont lisibles, pas le sens des petites boucles. | « Write from right to left », « Follow the direction of the arrows writing in a clockwise direction in general », « Arrows with dot at beginning of line indicate beginning of strokes », « Remove your pen after each stroke ». Note : ج ح خ (et en calligraphie م ي) peuvent se lier à la lettre précédente « from above ». | **Haute** pour le naskh. Moyenne pour le stylo (gestes de calame). Lecture partielle à cause de la résolution. |
| **BSE** | F. Biadsy, J. El-Sana, R. Saabni, brevet US 8 615 131 B2, *Online Arabic handwriting recognition* : `https://patents.google.com/patent/US8615131`. Mêmes travaux : Columbia / Ben-Gourion 2006. | Recherche en reconnaissance d'écriture manuscrite en ligne : observation de scripteurs réels. | Oui (premiers 100 000 caractères). | Points et petits traits = « delayed strokes, since they are usually drawn last in a handwritten word » ; « Delayed strokes are typically written after the word-part body ». Ils peuvent toutefois venir avant ou pendant. | **Haute** pour l'usage réel. Elle décrit ce que font les gens, ce n'est pas une prescription. |
| **E3** | Samar Bani Bakkar, « Règles d'enseignement des lettres du naskh », e3arabi.com, mis à jour le 07/03/2021 | Article web de vulgarisation calligraphique | Oui | Décompose les lettres. Pour ص, la première partie est une courbe qui monte « de la gauche vers la droite ». | Faible. Sert seulement à corroborer. |
| **Livre** | ad1, `ecriture.conseil_fr` des leçons 1 à 16 | Référence interne | Oui | Voir §5 : la plupart des consignes concordent, trois sont à revoir. | — |

**Sources recherchées mais non consultables (rien n'en est tiré)**
- Jane Wightwick et Mahmoud Gaafar, *Mastering Arabic Script: A Guide to Handwriting* (Palgrave Macmillan, ISBN 9781403941107). Les notices indiquent qu'il enseigne l'écriture courante des adultes (ruqʿa) en la comparant au naskh. Contenu non accessible en ligne.
- Mustafa Jaʿfar, *Arabic Calligraphy: Naskh Script for Beginners* (British Museum Press, 2002, 32 p., guide « stroke-by-stroke »). Contenu non accessible ; l'article de Design Week renvoie une erreur 403.
- Hāshim Muḥammad (al-Baghdādī), *Qawāʿid al-khaṭṭ al-ʿarabī*. Seule la notice de catalogue a été trouvée (Téhéran, Nāṣir Khusraw, 1961, 64 p.). Je n'ai pas pu vérifier si l'ouvrage contient des flèches.
- Manuels scolaires officiels (Arabie saoudite, Égypte, Maroc, Émirats) : aucun texte consultable trouvé. Leurs flèches sont dans des images, non vérifiées. **Aucune affirmation de ce dossier ne repose sur eux.**
- Cambridge AMES, « Script for future students » et « Arabic script worksheet » : erreur 404. Un extrait indexé indique seulement que Cambridge enseigne d'emblée la forme manuscrite et recommande *Mastering Arabic Script*.
- Alukah, série « Apprendre à écrire la lettre… » (auteur « ʿArab al-Qurʾān », 2014) : le contenu est dans des PDF non lus.

**Limite à retenir** : le consensus fort ne repose que sur **deux sources indépendantes de bonne qualité** (AB pour le stylo, SK pour le naskh), plus BSE pour l'ordre des points. C'est solide pour les grandes règles, mais insuffisant pour les détails fins des boucles. Avant publication, la relecture d'un enseignant d'écriture arabe reste nécessaire, comme le prévoit le projet.

---

## 2. Règles générales

### 2.1 Sens d'écriture et levées de stylo
- De droite à gauche (AB, SK). Consensus fort.
- Groupe attaché d'un seul geste : « do not lift the pen or pencil from the page until you get to a natural break with a nonconnecting letter » (AB). Consensus fort.
- SK (calame) lève la plume à chaque trait. C'est propre à la calligraphie et ne s'applique pas au stylo.

### 2.2 Corps avant les points ; moment où l'on pose les points
- AB : « When writing words in Arabic, dots are written last » ; « do not stop to dot the letters until you have finished the skeletal structure of the entire word ». Pour la barre de ك et la hampe de ط : « After you finish writing the skeleton of the word, go back and… » ; « Do not stop to write the downstroke until you have finished writing the body of the word ».
- BSE : les points se placent après le corps de la *partie de mot*, c'est-à-dire du groupe attaché. Ils sont « usually drawn last in a handwritten word ».
- **Proposition** :
  - lettre seule : corps, puis points ;
  - mot : squelette du mot entier, puis points et traits ajoutés **de droite à gauche**, puis voyelles, chadda et soukoun (AB : « Writing vowels is the third and final step ») ;
  - on tolère que l'élève pointe après chaque groupe attaché.
  
  Consensus fort. Le livre (l01, l10, l12, l13) est conforme.
- Forme des points :
  - au stylo, un point est une petite touche ;
  - AB signale qu'en écriture courante, deux points deviennent souvent un petit trait et trois points un petit chevron (^). Les modèles du cahier restent en naskh, avec des points séparés ; la forme courante est tolérée chez l'élève ;
  - ordre de deux ou trois points (droite puis gauche ; rangée du bas puis sommet pour ث ش) : **non sourcé**, simple convention du sens d'écriture. Enjeu faible.

### 2.3 Hampes (ا ل ك ط ظ)
- ا seul ou au début : « a single stroke, drawn from top to bottom ». Après une lettre liée : « written from the bottom up » (AB). SK : flèche descendante pour ا seul, montante pour ـا. Consensus fort.
- ل, ك, د au milieu ou à la fin : « draw up, then trace back down » (AB). SK : flèche montante sur la liaison. Consensus fort.
- Hampe de ط ظ : trait séparé, de haut en bas, après la boucle (AB, SK). Consensus fort.

### 2.4 Lettres à dent (ب ت ث ن ي au début et au milieu, et la dent de ب ت ث ن à la fin)
- Début : AB, « begin with a small hook » ; SK, point de départ au sommet de la dent, flèche vers le bas puis vers la gauche. Consensus fort.
- Milieu : SK montre la liaison qui arrive, une flèche qui **monte** à la dent, puis le départ vers la gauche (aller-retour sur le même trait). AB énonce le même principe pour toutes les hampes médianes (« draw up, then trace back down ») et dit pour ب que la liaison « connects into the hook ». Consensus fort pour SK et le principe d'AB.
- Fin (ـب) : SK montre une flèche montante à la dent de droite et une flèche montante au crochet de gauche. Consensus fort.

### 2.5 Sens des boucles (synthèse)

| Boucle | Sens retenu | Départ | Sources | Consensus |
|---|---|---|---|---|
| Tête de و (et ؤ) | horaire | sur la ligne, à droite de la tête : on part vers la gauche, on monte, on revient par le haut, on descend dans la queue | AB : « loop clockwise to the left and up, then swing down into the tail » ; SK : départ à droite de la tête, sens illisible | partiel (une source explicite ; SK compatible) |
| Tête de ف ق seuls ou au début | horaire | au pied droit de la tête | AB : « draw a small flat loop around to your left, up, and down around » ; SK : départ au pied droit de la tête, sens illisible | partiel |
| Tête de ـفـ ـف ـقـ ـق (après liaison) | horaire | la liaison, venant de la ligne, entre dans la boucle par le bas | déduit d'AB (« joining segment leads into the beginning point of the loop », dit pour و) et de la continuité du geste | à valider |
| Boucle de ص ض ط ظ | horaire | côté gauche de la boucle, sur la ligne : on monte, on passe par-dessus vers la droite, on redescend et on referme le long de la ligne vers la gauche | AB : « make a large loop up and back to the right, swing down to close it » ; SK : départ à gauche, flèche descendante à droite, flèche vers la gauche en bas ; E3 : courbe de gauche à droite en montant | **fort** |
| م seule ou au début | horaire | sur la ligne, à gauche de la boucle | AB : « begin on the line and draw a small round loop over and around to the right » ; SK : départ à gauche ; AB admet aussi le sens inverse au début | fort (sens horaire recommandé) |
| م au milieu et à la fin | antihoraire | la liaison arrive par le haut | AB : « should always loop down from the connecting segment » ; « continue into the loop, then circle down and around to the right » | partiel (AB seule) |
| ه seule, ة après une lettre non liante | horaire | en haut de la boucle | AB pour ة : « start above the line at the top of the letter and draw the loop down to your right and back up » ; pour ه, seulement « draw a fat oval » ; SK : départ en haut, sens illisible | **douteux** |
| ـه, ـة après liaison | antihoraire | la liaison monte par le côté droit | AB : « draw the right side of the loop up to a point, then swing back down to the left to close it » ; pour ـه : « draw a short line up, then loop around into a flat oval » | partiel |
| Tête de ع غ (seule ou au début), tête de ء | antihoraire, en « c » | en haut à droite | livre l06 et l16 (« comme un c ») ; AB : « c-shape » ; SK : départ en haut à droite | fort |
| ـعـ, ـع (boucle fermée) | antihoraire | la liaison monte par la droite, passe par le haut vers la gauche, puis la pointe gauche redescend | AB : « the body of the letter becomes a closed loop… left side comes to a point » ; SK : sens illisible | **douteux** |
| Cuvettes ouvertes vers le haut (ن ي ى ق ل س ش ص ض) | horaire | à droite | SK : « clockwise in general » ; AB : la queue « back up across the line » | fort |
| Cuvettes ouvertes vers la droite (ج ح خ ع غ seules ou finales) | antihoraire | en haut, on descend vers la gauche, puis on revient vers la droite | SK : flèche finale vers la droite ; AB : « swing down well below the line into the tail » | fort |

### 2.6 ك, ل, hamza, lām-alif
- **ك** (AB) :
  - seule : « start above the line at the top of the letter, draw straight down to the line, then curve and follow the line. Make a tiny hook at the end, then pick up your pen and draw a little hamza-like figure inside the angle » ;
  - au début : « make a right angle and draw along it into a connecting segment » ; barre : « this is written last » ;
  - au milieu : « draw up, then trace the same line back down » ;
  - à la fin : « draw a line up… then trace it back down ».
  
  SK (calame) montre l'inverse pour كـ : la barre oblique d'abord (premier trait), puis le corps. C'est un **écart calligraphie/stylo** : pour des débutants au stylo, on retient AB.
- **ل** : seul, « start at the top and draw straight down, continuing below the line into the tail », et la queue doit remonter au-dessus de la ligne ; au début, la hampe file dans la liaison ; au milieu, on monte puis on redescend sur le même trait (AB). SK concorde sur les quatre formes. Consensus fort.
- **Hamza** :
  - forme : « a small c-shape that continues into a line on the bottom » (AB) ;
  - ordre : support d'abord, hamza en dernier (livre l08 et l16, cohérent avec la règle des traits ajoutés d'AB) ;
  - au stylo, un seul trait : petit « c » en sens antihoraire, puis le trait de base qui descend vers la gauche.
  
  Consensus partiel (une source verbale, plus le livre).
- **ئ** : le support n'a jamais de points (AB : « it takes no dots »). **آ** : « a slightly wavy line just above » l'alif, tracée après l'alif (AB). Consensus fort.
- **لا** :
  - AB (écriture manuscrite) : « draw it slanting down to the left… When you reach the line, pick up your pen and make a slanted alif stroke », donc deux traits ;
  - livre l07 : « je trace les deux hastes qui se croisent en bas, d'un seul mouvement » ;
  - SK : pas de schéma.
  
  Le seul mouvement est cohérent avec la règle « ا après liaison se trace en montant », mais il n'est pas sourcé. **Divergent** (§4).

### 2.7 Calligraphie (calame, maḥaṭṭ) et écriture scolaire au stylo

| Point | Calligraphie naskh (SK) | Stylo, débutant (AB) | Choix pour Awzid |
|---|---|---|---|
| Levées de plume | à chaque trait | seulement aux lettres non liantes et pour les traits ajoutés | stylo |
| Dents de س ش | chaque dent semble commencer par un point de départ (traits séparés) | AB : en écriture courante, les dents sont souvent supprimées (trait plat) | naskh du cahier : 3 dents d'un seul geste, en aller-retour (le livre veut 3 dents) |
| كـ / ـكـ | barre oblique d'abord | corps d'abord, barre après le mot | stylo |
| Points | losanges tracés en biais (SK : « note pen stroke direction for writing dots ») | simples touches ; 2 points en trait, 3 en chevron dans l'écriture courante | touches séparées (modèle naskh) |
| Épaisseurs | pleins et déliés (biseau à 70°) | trait uniforme | trait uniforme ; la police du cahier donne l'aspect naskh |
| Liaison de ج ح خ م ي | « from above » | AB : « end the previous letter above the line » pour ج | les deux concordent : liaison par le haut |

---

## 3. Lettre par lettre, dans l'ordre du livre ad1

Légende :
- **Départ** : point où l'on pose le stylo.
- **Traits** : nombre de gestes, levée comprise.
- Les points comptent comme un trait ajouté, à placer selon §2.2.
- « Liaison » : la forme commence par le trait qui vient de la lettre précédente, sur la ligne, depuis la droite.
- Consensus : **F** = fort, **P** = partiel, **D** = douteux ou divergent.

### Leçon 1 : ب ت ث ن ي

| Lettre | Forme | Départ | Sens et ordre | Traits | Cons. | Sources |
|---|---|---|---|---|---|---|
| ب ت ث | isolée | sommet de la dent de droite | 1) descente, ligne vers la gauche, remontée du crochet gauche ; 2) points | 1 + points | F | SK, AB (« begin with a small hook… straight along the line… another hook ») |
| ب ت ث | début | sommet de la dent | 1) descente, puis filée vers la gauche ; 2) points après le mot | 1 + points | F | SK, AB |
| ب ت ث | milieu | liaison | 1) monter au sommet de la dent, redescendre sur le même trait, continuer à gauche ; 2) points après le mot | 1 + points | F | SK (aller-retour fléché), principe AB |
| ب ت ث | fin | liaison | 1) monter à la dent, redescendre, ligne vers la gauche, crochet ; 2) points | 1 + points | F | SK |
| ن | isolée | sommet de la pointe droite | 1) descente dans une cuvette ronde sous la ligne (sens horaire), remontée à gauche au-dessus de la ligne ; 2) point | 1 + point | F | SK, AB (« dips well below the line… back up across the line ») |
| ن | début, milieu | comme ب | comme ب ; point au-dessus | 1 + point | F | SK, AB |
| ن | fin | liaison | 1) monter à la dent, redescendre et plonger dans la cuvette ; 2) point | 1 + point | F | AB (« begins with a tooth and then dips immediately into a tail ») |
| ي | isolée | petit crochet en haut à droite | 1) moitié haute d'un « s » jusqu'à la ligne, puis grande cuvette plate sous la ligne, puis la queue ; 2) deux points dessous | 1 + points | P | AB (« form the top half of an "s"… wide flat curve… bring the tail back up over the line ») ; le livre (l15) dit que la queue « revient vers la droite » (§4) |
| ي | début, milieu | comme ب | comme ب ; deux points dessous | 1 + points | F | AB, SK |
| ي | fin | liaison | 1) petit crochet, puis la cuvette ; 2) points | 1 + points | P | AB |

### Leçon 2 : ج ح خ د ذ

| Lettre | Forme | Départ | Sens et ordre | Traits | Cons. | Sources |
|---|---|---|---|---|---|---|
| ج ح خ | isolée | pointe **gauche** du trait du haut | 1) trait du haut vers la **droite**, puis retour en diagonale vers le bas et la gauche, puis grande cuvette sous la ligne qui revient vers la droite (sens antihoraire) ; 2) point (ج dans la cuvette, خ dessus) | 1 + point | P | SK (départ à gauche, flèche vers la droite) ; AB (« make a small hook, then draw a line straight across… change direction and swing down ») |
| ج ح خ | début | pointe gauche du trait du haut | 1) vers la droite, puis diagonale vers le bas et la gauche, puis filée sur la ligne ; 2) point après le mot | 1 + point | P | SK (aller vers la droite, retour vers la gauche) ; AB (« begin with the hook… slant down toward the line ») |
| ج ح خ | milieu | liaison **par le haut** | 1) la liaison monte au niveau du trait du haut, qu'on parcourt de droite à gauche, puis diagonale jusqu'à la ligne et filée ; 2) point | 1 + point | D | AB (« end the previous letter above the line ») ; SK (« from above ») ; détail du geste non décrit |
| ج ح خ | fin | liaison par le haut | 1) « from the line up and then over » : montée, trait du haut vers la gauche, puis cuvette (antihoraire) ; 2) point | 1 + point | P | AB, SK |
| د ذ | isolée, début | haut de la lettre | 1) oblique vers le bas, angle vif juste au-dessus de la ligne, puis base vers la gauche et petit crochet ; 2) point de ذ | 1 (+ point) | F | AB (« begin well above the line… angle sharply and finish along the line into a tiny hook ») ; SK |
| د ذ | milieu, fin | liaison | 1) monter le haut de la lettre et redescendre sur le même trait, puis l'angle et la base ; 2) point ; **lever le stylo** | 1 (+ point) | F | AB (« draw the top half… from the line up, then trace your line back down ») ; SK |

### Leçon 3 : ر ز س ش

| Lettre | Forme | Départ | Sens et ordre | Traits | Cons. | Sources |
|---|---|---|---|---|---|---|
| ر ز | isolée, début | tête, juste au-dessus de la ligne | 1) courbe qui descend sous la ligne vers la gauche ; 2) point de ز ; lever le stylo | 1 (+ point) | F | AB (« begin on the line and curve downwards below it ») ; SK (départ en haut) |
| ر ز | milieu, fin | liaison | 1) petite montée à la tête, puis la même courbe descendante | 1 (+ point) | P | AB (« start from the connecting segment on the line, then curve down ») ; SK (flèche montante vers la tête) |
| س ش | isolée | sommet de la 1re dent (à droite) | 1) descendre ; monter à la 2e dent et redescendre ; monter à la 3e et redescendre ; puis cuvette sous la ligne (sens horaire) qui remonte à la ligne ; 2) trois points de ش | 1 (+ points) | P | SK (trois dents fléchées, cuvette) ; AB (cuvette « returns to the line » ; signale qu'en écriture courante les dents sont omises) |
| س ش | début | sommet de la 1re dent | trois dents en aller-retour, puis filée | 1 (+ points) | P | SK, AB |
| س ش | milieu | liaison | trois dents en aller-retour (la 1re aussi), puis filée | 1 (+ points) | P | SK |
| س ش | fin | liaison | trois dents, puis cuvette | 1 (+ points) | P | SK, AB |

### Leçon 4 : ص ض ط ظ

| Lettre | Forme | Départ | Sens et ordre | Traits | Cons. | Sources |
|---|---|---|---|---|---|---|
| ص ض | isolée | sur la ligne, **côté gauche** de la boucle | 1) monter, passer par-dessus vers la droite, redescendre et refermer vers la gauche le long de la ligne (sens horaire) ; petite dent ; cuvette sous la ligne qui remonte ; 2) point de ض | 1 (+ point) | F | AB (« start on the line, make a large loop up and back to the right, swing down to close it, add the tooth ») ; SK ; E3 |
| ص ض | début | côté gauche de la boucle | boucle horaire, dent, filée | 1 (+ point) | F | AB, SK |
| ص ض | milieu | liaison | filer sur la ligne jusqu'au départ de la boucle, puis boucle horaire, dent, filée | 1 (+ point) | F | AB (« draw the connecting segment to the loop's starting point, then follow the independent steps ») |
| ص ض | fin | liaison | comme au milieu, puis cuvette | 1 (+ point) | F | AB |
| ط ظ | isolée | côté gauche de la boucle | 1) boucle horaire d'un geste, puis base vers la gauche ; 2) **hampe** de haut en bas ; 3) point de ظ, à droite de la hampe | 2 (+ point) | F | AB (« much like crossing the t in English ») ; SK (point de départ en haut de la hampe, flèche vers le bas) |
| ط ظ | début, milieu | boucle (début) ou liaison (milieu) | 1) corps sans s'arrêter ; 2) hampe **après le corps du mot** ; 3) point | 2 (+ point) | F | AB (« Do not stop to write the downstroke until you have finished writing the body of the word ») |
| ط ظ | fin | liaison | comme au milieu | 2 (+ point) | F | AB, SK |

### Leçon 6 : ع غ ف ق

| Lettre | Forme | Départ | Sens et ordre | Traits | Cons. | Sources |
|---|---|---|---|---|---|---|
| ع غ | isolée | haut droit de la tête | 1) tête en « c » (antihoraire), puis grande cuvette sous la ligne ouverte vers la droite (antihoraire) ; 2) point de غ | 1 (+ point) | F | AB (« c-shape ») ; SK ; livre l06 |
| ع غ | début | haut droit de la tête | « c », puis rejoindre la ligne vers la gauche | 1 (+ point) | F | AB, SK, livre |
| ع غ | milieu | liaison | boucle fermée, pointue à gauche ou en haut, posée sur la ligne, puis filée ; sens proposé : antihoraire | 1 (+ point) | D | AB (« closed loop… left side comes to a point… stays open, not filled in ») ; sens non attesté |
| ع غ | fin | liaison | même boucle, puis grande cuvette (antihoraire) | 1 (+ point) | D | AB |
| ف | isolée | pied droit de la tête, au-dessus de la ligne | 1) tête en sens horaire (vers la gauche, en haut, puis redescente à droite), puis la ligne vers la gauche et le crochet final ; 2) point | 1 + point | P | AB (« begin above the line and draw a small flat loop around to your left, up, and down around. Continue along the line into a small hook ») ; SK (départ à droite de la tête) |
| ف ق | début | pied droit de la tête | tête horaire, puis filée ; points après le mot | 1 + points | P | AB, SK |
| ف ق | milieu | liaison | la liaison entre dans la tête par le bas, boucle horaire, puis filée | 1 + points | D | déduit d'AB ; SK illisible |
| ف | fin | liaison | comme au milieu, puis la ligne et le crochet | 1 + point | D | idem |
| ق | isolée, fin | comme ف | tête horaire, puis cuvette **profonde** sous la ligne qui remonte à la ligne ; 2 points | 1 + points | P | AB (« a deep tail that drops well below the line… bring the tail all the way back up ») ; SK |

### Leçon 7 : ك ل م ه, et لا

| Lettre | Forme | Départ | Sens et ordre | Traits | Cons. | Sources |
|---|---|---|---|---|---|---|
| ك | isolée | **haut de la hampe** | 1) descente jusqu'à la ligne, puis base vers la gauche et petit crochet ; 2) petit signe dans l'angle | 2 | F (AB) | AB (citation au §2.6) |
| ك | début | haut du corps | 1) corps (descente et liaison) ; 2) barre oblique **après le squelette du mot** | 2 | P | AB ; SK trace la barre en premier (calligraphie) |
| ك | milieu | liaison | 1) monter et redescendre sur le même trait, puis filée ; 2) barre après le mot | 2 | P | AB |
| ك | fin | liaison | 1) monter, redescendre, base et crochet ; 2) petit signe | 2 | P | AB |
| ل | isolée | haut de la hampe | descente, cuvette sous la ligne (horaire) qui remonte au-dessus de la ligne | 1 | F | AB, SK |
| ل | début | haut de la hampe | descente, puis filée vers la gauche | 1 | F | AB, SK |
| ل | milieu | liaison | monter, redescendre sur le même trait, filée | 1 | F | AB, SK |
| ل | fin | liaison | monter, redescendre, cuvette | 1 | F | AB, SK |
| م | isolée | sur la ligne, à gauche de la boucle | petite boucle horaire (par-dessus vers la droite), courte filée sur la ligne, puis queue droite vers le bas | 1 | P | AB (« over and around to the right… make a corner and draw the tail straight down ») ; SK |
| م | début | sur la ligne, à gauche | boucle horaire au-dessus de la ligne, puis filée | 1 | P | AB (sens inverse admis), SK |
| م | milieu | liaison, légèrement au-dessus de la ligne | boucle « down from the connecting segment » (antihoraire), puis filée | 1 | P | AB |
| م | fin | liaison | entrer dans la boucle par le haut, tour complet (antihoraire), puis queue | 1 | P | AB (« must be looped down from the top ») |
| ه | isolée | haut de la boucle | boucle ronde fermée ; sens proposé : horaire, aligné sur ة d'AB | 1 | D | AB (« a fat oval », sans sens ; pour ة, sens horaire) ; SK illisible |
| ه | début (deux yeux) | un peu au-dessus de la ligne | grande boucle « sloping first upward and then downward to your right », petite boucle intérieure, retour à la ligne et filée | 1 | P | AB ; SK (schéma complexe) |
| ه | milieu | liaison | forme du cahier (deux boucles, au-dessus et au-dessous de la ligne) : geste non décrit par les sources pour cette forme imprimée. AB ne décrit que la forme courante (« pointed dip below the line », un seul trait) | 1 | D | AB |
| ه | fin | liaison | courte montée, puis ovale aplati (antihoraire) | 1 | P | AB |
| لا | ligature | haut du ل | voir §4 (deux traits pour AB ; un seul mouvement pour le livre) | 1 ou 2 | D | AB, livre |

### Leçon 8 : ا و ء أ (et إ)

| Lettre | Forme | Départ | Sens et ordre | Traits | Cons. | Sources |
|---|---|---|---|---|---|---|
| ا | isolée, début | haut | un trait vertical vers le bas ; lever le stylo | 1 | F | AB, SK |
| ا | milieu, fin | liaison | **monter** depuis la ligne et s'arrêter ; lever le stylo | 1 | F | AB (« written from the bottom up ») ; SK |
| و | isolée, début | sur la ligne, à droite de la tête | tête horaire, puis queue en courbe sous la ligne vers la gauche ; lever le stylo | 1 | P | AB ; SK (sens de la boucle illisible) |
| و | milieu, fin | liaison | la liaison entre au départ de la boucle ; tête horaire, puis queue | 1 | P | AB (« the joining segment leads into the beginning point of the loop ») |
| ء | seule | haut droit | petit « c » (antihoraire), puis trait de base vers le bas et la gauche, d'un seul trait ; elle se trace **après** le reste du mot | 1 | P | AB (« small c-shape that continues into a line on the bottom ») ; livre |
| أ إ | toutes | haut de l'alif | 1) alif (de haut en bas, ou de bas en haut après liaison) ; 2) hamza au-dessus (أ) ou au-dessous (إ) ; 3) voyelle | 2 | F | AB, livre |

### Leçon 15 : ة ى

| Lettre | Forme | Départ | Sens et ordre | Traits | Cons. | Sources |
|---|---|---|---|---|---|---|
| ة | isolée (après une lettre non liante) | haut de la boucle | boucle en sens horaire, puis 2 points | 1 + points | P | AB (« start above the line at the top of the letter and draw the loop down to your right and back up ») |
| ة | fin (après liaison) | liaison | monter le côté droit jusqu'à une pointe, puis redescendre à gauche pour fermer (antihoraire) ; 2 points | 1 + points | P | AB (« draw the right side of the loop up to a point, then swing back down to the left to close it ») |
| ى | isolée, fin | comme ي | comme ي, **sans points** | 1 | P | AB (« written exactly like final ي, except that it has no dots ») |

### Leçon 16 : أ ؤ ئ ء آ

| Lettre | Forme | Départ | Sens et ordre | Traits | Cons. | Sources |
|---|---|---|---|---|---|---|
| ؤ | toutes | comme و | 1) و ; 2) hamza ; ne se lie pas à la lettre suivante | 2 | F | AB, livre |
| ئ | début, milieu | comme ب (dent) | 1) dent **sans points** ; 2) hamza après le mot | 2 | F | AB (« it takes no dots ») |
| ئ | isolée, fin | comme ى | 1) ى ; 2) hamza | 2 | P | AB |
| آ | toutes | alif | 1) alif ; 2) madda : petit trait légèrement ondulé, posé à plat au-dessus | 2 | F | AB (« a slightly wavy line just above ») ; livre |

---

## 4. Points qui restent douteux (à trancher)

1. **Sens des petites boucles** (و ف ق) : AB dit « horaire » noir sur blanc pour و et ف. SK part bien du côté droit de la tête, mais la résolution de son tableau ne permet pas de lire le sens. Le sens horaire prolonge naturellement le geste vers la queue de و et vers la ligne de ف. **Proposition : horaire.** À confirmer par un enseignant.
2. **ه isolée** : aucune source ne donne explicitement le sens. Proposition : horaire depuis le haut, comme ة chez AB. L'alternative (antihoraire, comme un « o » latin) est plausible.
3. **ـهـ médiane du cahier** (deux boucles, au-dessus et au-dessous de la ligne) : aucune source consultée ne décrit le geste pour cette forme imprimée. À dessiner sur la police, puis à faire valider.
4. **ـعـ et ـع** (boucle fermée) : le sens antihoraire est une proposition, non attestée.
5. **ج ح خ au milieu** : la liaison par le haut est attestée (AB, SK), pas le détail du geste. Proposition : la liaison monte, le trait du haut se fait vers la gauche, puis la diagonale descend.
6. **لا** : deux traits (AB) ou un seul mouvement (livre) ? Pour une vidéo de débutant, je propose de garder le seul mouvement du livre : on descend le ل jusqu'à la ligne, puis on remonte l'alif. Cela reste cohérent avec la règle « ا après liaison = vers le haut ». On mentionnerait que lever le stylo entre les deux est aussi correct.
7. **ي ى isolées** : AB fait remonter la queue « over the line » (à gauche). Le livre (l15) parle d'une queue « qui revient vers la droite », ce qui correspond au dessin naskh de la police. Les deux ne s'excluent pas : au stylo, on suit le dessin de la police du cahier, et le geste reste le même (crochet en « s », cuvette, queue).
8. **Ordre des points de ث ش** : non sourcé (convention : de droite à gauche, rangée du bas puis sommet).
9. **Dents de س ش au milieu** : SK semble tracer chaque dent séparément (calame). Au stylo, je propose un seul geste en aller-retour, comme la dent de ب.

---

## 5. Écarts avec les conseils d'écriture du livre ad1 (pour le référent)

| Leçon | Texte actuel | Constat | Proposition |
|---|---|---|---|
| l02 (ج ح خ) | « je trace d'abord le petit trait du haut, de droite à gauche, puis je descends en crochet » | Seul ou au début, les sources font partir le trait du haut de sa pointe gauche, **vers la droite**, puis le stylo repart en diagonale vers le bas et la gauche (SK ; AB « hook… straight across… change direction »). De droite à gauche n'est juste qu'au milieu et à la fin, quand la liaison arrive par le haut. | « Seule ou au début : je trace le petit trait du haut de gauche à droite, puis je redescends en diagonale vers la gauche (crochet). Au milieu et à la fin, le trait arrive par le haut. » |
| l04 (ص ض) | « je trace la boucle de droite à gauche, couchée sur la ligne, puis la petite dent à gauche » | AB, SK et E3 font partir la boucle de son côté **gauche**, sur la ligne : elle monte vers la droite, revient et se referme vers la gauche (sens horaire). Ensuite vient la dent. | « Je pars de la ligne, à gauche de la boucle ; je monte, je passe par-dessus vers la droite, je redescends et je referme le long de la ligne, puis je trace la petite dent. » |
| l07 (ك) | « je trace le corps allongé, puis la haste, et j'ajoute le petit signe (forme finale) ou la barre oblique (début, milieu) » | Pour ك seule ou finale, AB fait partir le stylo du **haut de la hampe**, d'un seul geste jusqu'au bout de la base. Pour le début et le milieu, « corps puis barre » est juste (AB), la barre se posant après le mot. | « ك seule ou à la fin : je pars du haut, je descends, je file sur la ligne, puis j'ajoute le petit signe. Au début et au milieu : je trace le corps et je pose la barre oblique quand le mot est fini. » |
| l07 (لا) | « d'un seul mouvement » | AB enseigne deux traits | Garder, ou ajouter « (ou en deux traits) ». À trancher. |
| l01, l03, l06, l08, l10, l12, l13, l15, l16 | — | Conformes : points à la fin, ر ز de haut en bas, tête de ع en « c », ا de haut en bas, hamza en dernier, voyelles après le squelette, tanwin et chadda en dernier, ة et ى. | — |

---

## 6. Prototype de ب (`prototype_ecriture_lettre.html`)

Les tracés de plume (`G.*.trait`) **concordent avec les sources** sur les quatre formes :
- isolée : départ au sommet de la dent de droite (668, 425), descente, ligne vers la gauche, remontée du crochet gauche (104, 312). Conforme au schéma de SK et à AB ;
- début : départ au sommet de la dent (170, 398), descente, filée vers la gauche. Conforme à SK et AB ;
- milieu : liaison, montée au sommet de la dent (198, 252), redescente (184, 165), filée. C'est exactement l'aller-retour fléché par SK ;
- fin : liaison, montée à la dent, redescente, corps, crochet. Conforme à SK ;
- point après le corps : conforme à AB, BSE et au livre.

Recommandations, sans modification à faire maintenant :
1. Remplacer la mention « d'après la pratique courante » et « à faire vérifier » par la source : « Sens et ordre : Alif Baa (Brustad et al., Georgetown UP) et tableau naskh de M. Sakkal (2016) ; à relire par un enseignant ».
2. Au milieu, faire redescendre la plume **exactement** sur le trait de montée. L'écart actuel est de 14 unités en x (198 → 184). Il est acceptable visuellement, mais l'aller-retour se lit mieux s'il est superposé, ou si la plume marque une brève pause au sommet.
3. Quand l'animation passera aux mots : points **après le squelette du mot entier**, de droite à gauche, puis voyelles (§2.2). Ne pas pointer lettre par lettre.
4. Réutiliser `traits_lettres.json` pour les autres lettres, en recalant les points de passage sur les contours de Noto Naskh Arabic 700, comme pour ب.
