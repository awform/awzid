/**
 * Métadonnées officielles du Coran (Tanzil, « Quran Metadata ver 1.0 », © Tanzil.info, licence Creative
 * Commons Attribution 3.0 — attribution conservée dans l'application) : sourates, ajzāʾ, quarts de ḥizb,
 * manāzil, rukūʿ, pages du Muṣḥaf de Médine, sajdas. Le fichier `coran/tanzil-quran-data.js` est LU sans
 * être exécuté (aucune évaluation de code) : seules les paires numériques sont extraites, puis contrôlées
 * (empreinte SHA-256 attendue et invariants : 114 sourates, 6 236 versets, 30 ajzāʾ, 240 quarts, 604 pages).
 */
import { createHash } from 'node:crypto';

/** Empreinte SHA-256 du fichier fourni le 29/09/2026 (tanzil.net/res/text/metadata/quran-data.js). */
export const TANZIL_QURAN_DATA_SHA256 =
  '9e9930c592aaa34b5c7a79ff4e99ffdc782263a266090bfe2c49e4ed4bac4ca4';
export const TANZIL_METADATA_CREDIT =
  'Métadonnées : Tanzil.info (Quran Metadata 1.0), licence CC BY 3.0';

export type Start = readonly [number, number];

export interface QuranDivisions {
  /** nombre de versets de chaque sourate (1 → 114) */
  ayas: number[];
  /** début (sourate, verset) de chaque juzʾ, quart de ḥizb, page, manzil */
  juz: Start[];
  quarters: Start[];
  pages: Start[];
  manzil: Start[];
}

function block(src: string, name: string): string {
  const i = src.indexOf(`QuranData.${name} = [`);
  if (i < 0) throw new Error(`QuranData.${name} absent`);
  const j = src.indexOf('];', i);
  return src.slice(i, j);
}

/** Paires [sourate, verset] d'un bloc (le premier élément vide `[]` est ignoré). */
function pairs(src: string, name: string): Start[] {
  return [...block(src, name).matchAll(/\[\s*(\d+)\s*,\s*(\d+)\s*\]/g)].map(
    (m) => [Number(m[1]), Number(m[2])] as const,
  );
}

export function parseQuranData(src: string): QuranDivisions {
  const ayas = [...block(src, 'Sura').matchAll(/^\s*\[\s*(\d+)\s*,\s*(\d+)\s*,/gm)].map((m) =>
    Number(m[2]),
  );
  // chaque bloc se termine par une borne de fin ([115, 1]) : on la retire
  const trim = (x: Start[]) => (x.length && x[x.length - 1]![0] === 115 ? x.slice(0, -1) : x);
  return {
    ayas: ayas.slice(0, 114),
    juz: trim(pairs(src, 'Juz')),
    quarters: trim(pairs(src, 'HizbQaurter')),
    pages: trim(pairs(src, 'Page')),
    manzil: trim(pairs(src, 'Manzil')),
  };
}

export interface QuranDataCheck {
  ok: boolean;
  sha256: string;
  errors: string[];
}

export function checkQuranData(src: string, d: QuranDivisions): QuranDataCheck {
  const sha256 = createHash('sha256').update(src).digest('hex');
  const errors: string[] = [];
  if (sha256 !== TANZIL_QURAN_DATA_SHA256) errors.push(`empreinte inattendue ${sha256}`);
  if (d.ayas.length !== 114) errors.push(`${d.ayas.length} sourates au lieu de 114`);
  const total = d.ayas.reduce((a, b) => a + b, 0);
  if (total !== 6236) errors.push(`${total} versets au lieu de 6 236`);
  if (d.juz.length !== 30) errors.push(`${d.juz.length} ajzāʾ au lieu de 30`);
  if (d.quarters.length !== 240) errors.push(`${d.quarters.length} quarts de ḥizb au lieu de 240`);
  if (d.pages.length !== 604) errors.push(`${d.pages.length} pages au lieu de 604`);
  if (d.manzil.length !== 7) errors.push(`${d.manzil.length} manāzil au lieu de 7`);
  for (const [name, list] of [
    ['juz', d.juz],
    ['quarts', d.quarters],
    ['pages', d.pages],
  ] as const) {
    if (list[0]?.[0] !== 1 || list[0]?.[1] !== 1) errors.push(`${name} : ne commence pas en 1:1`);
    for (let i = 1; i < list.length; i++) {
      const [s0, a0] = list[i - 1]!;
      const [s, a] = list[i]!;
      if (s < s0 || (s === s0 && a <= a0))
        errors.push(`${name} : ordre non croissant à l'indice ${i}`);
      if (a < 1 || a > (d.ayas[s - 1] ?? 0)) errors.push(`${name} : verset inexistant ${s}:${a}`);
    }
  }
  // chaque juzʾ commence sur un quart de ḥizb (8 quarts par juzʾ)
  d.juz.forEach(([s, a], i) => {
    const q = d.quarters[i * 8];
    if (!q || q[0] !== s || q[1] !== a)
      errors.push(`juzʾ ${i + 1} ne commence pas au quart ${i * 8 + 1}`);
  });
  return { ok: errors.length === 0, sha256, errors };
}
