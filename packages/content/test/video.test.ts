/**
 * Vidéos vivantes (19/10/2026) : générateur de scènes `buildVideo` sur les 25 unités de chaque niveau proposé (Adultes 1, Adultes 2… ; projection
 * élève, comme l'application) — fidélité octet pour octet, modes, durées, garde coranique et Basmala, audit
 * des audios. `VIDEO_GARDE=ecrire` régénère `src/video-garde.ts` ; `VIDEO_AUDIT=1` écrit
 * `reports/video-vivante-<niveau>.md` (tableau des unités, audios manquants, textes gardés sans voix).
 */
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CHAPITRES,
  CONSEIL_MASQUE,
  chapitreDe,
  COURTE_MAX_MS,
  COURTE_MIN_MS,
  LETTRE_MAX_MS,
  LETTRE_MIN_MS,
  VIDEO_MODES,
  buildVideo,
  dureeMode,
  gardeVideoKey,
  motExemple,
  motsCles,
  ordreDe,
  phrasesFr,
  scenesDuMode,
  videoStrings,
  videoVoix,
  type Temps,
  type VideoLecon,
} from '../src/video.js';
import { VIDEO_GARDE, VIDEO_RECITATION } from '../src/video-garde.js';
import { VIDEO_NIVEAUX } from '../src/video-niveaux.js';
import { VIDEO_PROFILS, profilVideo } from '../src/video.js';
import { DHIKR, contientDhikr, horsDhikr, sansVoyelles } from '../src/dhikr.js';
import { audioFileId, looksQuranic, sayText, skeleton } from '../src/audio-cle.js';
import {
  BASMALA_COMPLETE,
  citationInterdite,
  gardeCoran,
  recitationCoran,
} from '../src/garde-coran.js';
import { loadTanzil, parseDataFile, studentProjection } from '../src/index.js';
import { CONTENT_DIR, HAS_CONTENT } from './helpers.js';

/** niveaux proposés (garde calculée) : Adultes 1, Adultes 2… */
const LIVRES = [...VIDEO_NIVEAUX];
const fichiers = (livre: string) => {
  const d = join(CONTENT_DIR, 'data', livre);
  return existsSync(d)
    ? readdirSync(d)
        .filter((f) => /^l\d+\.js$/.test(f))
        .sort()
    : [];
};
const TSV = join(CONTENT_DIR, 'coran', 'tanzil-uthmani.tsv');
/** marque d'ordre des octets en tête de la liste (écrite par PowerShell) */
const BOM = new RegExp(`^${String.fromCharCode(0xfeff)}`);
/** liste des fichiers audio des leçons (import `lecons-audio`) : sha1;voix;source;statut;caracteres;niveaux;texte */
const LISTE = process.env.AWFORM_LECONS_AUDIO_LISTE ?? join(homedir(), 'lecons-audio', 'liste.csv');
const lignesListe = existsSync(LISTE)
  ? readFileSync(LISTE, 'utf8')
      .split('\n')
      .slice(1)
      .map((l) => l.split(';'))
  : null;
/** fichiers audio d'un niveau */
const audioDe = (livre: string) =>
  lignesListe
    ? new Set(
        lignesListe
          .filter((c) => (c[5] ?? '').split(' ').includes(livre))
          .map((c) => c[0]!.replace(BOM, '')),
      )
    : null;
const audios = new Map(LIVRES.map((l) => [l, audioDe(l)]));
/** tous les fichiers de la liste, tous niveaux (audit : texte enregistré pour un autre niveau) */
const tousFichiers = new Set((lignesListe ?? []).map((c) => c[0]!.replace(BOM, '')));
/** comme l'application (`audioIdFor`) : fichier du niveau, jamais pour un texte aux signes du Muṣḥaf */
const hasAudioDe = (livre: string) => {
  const a = audios.get(livre) ?? null;
  return (s: string) => (a ? !looksQuranic(s) && a.has(audioFileId(s) ?? '') : true);
};

const raw = (livre: string, f: string) =>
  parseDataFile(readFileSync(join(CONTENT_DIR, 'data', livre, f), 'utf8'), f).value as Record<
    string,
    unknown
  >;
const strings = (v: unknown, out: string[] = []): string[] => {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => strings(x, out));
  return out;
};
const unmark = (s: string) => s.replace(/[[\]]/g, '');
/** lettre ou signe arabe : un morceau du livre ne commence ni ne finit au milieu d'un mot */
const IN_WORD = /[ء-ٰٟٱ]/;
function fromBook(s: string, book: string[]): boolean {
  if (book.includes(s) || book.some((b) => unmark(b) === s)) return true;
  for (const b of book)
    for (const t of [b, unmark(b)])
      for (let i = t.indexOf(s); i >= 0; i = t.indexOf(s, i + 1)) {
        const before = i > 0 ? t[i - 1]! : ' ';
        const after = t[i + s.length] ?? ' ';
        if (!IN_WORD.test(before) && !IN_WORD.test(after)) return true;
      }
  return false;
}
const SEP = /\s+[|/●•·—–]\s+/;
function frFromBook(s: string, book: string[]): boolean {
  return book.some(
    (b) => b === s || phrasesFr(b).includes(s) || b.split(SEP).some((p) => p.trim() === s),
  );
}
/** parties du livre jamais montrées dans la vidéo */
const HORS_VIDEO = [
  'coran',
  'fiqh_adab',
  'guide',
  'checklist',
  'travail_perso_fr',
  'mise_en_route_fr',
];
const sansParties = (L: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(L).filter(([k]) => !HORS_VIDEO.includes(k)));
const imagesDe = (L: Record<string, unknown>) =>
  new Set(strings([L.mots, L.exercices]).filter((s) => /^[a-z_]+$/.test(s)));

const tanzil = existsSync(TSV) ? loadTanzil(readFileSync(TSV, 'utf8')) : null;
// versets dans l'ordre du Muṣḥaf (le fichier Tanzil n'est pas trié) : suites de mots et versets enchaînés justes
const cleVerset = (k: string) => k.split(':').map(Number) as [number, number];
const verses = tanzil
  ? [...tanzil.entries()]
      .sort(([a], [b]) => {
        const [x, y] = cleVerset(a);
        const [u, v] = cleVerset(b);
        return x - u || y - v;
      })
      .map(([, v]) => v)
  : [];
/**
 * Texte présenté comme citation du Coran par sa référence : le bloc du livre porte une référence de verset (champ
 * `ref`, sens ou note : « 49:10 ») et son texte arabe, de deux mots ou plus, se lit dans ce verset (Tanzil sans
 * voyelles). Un mot isolé (أَحَدٌ, « dernier mot d'Al-Ikhlāṣ ») reste du vocabulaire.
 */
const REF = /(\d{1,3})\s*:\s*(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?/g;
function citationsAvecRef(L: unknown): Set<string> {
  const out = new Set<string>();
  const walk = (x: unknown): void => {
    if (Array.isArray(x)) return x.forEach(walk);
    if (!x || typeof x !== 'object') return;
    const o = x as Record<string, unknown>;
    const ar = typeof o.ar === 'string' ? unmark(o.ar) : '';
    const notes = ['ref', 'ref_fr', 'fr', 'note_fr']
      .map((k) => o[k])
      .filter((v): v is string => typeof v === 'string')
      .join(' ');
    if (tanzil && ar && ar.trim().split(/\s+/).length >= 2)
      for (const m of notes.matchAll(REF)) {
        const s = Number(m[1]);
        const a = Number(m[2]);
        const b = Number(m[3] ?? m[2]);
        const texte = Array.from(
          { length: Math.max(0, b - a) + 1 },
          (_, i) => tanzil.get(`${s}:${a + i}`) ?? '',
        )
          .map(skeleton)
          .join(' ');
        const k = skeleton(ar);
        if (k && ` ${texte} `.includes(` ${k} `)) out.add(o.ar as string);
      }
    Object.values(o).forEach(walk);
  };
  walk(L);
  return out;
}
/**
 * Garde coranique de la voix (règle du référent du 20/10/2026) : MÊME code que l'import des audios des leçons
 * (`src/garde-coran.ts`) — citation à partir de 4 mots consécutifs du Coran hors formules de dhikr et hors hadiths, textes de récitation.
 */
const GARDE_CORAN = tanzil
  ? gardeCoran(verses)
  : { suites: new Map<string, string[]>(), versets: new Set<string>(), extraits: '' };
const cite = (s: string) => citationInterdite(s, GARDE_CORAN);
const versetsEntiers = GARDE_CORAN.versets;
/** texte de la lecture présenté comme récitation : graphie du Muṣḥaf, ou un ou plusieurs versets entiers */
const recitation = (s: string) => recitationCoran(s, GARDE_CORAN);

/** textes que le lecteur dit d'office dans un temps (miroir de `apps/web/src/lib/video/lecteur.ts`) */
type TT = { ar: string; son?: 1 } | undefined;
function joues(x: Temps): TT[] {
  const o: TT[] = [];
  const S = (y: TT) => void (y?.son && o.push(y));
  switch (x.k) {
    case 'titre':
      (x.noms ?? [x.ar, ...(x.tableau ?? [])]).forEach(S);
      break;
    case 'bulle':
      if (x.dit) S(x.dit);
      else x.lignes.forEach(S);
      break;
    case 'objectif':
    case 'points':
    case 'texte':
    case 'mot':
    case 'retenir':
      S(x.ar);
      break;
    case 'nom':
      S(x.nom);
      break;
    case 'rangee':
      x.items.forEach(S);
      break;
    case 'joindre':
      x.morceaux.forEach(S);
      S(x.mot);
      break;
    case 'inter':
      x.ar.forEach(S);
      break;
    case 'regle':
      S(x.titre_ar);
      (x.ar ?? []).forEach(S);
      break;
    case 'lettres':
      x.items.forEach((i) => S(i.nom));
      break;
    case 'aToi':
      (x.puis ?? []).forEach(S);
      break;
    case 'cles':
      x.items.forEach((l) => (l.ar.son ? S(l.ar) : (l.dits ?? []).forEach(S)));
      break;
    // V2 (lecteur-v2.ts) : lettres et vedette redites ; les mots illustrés reviennent par leur image (rappel muet)
    case 'bilan':
      x.lettres.forEach(S);
      S(x.vedette);
      x.mots.filter((m) => !m.img).forEach((m) => S(m.ar));
      break;
    case 'q': {
      const q = x.q;
      if (q.k === 'ecoute') S(q.dit);
      if (q.k === 'premiere' || q.k === 'complete') S(q.mot ?? q.bonne);
      if (q.k === 'vf') {
        S(q.ar);
        S(q.correction);
      }
      if (q.k === 'ordre') S(q.phrase);
      if (q.k === 'contient') q.mots.filter((m) => m.oui).forEach((m) => S(m.ar));
      if (q.k === 'relier' && !q.droite) q.items.forEach((i) => S(i.ar));
      break;
    }
  }
  return o;
}
/**
 * Scènes sans aucun son joué (hors « À toi ! » seul, scène « jouer » à choix, textes gardés) : `nonDit`, un texte affiché
 * a un fichier mais n'est pas dit (doit être vide) ; `sansAudio`, aucun texte de la scène n'a de fichier (rapport).
 */
function scenesMuettes(v: VideoLecon, hasA: (s: string) => boolean) {
  const garde = new Set(v.signalements.map((x) => unmark(x.texte)));
  const nonDit: string[] = [];
  const sansAudio: string[] = [];
  for (const m of v.modes)
    for (const s of m === 'lettre'
      ? v.lettres.flatMap((_, i) => scenesDuMode(v, m, i))
      : scenesDuMode(v, m)) {
      if (s.temps.every((x) => x.k === 'aToi' || x.k === 'jouer')) continue;
      if (s.voix?.length || s.temps.some((x) => joues(x).length)) continue;
      const ar = strings(s.temps).filter((x) => /[ء-ي]/.test(x) && !/[A-Za-z]/.test(x));
      if (ar.length && ar.every((x) => garde.has(x))) continue;
      const avecSon = ar.filter((x) => !garde.has(x) && hasA(x));
      (avecSon.length ? nonDit : sansAudio).push(
        `${m} ${s.id}${avecSon.length ? ` : ${avecSon[0]}` : ''}`,
      );
    }
  return { nonDit, sansAudio };
}

const videos = new Map<string, { v: VideoLecon; L: Record<string, unknown> }>();
/** vidéo d'une unité, comme l'application ; `v2` : interrupteur `video_v2` allumé */
const video = (livre: string, f: string, v2 = false) => {
  const k = `${livre}/${f}/${v2}`;
  if (!videos.has(k)) {
    const L = studentProjection(raw(livre, f), livre) as Record<string, unknown>;
    const a = audios.get(livre) ?? null;
    const v = buildVideo(L, {
      unitId: `${livre}.${f.slice(0, 3)}`,
      hasAudio: hasAudioDe(livre),
      images: imagesDe(L),
      audioList: a ? [...a] : [],
      ...(v2 ? { v2: true } : {}),
    });
    videos.set(k, { v, L });
  }
  return videos.get(k)!;
};
describe('vidéos vivantes : outils', () => {
  it('ordre : retrouve l’ordre des morceaux qui redonne la phrase du livre (espaces ignorés)', () => {
    expect(ordreDe(['c', 'a', 'b'], 'abc')).toEqual([1, 2, 0]);
    expect(ordreDe(['x y', 'z'], 'z x y')).toEqual([1, 0]);
    expect(ordreDe(['a', 'b'], 'abc')).toBeNull();
    expect(ordreDe(['a'], 'a')).toBeNull();
  });
  it('mot d’exemple : lettre en évidence en initiale d’abord, sinon ailleurs, sinon aucun', () => {
    const b = String.fromCharCode(0x628);
    const t = String.fromCharCode(0x62a);
    const f = String.fromCharCode(0x64e);
    const mots = [{ ar: `${t}[${b}${f}]` }, { ar: `[${b}${f}]${t}` }];
    expect(motExemple(b, mots)).toBe(1);
    expect(motExemple(b, [mots[0]!])).toBe(0);
    expect(motExemple(t, mots)).toBe(-1);
  });
  it('phrases françaises : coupées après un point, jamais réécrites', () => {
    expect(phrasesFr('Un. Deux ; trois. 1) Quatre')).toEqual(['Un.', 'Deux ; trois.', '1) Quatre']);
    expect(phrasesFr('Sans point final')).toEqual(['Sans point final']);
  });
  it('le générateur ne contient aucun caractère arabe (codes seulement)', () => {
    const src = readFileSync(new URL('../src/video.ts', import.meta.url), 'utf8');
    const c = String.fromCharCode;
    const arabe = new RegExp(
      `[${c(0x600)}-${c(0x6ff)}${c(0xfb50)}-${c(0xfdff)}${c(0xfe70)}-${c(0xfefe)}]`,
    );
    expect(arabe.test(src)).toBe(false);
  });
});

describe('vidéos vivantes : garde coranique et formules de dhikr', () => {
  const c = String.fromCharCode;
  // بِسْمِ اللَّهِ (codes : la source des tests n'écrit pas non plus le texte)
  const bismi = c(0x628, 0x650, 0x633, 0x652, 0x645, 0x650);
  const allahi = c(0x627, 0x644, 0x644, 0x651, 0x64e, 0x647, 0x650);
  const basmala = `${bismi} ${allahi}`;
  // الرَّحْمٰنِ الرَّحِيمِ : avec elles, la Basmala complète (1:1, tête de sourate)
  const rahman = c(0x627, 0x644, 0x631, 0x651, 0x64e, 0x62d, 0x652, 0x645, 0x670, 0x646, 0x650);
  const rahim = c(0x627, 0x644, 0x631, 0x651, 0x64e, 0x62d, 0x650, 0x64a, 0x645, 0x650);
  const complete = `${basmala} ${rahman} ${rahim}`;
  // أَقُولُ : (phrase qui contient la formule)
  const aqulu = c(0x623, 0x64e, 0x642, 0x64f, 0x648, 0x644, 0x64f);
  const lecon = (phrase: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
    type: 'lecon',
    lecture: { phrases: [phrase] },
    ...extra,
  });
  const voix = (L: unknown, garde = new Set<string>(), recitation = new Set<string>()) =>
    videoVoix(buildVideo(L, { unitId: 't', hasAudio: () => true, garde, recitation }));
  it('liste blanche : la forme sans voyelles du code suit le fichier de données relu', () => {
    const data = JSON.parse(
      readFileSync(new URL('../data/dhikr-formules.json', import.meta.url), 'utf8'),
    ) as { formules: Array<{ ar: string }> };
    const want = data.formules
      .map((f) =>
        sansVoyelles(f.ar)
          .replace(/[^ء-ي]+/g, ' ')
          .trim(),
      )
      .join('|');
    if (process.env.DHIKR === 'ecrire') {
      const p = new URL('../src/dhikr.ts', import.meta.url);
      writeFileSync(
        p,
        readFileSync(p, 'utf8').replace(
          /export const DHIKR =\n {2}'[^']*';/,
          `export const DHIKR =\n  '${want}';`,
        ),
      );
      return;
    }
    expect(DHIKR, 'DHIKR=ecrire').toBe(want);
    expect(data.formules.length).toBeGreaterThan(20);
  });
  it('formule trouvée mot pour mot sans voyelles, aussi après و ou ف collé ; jamais au milieu d’un mot', () => {
    expect(contientDhikr(basmala)).toBe(true);
    expect(contientDhikr(`${aqulu}: ${basmala}`)).toBe(true);
    expect(contientDhikr(`${c(0x648, 0x64e)}${basmala}`)).toBe(true);
    // « بسم » seul, ou « اللَّهِ » seul : pas une formule
    expect(contientDhikr(bismi)).toBe(false);
    expect(contientDhikr(`${bismi}${c(0x643)} ${allahi}`)).toBe(false);
    expect(horsDhikr(`${aqulu}: ${basmala}`)).toEqual([aqulu]);
    expect(horsDhikr(basmala)).toEqual([]);
  });
  it('formule de la liste (Basmala dite avant d’agir), seule ou dans une phrase : sonorisée, sans marque', () => {
    expect(voix(lecon({ ar: basmala }))).toContain(basmala);
    expect(voix(lecon({ ar: `${aqulu}: ${basmala}` }))).toContain(`${aqulu}: ${basmala}`);
  });
  it('Basmala complète (tête de sourate, 1:1) : muette, sauf marque « formule de dhikr » des données', () => {
    const v = buildVideo(lecon({ ar: complete }), { unitId: 't', hasAudio: () => true });
    expect(videoVoix(v)).toEqual([]);
    expect(v.signalements[0]?.raison).toBe('basmala');
    expect(voix(lecon({ ar: complete, dhikr: true }))).toContain(complete);
  });
  it('formule présentée comme Coran : muette (graphie du Muṣḥaf, référence de verset, partie Coran, récitation)', () => {
    const uthmani = `${bismi} ${c(0x671, 0x644, 0x644, 0x651, 0x64e, 0x647, 0x650)}`;
    expect(voix(lecon({ ar: uthmani }))).toEqual([]);
    expect(voix(lecon({ ar: uthmani, dhikr: true }))).toEqual([]);
    expect(voix(lecon({ ar: basmala, ref: '27:30' }))).toEqual([]);
    expect(
      voix(lecon({ ar: `${basmala} ${rahman}` }, { coran: { versets: [{ ar: complete }] } })),
    ).toEqual([]);
    // la lecture présente la Basmala complète comme récitation : ses morceaux, même la formule, restent muets
    const L = { type: 'lecon', lecture: { phrases: [{ ar: complete }], ligne: [basmala] } };
    expect(voix(L, new Set(), new Set([gardeVideoKey(complete)]))).toEqual([]);
  });
  it('contexte coranique (graphie du Muṣḥaf) : jamais de voix, même marquée', () => {
    const uthmani = `${bismi} ${c(0x671, 0x644, 0x644, 0x651, 0x64e, 0x647, 0x650)}`;
    expect(voix(lecon({ ar: uthmani, dhikr: true }))).toEqual([]);
  });
  it('texte cité par la garde vidéo (Tanzil) : jamais de voix', () => {
    const s = c(0x628, 0x64e, 0x628);
    const v = buildVideo(lecon({ ar: s }), {
      unitId: 't',
      hasAudio: () => true,
      garde: new Set([gardeVideoKey(s)]),
    });
    expect(videoVoix(v)).toEqual([]);
    expect(v.signalements[0]?.raison).toBe('coran');
    // même texte marqué « formule de dhikr » par les données (shahāda dite seule) : voix permise
    const v2 = buildVideo(lecon({ ar: s, dhikr: true }), {
      unitId: 't',
      hasAudio: () => true,
      garde: new Set([gardeVideoKey(s)]),
    });
    expect(videoVoix(v2)).toContain(s);
  });
  it('morceau d’un passage coranique cité par la leçon : jamais de voix (contexte)', () => {
    const w = [c(0x62d, 0x64e, 0x645, 0x652, 0x62f, 0x64f), c(0x631, 0x64e, 0x628, 0x651, 0x650)];
    const L = {
      type: 'lecon',
      // passage en graphie du Muṣḥaf (alif waṣla) ; la ligne en reprend deux mots, en graphie courante
      lecture: {
        phrases: [{ ar: `${c(0x671, 0x644, 0x652)} ${w[0]} ${w[1]}` }],
        ligne: [`${w[0]} ${w[1]}`],
      },
    };
    expect(voix(L)).toEqual([]);
  });
  it('les parties Coran et fiqh/adab ne sont jamais jouées ni montrées', () => {
    const v = buildVideo(
      {
        type: 'lecon',
        coran: { versets: [{ ar: basmala }] },
        fiqh_adab: { points: [{ ar: basmala }] },
      },
      { unitId: 't', hasAudio: () => true },
    );
    expect(videoStrings(v).ar).not.toContain(basmala);
  });
  it('moins de 4 mots, hors récitation : voix permise (mot d’une sourate employé comme vocabulaire)', () => {
    const w = c(0x623, 0x64e, 0x62d, 0x64e, 0x62f, 0x64c);
    expect(voix({ type: 'lecon', lecture: { vedette: { ar: w } } })).toContain(w);
    // le même mot, morceau d'un verset que la lecture présente comme récitation : muet
    const verset = `${c(0x642, 0x64f, 0x644, 0x652)} ${c(0x647, 0x64f, 0x648, 0x64e)} ${allahi} ${w}`;
    const L = { type: 'lecon', lecture: { phrases: [{ ar: verset }], ligne: [w] } };
    expect(voix(L, new Set([gardeVideoKey(verset)]), new Set([gardeVideoKey(verset)]))).toEqual([]);
  });
  it('partie fiqh/adab : un hadith ou une phrase d’adab est sonore (pas du Coran) ; un verset de la partie Coran est muet', () => {
    const hadith = `${c(0x645, 0x64e, 0x627)} ${c(0x646, 0x64e, 0x642, 0x64e, 0x635, 0x64e, 0x62a, 0x652)} ${c(0x635, 0x64e, 0x62f, 0x64e, 0x642, 0x64e, 0x629, 0x64c)}`;
    const fiqh = { fiqh_adab: { points: [{ ar: hadith }] } };
    expect(voix(lecon({ ar: hadith }, fiqh))).toContain(hadith);
    expect(voix(lecon({ ar: `${basmala}، ${hadith}` }, fiqh))).toContain(`${basmala}، ${hadith}`);
    // le même texte donné comme verset dans la partie Coran : muet
    expect(voix(lecon({ ar: hadith }, { coran: { versets: [{ ar: hadith }] } }))).toEqual([]);
  });
  it.skipIf(!tanzil)(
    'citation : 4 mots du Coran hors formule (muette) ; les 4 mots d’une formule seule ne comptent pas',
    () => {
      // لَا إِلٰهَ إِلَّا اللَّهُ (37:35, 47:19) : formule de la liste
      const tahlil = [
        c(0x644, 0x64e, 0x627),
        c(0x625, 0x650, 0x644, 0x670, 0x647, 0x64e),
        c(0x625, 0x650, 0x644, 0x651, 0x64e, 0x627),
        c(0x627, 0x644, 0x644, 0x651, 0x64e, 0x647, 0x64f),
      ].join(' ');
      expect(contientDhikr(tahlil)).toBe(true);
      expect(cite(tahlil)).toBe(false);
      // الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ (1:2) : la formule « الْحَمْدُ لِلَّهِ » ne couvre pas les 4 mots
      const hamd = [
        c(0x627, 0x644, 0x652, 0x62d, 0x64e, 0x645, 0x652, 0x62f, 0x64f),
        c(0x644, 0x650, 0x644, 0x651, 0x64e, 0x647, 0x650),
        c(0x631, 0x64e, 0x628, 0x651, 0x650),
        c(
          0x627,
          0x644,
          0x652,
          0x639,
          0x64e,
          0x627,
          0x644,
          0x64e,
          0x645,
          0x650,
          0x64a,
          0x646,
          0x64e,
        ),
      ].join(' ');
      expect(cite(hamd)).toBe(true);
      expect(recitation(hamd)).toBe(true);
      // 3 mots d'un verset (vocabulaire, exemple) : permis
      expect(cite(hamd.split(' ').slice(1).join(' '))).toBe(false);
    },
  );
});

for (const LIVRE of LIVRES)
  describe.skipIf(!HAS_CONTENT)(`vidéos vivantes : les 25 unités de ${LIVRE}`, () => {
    const FILES = fichiers(LIVRE);
    it('25 unités (20 leçons, 4 bilans, 1 examen ; Enfants 1 : 21 leçons)', () => {
      const lecons = LIVRE === 'en1' ? 21 : 20;
      expect(FILES.length).toBe(lecons + 5);
      const types = FILES.map((f) => video(LIVRE, f).v.type);
      expect(types.filter((t) => t === 'lecon').length).toBe(lecons);
      expect(types.filter((t) => t !== 'lecon').length).toBe(5);
    });

    for (const f of FILES) {
      it(`${f} : modes proposés non vides, fidélité au livre, durées, garde`, () => {
        const { v, L } = video(LIVRE, f);
        // modes : au moins la version longue ; aucun mode proposé sans scène ; aucune scène d'un mode non proposé
        expect(v.modes).toContain('longue');
        // révision dans toutes les unités (décision du 20/10/2026) : bilans, examen et leçons (« Je retiens »…)
        expect(v.modes).toContain('revision');
        if (v.type === 'lecon')
          expect(scenesDuMode(v, 'revision').map((s) => s.id)).toContain('recap');
        // conseil d'écriture contredisant les tracés validés : masqué (l02, l04, l07)
        const ecr = v.scenes.find((s) => s.id === 'ecriture');
        if (ecr && CONSEIL_MASQUE.has(v.unitId))
          expect(ecr.temps.some((x) => x.k === 'fr')).toBe(false);
        for (const m of v.modes) expect(scenesDuMode(v, m).length).toBeGreaterThan(0);
        for (const s of v.scenes) for (const m of s.modes) expect(v.modes).toContain(m);
        for (const m of VIDEO_MODES)
          if (!v.modes.includes(m)) expect(v.scenes.some((s) => s.modes.includes(m))).toBe(false);
        // « par lettre » : seulement les leçons qui présentent des lettres nouvelles ; jamais dans un bilan
        const nouvelles = ((L.lettres as Array<Record<string, unknown>>) ?? []).filter(
          (x) => x.nom_ar,
        );
        expect(v.modes.includes('lettre')).toBe(nouvelles.length > 0);
        if (v.type !== 'lecon') expect(v.modes).not.toContain('lettre');
        expect(v.lettres.length).toBe(nouvelles.length);
        v.lettres.forEach((_, i) => {
          const ms = dureeMode(v, 'lettre', i);
          expect(ms, `lettre ${i + 1}`).toBeGreaterThanOrEqual(LETTRE_MIN_MS);
          expect(ms, `lettre ${i + 1}`).toBeLessThanOrEqual(LETTRE_MAX_MS);
        });
        if (v.modes.includes('courte')) {
          expect(dureeMode(v, 'courte')).toBeGreaterThanOrEqual(COURTE_MIN_MS);
          expect(dureeMode(v, 'courte')).toBeLessThanOrEqual(COURTE_MAX_MS);
        }
        // quiz : seulement des exercices jouables (corrigé présent) ; bilans et examen : aucun corrigé (D7)
        for (const s of scenesDuMode(v, 'quiz')) expect(s.jouable).toBe(true);
        // fidélité : chaque chaîne affichée ou dite vient du livre, octet pour octet (aucune normalisation)
        const book = strings(sansParties(L));
        const { ar, fr, cles } = videoStrings(v);
        for (const s of ar) expect(fromBook(s, book), `arabe hors du livre : ${s}`).toBe(true);
        for (const s of fr) expect(frFromBook(s, book), `français hors du livre : ${s}`).toBe(true);
        for (const k of cles) expect(k).toMatch(/^vv\.[a-z_]+$/);
        // aucune phonétique latine : aucune valeur d'un champ `tr` du livre (absent de la projection élève)
        const tr = new Set<string>();
        const walk = (x: unknown): void => {
          if (Array.isArray(x)) x.forEach(walk);
          else if (x && typeof x === 'object')
            for (const [k, y] of Object.entries(x)) {
              if (k === 'tr' && typeof y === 'string') tr.add(y);
              else walk(y);
            }
        };
        walk(raw(LIVRE, f));
        for (const s of [...ar, ...fr]) expect(tr.has(s), `phonétique : ${s}`).toBe(false);
        expect(JSON.stringify(v)).not.toMatch(/"tr"/);
        // garde : aucune voix sur un texte coranique (Muṣḥaf, 4 mots du Coran hors formules, Basmala complète)
        // formules de dhikr marquées par les données (`dhikr: true`) : voix permise malgré les gardes Basmala et Tanzil
        const dhikrs = new Set<string>();
        const marque = (x: unknown): void => {
          if (Array.isArray(x)) x.forEach(marque);
          else if (x && typeof x === 'object') {
            const o = x as Record<string, unknown>;
            if (o.dhikr === true) strings(o).forEach((s) => dhikrs.add(unmark(s)));
            Object.values(o).forEach(marque);
          }
        };
        marque(sansParties(L));
        for (const s of videoVoix(v)) {
          expect(looksQuranic(s), s).toBe(false);
          if (dhikrs.has(s)) continue;
          expect(skeleton(s).includes(BASMALA_COMPLETE), s).toBe(false);
          if (tanzil) expect(cite(s), `voix sur une citation du Coran : ${s}`).toBe(false);
        }
        const refs = new Set([...citationsAvecRef(sansParties(L))].map(unmark));
        for (const s of videoVoix(v))
          expect(refs.has(s), `voix sur une citation avec référence : ${s}`).toBe(false);
        // récitation : aucune voix sur un morceau (même un mot, même une formule) d'une sourate ou d'un verset que la
        // lecture de l'unité présente comme récitation (Fātiḥa mot à mot, sourates 112 à 114…)
        if (tanzil) {
          const norme = (x: string) =>
            ` ${sayText(unmark(x))
              .replace(/[|.,:;!?«»"()…—–=+←،؛؟]/g, ' ')
              .replace(/\s+/g, ' ')
              .trim()} `;
          const passages = strings((L as { lecture?: unknown }).lecture)
            .filter((x) => !/[A-Za-z]/.test(x))
            .filter(recitation)
            .map(norme);
          // tous les textes qui POURRAIENT être dits (comme si chaque fichier audio existait), hors dialogue (formules
          // de salutation : jamais un contexte coranique)
          const tout = buildVideo(L, { unitId: f, hasAudio: () => true, images: imagesDe(L) });
          const dits = videoVoix({
            ...tout,
            scenes: tout.scenes.filter((s) => s.part !== 'dialogue' && s.part !== 'jouer'),
          });
          for (const s of dits)
            expect(
              passages.some((p) => p.includes(norme(s))),
              `voix sur un morceau de passage coranique : ${s}`,
            ).toBe(false);
        }
        // aucune scène muette quand un texte affiché a son fichier audio (règle du client, 20/10/2026), dans chaque mode
        expect(scenesMuettes(v, hasAudioDe(LIVRE)).nonDit).toEqual([]);
        // « À toi de jouer la scène ! » : à la fin de la version longue quand le dialogue a au moins deux rôles
        const longue = scenesDuMode(v, 'longue');
        if (v.scenes.some((s) => s.id === 'jouer')) expect(longue.at(-1)!.id).toBe('jouer');
      });

      it(`${f} : v2 — fidélité, garde inchangée (rien de dit en plus), chapitres dans l'ordre, récapitulatif, aucune scène muette`, () => {
        const { v: v1, L } = video(LIVRE, f);
        const { v } = video(LIVRE, f, true);
        // mêmes modes que la v1 ; chaque scène de la v1 est dans la v2 (seul l'ordre peut changer), plus le récapitulatif
        expect(v.modes).toEqual(v1.modes);
        expect(v.scenes.map((s) => s.id).sort()).toEqual(
          [
            ...v1.scenes.map((s) => s.id),
            ...(v.scenes.some((s) => s.id === 'recap-courte') ? ['recap-courte'] : []),
          ].sort(),
        );
        // fidélité : chaque chaîne affichée ou dite vient du livre, octet pour octet
        const book = strings(sansParties(L));
        const { ar, fr, cles } = videoStrings(v);
        for (const s of ar) expect(fromBook(s, book), `arabe hors du livre : ${s}`).toBe(true);
        for (const s of fr) expect(frFromBook(s, book), `français hors du livre : ${s}`).toBe(true);
        for (const k of cles) expect(k).toMatch(/^vv\.[a-z_]+$/);
        // garde coranique INCHANGÉE : aucun texte dit en v2 qui ne l'était pas en v1 (même projection, mêmes audios)
        const dits1 = new Set(videoVoix(v1));
        for (const s of videoVoix(v)) expect(dits1.has(s), `dit en plus en v2 : ${s}`).toBe(true);
        expect(v.signalements).toEqual(v1.signalements);
        // chapitres : chaque scène en a un, dans l'ordre de la liste fixe, dans chaque mode ; « Retenir » en dernier
        for (const s of v.scenes) expect(CHAPITRES).toContain(s.chapitre);
        for (const m of v.modes) {
          const scs =
            m === 'lettre'
              ? v.lettres.flatMap((_, i) => scenesDuMode(v, m, i))
              : scenesDuMode(v, m);
          const rangs = scs.map((s) => CHAPITRES.indexOf(s.chapitre!));
          if (m !== 'lettre')
            rangs.forEach((r, i) =>
              expect(r, `${m} ${scs[i]!.id}`).toBeGreaterThanOrEqual(rangs[i - 1] ?? 0),
            );
          if (scs.some((s) => s.chapitre === 'retenir'))
            expect(scs.at(-1)!.chapitre, m).toBe('retenir');
        }
        expect(chapitreDe({ id: 'courte-mots', part: 'resume' })).toBe('comprendre');
        // version courte : ordre du livre (lettres et vedette, puis la lecture, puis les mots), récapitulatif à la fin
        if (v.modes.includes('courte')) {
          const c = scenesDuMode(v, 'courte');
          const ids = c.map((s) => s.id);
          const im = ids.indexOf('courte-mots');
          if (im >= 0)
            for (const id of ['courte-lettres', 'courte-vedette', 'vedette', 'phrases', 'ligne'])
              if (ids.includes(id)) expect(ids.indexOf(id), id).toBeLessThan(im);
          const r = c.find((s) => s.id === 'recap-courte');
          if (r) {
            expect(c.at(-1)!.id).toBe('recap-courte');
            // il ne reprend que des textes déjà montrés par la version courte (mêmes objets : voix déjà décidée)
            const avant = new Set(
              strings(c.filter((s) => s !== r).map((s) => s.temps)).map((s) => s),
            );
            for (const s of strings(r.temps).filter((x) => /[ء-ي]/.test(x)))
              expect(avant.has(s), `récapitulatif : ${s}`).toBe(true);
          }
        }
        // aucune scène muette quand un texte affiché a son fichier audio, dans chaque mode
        expect(scenesMuettes(v, hasAudioDe(LIVRE)).nonDit).toEqual([]);
        // durées toujours dans les bornes (l'estimation du lecteur suit ensuite les audios réels)
        if (v.modes.includes('courte'))
          expect(dureeMode(v, 'courte')).toBeLessThanOrEqual(COURTE_MAX_MS + 3000);
      });
    }

    it.skipIf(!process.env.VIDEO_AUDIT)(
      'audit : tableau des unités, audios manquants, textes gardés',
      () => {
        const lignes = [
          `# Vidéos vivantes — ${LIVRE} (audit généré par \`VIDEO_AUDIT=1\`)`,
          '',
          `Audio : ${audios.get(LIVRE) ? `${audios.get(LIVRE)!.size} fichiers du niveau (${LISTE})` : 'liste absente'}.`,
          '',
          '| Unité | Type | Modes | Scènes | Longue | Courte | Quiz (exercices) | Gardés sans voix | Sans audio (à écouter / tous) |',
          '|---|---|---|---|---|---|---|---|---|',
        ];
        const details: string[] = [];
        for (const f of FILES) {
          const { v } = video(LIVRE, f);
          const min = (ms: number) => `${Math.round(ms / 1000)} s`;
          lignes.push(
            `| ${f.slice(0, 3)} | ${v.type}${v.numero ? ` ${v.numero}` : ''} | ${v.modes.join(', ')} | ${v.scenes.length} | ${min(dureeMode(v, 'longue'))} | ${v.modes.includes('courte') ? min(dureeMode(v, 'courte')) : '—'} | ${scenesDuMode(v, 'quiz').length} | ${v.signalements.length} | ${v.sansSon.filter((x) => ['lettres', 'lecture', 'mots', 'dialogue', 'resume'].includes(x.part)).length} / ${v.sansSon.length} |`,
          );
          details.push(`## ${f.slice(0, 3)}`, '');
          const mu = scenesMuettes(v, hasAudioDe(LIVRE));
          if (mu.sansAudio.length) {
            details.push(
              'Scènes sans aucune voix (aucun texte affiché n’a de fichier audio ; elles passent sans attente de son) :',
              '',
            );
            for (const x of mu.sansAudio) details.push(`- ${x}`);
            details.push('');
          }
          if (v.signalements.length) {
            details.push('Textes gardés sans voix :', '');
            for (const s of v.signalements) details.push(`- ${s.raison} : ${s.texte}`);
            details.push('');
          }
          // essentiels : ce que le livre fait écouter (noms, syllabes, lecture, mots, dialogue) ; les autres sont des
          // mots d'exercices ou du cahier, rarement enregistrés
          const ESSENTIEL = new Set(['lettres', 'lecture', 'mots', 'dialogue', 'resume']);
          for (const [titre, liste] of [
            [
              'Textes à écouter du livre sans fichier audio (affichés en silence)',
              v.sansSon.filter((x) => ESSENTIEL.has(x.part)),
            ],
            [
              'Mots d’exercices et du cahier sans fichier audio',
              v.sansSon.filter((x) => !ESSENTIEL.has(x.part)),
            ],
          ] as const) {
            if (!liste.length) continue;
            details.push(`${titre} :`, '');
            for (const s of liste)
              details.push(
                `- ${s.part} : ${s.texte}${tousFichiers.has(audioFileId(s.texte) ?? '') ? ' (fichier présent pour un autre niveau)' : ''}`,
              );
            details.push('');
          }
        }
        const out = join(import.meta.dirname, '..', '..', '..', 'reports');
        mkdirSync(out, { recursive: true });
        writeFileSync(
          join(out, `video-vivante-${LIVRE}.md`),
          [...lignes, '', ...details].join('\n') + '\n',
        );
      },
    );
  });

describe.skipIf(!HAS_CONTENT || !LIVRES.includes('ad2'))(
  'vidéos vivantes : formats des livres de la phrase',
  () => {
    it('Adultes 2, leçon 1 : mots-clés, phrase vedette (au début de la courte), dialogue, « À retenir », lexique', () => {
      const { v } = video('ad2', 'l01.js');
      expect(v.modes).not.toContain('lettre');
      expect(v.scenes.map((s) => s.id)).toEqual(
        expect.arrayContaining(['motscles', 'vedette', 'lexique', 'dialogue', 'recap', 'jouer']),
      );
      expect(
        scenesDuMode(v, 'courte')
          .map((s) => s.id)
          .slice(0, 3),
      ).toEqual(['ouverture', 'courte-vedette', 'courte-mots']);
      expect(v.scenes.find((s) => s.id === 'vedette')!.titre).toEqual({ cle: 'vv.vedette_phrase' });
      expect(v.scenes.find((s) => s.id === 'recap')!.titre).toEqual({ cle: 'vv.retenir' });
      expect(v.scenes.find((s) => s.id === 'recap')!.temps.every((x) => x.k === 'retenir')).toBe(
        true,
      );
    });
    it('mots-clés seulement pour une liste de mots ; les syllabes d’Adultes 1 restent des syllabes', () => {
      for (const f of fichiers('ad2')) {
        const { v, L } = video('ad2', f);
        if ((L.lecture as { syllabes?: unknown[] } | undefined)?.syllabes?.length)
          expect(
            v.scenes.some((s) => s.id === 'motscles'),
            f,
          ).toBe(true);
        expect(
          v.scenes.some((s) => s.id === 'syllabes'),
          f,
        ).toBe(false);
      }
      for (const u of ['l01', 'l09', 'l10', 'l13', 'l14', 'l18', 'l19', 'l20'])
        expect(
          video('ad1', `${u}.js`).v.scenes.some((s) => s.id === 'syllabes'),
          u,
        ).toBe(true);
      expect(motsCles([])).toBe(false);
    });
  },
);
describe.skipIf(!HAS_CONTENT)('vidéos vivantes : garde de tous les niveaux proposés', () => {
  it.skipIf(!tanzil)(
    'garde vidéo à jour : citations du Coran (4 mots, hors formules) et textes de récitation de la lecture',
    () => {
      const flagged = new Set<string>();
      const recit = new Set<string>();
      for (const LIVRE of LIVRES)
        for (const f of fichiers(LIVRE)) {
          const L = studentProjection(raw(LIVRE, f), LIVRE) as Record<string, unknown>;
          const v = buildVideo(L, {
            unitId: f,
            hasAudio: () => true,
            garde: new Set(),
            recitation: new Set(),
          });
          for (const s of videoVoix(v)) if (cite(s)) flagged.add(gardeVideoKey(s));
          for (const s of citationsAvecRef(sansParties(L))) flagged.add(gardeVideoKey(s));
          // et TOUTES les chaînes de la lecture ; celles qui présentent un ou plusieurs versets entiers sont des textes de
          // récitation : leurs morceaux (« mot à mot ») n'ont jamais de voix
          for (const s of strings((L as { lecture?: unknown }).lecture)) {
            if (cite(s)) flagged.add(gardeVideoKey(s));
            if (!looksQuranic(s) && versetsEntiers.has(skeleton(unmark(s))))
              recit.add(gardeVideoKey(s));
          }
        }
      const want = [...flagged].sort().join(' ');
      const wantR = [...recit].sort().join(' ');
      if (process.env.VIDEO_GARDE === 'ecrire') {
        const p = new URL('../src/video-garde.ts', import.meta.url);
        writeFileSync(
          p,
          readFileSync(p, 'utf8')
            .replace(/export const VIDEO_GARDE =[^;]*;/, `export const VIDEO_GARDE =\n  '${want}';`)
            .replace(
              /export const VIDEO_RECITATION =[^;]*;/,
              `export const VIDEO_RECITATION =\n  '${wantR}';`,
            ),
        );
        return;
      }
      const tri = (x: string) => x.split(' ').filter(Boolean).sort().join(' ');
      expect(tri(VIDEO_GARDE), 'VIDEO_GARDE=ecrire').toBe(want);
      expect(tri(VIDEO_RECITATION), 'VIDEO_GARDE=ecrire').toBe(wantR);
    },
    300_000,
  );
});

describe('vidéos vivantes : réglage du rythme par public (données du niveau)', () => {
  it('adultes inchangés ; enfants plus lents, plus grands, pause plus longue ; ados proches des adultes', () => {
    const ad = profilVideo('ad7');
    expect(ad).toEqual({ rythme: 1, taille: 1, pause: 1.3 });
    for (const n of ['en1', 'en5']) {
      const en = profilVideo(n);
      expect(en.rythme).toBeGreaterThan(ad.rythme);
      expect(en.taille).toBeGreaterThan(ad.taille);
      expect(en.pause).toBeGreaterThan(ad.pause);
    }
    const ado = profilVideo('ado3');
    expect(ado.rythme).toBeGreaterThanOrEqual(ad.rythme);
    expect(ado.rythme).toBeLessThan(profilVideo('en2').rythme);
    expect(ado.taille).toBeLessThanOrEqual(1.05);
    // un niveau inconnu retombe sur le réglage des adultes ; chaque public proposé a un réglage
    expect(profilVideo('xx9')).toEqual(ad);
    for (const n of VIDEO_NIVEAUX) expect(VIDEO_PROFILS[n.replace(/\d+$/, '')], n).toBeDefined();
  });
});
