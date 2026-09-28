import { describe, expect, it } from 'vitest';
import { renderPublic } from './qr';

describe('page publique du QR code', () => {
  it('HTML sans script, texte échappé, lien vers la leçon', () => {
    const html = renderPublic({
      unitId: 'en1.l05',
      levelCode: 'en1',
      kind: 'lecon',
      numLecon: 5,
      lesson: {
        titre_ar: 'الدَّرْسُ',
        titre_fr: 'Titre <script>alert(1)</script>',
        lettres: [{ l: 'ب' }],
        objectifs: [{ fr: 'Je lis' }],
        mots: [{ ar: '[بَ]ابٌ', fr: 'porte', img: 'door' }],
      },
      illustrations: { door: { viewBox: '0 0 10 10', svg: '<rect width="10" height="10"/>' } },
    });
    expect(html).not.toMatch(/<script/i);
    expect(html).toContain('&#60;script&#62;');
    expect(html).toContain('href="/lecons/en1.l05"');
    expect(html).toContain('<use href="#i-door"/>');
    expect(html).toContain('<span class="c0">بَ</span>ابٌ');
    expect(html).not.toContain('[');
    expect(new TextEncoder().encode(html).length).toBeLessThan(100_000);
  });
});
