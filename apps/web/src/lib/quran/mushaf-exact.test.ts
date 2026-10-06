/**
 * A34 — Muṣḥaf « à l'identique » : logique pure (mots Tanzil, lignes d'une page, contrôle de cohérence) et outil
 * de synchronisation `infra/outils/qf-lignes` (sans réseau : appels simulés).
 *
 * Les pages utilisées ici sont des données SYNTHÉTIQUES DE TEST (glyphes fictifs, coupures de ligne arbitraires) :
 * elles ne reproduisent pas la mise en page du muṣḥaf et ne sont jamais livrées. Seul le texte Tanzil est réel
 * (copie verbatim de l'intégration continue). La vraie mise en page vient de la synchronisation (rapport A34).
 */
import { mkdtempSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  EMPTY_EXACT_FILE,
  EXACT_LINES,
  bsmlSuraName,
  checkExactFile,
  displayLines,
  pageFontFile,
  pageVerseKeys,
  tanzilWords,
  verseGlyphs,
  type ExactFile,
  type ExactPage,
  type ExactWord,
} from './mushaf-exact';
import { exactAvailable } from './mushaf-exact-load';
import {
  applyMutation,
  apiUrl,
  buildExactFile,
  applyCorrections,
  checkMushafRecord,
  diagnostic,
  readCorrections,
  mushafRecord,
  publish,
  readPageStarts,
  readTanzil,
  rowKind,
  syncOnce,
  type Row,
} from '../../../../../infra/outils/qf-lignes/qf-lignes.mjs';
import { cmapOfFile } from '../../../../../infra/outils/qf-lignes/ttf-cmap.mjs';

const REPO = fileURLToPath(new URL('../../../../../', import.meta.url));
const tanzil = readTanzil(join(REPO, 'infra/ci/contenu/coran/tanzil-uthmani.tsv'));
const text = (s: number, a: number) => tanzil.map.get(`${s}:${a}`);
const T = (s: number, a: number) => text(s, a)!;
const words = (s: number, a: number) => tanzilWords(s, a, T(s, a), tanzil.basmala);

/** glyphes (mots + signe de fin) d'un verset, codes FICTIFS consécutifs à partir de U+FB51 */
function synthVerse(s: number, a: number, next: () => string): ExactWord[] {
  const n = words(s, a).length;
  const out: ExactWord[] = [];
  for (let i = 1; i <= n; i++) out.push([s, a, i, next(), 'word']);
  out.push([s, a, 0, next(), 'end']);
  return out;
}
function chunk<X>(xs: X[], k: number): X[][] {
  const out: X[][] = [];
  for (let i = 0; i < k; i++)
    out.push(xs.slice(Math.round((i * xs.length) / k), Math.round(((i + 1) * xs.length) / k)));
  return out;
}
/** page SYNTHÉTIQUE p : sourates 112 (lignes 3-6) et 113 (lignes 9-15), en-têtes et basmala aux lignes 1-2 et 7-8 */
function synthPage(p = 604): { page: ExactPage; codes: Set<number> } {
  let cp = 0xfb51;
  const codes = new Set<number>();
  const next = () => {
    codes.add(cp);
    return String.fromCodePoint(cp++);
  };
  const lines: ExactPage['lines'] = [];
  for (let a = 1; a <= 4; a++) lines.push({ n: 2 + a, w: synthVerse(112, a, next) });
  const w113 = Array.from({ length: 5 }, (_, i) => synthVerse(113, i + 1, next)).flat();
  chunk(w113, 7).forEach((w, i) => lines.push({ n: 9 + i, w }));
  return { page: { p, lines }, codes };
}
const fileOf = (...pages: ExactPage[]): ExactFile => ({ ...EMPTY_EXACT_FILE, pages });
const check = (f: ExactFile, codes?: Set<number>) =>
  checkExactFile({
    file: f,
    lengths: tanzil.lengths,
    text,
    basmala: tanzil.basmala,
    fontHas: codes ? (_p, cp) => codes.has(cp) : undefined,
    partial: true,
  });

describe('A34 — mots du texte Tanzil (référence)', () => {
  it('6 236 versets, 114 sourates, basmala = 1:1', () => {
    expect(tanzil.lengths.length).toBe(114);
    expect(tanzil.lengths.reduce((a, b) => a + b, 0)).toBe(6236);
    expect(tanzil.lengths[1]).toBe(286);
  });
  it('basmala retirée en tête du verset 1 (sourates 2 à 114 sauf 9), gardée en 1:1', () => {
    expect(words(1, 1)).toHaveLength(4);
    expect(words(2, 1)).toEqual([T(2, 1).split(' ').at(-1)]);
    expect(words(9, 1)).toEqual(T(9, 1).split(' '));
    expect(words(36, 1)).toHaveLength(1);
  });
  it('signes isolés (pause, ۩, ۞) : dessinés, mais ce ne sont pas des mots', () => {
    expect(T(2, 2).split(' ')).toContain('ۛ');
    expect(words(2, 2)).not.toContain('ۛ');
    expect(words(2, 2)).toHaveLength(T(2, 2).split(' ').length - 2);
    expect(words(32, 15).at(-1)).not.toBe('۩');
  });
  it('mots = sous-chaînes exactes du texte (aucune transformation), sur tout le Coran', () => {
    let total = 0;
    for (let s = 1; s <= 114; s++)
      for (let a = 1; a <= tanzil.lengths[s - 1]!; a++) {
        const w = words(s, a);
        expect(w.length).toBeGreaterThan(0);
        for (const x of w) expect(T(s, a).includes(x)).toBe(true);
        total += w.length;
      }
    expect(total).toBeGreaterThan(77000);
  });
});

describe('A34 — lignes d’une page (15 lignes, en-têtes, basmala)', () => {
  it('page synthétique : 15 lignes, en-tête + basmala avant le premier mot de chaque sourate', () => {
    const { page } = synthPage();
    const d = displayLines(page);
    expect(d).toHaveLength(EXACT_LINES);
    expect(d.map((l) => l.kind)).toEqual([
      'sourate',
      'basmala',
      ...Array(4).fill('texte'),
      'sourate',
      'basmala',
      ...Array(7).fill('texte'),
    ]);
    expect(d[0]).toMatchObject({ kind: 'sourate', s: 112 });
    expect(d[7]).toMatchObject({ kind: 'basmala', s: 113 });
  });
  it('pages 1 et 2 : seulement les lignes occupées (pas de lignes vides au-dessus)', () => {
    const page: ExactPage = {
      p: 1,
      lines: [9, 10].map((n) => ({ n, w: [[1, n - 8, 1, 'x', 'word']] as ExactWord[] })),
    };
    const d = displayLines({
      ...page,
      lines: [{ n: 9, w: [[1, 1, 1, 'x', 'word']] }, page.lines[1]!],
    });
    expect(d.map((l) => `${l.n}:${l.kind}`)).toEqual(['8:sourate', '9:texte', '10:texte']);
  });
  it('sourate 9 : en-tête seul (pas de basmala)', () => {
    const page: ExactPage = { p: 187, lines: [{ n: 3, w: [[9, 1, 1, 'x', 'word']] }] };
    const d = displayLines(page);
    expect(d[1]).toMatchObject({ n: 2, kind: 'sourate', s: 9 });
    expect(d[0]).toMatchObject({ n: 1, kind: 'vide' });
  });
  it('surlignage : positions des glyphes du verset en cours ; versets de la page dans l’ordre', () => {
    const { page } = synthPage();
    const g = verseGlyphs(page, 112, 2);
    expect(g.every((x) => x.n === 4)).toBe(true);
    expect(g).toHaveLength(words(112, 2).length + 1);
    expect(pageVerseKeys(page)).toHaveLength(9);
    expect(pageVerseKeys(page)[4]).toEqual([113, 1]);
  });
  it('police de page : nom du fichier du Complexe (servi tel quel)', () => {
    expect(pageFontFile(1)).toBe('QCF_P001.ttf');
    expect(pageFontFile(604)).toBe('QCF_P604.ttf');
  });
  it('QCF_BSML : noms des sourates 1→U+FB8D, 37→U+FBB1, 38→U+FBD3, 114→U+FC1F (relevé de la police)', () => {
    const cp = (s: number) => bsmlSuraName(s).codePointAt(0);
    expect([cp(1), cp(37), cp(38), cp(114)]).toEqual([0xfb8d, 0xfbb1, 0xfbd3, 0xfc1f]);
    expect(new Set(Array.from({ length: 114 }, (_, i) => bsmlSuraName(i + 1))).size).toBe(114);
    expect(bsmlSuraName(0)).toBe('');
  });
});

describe('A34 — pages disponibles (publication complète ou partielle)', () => {
  it('complète : toutes ; partielle : la liste seulement ; indisponible : aucune', () => {
    expect(exactAvailable({ disponible: true }, 300)).toBe(true);
    expect(exactAvailable({ disponible: true, partiel: true, pages: [1, 2, 3] }, 3)).toBe(true);
    expect(exactAvailable({ disponible: true, partiel: true, pages: [1, 2, 3] }, 50)).toBe(false);
    expect(exactAvailable({ disponible: false }, 3)).toBe(false);
    expect(exactAvailable(null, 3)).toBe(false);
  });
});

describe('A34 — contrôle de cohérence (bloquant)', () => {
  it('page synthétique conforme : aucun écart (mots ↔ Tanzil 1:1, glyphes présents)', () => {
    const { page, codes } = synthPage();
    expect(check(fileOf(page), codes)).toEqual([]);
  });
  it('fichier VIDE (forme identique) : refusé pour la publication — 604 pages et 6 236 versets exigés', () => {
    const e = checkExactFile({
      file: EMPTY_EXACT_FILE,
      lengths: tanzil.lengths,
      text,
      basmala: tanzil.basmala,
    });
    expect(e[0]).toBe('pages : 0 ≠ 604');
    expect(e).toContain('1:1 : verset manquant');
  });
  it('mot manquant, en double, dans le désordre, sans signe de fin : refusé', () => {
    const drop = synthPage().page;
    drop.lines[0]!.w.splice(1, 1);
    expect(check(fileOf(drop)).join('\n')).toMatch(/112:1 : \d+ mot\(s\) dans les données/);
    const dup = synthPage().page;
    dup.lines[1]!.w.splice(1, 0, dup.lines[1]!.w[0]!);
    expect(check(fileOf(dup)).join('\n')).toMatch(/112:2 : /);
    const swap = synthPage().page;
    const l = swap.lines[2]!.w;
    [l[0], l[1]] = [l[1]!, l[0]!];
    expect(check(fileOf(swap))).toContain('112:3 : mots en double ou dans le désordre');
    const noEnd = synthPage().page;
    noEnd.lines[3]!.w.pop();
    expect(check(fileOf(noEnd))).toContain('112:4 : 0 signe(s) de fin de verset (attendu : 1)');
  });
  it('glyphe absent de la police de la page : refusé', () => {
    const { page, codes } = synthPage();
    codes.delete(0xfb52);
    expect(check(fileOf(page), codes).join('\n')).toMatch(/U\+FB52 .* absent de QCF_P604\.ttf/);
  });
  it('ligne hors de 1 à 15, ligne vide, ligne sans contenu sur une page complète : refusé', () => {
    const a = synthPage().page;
    a.lines[a.lines.length - 1]!.n = 16;
    const ea = check(fileOf(a)).join('\n');
    expect(ea).toMatch(/ligne 16 hors de 1 à 15/);
    expect(ea).toMatch(/lignes sans contenu 15/);
    const b = synthPage().page;
    b.lines.push({ n: 15, w: [] });
    expect(check(fileOf(b)).join('\n')).toMatch(/numéro de ligne en double/);
  });
  it('ordre de lecture et débuts de page Tanzil contrôlés', () => {
    const { page } = synthPage();
    page.lines.reverse();
    expect(check(fileOf(page)).join('\n')).toMatch(/ordre de lecture|désordre/);
    const pageStarts = readPageStarts(join(REPO, 'infra/ci/contenu/coran/tanzil-quran-data.js'));
    const at = (p: number) =>
      checkExactFile({
        file: fileOf(synthPage(p).page),
        lengths: tanzil.lengths,
        text,
        basmala: tanzil.basmala,
        pageStarts,
        partial: true,
      }).join('\n');
    // la page 604 de Tanzil commence bien à 112:1 ; placée en page 603, la même page est refusée
    expect(at(604)).not.toMatch(/commence à/);
    expect(at(603)).toMatch(/page 603 : commence à 112:1, Tanzil \d+:\d+/);
  });
});

describe('A34 — outil de synchronisation (sans réseau)', () => {
  it('débuts de page Tanzil : 604 pages, page 1 = 1:1, page 2 = 2:1', () => {
    const st = readPageStarts(join(REPO, 'infra/ci/contenu/coran/tanzil-quran-data.js'));
    expect(st).toHaveLength(604);
    expect(st[0]).toEqual([1, 1]);
    expect(st[1]).toEqual([2, 1]);
  });
  it('cmap TrueType lue sans dépendance (police du Complexe déjà livrée)', () => {
    const dir = join(REPO, 'apps/web/static/riwayat');
    const sub = readdirSync(dir).find((d) =>
      readdirSync(join(dir, d)).some((f) => f.endsWith('.ttf')),
    )!;
    const ttf = readdirSync(join(dir, sub)).find((f) => f.endsWith('.ttf'))!;
    const set = cmapOfFile(join(dir, sub, ttf));
    expect(set.has(0x0628)).toBe(true); // ب
    expect(set.has(0x10ffff)).toBe(false);
  });
  it('adresses de l’API (relatives, « /api/v4 », absolues)', () => {
    expect(apiUrl('prelive', '/resources/sync?bootstrap=true')).toBe(
      'https://apis-prelive.quran.foundation/content/api/v4/resources/sync?bootstrap=true',
    );
    expect(apiUrl('production', '/api/v4/resources/snapshots/mushafs/2')).toBe(
      'https://apis.quran.foundation/content/api/v4/resources/snapshots/mushafs/2',
    );
  });
  it('fiche du muṣḥaf : seule l’édition QCF V1 de 604 × 15 est acceptée', () => {
    expect(checkMushafRecord(null)).toMatch(/absente/);
    expect(checkMushafRecord({ name: 'QCF V2', pages_count: 604, lines_per_page: 15 })).toMatch(
      /pas l'édition QCF V1/,
    );
    expect(checkMushafRecord({ name: 'QCF V1', pages_count: 604, lines_per_page: 15 })).toBeNull();
    expect(checkMushafRecord({ name: 'QCF V1', pages_count: 610, lines_per_page: 16 })).toMatch(
      /attendu 604 × 15/,
    );
  });

  // lignes au format documenté de la ressource « mushafs » (mot positionné), valeurs SYNTHÉTIQUES
  const vid = (s: number, a: number) =>
    tanzil.lengths.slice(0, s - 1).reduce((x, y) => x + y, 0) + a;
  function synthRows(): Row[] {
    const { page } = synthPage();
    const rows: Row[] = [{ id: 2, name: 'QCF V1', pages_count: 604, lines_per_page: 15 }];
    let id = 1;
    for (const l of page.lines)
      l.w.forEach((w, i) =>
        rows.push({
          id: id++,
          verse_id: vid(w[0], w[1]),
          position_in_verse: w[2] === 0 ? words(w[0], w[1]).length + 1 : w[2],
          page_number: 604,
          line_number: l.n,
          position_in_line: i + 1,
          char_type_name: w[4],
          text: w[3],
        }),
      );
    return rows;
  }

  it('mutations : instantané, mise à jour, suppression de ligne, retrait de la ressource', async () => {
    const rows = new Map<string, Row>();
    const snap = { records: synthRows().map((data) => ({ record_type: rowKind(data), data })) };
    expect(
      await applyMutation(rows, { type: 'RESOURCE_CREATE', snapshot_url: '/x' }, async () => snap),
    ).toBe('instantane');
    expect(rows.size).toBe(snap.records.length);
    await applyMutation(
      rows,
      {
        type: 'ROW_UPDATE',
        record_type: 'mushaf_word',
        record_key: '1',
        data: { ...synthRows()[1], id: 1, text: 'Z' },
      },
      async () => snap,
    );
    expect(rows.get('word:1')?.text).toBe('Z');
    await applyMutation(
      rows,
      { type: 'ROW_DELETE', record_type: 'mushaf_word', record_key: '1' },
      async () => snap,
    );
    expect(rows.has('word:1')).toBe(false);
    expect(await applyMutation(rows, { type: 'RESOURCE_DELETE' }, async () => snap)).toBe(
      'ressource_retiree',
    );
    expect(rows.size).toBe(0);
    await expect(applyMutation(rows, { type: 'NOUVEAU' }, async () => snap)).rejects.toThrow(
      /inconnue/,
    );
  });

  it('copie → fichier de lignes : mêmes pages, lignes et mots ; contrôle sans écart', () => {
    const rows = new Map(synthRows().map((r) => [`${rowKind(r)}:${String(r.id)}`, r] as const));
    const { file, unknown } = buildExactFile(rows, tanzil.lengths, null);
    expect(unknown).toEqual([]);
    expect(file.pages.map((p) => p.p)).toEqual([604]);
    expect(file.pages[0]).toEqual(synthPage().page);
    expect(check(file, synthPage().codes)).toEqual([]);
  });

  it('ordre de lecture = position_in_page (position_in_line non fiable, relevé sur la copie prélancement)', () => {
    let k = 0;
    const rows = new Map(
      synthRows().map((r) => {
        const x: Row = { ...r };
        if (rowKind(r) === 'word') {
          x.position_in_page = ++k;
          // position_in_line FAUSSE (comme reçue pour certains mots) : ne doit pas changer l'ordre
          x.position_in_line = k % 3 === 0 ? 99 : Number(r.position_in_line);
        }
        return [`${rowKind(r)}:${String(r.id)}`, x] as const;
      }),
    );
    const { file } = buildExactFile(rows, tanzil.lengths, null);
    expect(file.pages[0]).toEqual(synthPage().page);
  });

  it('corrections explicites : appliquée si « avant » correspond, obsolète si déjà corrigée, sinon bloquante', () => {
    const list = readCorrections(join(REPO, 'infra/outils/qf-lignes/corrections.json'));
    const c = list.find((x) => x.id === 'qf-2-181-fin')!;
    expect(c).toMatchObject({ mushaf: 2, apres: { char_type_name: 'end' } });
    const rec = { ...c.record, record_type: 'mushaf_word', line_number: 15, ...c.avant };
    const rows = new Map<string, Row>([['word:x', rec]]);
    const a = applyCorrections(rows, list, 2);
    expect(a.applied).toEqual(['qf-2-181-fin']);
    expect(a.rows.get('word:x')?.char_type_name).toBe('end');
    expect(rows.get('word:x')?.char_type_name).toBe('word'); // la copie synchronisée n'est pas modifiée
    expect(applyCorrections(a.rows, list, 2).obsolete).toEqual(['qf-2-181-fin']);
    const changed = new Map<string, Row>([['word:x', { ...rec, text: 'Z' }]]);
    expect(applyCorrections(changed, list, 2).errors[0]).toMatch(/a changé chez QF/);
    expect(applyCorrections(new Map(), list, 2).errors[0]).toMatch(/absent/);
    expect(applyCorrections(rows, list, 1).applied).toEqual([]);
  });

  it('synchronisation simulée : jeton, amorçage, instantané, pages suivantes ; secret jamais dans l’adresse', async () => {
    process.env.QF_CLIENT_ID = 'id-test';
    process.env.QF_CLIENT_SECRET = 'secret-test';
    const calls: string[] = [];
    // forme DOCUMENTÉE : instantané à plat, lignes avec record_type ; synchronisation sous la clé « sync »
    const snap = {
      resource_group: 'mushafs',
      resource_id: 2,
      schema_version: 1,
      records: synthRows().map((r) => ({
        record_type: rowKind(r) === 'word' ? 'mushaf_word' : 'mushaf',
        ...r,
      })),
    };
    const fake = (async (url: string, init?: RequestInit) => {
      calls.push(url);
      const json = (x: unknown) => new Response(JSON.stringify(x), { status: 200 });
      if (url.includes('oauth2')) {
        expect(init?.method).toBe('POST');
        return json({ access_token: 'jeton', expires_in: 3600 });
      }
      expect((init?.headers as Record<string, string>)['x-auth-token']).toBe('jeton');
      if (url.includes('/snapshots/')) return json(snap);
      if (url.includes('bootstrap=true'))
        return json({
          sync: {
            sync_until_sequence: 7,
            has_more: true,
            next_page_url: '/api/v4/resources/sync?cursor=2',
            mutations: [
              {
                type: 'RESOURCE_CREATE',
                resource_group: 'mushafs',
                resource_id: 2,
                snapshot_url: '/api/v4/resources/snapshots/mushafs/2',
                unavailable_reason: null,
              },
            ],
          },
        });
      return json({ sync: { has_more: false, next_sync_token: 'tok-1', mutations: [] } });
    }) as typeof fetch;
    const rows = new Map<string, Row>();
    const r = await syncOnce({ env: 'prelive', mushafId: 2, state: {}, rows, fetchImpl: fake });
    expect(r.syncToken).toBe('tok-1');
    expect(r.actions).toEqual({ instantane: 1 });
    expect(rows.size).toBe(snap.records.length);
    expect(calls[1]).toMatch(/resources=mushafs:2/);
    expect(calls.join(' ')).not.toMatch(/secret-test/);
    const { file } = buildExactFile(rows, tanzil.lengths, null);
    expect(file.pages[0]).toEqual(synthPage().page);
  });

  /** faux serveur : jeton, synchronisation (410 sur un jeton périmé), instantané direct */
  function fakeQf(o: { bootstrapMutations: unknown[]; snap: unknown }) {
    const calls: string[] = [];
    const json = (x: unknown, status = 200) => new Response(JSON.stringify(x), { status });
    const f = (async (url: string) => {
      calls.push(url);
      if (url.includes('oauth2')) return json({ access_token: 'jeton-tres-secret' });
      if (url.endsWith('/mushafs'))
        return json({ mushafs: [{ id: 2, name: 'QCF V1', lines_per_page: 15, pages_count: 604 }] });
      if (url.includes('sync_token='))
        return json(
          {
            error: {
              code: 'resync_required',
              message: 'The sync token is invalid or incompatible. Bootstrap again.',
            },
          },
          410,
        );
      if (url.includes('bootstrap=true'))
        return json({
          sync: { has_more: false, next_sync_token: 'tok-2', mutations: o.bootstrapMutations },
        });
      if (url.includes('/snapshots/')) return json(o.snap);
      return json({ message: 'not found', type: 'not_found', success: false }, 404);
    }) as typeof fetch;
    return { f, calls };
  }
  const flatSnap = () => ({
    resource_group: 'mushafs',
    resource_id: 2,
    records: synthRows().map((r) => ({
      record_type: rowKind(r) === 'word' ? 'mushaf_word' : 'mushaf',
      ...r,
    })),
  });

  it('jeton refusé (410 resync_required) : copie vidée puis nouvel amorçage', async () => {
    const { f, calls } = fakeQf({
      bootstrapMutations: [
        {
          type: 'RESOURCE_CREATE',
          resource_group: 'mushafs',
          resource_id: 2,
          snapshot_url: '/api/v4/resources/snapshots/mushafs/2',
        },
      ],
      snap: flatSnap(),
    });
    const rows = new Map<string, Row>([['word:999', { id: 999, line_number: 1, verse_id: 1 }]]);
    const r = await syncOnce({
      env: 'prelive',
      mushafId: 2,
      state: { syncToken: 'vieux' },
      rows,
      fetchImpl: f,
    });
    expect(r.actions).toMatchObject({ reamorcage: 1, instantane: 1 });
    expect(r.syncToken).toBe('tok-2');
    expect(rows.has('word:999')).toBe(false);
    expect(calls.some((c) => c.includes('bootstrap=true'))).toBe(true);
  });

  it('amorçage sans instantané du muṣḥaf : lecture de l’instantané documenté', async () => {
    const { f, calls } = fakeQf({ bootstrapMutations: [], snap: flatSnap() });
    const rows = new Map<string, Row>();
    const r = await syncOnce({ env: 'prelive', mushafId: 2, state: {}, rows, fetchImpl: f });
    expect(r.actions).toEqual({ instantane_direct: 1 });
    expect(calls.at(-1)).toMatch(/\/content\/api\/v4\/resources\/snapshots\/mushafs\/2$/);
    expect(checkMushafRecord(mushafRecord(rows))).toBeNull();
  });

  it('diagnostic : codes HTTP, clés et noms de ressources — jamais le secret, le jeton ni le texte', async () => {
    const { f } = fakeQf({
      bootstrapMutations: [
        {
          type: 'RESOURCE_CREATE',
          resource_group: 'mushafs',
          resource_id: 2,
          snapshot_url: '/api/v4/resources/snapshots/mushafs/2',
          unavailable_reason: null,
        },
      ],
      snap: flatSnap(),
    });
    const lines: string[] = [];
    await diagnostic({ env: 'prelive', mushafId: 2, fetchImpl: f, out: (s) => lines.push(s) });
    const all = lines.join('\n');
    expect(all).toMatch(/jeton : OK/);
    expect(all).toMatch(/amorçage : HTTP 200/);
    expect(all).toMatch(/clés de « sync » : has_more, next_sync_token, mutations/);
    expect(all).toMatch(/RESOURCE_CREATE mushafs:2/);
    expect(all).toMatch(/mushaf_word : \d+ ; champs : record_type, id, verse_id/);
    expect(all).toMatch(/verdict fiche : OK/);
    expect(all).not.toMatch(/secret-test|jeton-tres-secret|id-test/);
    expect(all).not.toMatch(/[ﭐ-﷿]/);
  });

  it('publication d’un bloc : lignes-v1.json, pages/NNN.json, manifeste (empreinte, source, crédit)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'a34-'));
    const { page } = synthPage();
    const m = publish(dir, fileOf(page));
    expect(m.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(existsSync(join(dir, 'publie', 'pages', '604.json'))).toBe(true);
    const man = JSON.parse(readFileSync(join(dir, 'publie', 'manifeste.json'), 'utf8'));
    expect(man.credit).toMatch(/Quran Foundation/);
    expect(readFileSync(join(dir, 'publie', 'lignes-v1.sha256'), 'utf8')).toContain(m.sha256);
  });
});
