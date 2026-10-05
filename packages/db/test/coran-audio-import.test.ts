/**
 * Lot 27 — outil d'import de l'audio du Coran. FICHIERS D'ESSAI NON CORANIQUES seulement : bips WAV générés,
 * MP3 synthétiques (trames sans son) et, si ffmpeg est installé, bips MP3 encodés par ffmpeg. Muṣḥaf d'essai
 * réduit : sourates 1, 112, 113 et 114 (22 versets, numérotation de Ḥafṣ).
 */
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { connect, resetTestDatabase, runMigrations, type DbHandle } from '../src/client.js';
import { contentDir } from '../src/env.js';
import * as t from '../src/schema.js';
import {
  activateReciter,
  beepWav,
  COMPLEXE_CATALOGUE,
  compilePattern,
  compilePatterns,
  findFfmpeg,
  HAFS_SURA_VERSES,
  HAFS_TOTAL_VERSES,
  importReciterAudio,
  isAnnexName,
  parseSuraList,
  probeMp3,
  probeWav,
  retireReciter,
  riwayaSuraVerses,
  scanAudioDir,
  syntheticMp3,
  upsertReciter,
  wavSilence,
  writeTestMushaf,
} from '../src/audio/index.js';

const URL = process.env.TEST_DATABASE_URL;
const SURAS = [1, 112, 113, 114];
const FFMPEG = findFfmpeg();
const tmp = () => mkdtempSync(join(tmpdir(), 'awzid-audio-'));
const dirs: string[] = [];
const mk = () => {
  const d = tmp();
  dirs.push(d);
  return d;
};
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});
const codes = (r: { issues: Array<{ code: string; level: string }> }, level = 'bloquant') =>
  [...new Set(r.issues.filter((i) => i.level === level).map((i) => i.code))].sort();

describe('repères et lecture technique (sans base)', () => {
  it('Ḥafṣ : 114 sourates, 6 236 versets ; identique au fichier Tanzil des livres s’il est là', () => {
    expect(HAFS_SURA_VERSES).toHaveLength(114);
    expect(HAFS_SURA_VERSES.reduce((a, b) => a + b, 0)).toBe(HAFS_TOTAL_VERSES);
    const tsv = join(contentDir(), 'coran', 'tanzil-uthmani.tsv');
    if (existsSync(tsv)) {
      const n = new Array<number>(114).fill(0);
      for (const line of readFileSync(tsv, 'utf8').split('\n')) {
        const m = /^(\d+):(\d+)\t/.exec(line);
        if (m) n[Number(m[1]) - 1] = Math.max(n[Number(m[1]) - 1]!, Number(m[2]));
      }
      expect(n).toEqual([...HAFS_SURA_VERSES]);
    }
    expect(parseSuraList('1, 112-114')).toEqual(SURAS);
    expect(() => parseSuraList('0-3')).toThrow();
  });

  it('nommage configurable : SSSVVV, sans zéros, sourate après verset', () => {
    expect(compilePattern('SSSVVV.mp3')('002255.mp3')).toEqual({ sura: 2, aya: 255 });
    expect(compilePattern('SSSVVV.mp3')('002255.MP3')).toEqual({ sura: 2, aya: 255 });
    expect(compilePattern('SSSVVV.mp3')('2255.mp3')).toBeNull();
    expect(compilePattern('S_V.wav')('2_255.wav')).toEqual({ sura: 2, aya: 255 });
    expect(compilePattern('aya-VVV-sura-SSS.mp3')('aya-007-sura-001.mp3')).toEqual({
      sura: 1,
      aya: 7,
    });
    expect(() => compilePattern('VVV.mp3')).toThrow();
  });

  it('MP3 : durée par les trames (étiquette ID3, trame Info exclue, octets parasites relevés)', () => {
    const p = probeMp3(syntheticMp3(100, { info: true }))!;
    expect(p.format).toBe('mp3');
    expect(p.frames).toBe(100);
    expect(p.durationMs).toBe(Math.round((100 * 1152 * 1000) / 44100));
    const junk = Buffer.concat([
      syntheticMp3(10, { id3: false }),
      Buffer.from('xx'),
      syntheticMp3(10, { id3: false }),
    ]);
    const q = probeMp3(junk)!;
    expect(q.frames).toBe(20);
    expect(q.junkBytes).toBe(2);
    expect(probeMp3(Buffer.from('ceci n’est pas un fichier audio'))).toBeNull();
  });

  it('WAV : durée et silences calculés sans dépendance', () => {
    const b = beepWav({ freq: 440, ms: 1000, silenceMs: 500 });
    expect(probeWav(b)!.durationMs).toBe(1500);
    const s = wavSilence(b)!;
    expect(s.longestMs).toBeGreaterThanOrEqual(450);
    expect(s.longestMs).toBeLessThanOrEqual(550);
    const z = wavSilence(beepWav({ freq: 0, ms: 1000 }))!;
    expect(z.totalMs).toBe(1000);
  });
});

describe('contrôles avant activation (dossier local)', () => {
  it('muṣḥaf d’essai complet sur son périmètre : aucun contrôle bloquant', async () => {
    const d = mk();
    expect(writeTestMushaf(d, SURAS)).toHaveLength(22);
    const r = await scanAudioDir({ dir: d, pattern: 'SSSVVV.wav', riwaya: 'hafs', suras: SURAS });
    expect(r.blocking).toBe(0);
    expect(r.found).toBe(22);
    expect(r.expected).toBe(22);
    expect(r.silenceBy).toBe('interne');
    expect(r.tracks.every((x) => /^[0-9a-f]{64}$/.test(x.sha256) && x.durationMs > 300)).toBe(true);
  });

  it('Ḥafṣ complet : 6 236 versets imposés (un dossier partiel est bloqué)', async () => {
    const d = mk();
    writeTestMushaf(d, SURAS);
    const r = await scanAudioDir({ dir: d, pattern: 'SSSVVV.wav', riwaya: 'hafs', silence: false });
    expect(r.expected).toBe(6236);
    expect(codes(r)).toEqual(['compte_incorrect', 'manquant']);
    expect(r.counts.manquant).toBe(6236 - 22);
  });

  it('manquant, doublon de nom, hors muṣḥaf, illisible, durée nulle, silence total, contenu identique, empreinte', async () => {
    const d = mk();
    writeTestMushaf(d, SURAS);
    rmSync(join(d, '113003.wav')); // manquant
    copyFileSync(join(d, '001001.wav'), join(d, '001001.WAV')); // doublon de nom (casse)
    writeFileSync(join(d, '001008.wav'), beepWav({ freq: 300, ms: 400 })); // Al-Fātiḥa n'a que 7 versets
    writeFileSync(join(d, '112002.wav'), Buffer.from('pas un son')); // illisible
    writeFileSync(join(d, '112003.wav'), beepWav({ freq: 300, ms: 0 })); // durée nulle
    writeFileSync(join(d, '112004.wav'), beepWav({ freq: 0, ms: 2000 })); // silence total
    copyFileSync(join(d, '114001.wav'), join(d, '114002.wav')); // contenu identique
    writeFileSync(join(d, 'LISEZMOI.txt'), 'notes'); // hors nommage : avertissement
    const sums = new Map([['001002.wav', 'f'.repeat(64)]]);
    const r = await scanAudioDir({
      dir: d,
      pattern: 'SSSVVV.wav',
      riwaya: 'hafs',
      suras: SURAS,
      checksums: sums,
    });
    expect(codes(r)).toEqual([
      'compte_incorrect',
      'doublon_contenu',
      'doublon_nom',
      'duree_nulle',
      'empreinte_differente',
      'hors_mushaf',
      'illisible',
      'manquant',
      'silence_total',
    ]);
    expect(codes(r, 'avertissement')).toContain('nom_inattendu');
    expect(codes(r, 'avertissement')).toContain('empreinte_absente');
  });

  it('long silence intérieur : avertissement seulement', async () => {
    const d = mk();
    writeTestMushaf(d, [112]);
    writeFileSync(join(d, '112001.wav'), beepWav({ freq: 500, ms: 800, silenceMs: 5000 }));
    const r = await scanAudioDir({ dir: d, pattern: 'SSSVVV.wav', riwaya: 'hafs', suras: [112] });
    expect(r.blocking).toBe(0);
    expect(codes(r, 'avertissement')).toEqual(['silence_long']);
  });

  it('riwāya sans compte connu : numérotation propre et compte DÉCLARÉ accepté (pas 6 236)', async () => {
    const d = mk();
    // compte d'essai volontairement différent de Ḥafṣ : 6 versets en sourate 1
    writeTestMushaf(d, [1, 112], { counts: { 1: 6 } });
    const ok = await scanAudioDir({
      dir: d,
      pattern: 'SSSVVV.wav',
      riwaya: 'bazzi',
      suras: [1, 112],
      declaredVerses: 10,
    });
    expect(ok.blocking).toBe(0);
    const none = await scanAudioDir({
      dir: d,
      pattern: 'SSSVVV.wav',
      riwaya: 'bazzi',
      suras: [1, 112],
    });
    expect(codes(none)).toEqual(['compte_non_declare']);
    const bad = await scanAudioDir({
      dir: d,
      pattern: 'SSSVVV.wav',
      riwaya: 'bazzi',
      suras: [1, 112],
      declaredVerses: 11,
    });
    expect(codes(bad)).toEqual(['compte_incorrect']);
  });

  it('plusieurs nommages et plusieurs dossiers (nommages réels du Complexe) : fichiers jamais renommés', async () => {
    const src = mk();
    writeTestMushaf(src, [112, 113]);
    const a = mk();
    const b = mk();
    const n3 = (v: number) => String(v).padStart(3, '0');
    // sourate 112 au nommage courant ; sourate 113 livrée à part sous un autre nommage, plus des annexes
    for (let v = 1; v <= 4; v++)
      copyFileSync(join(src, `112${n3(v)}.wav`), join(a, `10-112${n3(v)}-A01.wav`));
    for (let v = 1; v <= 5; v++)
      copyFileSync(join(src, `113${n3(v)}.wav`), join(b, `10-113${n3(v)}-001.wav`));
    copyFileSync(join(src, '112001.wav'), join(a, '10-112C00-A01.wav'));
    copyFileSync(join(src, '112002.wav'), join(b, '10-000B00-001.wav'));
    const before = [...readdirSync(a), ...readdirSync(b)].sort();
    const pattern = '10-SSSVVV-A01.wav,10-SSSVVV-001.wav';
    const opts = { dir: a, extraDirs: [b], riwaya: 'hafs', suras: [112, 113] };
    const r = await scanAudioDir({ ...opts, pattern });
    expect(r.blocking).toBe(0);
    expect(r.found).toBe(9);
    expect(codes(r, 'avertissement')).toEqual(['annexes_ignorees']);
    expect(r.tracks.find((x) => x.sura === 113 && x.aya === 5)?.source).toBe(
      join(b, '10-113005-001.wav'),
    );
    expect([...readdirSync(a), ...readdirSync(b)].sort()).toEqual(before);
    // un seul nommage : la sourate livrée à part manque
    const one = await scanAudioDir({ ...opts, pattern: '10-SSSVVV-A01.wav' });
    expect(codes(one)).toEqual(['compte_incorrect', 'manquant']);
    // même verset sous deux nommages : doublon bloquant
    copyFileSync(join(src, '113001.wav'), join(a, '10-113001-A01.wav'));
    const dup = await scanAudioDir({ ...opts, pattern });
    expect(codes(dup)).toEqual(['doublon_nom']);
    // sourate sur deux chiffres et double extension (as-Sūsī)
    const p = compilePatterns('06-SSSVVVA10.mp3.mp3,06-SSSVVVA10.wav.mp3,06-SSVVVA10.wav.mp3');
    expect(p('06-002001A10.mp3.mp3')).toEqual({ sura: 2, aya: 1 });
    expect(p('06-067030A10.wav.mp3')).toEqual({ sura: 67, aya: 30 });
    expect(p('06-01007A10.wav.mp3')).toEqual({ sura: 1, aya: 7 });
    expect(p('06-01C00A10.wav.mp3')).toBeNull();
    expect(isAnnexName('06-SSVVVA10.wav.mp3', '06-01C00A10.wav.mp3')).toBe(true);
  });

  it('A1 : sourate lue dans le NOM DU DOSSIER (zip décompressé avec ses dossiers), sans renommer', async () => {
    const src = mk();
    writeTestMushaf(src, [112, 113]);
    const root = mk();
    const d112 = join(root, '112 Al-Ikhlas');
    const d113 = join(root, '113 Al-Falaq');
    mkdirSync(d112);
    mkdirSync(d113);
    const n3 = (v: number) => String(v).padStart(3, '0');
    // dossier 112 : fichiers mal nommés « 111 » (cas d'al-Muhannā : an-Naṣr nommée 109)
    for (let v = 1; v <= 4; v++)
      copyFileSync(join(src, `112${n3(v)}.wav`), join(d112, `10-111${n3(v)}-A06.wav`));
    for (let v = 1; v <= 5; v++)
      copyFileSync(join(src, `113${n3(v)}.wav`), join(d113, `10-113${n3(v)}-A06.wav`));
    const opts = { dir: root, pattern: '10-SSSVVV-A06.wav', riwaya: 'hafs', suras: [112, 113] };
    const r = await scanAudioDir({ ...opts, suraFromFolder: true });
    expect(r.blocking).toBe(0);
    expect(codes(r, 'avertissement')).toEqual(['sourate_du_dossier']);
    expect(r.tracks.find((x) => x.sura === 112 && x.aya === 4)?.source).toBe(
      join(d112, '10-111004-A06.wav'),
    );
    expect(readdirSync(d112)).toEqual([
      '10-111001-A06.wav',
      '10-111002-A06.wav',
      '10-111003-A06.wav',
      '10-111004-A06.wav',
    ]);
    // sans l'option : les sous-dossiers ne sont pas lus
    expect(codes(await scanAudioDir(opts))).toContain('manquant');
  });

  it('A1 : Qālūn — al-Fātiḥa en 8 fichiers : le 1er est la basmala (annexe), 2 à 8 = versets 1 à 7', async () => {
    const d = mk();
    writeTestMushaf(d, [1], { counts: { 1: 8 } });
    const r = await scanAudioDir({
      dir: d,
      pattern: 'SSSVVV.wav',
      riwaya: 'qalun',
      suras: [1],
      silence: false,
    });
    expect(r.blocking).toBe(0);
    expect(codes(r, 'avertissement')).toContain('basmala_fatiha');
    expect(r.found).toBe(7);
    expect(r.tracks.find((x) => x.aya === 7)?.file).toBe('001008.wav');
    expect(r.tracks.find((x) => x.aya === 1)?.file).toBe('001002.wav');
    // Shuʿba (compte koufi) : pas de remappage, le 8e fichier est hors muṣḥaf
    const s = await scanAudioDir({
      dir: d,
      pattern: 'SSSVVV.wav',
      riwaya: 'shuba',
      suras: [1],
      silence: false,
    });
    expect(codes(s)).toContain('hors_mushaf');
  });

  it('A1 : découpage par verset non conforme au texte officiel → repli sur le fichier de sourate entière', async () => {
    const d = mk();
    writeTestMushaf(d, [67, 112], { counts: { 67: 30 } });
    const whole = mk();
    copyFileSync(join(d, '067001.wav'), join(whole, '06-067D00-10.wav'));
    const base = {
      dir: d,
      pattern: 'SSSVVV.wav',
      riwaya: 'susi',
      suras: [67, 112],
      silence: false,
    };
    // sans fichier de sourate : bloqué (verset 31 manquant)
    expect(codes(await scanAudioDir(base))).toContain('manquant');
    const r = await scanAudioDir({
      ...base,
      suraFilesDir: whole,
      suraFilesPattern: '06-SSSD00-10.wav',
    });
    expect(r.blocking).toBe(0);
    expect(r.suraFallback).toEqual([67]);
    expect(codes(r, 'avertissement')).toContain('repli_sourate');
    expect(r.tracks.filter((x) => x.sura === 67).map((x) => x.aya)).toEqual([0]);
    expect(r.found).toBe(31 + 4);
    // Ḥafṣ : jamais de repli (le découpage par verset est exigé)
    const h = await scanAudioDir({
      ...base,
      riwaya: 'hafs',
      suraFilesDir: whole,
      suraFilesPattern: '06-SSSD00-10.wav',
    });
    expect(h.suraFallback).toBeUndefined();
    expect(h.tracks.some((x) => x.aya === 0)).toBe(false);
    // Ḥafṣ, sur décision du référent (al-Muhannā, sourate 42) : repli imposé même si le compte est juste
    const f = await scanAudioDir({
      ...base,
      riwaya: 'hafs',
      suraFilesDir: whole,
      suraFilesPattern: '06-SSSD00-10.wav',
      forceSuraFallback: [67],
    });
    expect(f.blocking).toBe(0);
    expect(f.suraFallback).toEqual([67]);
    expect(f.tracks.filter((x) => x.sura === 67).map((x) => x.aya)).toEqual([0]);
  });

  it('riwāya au compte officiel connu (as-Sūsī, Qālūn) : compte par sourate imposé', async () => {
    const sum = (r: string) => riwayaSuraVerses(r)!.reduce((n, x) => n + x, 0);
    expect([sum('susi'), sum('duri'), sum('qalun'), sum('shuba')]).toEqual([
      6218, 6218, 6214, 6236,
    ]);
    expect(riwayaSuraVerses('bazzi')).toBeNull();
    const d = mk();
    // al-Mulk : 31 versets pour Abū ʿAmr ; un dossier qui s'arrête à 30 est bloqué (verset manquant)
    writeTestMushaf(d, [67], { counts: { 67: 30 } });
    const r = await scanAudioDir({
      dir: d,
      pattern: 'SSSVVV.wav',
      riwaya: 'susi',
      suras: [67],
      silence: false,
    });
    expect(codes(r)).toEqual(['compte_incorrect', 'manquant']);
    expect(r.issues.find((i) => i.code === 'manquant')).toMatchObject({ sura: 67, aya: 31 });
    // un verset hors muṣḥaf dans une sourate ÉCARTÉE d'un import partiel ne bloque pas (Qālūn : 1:8 reçu)
    writeTestMushaf(d, [1], { counts: { 1: 8 } });
    const part = await scanAudioDir({
      dir: d,
      pattern: 'SSSVVV.wav',
      riwaya: 'qalun',
      suras: [67],
      silence: false,
    });
    expect(codes(part)).toEqual(['compte_incorrect', 'manquant']);
    expect(codes(part, 'avertissement')).toContain('hors_perimetre');
  });

  it.skipIf(!FFMPEG)(
    'MP3 encodés par ffmpeg : durées lues, silence détecté par ffmpeg',
    async () => {
      const d = mk();
      for (let v = 1; v <= 4; v++) {
        const src =
          v === 4 ? 'anullsrc=r=22050:cl=mono' : `sine=frequency=${300 + v * 50}:sample_rate=22050`;
        const r = spawnSync(FFMPEG!, [
          '-hide_banner',
          '-loglevel',
          'error',
          '-f',
          'lavfi',
          '-i',
          src,
          '-t',
          `${1 + v / 10}`,
          '-c:a',
          'libmp3lame',
          '-b:a',
          '48k',
          join(d, `112${String(v).padStart(3, '0')}.mp3`),
        ]);
        expect(r.status).toBe(0);
      }
      const r = await scanAudioDir({ dir: d, pattern: 'SSSVVV.mp3', riwaya: 'hafs', suras: [112] });
      expect(r.silenceBy).toBe('ffmpeg');
      expect(codes(r)).toEqual(['silence_total']);
      const t1 = r.tracks.find((x) => x.aya === 1)!;
      expect(Math.abs(t1.durationMs - 1100)).toBeLessThan(80);
    },
  );
});

describe.skipIf(!URL)('import en base : rien n’est activé si un contrôle bloque', () => {
  let h: DbHandle;
  const ESSAI = { ...COMPLEXE_CATALOGUE.find((x) => x.id === 'ayyoub-hafs')!, id: 'essai-hafs' };
  beforeAll(async () => {
    h = connect(URL, 3);
    await resetTestDatabase(h.pool);
    await runMigrations(h.db);
    await upsertReciter(h.db, ESSAI);
  });
  afterAll(async () => {
    await h?.close();
  });
  const reciter = async () =>
    (await h.db.select().from(t.quranReciter).where(eq(t.quranReciter.id, 'essai-hafs')))[0]!;
  const tracks = async () =>
    h.db.select().from(t.quranTrack).where(eq(t.quranTrack.reciterId, 'essai-hafs'));

  it('import bloqué : rapport gardé, aucune piste, aucun fichier copié, toujours en attente', async () => {
    const src = mk();
    const store = mk();
    writeTestMushaf(src, SURAS);
    rmSync(join(src, '001007.wav'));
    const r = await importReciterAudio(h.db, {
      reciterId: 'essai-hafs',
      dir: src,
      pattern: 'SSSVVV.wav',
      suras: SURAS,
      storageDir: store,
      activate: true,
      partialOk: true,
    });
    expect(r.status).toBe('bloque');
    expect(await tracks()).toHaveLength(0);
    expect(readdirSync(store)).toHaveLength(0);
    expect((await reciter()).status).toBe('en_attente');
    const [imp] = await h.db.select().from(t.quranAudioImport);
    expect(imp!.status).toBe('bloque');
    expect((imp!.report as { counts: Record<string, number> }).counts.manquant).toBe(1);
  });

  it('activation d’un muṣḥaf partiel sans --partiel : refusée', async () => {
    const src = mk();
    writeTestMushaf(src, SURAS);
    const r = await importReciterAudio(h.db, {
      reciterId: 'essai-hafs',
      dir: src,
      pattern: 'SSSVVV.wav',
      suras: SURAS,
      storageDir: mk(),
      activate: true,
    });
    expect(r.status).toBe('bloque');
    expect(codes(r.report)).toEqual(['mushaf_incomplet']);
  });

  it('import réussi : pistes, fichiers nommés par empreinte, activation ; réimport sans doublon', async () => {
    const src = mk();
    const store = mk();
    writeTestMushaf(src, SURAS);
    const o = {
      reciterId: 'essai-hafs',
      dir: src,
      pattern: 'SSSVVV.wav',
      suras: SURAS,
      storageDir: store,
      activate: true,
      partialOk: true,
    };
    const r = await importReciterAudio(h.db, o);
    expect(r.status).toBe('active');
    const tr = await tracks();
    expect(tr).toHaveLength(22);
    const one = tr.find((x) => x.sura === 112 && x.aya === 1)!;
    expect(one.path).toMatch(/^essai-hafs\/112001-[0-9a-f]{16}\.wav$/);
    expect(readFileSync(join(store, one.path)).length).toBe(one.bytes);
    expect((await reciter()).status).toBe('actif');
    await importReciterAudio(h.db, o);
    expect(await tracks()).toHaveLength(22);
    expect(readdirSync(join(store, 'essai-hafs'))).toHaveLength(22);
  });

  it('retrait (coupure) : statut, date, motif, journal ; réactivation seulement sur demande expresse', async () => {
    expect(await retireReciter(h.db, 'essai-hafs', 'essai de coupure')).toBe(true);
    const r = await reciter();
    expect(r.status).toBe('retire');
    expect(r.retiredReason).toBe('essai de coupure');
    expect(r.retiredAt).toBeInstanceOf(Date);
    const log = await h.pool.query(
      "select target from audit_log where action = 'coran_audio_retrait'",
    );
    expect(log.rows[0].target).toBe('essai-hafs');
    expect(await activateReciter(h.db, 'essai-hafs', { partialOk: true })).toMatchObject({
      ok: false,
    });
    expect(
      await activateReciter(h.db, 'essai-hafs', { partialOk: true, reactivate: true }),
    ).toEqual({
      ok: true,
    });
    expect(await retireReciter(h.db, 'inconnu', 'x')).toBe(false);
  });

  it('activation en deux temps : refusée si le muṣḥaf n’est pas complet', async () => {
    await h.pool.query("update quran_reciter set status = 'en_attente' where id = 'essai-hafs'");
    const r = await activateReciter(h.db, 'essai-hafs');
    expect(r).toEqual({ ok: false, reason: '22 versets en base, 6236 attendus' });
  });

  it('catalogue du client : 9 muṣḥafs, conseil débutant présent, comptes déclarés hors Ḥafṣ', () => {
    expect(COMPLEXE_CATALOGUE).toHaveLength(9);
    expect(COMPLEXE_CATALOGUE.filter((x) => x.riwaya === 'hafs').map((x) => x.id)).toContain(
      'ayyoub-hafs',
    );
    for (const m of COMPLEXE_CATALOGUE) {
      if (m.riwaya === 'hafs' || m.riwaya === 'shuba') expect(m.expectedVerses).toBe(6236);
      else expect(m.expectedVerses).toBeLessThan(6236);
      expect(m.credit).toBe(
        `Récitation : ${m.nameFr} — Complexe du Roi Fahd pour l’impression du Noble Coran, Médine`,
      );
      expect(m.creditAr).toContain(m.nameAr);
      expect(m.usageNote).toContain('ne pas vendre l’audio');
      expect(m.licenseText).toContain('حقوق الاستخدام');
    }
  });
});
