import { describe, expect, it, vi } from 'vitest';
import { adresseEchec, chargerModule } from './charger';

const echec = (url: string) => new TypeError(`Failed to fetch dynamically imported module: ${url}`);

describe('chargerModule (F5 : modules à la demande)', () => {
  it('réussite du premier coup : une seule tentative', async () => {
    const imp = vi.fn(async () => ({ x: 1 }));
    await expect(chargerModule(imp, [0, 0])).resolves.toEqual({ x: 1 });
    expect(imp).toHaveBeenCalledTimes(1);
  });

  it('échec mémorisé par le navigateur : nouvelle tentative sous une adresse neuve', async () => {
    const imp = vi.fn(async () => {
      throw echec('http://127.0.0.1:4180/_app/immutable/chunks/AvisDialog.abc.js');
    });
    const importer = vi.fn(async (url: string) => ({ url }));
    const r = (await chargerModule(imp, [0, 0], importer)) as { url: string };
    expect(imp).toHaveBeenCalledTimes(1);
    expect(r.url).toMatch(
      /^http:\/\/127\.0\.0\.1:4180\/_app\/immutable\/chunks\/AvisDialog\.abc\.js\?essai=\d+$/,
    );
  });

  it('toujours en échec : trois tentatives, puis l’erreur (l’appelant montre « Connexion nécessaire »)', async () => {
    const imp = vi.fn(async () => {
      throw echec('https://awzid.example/_app/x.js');
    });
    const importer = vi.fn(async (url: string) => {
      throw echec(url);
    });
    await expect(chargerModule(imp, [0, 0], importer)).rejects.toThrow(/Failed to fetch/);
    expect(imp).toHaveBeenCalledTimes(1);
    expect(importer).toHaveBeenCalledTimes(2);
  });

  it('message sans adresse (Safari) : la même fonction est rappelée', async () => {
    let n = 0;
    const imp = vi.fn(async () => {
      if (++n < 3) throw new TypeError('Importing a module script failed.');
      return { ok: true };
    });
    await expect(chargerModule(imp, [0, 0])).resolves.toEqual({ ok: true });
    expect(imp).toHaveBeenCalledTimes(3);
  });

  it('adresse lue dans les messages de Chromium et de Firefox, sans paramètre', () => {
    expect(adresseEchec(echec('http://h/_app/a.js?essai=2'))).toBe('http://h/_app/a.js');
    expect(
      adresseEchec(new TypeError('error loading dynamically imported module: https://h/b.js')),
    ).toBe('https://h/b.js');
    expect(adresseEchec(new TypeError('Importing a module script failed.'))).toBeNull();
  });
});
