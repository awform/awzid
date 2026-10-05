# Tâches techniques à faire

Journal des tâches techniques décidées mais pas encore faites (le plus récent en haut). Chaque tâche : origine,
objectif, piste.

| Date | Origine | Tâche | Piste |
|---|---|---|---|
| 05/10/2026 | F2 (mesure du découpage des textes) | **Total sous 325 Ko : ne plus garder hors ligne, sur l'appareil d'un élève, ce qui ne sert qu'au personnel.** F2 a mesuré que charger les textes par route baisse la page la plus lourde (−17 Ko) mais HAUSSE le total (+7,1 Ko ; +3,8 Ko en 4 groupes) : le total compte tout ce que le service worker garde, et des morceaux compressés séparément pèsent plus que le tout. F2 a gagné 9 Ko (formateur ICU minimal) : total 362,0 Ko. La tâche ci-dessous (D-A12) est donc remplacée par celle-ci. | Exclure du préchargement du service worker les pages `/enseignant/*`, `/admin` et leurs composants (≈ 40-50 Ko) — gardés au premier usage (le personnel est en ligne pour le second facteur) ; il faut connaître leurs morceaux : nommer les morceaux du personnel (option de Rollup) ou écrire leur liste à la construction, puis compter un budget « appareil d'élève ». |
| 05/10/2026 | D-A12 (budget 360 Ko accepté provisoirement) | **Réduire le total JS + CSS de toutes les pages sous 325 Ko** (Brotli ; 354,9 Ko après A12). | Textes d'interface chargés par page/route plutôt que dans chaque page : aujourd'hui tout `messages/fr.json` est dans la coquille (les 173 textes de « Au quotidien » coûtent 4,4 Ko à chaque page) ; découper le catalogue par espace (coran, quotidien, enseignant…) et le charger avec la route, en gardant les contrôles de `i18n.test.ts`. |
| 05/10/2026 | D-A12 (rappels), pour F3/A16 | **Rappels des prières hors application ouverte.** | Avec l'application des boutiques : notifications locales natives programmées sur l'appareil (horaires calculés sur l'appareil, sans serveur ni position envoyée). Sur le web, les rappels restent limités à l'application ouverte. |
