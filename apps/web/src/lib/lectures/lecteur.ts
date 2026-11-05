/**
 * Lecteur audio des récits (maquette validée « nouh-v2 ») — logique pure :
 *  - le manifeste décrit un texte réécrit pour l'oreille ; chaque entrée porte `l`, la ligne du récit écrit qu'elle accompagne :
 *    on surligne le bloc dont la ligne est la plus grande ≤ l ;
 *  - les entrées `verset` (sans fichier) : la récitation d'Ayyūb prend la main (5/11, `Recit.svelte` ; `sourceRecitation` de
 *    `$lib/recitation/ayyub`, versets enchaînés), puis la synthèse reprend ; jamais de voix de synthèse sur l'arabe ;
 *    récitation indisponible : courte pause, puis la suite ;
 *  - les MP3 sont servis par le serveur (`/histoires/audio/…`), jamais préchargés.
 */
export interface Entree {
  f?: string;
  v?: string;
  l: number;
}
export interface Item {
  src: string | null;
  verset: string | null;
  /** indice du bloc dans la liste triée des lignes */
  bloc: number;
  /** numéro du passage audio (1..nbFichiers), 0 pour un verset */
  num: number;
}
export const DOSSIER_LIVRE: Record<string, string> = {
  l1: 'prophetes',
  l2: 'livre2',
  l4: 'livre4',
  l5: 'livre5',
  /** avertissement au lecteur (5/11), commun à tous les livres */
  commun: 'commun',
};
const FICHIER = /^p\d{3}\.mp3$/;

/** `lignes` : lignes des blocs lisibles, triées croissantes. */
export function construireItems(
  entrees: Entree[],
  lignes: number[],
  livre: string,
  recit: string,
  version: 'enfant' | 'adulte',
): Item[] {
  const dossier = DOSSIER_LIVRE[livre];
  if (!dossier) return [];
  const items: Item[] = [];
  let num = 0;
  for (const e of entrees) {
    let bloc = -1;
    for (let i = 0; i < lignes.length && lignes[i]! <= e.l; i++) bloc = i;
    if (bloc < 0) continue;
    if (e.f && FICHIER.test(e.f))
      items.push({
        src: `/histoires/audio/${dossier}/${encodeURIComponent(recit)}/${version}/${e.f}`,
        verset: null,
        bloc,
        num: ++num,
      });
    else if (e.v) items.push({ src: null, verset: e.v, bloc, num: 0 });
  }
  return items;
}

const PERMIS = /<\/?(?:strong|em)>|<span class="ar-in" lang="ar" dir="rtl">|<\/span>/g;
/** HTML d'un récit : seulement les balises permises, sinon tout est échappé (jamais de balise inattendue) */
export function htmlSur(h: string): string {
  if (!/[<>]/.test(h.replace(PERMIS, ''))) return h;
  return h.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** indice du passage audio voisin (en sautant les versets), -1 s'il n'y en a pas */
export function voisin(items: Item[], depuis: number, pas: 1 | -1): number {
  for (let j = depuis + pas; j >= 0 && j < items.length; j += pas) if (items[j]!.src) return j;
  return -1;
}
