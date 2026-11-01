/**
 * Cahiers d'écriture du niveau 1 (1/11/2026) — « toute personne qui suit nos cahiers doit savoir écrire ».
 *
 * Contrôles sur la copie des livres (`~/awform-content`, ou `AWFORM_CONTENT_DIR`) ; ignorés sans elle :
 *  - dans le bloc `ecriture` et les exercices du cahier (en1, en2, ado1, ad1), la shadda précède toujours la voyelle
 *    ou le tanwin (convention des livres, jamais de NFC) ;
 *  - méthode du couple : si un livre porte des lignes `ecriture.voyelles`, chaque leçon de lettres en a, et chaque
 *    syllabe n'emploie qu'une lettre déjà vue (leçon en cours ou précédentes) et une seule voyelle brève ;
 *  - exercices `complete` du cahier : la réponse figure dans les options, sans doublon d'options.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseDataFile } from '../src/index.js';
import { CONTENT_DIR, HAS_CONTENT } from './helpers.js';

type Obj = Record<string, unknown>;
const LIVRES = ['en1', 'en2', 'ado1', 'ad1'];
const lecons = (b: string): Obj[] => {
  const dir = join(CONTENT_DIR, 'data', b);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^l\d+\.js$/.test(f))
    .sort()
    .map((f) => parseDataFile(readFileSync(join(dir, f), 'utf8'), f).value as Obj);
};
const textes = (v: unknown): string[] =>
  typeof v === 'string'
    ? [v]
    : Array.isArray(v)
      ? v.flatMap(textes)
      : v && typeof v === 'object'
        ? Object.values(v).flatMap(textes)
        : [];
const cahier = (L: Obj) => {
  const ex = ((L.exercices as Obj[] | undefined) ?? []).filter((e) => e.livre === 'ecriture');
  return { E: (L.ecriture ?? {}) as Obj, ex };
};
const VOYELLE_PUIS_SHADDA = /[\u064B-\u0650]\u0651/;
/** ni alif, ni hamza, ni formes finales seules : pas de ligne de voyelles attendue */
const EXCLU = ['ا', 'ء', 'أ', 'إ', 'آ', 'ؤ', 'ئ', 'ة', 'ى'];

describe.skipIf(!HAS_CONTENT)('cahiers d’écriture du niveau 1', () => {
  it('la shadda précède toujours la voyelle (bloc ecriture et exercices du cahier)', () => {
    const fautes: string[] = [];
    for (const b of LIVRES)
      for (const L of lecons(b)) {
        const { E, ex } = cahier(L);
        for (const s of [...textes(E), ...textes(ex)])
          if (VOYELLE_PUIS_SHADDA.test(s)) fautes.push(`${b} l${String(L.n)} : ${s}`);
      }
    expect(fautes).toEqual([]);
  });

  it('méthode du couple : les lignes « voyelles » suivent les lettres vues', () => {
    const fautes: string[] = [];
    for (const b of ['en1', 'ado1', 'ad1']) {
      const Ls = lecons(b);
      if (!Ls.some((L) => Array.isArray(cahier(L).E.voyelles))) continue; // contenu pas encore enrichi
      const vues = new Set<string>(['أ', 'إ']);
      for (const L of Ls) {
        const lettres = ((L.lettres as Array<{ l?: string }> | undefined) ?? [])
          .map((x) => x.l ?? '')
          .filter((l) => l.length === 1);
        // lettres nouvelles à vocaliser (ni alif, ni hamza, ni formes finales seules)
        const nouv = lettres.filter((l) => !vues.has(l) && !EXCLU.includes(l));
        lettres.forEach((l) => vues.add(l));
        const V = cahier(L).E.voyelles;
        const nouvelles = L.type === 'lecon' && nouv.length > 0 && lettres.length < 28;
        if (nouvelles && !Array.isArray(V))
          fautes.push(`${b} l${String(L.n)} : pas de ligne voyelles`);
        for (const ligne of Array.isArray(V) ? (V as string[]) : [])
          for (const syl of ligne.split(' ')) {
            const m = /^(.)([\u064E\u064F\u0650])$/.exec(syl);
            if (!m || !vues.has(m[1]!)) fautes.push(`${b} l${String(L.n)} : syllabe « ${syl} »`);
          }
      }
    }
    expect(fautes).toEqual([]);
  });

  it('exercices « complete » du cahier : la réponse est dans les options, sans doublon', () => {
    const fautes: string[] = [];
    for (const b of LIVRES)
      for (const L of lecons(b))
        for (const e of cahier(L).ex.filter((x) => x.type === 'complete'))
          for (const it of (e.items as Obj[] | undefined) ?? []) {
            const o = (it.options as string[] | undefined) ?? [];
            if (!o.includes(String(it.reponse)) || new Set(o).size !== o.length)
              fautes.push(`${String(e.id)} : ${String(it.reponse)}`);
          }
    expect(fautes).toEqual([]);
  });
});
