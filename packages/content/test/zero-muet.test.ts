/**
 * Test « zéro muet » (25/10/2026) — exigence du client : « Rien dans notre appli ne reste muet. Soit c'est récité par
 * Ayyūb, soit c'est lu par notre voix de synthèse. » (`DECISION_ZERO_MUET.md`, `referent-373-DECISIONS.md`)
 *
 * Pour chaque texte « à écouter » des livres d'Adultes (vidéos vivantes : textes qui seraient dits, y compris ceux que
 * la garde garde sans voix) et des cahiers (cahier de lecture, cahier « Je parle »), il faut :
 *   1. un fichier audio dans l'index des audios des leçons (`liste.csv`, au niveau du livre ou du cahier), OU
 *   2. une RÉCITATION d'Ayyūb BRANCHÉE (26/10/2026) : le texte est dans la table de l'application
 *      (`apps/web/static/recitation/ayyub.json`, générée et contrôlée contre Tanzil par `test/recitation-ayyub.test.ts`) :
 *      verset(s) d'Ayyūb, et pour un texte mixte la synthèse de la partie non coranique (« sonorisé par Ayyūb ») ; OU
 *   3. un DOUTE remis au référent (`data/zero-muet/doutes-ayyub.tsv` : rapprochement ambigu, jamais branché au hasard),
 *      compté à part.
 * Tout autre texte est MUET sans solution prévue : le test échoue et LISTE ce qui manque.
 *
 * Il lit la copie des livres (`~/awform-content`) et la liste des audios (`~/lecons-audio/liste.csv`) : sans elles, il
 * est ignoré (comme les tests des vidéos). `ZERO_MUET_RAPPORT=1` écrit `reports/zero-muet.md`.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { audioFileId, audioKey, looksQuranic } from '../src/audio-cle.js';
import { buildVideo } from '../src/video.js';
import { VIDEO_NIVEAUX } from '../src/video-niveaux.js';
import { parseDataFile, studentProjection } from '../src/index.js';
import { CONTENT_DIR, HAS_CONTENT } from './helpers.js';

const BOM = new RegExp(`^${String.fromCharCode(0xfeff)}`);
const DATA = join(import.meta.dirname, '..', 'data', 'zero-muet');
const STATIC = join(import.meta.dirname, '..', '..', '..', 'apps', 'web', 'static', 'cahier-data');
const LISTE = process.env.AWFORM_LECONS_AUDIO_LISTE ?? join(homedir(), 'lecons-audio', 'liste.csv');

/** fichiers audio de la liste : sha1 → niveaux */
const fichiers = new Map<string, Set<string>>();
if (existsSync(LISTE))
  for (const l of readFileSync(LISTE, 'utf8').split('\n').slice(1)) {
    const c = l.split(';');
    if (c.length < 6) continue;
    fichiers.set(c[0]!.replace(BOM, ''), new Set((c[5] ?? '').split(' ').filter(Boolean)));
  }

/** un texte « à écouter » : où il est, ce qu'il est */
interface Cible {
  /** livre ou cahier */
  ou: string;
  /** unité, partie */
  detail: string;
  texte: string;
  /** niveau (de la liste des audios) où le fichier doit être */
  niveau: string;
}

/**
 * un texte a-t-il son fichier audio, au niveau demandé ? (l'index lui-même : la garde de l'application n'est pas rejouée ici ;
 * les textes en graphie du Muṣḥaf que le client ne joue pas encore sont comptés à part dans le rapport)
 */
const aSonFichier = (texte: string, niveau: string): boolean => {
  const id = audioFileId(texte);
  return !!id && !!fichiers.get(id)?.has(niveau);
};

/** fichiers d'un niveau (liste des audios du niveau, donnée au générateur de vidéos) */
const audiosDe = (niveau: string): string[] =>
  [...fichiers].filter(([, n]) => n.has(niveau)).map(([sha]) => sha);

const STATIC_WEB = join(import.meta.dirname, '..', '..', '..', 'apps', 'web', 'static');
/** clé d'un texte dans la table de récitation (12 premiers chiffres hexadécimaux de son empreinte audio) */
const cleRecitation = (s: string) => (audioFileId(s) ?? '').slice(0, 12);
/** table de récitation de l'application : clé → plan (versets d'Ayyūb, parties de synthèse « t:<empreinte> ») */
function tableRecitation(): Map<string, string[]> {
  const f = join(STATIC_WEB, 'recitation', 'ayyub.json');
  if (!existsSync(f)) return new Map();
  const t = JSON.parse(readFileSync(f, 'utf8')) as { t: Record<string, string[]> };
  return new Map(Object.entries(t.t));
}
/** doutes remis au référent (texte → raison) */
function doutesAyyub(): Set<string> {
  const f = join(DATA, 'doutes-ayyub.tsv');
  return new Set(
    existsSync(f)
      ? readFileSync(f, 'utf8')
          .split('\n')
          .slice(1)
          .filter(Boolean)
          .map((l) => cleRecitation(l.split('\t')[1]!))
      : [],
  );
}

// ———— récitations d'Ayyūb décidées par le référent avant le branchement (clé du texte → d'où vient la décision)
function ayyub(): Map<string, string> {
  const m = new Map<string, string>();
  const table = JSON.parse(readFileSync(join(DATA, 'coran-ayyub-table.json'), 'utf8')) as {
    entrees: Array<{ texte: string }>;
  };
  for (const e of table.entrees) m.set(audioKey(e.texte), 'table');
  // décisions du référent sur les 373 textes, puis textes classés ensuite selon les mêmes règles (à contrôler par le référent)
  for (const f of ['referent-373.tsv', 'ayyub-complement.tsv'])
    for (const l of readFileSync(join(DATA, f), 'utf8').split('\n').slice(1)) {
      const [texte, , decision] = l.split('\t');
      if (texte && ['ayyub', 'mixte', 'ambigu'].includes(decision ?? ''))
        m.set(audioKey(texte), `${f.replace('.tsv', '')} : ${decision}`);
    }
  return m;
}

/**
 * versets entiers classés « Ayyūb » à la main (`ayyub-complement.tsv`) : même si un fichier de synthèse existe (ou a existé), ils
 * attendent Ayyūb, jamais la voix de synthèse (décisions du référent du 25/10/2026, point 1)
 */
function ayyubExplicite(): Set<string> {
  const f = join(DATA, 'ayyub-complement.tsv');
  return new Set(
    readFileSync(f, 'utf8')
      .split('\n')
      .slice(1)
      .filter((l) => l.split('\t')[2] === 'ayyub')
      .map((l) => audioKey(l.split('\t')[0]!)),
  );
}

/** textes dont la solution est une correction du livre (réplique arabe qui cite du français : à corriger avant le gel) */
function aCorriger(): Set<string> {
  const f = join(DATA, 'a-corriger-dans-les-livres.tsv');
  return new Set(
    existsSync(f)
      ? readFileSync(f, 'utf8')
          .split('\n')
          .slice(1)
          .filter(Boolean)
          .map((l) => audioKey(l.split('\t')[0]!))
      : [],
  );
}

/**
 * textes de la voix de synthèse qui n'ont pas encore leur fichier alors que la garde les laisse passer (décision de
 * l'audio : texte jamais généré, ou refusé par une ancienne règle de la chaîne de génération) : liste d'attente EXPLICITE,
 * `data/zero-muet/a-generer-synthese.tsv`. Un texte de cette liste qui a son fichier doit en sortir (test).
 */
function aGenerer(): Set<string> {
  const f = join(DATA, 'a-generer-synthese.tsv');
  return new Set(
    existsSync(f)
      ? readFileSync(f, 'utf8')
          .split('\n')
          .slice(1)
          .filter(Boolean)
          .map((l) => audioKey(l.split('\t')[0]!))
      : [],
  );
}

// ———— textes à écouter
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

/** parties du livre que les vidéos font écouter (audit des vidéos : « Textes à écouter du livre ») */
const ESSENTIEL = new Set(['lettres', 'lecture', 'mots', 'dialogue', 'resume']);

/** Livres d'Adultes : textes que les vidéos vivantes font écouter (sans fichier) ou gardent sans voix (Coran, Basmala…). */
function livres(): Cible[] {
  const out: Cible[] = [];
  // Adultes seulement (comme la décision et le rapport du référent) : les livres Enfants et Ados, proposés en vidéo depuis
  // le 25/10/2026, n'ont pas encore tous leurs audios (leur constat : `reports/video-vivante-<livre>.md`)
  for (const livre of VIDEO_NIVEAUX.filter((n) => /^ad\d+$/.test(n))) {
    const d = join(CONTENT_DIR, 'data', livre);
    if (!existsSync(d)) continue;
    for (const f of readdirSync(d)
      .filter((x) => /^l\d+\.js$/.test(x))
      .sort()) {
      const L = studentProjection(raw(livre, f), livre) as Record<string, unknown>;
      const images = new Set(strings([L.mots, L.exercices]).filter((s) => /^[a-z_]+$/.test(s)));
      // aucun fichier supposé : tous les textes « à écouter » sont listés, puis comparés à la liste des audios
      // comme l'audit des vidéos : le générateur voit les fichiers du niveau ; `sansSon` = textes à écouter sans fichier
      const v = buildVideo(L, {
        unitId: `${livre}.${f.slice(0, 3)}`,
        hasAudio: (s) => aSonFichier(s, livre),
        images,
        audioList: audiosDe(livre),
      });
      const vus = new Set<string>();
      const ajoute = (texte: string, detail: string) => {
        // ponctuation, signes seuls : rien à dire, ce n'est pas un texte « à écouter »
        if (!/[\p{L}\p{N}]/u.test(texte)) return;
        if (vus.has(texte)) return;
        vus.add(texte);
        out.push({ ou: livre, detail: `${f.slice(0, 3)} ${detail}`, texte, niveau: livre });
      };
      // ce que le livre fait écouter (lettres, lecture, mots, dialogue, résumé) ; les mots d'exercices et du cahier ne sont pas « à écouter »
      for (const s of v.sansSon) if (ESSENTIEL.has(s.part)) ajoute(s.texte, s.part);
      for (const s of v.signalements) ajoute(s.texte, `gardé (${s.raison})`);
    }
  }
  return out;
}

interface El {
  ar?: string;
  a?: string;
}
/** Cahier de lecture : chaque élément arabe joué (syllabe, mot, phrase) ; `q` = récitation d'Ayyūb (son propre mécanisme). */
function cahierLecture(): { cibles: Cible[]; recites: number } {
  const out: Cible[] = [];
  let recites = 0;
  // cahiers de lecture : adultes (ad1), enfants (en1) et ados (ado1) ; les fichiers des deux derniers portent le niveau
  // `cahier-lecture-<niveau>` dans la liste des audios
  for (const [n, niveau] of [
    ['ad1', 'ad1'],
    ['en1', 'cahier-lecture-en1'],
    ['ado1', 'cahier-lecture-ado1'],
  ] as const) {
    const f = join(STATIC, `${n}.json`);
    if (!existsSync(f)) continue;
    const ou = `cahier de lecture ${n}`;
    const walk = (x: unknown, page: string): void => {
      if (Array.isArray(x)) return x.forEach((y) => walk(y, page));
      if (!x || typeof x !== 'object') return;
      const o = x as El & Record<string, unknown>;
      if (typeof o.ar === 'string' && typeof o.a === 'string' && /[ء-ي]/.test(o.ar)) {
        if (o.a === 'q') recites++;
        else out.push({ ou, detail: page, texte: o.ar, niveau });
      }
      // texte suivi (lignes d'un paragraphe) : ecite = lignes qui citent le Coran (récitation d'Ayyūb)
      if (Array.isArray(o.lignes) && typeof o.a === 'string') {
        const recite = (o.recite ?? {}) as Record<string, string>;
        for (const l of o.lignes as unknown[]) {
          if (typeof l !== 'string' || !/[ء-ي]/.test(l)) continue;
          if (o.a === 'q' || l in recite) recites++;
          else out.push({ ou, detail: page, texte: l, niveau });
        }
      }
      for (const [k, y] of Object.entries(o)) if (k !== 'ar' && k !== 'lignes') walk(y, page);
    };
    const c = JSON.parse(readFileSync(f, 'utf8')) as {
      pages?: Array<{
        id: string;
        jeu?: {
          construis: Array<{ ar: string }>;
          trouve: Array<{ choix: string[] }>;
          signes: Array<{ ar: string }>;
          colorie?: { cases: Array<{ ar: string }> };
        };
      }>;
    };
    for (const p of c.pages ?? []) {
      walk(p, p.id);
      // jeux de fin de grille (enfants, ados) : chaque mot et chaque syllabe qu'ils font entendre a son fichier
      const j = p.jeu;
      if (j)
        for (const texte of [
          ...j.construis.map((m) => m.ar),
          ...j.trouve.flatMap((m) => m.choix),
          ...j.signes.map((s) => s.ar),
          ...(j.colorie?.cases.map((x) => x.ar) ?? []),
        ])
          out.push({ ou: `${ou} (jeux)`, detail: p.id, texte, niveau });
    }
  }
  return { cibles: out, recites };
}

/**
 * Cahiers « Je parle » (adultes 2 à 10, enfants 2 à 5, ados 2 à 4 : un fichier `parler-<niveau>.json` par niveau) :
 * phrases (toutes leurs formes), répliques, phrase du jour, lignes d'antisèche. Le fichier audio d'un texte est dans la liste
 * des audios au niveau du livre (`ad3`, `en2`, `ado4`…).
 */
function cahierParler(): Cible[] {
  const out: Cible[] = [];
  const fichiersParler = existsSync(STATIC)
    ? readdirSync(STATIC)
        .filter((x) => /^parler-[a-z]+\d+\.json$/.test(x))
        .sort()
    : [];
  for (const nom of fichiersParler) {
    const niveau = nom.slice('parler-'.length, -'.json'.length);
    const d = JSON.parse(readFileSync(join(STATIC, nom), 'utf8')) as {
      phrases: Record<string, { ar: string; f?: Array<{ ar: string }> }>;
      conversations: Record<string, { r: Array<{ ar: string }> }>;
      etapes: Array<{ id: string; jour?: { ar: string }; antiseche?: Array<[string, string]> }>;
    };
    const ajoute = (texte: string | undefined, detail: string) => {
      if (texte && /[ء-ي]/.test(texte))
        out.push({ ou: `cahier « Je parle » ${niveau}`, detail, texte, niveau });
    };
    for (const [id, p] of Object.entries(d.phrases)) {
      ajoute(p.ar, `phrase ${id}`);
      for (const g of p.f ?? []) ajoute(g.ar, `phrase ${id}`);
    }
    for (const [id, c] of Object.entries(d.conversations))
      for (const r of c.r) ajoute(r.ar, `conversation ${id}`);
    for (const e of d.etapes) {
      ajoute(e.jour?.ar, `étape ${e.id}`);
      for (const [ar] of e.antiseche ?? []) ajoute(ar, `antisèche ${e.id}`);
    }
  }
  return out;
}

describe('zéro muet : la ponctuation n’est pas un texte à écouter', () => {
  it('un texte sans lettre ni chiffre (« · », « … », « ← ») n’est jamais listé sans fichier audio', () => {
    const lecon = {
      type: 'lecon',
      lecture: {
        phrases: [{ ar: '·' }, { ar: '…' }, { ar: '←' }, { ar: 'بَابٌ كَبِيرٌ' }],
      },
    };
    const v = buildVideo(lecon, { unitId: 't', hasAudio: () => false });
    const textes = v.sansSon.map((s) => s.texte);
    expect(textes.some((t) => /[ء-ي]/.test(t))).toBe(true);
    for (const t of textes) expect(/[\p{L}\p{N}]/u.test(t), t).toBe(true);
  });
});

describe('zéro muet : les 16 cahiers « Je parle » sont couverts par le test', () => {
  it('adultes 2 à 10, enfants 2 à 5 et ados 2 à 4 : chaque niveau a ses textes à écouter', () => {
    const attendus = [
      ...['ad2', 'ad3', 'ad4', 'ad5', 'ad6', 'ad7', 'ad8', 'ad9', 'ad10'],
      ...['en2', 'en3', 'en4', 'en5'],
      ...['ado2', 'ado3', 'ado4'],
    ];
    const cibles = cahierParler();
    expect([...new Set(cibles.map((c) => c.niveau))].sort()).toEqual([...attendus].sort());
    // phrases, répliques, phrases du jour et antisèches : des centaines de textes par niveau
    for (const n of attendus)
      expect(cibles.filter((c) => c.niveau === n).length, n).toBeGreaterThan(100);
  });
});
describe.skipIf(!HAS_CONTENT || fichiers.size === 0)(
  'zéro muet : tout texte à écouter a une voix',
  () => {
    it('chaque texte à écouter des livres d’Adultes et des cahiers a son audio, ou sa récitation d’Ayyūb', () => {
      const decidees = ayyub();
      const explicites = ayyubExplicite();
      const table = tableRecitation();
      const doutes = doutesAyyub();
      const recitee = (t: string) => table.has(cleRecitation(t));
      const corrections = aCorriger();
      const attenteSynthese = aGenerer();
      const lecture = cahierLecture();
      const toutes = [...livres(), ...lecture.cibles, ...cahierParler()];
      const uniques = new Map<string, Cible>();
      for (const c of toutes) {
        const k = `${c.niveau}|${audioKey(c.texte)}`;
        if (!uniques.has(k)) uniques.set(k, c);
      }
      const voixOk: Cible[] = [];
      const parAyyub: Cible[] = [];
      const auReferent: Cible[] = [];
      const dansLesLivres: Cible[] = [];
      const aSynthetiser: Cible[] = [];
      const muets: Cible[] = [];
      for (const c of uniques.values()) {
        // verset entier réservé à Ayyūb : la récitation, jamais la synthèse (même si un fichier a existé)
        if (explicites.has(audioKey(c.texte)) && recitee(c.texte)) parAyyub.push(c);
        else if (explicites.has(audioKey(c.texte))) muets.push(c);
        else if (aSonFichier(c.texte, c.niveau)) voixOk.push(c);
        else if (recitee(c.texte)) parAyyub.push(c);
        else if (doutes.has(cleRecitation(c.texte))) auReferent.push(c);
        else if (corrections.has(audioKey(c.texte))) dansLesLivres.push(c);
        else if (attenteSynthese.has(audioKey(c.texte))) aSynthetiser.push(c);
        else muets.push(c);
      }
      // outillage (hors test) : toutes les cibles avec l'état de leur fichier, pour le classement des textes sans solution
      if (process.env.ZERO_MUET_DUMP)
        writeFileSync(
          process.env.ZERO_MUET_DUMP,
          JSON.stringify(
            [...uniques.values()].map((c) => ({
              ...c,
              id: audioFileId(c.texte),
              niveauxFichier: [...(fichiers.get(audioFileId(c.texte) ?? '') ?? [])],
              ok: aSonFichier(c.texte, c.niveau),
              ayyub: table.get(cleRecitation(c.texte)) ?? decidees.get(audioKey(c.texte)) ?? null,
            })),
            null,
            1,
          ),
        );
      const ligne = (c: Cible) =>
        `${c.ou} · ${c.detail} : ${c.texte.replace(/\s+/g, ' ').slice(0, 140)}`;
      const rapport = [
        '# Zéro muet — rapport du test',
        '',
        `Textes à écouter (uniques par niveau) : ${uniques.size}`,
        `- avec un fichier audio : ${voixOk.length}`,
        `  dont graphie du Muṣḥaf, non jouée par le client (audioIdFor) : ${voixOk.filter((c) => looksQuranic(c.texte)).length}`,
        `- sonorisés par Ayyūb (récitation branchée, table contrôlée contre Tanzil) : ${parAyyub.length}`,
        `  dont mixtes (synthèse pour la partie non coranique) : ${parAyyub.filter((c) => table.get(cleRecitation(c.texte))!.some((x) => x.startsWith('t:'))).length}`,
        `- doutes remis au référent (rapprochement ambigu, non branché) : ${auReferent.length}`,
        `- à corriger dans les livres avant le gel (réplique arabe qui cite du français, cas b) : ${dansLesLivres.length}`,
        `- voix de synthèse À GÉNÉRER (garde levée, fichier absent, liste d’attente explicite) : ${aSynthetiser.length}`,
        `- cahier de lecture : éléments récités par Ayyūb (mécanisme propre) : ${lecture.recites}`,
        `- MUETS sans solution prévue : ${muets.length}`,
        '',
        '## Muets sans solution prévue',
        ...muets.map((c) => `- ${ligne(c)}`),
        '',
        '## Doutes remis au référent',
        ...auReferent.map((c) => `- ${ligne(c)}`),
        '',
        '## Sonorisés par Ayyūb',
        ...parAyyub.map((c) => `- ${ligne(c)} → ${table.get(cleRecitation(c.texte))!.join(' ')}`),
        '',
        '## Voix de synthèse à générer (liste d’attente)',
        ...aSynthetiser.map((c) => `- ${ligne(c)}`),
        '',
        '## À corriger dans les livres',
        ...dansLesLivres.map((c) => `- ${ligne(c)}`),
        '',
      ].join('\n');
      if (process.env.ZERO_MUET_RAPPORT) {
        const out = join(import.meta.dirname, '..', '..', '..', 'reports');
        mkdirSync(out, { recursive: true });
        writeFileSync(join(out, 'zero-muet.md'), rapport);
      }
      console.log(
        `zéro muet : ${uniques.size} textes ; audio ${voixOk.length} ; sonorisés par Ayyūb ${parAyyub.length} ; doutes au référent ${auReferent.length} ; à corriger dans les livres ${dansLesLivres.length} ; muets ${muets.length}`,
      );
      expect(
        voixOk.filter((c) => attenteSynthese.has(audioKey(c.texte))).map(ligne),
        'texte de a-generer-synthese.tsv qui a maintenant son audio : le retirer de la liste',
      ).toEqual([]);
      expect(muets.map(ligne), 'textes muets sans audio ni récitation prévue').toEqual([]);
    }, 300_000);
  },
);
