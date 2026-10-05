/**
 * Formateur ICU MINIMAL (lot F2, poids de la coquille) : remplace `intl-messageformat` à l'exécution (≈ 9 Ko
 * compressés de moins sur chaque page). Couvre exactement ce que les catalogues utilisent — contrôlé par un
 * test qui compare, pour CHAQUE message des cinq langues, le résultat à celui d'intl-messageformat :
 *  - arguments simples `{nom}` ;
 *  - pluriels `{n, plural, =0 {…} one {…} few {…} other {…}}` (règles de la langue : Intl.PluralRules),
 *    `#` = le nombre mis en forme selon la langue (Intl.NumberFormat), imbrication permise ;
 *  - apostrophe ICU : `'` seule est un caractère ordinaire ; `''` = une apostrophe ; `'{…}'` cite du texte.
 * Tout autre format (select, date, number…) lève une erreur au premier usage : le test le signale.
 */
type Node =
  | string
  | { arg: string }
  | { arg: string; plural: Record<string, Node[]>; offset: number }
  | { hash: true };

function parse(src: string, inPlural: boolean, pos: { i: number }, stopAtBrace: boolean): Node[] {
  const out: Node[] = [];
  let buf = '';
  const flush = () => {
    if (buf) out.push(buf);
    buf = '';
  };
  while (pos.i < src.length) {
    const c = src[pos.i]!;
    if (c === "'") {
      const next = src[pos.i + 1];
      if (next === "'") {
        buf += "'";
        pos.i += 2;
        continue;
      }
      if (next === '{' || next === '}' || (inPlural && next === '#')) {
        // texte cité jusqu'à l'apostrophe suivante
        const end = src.indexOf("'", pos.i + 1);
        buf += src.slice(pos.i + 1, end < 0 ? src.length : end);
        pos.i = end < 0 ? src.length : end + 1;
        continue;
      }
      buf += c;
      pos.i++;
      continue;
    }
    if (c === '}' && stopAtBrace) break;
    if (c === '#' && inPlural) {
      flush();
      out.push({ hash: true });
      pos.i++;
      continue;
    }
    if (c === '{') {
      flush();
      pos.i++;
      out.push(parseArg(src, pos));
      continue;
    }
    buf += c;
    pos.i++;
  }
  flush();
  return out;
}

function parseArg(src: string, pos: { i: number }): Node {
  const close = /[,}]/g;
  close.lastIndex = pos.i;
  const m = close.exec(src);
  if (!m) throw new Error(`message ICU mal formé : ${src}`);
  const name = src.slice(pos.i, m.index).trim();
  pos.i = m.index + 1;
  if (m[0] === '}') return { arg: name };
  const rest = /^\s*(\w+)\s*,/.exec(src.slice(pos.i));
  if (!rest || rest[1] !== 'plural') throw new Error(`format ICU non pris en charge : ${src}`);
  pos.i += rest[0].length;
  const plural: Record<string, Node[]> = {};
  let offset = 0;
  for (;;) {
    while (/\s/.test(src[pos.i] ?? '')) pos.i++;
    if (src[pos.i] === '}') {
      pos.i++;
      break;
    }
    const sel = /^(offset:\s*\d+|=\d+|[a-z]+)/.exec(src.slice(pos.i));
    if (!sel) throw new Error(`pluriel ICU mal formé : ${src}`);
    pos.i += sel[0].length;
    if (sel[1]!.startsWith('offset:')) {
      offset = Number(sel[1]!.slice(7));
      continue;
    }
    while (/\s/.test(src[pos.i] ?? '')) pos.i++;
    if (src[pos.i] !== '{') throw new Error(`pluriel ICU mal formé : ${src}`);
    pos.i++;
    plural[sel[1]!] = parse(src, true, pos, true);
    pos.i++; // accolade fermante du cas
  }
  return { arg: name, plural, offset };
}

const cache = new Map<string, Node[]>();
const rules = new Map<string, Intl.PluralRules>();
const numbers = new Map<string, Intl.NumberFormat>();

function render(
  nodes: Node[],
  locale: string,
  values: Record<string, unknown>,
  n?: number,
): string {
  let s = '';
  for (const node of nodes) {
    if (typeof node === 'string') s += node;
    else if ('hash' in node) {
      let nf = numbers.get(locale);
      if (!nf) numbers.set(locale, (nf = new Intl.NumberFormat(locale)));
      s += n === undefined ? '#' : nf.format(n);
    } else if ('plural' in node) {
      const v = Number(values[node.arg]);
      const exact = node.plural[`=${v}`];
      let pr = rules.get(locale);
      if (!pr) rules.set(locale, (pr = new Intl.PluralRules(locale)));
      const branch = exact ?? node.plural[pr.select(v - node.offset)] ?? node.plural.other ?? [];
      s += render(branch, locale, values, v - node.offset);
    } else {
      const v = values[node.arg];
      if (v === undefined) throw new Error(`valeur manquante : ${node.arg}`);
      s += String(v);
    }
  }
  return s;
}

/** Met en forme un message ICU (sous-ensemble ci-dessus) dans la langue donnée. */
export function formatIcu(message: string, locale: string, values: Record<string, unknown> = {}) {
  let nodes = cache.get(message);
  if (!nodes) {
    nodes = parse(message, false, { i: 0 }, false);
    cache.set(message, nodes);
  }
  return render(nodes, locale, values);
}
