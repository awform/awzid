import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { analyse, convert, EXEMPT_FILES, mixedKeys } from './gabarits';

const SRC = fileURLToPath(new URL('../..', import.meta.url));
const STATIC_I18N = fileURLToPath(new URL('../../../static/i18n', import.meta.url));
const json = (p: string) => JSON.parse(readFileSync(p, 'utf8')) as Record<string, string>;
/** messages d'interface (toutes les langues) qui mêlent arabe et latin : rendus par <Bidi> eux aussi */
const MIXED = mixedKeys([
  json(join(SRC, 'lib/i18n/messages/fr.json')),
  ...readdirSync(STATIC_I18N)
    .filter((f) => f.endsWith('.json'))
    .map((f) => json(join(STATIC_I18N, f))),
]);
const walk = (d: string): string[] =>
  readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.svelte') ? [p] : [];
  });

describe('gabarits : texte arabe toujours isolé (règle de lint)', () => {
  it('détecte un texte inséré sans le composant, et la conversion le corrige', () => {
    const before =
      '<p class="fr">{N.texte_fr}</p><span lang="ar">{x.ar}</span><b>بِسْمِ</b><i>{t(\'a.b\')}</i><i>{t(\'hifz.sans_audio\')}</i>';
    const f = analyse(before, MIXED);
    expect(f.raws.map((r) => [r.expr, r.ar])).toEqual([
      ['N.texte_fr', false],
      ['x.ar', true],
      ["t('hifz.sans_audio')", false],
    ]);
    expect(f.literals.map((l) => l.text)).toEqual(['بِسْمِ']);
    expect(MIXED.has('rac.intro')).toBe(true);
    const after = convert(before, MIXED).src;
    expect(after).toContain('<Bidi text={N.texte_fr} />');
    expect(after).toContain('<Bidi text={x.ar} base="ar" />');
    expect(analyse(after, MIXED).raws).toEqual([]);
  });

  it('aucun gabarit n’affiche un texte sans <Bidi>/<Ar>, ni de l’arabe écrit en dur hors lang="ar"', () => {
    const bad: string[] = [];
    for (const file of walk(SRC)) {
      const rel = relative(SRC, file).replaceAll('\\', '/');
      if (EXEMPT_FILES.some((re) => re.test(rel))) continue;
      const f = analyse(readFileSync(file, 'utf8'), MIXED);
      for (const r of f.raws) bad.push(`${rel} : {${r.expr}} sans <Bidi>`);
      for (const l of f.literals) bad.push(`${rel} : arabe en dur hors lang="ar" : ${l.text}`);
    }
    expect(bad, bad.join('\n')).toEqual([]);
  });
});
