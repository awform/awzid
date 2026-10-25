# @awform/coran-mots-data

Données « Mots du Coran » d'Awzid : pour chaque mot du Coran (77 429 mots, 6 236 versets), son lemme, sa racine et sa
nature, rattachés aux leçons de nos livres. **Licence GNU GPL v3** (dérivées du Quranic Arabic Corpus) : voir `LICENSE`
et `NOTICE.md`. Ce dossier est volontairement **séparé du code** de l'application.

| Fichier | Contenu |
|---|---|
| `data/sourates/NNN.json` | par sourate, pour chaque verset, un nombre par mot de Tanzil (hors signes de pause isolés) : `rang × 2 + (1 si nom, verbe ou adjectif)`, une liste pour un mot à plusieurs lemmes, `-1` pour un mot hors décompte (lettres isolées) ; rang `0` = lemme absent de la liste des 1 000 |
| `data/rangs.json` | pour chaque rang de la liste des 1 000 : le lemme en arabe et la leçon qui l'enseigne en premier (`ad1.l07`) |
| `data/mots.tsv` | un mot par ligne : référence `sourate:verset:rang`, forme de Tanzil, racine, lemme (Buckwalter), lemmes secondaires |
| `data/lemmes.tsv` | un lemme par ligne : clé Buckwalter, lemme, racine, nature, rang |
| `data/racines-sens.json` | sens de base rédigés par Awzid, **avec leur statut** : un sens `a_verifier` n'est jamais affiché |
| `data/meta.json` | version, attribution, empreintes SHA-256 |
| `source/` | fichiers complets de l'étude (compressés), point de départ de `scripts/generer.mjs` |
| `reference/couverture.json.gz` | couverture de chaque sourate par niveau, calculée à part : sert de témoin aux tests |

Régénérer : `node scripts/generer.mjs` (option `--tanzil <tanzil-uthmani.tsv>` : vérifie que les formes recollent le
texte de Tanzil octet pour octet). Les sens des racines viennent de `racines.json` ; tant qu'ils sont `a_verifier`,
l'application n'affiche que la famille de mots.

Le texte du Coran n'est jamais normalisé : la normalisation (voyelles, alif) ne sert qu'à **comparer** une recherche.
