import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FONCTION_CLES } from '@awform/school';
import {
  COPIE_KEY,
  COPIE_TTL_MS,
  copieFraiche,
  decisionDe,
  ecrireCopie,
  lireCopie,
} from './fonctions-copie';
import { cleDeChemin, envoyer, noterUsage } from './usage';

/** localStorage minimal (environnement node) */
function memoire() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
  };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoire());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('F5 — interrupteurs gardés sur l’appareil', () => {
  it('sans copie : valeurs sûres du registre (fonctions publiées ouvertes)', () => {
    const d = decisionDe(null);
    expect(Object.keys(d).sort()).toEqual([...FONCTION_CLES].sort());
    expect(Object.values(d).every((v) => v === true)).toBe(true);
  });

  it('copie par personne : décision du serveur, hors ligne comprise ; clé inconnue → défaut', () => {
    ecrireCopie('p1', { at: Date.now(), fonctions: { tuteur: false }, canal: 'production' });
    ecrireCopie('p2', { at: Date.now(), fonctions: { tuteur: true }, canal: 'beta' });
    expect(decisionDe(lireCopie('p1')).tuteur).toBe(false);
    expect(decisionDe(lireCopie('p1')).animations).toBe(true);
    expect(decisionDe(lireCopie('p2')).tuteur).toBe(true);
    expect(lireCopie('autre')).toBeNull();
  });

  it('copie courte (5 minutes) et au plus 12 personnes gardées', () => {
    const now = Date.now();
    expect(copieFraiche({ at: now - 1000, fonctions: {}, canal: 'production' }, now)).toBe(true);
    expect(
      copieFraiche({ at: now - COPIE_TTL_MS - 1, fonctions: {}, canal: 'production' }, now),
    ).toBe(false);
    for (let i = 0; i < 15; i++)
      ecrireCopie(`p${i}`, { at: now + i, fonctions: {}, canal: 'production' });
    const all = JSON.parse(localStorage.getItem(COPIE_KEY)!) as object;
    expect(Object.keys(all)).toHaveLength(12);
    expect(lireCopie('p0')).toBeNull();
    expect(lireCopie('p14')).not.toBeNull();
  });

  it('stockage illisible : valeurs sûres, sans erreur', () => {
    localStorage.setItem(COPIE_KEY, '{pas du json');
    expect(lireCopie('p1')).toBeNull();
    expect(decisionDe(lireCopie('p1')).tuteur).toBe(true);
  });
});

describe('F5 — usage sans traceur (appareil)', () => {
  it('chemins → clés d’une liste fermée (jamais l’adresse elle-même)', () => {
    expect(cleDeChemin('/lecons/en1.l03')).toBe('lecon');
    expect(cleDeChemin('/coran/lecteur')).toBe('coran_lecteur');
    expect(cleDeChemin('/coran/recitateurs')).toBe('coran');
    expect(cleDeChemin('/quotidien/verset')).toBe('quotidien_verset');
    expect(cleDeChemin('/enseignant/classe/1')).toBeNull();
    expect(cleDeChemin('/connexion')).toBeNull();
  });

  it('une clé par jour et par personne ; seulement des clés connues ; rien sans personne', async () => {
    const sent: unknown[] = [];
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_u: string, init: RequestInit) => {
        sent.push(JSON.parse(String(init.body)));
        return new Response(null, { status: 204 });
      }),
    );
    noterUsage('coran', 'p1');
    noterUsage('coran', 'p1');
    noterUsage('inconnue', 'p1');
    noterUsage('hifz', null);
    noterUsage('hifz', 'compte');
    await envoyer();
    expect(sent).toEqual([{ profil: 'p1', cles: ['coran'] }, { cles: ['hifz'] }]);
    // déjà envoyée aujourd'hui : rien de plus
    noterUsage('coran', 'p1');
    await envoyer();
    expect(sent).toHaveLength(2);
  });

  it('hors ligne ou erreur : la file est gardée pour plus tard (même jour)', async () => {
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('réseau');
      }),
    );
    noterUsage('vivre', 'p9');
    await envoyer();
    const sent: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_u: string, init: RequestInit) => {
        sent.push(JSON.parse(String(init.body)));
        return new Response(null, { status: 204 });
      }),
    );
    await envoyer();
    expect(sent).toEqual([{ profil: 'p9', cles: ['vivre'] }]);
  });
});
