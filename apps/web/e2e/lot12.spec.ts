import { tanwinUndo } from '@awform/content/text';
import { expect, test } from './fixtures';

/**
 * Lot 12 : tanwins du Muṣḥaf de Médine à l'AFFICHAGE (U+08F0-08F2 ; conversion = voyelle + petite mīm),
 * le texte stocké et comparé restant Tanzil octet par octet.
 */
test('lecteur coranique : tanwins affichés comme le Muṣḥaf de Médine, texte Tanzil retrouvé à l’identique', async ({
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
    // plus aucune suite tanwin + petite mīm à l'écran
    expect(/[ً-ٍ][ۭۢ]/.test(shown)).toBe(false);
    // la transformation est bien appliquée…
    expect(shown).not.toBe(v.text);
    // …et parfaitement réversible : le texte Tanzil est intact
    expect(tanwinUndo(shown)).toBe(v.text);
  }
  const f = (await page.locator(`[data-verse="2:${fused.a}"]`).first().textContent()) ?? '';
  expect(/[ࣰ-ࣲ]/.test(f)).toBe(true);
});
