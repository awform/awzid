# Grille RGAA 4.1 — Awzid (lot 24, V1-h)

État au 30/09/2026 (branche `suite-v1-b`). Référentiel : RGAA 4.1 (13 thématiques, 106 critères). Cette
grille regroupe les critères **applicables** à l'application web (SvelteKit) ; pour chacun : état, preuve.

États : **C** conforme · **NC** non conforme · **NA** non applicable · **AV** à vérifier à la main (avec un
lecteur d'écran — NVDA, TalkBack, VoiceOver — et par une personne formée ; aucun contrôle automatique ne
suffit à déclarer la conformité).

Contrôles automatiques :

- **axe-core** (WCAG 2.1 A et AA, aucune violation « serious » ou « critical ») : `apps/web/e2e/a11y.spec.ts`,
  sur téléphone et sur ordinateur — écrans publics, apprenant, famille, enseignant (**tous les onglets de la
  classe**, dont messagerie et sourates), `/messages`, `/sourates`, `/activation`, et **interface en arabe**
  (droite à gauche) sur `/compte`, `/messages`, `/sourates`, `/activation`, `/aide`.
- **contrôles statiques** : `apps/web/src/lib/rgaa.test.ts` (5.4, 8.3, 8.5, 10.7, 12.7).
- **clavier** : lien d'évitement premier arrêt, mène au contenu (`a11y.spec.ts`, « RGAA 12.7 »).

Dernier passage : 30/09/2026 dans le conteneur cloud (contenu synthétique) — écrans ne dépendant pas des
livres : 0 violation grave. Les écrans qui dépendent des livres (leçons, bilans, lecteur coranique complet) sont
audités par le même fichier sur la VM (`a11y.spec.ts`, « adulte »).

## 1. Images

| Critère | État | Preuve |
|---|---|---|
| 1.1 Image porteuse d'information : alternative | C | aucune balise `<img>` ; illustrations en SVG (`Sprite.svelte`), icônes `aria-hidden="true"` avec libellé sur le lien (`+layout.svelte`, `aria-label`) ; axe `image-alt`, `svg-img-alt` |
| 1.2 Image de décoration ignorée | C | icônes décoratives `aria-hidden="true"` (`+layout.svelte`, onglets) |
| 1.3 Alternative pertinente | AV | illustrations des mots des leçons : vérifier que le mot (arabe + sens) est donné en texte à côté |
| 1.6 Description détaillée | NA | pas d'image complexe (schéma, graphique) ; barres d'activité doublées d'un tableau (`ActivityBars.svelte`) |
| 1.8 Image texte | C | aucun texte en image ; texte arabe en police web (`Ar.svelte`) |

## 2. Cadres

| Critère | État | Preuve |
|---|---|---|
| 2.1 / 2.2 Titre de cadre | NA | aucun `<iframe>` (visio : lien externe ouvert à part, `MessagerieClasse.svelte`) |

## 3. Couleurs

| Critère | État | Preuve |
|---|---|---|
| 3.1 Information pas seulement par la couleur | AV | lettres colorées des leçons (`Ar.svelte`, balisage `[..]`) : la couleur désigne la lettre étudiée, aussi nommée dans la consigne ; à confirmer avec un élève daltonien |
| 3.2 Contraste du texte (4,5:1) | C | axe `color-contrast` sans violation grave ; jetons de couleur `lib/theme/tokens.css` |
| 3.3 Contraste des composants (3:1) | AV | bordures des champs (`--line`) et cases du carnet : à mesurer |

## 4. Multimédia

| Critère | État | Preuve |
|---|---|---|
| 4.1 Transcription d'un média temporel | NA | seul média : enregistrement de récitation de l'élève (`Recorder.svelte`, écoute enseignant) ; pas de contenu publié en audio (audio Azure non activé) |
| 4.10 Son déclenché automatiquement | C | aucune lecture automatique (`<audio controls>` seulement) |
| 4.11 Contrôle au clavier | C | lecteur natif du navigateur |

## 5. Tableaux

| Critère | État | Preuve |
|---|---|---|
| 5.4 Titre de tableau de données | C (sauf religion : AV) | `aria-label` / `aria-labelledby` sur tous les tableaux de l'application ; contrôlé par `rgaa.test.ts` ; les tableaux repris des livres de religion (`lib/religion/`) n'ont pas de titre propre dans les données : AV |
| 5.6 En-têtes déclarés | C | `<th>` dans `<thead>` ; lignes du carnet `<th scope="row">` (`CarnetPratique.svelte`) |
| 5.7 Association cellules / en-têtes | C | tableaux simples (un seul niveau d'en-têtes) |
| 5.8 Tableau de mise en forme | C | aucun tableau utilisé pour la mise en page |

## 6. Liens

| Critère | État | Preuve |
|---|---|---|
| 6.1 Lien explicite | C / AV | liens-icônes avec `aria-label` (compte, téléchargements) ; axe `link-name` ; à relire : liens « Voir » répétés dans les listes |
| 6.2 Lien avec intitulé | C | axe `link-name` |

## 7. Scripts

| Critère | État | Preuve |
|---|---|---|
| 7.1 Composant compatible technologies d'assistance | AV | exercices interactifs (glisser, relier, tracer) : alternatives par boutons présentes ; à tester avec TalkBack |
| 7.3 Contrôlable au clavier | AV | tracé des lettres (`lot6`) : geste au doigt, pas d'équivalent clavier (exercice d'écriture ; dispense à prévoir, décision pédagogique) |
| 7.4 Changement de contexte annoncé | C | aucun changement de page sans action ; changement de langue sur clic explicite |
| 7.5 Messages de statut | C | `role="status"` / `role="alert"` (71 occurrences) pour les confirmations et erreurs |

## 8. Éléments obligatoires

| Critère | État | Preuve |
|---|---|---|
| 8.1 Type de document | C | `<!doctype html>` (`app.html`) |
| 8.2 Code valide | AV | à valider au validateur W3C sur les pages construites |
| 8.3 Langue par défaut | C | `<html lang="fr" dir="ltr">`, mis à jour à chaque changement de langue (`lib/i18n/index.ts`) ; `rgaa.test.ts`, `suite-v1.spec.ts` (arabe → `lang="ar" dir="rtl"`) |
| 8.4 Langue pertinente | C | code de langue de l'interface choisie (fr, en, es, de, ar) |
| 8.5 / 8.6 Titre de page pertinent | C | chaque page a `<title>` (`rgaa.test.ts`) : « <nom de l’application> — <écran> » |
| 8.7 Changement de langue | C | tout texte arabe passe par `Ar.svelte` (`lang="ar" dir="rtl"`) ; Coran : `quran-text lang="ar"` |
| 8.9 Balises pour la présentation | C | pas de `<b>`/`<i>`/`<br>` de mise en forme hors texte des livres |

## 9. Structuration

| Critère | État | Preuve |
|---|---|---|
| 9.1 Titres hiérarchisés | C / AV | un `<h1>` par page (`main h1` attendu par les e2e) ; `axe heading-order` sans violation grave ; hiérarchie des onglets de classe à relire |
| 9.2 Structure du document | C | `<header>`, `<nav aria-label>`, `<main id="contenu">`, `<footer>` (`+layout.svelte`) |
| 9.3 Listes | C | `<ul>`/`<ol>` pour les listes (messages, sourates, séances) |

## 10. Présentation

| Critère | État | Preuve |
|---|---|---|
| 10.1 Présentation par CSS | C | aucun attribut de présentation |
| 10.4 Zoom 200 % | AV | mise en page fluide (`rem`, grilles) ; à tester à 200 % sur téléphone |
| 10.7 Focus visible | C | `:focus-visible` (contour 3 px) sur boutons, liens, champs, listes, `summary`, `[tabindex]` (`app.css`, `rgaa.test.ts`) — **corrigé au lot 24** (avant : boutons et liens seulement) |
| 10.11 Pas de défilement horizontal à 320 px | AV | tableaux dans `.tw` (défilement du seul tableau) ; captures e2e sur Pixel 7 |
| 10.12 Espacement du texte modifiable | AV | à tester avec le bookmarklet d'espacement |
| 10.13 Contenu au survol / focus | C | pas d'infobulle maison (attribut `title` seulement en complément) |

## 11. Formulaires

| Critère | État | Preuve |
|---|---|---|
| 11.1 Étiquette | C | axe `label` sans violation grave ; `<label for>` (ex. `MessagerieClasse.svelte`, `#vt`, `#vd`, `#vu`) |
| 11.2 Étiquette pertinente | AV | à relire, surtout en es/de/ar (traductions à relire, D14) |
| 11.10 Contrôle de saisie | C | messages d'erreur en toutes lettres, `role="alert"` (ex. code d'activation « mal saisi ») |
| 11.11 Suggestions de correction | C | erreurs expliquées (« vérifiez chaque caractère », code parent) |
| 11.13 Finalité des champs (`autocomplete`) | C / AV | e-mail et mot de passe `autocomplete` ; code parent `autocomplete="off"` volontaire |

## 12. Navigation

| Critère | État | Preuve |
|---|---|---|
| 12.1 Deux systèmes de navigation | NC | menu (onglets par matière) seulement ; ni plan du site ni recherche. Proposition : page « plan du site » (lot suivant) |
| 12.6 Zones regroupées atteignables | C | `nav aria-label`, `main`, `footer` |
| 12.7 Lien d'évitement | C | « Aller au contenu », premier élément, visible au focus (`+layout.svelte`, `app.css`) ; `rgaa.test.ts` + e2e clavier — **ajouté au lot 24** |
| 12.8 Ordre de tabulation | AV | ordre du document ; à vérifier sur l'espace enseignant (onglets) |
| 12.9 Pas de piège au clavier | AV | à tester (tracé, lecteur coranique) |

## 13. Consultation

| Critère | État | Preuve |
|---|---|---|
| 13.1 Limite de temps contrôlable | C | mode école : retour à la grille après inactivité, réglable par l'adulte (`horsligne.spec.ts` « mode école ») ; épreuves notées : durée fixée par l'enseignant (aménagement possible hors application) — AV |
| 13.2 Pas d'ouverture de fenêtre sans action | C | seul le lien de visio ouvre un nouvel onglet, sur clic |
| 13.3 Documents téléchargeables accessibles | AV | certificats imprimés depuis une page HTML (texte réel, pas d'image) ; PDF produit par le navigateur |
| 13.7 Changements brusques de luminosité | C | aucun clignotement |
| 13.8 Contenu en mouvement contrôlable | C | `prefers-reduced-motion: reduce` respecté (`tokens.css`, `Exercise.svelte`, test `tokens.test.ts`) |
| 13.9 Orientation | C | aucune orientation imposée |
| 13.11 Gestes complexes | AV | tracé des lettres (geste libre, par nature) ; tous les autres exercices au simple appui |

## Défauts corrigés au lot 24

1. **Lien d'évitement** absent (12.7) → ajouté, testé au clavier.
2. **Focus visible** limité aux boutons et liens (10.7) → étendu aux champs, listes, `summary`, `[tabindex]`.
3. **Titre des tableaux** absent (5.4) → `aria-labelledby` vers le titre de section ou `aria-label`
   (classe, suivi, copies, niveaux hors ligne, administration, carnet de pratique, rythmes du hifẓ, formes
   des lettres).

## Reste à faire (hors code automatique)

- Audit manuel avec lecteurs d'écran (NVDA sur ordinateur, TalkBack sur un téléphone Android d'entrée de gamme).
- 12.1 : second système de navigation (plan du site).
- 7.3 / 13.11 : équivalent ou dispense pour le tracé des lettres (décision pédagogique).
- Déclaration d'accessibilité (obligatoire pour un service public ; à décider pour une école privée — juriste).
