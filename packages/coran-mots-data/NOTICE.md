# Attribution et avis de modification

Ce dossier contient des **données dérivées**. Il est séparé du code de l'application Awzid : le code lit ces fichiers
à l'exécution, il ne les recopie pas. Ce dossier (et lui seul) est placé sous **GNU General Public License v3** (voir
`LICENSE`).

## Source des données

**Quranic Arabic Corpus**, version 0.4 (analyse morphologique : racine, lemme et nature de chaque mot du Coran).
© Kais Dukes, université de Leeds, 2009–2011. Site : <http://corpus.quran.com>.
Licence d'origine : GNU General Public License v3 (<http://corpus.quran.com/license.jsp>).

Conditions d'usage de l'auteur, respectées ici : la source est indiquée, un lien vers <http://corpus.quran.com> figure
dans l'application (écran « À propos », rubrique « Mots du Coran ») et le fichier d'origine n'est pas modifié (il est
lu, puis un autre fichier est écrit).

**Texte coranique** : Tanzil Project, <http://tanzil.net>, texte « quran-uthmani », licence Creative Commons
Attribution 3.0. Les formes de `data/` sont les jetons de Tanzil, octet pour octet.

## Avis de modification (GPL v3, article 5a)

Données **modifiées par Awzid le 25/10/2026** à partir du fichier d'origine `quranic-corpus-morphology-0.4.txt` :
conversion de la translittération Buckwalter en écriture arabe, regroupement des segments par mot de Tanzil,
rattachement des lemmes à la liste des 1 000 mots de nos livres et à la leçon qui les enseigne, découpage par sourate.
Les fichiers de `source/` sont les fichiers complets de l'étude ; `data/` en est tiré par `scripts/generer.mjs`.

Aucune garantie : voir les articles 15 à 17 de la licence.
