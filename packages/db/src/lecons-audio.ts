/**
 * Audio des leçons (chantier A3) — import IDEMPOTENT des fichiers de synthèse vocale produits pour les livres
 * (`audio/gen-audio.ps1` du moteur des livres : `index.js` + `<sha1>.mp3`) vers le stockage servi par l'API
 * (volume « audio_lecons », lecture seule pour l'API).
 *
 * Contrôles : clé = `audioKey` du moteur des livres et nom du fichier = SHA-1 de la clé ; fichier présent,
 * MP3 lisible et durée non nulle ; GARDE CORANIQUE : un texte qui est un extrait du Coran (signes du Muṣḥaf,
 * ou au moins 3 mots retrouvés dans le texte Tanzil) ou qui en cite au moins 5 mots consécutifs (hadith,
 * invocation) n'est JAMAIS importé — le Coran ne s'écoute que dans
 * les récitations du Complexe. Un fichier déjà en place et identique n'est pas recopié ; un fichier qui n'est
 * plus dans l'index est retiré. Le manifeste est écrit en dernier (remplacement atomique).
 */
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  audioKey,
  containsQuranRun,
  isQuranExcerpt,
  looksQuranic,
  quranCorpus,
  quranRuns,
  sha1Hex,
} from '@awform/content/audio-cle';
import { probeMp3 } from './audio/probe.js';

export const LECONS_AUDIO_MANIFEST = 'manifeste.json';

export interface LeconsAudioFile {
  /** octets */
  o: number;
  /** durée (ms) */
  d: number;
  /** empreinte SHA-256 du fichier (16 premiers caractères hexadécimaux) : ETag */
  e: string;
  /** voix (« wavenet-a », « wavenet-b », « humain »…) */
  v: string;
  /** niveaux où le texte est « à écouter » */
  n: string[];
  /** provisoire (synthèse non relue) ou valide (voix humaine ou synthèse validée) */
  s: 'provisoire' | 'valide';
}

export interface LeconsAudioManifest {
  format: 1;
  genere: string;
  /** mention affichée près du bouton : « voix de synthèse (provisoire) » */
  mention: string;
  /** crédits des voix employées */
  credits: string[];
  fichiers: Record<string, LeconsAudioFile>;
  /** textes écartés par la garde coranique (SHA-1) */
  coraniques: string[];
}

export interface LeconsAudioReport {
  index: number;
  importes: number;
  copies: number;
  inchanges: number;
  retires: number;
  coraniques: number;
  absents: string[];
  illisibles: string[];
  incoherents: string[];
  horsNiveaux: number;
  parNiveau: Record<string, { fichiers: number; octets: number }>;
}

const CREDITS: Record<string, string> = {
  google: 'Voix : Google Cloud Text-to-Speech',
  azure: 'Voix : Microsoft Azure AI Speech',
};

/** Lit `index.js` du moteur des livres : clé → fichier, et clé → informations (source, statut, niveaux). */
export function readBooksAudioIndex(js: string): {
  index: Record<string, string>;
  info: Record<string, { src?: string; statut?: string; niv?: string }>;
} {
  const block = (name: string) => {
    const i = js.indexOf(`${name}={`);
    if (i < 0) return {};
    const start = i + name.length + 1;
    const end = js.indexOf('\n};', start);
    return JSON.parse(js.slice(start, end < 0 ? undefined : end + 2)) as Record<string, never>;
  };
  return { index: block('AW.audioIndex'), info: block('AW.audioInfo') };
}

export function readLeconsManifest(dir: string): LeconsAudioManifest | null {
  try {
    return JSON.parse(
      readFileSync(join(dir, LECONS_AUDIO_MANIFEST), 'utf8'),
    ) as LeconsAudioManifest;
  } catch {
    return null;
  }
}

export function importLeconsAudio(o: {
  source: string;
  dest: string;
  /** texte des versets (Tanzil, ordre du Muṣḥaf) pour la garde coranique */
  verses: ReadonlyArray<string>;
  /** niveaux à importer (tous par défaut) */
  niveaux?: ReadonlyArray<string>;
  now?: Date;
}): LeconsAudioReport {
  if (o.verses.length === 0) throw new Error('texte du Coran absent : garde coranique impossible');
  const { index, info } = readBooksAudioIndex(readFileSync(join(o.source, 'index.js'), 'utf8'));
  const corpus = quranCorpus(o.verses);
  const runs = quranRuns(o.verses);
  const before = readLeconsManifest(o.dest);
  mkdirSync(o.dest, { recursive: true });
  const want = o.niveaux?.length ? new Set(o.niveaux) : null;
  const r: LeconsAudioReport = {
    index: Object.keys(index).length,
    importes: 0,
    copies: 0,
    inchanges: 0,
    retires: 0,
    coraniques: 0,
    absents: [],
    illisibles: [],
    incoherents: [],
    horsNiveaux: 0,
    parNiveau: {},
  };
  const fichiers: Record<string, LeconsAudioFile> = {};
  const coraniques: string[] = [];
  const providers = new Set<string>();
  for (const [key, path] of Object.entries(index)) {
    const sha = /([0-9a-f]{40})\.mp3$/.exec(path)?.[1];
    if (!sha || audioKey(key) !== key || sha1Hex(key) !== sha) {
      r.incoherents.push(sha ?? path);
      continue;
    }
    const inf = info[key] ?? {};
    const niv = String(inf.niv ?? '')
      .split(/\s+/)
      .filter(Boolean);
    if (want && !niv.some((n) => want.has(n))) {
      r.horsNiveaux++;
      continue;
    }
    if (looksQuranic(key) || isQuranExcerpt(key, corpus) || containsQuranRun(key, runs)) {
      coraniques.push(sha);
      continue;
    }
    const src = join(o.source, `${sha}.mp3`);
    if (!existsSync(src) || statSync(src).size === 0) {
      r.absents.push(sha);
      continue;
    }
    const buf = readFileSync(src);
    const probe = probeMp3(buf);
    if (!probe || probe.durationMs <= 0) {
      r.illisibles.push(sha);
      continue;
    }
    const e = createHash('sha256').update(buf).digest('hex').slice(0, 16);
    const dst = join(o.dest, `${sha}.mp3`);
    const prev = before?.fichiers[sha];
    if (prev?.e === e && existsSync(dst) && statSync(dst).size === buf.length) r.inchanges++;
    else {
      copyFileSync(src, `${dst}.part`);
      renameSync(`${dst}.part`, dst);
      r.copies++;
    }
    const s = String(inf.src ?? '');
    const v = s === 'humain' ? 'humain' : s.replace(/^tts-(google|azure)-/, '') || 'inconnue';
    if (s.startsWith('tts-google')) providers.add('google');
    else if (s.startsWith('tts-azure')) providers.add('azure');
    fichiers[sha] = {
      o: buf.length,
      d: Math.round(probe.durationMs),
      e,
      v,
      n: niv,
      s: inf.statut === 'valide' ? 'valide' : 'provisoire',
    };
    r.importes++;
    for (const n of niv) {
      const p = (r.parNiveau[n] ??= { fichiers: 0, octets: 0 });
      p.fichiers++;
      p.octets += buf.length;
    }
  }
  r.coraniques = coraniques.length;
  const manifest: LeconsAudioManifest = {
    format: 1,
    genere: (o.now ?? new Date()).toISOString(),
    mention: 'voix de synthèse (provisoire)',
    credits: [...providers].sort().map((p) => CREDITS[p]!),
    fichiers,
    coraniques: coraniques.sort(),
  };
  const tmp = join(o.dest, `${LECONS_AUDIO_MANIFEST}.part`);
  writeFileSync(tmp, JSON.stringify(manifest));
  renameSync(tmp, join(o.dest, LECONS_AUDIO_MANIFEST));
  // fichiers qui ne sont plus dans l'index (ou écartés) : retirés APRÈS le nouveau manifeste
  for (const f of readdirSync(o.dest)) {
    const m = /^([0-9a-f]{40})\.mp3(\.part)?$/.exec(f);
    if (m && (m[2] || !fichiers[m[1]!])) {
      unlinkSync(join(o.dest, f));
      r.retires++;
    }
  }
  return r;
}
