import { describe, expect, it } from 'vitest';
import { construireItems, htmlSur, voisin } from './lecteur';

describe('lecteur des récits', () => {
  const lignes = [11, 13, 17, 19, 21, 27];
  const entrees = [
    { f: 'p001.mp3', l: 11 },
    { f: 'p002.mp3', l: 14 },
    { v: '7:59', l: 17 },
    { f: 'p003.mp3', l: 22 },
    { f: 'p004.mp3', l: 5 }, // avant le premier bloc : ignorée
    { f: '../x.mp3', l: 27 }, // nom refusé
  ];
  const it8 = construireItems(entrees, lignes, 'l1', '03_nouh', 'adulte');
  it('chaque entrée surligne le bloc de plus grande ligne ≤ la sienne ; versets sans voix', () => {
    expect(it8.map((x) => x.bloc)).toEqual([0, 1, 2, 4]);
    expect(it8[2]).toMatchObject({ src: null, verset: '7:59', num: 0 });
    expect(it8[3]!.src).toBe('/histoires/audio/prophetes/03_nouh/adulte/p003.mp3');
    expect(it8.filter((x) => x.src).map((x) => x.num)).toEqual([1, 2, 3]);
  });
  it('précédent / suivant sautent les places de versets', () => {
    expect(voisin(it8, 1, 1)).toBe(3);
    expect(voisin(it8, 3, -1)).toBe(1);
    expect(voisin(it8, 3, 1)).toBe(-1);
  });
  it('HTML des récits : liste blanche, tout le reste échappé', () => {
    const ok =
      '<strong>Nouh</strong> (<span class="ar-in" lang="ar" dir="rtl">نُوح</span>) <em>x</em> &amp;';
    expect(htmlSur(ok)).toBe(ok);
    expect(htmlSur('<img src=x onerror=alert(1)> <strong>a</strong>')).toBe(
      '&lt;img src=x onerror=alert(1)&gt; &lt;strong&gt;a&lt;/strong&gt;',
    );
    expect(htmlSur('<span onclick="x">a</span>')).not.toContain('<span');
  });
  it('la Sīra (livre 3) n’a pas d’audio', () => {
    expect(construireItems(entrees, lignes, 'l3', 'S01_arabie', 'enfant')).toEqual([]);
  });
});
