import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test as base, type Page } from '@playwright/test';
import { totp } from './totp';

export { PARENT_PIN } from './totp';

/**
 * Chaque test est connecté (par défaut) au compte ADULTE de test : un seul profil, qui répond aux
 * exercices. `compte: 'parent'` pour le parent (deux enfants), `compte: null` pour un visiteur.
 */
export const EMAILS = { adulte: 'adulte@e2e.test', parent: 'parent@e2e.test' } as const;
export type Compte = keyof typeof EMAILS | null;

export function password(): string {
  const p = process.env.E2E_PASSWORD;
  if (!p) throw new Error('E2E_PASSWORD absent : lancer par playwright (globalSetup)');
  return p;
}

export async function login(page: Page, compte: keyof typeof EMAILS): Promise<void> {
  const r = await page.request.post('/api/v1/auth/login', {
    headers: { 'x-awform': '1' },
    data: { email: EMAILS[compte], password: password() },
  });
  expect(r.status(), await r.text()).toBe(200);
}

/** Nouveau compte adulte (hifẓ : chaque test part d'un carnet vide), connecté dans `page`. */
export async function newAdult(
  page: Page,
  label: string,
  country = 'FR',
): Promise<{ email: string; profileId: string }> {
  const email = `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.test`;
  const r = await page.request.post('/api/v1/auth/signup', {
    headers: { 'x-awform': '1' },
    data: {
      kind: 'adulte',
      email,
      password: password(),
      country,
      locale: 'fr',
      birthYear: 1988,
      pseudonym: 'Hafiz',
      // hors de l'Union européenne (Sénégal…) : accord exprès à l'hébergement hors du pays
      consents:
        country === 'FR'
          ? ['cgu', 'donnee_religieuse_art9']
          : ['cgu', 'donnee_religieuse_art9', 'transfert_hors_pays'],
    },
  });
  expect(r.status(), await r.text()).toBe(201);
  const me = (await r.json()) as { profiles: Array<{ id: string }> };
  return { email, profileId: me.profiles[0]!.id };
}

/**
 * Connexion du compte enseignant de test (second facteur obligatoire) : UNE SEULE implémentation, partagée par toutes les
 * suites (`enseignant.ts` la ré-exporte). Elle vivait en double ; la copie d'ici ignorait `E2E_TOTP_FILE` (fichier du pas
 * TOTP PROPRE à chaque dossier de travail, voir playwright.config.ts) et lisait/écrivait le fichier commun
 * `awform-e2e-totp-counter` d'une autre exécution : khatma.spec.ts:295 et hifz-classe.spec.ts:123 échouaient en
 * « totp_incorrect » (ou attendaient un pas futur) dès qu'une autre suite tournait sur la VM.
 * Le serveur n'accepte qu'un code par pas de 30 s, toujours plus récent que le précédent (anti-rejeu), et seulement le pas
 * courant ou ses voisins (± 30 s). Ici : le pas utilisé est toujours plus récent que le dernier consommé (fichier partagé
 * avec global-setup), jamais en avance de plus d'un pas sur l'horloge (sinon on attend le pas suivant), et un refus est
 * retenté avec le pas d'après.
 * Limite connue : un seul compte enseignant et des interrupteurs de fonctions GLOBAUX (khatma_wird, hifz_classe… réglés en
 * beforeAll/afterAll) : ces suites ne supportent pas `--workers` > 1 (les projets mobile et desktop se marcheraient dessus,
 * « totp_incorrect » ou carte absente) ; la configuration impose `workers: 1`.
 */
const TOTP_FILE = process.env.E2E_TOTP_FILE ?? join(tmpdir(), 'awform-e2e-totp-counter');
const TOTP_STEP = 30_000;
const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms));
const dernierPas = (): number => {
  try {
    return Number(readFileSync(TOTP_FILE, 'utf8')) || 0;
  } catch {
    return Number(process.env.E2E_TOTP_LAST ?? 0);
  }
};
export async function loginTeacher(page: Page): Promise<void> {
  const secret = process.env.E2E_TOTP_SECRET;
  if (!secret) throw new Error('E2E_TOTP_SECRET absent');
  let last = Math.max(dernierPas(), Number(process.env.E2E_TOTP_LAST ?? 0));
  let status = 0;
  let body = '';
  for (let essai = 0; essai < 4; essai++) {
    const c = Math.max(Math.floor(Date.now() / TOTP_STEP), last + 1);
    // le serveur accepte jusqu'au pas courant + 1 ; au-delà, attendre (1 s de marge après la bascule)
    const attente = (c - 1) * TOTP_STEP + 1_000 - Date.now();
    if (attente > 0) {
      // l'attente du pas suivant ne doit pas manger le délai du test lui-même
      test.info().setTimeout(test.info().timeout + attente);
      await attendre(attente);
    }
    const r = await page.request.post('/api/v1/auth/login', {
      headers: { 'x-awform': '1' },
      data: { email: 'maitre@e2e.test', password: password(), totp: totp(secret, c) },
    });
    status = r.status();
    body = await r.text();
    // pas consommé (ou refusé) : ne plus jamais le reproposer
    last = c;
    writeFileSync(TOTP_FILE, String(c));
    process.env.E2E_TOTP_LAST = String(c);
    if (status === 200) break;
    if (!body.includes('totp_incorrect')) break;
  }
  expect(status, body).toBe(200);
}

export const test = base.extend<{ compte: Compte; parEtapes: boolean }>({
  compte: ['adulte', { option: true }],
  /**
   * D1 : une leçon s'affiche section par section. Les suites qui vérifient le CONTENU des leçons (exercices,
   * bilans, Coran, écriture…) gardent la leçon entière, comme le choix « Tout voir d'un coup » de l'adulte ;
   * le parcours par étapes lui-même est vérifié par d1-design.spec.ts (`parEtapes: true`).
   */
  parEtapes: [false, { option: true }],
  page: async ({ page, compte, parEtapes }, use) => {
    if (!parEtapes)
      await page.addInitScript(() => {
        try {
          if (localStorage.getItem('awzid.lecon.tout') === null)
            localStorage.setItem('awzid.lecon.tout', '1');
        } catch {
          /* stockage indisponible */
        }
      });
    if (compte) await login(page, compte);
    await use(page);
  },
});

export { expect };
