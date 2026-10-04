import 'fake-indexeddb/auto';
import { readdirSync, readFileSync } from 'node:fs';
import { TAJWID_RULES, textHash } from '@awform/content/tajwid';
import { describe, expect, it } from 'vitest';
import { bidiSegments } from '../bidi/segments';
import {
  entryOf,
  examples,
  LEGEND_CHILD,
  LEGEND_FULL,
  readTajwidPrefs,
  runAttrs,
  tajwidAllowed,
  verseRuns,
  writeTajwidPrefs,
  type TajwidSura,
} from './tajwid';

/** Lot 29 — tajwid en couleurs : familles par public, riwāya, découpage, réglages, poids des fichiers. */
const R = (r: string) => TAJWID_RULES.indexOf(r as (typeof TAJWID_RULES)[number]);
// textes d'ESSAI (pas des versets) ; la « basmala » d'essai a quatre mots comme la vraie
const BASM = 'أَ بَ تَ ثَ';
const V1 = `${BASM} مِنْ رَبِّهِمْ`;
const V2 = 'قَدْ رَأَى';
const sura = (entries: Array<[string, ...number[]]>): TajwidSura => ({
  v: 1,
  s: 2,
  src: 'essai',
  a: entries,
});

describe('tajwid en couleurs (lot 29)', () => {
  it('riwāya : seulement Ḥafṣ', () => {
    expect(tajwidAllowed('hafs')).toBe(true);
    expect(tajwidAllowed('qalun')).toBe(false);
    expect(tajwidAllowed('warsh')).toBe(false);
    expect(tajwidAllowed(null)).toBe(false);
  });

  it('palette complète : chaque règle de la source a une couleur et une seule', () => {
    const all = LEGEND_FULL.flatMap((e) => e.rules);
    expect([...all].sort()).toEqual([...TAJWID_RULES].sort());
    expect(new Set(all).size).toBe(all.length);
  });

  it('palette enfant : quatre familles, le chant du nez en vert', () => {
    expect(LEGEND_CHILD.map((e) => e.family)).toEqual(['nasal', 'long', 'rebond', 'muet']);
    expect(LEGEND_CHILD[0]!.token).toBe('tjk-nez');
    expect(entryOf('ikhfa', true)?.token).toBe('tjk-nez');
    expect(entryOf('madd_6', true)?.token).toBe('tjk-long');
    // l'assimilation sans chant du nez couvre aussi une lettre prononcée : pas de couleur pour l'enfant
    expect(entryOf('idghaam_no_ghunnah', true)).toBeNull();
    expect(runAttrs('idghaam_no_ghunnah')).toMatchObject({
      'data-tj': 'tj-assim',
      'data-tjk': undefined,
    });
    expect(runAttrs('ghunnah')).toMatchObject({ 'data-tj': 'tj-ghunna', 'data-tjk': 'tjk-nez' });
  });

  it('basmala et mots du verset : texte exact, empreinte vérifiée', () => {
    const at = BASM.length + 1;
    const d = sura([
      [textHash(V1), R('hamzat_wasl'), 0, 1, R('ikhfa'), at + 2, 2],
      [textHash(V2), R('qalqalah'), 2, 2],
    ]);
    const v1 = verseRuns({ s: 2, a: 1, text: V1 }, BASM, d)!;
    expect(v1.basmala!.map((w) => w.map((p) => p.t).join('')).join(' ')).toBe(BASM);
    expect(v1.words.map((w) => w.map((p) => p.t).join('')).join(' ')).toBe('مِنْ رَبِّهِمْ');
    expect(v1.words[0]!.find((p) => p.r)?.r).toBe('ikhfa');
    // texte différent de celui qui a servi au calage : pas de couleur
    expect(verseRuns({ s: 2, a: 2, text: V2 + 'ا' }, BASM, d)).toBeNull();
    // autre sourate : pas de couleur
    expect(verseRuns({ s: 3, a: 2, text: V2 }, BASM, d)).toBeNull();
    // exemples de la légende tirés du texte, absents si la règle n'y est pas
    const ex = examples(
      [
        { s: 2, a: 1, text: V1 },
        { s: 2, a: 2, text: V2 },
      ],
      BASM,
      d,
      false,
    );
    expect(ex.get('tj-qalqala')?.aya).toBe(2);
    expect(ex.get('tj-ikhfa')?.aya).toBe(1);
    expect(ex.has('tj-madd6')).toBe(false);
  });

  it('libellés : termes arabes isolés, texte intact', () => {
    const l = 'le son nasal (الْغُنَّةُ), 2 temps';
    // composant commun <Bidi> (bidi/segments.ts) : découpe sans modifier
    const p = bidiSegments(l, 'fr');
    expect(p.map((x) => x.text).join('')).toBe(l);
    expect(p.filter((x) => x.kind !== 'plain').map((x) => x.text)).toEqual(['الْغُنَّةُ']);
    expect(bidiSegments('le rebond', 'fr').every((x) => x.kind === 'plain')).toBe(true);
  });

  it('désactivé par défaut ; réglage gardé sur l’appareil', () => {
    const m = new Map<string, string>();
    const store = {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
    };
    expect(readTajwidPrefs(store)).toEqual({ on: false, motifs: false });
    writeTajwidPrefs({ on: true, motifs: true }, store);
    expect(readTajwidPrefs(store)).toEqual({ on: true, motifs: true });
    expect(readTajwidPrefs({ getItem: () => '{oops' })).toEqual({ on: false, motifs: false });
    expect(readTajwidPrefs(null)).toEqual({ on: false, motifs: false });
  });

  it('fichiers livrés : 114 sourates, poids mesuré et raisonnable', () => {
    const dir = new URL('../../../static/tajwid/', import.meta.url);
    const files = readdirSync(dir).filter((f) => /^\d{3}\.json$/.test(f));
    expect(files).toHaveLength(114);
    let total = 0;
    let max = 0;
    for (const f of files) {
      const raw = readFileSync(new URL(f, dir));
      const d = JSON.parse(raw.toString('utf8')) as TajwidSura;
      expect(d.v).toBe(1);
      expect(d.s).toBe(Number(f.slice(0, 3)));
      expect(d.src).toContain('CC BY 4.0');
      total += raw.length;
      max = Math.max(max, raw.length);
    }
    // non compressé : ≈ 0,55 Mo pour tout le Coran ; la plus grosse sourate (al-Baqara) < 80 Ko
    expect(total).toBeLessThan(700 * 1024);
    expect(max).toBeLessThan(80 * 1024);
  });
});
