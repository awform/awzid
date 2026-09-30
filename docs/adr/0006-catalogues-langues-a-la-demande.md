# ADR 0006 — Catalogues de langues chargés à la demande (lot 25)

Date : 30/09/2026. Statut : accepté.

## Contexte

L'interface existe en français (référence) et en anglais, espagnol, allemand, arabe (RTL). Embarquer tous les
catalogues dans le JavaScript dépassait le budget de poids (D4 : 150 Ko pour la page la plus lourde) sur les
téléphones d'entrée de gamme et les réseaux lents.

## Décision

1. Le **français** reste dans le JavaScript (`apps/web/src/lib/i18n/messages/fr.json`) : il sert aussi de
   repli.
2. Les autres langues sont des **fichiers statiques** `apps/web/static/i18n/<langue>.json`, téléchargés
   **seulement** quand la langue est choisie ; le service worker ne les précharge pas (gardés au premier usage).
3. Contrôle automatique : mêmes clés et **mêmes arguments ICU** que le français, MessageFormat valide
   (`apps/web/scripts/verifier-traduction.mjs`, test i18n) ; `lang` et `dir` posés sur toute la page.
4. Langues non relues par un locuteur natif : statut « en préparation », visibles seulement sur option (D14).

## Conséquences

- JavaScript de toutes les pages : 243,6 → 222,2 Ko au lot 25 (≤ 300) ; page la plus lourde ≤ 150 Ko (tenu
  depuis, 112,6 Ko au 30/09/2026).
- Premier passage à une autre langue : un téléchargement (quelques dizaines de Ko) ; hors ligne, la langue
  déjà utilisée reste disponible.
- Chaque nouvelle clé doit être ajoutée dans les cinq fichiers (le test échoue sinon).
