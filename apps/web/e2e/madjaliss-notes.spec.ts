import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, newAdult, test } from './fixtures';

/**
 * Madjaliss, décisions du référent (contre-vérification, 12/10) : la note d'explication s'affiche sous la phrase
 * (sources repliées, chaque citation arabe sur sa propre ligne) ; le segment coranique de AKH-0132 reste du texte
 * coranique de Tanzil, entre ﴿﴾, et la traduction corrigée de AKH-0076 est en ligne.
 */
test.use({ compte: null });

type Phrase = {
  id: string;
  ar?: string | Array<string | { q: string; ref: string }>;
  fr?: string;
  note?: { texte: string; sources?: string[]; ar?: string[] };
};
const matn = JSON.parse(
  readFileSync(
    join(fileURLToPath(new URL('..', import.meta.url)), 'static', 'mutun', 'akhdari.json'),
    'utf8',
  ),
) as { phrases: Phrase[] };
const de = new Map(matn.phrases.map((p) => [p.id, p]));

test('note d’explication sous AKH-0051 ; arabe des sources sur sa ligne ; AKH-0076 corrigée', async ({
  page,
}) => {
  await newAdult(page, 'mj-notes');
  await page.goto('/madjaliss/akhdari/13');
  const p51 = page.locator('[data-phrase="AKH-0051"]');
  const note = p51.getByTestId('note-explication');
  await expect(note).toBeVisible();
  await expect(note.locator('.note-texte')).toHaveText(de.get('AKH-0051')!.note!.texte);
  await expect(note.locator('.note-titre')).toHaveText('Explication :');
  // la note vient APRÈS la traduction, jamais sur la ligne de l'arabe du texte
  const ordre = await p51.evaluate((n) => [...n.children].map((c) => c.className.split(' ')[0]));
  expect(ordre.indexOf('note')).toBeGreaterThan(ordre.indexOf('fr'));
  // sources repliées ; une fois ouvertes, chaque citation arabe est un bloc à part, de droite à gauche
  const cits = note.locator('p.cit');
  await expect(cits.first()).toBeHidden();
  await note.locator('summary').click();
  await expect(cits).toHaveCount(de.get('AKH-0051')!.note!.ar!.length);
  for (let i = 0; i < (await cits.count()); i++) {
    await expect(cits.nth(i)).toHaveCSS('display', 'block');
    await expect(cits.nth(i)).toHaveAttribute('dir', 'rtl');
    await expect(cits.nth(i)).toHaveAttribute('lang', 'ar');
  }
  // aucune autre phrase de la séance n'a de note
  await expect(page.getByTestId('note-explication')).toHaveCount(1);

  // AKH-0076 (séance 18) : traduction corrigée
  await page.goto('/madjaliss/akhdari/18');
  await expect(page.locator('[data-phrase="AKH-0076"] .fr')).toHaveText(de.get('AKH-0076')!.fr!);

  // AKH-0132 (séance 30) : segment coranique de Tanzil, police du Coran, entre ﴿﴾, sans note
  await page.goto('/madjaliss/akhdari/30');
  const seg = (de.get('AKH-0132')!.ar as Array<string | { q: string }>).find(
    (x): x is { q: string; ref: string } => typeof x !== 'string',
  )!;
  const coran = page.locator('[data-phrase="AKH-0132"] [data-coran="29:45"]');
  await expect(coran).toHaveClass(/quran-text/);
  expect(Buffer.from((await coran.textContent()) ?? '').toString('hex')).toBe(
    Buffer.from(seg.q).toString('hex'),
  );
});
