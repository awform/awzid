/**
 * Lot F3 — comptes de la bêta, de bout en bout (téléphone et ordinateur), avec la BOÎTE DE DÉMONSTRATION des
 * e-mails (AWFORM_MAIL=journal : aucun envoi réel, un fichier JSON par message) :
 *  - inscription avec vérification de l'adresse (lien reçu, ouvert, adresse vérifiée) ;
 *  - mot de passe oublié de bout en bout (lien, nouveau mot de passe, connexion ; lien réutilisé refusé) ;
 *  - accord « article 9 » retiré → page « Accords » au premier usage → accord redonné ;
 *  - mineur aux États-Unis refusé (message clair) ;
 *  - fuseau horaire du compte : les heures s'affichent dans ce fuseau.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, password, test } from './fixtures';

const YEAR = new Date().getFullYear();
const ART9 = 'donnee_religieuse_art9';
let n = 0;
const mail = (label: string, project: string) =>
  `f3-${label}-${project}-${Date.now()}-${n++}@e2e.test`;

/** dernier message de ce type reçu à cette adresse dans la boîte de démonstration */
async function lastMail(to: string, kind: string): Promise<{ subject: string; text: string }> {
  const dir = process.env.E2E_MAIL_DIR!;
  let found: { subject: string; text: string } | null = null;
  await expect
    .poll(
      () => {
        let files: string[];
        try {
          files = readdirSync(dir)
            .filter((f) => f.endsWith('.json'))
            .sort();
        } catch {
          return false;
        }
        for (const f of files.reverse()) {
          const m = JSON.parse(readFileSync(join(dir, f), 'utf8'));
          if (m.to === to && m.kind === kind) {
            found = m;
            return true;
          }
        }
        return false;
      },
      { timeout: 15_000 },
    )
    .toBe(true);
  return found!;
}
const linkOf = (text: string) => /https?:\/\/\S+\/acces#\S+/.exec(text)![0];

async function apiSignup(page: Page, email: string, country = 'FR', kind = 'parent') {
  const r = await page.request.post('/api/v1/auth/signup', {
    headers: { 'x-awform': '1' },
    data: {
      kind,
      email,
      password: password(),
      country,
      locale: 'fr',
      birthYear: 1984,
      consents: country === 'FR' ? ['cgu', ART9] : ['cgu', ART9, 'transfert_hors_pays'],
    },
  });
  expect(r.status(), await r.text()).toBe(201);
}

test('inscription : lien de vérification reçu dans la boîte de démonstration, adresse vérifiée', async ({
  page,
}, info) => {
  const email = mail('verif', info.project.name);
  await page.goto('/inscription');
  await page.getByTestId('type-parent').check();
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password());
  await page.locator('#birthYear').fill('1986');
  // l'accord « article 9 » est obligatoire et jamais coché d'avance
  await expect(page.getByTestId('consent-art9')).not.toBeChecked();
  await page.getByTestId('consent-cgu').check();
  await page.getByTestId('consent-art9').check();
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(page).toHaveURL(/\/profils$/);
  await page.goto('/compte');
  await expect(page.getByTestId('email-statut')).toContainText('pas encore vérifiée');
  const m = await lastMail(email, 'verification');
  expect(m.subject).toBe('Confirmez votre adresse e-mail');
  await page.goto(linkOf(m.text));
  await expect(page.getByTestId('acces-message')).toContainText(
    'votre adresse e-mail est vérifiée',
  );
  // le jeton a quitté la barre d'adresse
  expect(page.url()).not.toContain('#');
  await page.goto('/compte');
  await expect(page.getByTestId('email-statut')).toContainText('Adresse vérifiée');
});

test('mot de passe oublié de bout en bout (boîte de démonstration), lien à usage unique', async ({
  page,
}, info) => {
  const email = mail('oubli', info.project.name);
  await apiSignup(page, email);
  await page.request.post('/api/v1/auth/logout', { headers: { 'x-awform': '1' } });
  await page.goto('/connexion');
  await page.getByTestId('lien-oubli').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mot de passe oublié');
  await page.locator('#email').fill(email);
  await page.getByTestId('acces-valider').click();
  await expect(page.getByTestId('acces-message')).toContainText(
    'Si un compte utilise cette adresse',
  );
  const m = await lastMail(email, 'reinitialisation');
  const link = linkOf(m.text);
  await page.goto(link);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nouveau mot de passe');
  const NEW = `nouvelle phrase de passe ${info.project.name}`;
  await page.locator('#password').fill(NEW);
  await page.getByTestId('acces-valider').click();
  await expect(page.getByTestId('acces-message')).toContainText('Mot de passe changé');
  await page.getByRole('link', { name: 'Aller à la connexion' }).click();
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(NEW);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL(/\/profils$/);
  // avis envoyé au titulaire ; le même lien ne sert plus
  await lastMail(email, 'mot_de_passe_modifie');
  await page.goto(link);
  await page.locator('#password').fill('encore une autre phrase');
  await page.getByTestId('acces-valider').click();
  await expect(page.getByTestId('acces-erreur')).toContainText('plus valable');
});

test('accord « article 9 » retiré : page « Accords » au premier usage, accord redonné avec le mot de passe', async ({
  page,
}, info) => {
  await apiSignup(page, mail('art9', info.project.name));
  const kid = await page.request.post('/api/v1/profiles', {
    headers: { 'x-awform': '1' },
    data: {
      pseudonym: 'Nour',
      birthYear: YEAR - 8,
      levelCode: 'en1',
      password: password(),
      consents: ['compte_suivi', ART9],
    },
  });
  expect(kid.status()).toBe(201);
  await page.goto('/compte');
  page.once('dialog', (d) => void d.accept());
  const li = page
    .getByTestId('consentements')
    .locator('li', { hasText: 'conviction religieuse' })
    .first();
  await li.getByRole('button', { name: 'Retirer' }).click();
  await expect(page.getByRole('status')).toBeVisible();
  await page.goto('/aujourdhui');
  await expect(page).toHaveURL(/\/acces\/accords$/);
  await expect(page.getByTestId('accords-manquants')).toContainText('titulaire du compte');
  await page.locator('#password').fill(password());
  await page.getByTestId('acces-valider').click();
  await expect(page).not.toHaveURL(/\/acces/);
  const me = await (await page.request.get('/api/v1/auth/me')).json();
  expect(me.accordsManquants).toEqual([]);
});

test('États-Unis : un enfant de moins de 13 ans est refusé avec un message clair', async ({
  page,
}, info) => {
  await apiSignup(page, mail('us', info.project.name), 'US');
  await page.goto('/profils');
  await page.getByTestId('ajouter-enfant').click();
  await page.locator('#pseudonym').fill('Kid');
  await page.locator('#birthYear').fill(String(YEAR - 9));
  await expect(page.getByTestId('ferme-moins-13')).toContainText('moins de 13 ans');
  await page.getByTestId('consent-suivi').check();
  await page.getByTestId('consent-art9').check();
  await page.locator('#password').fill(password());
  await page.getByTestId('creer-profil').click();
  await expect(page.getByRole('alert')).toContainText(
    "Awzid n'est pas encore ouvert aux enfants de moins de 13 ans",
  );
  const me = await (await page.request.get('/api/v1/auth/me')).json();
  expect(me.profiles).toHaveLength(0);
});

test('fuseau horaire du compte : les heures s’affichent dans ce fuseau, pas dans celui de l’appareil', async ({
  page,
}, info) => {
  await apiSignup(page, mail('tz', info.project.name));
  const me = await (await page.request.get('/api/v1/auth/me')).json();
  const at = new Date(me.account.createdAt);
  const hm = (tz: string) =>
    new Intl.DateTimeFormat('fr', { hour: '2-digit', minute: '2-digit', timeZone: tz }).format(at);
  await page.goto('/compte');
  // appareil de test : Europe/Paris
  await expect(page.getByTestId('cree-le')).toContainText(hm('Europe/Paris'));
  await page.getByTestId('fuseau').selectOption('America/Toronto');
  await expect(page.getByTestId('cree-le')).toContainText(hm('America/Toronto'));
  await expect(page.getByTestId('cree-le')).not.toContainText(hm('Europe/Paris'));
  expect((await (await page.request.get('/api/v1/auth/me')).json()).account.tz).toBe(
    'America/Toronto',
  );
});
