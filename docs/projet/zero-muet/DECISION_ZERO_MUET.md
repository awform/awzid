# Décision du référent : « rien de muet » (24/10/2026)

*Exigence du client : « Rien dans notre appli ne reste muet. Soit c'est récité par Ayyūb, soit c'est lu par notre voix de synthèse. » Tranché par le référent selon l'école mālikite (mashhūr), sources citées. En attente de relecture.*

Cette règle vaut pour **tout** l'audio : livres, vidéos V2, cahiers de lecture et « Je parle », Madjaliss.

## 1. Citations du Coran (bloquées par la garde)
- **Une vraie citation coranique** (verset entier ou extrait de 4 mots ou plus, ou citation annoncée « قال الله تعالى ») est jouée par la **récitation d'Ayyūb du verset correspondant**. Jamais de synthèse vocale.
- **Si la citation est partielle**, on joue le **verset entier** d'Ayyūb. On ne coupe jamais une récitation au milieu d'un verset. Le texte affiché reste celui du livre.
- **Si la citation couvre plusieurs versets**, on enchaîne les versets d'Ayyūb, dans l'ordre.
- L'élève voit une petite mention « récitation » sur le bouton, pour qu'il ne la confonde pas avec la voix de synthèse.

## 2. Faux positifs de la garde (ce n'est pas du Coran)
Les définitions de vocabulaire, le tashahhud, les formules de dhikr et les phrases de la vie courante que la garde a bloquées par erreur, parce que leurs mots ressemblent à un verset, sont **lus par la synthèse**. Exemples :
- « اسْتُشْهِدَ: قُتِلَ فِي سَبِيلِ اللَّهِ » est une définition ;
- le tashahhud est la formule de la prière : ce n'est pas une récitation de verset.

On les ajoute **un par un** à la liste blanche (`dhikr-formules.json` ou `garde_autorises.json`), avec la raison. Le seuil de 4 mots ne change pas.

### 2 bis. Mots isolés du vocabulaire coranique (précision du 24/10 au soir)
Le classement automatique a relevé 545 textes : ce sont surtout des **mots de vocabulaire du Coran** présentés seuls (par exemple الْمَلَائِكَةُ).
- **Un mot ou une expression de moins de 4 mots, présenté comme du vocabulaire** (dans une liste de mots ou une carte), est **lu par la synthèse**. C'est un mot de la langue, pas une récitation. Si le livre l'écrit en graphie ʿuthmānie (avec des signes comme ٓ), la voix lit le mot normalement.
- **Exceptions, récitées par Ayyūb** :
  - un mot qui forme à lui seul un **verset complet** et que le livre présente comme verset (مُدْهَامَّتَانِ 55:64, الْحَاقَّةُ 69:1, الْقَارِعَةُ 101:1, الرَّحْمَٰنُ 55:1…) ;
  - les **lettres détachées** en tête de sourate (الٓمٓ، طه، يسٓ، حمٓ…), qui ne se lisent qu'en récitation.
- La validation se fait **par règle**, et pas une ligne à la fois. Un script applique ces deux exceptions. Le référent contrôle ensuite un échantillon de 50 lignes et la liste complète des exceptions.

### 2 ter. Citations ambiguës ou sans verset trouvé
- **Ambiguës** (une formule présente dans plusieurs versets, comme إِنَّ اللَّهَ غَفُورٌ رَحِيمٌ) : on retient le verset **cité par la leçon** s'il est donné. Sinon, puisque la leçon emploie la formule **comme une phrase** et non comme une citation, elle est **lue par la synthèse si elle compte moins de 4 mots**. À partir de 4 mots, on prend le verset le plus connu du contexte de la leçon, que le référent choisit à la main.
- **Sans verset trouvé** (19) : vérification à la main. Si ce n'est pas du Coran, c'est la synthèse ; si c'en est, c'est Ayyūb.

## 3. La Basmala
- **Basmala complète** (بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ) : **récitation d'Ayyūb** (1:1, Tanzil). Jamais de synthèse.
- **« بِسْمِ اللَّهِ » seul**, dit avant de manger, d'entrer, etc. : c'est une **formule de dhikr de deux mots**, et non une récitation. **Lu par la synthèse.** Cette précision complète `regle-basmala.md` : la règle « jamais de synthèse » vise la Basmala complète et toute citation coranique.

## 4. Textes refusés par le contrôle de qualité
| Cas | Solution |
|---|---|
| L'abréviation « (ج. …) » (pluriel) | On garde l'affichage tel quel. Pour la voix, on lit **« جَمْعُهُ … »** (« son pluriel… »), ce que dit l'enseignant à voix haute. Le texte envoyé à la voix est réécrit ; l'affichage ne change pas. |
| Lettres de racine isolées (و ع د) | On les fait lire **par leur nom**, l'une après l'autre (« wāw, ʿayn, dāl »), en assemblant les audios de noms de lettres qui existent déjà. |
| Terminaison ou signe isolé (ـِي، ←) | On lit **le son** à partir des audios de syllabes (voix Wavenet-B, la plus fiable sur les sons isolés), ou un **exemple court** pris dans la même leçon. |
| Longue liste dont la durée paraît anormale | On la **découpe** en éléments, on génère chaque élément, puis on les assemble avec une courte pause. |
| Texte mêlé de français | **Décision du client (24/10) : pas de voix pour le français.** On lit **seulement la partie arabe** (Charon). S'il y a plusieurs passages arabes, on les enchaîne dans l'ordre avec une courte pause. Le français reste à lire des yeux. |
| Refusé encore, après Gemini puis Chirp | Troisième essai avec **Wavenet**. S'il est refusé lui aussi, on reformule la façon de dire (pause, ponctuation) sans changer le texte affiché, et on garde le meilleur essai après un contrôle de durée. |
| Fichier orphelin | On le vérifie avec ecoute-ia. S'il est conforme, on le rattache ; sinon, on le régénère. |

## 5. Ce qui n'est jamais permis
- de la synthèse vocale sur le Coran ;
- une récitation coupée au milieu d'un verset ;
- un récitateur en ligne ;
- une voix humaine enregistrée (hors Ayyūb).

## 6. Suivi
Un contrôle automatique « **zéro muet** » s'ajoute aux tests : tout texte « à écouter » doit avoir un audio de synthèse ou une récitation d'Ayyūb. Sinon, le test échoue.
