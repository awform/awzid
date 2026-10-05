import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildRiwayat,
  loadRiwaya,
  readRiwayaSource,
  RIWAYAT_STATIC_DIR,
} from '../src/cli-riwayat.js';
import {
  checkRiwaya,
  HAFS_COUNTS,
  readRiwayaRows,
  riwayaIndex,
  RIWAYA_TEXTS,
} from '../src/riwayat.js';

/**
 * Chantier A8 — textes officiels des riwāyāt (Complexe du Roi Fahd). Test BLOQUANT, comme pour Tanzil :
 * empreintes des fichiers du Complexe et des polices, comptes officiels par sourate, fichiers livrés = texte
 * du Complexe recopié sans aucun changement (ni NFC, ni retouche).
 */
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

describe('riwāyāt du Complexe', () => {
  it('comptes de Ḥafṣ : 114 sourates, 6 236 versets', () => {
    expect(HAFS_COUNTS).toHaveLength(114);
    expect(HAFS_COUNTS.reduce((a, b) => a + b, 0)).toBe(6236);
  });

  it('totaux officiels : Warsh et Qālūn 6 214, Shuʿba 6 236, as-Sūsī 6 218, ad-Dūrī 6 217, al-Bazzī 6 220', () => {
    const tot = Object.fromEntries(RIWAYA_TEXTS.map((d) => [d.key, d.total]));
    expect(tot).toEqual({
      warsh: 6214,
      qalun: 6214,
      shuba: 6236,
      susi: 6218,
      duri: 6217,
      bazzi: 6220,
    });
    for (const d of RIWAYA_TEXTS)
      expect(
        d.counts.reduce((a, b) => a + b, 0),
        d.key,
      ).toBe(d.total);
  });

  for (const def of RIWAYA_TEXTS) {
    it(`${def.key} : empreinte de la source, contrôles sans écart, 604 pages`, () => {
      const verses = loadRiwaya(def);
      expect(verses).toHaveLength(def.total);
      expect(checkRiwaya(def, verses)).toEqual([]);
      const idx = riwayaIndex(def, verses);
      expect(idx.pages).toHaveLength(604);
      expect(idx.pages[0]).toEqual([1, 1]);
      expect(idx.pageJuz[603]).toBe(30);
    });
  }

  it('fichiers livrés = source recopiée à l’identique ; polices livrées sans modification', () => {
    const want = buildRiwayat();
    expect(want.size).toBe(RIWAYA_TEXTS.length * 115);
    for (const [rel, body] of want)
      expect(readFileSync(join(RIWAYAT_STATIC_DIR, rel), 'utf8'), rel).toBe(body);
    for (const def of RIWAYA_TEXTS)
      expect(sha(readFileSync(join(RIWAYAT_STATIC_DIR, def.key, def.font))), def.font).toBe(
        def.fontSha256,
      );
  });

  it('lecture inverse : chaque verset livré = la chaîne du JSON du Complexe (aucune normalisation)', () => {
    for (const def of RIWAYA_TEXTS) {
      const rows = JSON.parse(readRiwayaSource(def).toString('utf8')) as Array<
        Record<string, unknown>
      >;
      const src = new Map(rows.map((r) => [`${Number(r.sura_no)}:${Number(r.aya_no)}`, r]));
      for (const s of [1, 2, 67, 114]) {
        const file = JSON.parse(
          readFileSync(
            join(RIWAYAT_STATIC_DIR, def.key, `${String(s).padStart(3, '0')}.json`),
            'utf8',
          ),
        ) as { s: number; name: string; t: [number, number, number, string][] };
        expect(file.t).toHaveLength(def.counts[s - 1]!);
        for (const [a, , , text] of file.t) {
          const r = src.get(`${s}:${a}`);
          expect(text, `${def.key} ${s}:${a}`).toBe(r?.[def.textField]);
          expect(
            Buffer.from(text, 'utf8').equals(Buffer.from(String(r?.[def.textField]), 'utf8')),
          ).toBe(true);
        }
        expect(file.name).toBe(src.get(`${s}:1`)?.sura_name_ar);
      }
    }
  });

  it('contrôles : verset manquant, compte faux, ordre et pages détectés', () => {
    const def = RIWAYA_TEXTS[0]!;
    const verses = loadRiwaya(def);
    const missing = verses.filter((v) => !(v.s === 2 && v.a === 10));
    const errs = checkRiwaya(def, missing);
    expect(errs.some((e) => e.includes('sourate 2 : 284'))).toBe(true);
    expect(errs.some((e) => e.startsWith('ordre'))).toBe(true);
    expect(errs.some((e) => e.startsWith('total'))).toBe(true);
    const badPage = verses.map((v, i) => (i === 100 ? { ...v, page: 1 } : v));
    expect(checkRiwaya(def, badPage).some((e) => e.startsWith('page décroissante'))).toBe(true);
    // compte de Ḥafṣ appliqué à Warsh : refusé
    expect(
      checkRiwaya({ ...def, counts: HAFS_COUNTS, total: 6236 }, verses).length,
    ).toBeGreaterThan(0);
  });

  it('page « 34-35 » (verset à cheval, ad-Dūrī) : première page retenue, texte intact', () => {
    const def = RIWAYA_TEXTS.find((d) => d.key === 'duri')!;
    const [v] = readRiwayaRows(def, [
      { sura_no: 2, aya_no: 218, page: '34-35', jozz: 2, aya_text: 'x y', sura_name_ar: 'n ' },
    ]);
    expect(v).toMatchObject({ page: 34, juz: 2, text: 'x y', suraAr: 'n ' });
  });
});
