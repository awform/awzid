# Tâches techniques à faire

Journal des tâches techniques décidées mais pas encore faites (le plus récent en haut). Chaque tâche : origine,
objectif, piste.

| Date | Origine | Tâche | Piste |
|---|---|---|---|
| 05/10/2026 | D-A12 (budget 360 Ko accepté provisoirement) | **Réduire le total JS + CSS de toutes les pages sous 325 Ko** (Brotli ; 354,9 Ko après A12). | Textes d'interface chargés par page/route plutôt que dans chaque page : aujourd'hui tout `messages/fr.json` est dans la coquille (les 173 textes de « Au quotidien » coûtent 4,4 Ko à chaque page) ; découper le catalogue par espace (coran, quotidien, enseignant…) et le charger avec la route, en gardant les contrôles de `i18n.test.ts`. |
| 05/10/2026 | D-A12 (rappels), pour F3/A16 | **Rappels des prières hors application ouverte.** | Avec l'application des boutiques : notifications locales natives programmées sur l'appareil (horaires calculés sur l'appareil, sans serveur ni position envoyée). Sur le web, les rappels restent limités à l'application ouverte. |
