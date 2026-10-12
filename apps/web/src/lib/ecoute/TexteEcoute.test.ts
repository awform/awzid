import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import TexteEcoute from './TexteEcoute.svelte';

/**
 * Écran d'écoute IA : les signes de pause du muṣḥaf (U+06D6 à U+06DC) sont rattachés au mot qui les précède,
 * à l'AFFICHAGE seulement (même groupe insécable que le lecteur, `quran/pause.ts`) ; le texte rendu reste octet
 * par octet celui de la source. Mots SYNTHÉTIQUES (aucun texte religieux dans les tests).
 */
const SOURCE = 'كَلِمَة ۖ أُخْرَى ثَالِثَة ۗ ۚ رَابِعَة';
const ws = SOURCE.split(' ');

function rendu(etats: string[] = []) {
  const index = new Map(ws.map((_, k) => [`1:1:${k}`, k] as const));
  return render(TexteEcoute, {
    props: {
      versets: [{ s: 1, a: 1, text: SOURCE }],
      index,
      etats: etats as never,
      ajouts: new Set<number>(),
      sautes: new Set<string>(),
    },
  }).body;
}
const sansBalises = (h: string) => h.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, '');

/** Texte de chaque groupe insécable (`.wg`), balises imbriquées comprises. */
function groupes(html: string): string[] {
  const out: string[] = [];
  const re = /<span class="wg[ "][^>]*>/g;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    let prof = 1;
    let i = m.index + m[0].length;
    const debut = i;
    while (prof > 0) {
      const o = html.indexOf('<span', i);
      const f = html.indexOf('</span>', i);
      if (o !== -1 && o < f) {
        prof++;
        i = o + 5;
      } else {
        prof--;
        i = f + 7;
      }
    }
    out.push(sansBalises(html.slice(debut, i - 7)));
  }
  return out;
}

describe('TexteEcoute : signes de pause rattachés au mot précédent', () => {
  it('chaque signe est dans le groupe insécable du mot qui le précède', () => {
    const g = groupes(rendu());
    // un mot sans signe (أُخْرَى, رَابِعَة) reste seul : deux groupes seulement
    expect(g).toEqual(['كَلِمَة ۖ', 'ثَالِثَة ۗ ۚ']);
  });

  it('texte rendu identique, octet par octet, à la source (espaces compris)', () => {
    const texte = sansBalises(rendu()).replace(/\s*﴿1﴾\s*$/, '');
    expect(Buffer.from(texte.trim(), 'utf8').equals(Buffer.from(SOURCE, 'utf8'))).toBe(true);
    // la source elle-même n'est pas touchée (ni NFC, ni espace retirée)
    expect(SOURCE.split(' ')).toHaveLength(7);
  });

  it('chaque signe garde son propre index de mot (états du suivi inchangés)', () => {
    const html = rendu(['ok', 'oublie', 'ok', 'ok', 'remplace', 'ok', 'ok']);
    expect(html).toMatch(/data-etat="oublie"[^>]*>ۖ</);
    expect(html).toMatch(/data-etat="remplace"[^>]*>ۗ</);
  });
});
