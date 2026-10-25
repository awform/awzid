/**
 * 19/10/2026 — catalogue français de base DÉCOUPÉ PAR ESPACES. La coquille (`messages/fr.json`, dans le morceau
 * commun) ne garde que les textes affichables sur toutes les pages ou par plusieurs espaces ; ceux d'un seul espace
 * sont dans `static/i18n/fr-<espace>.json`. Les espaces qui ont leur propre mise en page chargent leurs textes
 * eux-mêmes (`/coran`, `/hifz`, `/quotidien`, `/vivre`, `/madjaliss`, personnel…) ; pour les autres, la table
 * ci-dessous (premier segment de la route) est lue par la mise en page racine : au premier chargement
 * (`+layout.ts`) et avant chaque navigation (`onNavigate`, `+layout.svelte`). Une table plutôt qu'une mise en page
 * par dossier : chaque mise en page ajoutée est un fichier de plus sur l'appareil de l'élève (~0,3 Ko chacun).
 * Contrôle : `couverture.test.ts` (toute clé affichée par une page est dans la coquille ou dans un catalogue chargé).
 */
export type TextesEspace = 'arabe' | 'suivi';

const ESPACES: Record<string, TextesEspace> = {
  // « Arabe » : accueil (Mon arabe), leçons, lectures, sciences, niveaux, révisions, écriture, épreuves, tests
  '': 'arabe',
  lecons: 'arabe',
  lectures: 'arabe',
  sciences: 'arabe',
  niveaux: 'arabe',
  revisions: 'arabe',
  ecriture: 'arabe',
  epreuves: 'arabe',
  positionnement: 'arabe',
  'epreuve-passage': 'arabe',
  activites: 'arabe',
  recital: 'arabe',
  carnet: 'arabe',
  sourates: 'arabe',
  cahier: 'arabe',
  'cahier-parler': 'arabe',
  // « Aujourd'hui et suivi »
  suivi: 'suivi',
  aujourdhui: 'suivi',
  plus: 'suivi',
  profils: 'suivi',
  'hors-ligne': 'suivi',
  aide: 'suivi',
};

/** Catalogue de l'espace d'une route (`/lecons/[id]` → « arabe ») ; aucun pour les autres espaces. */
export function textesDeRoute(id: string | null | undefined): TextesEspace | null {
  if (id == null) return null;
  return ESPACES[id.split('/')[1] ?? ''] ?? null;
}
