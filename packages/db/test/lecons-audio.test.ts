import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { audioFileId } from '@awform/content/audio-cle';
import { importLeconsAudio, readLeconsManifest } from '../src/lecons-audio.js';

/** MP3 d'essai : trames MPEG-1 couche III vides (128 kbit/s, 44,1 kHz), aucune voix */
function mp3(frames: number): Buffer {
  const f = Buffer.alloc(417);
  f.writeUInt32BE(0xfffb9064, 0);
  return Buffer.concat(Array.from({ length: frames }, () => f));
}

const root = mkdtempSync(join(tmpdir(), 'a3-lecons-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

// versets FICTIFS (aucun texte coranique dans ce test)
const VERSES = ['قَالَ ٱلْوَلَدُ ذَهَبْتُ إِلَى ٱلْمَدْرَسَةِ'];
const T = {
  bab: 'بَابٌ',
  phrase: 'هٰذَا بَيْتٌ كَبِيرٌ',
  // 4 mots consécutifs d'un verset (fictif) : citation
  extrait: 'الْوَلَدُ ذَهَبْتُ إِلَى الْمَدْرَسَةِ',
  absent: 'قَلَمٌ',
  vide: 'كِتَابٌ',
  ado: 'سَيَّارَةٌ',
};
const key = (s: string) => s.replace('ٰ', ''); // clés déjà normalisées (alif suscrit retiré)

/** dossier source du moteur des livres : `index.js` (clé → fichier, informations) et un MP3 par texte présent */
function source(
  dir: string,
  textes: ReadonlyArray<[string, string, string?]>,
  absents: string[] = [],
) {
  mkdirSync(dir, { recursive: true });
  const idx: Record<string, string> = {};
  const inf: Record<string, object> = {};
  for (const [s, niv, src = 'tts-google-wavenet-a'] of textes) {
    const k = key(s);
    idx[k] = `audio/${audioFileId(k)}.mp3`;
    inf[k] = { src, statut: 'provisoire', niv };
    if (!absents.includes(s)) writeFileSync(join(dir, `${audioFileId(k)}.mp3`), mp3(40));
  }
  const js = `window.AW=window.AW||{};\nAW.audioIndex=${JSON.stringify(idx, null, 0).replace(/,"/g, ',\n"')}\n;\nAW.audioInfo=${JSON.stringify(inf).replace(/,"/g, ',\n"')}\n;\n`;
  writeFileSync(join(dir, 'index.js'), js.replace(/}\n;/g, '\n};'));
}

describe('A3 — import de l’audio des leçons', () => {
  const src = join(root, 'src');
  const dest = join(root, 'dest');
  source(
    src,
    [
      [T.bab, 'ad1 ado1 en1'],
      [T.phrase, 'en1'],
      [T.extrait, 'en2'],
      [T.absent, 'en1'],
      [T.vide, 'en1'],
      [T.ado, 'ado1', 'tts-google-wavenet-b'],
    ],
    [T.absent],
  );
  writeFileSync(join(src, `${audioFileId(T.vide)}.mp3`), Buffer.alloc(0));

  it('contrôle (présent, durée non nulle), garde coranique, crédit, niveaux', () => {
    const r = importLeconsAudio({ source: src, dest, verses: VERSES });
    expect(r.index).toBe(6);
    expect(r.importes).toBe(3);
    expect(r.coraniques).toBe(1);
    expect(r.absents.sort()).toEqual([audioFileId(T.absent)!, audioFileId(T.vide)!].sort());
    expect(r.parNiveau.en1).toEqual({ fichiers: 2, octets: 2 * 40 * 417 });
    const m = readLeconsManifest(dest)!;
    expect(m.mention).toBe('voix de synthèse (provisoire)');
    expect(m.credits).toEqual(['Voix : Google Cloud Text-to-Speech']);
    const f = m.fichiers[audioFileId(T.bab)!]!;
    expect(f.d).toBeGreaterThan(0);
    expect(f.v).toBe('wavenet-a');
    expect(f.n).toEqual(['ad1', 'ado1', 'en1']);
    expect(m.fichiers[audioFileId(T.ado)!]!.v).toBe('wavenet-b');
    // l'extrait coranique n'est jamais copié
    expect(readdirSync(dest)).not.toContain(`${audioFileId(T.extrait)}.mp3`);
    expect(m.coraniques).toEqual([audioFileId(key(T.extrait))]);
  });

  it('idempotent : un second import ne recopie rien', () => {
    const mtime = statSync(join(dest, `${audioFileId(T.bab)}.mp3`)).mtimeMs;
    const r = importLeconsAudio({ source: src, dest, verses: VERSES });
    expect(r.copies).toBe(0);
    expect(r.inchanges).toBe(3);
    expect(r.retires).toBe(0);
    expect(statSync(join(dest, `${audioFileId(T.bab)}.mp3`)).mtimeMs).toBe(mtime);
  });

  it('import limité à des niveaux : les autres fichiers sont retirés du stockage', () => {
    const r = importLeconsAudio({ source: src, dest, verses: VERSES, niveaux: ['ado1'] });
    expect(r.importes).toBe(2);
    expect(r.retires).toBe(1);
    expect(Object.keys(readLeconsManifest(dest)!.fichiers).sort()).toEqual(
      [audioFileId(T.bab)!, audioFileId(T.ado)!].sort(),
    );
  });

  it('refuse d’importer sans le texte du Coran (garde impossible)', () => {
    expect(() => importLeconsAudio({ source: src, dest, verses: [] })).toThrow(/garde/);
  });
});

describe('A3 — garde coranique de l’import : même règle que les vidéos vivantes (référent, 20/10/2026)', () => {
  // versets FICTIFS qui contiennent des formules de la liste blanche et des mots de leçons (aucun texte coranique) :
  // sans la liste, « مَا شَاءَ اللَّهُ » (extrait de 3 mots) et la kaffāra (5 mots consécutifs) seraient refusés
  const VERSETS = [
    'قَالَ ٱلْوَلَدُ ذَهَبْتُ إِلَى ٱلْمَدْرَسَةِ',
    'فَقُلْتُمْ مَا شَاءَ ٱللَّهُ كَانَ',
    'فَنَادَوْا أَنْ لَا إِلَٰهَ إِلَّا أَنْتَ يَا رَبَّنَا',
    'كِتَابٌ جَدِيدٌ',
  ];
  const G = {
    machaallah: 'مَا شَاءَ اللَّهُ',
    machaallahPhrase: 'مَا شَاءَ اللَّهُ! رَسْمٌ جَمِيلٌ.',
    kaffara:
      'سُبْحَانَكَ اللَّهُمَّ وَبِحَمْدِكَ، أَشْهَدُ أَنْ لَا إِلٰهَ إِلَّا أَنْتَ، أَسْتَغْفِرُكَ وَأَتُوبُ إِلَيْكَ',
    // 4 mots consécutifs (fictifs) du Coran, seuls ou dans une phrase : refusés
    quatre: 'الْوَلَدُ ذَهَبْتُ إِلَى الْمَدْرَسَةِ',
    quatrePhrase: 'قَالَتْ أُمِّي: الْوَلَدُ ذَهَبْتُ إِلَى الْمَدْرَسَةِ صَبَاحًا.',
    // la formule ne couvre pas les 4 mots : « فقلتم » + formule est une citation
    formuleCitee: 'فَقُلْتُمْ مَا شَاءَ اللَّهُ',
    // 3 mots d'un verset : permis (en dessous de 4 mots)
    trois: 'ذَهَبْتُ إِلَى الْمَدْرَسَةِ',
    // citation référencée et verset entier : présentés comme Coran, quelle que soit la longueur
    reference: 'ذَهَبْتُ إِلَى الْمَدْرَسَةِ (1:1)',
    referenceFormule: 'مَا شَاءَ اللَّهُ ﴿٢:٣﴾',
    verset: 'كِتَابٌ جَدِيدٌ',
    // un mot isolé (vocabulaire) : permis ; une phrase qui cite une référence sans recopier le verset : permise
    mot: 'الْمَدْرَسَةِ',
    paragraphe: 'هٰذَا بَيْتٌ كَبِيرٌ، كَمَا فِي الْآيَةِ (1:1).',
  };
  const src = join(root, 'garde-src');
  const dest = join(root, 'garde-dest');
  source(
    src,
    Object.values(G).map((s) => [s, 'ad1'] as [string, string]),
  );
  const r = importLeconsAudio({ source: src, dest, verses: VERSETS });
  const m = readLeconsManifest(dest)!;
  const importe = (s: string) => Boolean(m.fichiers[audioFileId(key(s))!]);
  const refuse = (s: string) => m.coraniques.includes(audioFileId(key(s))!);

  it('« مَا شَاءَ اللَّهُ » et la kaffārat al-majlis (liste blanche) sont importés, seuls ou dans une phrase', () => {
    for (const s of [G.machaallah, G.machaallahPhrase, G.kaffara]) {
      expect(importe(s), s).toBe(true);
      expect(refuse(s), s).toBe(false);
    }
  });

  it('une suite de 4 mots du Coran est refusée, seule ou dans une phrase, même autour d’une formule', () => {
    for (const s of [G.quatre, G.quatrePhrase, G.formuleCitee]) {
      expect(refuse(s), s).toBe(true);
      expect(importe(s), s).toBe(false);
      expect(readdirSync(dest)).not.toContain(`${audioFileId(key(s))}.mp3`);
    }
  });

  it('une citation référencée ou un verset entier est refusé, même court, même pour une formule', () => {
    for (const s of [G.reference, G.referenceFormule, G.verset]) expect(refuse(s), s).toBe(true);
  });

  it('un mot isolé, 3 mots d’un verset, une phrase qui cite une référence sont acceptés', () => {
    for (const s of [G.mot, G.trois, G.paragraphe]) expect(importe(s), s).toBe(true);
    expect(r.coraniques).toBe(6);
    expect(r.importes).toBe(6);
  });
});
