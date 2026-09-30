// Vérifie une traduction partielle : node scripts/verifier-traduction.mjs <source.json> <traduction.json> <locale>
// Mêmes clés, mêmes arguments ICU (même nombre), MessageFormat valide. Sortie non nulle en cas d'écart.
import { readFileSync } from 'node:fs';
import IntlMessageFormat from 'intl-messageformat';

const [src, out, loc] = process.argv.slice(2);
const s = JSON.parse(readFileSync(src, 'utf8'));
const o = JSON.parse(readFileSync(out, 'utf8'));
const args = (m) =>
  [...m.matchAll(/\{\s*([A-Za-z_]\w*)\s*[,}]/g)]
    .map((x) => x[1])
    .sort()
    .join(',');
const errs = [];
for (const k of Object.keys(s)) {
  if (typeof o[k] !== 'string') errs.push(`manquante : ${k}`);
  else {
    const fr = typeof s[k] === 'string' ? s[k] : s[k].fr;
    if (args(o[k]) !== args(fr)) errs.push(`arguments : ${k} (${args(fr)} ≠ ${args(o[k])})`);
    try {
      new IntlMessageFormat(o[k], loc);
    } catch (e) {
      errs.push(`ICU : ${k} (${e.message})`);
    }
  }
}
for (const k of Object.keys(o)) if (!(k in s)) errs.push(`en trop : ${k}`);
console.log(errs.length ? errs.join('\n') : `OK ${Object.keys(o).length} clés`);
process.exit(errs.length ? 1 : 0);
