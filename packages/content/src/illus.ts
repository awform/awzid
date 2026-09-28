/**
 * Illustrations des livres (awform/illus/*.js : `AW.illus(clé, viewBox, contenu SVG)`), CDC §3.4 et §5.3.
 * - Ordre de chargement des pages des livres : ordre alphabétique des fichiers, `zz-sansvisage.js` EN DERNIER
 *   (ses dessins sans visage remplacent les personnages) ; une clé redéfinie garde la dernière définition.
 * - SVG VALIDÉ par liste blanche (éléments et attributs de dessin seulement, aucun script, aucun lien,
 *   aucun texte) : tout écart est une erreur bloquante ; le SVG accepté est conservé tel quel.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { evalSandboxed } from './parse.js';
import type { Issue } from './types.js';

/** Les 12 personnages autorisés par la charte (SCHEMA.md), dessinés sans visage. */
export const PERSONNAGES = [
  'youssouf',
  'maryam',
  'fatou',
  'papa',
  'maman',
  'grandpere',
  'grandmere',
  'adam',
  'khadija',
  'ilyas',
  'imam',
  'hadj',
] as const;

export const SANS_VISAGE_FILE = 'zz-sansvisage.js';

export interface Illustration {
  key: string;
  viewBox: string;
  svg: string;
  /** fichier de la définition retenue */
  file: string;
}

const ELEMENTS = new Set(['g', 'path', 'rect', 'circle', 'ellipse', 'polygon', 'polyline', 'line']);
const ATTRIBUTES = new Set([
  'd',
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'width',
  'height',
  'points',
  'fill',
  'fill-opacity',
  'fill-rule',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-miterlimit',
  'opacity',
  'transform',
  'color',
]);

/** Vérifie un fragment SVG ; renvoie la liste des problèmes (vide = accepté). */
export function validateSvg(svg: string): string[] {
  const problems: string[] = [];
  const tagRe = /<(\/?)([a-zA-Z][\w:-]*)([^>]*)>/g;
  let last = 0;
  for (let m = tagRe.exec(svg); m; m = tagRe.exec(svg)) {
    const between = svg.slice(last, m.index);
    if (between.trim()) problems.push(`texte hors balise : « ${between.trim().slice(0, 20)} »`);
    last = m.index + m[0].length;
    const [, closing, name = '', rest = ''] = m;
    if (!ELEMENTS.has(name)) {
      problems.push(`élément interdit <${name}>`);
      continue;
    }
    if (closing) continue;
    const body = rest.replace(/\/\s*$/, '');
    const attrRe = /\s*([a-zA-Z][\w:-]*)\s*=\s*"([^"]*)"/g;
    let consumed = '';
    for (let a = attrRe.exec(body); a; a = attrRe.exec(body)) {
      consumed += a[0];
      const attr = a[1] ?? '';
      const value = a[2] ?? '';
      if (!ATTRIBUTES.has(attr)) problems.push(`attribut interdit ${attr} sur <${name}>`);
      if (/url\s*\(|javascript:|[<>]|&#|expression\s*\(/i.test(value))
        problems.push(`valeur interdite pour ${attr} sur <${name}>`);
    }
    if (consumed.replace(/\s+/g, '') !== body.replace(/\s+/g, ''))
      problems.push(`attributs illisibles sur <${name}>`);
  }
  if (svg.slice(last).trim()) problems.push('texte hors balise en fin de fragment');
  return problems;
}

export function illustrationFiles(dir: string): string[] {
  const files = readdirSync(dir).filter((f) => f.endsWith('.js') && f !== SANS_VISAGE_FILE);
  files.sort();
  if (readdirSync(dir).includes(SANS_VISAGE_FILE)) files.push(SANS_VISAGE_FILE);
  return files;
}

export interface IllustrationLoad {
  illustrations: Map<string, Illustration>;
  issues: Issue[];
}

export function loadIllustrations(dir: string): IllustrationLoad {
  const illustrations = new Map<string, Illustration>();
  const issues: Issue[] = [];
  for (const f of illustrationFiles(dir)) {
    const rel = `illus/${f}`;
    let out: Record<string, unknown>;
    try {
      out = evalSandboxed(readFileSync(join(dir, f), 'utf8'), rel, 5000);
    } catch (e) {
      issues.push({
        severity: 'erreur',
        code: 'illus_lecture',
        file: rel,
        message: (e as Error).message,
      });
      continue;
    }
    const map = (out.illus ?? {}) as Record<string, { vb: string; svg: string }>;
    for (const [key, v] of Object.entries(map)) {
      illustrations.set(key, { key, viewBox: v.vb, svg: v.svg, file: f });
    }
  }
  for (const ill of illustrations.values()) {
    if (!/^-?[\d.]+ -?[\d.]+ [\d.]+ [\d.]+$/.test(ill.viewBox))
      issues.push({
        severity: 'erreur',
        code: 'illus_viewbox',
        file: `illus/${ill.file}`,
        unit: ill.key,
        message: `viewBox « ${ill.viewBox} »`,
      });
    const p = validateSvg(ill.svg);
    if (p.length)
      issues.push({
        severity: 'erreur',
        code: 'illus_svg',
        file: `illus/${ill.file}`,
        unit: ill.key,
        message: p.slice(0, 3).join(' ; '),
      });
  }
  // aucun visage : la définition retenue des 12 personnages vient de zz-sansvisage.js
  for (const k of PERSONNAGES) {
    const ill = illustrations.get(k);
    if (!ill)
      issues.push({
        severity: 'erreur',
        code: 'personnage_absent',
        unit: k,
        message: `personnage ${k} non dessiné`,
      });
    else if (ill.file !== SANS_VISAGE_FILE)
      issues.push({
        severity: 'erreur',
        code: 'personnage_visage',
        unit: k,
        message: `${k} vient de ${ill.file}, pas de ${SANS_VISAGE_FILE}`,
      });
  }
  return { illustrations, issues };
}
