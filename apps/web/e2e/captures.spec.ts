import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, loginTeacher, newAdult, PARENT_PIN, password, test } from './fixtures';
import { solveExercise, unitData } from './solve';

/**
 * Captures d'écran des écrans réalisés (mobile et bureau), pour la présentation au client.
 * Dossier : CAPTURES_DIR (par défaut test-results/captures).
 */
const DIR = process.env.CAPTURES_DIR ?? 'test-results/captures';

test('captures d’écran', async ({ page }, info) => {
  const dev = info.project.name.startsWith('mobile') ? 'mobile' : 'bureau';
  mkdirSync(DIR, { recursive: true });
  const shot = async (name: string, full = false) => {
    await page.locator('main h1').first().waitFor(); // rendu sur l'appareil : attendre les données
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: join(DIR, `${dev}-${name}.png`), fullPage: full });
  };

  await page.goto('/');
  await shot('01-accueil');
  await page.goto('/niveaux/en1');
  await shot('02-liste-en1');

  await page.goto('/lecons/en1.l01');
  await shot('03-en1-l01-ouverture');
  await page.locator('.letters').scrollIntoViewIfNeeded();
  await shot('04-en1-l01-lettres');
  await page.locator('.words').scrollIntoViewIfNeeded();
  await shot('05-en1-l01-mots');

  // exercices : on en résout quelques-uns pour montrer le retour immédiat
  const { unit } = await unitData(page, 'en1.l03');
  await page.goto('/lecons/en1.l03');
  await solveExercise(page, unit.exercises[0]!.id, unit.lesson.exercices[0]!);
  await page
    .locator(`section.ex[data-exercise="${unit.exercises[0]!.id}"]`)
    .scrollIntoViewIfNeeded();
  await shot('06-exercice-premiere-lettre');
  const relier = unit.lesson.exercices.findIndex((e) => e.type === 'relier');
  if (relier >= 0) {
    const sec = page.locator(`section.ex[data-exercise="${unit.exercises[relier]!.id}"]`);
    await sec.scrollIntoViewIfNeeded();
    await sec.locator('button[data-side="a"][data-k="0"]').click();
    await sec.locator('button[data-side="b"][data-k="0"]').click();
    await shot('07-exercice-relier');
  }
  await page.goto('/lecons/en1.l15');
  const ordre = page.locator('section.ex[data-type="ordre"]').first();
  await ordre.scrollIntoViewIfNeeded();
  await shot('08-exercice-ordre');

  await page.goto('/lecons/en1.l04');
  await page.locator('section.ex[data-type="chasse"]').first().scrollIntoViewIfNeeded();
  await shot('09-exercice-chasse');

  await page.goto('/lecons/ad1.l10');
  await page.locator('.dlg').first().scrollIntoViewIfNeeded();
  await shot('10-ad1-dialogue');
  await page.locator('.quran').scrollIntoViewIfNeeded();
  await shot('11-ad1-coran');

  await page.goto('/lecons/ad1.l05');
  await page.getByTestId('non-prepare').first().scrollIntoViewIfNeeded();
  await shot('12-bilan-texte-non-prepare');

  await page.goto('/lecons/en1.l02');
  await page.locator('.recap').scrollIntoViewIfNeeded();
  await shot('13-mon-bilan-etoiles');

  await page.goto('/lecons/en1.l01');
  await shot('14-lecon-entiere', true);
});

test.describe('compte parent', () => {
  test.use({ compte: 'parent' });

  test('captures d’écran — lot 3 (hors ligne, onglets, mode école)', async ({ page }, info) => {
    const dev = info.project.name.startsWith('mobile') ? 'mobile' : 'bureau';
    mkdirSync(DIR, { recursive: true });
    const shot = async (name: string) => {
      await page.locator('main h1').first().waitFor(); // rendu sur l'appareil : attendre les données
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: join(DIR, `${dev}-${name}.png`) });
    };
    await page.goto('/hors-ligne');
    await page.locator('tr[data-level="en1"]').getByRole('button', { name: 'Télécharger' }).click();
    await page
      .locator('tr[data-level="en1"] [data-testid="etat"]')
      .filter({ hasText: "sur l'appareil" })
      .waitFor();
    await shot('15-telechargements');
    await page.goto('/coran');
    await shot('16-onglet-coran');
    await page.goto('/ecole');
    await page.getByTestId('activer-ecole').click();
    await page.getByText("Réglages de l'adulte").click();
    await page.locator('#apin').fill(PARENT_PIN);
    await page.getByTestId('ecole-pin').getByRole('button').click();
    const first = page.locator('[data-setup]').first();
    await first.click();
    for (const s of ['etoile', 'lune', 'soleil', 'goutte'])
      await page.locator(`[data-setsym="${s}"]`).click();
    await page.getByTestId('enregistrer-code').click();
    await page.getByText("Réglages de l'adulte").click();
    await shot('17-mode-ecole-grille');
    await page.locator('[data-profile]').first().click();
    await page.locator('[data-sym="etoile"]').click();
    await shot('18-mode-ecole-code-image');
  });

  test('captures d’écran — lot 4 (comptes, profils, consentements, langue)', async ({
    page,
  }, info) => {
    const dev = info.project.name.startsWith('mobile') ? 'mobile' : 'bureau';
    mkdirSync(DIR, { recursive: true });
    const shot = async (name: string, full = false) => {
      await page.locator('main h1').first().waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: join(DIR, `${dev}-${name}.png`), fullPage: full });
    };
    await page.goto('/profils');
    await page.locator('[data-profile]').first().waitFor();
    await shot('19-qui-apprend');
    await page.getByTestId('ajouter-enfant').click();
    await shot('20-ajout-enfant-consentement', true);
    await page.goto('/compte');
    await page.getByTestId('consentements').locator('li').first().waitFor();
    await shot('21-mon-compte', true);
    await page.goto('/connexion');
    await shot('22-connexion');
    await page.goto('/inscription');
    await page.locator('#country').selectOption('SN');
    await shot('23-inscription-senegal', true);
    await page.goto('/compte');
    await page.getByTestId('langues-preparation').check();
    await page.locator('button[data-locale="en"]').click();
    await expect(page.locator('main h1')).toHaveText('My account');
    await page.goto('/');
    await expect(page.locator('main h1')).toHaveText('My Arabic books');
    await shot('24-interface-en-anglais');
  });
});

test.describe('lot 5', () => {
  test.use({ compte: null });
  test('captures d’écran — lot 5 (hifẓ, enseignant)', async ({ page }, info) => {
    const dev = info.project.name.startsWith('mobile') ? 'mobile' : 'bureau';
    mkdirSync(DIR, { recursive: true });
    const shot = async (name: string, full = false) => {
      await page.locator('main h1').first().waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: join(DIR, `${dev}-${name}.png`), fullPage: full });
    };
    await newAdult(page, 'captures');
    await page.goto('/hifz');
    await page.getByTestId('mode-rythme').check();
    await shot('25-hifz-choix-rythme', true);
    await page.getByTestId('mode-carnet').check();
    await page.getByTestId('commencer-plan').click();
    await page.getByTestId('plan-resume').waitFor();
    await shot('26-hifz-carnet-semaine', true);
    await page.getByTestId('masquer').check();
    await page.getByTestId('piste-nouveau').scrollIntoViewIfNeeded();
    await shot('27-hifz-reciter-de-memoire');
    await loginTeacher(page);
    await page.goto('/enseignant');
    await page.locator('#cname').fill(`Hifẓ — groupe ${dev}`);
    await page.getByRole('button', { name: 'Créer la classe' }).click();
    await page.getByTestId('ens-message').waitFor();
    await shot('28-espace-enseignant', true);
  });
});

test.describe('lot 6', () => {
  test.use({ compte: null });
  test('captures d’écran — lot 6 (tracé, cartes, tableau de bord, QR)', async ({ page }, info) => {
    const dev = info.project.name.startsWith('mobile') ? 'mobile' : 'bureau';
    mkdirSync(DIR, { recursive: true });
    const shot = async (name: string, full = false) => {
      await page.locator('main h1, h1').first().waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: join(DIR, `${dev}-${name}.png`), fullPage: full });
    };
    await newAdult(page, 'captures6');
    await page.goto('/ecriture?lettre=%D8%A8');
    await page.locator('[data-etape="2"]').click();
    await page.getByTestId('trace').scrollIntoViewIfNeeded();
    await expect(page.getByTestId('trace')).not.toHaveAttribute('data-box', '');
    await shot('29-trace-lettre');
    await page.goto('/revisions');
    await page.getByTestId('retourner').click();
    await shot('30-carte-mot');
    // un peu d'activité pour le tableau de bord
    await page.getByTestId('je-savais').click();
    for (let k = 0; k < 3; k++) {
      await page.getByTestId('retourner').click();
      await page.getByTestId(k % 2 ? 'a-revoir' : 'je-savais').click();
    }
    await expect(page.getByTestId('en-attente')).toHaveCount(0, { timeout: 15_000 });
    await page.goto('/suivi');
    await page.getByTestId('activite').waitFor();
    await shot('31-tableau-de-bord', true);
    await page.goto('/l/en1-05');
    await shot('32-page-qr', true);
  });
});

test.describe('lot 8', () => {
  test('captures d’écran — lot 8 (sciences islamiques, bibliothèque, lecteur coranique)', async ({
    page,
  }, info) => {
    const dev = info.project.name.startsWith('mobile') ? 'mobile' : 'bureau';
    mkdirSync(DIR, { recursive: true });
    const shot = async (name: string, full = false) => {
      await page.locator('main h1, h1').first().waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: join(DIR, `${dev}-${name}.png`), fullPage: full });
    };
    await page.goto('/sciences');
    await page.locator('[data-testid="niveau-religion"]').first().waitFor();
    await shot('33-sciences-islamiques');
    await page.goto('/lecons/re1.l03');
    await page.getByTestId('lecon-religion').waitFor();
    await shot('34-lecon-religion-enfants');
    await page.goto('/lecons/ra1.l01');
    await page.getByTestId('lecon-religion').waitFor();
    await page.locator('.rub').first().scrollIntoViewIfNeeded();
    await shot('35-lecon-religion-adultes');
    await page.goto('/lectures');
    await page.locator('[data-testid="livrets"][data-ready="true"]').waitFor();
    await shot('36-bibliotheque');
    const code = await page.locator('[data-livret]').first().getAttribute('data-livret');
    await page.goto(`/lectures/${code}`);
    await page.getByTestId('suivant').click();
    await page.getByTestId('traduction').click();
    await shot('37-livret-page');
    await page.clock.install();
    await page.goto('/coran/lecteur?s=112');
    await page.locator('[data-verse="112:1"]').waitFor();
    await page.getByTestId('lire').click();
    await page.locator('.w.on').waitFor();
    await shot('38-lecteur-coranique');
  });
});

test.describe('lot 9', () => {
  test.use({ compte: null });
  test('captures d’écran — lot 9 (tuteur, questions en attente)', async ({
    page,
    browser,
  }, info) => {
    const dev = info.project.name.startsWith('mobile') ? 'mobile' : 'bureau';
    mkdirSync(DIR, { recursive: true });
    const shot = async (p: typeof page, name: string, full = false) => {
      await p.locator('main h1, h1').first().waitFor();
      await p.evaluate(() => document.fonts.ready);
      await p.screenshot({ path: join(DIR, `${dev}-${name}.png`), fullPage: full });
    };
    await newAdult(page, 'captures9');
    await page.goto('/lecons/ad1.l05');
    await page.getByTestId('tuteur-ouvrir').click();
    const list = page.getByTestId('tuteur-reponses').locator('li.answer');
    const send = async (q: string, n: number) => {
      await page.getByTestId('tuteur-texte').fill(q);
      await page.getByTestId('tuteur-envoyer').click();
      await expect(list).toHaveCount(n);
    };
    const question = `Est-ce que je peux prier assis ? (${dev})`;
    await send(question, 1);
    await send('Écris-moi la sourate Al-Ikhlāṣ', 2);
    await send('Quelle est la différence entre ر et ز ?', 3);
    await page.getByTestId('tuteur-reponses').scrollIntoViewIfNeeded();
    await shot(page, '39-tuteur-adulte');

    const tctx = await browser.newContext(
      dev === 'mobile' ? { viewport: { width: 412, height: 915 } } : {},
    );
    const tp = await tctx.newPage();
    await loginTeacher(tp);
    await tp.goto('/enseignant');
    await tp.locator('#cname').fill(`Adultes ${dev}`);
    await tp.getByRole('button', { name: 'Créer la classe' }).click();
    const code = /([A-HJ-NP-Z2-9]{8})/.exec(
      (await tp.getByTestId('ens-message').textContent()) ?? '',
    )![1]!;
    await page.goto('/compte');
    const block = page.getByTestId('hifz-compte').locator('.hp').first();
    await block.getByTestId('code-classe').fill(code);
    await block.getByTestId('consent-partage').check();
    await block.getByRole('button', { name: 'Rejoindre la classe' }).click();
    await page.getByRole('status').waitFor();
    await tp.goto('/enseignant/questions');
    const item = tp.locator('[data-question]').filter({ hasText: question });
    await item.waitFor();
    await item
      .getByTestId('ensq-reponse')
      .fill('Oui, si tu ne peux pas te tenir debout : viens m’en parler après le cours.');
    await tp.evaluate(() => window.scrollTo(0, 0));
    await shot(tp, '40-questions-en-attente');
    await tctx.close();

    await page.goto('/compte/tuteur');
    await page.getByTestId('journal-tuteur').first().waitFor();
    await shot(page, '41-journal-tuteur', true);
  });
});

test.describe('lot 10', () => {
  test.use({ compte: null });
  test('captures d’écran — lot 10 (offres, paiement simulé, abonnement)', async ({
    page,
  }, info) => {
    const dev = info.project.name.startsWith('mobile') ? 'mobile' : 'bureau';
    mkdirSync(DIR, { recursive: true });
    const shot = async (name: string, full = false) => {
      await page.locator('main h1, h1').first().waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: join(DIR, `${dev}-${name}.png`), fullPage: full });
    };
    await newAdult(page, 'captures10');
    await page.goto('/offres');
    await page.getByTestId('offres').waitFor();
    await shot('42-offres', true);
    await page.getByTestId('choisir-adulte_annuel').click();
    // audit PAY-6 : mot de passe du compte pour un achat sans code parent
    const annuel = page.locator('[data-plan="adulte_annuel"]');
    await annuel.getByTestId('mdp-achat').fill(password());
    await annuel.getByRole('button', { name: 'Confirmer' }).click();
    await page.getByTestId('montant').waitFor();
    await shot('43-paiement-simule');
    await page.getByTestId('payer').click();
    await page.getByTestId('paiement-ok').waitFor();
    await shot('44-mon-abonnement', true);
  });
});

test.describe('lot 11', () => {
  test.use({ compte: null });
  test('captures d’écran — lot 11 (aujourd’hui, garanties)', async ({ page }, info) => {
    const dev = info.project.name.startsWith('mobile') ? 'mobile' : 'bureau';
    mkdirSync(DIR, { recursive: true });
    const shot = async (name: string, full = false) => {
      await page.locator('main h1, h1').first().waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: join(DIR, `${dev}-${name}.png`), fullPage: full });
    };
    await newAdult(page, 'captures11');
    const { unit } = await unitData(page, 'ad1.l03');
    await page.goto('/lecons/ad1.l03');
    await solveExercise(page, unit.exercises[0]!.id, unit.lesson.exercices[0]!);
    await expect(page.getByTestId('en-attente')).toHaveCount(0, { timeout: 15_000 });
    await page.goto('/aujourdhui');
    await page.getByTestId('jalons').waitFor();
    await shot('45-aujourdhui', true);
    await page.goto('/garanties');
    await page.getByTestId('garanties').waitFor();
    await shot('46-garanties', true);
  });
});

test.describe('lot 12', () => {
  test.use({ compte: null });
  test('captures d’écran — lot 12 (tanwins du Muṣḥaf de Médine, jalons ḥizb)', async ({
    page,
  }, info) => {
    const dev = info.project.name.startsWith('mobile') ? 'mobile' : 'bureau';
    mkdirSync(DIR, { recursive: true });
    await page.goto('/coran/lecteur?s=2&from=1&to=7');
    await page.locator('[data-verse="2:5"]').first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.locator('[data-verse="2:2"]').first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(DIR, `${dev}-47-lecteur-tanwins.png`) });
  });
});

test.describe('lot 13', () => {
  test.use({ compte: null });
  test('captures d’écran — lot 13 (espace école, certificat)', async ({ page }, info) => {
    test.setTimeout(120_000);
    const dev = info.project.name.startsWith('mobile') ? 'mobile' : 'bureau';
    mkdirSync(DIR, { recursive: true });
    await loginTeacher(page);
    const H = { 'x-awform': '1' };
    const api = async (method: 'post' | 'patch' | 'put', url: string, data: object) => {
      const r = await page.request[method](`/api/v1${url}`, { headers: H, data });
      expect(r.ok(), await r.text()).toBe(true);
      return r.json();
    };
    const cls = (await api('post', '/teacher/classes', { name: `CE1 A — ${dev}` })).class;
    await api('patch', `/ecole/classes/${cls.id}`, {
      levelCode: 'en1',
      schoolName: 'École pilote AWFORM',
      place: 'Dakar',
      placeAr: 'دَاكَار',
      schoolYear: '2026-2027',
    });
    const tb0 = await (await page.request.get(`/api/v1/ecole/classes/${cls.id}/tableau`)).json();
    const notes: Array<[string, 'm' | 'f', number[], number]> = [
      ['Awa D.', 'f', [18, 17, 19, 18], 17],
      ['Moussa S.', 'm', [14, 15, 13, 16], 14],
      ['Fatou N.', 'f', [16, 12], 0],
    ];
    let first = '';
    for (const [name, gender, bilans, exam] of notes) {
      const p = (
        await api('post', `/ecole/classes/${cls.id}/pupils`, { displayName: name, gender })
      ).pupil;
      first ||= p.id;
      const items = bilans.map((s, i) => ({
        item: `bilan:${tb0.bilans[i].id}`,
        score: s,
        max: 20,
      }));
      if (exam) items.push({ item: 'examen', score: exam, max: 20 });
      await api('put', `/ecole/pupils/${p.id}/resultats`, { levelCode: 'en1', items });
    }
    await api('post', `/ecole/classes/${cls.id}/assignments`, {
      kind: 'hifz',
      target: '112:1-4',
      dueDay: '2026-10-12',
    });
    const cert = (
      await api('post', `/ecole/pupils/${first}/certificats`, {
        kind: 'niveau',
        fields: { prenom_nom: 'Awa Diop' },
        // audit MET-2 : contrôle continu partiel (récitations, productions non saisies) → confirmation
        confirmerCcPartiel: true,
      })
    ).certificate;
    await page.goto(`/enseignant/classe/${cls.id}`);
    await page.getByTestId('onglet-tableau').click();
    await page.getByTestId('tableau').waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: join(DIR, `${dev}-48-ecole-tableau.png`), fullPage: true });
    await page.goto(`/enseignant/certificat/${cert.id}`);
    await page.getByTestId('certificat').waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: join(DIR, `${dev}-49-certificat.png`), fullPage: true });
  });
});

test.describe('lot 14', () => {
  test.use({ compte: null });
  test('captures d’écran — lot 14 (confidentialité, aide)', async ({ page }, info) => {
    const dev = info.project.name.startsWith('mobile') ? 'mobile' : 'bureau';
    mkdirSync(DIR, { recursive: true });
    for (const [url, name] of [
      ['/legal/confidentialite', '50-confidentialite'],
      ['/aide', '51-aide'],
    ]) {
      await page.goto(url);
      await page.locator('main h1').first().waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: join(DIR, `${dev}-${name}.png`) });
    }
  });
});

test.describe('lot 15', () => {
  test('captures d’écran — lot 15 (racines, interface anglaise)', async ({ page }, info) => {
    const dev = info.project.name.startsWith('mobile') ? 'mobile' : 'bureau';
    mkdirSync(DIR, { recursive: true });
    await page.goto('/activites/racines');
    await page.getByTestId('racine').waitFor();
    await page.locator('[data-option="كُتُبٌ"]').click();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: join(DIR, `${dev}-52-racines.png`) });
    await page.goto('/compte');
    await page.getByTestId('langues-preparation').check();
    await Promise.all([page.waitForEvent('load'), page.locator('[data-locale="en"]').click()]);
    await page.goto('/aujourdhui');
    await page.getByTestId('seance').waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: join(DIR, `${dev}-53-anglais.png`) });
  });
});

test.describe('lot 16', () => {
  test.use({ compte: 'parent' });
  test('captures d’écran — lot 16 (notifications, écoute des récitations)', async ({
    page,
    browser,
  }, info) => {
    test.setTimeout(120_000);
    const dev = info.project.name.startsWith('mobile') ? 'mobile' : 'bureau';
    mkdirSync(DIR, { recursive: true });
    await page.goto('/compte');
    await page.getByTestId('notifications').scrollIntoViewIfNeeded();
    await page.evaluate(() => document.fonts.ready);
    await page
      .getByTestId('notifications')
      .screenshot({ path: join(DIR, `${dev}-54-notifications.png`) });
    // enseignant : une récitation reçue
    const tctx = await browser.newContext();
    const tp = await tctx.newPage();
    await loginTeacher(tp);
    const cls = (
      await (
        await tp.request.post('/api/v1/teacher/classes', {
          headers: { 'x-awform': '1' },
          data: { name: `Écoute ${dev}` },
        })
      ).json()
    ).class;
    const me = await (await page.request.get('/api/v1/auth/me')).json();
    const kid = me.profiles.find((p: { kind: string }) => p.kind === 'enfant');
    await page.request.post(`/api/v1/profiles/${kid.id}/classes`, {
      headers: { 'x-awform': '1', 'x-parent-pin': PARENT_PIN },
      data: { code: cls.joinCode, consent: true },
    });
    const H = { 'x-awform': '1', 'x-parent-pin': PARENT_PIN };
    await page.request.post(`/api/v1/profiles/${kid.id}/recitations/accord`, {
      headers: H,
      data: {},
    });
    await page.request.post(
      `/api/v1/profiles/${kid.id}/recitations?classe=${cls.id}&passage=112:1-4`,
      {
        headers: { ...H, 'content-type': 'audio/ogg' },
        data: Buffer.concat([Buffer.from('OggS'), Buffer.alloc(1500)]),
      },
    );
    await tp.goto(`/enseignant/classe/${cls.id}`);
    await tp.getByTestId('onglet-ecoute').click();
    await tp.getByTestId('ecoute-noter').first().click();
    await tp.evaluate(() => document.fonts.ready);
    await tp.screenshot({ path: join(DIR, `${dev}-55-ecoute.png`), fullPage: true });
    // nettoyage : accord retiré (efface l'envoi), l'enfant quitte la classe
    const consents = (await (await page.request.get('/api/v1/account/consents')).json())
      .consents as Array<{
      id: string;
      type: string;
      withdrawnAt: string | null;
    }>;
    for (const c of consents.filter((x) => x.type === 'envoi_recitation' && !x.withdrawnAt))
      await page.request.post(`/api/v1/account/consents/${c.id}/withdraw`, {
        headers: { 'x-awform': '1' },
        data: {},
      });
    await page.request.delete(`/api/v1/profiles/${kid.id}/classes/${cls.id}`, {
      headers: { 'x-awform': '1' },
    });
    await tctx.close();
  });
});
