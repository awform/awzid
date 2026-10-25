// 25/10/2026 — MUTASHĀBIHĀT dans le hifẓ : convertit la carte du référent (packages/content/data/mutashabihat/mutashabihat.json, copiée
// telle quelle du dossier de conception) en données COMPACTES pour l'application (src/lib/mutashabihat/donnees.json).
//  - SEULES les paires au statut « reconnu_source » (les deux versets cités, chacun par sa propre citation, dans la même
//    masʾala d'al-Kirmānī ou le même vers d'as-Sakhāwī) sont gardées ; les autres statuts ne sortent JAMAIS de ce script ;
//  - aucun texte coranique n'est copié : seulement des RÉFÉRENCES de versets et des RANGS de mots (index de `texte.split(' ')`,
//    basmala préfixée comprise) ; le texte vient de Tanzil, octet par octet, au moment de l'affichage ;
//  - le repère affiché est celui « proposé par Awzid » (aide-mémoire factuel) ; les vers d'as-Sakhāwī (« à collationner avec
//    l'édition imprimée ») ne sont PAS repris ; aucune explication (tawjīh).
// Usage : node scripts/mutashabihat-donnees.mjs [--verifier]   (--verifier : échoue si le fichier écrit n'est pas à jour)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ici = dirname(fileURLToPath(import.meta.url));
export const SOURCE = join(
  ici,
  '..',
  '..',
  '..',
  'packages',
  'content',
  'data',
  'mutashabihat',
  'mutashabihat.json',
);
export const SORTIE = join(ici, '..', 'src', 'lib', 'mutashabihat', 'donnees.json');
export const STATUT_AFFICHE = 'reconnu_source';

/** Convertit la carte du référent en données compactes (déterministe : même entrée, mêmes octets). */
export function convertir(carte) {
  const ouvrages = [];
  const idx = (nom) => {
    let i = ouvrages.indexOf(nom);
    if (i < 0) i = ouvrages.push(nom) - 1;
    return i;
  };
  const paires = [];
  for (const g of carte.groupes)
    for (const p of g.paires) {
      if (p.statut !== STATUT_AFFICHE) continue;
      // différences exactes de la paire (celles de l'alignement retenu) ; aucune : « formule commune », le passage commun est montré
      const diffs = p.differences.map((d) => [d.pos_a, d.pos_b]);
      const sources = [];
      for (const s of p.sources ?? []) {
        const k = [idx(s.ouvrage), s.sourate_section ?? 0, s.masala ?? 0, s.page_url ?? ''].join(
          '|',
        );
        if (!sources.some((x) => x.join('|') === k))
          sources.push([idx(s.ouvrage), s.sourate_section ?? 0, s.masala ?? 0, s.page_url ?? '']);
      }
      paires.push([
        p.a,
        p.b,
        p.segment_a ?? null,
        p.segment_b ?? null,
        diffs,
        p.repere?.texte_fr ?? '',
        sources,
        g.id,
      ]);
    }
  return {
    v: 1,
    version: carte.version,
    statut: STATUT_AFFICHE,
    ouvrages,
    // [a, b, segment a, segment b, [[rang a, rang b]…], repère « proposé par Awzid », [[ouvrage, sourate, masʾala, page]…], groupe]
    paires,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const carte = JSON.parse(readFileSync(SOURCE, 'utf8'));
  const sortie = `${JSON.stringify(convertir(carte))}\n`;
  if (process.argv.includes('--verifier')) {
    if (!existsSync(SORTIE) || readFileSync(SORTIE, 'utf8') !== sortie) {
      console.error('donnees.json n’est pas à jour : relancer scripts/mutashabihat-donnees.mjs');
      process.exit(1);
    }
    console.log('donnees.json à jour');
  } else {
    writeFileSync(SORTIE, sortie);
    console.log(`${JSON.parse(sortie).paires.length} paires « ${STATUT_AFFICHE} » écrites`);
  }
}
