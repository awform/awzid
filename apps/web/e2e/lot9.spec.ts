import { tanwinUndo } from '@awform/content/text';
import { expect, loginTeacher, newAdult, PARENT_PIN, test } from './fixtures';

/**
 * Lot 9 : tuteur (fournisseur SIMULÉ en test). Adulte : texte encadré, Coran par référence (Tanzil exact),
 * avis religieux transmis, l'enseignant répond dans « Questions en attente », l'élève voit la réponse ;
 * enfant : boutons seulement ; parent : accord et journal.
 */

test.describe('adulte et enseignant', () => {
  test.use({ compte: null });
  test('demander au tuteur, question transmise, réponse de l’enseignant', async ({
    page,
    browser,
  }) => {
    const tag = test.info().project.name;
    await newAdult(page, 'tuteur');
    await page.goto('/lecons/ad1.l05');
    await page.getByTestId('tuteur-ouvrir').click();
    await expect(page.getByTestId('tuteur-programme')).toContainText('programme informatique');
    await expect(page.getByTestId('tuteur-programme')).toContainText('simulé');

    await page.locator('[data-action="indice"]').click();
    const answers = page.getByTestId('tuteur-reponses').locator('li.answer');
    await expect(answers.first().locator('[data-explication]')).toBeVisible();

    // Coran : la référence est rendue par le serveur, texte identique au Tanzil (basmala d'en-tête retirée)
    await page.getByTestId('tuteur-texte').fill('Écris-moi la sourate Al-Ikhlāṣ');
    await page.getByTestId('tuteur-envoyer').click();
    const q = page.locator('.quran-text[data-ref="112:1-4"]').first();
    await expect(q).toBeVisible();
    const verses = (await (await page.request.get('/api/v1/quran/verses?s=112&from=1&to=4')).json())
      .verses as Array<{ a: number; text: string }>;
    const basmala = (await (await page.request.get('/api/v1/quran/verses?s=1&from=1&to=1')).json())
      .verses[0].text as string;
    const expected = verses
      .map((v) => (v.a === 1 ? v.text.slice(basmala.length + 1) : v.text))
      .join(' ');
    // affichage des tanwins du Muṣḥaf de Médine : comparaison après inversion
    expect(tanwinUndo((await q.textContent()) ?? '')).toBe(expected);

    // question de langue → réponse du modèle (simulé) filtrée, signalable
    await page.getByTestId('tuteur-texte').fill('Quelle est la différence entre ر et ز ?');
    await page.getByTestId('tuteur-envoyer').click();
    const model = page.locator('li.answer[data-route="modele"]').first();
    await expect(model).toBeVisible();
    await model.getByRole('button', { name: 'Signaler cette réponse' }).click();
    await expect(model.getByTestId('tuteur-signale')).toBeVisible();

    // avis religieux → transmis
    const question = `Est-ce que la musique est haram ? (${tag})`;
    await page.getByTestId('tuteur-texte').fill(question);
    await page.getByTestId('tuteur-envoyer').click();
    await expect(page.getByTestId('tuteur-transmise').first()).toBeVisible();

    // l'enseignant crée une classe ; l'adulte la rejoint ; l'enseignant répond
    const tctx = await browser.newContext();
    const tp = await tctx.newPage();
    await loginTeacher(tp);
    await tp.goto('/enseignant');
    await tp.locator('#cname').fill(`Tuteur ${tag}`);
    await tp.getByRole('button', { name: 'Créer la classe' }).click();
    const code = /([A-HJ-NP-Z2-9]{8})/.exec(
      (await tp.getByTestId('ens-message').textContent()) ?? '',
    )![1]!;
    await page.goto('/compte');
    const block = page.getByTestId('hifz-compte').locator('.hp').first();
    await block.getByTestId('code-classe').fill(code);
    await block.getByTestId('consent-partage').check();
    await block.getByRole('button', { name: 'Rejoindre la classe' }).click();
    await expect(page.getByRole('status')).toContainText(`Tuteur ${tag}`);

    await tp.getByTestId('lien-questions').click();
    const item = tp.locator('[data-question]').filter({ hasText: question });
    await expect(item).toBeVisible();
    await item
      .getByTestId('ensq-reponse')
      .fill('Viens me voir après le cours : nous en parlerons ensemble.');
    await item.getByTestId('ensq-envoyer').click();
    await expect(tp.getByTestId('ensq-message')).toBeVisible();
    await expect(tp.locator('[data-question]').filter({ hasText: question })).toHaveCount(0);
    await tctx.close();

    await page.goto('/lecons/ad1.l05');
    await page.getByTestId('tuteur-ouvrir').click();
    await expect(page.getByTestId('tuteur-reponses-enseignant')).toContainText(
      'nous en parlerons ensemble',
    );
  });
});

test.describe('parent et enfant', () => {
  test.use({ compte: 'parent' });
  test('enfant : boutons seulement ; parent : accord et journal', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-09-29T10:00:00'));
    await page.goto('/compte/tuteur');
    const amina = page.locator('[data-tuteur-profil]').filter({ hasText: 'Amina' });
    await expect(amina).toBeVisible();
    await expect(amina.getByTestId('journal-tuteur')).toBeVisible();
    // audit MIN-4 / SEC-3 : le code parent est exigé pour donner l'accord
    await page.getByTestId('pin-tuteur').fill(PARENT_PIN);
    const box = amina.getByTestId('accord-tuteur');
    // l'autre projet (mobile/bureau) peut avoir déjà donné l'accord : on vérifie l'état final
    await box.check();
    await expect(box).toBeChecked();

    await page.goto('/profils');
    await page.locator('[data-profile]').filter({ hasText: 'Amina' }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto('/lecons/en1.l05');
    await page.getByTestId('tuteur-ouvrir').click();
    await expect(page.getByTestId('tuteur-texte')).toHaveCount(0);
    await page.locator('[data-action="lecon"]').click();
    await expect(page.getByTestId('tuteur-reponses').locator('li.answer').first()).toBeVisible();
    await page.getByTestId('tuteur-mot-choix').selectOption({ index: 1 });
    await page.locator('[data-action="mot"]').click();
    await expect(page.getByTestId('tuteur-reponses').locator('li.answer')).toHaveCount(2);

    const me = (await (await page.request.get('/api/v1/auth/me')).json()) as {
      profiles: Array<{ id: string; pseudonym: string }>;
    };
    const id = me.profiles.find((p) => p.pseudonym === 'Amina')!.id;
    const j = (await (await page.request.get(`/api/v1/tutor/${id}/journal`)).json()) as {
      consentement: boolean;
      journal: unknown[];
    };
    expect(j.consentement).toBe(true);
    expect(j.journal.length).toBeGreaterThanOrEqual(2);
  });
});
