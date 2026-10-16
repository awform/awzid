import type { Page } from '@playwright/test';
import { expect, password } from './fixtures';

/**
 * Inscription en trois étapes (refonte du 16/10/2026) : aides communes des e2e qui remplissent le formulaire.
 *  1. identifiants : adresse, mot de passe et confirmation → « Continuer » ;
 *  2. profil : qui (parent / adulte), pays, province, année de naissance, pseudonyme, façon d'avancer → « Continuer » ;
 *  3. accords : obligatoires (CGU, article 9, transfert si le pays l'exige), facultatifs repliés → « Créer mon compte ».
 * Chaque aide attend l'étape suivante : un échec dit à quelle étape le parcours s'est arrêté.
 */
export interface ProfilInscription {
  kind?: 'parent' | 'adulte';
  pays?: string;
  region?: string;
  annee?: number | string;
  pseudonyme?: string;
}
export interface OptionsInscription extends ProfilInscription {
  email: string;
  motDePasse?: string;
  /** accord de transfert hors du pays : coché s'il est demandé (défaut), ou laissé vide (`false`) */
  transfert?: boolean;
  rappels?: boolean;
  /** cliquer « Créer mon compte » (défaut : oui) */
  envoyer?: boolean;
}

/** ouvre la page d'inscription (formulaire libre) et attend la première étape */
export async function ouvrirInscription(page: Page): Promise<void> {
  await page.goto('/inscription');
  await expect(page.getByTestId('etape-1')).toBeVisible();
}

export async function etapeIdentifiants(
  page: Page,
  email: string,
  motDePasse = password(),
): Promise<void> {
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(motDePasse);
  await page.locator('#password-confirmer').fill(motDePasse);
  await page.getByTestId('etape-suivante').click();
  await expect(page.getByTestId('etape-2')).toBeVisible();
}

export async function etapeProfil(page: Page, p: ProfilInscription = {}): Promise<void> {
  const kind = p.kind ?? 'parent';
  await page.getByTestId(`type-${kind}`).check();
  if (p.pays) await page.locator('#country').selectOption(p.pays);
  if (p.region) await page.getByTestId('region').selectOption(p.region);
  await page.locator('#birthYear').fill(String(p.annee ?? (kind === 'parent' ? 1985 : 1990)));
  if (p.pseudonyme) await page.locator('#pseudonym').fill(p.pseudonyme);
  await page.getByTestId('etape-suivante').click();
  await expect(page.getByTestId('etape-3')).toBeVisible();
}

export async function etapeAccords(
  page: Page,
  o: { transfert?: boolean; rappels?: boolean; envoyer?: boolean } = {},
): Promise<void> {
  await page.getByTestId('consent-cgu').check();
  await page.getByTestId('consent-art9').check();
  const transfert = page.getByTestId('consent-transfert');
  if (o.transfert !== false && (await transfert.count())) await transfert.check();
  if (o.rappels) {
    await page.getByTestId('options-facultatives').locator('summary').click();
    await page.getByTestId('consent-rappels').check();
  }
  if (o.envoyer !== false) await page.getByRole('button', { name: 'Créer mon compte' }).click();
}

/** les trois étapes depuis la page déjà ouverte (étape 1 affichée) */
export async function remplirInscription(page: Page, o: OptionsInscription): Promise<void> {
  await etapeIdentifiants(page, o.email, o.motDePasse);
  await etapeProfil(page, o);
  await etapeAccords(page, o);
}

/** ouvre /inscription puis remplit les trois étapes */
export async function inscrire(page: Page, o: OptionsInscription): Promise<void> {
  await ouvrirInscription(page);
  await remplirInscription(page, o);
}
