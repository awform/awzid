/**
 * Garde-fou des gabarits Svelte (texte bidirectionnel) : tout texte dynamique affiché passe par le
 * composant commun <Bidi> (ou <Ar> pour l'arabe), et aucun texte arabe écrit en dur ne reste hors d'un
 * élément `lang="ar"`. Utilisé par le test gabarits.test.ts (règle) et pour la conversion automatique.
 */
import { parse } from 'svelte/compiler';

interface Node {
  type: string;
  start: number;
  end: number;
  name?: string;
  data?: string;
  attributes?: Node[];
  value?: unknown;
  [k: string]: unknown;
}

/** Fichiers exclus : les composants de rendu eux-mêmes, et le rendu du texte coranique (Tanzil octet par
 * octet, jamais découpé ni modifié : VerseText, morceaux colorés du tajwīd). Le reste de l'espace Coran
 * (lib/quran, routes/coran) suit la règle commune depuis la fusion du lot 29. */
export const EXEMPT_FILES = [
  /(^|\/)lib\/Ar\.svelte$/,
  /(^|\/)lib\/Bidi\.svelte$/,
  /(^|\/)lib\/VerseText\.svelte$/,
  /(^|\/)lib\/quran\/TajwidRuns\.svelte$/,
];

/** Éléments où un composant ne peut pas s'insérer (texte brut seulement) ou qui ne sont pas affichés. */
const RAW_ONLY = new Set(['title', 'option', 'textarea', 'style', 'script', 'svg', 'svelte:head']);

const ARABIC = /(?=\p{L})\p{sc=Arabic}/u;
const FRAGMENT_KEYS = [
  'fragment',
  'consequent',
  'alternate',
  'body',
  'fallback',
  'pending',
  'then',
  'catch',
];

export interface RawTag {
  start: number;
  end: number;
  /** expression entre les accolades, telle qu'écrite */
  expr: string;
  /** dans un élément arabe (lang="ar" ou dir="rtl") */
  ar: boolean;
}
export interface Finding {
  raws: RawTag[];
  /** texte arabe écrit en dur hors d'un élément lang="ar" */
  literals: { start: number; text: string }[];
  /** <Bidi>/<Ar> placé dans un texte coranique (classe quran-text) : interdit */
  inQuran: { start: number; name: string }[];
}

function staticAttr(n: Node, name: string): string | null {
  for (const a of n.attributes ?? []) {
    if (a.type !== 'Attribute' || a.name !== name) continue;
    const v = a.value;
    if (Array.isArray(v) && v.length === 1 && (v[0] as Node).type === 'Text')
      return String((v[0] as Node).data ?? '');
    return '';
  }
  return null;
}

const LATIN = /(?=\p{L})\p{sc=Latin}/u;

/** Clés des messages d'interface qui mêlent les deux écritures, dans au moins une langue. */
export function mixedKeys(catalogs: ReadonlyArray<Record<string, string>>): Set<string> {
  const keys = new Set<string>();
  for (const c of catalogs)
    for (const [k, v] of Object.entries(c)) if (ARABIC.test(v) && LATIN.test(v)) keys.add(k);
  return keys;
}

/**
 * Expressions laissées en texte brut : un message d'interface à clé fixe dont aucune traduction ne mêle
 * les deux écritures (catalogues relus, sans contenu des livres), et les dates et nombres mis en forme.
 */
function plainSafe(expr: string, mixed: ReadonlySet<string>): boolean {
  const e = expr.trim();
  const m = /^t\(\s*'([^']+)',?\s*\)$/.exec(e);
  if (m) return !mixed.has(m[1]!);
  return /^fmt(Date|Number|Bytes)\([\s\S]*\)$/.test(e) && !/\bt\(/.test(e);
}

export function analyse(src: string, mixed: ReadonlySet<string> = new Set()): Finding {
  const ast = parse(src, { modern: true }) as unknown as { fragment: Node };
  const out: Finding = { raws: [], literals: [], inQuran: [] };
  const visit = (node: Node, ar: boolean, skip: boolean, quran: boolean): void => {
    if (node.type === 'Fragment') {
      for (const c of (node.nodes as Node[]) ?? []) visit(c, ar, skip, quran);
      return;
    }
    // le texte coranique n'est jamais découpé : aucun composant de découpage à l'intérieur
    if (quran && node.type === 'Component' && (node.name === 'Bidi' || node.name === 'Ar'))
      out.inQuran.push({ start: node.start, name: node.name });
    if (node.type === 'ExpressionTag') {
      const expr = src.slice(node.start + 1, node.end - 1);
      if (!skip && !plainSafe(expr, mixed))
        out.raws.push({ start: node.start, end: node.end, expr, ar });
      return;
    }
    if (node.type === 'Text') {
      if (!skip && !ar && ARABIC.test(String(node.data ?? '')))
        out.literals.push({ start: node.start, text: String(node.data).trim().slice(0, 60) });
      return;
    }
    let a = ar;
    let s = skip;
    let q = quran;
    if (node.name !== undefined) {
      const lang = staticAttr(node, 'lang');
      const dir = staticAttr(node, 'dir');
      const cls = staticAttr(node, 'class') ?? '';
      if (lang === 'ar' || dir === 'rtl') a = true;
      if (lang !== null && lang !== 'ar' && lang !== '') a = false;
      if (RAW_ONLY.has(node.name)) s = true;
      // texte coranique (classe quran-text) : rendu tel quel, jamais découpé
      if (/(^|\s)quran-text(\s|$)/.test(cls)) s = q = true;
    }
    for (const k of FRAGMENT_KEYS) {
      const f = node[k] as Node | undefined;
      if (f && typeof f === 'object' && f.type === 'Fragment') visit(f, a, s, q);
    }
  };
  visit(ast.fragment, false, false, false);
  return out;
}

/** Conversion automatique : chaque `{expr}` affiché devient `<Bidi text={expr} />` (import ajouté). */
export function convert(
  src: string,
  mixed: ReadonlySet<string> = new Set(),
): { src: string; count: number } {
  const { raws } = analyse(src, mixed);
  if (!raws.length) return { src, count: 0 };
  let s = src;
  const hadImport = /import Bidi from '\$lib\/Bidi\.svelte'/.test(src);
  for (const r of [...raws].sort((x, y) => y.start - x.start))
    s =
      s.slice(0, r.start) + `<Bidi text={${r.expr}}${r.ar ? ' base="ar"' : ''} />` + s.slice(r.end);
  if (hadImport) return { src: s, count: raws.length };
  const imp = "  import Bidi from '$lib/Bidi.svelte';\n";
  const m = /<script(?![^>]*context=)(?![^>]*\bmodule\b)[^>]*>\n/.exec(s);
  if (m) s = s.slice(0, m.index + m[0].length) + imp + s.slice(m.index + m[0].length);
  else s = `<script lang="ts">\n${imp}</script>\n\n` + s;
  return { src: s, count: raws.length };
}
