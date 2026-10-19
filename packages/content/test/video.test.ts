/**
 * Vidéos vivantes (19/10/2026) : générateur de scènes `buildVideo` sur les 25 unités d'Adultes 1 (projection
 * élève, comme l'application) — fidélité octet pour octet, modes, durées, garde coranique et Basmala, audit
 * des audios. `VIDEO_GARDE=ecrire` régénère `src/video-garde.ts` ; `VIDEO_AUDIT=1` écrit
 * `reports/video-vivante-ad1.md` (tableau des unités, audios manquants, textes gardés sans voix).
 */
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  COURTE_MAX_MS,
  COURTE_MIN_MS,
  LETTRE_MAX_MS,
  LETTRE_MIN_MS,
  VIDEO_MODES,
  buildVideo,
  dureeMode,
  gardeVideoKey,
  motExemple,
  ordreDe,
  phrasesFr,
  scenesDuMode,
  videoStrings,
  videoVoix,
  type VideoLecon,
} from '../src/video.js';
import { VIDEO_GARDE } from '../src/video-garde.js';
import {
  audioFileId,
  containsQuranRun,
  isQuranExcerpt,
  looksQuranic,
  quranCorpus,
  quranRuns,
  sayText,
  skeleton,
} from '../src/audio-cle.js';
import { loadTanzil, parseDataFile, studentProjection } from '../src/index.js';
import { CONTENT_DIR, HAS_CONTENT } from './helpers.js';

const LIVRE = 'ad1';
const DIR = join(CONTENT_DIR, 'data', LIVRE);
const FILES = existsSync(DIR)
  ? readdirSync(DIR)
      .filter((f) => /^l\d+\.js$/.test(f))
      .sort()
  : [];
const TSV = join(CONTENT_DIR, 'coran', 'tanzil-uthmani.tsv');
/** marque d'ordre des octets en tête de la liste (écrite par PowerShell) */
const BOM = new RegExp(`^${String.fromCharCode(0xfeff)}`);
/** liste des fichiers audio des leçons (import `lecons-audio`) : sha1;voix;source;statut;caracteres;niveaux;texte */
const LISTE = process.env.AWFORM_LECONS_AUDIO_LISTE ?? join(homedir(), 'lecons-audio', 'liste.csv');
const audioAd1 = existsSync(LISTE)
  ? new Set(
      readFileSync(LISTE, 'utf8')
        .split('\n')
        .slice(1)
        .map((l) => l.split(';'))
        .filter((c) => (c[5] ?? '').split(' ').includes(LIVRE))
        .map((c) => c[0]!.replace(BOM, '')),
    )
  : null;
/** tous les fichiers de la liste, tous niveaux (audit : texte enregistré pour un autre niveau) */
const tousFichiers = existsSync(LISTE)
  ? new Set(
      readFileSync(LISTE, 'utf8')
        .split('\n')
        .slice(1)
        .map((l) => l.split(';')[0]!.replace(BOM, '')),
    )
  : new Set<string>();
/** comme l'application (`audioIdFor`) : fichier du niveau, jamais pour un texte aux signes du Muṣḥaf */
const hasAudio = (s: string) =>
  audioAd1 ? !looksQuranic(s) && audioAd1.has(audioFileId(s) ?? '') : true;

const raw = (f: string) =>
  parseDataFile(readFileSync(join(DIR, f), 'utf8'), f).value as Record<string, unknown>;
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
const verses = tanzil ? [...tanzil.values()] : [];
const corpus = tanzil ? quranCorpus(verses) : '';
const runs4 = tanzil ? quranRuns(verses, 4) : new Set<string>();
const cite = (s: string) => isQuranExcerpt(s, corpus) || containsQuranRun(s, runs4, 4);

const videos = new Map<string, { v: VideoLecon; L: Record<string, unknown> }>();
const video = (f: string) => {
  if (!videos.has(f)) {
    const L = studentProjection(raw(f), LIVRE) as Record<string, unknown>;
    const v = buildVideo(L, {
      unitId: `${LIVRE}.${f.slice(0, 3)}`,
      hasAudio,
      images: imagesDe(L),
      audioList: audioAd1 ? [...audioAd1] : [],
    });
    videos.set(f, { v, L });
  }
  return videos.get(f)!;
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

describe('vidéos vivantes : garde coranique et Basmala', () => {
  const c = String.fromCharCode;
  // بِسْمِ اللَّهِ (codes : la source des tests n'écrit pas non plus le texte)
  const bismi = c(0x628, 0x650, 0x633, 0x652, 0x645, 0x650);
  const allahi = c(0x627, 0x644, 0x644, 0x651, 0x64e, 0x647, 0x650);
  const basmala = `${bismi} ${allahi}`;
  const lecon = (phrase: Record<string, unknown>) => ({
    type: 'lecon',
    lecture: { phrases: [phrase] },
  });
  const voix = (L: unknown) =>
    videoVoix(buildVideo(L, { unitId: 't', hasAudio: () => true, garde: new Set() }));
  it('Basmala sans marque « formule de dhikr » : aucune voix, et signalée', () => {
    const v = buildVideo(lecon({ ar: basmala }), {
      unitId: 't',
      hasAudio: () => true,
      garde: new Set(),
    });
    expect(videoVoix(v)).not.toContain(basmala);
    expect(v.signalements).toEqual([{ texte: basmala, raison: 'basmala' }]);
  });
  it('Basmala marquée « formule de dhikr » (dhikr: true) : voix permise', () => {
    expect(voix(lecon({ ar: basmala, dhikr: true }))).toContain(basmala);
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
});

describe.skipIf(!HAS_CONTENT)('vidéos vivantes : les 25 unités d’Adultes 1', () => {
  it('25 unités (20 leçons, 4 bilans, 1 examen)', () => {
    expect(FILES.length).toBe(25);
    const types = FILES.map((f) => video(f).v.type);
    expect(types.filter((t) => t === 'lecon').length).toBe(20);
    expect(types.filter((t) => t !== 'lecon').length).toBe(5);
  });

  for (const f of FILES) {
    it(`${f} : modes proposés non vides, fidélité au livre, durées, garde`, () => {
      const { v, L } = video(f);
      // modes : au moins la version longue ; aucun mode proposé sans scène ; aucune scène d'un mode non proposé
      expect(v.modes).toContain('longue');
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
      walk(raw(f));
      for (const s of [...ar, ...fr]) expect(tr.has(s), `phonétique : ${s}`).toBe(false);
      expect(JSON.stringify(v)).not.toMatch(/"tr"/);
      // garde : aucune voix sur un texte coranique (Muṣḥaf, Tanzil 3 mots / 4 mots suivis, Basmala)
      for (const s of videoVoix(v)) {
        expect(looksQuranic(s), s).toBe(false);
        expect(
          skeleton(s).includes(
            skeleton(String.fromCharCode(0x628, 0x633, 0x645, 0x20, 0x627, 0x644, 0x644, 0x647)),
          ),
          s,
        ).toBe(false);
        if (tanzil) expect(cite(s), `voix sur une citation du Coran : ${s}`).toBe(false);
      }
      // contexte coranique : aucune voix sur un morceau (même un mot) d'un passage coranique cité par la lecture de
      // l'unité (Fātiḥa mot à mot, sourates 112 à 114…)
      if (tanzil) {
        const norme = (x: string) =>
          ` ${sayText(unmark(x))
            .replace(/[|.,:;!?«»"()…—–=+←،؛؟]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()} `;
        const passages = strings((L as { lecture?: unknown }).lecture)
          .filter((s) => looksQuranic(s) || cite(s))
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
      // « À toi de jouer la scène ! » : à la fin de la version longue quand le dialogue a au moins deux rôles
      const longue = scenesDuMode(v, 'longue');
      if (v.scenes.some((s) => s.id === 'jouer')) expect(longue.at(-1)!.id).toBe('jouer');
    });
  }

  it.skipIf(!tanzil)(
    'garde vidéo à jour : toute citation du Coran (Tanzil) que la vidéo pourrait dire est écartée',
    () => {
      const flagged = new Set<string>();
      for (const f of FILES) {
        const L = studentProjection(raw(f), LIVRE) as Record<string, unknown>;
        const v = buildVideo(L, { unitId: f, hasAudio: () => true, garde: new Set() });
        for (const s of videoVoix(v)) if (cite(s)) flagged.add(gardeVideoKey(s));
        // et TOUTES les chaînes de la lecture (même dites morceau par morceau, « mot à mot ») : un passage coranique
        // cité par la leçon met ses morceaux en contexte coranique (aucune voix sur eux non plus)
        for (const s of strings((L as { lecture?: unknown }).lecture))
          if (cite(s)) flagged.add(gardeVideoKey(s));
      }
      const want = [...flagged].sort().join(' ');
      if (process.env.VIDEO_GARDE === 'ecrire') {
        const p = new URL('../src/video-garde.ts', import.meta.url);
        writeFileSync(
          p,
          readFileSync(p, 'utf8').replace(
            /export const VIDEO_GARDE = [^;]*;/,
            `export const VIDEO_GARDE =\n  '${want}';`,
          ),
        );
        return;
      }
      expect(VIDEO_GARDE.split(' ').filter(Boolean).sort().join(' '), 'VIDEO_GARDE=ecrire').toBe(
        want,
      );
    },
    300_000,
  );

  it.skipIf(!process.env.VIDEO_AUDIT)(
    'audit : tableau des unités, audios manquants, textes gardés',
    () => {
      const lignes = [
        '# Vidéos vivantes — Adultes niveau 1 (audit généré par `VIDEO_AUDIT=1`)',
        '',
        `Audio : ${audioAd1 ? `${audioAd1.size} fichiers du niveau (${LISTE})` : 'liste absente'}.`,
        '',
        '| Unité | Type | Modes | Scènes | Longue | Courte | Quiz (exercices) | Gardés sans voix | Sans audio (à écouter / tous) |',
        '|---|---|---|---|---|---|---|---|---|',
      ];
      const details: string[] = [];
      for (const f of FILES) {
        const { v } = video(f);
        const min = (ms: number) => `${Math.round(ms / 1000)} s`;
        lignes.push(
          `| ${f.slice(0, 3)} | ${v.type}${v.numero ? ` ${v.numero}` : ''} | ${v.modes.join(', ')} | ${v.scenes.length} | ${min(dureeMode(v, 'longue'))} | ${v.modes.includes('courte') ? min(dureeMode(v, 'courte')) : '—'} | ${scenesDuMode(v, 'quiz').length} | ${v.signalements.length} | ${v.sansSon.filter((x) => ['lettres', 'lecture', 'mots', 'dialogue', 'resume'].includes(x.part)).length} / ${v.sansSon.length} |`,
        );
        details.push(`## ${f.slice(0, 3)}`, '');
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
        join(out, 'video-vivante-ad1.md'),
        [...lignes, '', ...details].join('\n') + '\n',
      );
    },
  );
});
