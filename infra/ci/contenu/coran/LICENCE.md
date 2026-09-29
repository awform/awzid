# Texte et métadonnées Tanzil — copies pour l'intégration continue

Ces deux fichiers servent UNIQUEMENT aux tests de l'intégration continue (batterie adverse du tuteur, tests
du hifẓ, contrôles des métadonnées) : l'application, elle, lit la copie des livres hors dépôt.

- `tanzil-uthmani.tsv` — Tanzil Quran Text (Uthmani), © Tanzil Project, tanzil.net, licence Creative Commons
  Attribution 3.0 : copie **verbatim** du texte des 6 236 versets (une ligne par verset : « sourate:verset »,
  tabulation, texte), aucun signe modifié. « Permission is granted to copy and distribute verbatim copies of
  this text, but changing it is not allowed. »
- `tanzil-quran-data.js` — Quran Metadata 1.0, © Tanzil.info, licence Creative Commons Attribution 3.0
  (tanzil.net/res/text/metadata/quran-data.js), inchangé ; empreinte SHA-256 contrôlée par
  `packages/content/src/qurandata.ts`.

Attribution affichée dans l'application : lecteur coranique (« Texte : Tanzil… Métadonnées : Tanzil.info,
licence CC BY 3.0 »). Ces fichiers sont exclus de Prettier et d'ESLint (jamais reformatés).