import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { etatsAvecDemo, fonctionsParDefaut, fonctionsPour, FONCTIONS } from '@awform/school';
import type { Unite } from '$lib/parcours/parcours';
import {
  anneau,
  CLE_DERNIERE_LECTURE,
  contraste,
  derniereLecture,
  heroLecon,
  moment,
  prochainJalon,
  repriseMadjaliss,
  salutation,
} from './donnees';

const DIR = fileURLToPath(new URL('.', import.meta.url));
const u = (n: number, kind: Unite['kind'], statut: string | null = null): Unite => ({
  id: `ad1.u${n}`,
  n,
  kind,
  numLecon: kind === 'lecon' ? n : null,
  numBilan: kind === 'bilan' ? 1 : null,
  titleFr: `Titre ${n}`,
  titleAr: 'عنوان',
  statut,
  majLe: null,
  aEcriture: false,
  ecritureFaite: false,
});
const UNITES = [
  u(1, 'lecon', 'terminee'),
  u(2, 'lecon', 'terminee'),
  u(3, 'lecon'),
  u(4, 'lecon'),
  u(5, 'bilan'),
  u(6, 'lecon'),
  u(7, 'examen'),
];

describe('refonte v4 : règles pures', () => {
  it('héros : leçon du jour trouvée dans le livre, numéro et nombre de leçons', () => {
    expect(heroLecon(UNITES, 'ad1.u3')).toMatchObject({ numero: 3, total: 5 });
    expect(heroLecon(UNITES, 'inconnue')).toBeNull();
    expect(heroLecon([], 'ad1.u3')).toBeNull();
  });

  it('prochain jalon : premier bilan ou épreuve après la leçon du jour', () => {
    expect(prochainJalon(UNITES, 'ad1.u3')?.id).toBe('ad1.u5');
    expect(prochainJalon(UNITES, 'ad1.u6')?.id).toBe('ad1.u7');
    // leçon inconnue : à partir de la première unité pas encore faite
    expect(prochainJalon(UNITES, null)?.id).toBe('ad1.u5');
    expect(prochainJalon(UNITES.slice(0, 4), 'ad1.u3')).toBeNull();
  });

  it('moment et salutation selon l’heure', () => {
    expect([moment(7), moment(13), moment(14), moment(21)]).toEqual([
      'matin',
      'matin',
      'soir',
      'soir',
    ]);
    expect([salutation(9), salutation(17), salutation(18), salutation(2)]).toEqual([
      'bonjour',
      'bonjour',
      'bonsoir',
      'bonsoir',
    ]);
  });

  it('anneau doré : part de l’objectif, jamais plus d’un tour', () => {
    const a = anneau(2, 4);
    expect(a.tour).toBeCloseTo(301.6, 1);
    expect(a.trait).toBeCloseTo(150.8, 1);
    expect(anneau(9, 4).trait).toBe(a.tour);
    expect(anneau(0, 4).trait).toBe(0);
    expect(anneau(3, 0).trait).toBe(0);
  });

  it('dernière lecture du Coran (clé du lecteur), valeurs contrôlées', () => {
    const st = (v: string | null) => ({ getItem: () => v });
    expect(derniereLecture(st(JSON.stringify({ s: 1, a: 4, p: 1, t: 1 })))).toEqual({ s: 1, a: 4 });
    expect(derniereLecture(st(null))).toBeNull();
    expect(derniereLecture(st('{"s":115,"a":1}'))).toBeNull();
    expect(derniereLecture(st('pas du json'))).toBeNull();
    expect(derniereLecture(null)).toBeNull();
    expect(CLE_DERNIERE_LECTURE).toBe('awzid.coran.derniere-lecture.v1');
  });

  it('Madjaliss à reprendre : séance ouverte d’abord, sinon le dernier texte travaillé', () => {
    const ordre = ['akhdari', 'risala', 'tuhfa'];
    expect(repriseMadjaliss({}, ordre)).toBeNull();
    expect(repriseMadjaliss({ akhdari: { faites: [], ouverte: null } }, ordre)).toBeNull();
    expect(
      repriseMadjaliss(
        {
          akhdari: { faites: [1, 2], ouverte: 2, fini: '2026-10-10' },
          risala: { faites: [1], ouverte: 20 },
        },
        ordre,
      ),
    ).toEqual({ id: 'risala', seance: 20, faites: 1 });
    expect(
      repriseMadjaliss(
        {
          akhdari: { faites: [1], ouverte: 1, fini: '2026-10-01' },
          tuhfa: { faites: [1, 2], ouverte: 2, fini: '2026-10-12' },
        },
        ordre,
      ),
    ).toEqual({ id: 'tuhfa', seance: null, faites: 2 });
  });
});

describe('refonte v4 : interrupteur « design_v4 »', () => {
  it('coupé par défaut (production, bêta, appareil sans réseau), allumé par défaut sur la démonstration', () => {
    expect(FONCTIONS.design_v4).toEqual({ defaut: 'off', demo: 'on' });
    expect(fonctionsParDefaut().design_v4).toBe(false);
    expect(fonctionsParDefaut('beta').design_v4).toBe(false);
    const ctx = {
      roles: ['eleve'],
      age: 'adulte' as const,
      pays: 'FR',
      ecoles: [],
      canal: 'production' as const,
    };
    expect(fonctionsPour(ctx, etatsAvecDemo({}, false), []).design_v4).toBe(false);
    expect(fonctionsPour(ctx, etatsAvecDemo({}, true), []).design_v4).toBe(true);
    // l'administrateur l'emporte toujours, sans redéploiement (état de base ou exception)
    expect(fonctionsPour(ctx, etatsAvecDemo({ design_v4: 'off' }, true), []).design_v4).toBe(false);
    expect(
      fonctionsPour(ctx, etatsAvecDemo({}, false), [{ cle: 'design_v4', effet: 'on', pays: 'FR' }])
        .design_v4,
    ).toBe(true);
    // les autres fonctions ne changent pas sur la démonstration
    expect(fonctionsPour(ctx, etatsAvecDemo({}, true), []).conversation).toBe(false);
  });
});

describe('refonte v4 : couleurs (AA partout, or jamais en texte sur l’ivoire)', () => {
  const css = readFileSync(join(DIR, 'v4.css'), 'utf8');
  const bloc = (sel: string) => {
    const i = css.indexOf(`${sel} {`);
    const corps = css.slice(i, css.indexOf('}', i));
    return Object.fromEntries(
      [...corps.matchAll(/--v4-([a-z0-9-]+):\s*(#[0-9a-f]{6})/g)].map((m) => [m[1]!, m[2]!]),
    ) as Record<string, string>;
  };
  const clair: Record<string, string> = { ...bloc('.v4'), papier: '#fbf7ee' };
  const sombre: Record<string, string> = {
    ...clair,
    ...bloc(":root[data-mode='sombre'] .v4"),
    papier: '#0d1a15',
  };
  const PAIRES: Array<[string, string]> = [
    ['texte', 'carte'],
    ['doux', 'carte'],
    ['titre', 'carte'],
    ['lien', 'carte'],
    ['texte', 'papier'],
    ['doux', 'papier'],
    ['titre', 'papier'],
    ['titre', 'or-voile'],
    ['doux', 'or-voile'],
    ['titre', 'vert-voile'],
    ['sur-bandeau', 'bandeau'],
    ['sur-bandeau', 'bandeau-2'],
    ['sur-bandeau-doux', 'bandeau'],
    ['sur-bandeau-doux', 'bandeau-2'],
    ['sur-or', 'or'],
  ];
  it.each([
    ['clair', clair],
    ['sombre', sombre],
  ])('thème %s : chaque paire texte / fond ≥ 4,5:1', (_, c) => {
    for (const [a, b] of PAIRES) {
      expect(c[a], `${a}`).toMatch(/^#/);
      expect(contraste(c[a]!, c[b]!), `${a} sur ${b}`).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('le texte ne prend jamais l’or (seulement des pictogrammes décoratifs sur le vert ou en filigrane)', () => {
    const permis = ['.v4-rosette', '.etoile', '.grand', '.chev-or', '.v4-picto.or'];
    const fautes: string[] = [];
    for (const f of readdirSync(DIR).filter((x) => /\.(css|svelte)$/.test(x))) {
      const src = readFileSync(join(DIR, f), 'utf8');
      for (const m of src.matchAll(/([^{}]+)\{[^}]*(?<![-\w])color:\s*var\(--v4-or\)/g)) {
        const sel = m[1]!.trim().split('\n').pop()!.trim();
        if (!permis.some((p) => sel.includes(p))) fautes.push(`${f}: ${sel}`);
      }
    }
    expect(fautes).toEqual([]);
    // pictogramme « or » : vert profond sur l'or pâle en clair (l'or est réservé au sombre)
    expect(clair['picto-or']).toBe(clair.titre);
  });
});
