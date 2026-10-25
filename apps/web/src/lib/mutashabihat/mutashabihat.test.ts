import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadTanzil } from '@awform/content';
import { FONCTIONS } from '@awform/school';
import { convertir, SOURCE, SORTIE } from '../../../scripts/mutashabihat-donnees.mjs';
import { melanger, pairesMemorisees, question, questionHasard, TYPES } from './exercices';
import donnees from './donnees.json';
import textes from './textes-fr.json';
import {
  cle,
  jumeauxDe,
  NB_PAIRES,
  rangsSurlignes,
  STATUT,
  toutesLesPaires,
  versetsAvecJumeaux,
} from './paires';

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const lire = (rel: string) => readFileSync(at(rel), 'utf8');
const tanzil = loadTanzil(
  readFileSync(at('../../../../../infra/ci/contenu/coran/tanzil-uthmani.tsv'), 'utf8'),
);
const carte = JSON.parse(readFileSync(SOURCE, 'utf8')) as {
  groupes: Array<{
    paires: Array<{
      a: string;
      b: string;
      statut: string;
      differences: Array<{ a: string; b: string; pos_a: number | null; pos_b: number | null }>;
    }>;
  }>;
};
const octets = (s: string) => Buffer.from(s, 'utf8').toString('hex');
const mots = (ref: string) => tanzil.get(ref)!.split(' ');

describe('mutashābihāt : données du référent', () => {
  it('SEULES les paires « reconnues par la source » (349) sont dans l’application', () => {
    const reconnues = carte.groupes
      .flatMap((g) => g.paires)
      .filter((p) => p.statut === 'reconnu_source');
    expect(reconnues).toHaveLength(349);
    expect(NB_PAIRES).toBe(349);
    expect(STATUT).toBe('reconnu_source');
    // jamais une paire d'un autre statut, ni leur identifiant
    const autres = carte.groupes
      .flatMap((g) => g.paires)
      .filter((p) => p.statut !== 'reconnu_source');
    expect(autres.length).toBeGreaterThan(500);
    const ids = new Set(toutesLesPaires().map((j) => j.id));
    for (const p of autres) expect(ids.has(`${p.a}|${p.b}`), `${p.a}|${p.b}`).toBe(false);
    expect(ids.size).toBe(349);
  });

  it('le fichier compact est à jour : régénéré depuis la carte, octet pour octet', () => {
    expect(`${JSON.stringify(convertir(JSON.parse(readFileSync(SOURCE, 'utf8'))))}\n`).toBe(
      readFileSync(SORTIE, 'utf8'),
    );
    expect(donnees.paires).toHaveLength(349);
  });

  it('chaque rang de mot désigne le mot attendu de la ligne Tanzil (texte jamais retapé)', () => {
    let n = 0;
    for (const g of carte.groupes)
      for (const p of g.paires.filter((x) => x.statut === 'reconnu_source'))
        for (const d of p.differences) {
          if (d.pos_a !== null) {
            expect(octets(mots(p.a)[d.pos_a]!), `${p.a}[${d.pos_a}]`).toBe(octets(d.a));
            n++;
          }
          if (d.pos_b !== null) {
            expect(octets(mots(p.b)[d.pos_b]!), `${p.b}[${d.pos_b}]`).toBe(octets(d.b));
            n++;
          }
        }
    expect(n).toBeGreaterThan(300);
  });

  it('les jumeaux sont symétriques ; du plus net au plus large ; les rangs surlignés existent', () => {
    expect(versetsAvecJumeaux().length).toBeGreaterThan(400);
    for (const p of toutesLesPaires()) {
      const [sa, aa] = [p.moi.s, p.moi.a];
      const inverse = jumeauxDe(p.autre.s, p.autre.a).find((x) => x.id === p.id);
      expect(inverse, p.id).toBeTruthy();
      expect(inverse!.autre).toEqual({ s: sa, a: aa });
      expect(rangsSurlignes(inverse!, 0)).toEqual(rangsSurlignes(p, 1));
      for (const r of rangsSurlignes(p, 0)) expect(r).toBeLessThan(mots(cle(p.moi)).length);
      for (const r of rangsSurlignes(p, 1)) expect(r).toBeLessThan(mots(cle(p.autre)).length);
    }
    const l = jumeauxDe(2, 35);
    expect(l.some((j) => cle(j.autre) === '7:19')).toBe(true);
    const nets = l.map((j) => j.diffs.length || 99);
    expect(nets).toEqual([...nets].sort((a, b) => a - b));
  });

  it('repère « proposé par Awzid » (aide-mémoire) et source savante pour chaque paire ; jamais de vers non collationné', () => {
    for (const p of toutesLesPaires()) {
      // repère vide : formule commune (aucune différence chiffrée), un repère neutre est alors affiché (mt.repere_commun)
      if (p.repere === '') expect(p.diffs, p.id).toEqual([]);
      else expect(p.repere.length, p.id).toBeGreaterThan(10);
      expect(p.repere, p.id).not.toMatch(/[؀-ۿ]/);
      expect(p.sources.length, p.id).toBeGreaterThan(0);
      for (const s of p.sources) expect(s.ouvrage, p.id).toMatch(/Shamela/);
    }
    expect(JSON.stringify(donnees)).not.toMatch(/bayt|reperes_classiques|collationner/);
  });
});

describe('mutashābihāt : test au hasard qui mélange les jumeaux', () => {
  const suivant = (n: number) => {
    let x = n;
    return () => {
      x = (x * 1664525 + 1013904223) % 4294967296;
      return x / 4294967296;
    };
  };
  const plages = Array.from({ length: 114 }, (_, i) => ({ s: i + 1, from: 1, to: 286 }));

  it('seulement des jumeaux dont les DEUX versets sont mémorisés', () => {
    expect(pairesMemorisees([])).toEqual([]);
    expect(pairesMemorisees([{ s: 2, from: 35, to: 35 }])).toEqual([]);
    const deux = pairesMemorisees([
      { s: 2, from: 35, to: 35 },
      { s: 7, from: 19, to: 19 },
    ]);
    expect(
      deux.every((j) => [cle(j.moi), cle(j.autre)].every((k) => ['2:35', '7:19'].includes(k))),
    ).toBe(true);
    expect(deux.length).toBeGreaterThan(0);
    expect(pairesMemorisees(plages)).toHaveLength(NB_PAIRES);
  });

  it('chaque question a exactement une bonne réponse, tirée des versets Tanzil', () => {
    const r = suivant(7);
    const vus = { suite: 0, mot: 0, sourate: 0 };
    for (const j of toutesLesPaires()) {
      const m = tanzil.get(cle(j.moi))!;
      const o = tanzil.get(cle(j.autre))!;
      for (const type of TYPES) {
        const q = question(type, j, m, o, r);
        if (!q) continue;
        vus[type]++;
        expect(
          q.choix.filter((c) => c.juste),
          j.id,
        ).toHaveLength(1);
        expect(q.choix).toHaveLength(2);
        if (q.type === 'mot') {
          expect(octets(q.choix.find((c) => c.juste)!.mot)).toBe(octets(m.split(' ')[q.trou]!));
          expect(q.choix[0]!.mot).not.toBe(q.choix[1]!.mot);
        }
        if (q.type === 'suite') {
          expect(q.debut).toEqual(m.split(' ').slice(0, q.debut.length));
          const juste = q.choix.find((c) => c.juste)!.mots;
          expect(m.split(' ').slice(q.debut.length).join(' ').startsWith(juste.join(' '))).toBe(
            true,
          );
        }
        if (q.type === 'sourate') expect(new Set(q.choix.map((c) => c.s)).size).toBe(2);
      }
    }
    expect(vus.suite).toBeGreaterThan(100);
    expect(vus.mot).toBeGreaterThan(100);
    expect(vus.sourate).toBeGreaterThan(100);
  });

  it('une question au hasard existe presque toujours ; le mélange ne perd rien', () => {
    const r = suivant(3);
    let ok = 0;
    const l = toutesLesPaires();
    for (const j of l)
      if (questionHasard(j, tanzil.get(cle(j.moi))!, tanzil.get(cle(j.autre))!, r)) ok++;
    expect(ok / l.length).toBeGreaterThan(0.8);
    expect(melanger([1, 2, 3, 4], r).sort()).toEqual([1, 2, 3, 4]);
  });
});

describe('mutashābihāt : règles du projet', () => {
  const src = [
    './Jumeaux.svelte',
    './CarteJumeau.svelte',
    './Test.svelte',
    './MotsJumeau.svelte',
    './Tuile.svelte',
    './exercices.ts',
    './paires.ts',
  ]
    .map(lire)
    .join('\n');

  it('coupée par défaut ; la coquille ne contient que l’interrupteur et des imports dynamiques', () => {
    expect(FONCTIONS.mutashabihat.defaut).toBe('off');
    for (const p of [
      '../../routes/hifz/+page.svelte',
      '../../routes/hifz/[outil]/+page.svelte',
      '../hifz-outils/TestHasard.svelte',
    ]) {
      const page = lire(p);
      expect(page, p).toMatch(/fn\('mutashabihat'\)[\s\S]{0,80}import\('\$lib\/mutashabihat'\)/);
      expect(page, p).not.toMatch(/^\s*import .* from '\$lib\/mutashabihat/m);
    }
    expect(lire('../../../scripts/groupes.mjs')).toMatch(/lib\\\/mutashabihat\\\/index\\\.ts/);
  });

  it('le Coran est récité par Ayyūb UNIQUEMENT : aucune synthèse vocale, un seul récitateur', () => {
    expect(src).not.toMatch(
      /speechSynthesis|SpeechSynthesis|SpeechSynthesisUtterance|\btts\b|lecons-audio/i,
    );
    expect([...src.matchAll(/['"`]([a-z]+-hafs)['"`]/g)].map((m) => m[1])).toEqual(['ayyoub-hafs']);
    expect(src).toContain('suraPack(AYYOUB');
  });

  it('aucune paire non reconnue, aucune explication (tawjīh) ; l’arabe n’est jamais dans un texte français', () => {
    for (const [k, v] of Object.entries(textes as Record<string, string>)) {
      expect(v, k).not.toMatch(/[؀-ۿ]/);
      expect(v, k).not.toMatch(/tawj[iī]h|explication/i);
    }
    // le texte coranique est rendu dans `.quran-text` (jamais dans <Bidi>), sur sa ligne
    expect(lire('./MotsJumeau.svelte')).toMatch(/class="mj quran-text"/);
    expect(lire('./MotsJumeau.svelte')).not.toMatch(/<Bidi/);
  });

  it('toutes les clés utilisées existent', () => {
    const cles = new Set([...src.matchAll(/['"`](mt\.[a-z_]+)['"`]/g)].map((m) => m[1]!));
    for (const k of cles) expect(textes, k).toHaveProperty([k]);
  });
});
