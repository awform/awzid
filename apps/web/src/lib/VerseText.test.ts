import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import VerseText from './VerseText.svelte';

/**
 * ۞ (U+06DE, début de ḥizb) dans les versets du hifẓ et des adhkār : Amiri Quran le dessine comme un astérisque.
 * À l'AFFICHAGE, un ornement SVG décoratif (aria-hidden) le remplace ; le caractère reste dans le texte rendu,
 * seulement masqué à l'écran : le texte est octet par octet celui de la source. Mots SYNTHÉTIQUES (aucun texte
 * religieux dans les tests).
 */
const HIZB = '۞';
const SOURCE = `${HIZB} كَلِمَة أُخْرَى ثَالِثَة`;
const sansBalises = (h: string) => h.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, '');

function texteDuVerset(html: string): string {
  const debut = html.indexOf('data-verse="2:1"');
  const ouvre = html.indexOf('>', debut) + 1;
  const fin = html.indexOf('<span class="n', ouvre);
  return sansBalises(html.slice(ouvre, fin)).replace(/\s+$/, '');
}

describe('VerseText : ۞ en ornement', () => {
  it('ornement aria-hidden, caractère gardé (masqué), texte identique à la source', () => {
    const html = render(VerseText, {
      props: { verses: [{ s: 2, a: 1, text: SOURCE }], basmala: '' },
    }).body;
    expect(html).toMatch(/<span class="hizb[ "]/);
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
    expect(html).toMatch(new RegExp(`<span class="hizb-t[ "][^>]*>${HIZB}</span>`));
    expect(texteDuVerset(html)).toBe(SOURCE);
  });
  it('sans ۞ : aucun ornement, texte inchangé', () => {
    const autre = 'كَلِمَة أُخْرَى';
    const html = render(VerseText, {
      props: { verses: [{ s: 2, a: 1, text: autre }], basmala: '' },
    }).body;
    expect(html).not.toMatch(/class="hizb/);
    expect(texteDuVerset(html)).toBe(autre);
  });
});
