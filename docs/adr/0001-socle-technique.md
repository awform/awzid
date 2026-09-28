# ADR 0001 — Socle technique du lot 1

Date : 28/09/2026. Statut : accepté.

## Décisions

1. **Node.js 24 LTS** (« Krypton », LTS active en septembre 2026) au lieu de Node 22 cité dans le cahier :
   22 est en maintenance ; 26 ne deviendra LTS qu'en octobre 2026.
2. **PostgreSQL 18** (version des dépôts Ubuntu 26.04) au lieu de 16 : fonction native `uuidv7()`,
   aucune fonctionnalité perdue.
3. **TypeScript 6.0** (dernière version écrite en JavaScript) et non 7.0 (compilateur natif) :
   typescript-eslint et SvelteKit exigent < 6.1 / ≤ 6.
4. **pnpm 10.34** (branche maintenue, comportement connu) plutôt que pnpm 12 sorti il y a un mois.
5. **Monorepo** : `packages/content` (au lieu de `content-schema` + `importer` séparés), `packages/grading`
   (= `@awform/correction` du cahier), `packages/db` (schéma et import partagés par l'API et le futur worker).
6. **Identifiants d'exercices** : `<unité>.ex<k>` (position) + empreinte SHA-256 du JSON canonique ;
   clé complète `<id>#<12 hex>`. Les livres ne sont pas modifiés (question 8.2-5 du cahier en attente).
7. **Fichiers non stricts** (`book.js`, `index-lecons.js`, `en1/l01.js`) : lus dans un bac à sable
   `node:vm` (contexte sans prototype hôte, génération de code interdite, délai 1 s) ; les valeurs
   repassent par JSON. `en1/l01.js` est signalé en avertissement (à convertir en JSON strict dans les livres).
8. **Correction** : fidèle au moteur (un nouvel essai est permis ; les erreurs de sélection sont comptées
   mais ne retirent pas de points) ; comparaisons exactes après `plain` / `bare` comme `awform.js`.
9. **Projection élève** calculée à l'import et stockée (`unit_version.student`) ; l'API ne sert qu'elle.
10. **Polices** : paquets `@fontsource` (OFL) copiés dans `static/fonts` au build ; `font-display: block`
    pour Amiri Quran.
