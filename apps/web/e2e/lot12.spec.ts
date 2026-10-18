import { expect, test } from './fixtures';

/**
 * Lot 12, corrigé au tournage du 18/10/2026 : les tanwins s'affichent comme dans Tanzil, octet pour octet (l'écriture
 * « Muṣḥaf de Médine » U+08F0-08F2 est désactivée : `tanwinDisplay` est l identité, packages/content/src/text.ts).
 */
test('lecteur coranique : tanwins affichés comme dans Tanzil, octet pour octet', async ({
  page,
}) => {
  const r = await page.request.get('/api/v1/quran/verses?s=2&from=1&to=30');
  // verset 1 exclu (basmala d'en-tête affichée à part)
  const verses = ((await r.json()).verses as Array<{ a: number; text: string }>).filter(
    (v) => v.a > 1,
  );
  const fused = verses.find((v) => /[ً-ٍ]ۭ|ٍۢ/.test(v.text))!;
  const iqlab = verses.find((v) => /[ًٌ]ۢ/.test(v.text))!;
  expect(fused && iqlab).toBeTruthy();

  await page.goto('/coran/lecteur?s=2&vue=versets');
  for (const v of [fused, iqlab]) {
    const shown = (await page.locator(`[data-verse="2:${v.a}"]`).first().textContent()) ?? '';
    // tournage du 18/10/2026 : le Coran s'affiche Tanzil octet pour octet (tanwin + petite mīm intacts), jamais
    // d'écriture « Muṣḥaf de Médine » (U+08F0-08F2, voyelle simple + mīm) à la place
    expect(shown).toBe(v.text);
    expect(/[\u08F0-\u08F2]/.test(shown)).toBe(false);
  }
});
