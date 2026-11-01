# Seuils de tajwīd calibrés sur le Coran entier (5 récitateurs de référence)

1er novembre 2026. Branche `tajwid-seuils-wip` (worktree `~/wt/tajwid-seuils`), **non fusionnée, non déployée**.
Aucun texte coranique modifié. L'interrupteur `tajwid_madd` reste **éteint** en production (`packages/school/src/fonctions.ts`, vérifié par un test).

## 1. Ce qui a été fait

- Entrée : le décodage terminé du Coran par ayyoub, akhdar, huthify, muaiqly, muhanna (modèle Muaalem int8, `~/tajwid-decodage/work/cache8`) : 30 891 fichiers présents sur 31 180 (le journal annonce 30 596 pour sa dernière reprise). Les 289 absents sont des versets sans audio : la sourate 2 entière chez huthify (286) et 3 chez muhanna. Aucun audio relu, aucun modèle chargé : seules les probabilités sauvegardées servent.
- Méthode du plan (`TAJWID_FIABLE_PLAN.md` § 3, `ETUDE_TAJWID_COMPLETE.md` § 3.5) appliquée sans changement : la vérité « juste » = les 5 récitateurs certifiés ; les fautes viennent des **montages d'audio réel de l'étude du 25/10** (`tajwid-fautes8.jsonl.gz`, `madd-resultats.json`). Je n'ai créé aucune faute nouvelle.
- Seuil retenu = la plus petite valeur pour laquelle **chaque voix** a au plus 2 % de fausses alertes (le seuil à 0 fausse alerte n'a plus de sens sur des dizaines de milliers d'occurrences : les erreurs d'alignement ou de décodage créent quelques valeurs extrêmes, voir § 4).
- « Une voix laissée de côté » : seuil appris sur 4 voix (2 % du lot réuni), fausses alertes mesurées sur la 5ᵉ. C'est la meilleure image de ce qui arrive avec une voix jamais vue.
- Contrôle de la réimplémentation : sur 2 000 occurrences communes avec l'étude du 25/10, 1 846 durées normalisées sont identiques à 0,001 près (écart moyen 0,013). Les autres viennent de différences d'alignement sur quelques versets.

## 2. Ce que le module couvre réellement

Dans le dépôt (`services/ecoute-ia`), **le seul détecteur est celui des madd** (`madd.py` : muttaṣil et lāzim, « trop court », rapport au débit et à Ayyūb). Ghunna, ikhfāʾ, iẓhār, idghām, iqlāb, lām de « Allāh », qalqala, makhārij n'existent que dans les prototypes de recherche (`recherche_coran_ia/prototypes`) : leurs seuils sont rangés dans la configuration pour la suite, **règles éteintes**, sans aucun code qui les lise.

## 3. Madd (le détecteur du produit)

Mesure faite avec **le vrai `madd.py`** (nouvelle fonction `rapport()`, que `decider()` appelle : même logique, une seule copie) sur 1 579 versets qui ont un madd long d'après les annotations du dépôt (`/tajwid/NNN.json`, port fidèle de `ciblesDe`). Référence = Ayyūb, « élève » = chacune des 4 autres voix.

**Entonnoir de production (muttaṣil)** : sur 8 348 cas (madd longs annotés x 4 voix), 97 % sont **réduits au silence** par le contrôle du nombre de madd (« correspondance incertaine » : 8 106 cas) ; il reste **215 mesures** (212 muttaṣil, 3 lāzim). C'est voulu et utile : sans ce contrôle, 10,8 % de fausses alertes à 0,70 (2 043 mesures, madd mal appariés).

| Voix (élève) | Mesures | Plus petit r | r à 2 % | Médiane | Fausses alertes à r < 0,70 | à r < 0,75 | à r < 0,80 |
|---|---|---|---|---|---|---|---|
| akhdar | 53 | 0,664 | 0,739 | 0,958 | 1 (1,9 %) | 5,7 % | 17,0 % |
| huthify | 52 | 0,791 | 0,822 | 1,147 | 0 | 0 | 1,9 % |
| muaiqly | 55 | 0,715 | 0,738 | 1,092 | 0 | 3,6 % | 5,5 % |
| muhanna | 52 | 0,604 | 0,736 | 1,144 | 1 (1,9 %) | 5,8 % | 7,7 % |
| **4 voix** | **212** | 0,604 | 0,715 (1 %) | | **2 (0,9 %)**, borne haute 95 % : 3,4 % | 3,8 % | 8,0 % |
| ayyoub (réf. = chaque autre voix) | 207 | 0,630 | 0,701 | 0,942 | 4 (1,9 %) | 6,8 % | 16,9 % |

- **Seuil retenu : `R_COURT = 0,70`, inchangé.** C'est la valeur la plus haute qui tient 2 % pour chaque voix : la voix la plus serrée (Ayyūb contre les autres) donne 0,701. Monter à 0,75 donnerait 3,8 % de fausses alertes.
- Une voix laissée de côté : 0 à 3,8 % selon la voix (seuil appris 0,74).
- **Détection** : 10 raccourcis simulés de muttaṣil (étude du 25/10) : 80 % à 0,70 (8/10), 90 % à 0,75. **C'est un ordre de grandeur, pas une preuve** (10 cas, coupés par montage).
- **Lāzim : éteint.** 3 mesures utilisables sur tout le Coran, aucune faute simulée : impossible de borner les fausses alertes. `madd.decider` renvoie le silence `type_eteint` (nouvelle configuration), la route accepte toujours le type et répond « rien ».
- Statut : **indication** (fausses alertes 1,9 % au pire par voix, détection 80 % sur 10 cas) : pas « prête ». L'interrupteur reste éteint.

## 4. Autres règles (seuils rangés, règles éteintes)

Référence « Ayyūb seul » quand la mesure est une durée (le produit n'a qu'un récitateur) ; la référence « médiane des 4 autres voix » de l'étude du 25/10 donne les mêmes ordres de grandeur (colonne de droite du détail). Les fautes sont celles de l'étude (40 par type, 32 hors Ayyūb quand la référence est Ayyūb).

| Règle | Mesure et seuil (alerte si dépassé) | Occurrences justes | Fausses alertes par voix (min – max) | Voix laissée de côté (max) | Détection (fautes simulées) | Statut |
|---|---|---|---|---|---|---|
| Ghunna très courte (−70 %) | durée Ayyūb / durée élève > **1,743** | 24 539 | 0,3 – 2,0 % | 3,7 % | **96,9 %** (31/32) | prête à valider |
| Ghunna un peu courte (−50 %) | idem 1,743 | 24 539 | idem | 3,7 % | 50 % (16/32) | insuffisante : se taire |
| Ikhfāʾ non tenue (−60 %) | durée Ayyūb / durée élève > **1,69** | 16 633 | 0,4 – 2,0 % | 3,6 % | 81,2 % (26/32) | indication |
| Ikhfāʾ remplacée par ن clair | probabilité de ن > **0,0216** | 23 228 | 0,5 – 2,0 % | 3,5 % | 75 % (40 fautes, 35 mesurées) | indication |
| Iẓhār tenu (ghunna ajoutée) | durée élève / durée Ayyūb > **1,686** | 9 595 | 0,4 – 2,0 % | 3,7 % | **93,8 %** (30/32) | prête à valider |
| Idghām sans ghunna, ن entendu | probabilité de ن ou ں > **0,0131** | 4 742 | 1,2 – 2,0 % | 3,7 % | 77,5 % (31/40) | indication |
| Idghām avec ghunna non tenu | durée de réf. / durée élève > 14,34 | 10 816 | 0,5 – 2,0 % | 4,9 % | 0 % | insuffisante |
| Idghām avec ghunna, ن clair | probabilité de ن > 0,0221 | 10 968 | 1,0 – 2,0 % | 4,1 % | 22,5 % | insuffisante |
| Iqlāb, ن au lieu de م | probabilité de ن ou ں > 0,0215 | 2 404 | 0,9 – 1,9 % | 2,6 % | 26,3 % (5/19) | insuffisante |
| Lām de « Allāh » lourd après i | tête tafkhīm > **0,0696** | 3 287 | 1,0 – 1,9 % | 3,1 % | **97,5 %** (39/40) | prête à valider |
| Lām de « Allāh » léger après a/u | 1 − tête tafkhīm > 0,9448 | 9 241 | 0,3 – 2,0 % | 4,0 % | 15 % | insuffisante |
| Qalqala (milieu et fin), rā et emphatiques, makhārij, ʿāriḍ, lām (formant) | mesures acoustiques (audio) | | | | non recalculé | non mesurée, éteinte |

Lecture des fausses alertes par voix (exemple ghunna très courte, référence Ayyūb) : akhdar 0,3 %, muhanna 1,0 %, huthify 1,6 %, muaiqly 2,0 %. Le seuil est fixé par la voix la plus variable (muaiqly, ghunna plus longue et irrégulière). Détail des 5 voix et de chaque centile : `services/ecoute-ia/calibration/seuils_mesures.json`.

**Écart entre les voix : le seuil tient par construction pour les 5 voix de référence, mais pas pour une voix jamais vue.** Avec une voix laissée de côté, les fausses alertes montent à **2,6 – 5,6 %** selon les règles (cible 2 %). Les voix diffèrent : sur la ghunna, le 98ᵉ centile du rapport vaut 1,41 pour akhdar, mais 1,69 pour huthify et 1,74 pour muaiqly. Pour une voix de femme, d'enfant ou au téléphone, il faut s'attendre à pire. C'est la raison pour laquelle aucune règle n'est allumée.

**Idghām avec ghunna (durée)** : environ 13 % seulement des occurrences ont le même nombre d'unités que le texte attendu ; chez huthify, muaiqly et muhanna, plus de 2 % des occurrences sont 9 à 14 fois plus courtes que la référence (cause non étudiée, probablement l'alignement après le tanwīn). Le seuil à 2 % tombe à 14, donc plus aucune détection. Une porte « même nombre d'unités » n'est pas admissible : les fautes raccourcies changent ce nombre (ghunna −70 % : 35 fautes sur 40 le changent), elle les cacherait.

**Iqlāb et ikhfāʾ, jeton écrit** : le jeton ن est écrit sur 27 iqlāb/ikhfāʾ shafawī justes sur 4 753 (0,6 %) et sur 49 ikhfāʾ justes sur 23 290 (0,2 %). Dans les fautes simulées, il l'est pour 1 faute d'iqlāb sur 19 et 22 fautes d'ikhfāʾ « ن clair » sur 40. Le chiffre de 85 % de l'étude du 25/10 sur l'iqlāb vient d'un classifieur lèvres/langue qui lit l'audio : **non recalculé ici**.

## 5. Limites (à lire avant d'utiliser ces chiffres)

1. **Cinq voix d'hommes, professionnelles, enregistrées en studio.** Aucune voix d'élève, de femme, d'enfant ni de téléphone bruité. Les fausses alertes d'un vrai élève seront plus élevées.
2. **Des fautes simulées par montage** (coupures, collages). Une faute simulée n'est pas une faute d'élève. Aucune règle ne peut être déclarée prête avant la vérification sur des voix humaines (séance courte du client, volontaires adultes).
3. **Petits échantillons pour les madd** : 52 à 55 mesures par voix ; une seule fausse alerte = 1,9 %. Détection madd : 10 cas.
4. **Modèle int8 uniquement** : les seuils sont à refaire si le modèle ou la quantification change.
5. **Lāzim** non calibrable (3 mesures). **Qalqala, rā, emphatiques, makhārij, ʿāriḍ, formants du lām** : non recalculés, car le décodage du Coran entier ne garde que les probabilités du modèle. Chiffres de l'étude du 25/10 inchangés (qalqala milieu 0 %, fin de verset 52,5 %, makhārij 3 à 77 % selon la paire) : ces règles restent éteintes.
6. La **médiane des autres voix**, comme référence, n'existe pas en production (un seul récitateur dans l'appli, Ayyūb) : d'où la variante « Ayyūb seul ». Les seuils d'ikhfāʾ non tenue et d'iẓhār tenu y sont un peu plus larges, la détection d'ikhfāʾ plus basse (81 % contre 92,5 %).
7. 289 versets sans décodage (voir § 1) : huthify manque dans toute la sourate 2, donc son poids est un peu plus faible dans les seuils.

## 6. Ce qui change dans le dépôt

- `services/ecoute-ia/seuils_tajwid.json` : la configuration (19 règles : seuil, état, fiabilité, chiffres). `etat` ∈ {`eteinte`, `indication`}. Seule `madd_muttasil` est en `indication` ; `madd_lazim` est `eteinte`. Aucune règle n'est « active ». Les trois règles « prêtes à valider » (ghunna très courte, iẓhār tenu, lām lourd après i) restent `eteinte`.
- `services/ecoute-ia/seuils_tajwid.py` : lecteur pur. Fichier absent, illisible, règle inconnue ou état inconnu = silence.
- `services/ecoute-ia/madd.py` : `R_COURT` lu dans la configuration (0,70, surcharge `MADD_R_COURT` conservée), `TYPES_ALLUMES` (lāzim éteint), fonction `rapport()` extraite de `decider()` (comportement identique, vérifié par les tests existants et par un test d'équivalence). Dockerfile : copie des deux fichiers.
- `services/ecoute-ia/calibration/` : `mesurer_cache.py` (lit `cache8`), `analyser_seuils.py`, `generer_seuils.py`, `seuils_mesures.json` (tous les chiffres), `tajwid_commun.py` (copie du prototype, inchangée).
- `services/ecoute-ia/tests/test_seuils_tajwid.py` (19 tests) et `test_madd.py` (le test des madd longs rallume lāzim par `monkeypatch`). Résultat : 47 tests, 47 réussis.

## 7. Reproduire

Sur la VM, sous `flock ~/.awzid-e2e.lock` (image `awzid/ecoute-ia:dcf4354`, 3 cœurs, environ 2 minutes de calcul au total) :

1. `mesurer_cache.py madd` puis `mesurer_cache.py regles 3` (lecture de `cache8`, sans audio) ;
2. `analyser_seuils.py` (avec `tajwid-fautes8.jsonl.gz`, `tajwid-correct8.jsonl.gz`, `madd-resultats.json` de l'étude du 25/10) ;
3. `generer_seuils.py seuils_mesures.json seuils_tajwid.json` (le test de régénération vérifie l'identité).

Les mesures brutes (une ligne par occurrence, sans audio) sont dans `~/tajwid-decodage/calib-out/` (madd.jsonl.gz, regles.jsonl.gz) ; elles ne sont pas dans le dépôt.

## 8. Suite proposée

1. Faire passer les 3 règles « prêtes à valider » par la séance courte du client (fichiers fautifs réels), avec fausses alertes mesurées sur ses passages justes.
2. Recueillir des voix de femmes et de débutants avant tout allumage, puisque les seuils sont réglés sur 5 voix d'hommes.
3. Pour le madd : la détection (80 % sur 10 cas) demande de vraies fautes, et le contrôle du nombre de madd ne laisse passer que 3 % des cas : voir s'il peut être affiné sans perdre en sûreté.
