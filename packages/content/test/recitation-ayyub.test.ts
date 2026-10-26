/**
 * Récitation d'Ayyūb dans les leçons (26/10/2026) — inventaire, table et contrôle à 100 % contre Tanzil.
 *
 *  - Inventaire : tout texte arabe des livres (tous publics : Adultes, Enfants, Ados, religion, hifẓ, lecture, Qāʿida…) et
 *    des données de l'application (cahiers de lecture et « Je parle », Prière, Madjaliss, douas) que la garde coranique
 *    rend muet (`refusVoix`) ou que l'application ne joue jamais en synthèse (graphie du Muṣḥaf).
 *  - Table (`apps/web/static/recitation/ayyub.json`, chargée par l'application À LA DEMANDE) : clé du texte (12 premiers
 *    chiffres hexadécimaux de son empreinte audio) → plan de lecture : versets d'Ayyūb (« 12:4 », « 1:1-7 »), Basmala
 *    annexe d'une sourate (« b:2 »), partie dite par la synthèse (« t:<empreinte> ») ; « ~ » en tête : fragment (verset
 *    entier joué, fragment surligné).
 *  - Doutes (`data/zero-muet/doutes-ayyub.tsv`) : rapprochements ambigus ou impossibles, pour le référent, jamais branchés.
 *  - Contrôle : chaque partie coranique d'un texte branché se lit, mot pour mot (squelette), dans les versets joués.
 *
 * `RECITATION_AYYUB=ecrire` régénère la table, les doutes, l'inventaire et la liste des parties à dire en synthèse.
 * Il lit la copie des livres (`~/awform-content`) : sans elle, la partie « livres » est ignorée.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { audioFileId, audioKey, looksQuranic, sha1Hex, skeleton } from '../src/audio-cle.js';
import { gardeCoran, refusVoix, reserveAyyub } from '../src/garde-coran.js';
import { loadTanzil } from '../src/quran.js';
import {
  analyser,
  indexCoran,
  motsTexte,
  refsDe,
  segmentCourt,
  candidats,
  type Analyse,
  type Ref,
} from '../src/recitation-ayyub.js';
import { parseDataFile, studentProjection } from '../src/index.js';
import { buildVideo } from '../src/video.js';
import { VIDEO_NIVEAUX } from '../src/video-niveaux.js';
import { CONTENT_DIR, HAS_CONTENT } from './helpers.js';

const RACINE = join(import.meta.dirname, '..', '..', '..');
const DATA = join(import.meta.dirname, '..', 'data', 'zero-muet');
const STATIC = join(RACINE, 'apps', 'web', 'static');
const TABLE = join(STATIC, 'recitation', 'ayyub.json');
const TSV = join(CONTENT_DIR, 'coran', 'tanzil-uthmani.tsv');

/** clé d'un texte dans la table (comme `autoriseCle`) */
const cle = (s: string) => (audioFileId(s) ?? '').slice(0, 12);

// —————————————————————————— mini-corpus (mots inventés, aucun texte coranique) ——————————————————————————
const mini = new Map<string, string>([
  ['1:1', 'كتب درس بيت قلم'],
  ['1:2', 'باب نور شمس قمر بحر'],
  ['2:1', 'كتب درس بيت قلم'],
  ['2:2', 'جبل سهل نهر'],
  ['3:2', 'وجد سمع لعب'],
  ['3:1', 'سفر حمل طلب نظر فهم'],
]);

describe('recitation d’Ayyūb : analyse d’un texte (mini-corpus)', () => {
  const idx = indexCoran(mini);
  it('ordre du Muṣḥaf : les clés sont triées (le fichier Tanzil n’est pas dans l’ordre)', () => {
    expect(idx.mots.map((m) => `${m.s}:${m.v}`).filter((x, i, a) => x !== a[i - 1])).toEqual([
      '1:1',
      '1:2',
      '2:1',
      '2:2',
      '3:1',
      '3:2',
    ]);
  });
  it('verset entier, plusieurs versets enchaînés, fragment', () => {
    expect(analyser('بَابٌ نُورٌ شَمْسٌ قَمَرٌ بَحْرٌ', idx).segments).toEqual([
      { k: 'v', s: 1, a: 2, b: 2 },
    ]);
    const deux = analyser('سفر حمل طلب نظر فهم ۝ وجد سمع لعب', idx);
    expect(deux.statut).toBe('verset');
    expect(deux.segments).toEqual([{ k: 'v', s: 3, a: 1, b: 2 }]);
    const f = analyser('حمل طلب نظر فهم', idx);
    expect(f.statut).toBe('fragment');
    expect(f.segments).toEqual([{ k: 'v', s: 3, a: 1, b: 1 }]);
  });
  it('ambigu (même suite dans deux versets) : référence, décision, sourate citée, sinon la première du Muṣḥaf', () => {
    expect(analyser('كتب درس بيت قلم', idx).segments).toEqual([{ k: 'v', s: 1, a: 1, b: 1 }]);
    expect(analyser('كتب درس بيت قلم', idx, { sourates: [2] }).segments).toEqual([
      { k: 'v', s: 2, a: 1, b: 1 },
    ]);
    expect(analyser('كتب درس بيت قلم (2:1)', idx).segments).toEqual([{ k: 'v', s: 2, a: 1, b: 1 }]);
    expect(analyser('كتب درس بيت قلم', idx, { decision: ['1:1'] }).segments).toEqual([
      { k: 'v', s: 1, a: 1, b: 1 },
    ]);
  });
  it('texte mixte : la synthèse pour le texte du livre, Ayyūb pour le verset, dans l’ordre ; le texte n’est pas modifié', () => {
    const t = 'قَالَ الْمُعَلِّمُ: باب نور شمس قمر بحر. ثُمَّ سَكَتَ';
    const a = analyser(t, idx);
    expect(a.statut).toBe('mixte');
    expect(a.segments).toEqual([
      { k: 't', texte: 'قَالَ الْمُعَلِّمُ' },
      { k: 'v', s: 1, a: 2, b: 2 },
      { k: 't', texte: 'ثُمَّ سَكَتَ' },
    ]);
    expect(t.slice(...a.coran[0]!)).toBe('باب نور شمس قمر بحر');
  });
  it('partie « synthèse » qui reprend deux mots du verset : découpée, la synthèse ne lit que le texte du livre', () => {
    expect(analyser('باب نور شمس قمر بحر ثم باب نور', idx).segments).toEqual([
      { k: 'v', s: 1, a: 2, b: 2 },
      { k: 't', texte: 'ثم' },
    ]);
  });
  it('moins de 4 mots gardés : verset entier en contexte coranique (référence, sinon le premier), sinon lemme', () => {
    expect(analyser('سهل نهر', idx, { garde: true, coranique: true }).segments).toEqual([
      { k: 'v', s: 2, a: 2, b: 2 },
    ]);
    expect(analyser('درس بيت', idx, { garde: true, coranique: true }).segments).toEqual([
      { k: 'v', s: 1, a: 1, b: 1 },
    ]);
    expect(
      analyser('درس بيت', idx, { garde: true, coranique: true, refs: [{ s: 2, a: 1, b: 1 }] })
        .segments,
    ).toEqual([{ k: 'v', s: 2, a: 1, b: 1 }]);
    expect(analyser('سهل نهر', idx, { garde: true }).statut).toBe('lemme');
  });
  it('trois versets candidats les plus proches (score)', () => {
    expect(candidats('باب نور قمر', idx)[0]).toBe('1:2 (4)');
  });
  it('moins de 4 mots : verset entier présenté comme verset, fragment référencé, sinon court', () => {
    expect(analyser('جبل سهل نهر', idx, { presente: true }).segments).toEqual([
      { k: 'v', s: 2, a: 2, b: 2 },
    ]);
    expect(analyser('جبل سهل نهر', idx).statut).toBe('court');
    expect(analyser('سهل نهر (2:2)', idx).statut).toBe('fragment');
    expect(analyser('سهل نهر', idx).statut).toBe('court');
  });
  it('expression réservée à Ayyūb par le référent (moins de 4 mots) : dans une phrase, plan mixte', () => {
    const r = [{ k: motsTexte('طلب نظر').map((x) => x.k), ref: '3:1' }];
    expect(analyser('رَأَى زَيْدٌ طلب نظر.', idx, { reserves: r }).segments).toEqual([
      { k: 't', texte: 'رَأَى زَيْدٌ' },
      { k: 'v', s: 3, a: 1, b: 1 },
    ]);
  });
  it('références écrites en chiffres arabes ou occidentaux', () => {
    expect(refsDe('(٢:٢٥٥) et 49:10-12')).toEqual([
      { s: 2, a: 255, b: 255 },
      { s: 49, a: 10, b: 12 },
    ]);
  });
});

// —————————————————————————— inventaire réel ——————————————————————————
const tanzil = existsSync(TSV) ? loadTanzil(readFileSync(TSV, 'utf8')) : null;

interface Lieu {
  livre: string;
  lieu: string;
  texte: string;
  refs: Ref[];
  presente: boolean;
  /** gardé sans voix par la vidéo (raison de la garde) */
  garde?: string;
  /** contexte coranique (partie Coran, verset, mot à mot, hifẓ, Prière…, ou référence du bloc) */
  coranique: boolean;
  /** sourates citées par la leçon (le fichier) */
  sourates: number[];
}
/** livres et données au contexte coranique d'un bout à l'autre */
const LIVRES_CORAN = new Set(['hifz', 'priere']);
/** champs au contexte coranique */
const CHAMPS_CORAN = /coran|verset|ayat|sourate|mushaf|hifz|tafsir|mutash|tanzil|recit/i;
/** sourates citées par les textes d'une leçon (références) : à partir de l'indice `de` */
function sourates(out: Lieu[], de: number) {
  const s = [
    ...new Set(
      out
        .slice(de)
        .flatMap((l) => [...l.refs, ...refsDe(l.texte)])
        .map((r) => r.s),
    ),
  ].sort((x, y) => x - y);
  for (const l of out.slice(de)) l.sourates = s;
}
const ARABE = /[ء-ي]/;
const ORNE = /[﴾﴿]/;
const CHAMPS_REF = ['ref', 'ref_fr', 'reference', 'source', 'fr', 'note_fr', 'verset', 'sourate'];

/** textes arabes d'une donnée, avec les références de leur bloc */
function textes(
  x: unknown,
  livre: string,
  lieu: string,
  out: Lieu[],
  refsBloc: Ref[] = [],
  coran = false,
): void {
  if (typeof x === 'string') {
    if (!ARABE.test(x)) return;
    const variantes = new Set([x]);
    if (x.includes('|')) {
      variantes.add(x.replace(/\s*\|\s*/g, ' '));
      for (const l of x.split('|')) if (ARABE.test(l)) variantes.add(l.trim());
    }
    for (const t of variantes)
      out.push({
        livre,
        lieu,
        texte: t,
        refs: refsBloc,
        presente:
          coran || ORNE.test(t) || looksQuranic(t) || refsBloc.length > 0 || refsDe(t).length > 0,
        coranique: coran || refsBloc.length > 0 || LIVRES_CORAN.has(livre),
        sourates: [],
      });
    return;
  }
  if (Array.isArray(x)) {
    x.forEach((y, i) => textes(y, livre, `${lieu}.${i}`, out, refsBloc, coran));
    return;
  }
  if (!x || typeof x !== 'object') return;
  const o = x as Record<string, unknown>;
  const refs = [
    ...refsBloc,
    ...CHAMPS_REF.map((k) => o[k])
      .filter((v): v is string => typeof v === 'string')
      .flatMap((v) => refsDe(v)),
  ];
  // déjà récité par Ayyūb par son propre mécanisme : élément « q » du cahier de lecture (référence), parole de la
  // Prière (`audio` = « ayyub:S:V »)
  const recite =
    (o.a === 'q' && typeof o.ref === 'string') ||
    [o.audio].flat().some((x) => typeof x === 'string' && x.startsWith('ayyub:'));
  for (const [k, v] of Object.entries(o)) {
    if (recite && k === 'ar') continue;
    // lignes d'un texte suivi du cahier qui citent le Coran avec leur référence (`recite`) : récitées par le cahier
    const rec =
      k === 'lignes' && o.recite && typeof o.recite === 'object'
        ? (o.recite as Record<string, string>)
        : null;
    const val = rec && Array.isArray(v) ? v.map((x, i) => (rec[String(i)] ? null : x)) : v;
    textes(val, livre, `${lieu}.${k}`, out, refs, coran || CHAMPS_CORAN.test(k));
  }
}

/** tous les textes arabes des livres et des données de l'application */
function inventaire(): Lieu[] {
  const out: Lieu[] = [];
  const data = join(CONTENT_DIR, 'data');
  if (existsSync(data))
    for (const livre of readdirSync(data).sort()) {
      const d = join(data, livre);
      if (!statSync(d).isDirectory()) continue;
      const lecons = existsSync(join(d, 'book.js'));
      for (const f of readdirSync(d)
        .filter((x) => /\.js$/.test(x) && x !== 'book.js')
        .sort()) {
        let v: unknown;
        try {
          v = parseDataFile(readFileSync(join(d, f), 'utf8'), f).value;
        } catch {
          continue;
        }
        if (lecons && /^l\d+\.js$/.test(f))
          v = studentProjection(v as Record<string, unknown>, livre);
        const de = out.length;
        textes(v, livre, f.replace(/\.js$/, ''), out);
        // vidéos vivantes (V1 et V2) : textes dits ou gardés tels que le lecteur les montre (morceaux de phrases, bulles)
        if (lecons && /^l\d+\.js$/.test(f) && (VIDEO_NIVEAUX as readonly string[]).includes(livre))
          for (const v2 of [false, true]) {
            const vid = buildVideo(v, {
              unitId: `${livre}.${f.slice(0, 3)}`,
              hasAudio: () => false,
              v2,
            });
            for (const s of vid.signalements)
              out.push({
                livre,
                lieu: `${f.slice(0, 3)} vidéo`,
                texte: s.texte,
                refs: [],
                presente: true,
                garde: s.raison,
                coranique: s.raison !== 'contexte' && s.raison !== 'basmala',
                sourates: [],
              });
            for (const s of vid.sansSon)
              out.push({
                livre,
                lieu: `${f.slice(0, 3)} vidéo`,
                texte: s.texte,
                refs: [],
                presente: false,
                coranique: false,
                sourates: [],
              });
          }
        sourates(out, de);
      }
    }
  const json = (dir: string, nom: (f: string) => string) => {
    const d = join(STATIC, dir);
    if (!existsSync(d)) return;
    for (const f of readdirSync(d)
      .filter((x) => x.endsWith('.json'))
      .sort()) {
      const de = out.length;
      textes(JSON.parse(readFileSync(join(d, f), 'utf8')), nom(f), f, out);
      sourates(out, de);
    }
  };
  json('cahier-data', (f) => `cahier ${f.replace('.json', '')}`);
  json('priere-data', () => 'priere');
  json('mutun', (f) => `madjaliss ${f.replace('.json', '')}`);
  json('douas', () => 'douas');
  return out;
}

interface Decision {
  versets: string[];
  type: 'ayyub' | 'mixte' | 'table';
}
/** décisions du référent par texte (versets choisis) : tables du « zéro muet » */
/** textes que le référent a décidés « synthèse » (faux positifs de la garde) : jamais dans la table */
function decisionsSynthese(): Set<string> {
  const s = new Set<string>();
  for (const f of ['referent-373.tsv', 'ayyub-complement.tsv'])
    for (const l of readFileSync(join(DATA, f), 'utf8').split('\n').slice(1)) {
      const [texte, , decision] = l.split('\t');
      if (texte && decision === 'synthese') s.add(audioKey(texte));
    }
  return s;
}
function decisions(): Map<string, Decision> {
  const m = new Map<string, Decision>();
  const t = JSON.parse(readFileSync(join(DATA, 'coran-ayyub-table.json'), 'utf8')) as {
    entrees: Array<{ texte: string; versets: string[] }>;
  };
  for (const e of t.entrees)
    if (e.versets.length) m.set(audioKey(e.texte), { versets: e.versets, type: 'table' });
  for (const f of ['referent-373.tsv', 'ayyub-complement.tsv'])
    for (const l of readFileSync(join(DATA, f), 'utf8').split('\n').slice(1)) {
      const [texte, , decision, versets] = l.split('\t');
      // « ambigu » : versets proposés à choisir (« 20:82 ou 28:67 ») : jamais une décision
      if (
        texte &&
        versets?.trim() &&
        !/ ou /.test(versets) &&
        ['ayyub', 'mixte'].includes(decision ?? '')
      )
        m.set(audioKey(texte), {
          versets: versets.split(/[ ,;]+/).filter(Boolean),
          type: decision as 'ayyub' | 'mixte',
        });
    }
  return m;
}

/** expressions de moins de 4 mots réservées à Ayyūb par le référent (`ayyub-reserves.tsv`) */
function reserves(): Array<{ k: string[]; ref: string }> {
  return readFileSync(join(DATA, 'ayyub-reserves.tsv'), 'utf8')
    .split('\n')
    .slice(1)
    .filter(Boolean)
    .map((l) => l.split('\t'))
    .map(([texte, ref]) => ({ k: motsTexte(texte!).map((x) => x.k), ref: ref! }));
}

/** genre d'un doute (colonne de tri pour le référent) */
const genre = (note: string) =>
  /^(citation présente|plusieurs versets|verset entier présent)/.test(note)
    ? 'ambigu'
    : note.startsWith('plans différents')
      ? 'plans-differents'
      : note.startsWith('partie confiée')
        ? 'synthese-et-verset'
        : note.startsWith('passage en graphie')
          ? 'graphie-sans-verset'
          : 'court-presente-comme-coran';

interface Resultat {
  table: Record<string, string[]>;
  doutes: string[];
  lemmes: string[];
  doutes93: string[];
  francais: string[];
  inventaire: string[];
  synthese: string[];
  annexes: number[];
  parLivre: Map<string, Record<string, number>>;
}

function construire(): Resultat {
  const idx = indexCoran(tanzil!);
  const verses = idx.mots.length ? [...tanzil!.entries()] : [];
  const ordre = verses
    .map(([k, v]) => [k.split(':').map(Number) as [number, number], v] as const)
    .sort(([a], [b]) => a[0] - b[0] || a[1] - b[1])
    .map(([, v]) => v);
  const g = gardeCoran(ordre);
  const dec = decisions();
  const res = reserves();
  const resK = res.map((r) => r.k.join(' '));
  const parCle = new Map<
    string,
    { texte: string; lieux: Lieu[]; refus: boolean; candidat: boolean }
  >();
  for (const l of inventaire()) {
    const k = cle(l.texte);
    if (!k) continue;
    let e = parCle.get(k);
    if (!e) {
      const refus = !!refusVoix(l.texte, g);
      // muet par la garde, ou graphie du Muṣḥaf (jamais jouée en synthèse), ou contient une expression réservée à Ayyūb
      const sk = motsTexte(l.texte)
        .map((x) => x.k)
        .join(' ');
      const candidat =
        refus || looksQuranic(l.texte) || resK.some((r) => ` ${sk} `.includes(` ${r} `));
      e = { texte: l.texte, lieux: [], refus, candidat };
      parCle.set(k, e);
    }
    // ou gardé sans voix par la vidéo (Coran, Basmala, partie Coran, contexte de récitation)
    if (l.garde) e.candidat = true;
    e.lieux.push(l);
  }
  const synth = decisionsSynthese();
  for (const [k, e] of parCle) if (!e.candidat || synth.has(audioKey(e.texte))) parCle.delete(k);
  const table: Record<string, string[]> = {};
  const doutes: string[] = [];
  const inventaireL: string[] = [];
  const synthese = new Map<string, string>();
  const annexes = new Set<number>();
  const parLivre = new Map<string, Record<string, number>>();
  const lemmes = new Map<string, { livres: Set<string>; note: string }>();
  const doutes93: string[] = [];
  const francais: string[] = [];
  const fichier = (t: string) => audioFileId(t)!;
  for (const [k, e] of [...parCle].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const plans = new Map<string, Analyse>();
    const d = dec.get(audioKey(e.texte));
    for (const l of e.lieux) {
      const a = analyser(e.texte, idx, {
        refs: l.refs,
        decision: d?.versets,
        decisionType: d?.type,
        presente: l.presente,
        reserves: res,
        garde: e.refus || !!l.garde,
        coranique: l.coranique,
        sourates: l.sourates,
      });
      plans.set(JSON.stringify([a.statut, a.segments]), a);
    }
    // un même texte, plusieurs plans selon les leçons (références différentes) : la table est une par texte ; on garde le
    // plan au premier verset dans l'ordre du Muṣḥaf (décision du référent du 26/10/2026 : l'élève voit la référence)
    const premier = (x: Analyse) => {
      const v = x.segments.find((y) => y.k === 'v');
      return v && v.k === 'v' ? v.s * 1000 + v.a : 1e9;
    };
    const branches = [...plans.values()]
      .filter((x) => ['verset', 'fragment', 'mixte'].includes(x.statut))
      .sort((x, y) => premier(x) - premier(y));
    const a: Analyse =
      branches[0] ??
      [...plans.values()].find((x) => x.statut === 'doute') ??
      [...plans.values()].find((x) => x.statut === 'lemme') ??
      [...plans.values()][0]!;
    if (a.statut === 'francais')
      francais.push(
        [
          e.texte.replace(/[\t\n\r]+/g, ' '),
          [...new Set(e.lieux.map((l) => l.livre))].join(' '),
        ].join('\t'),
      );
    if (a.statut === 'lemme')
      lemmes.set(e.texte, { livres: new Set(e.lieux.map((l) => l.livre)), note: a.note });
    const livres = [...new Set(e.lieux.map((l) => l.livre))];
    for (const lv of livres) {
      const p = parLivre.get(lv) ?? {};
      p[a.statut] = (p[a.statut] ?? 0) + 1;
      parLivre.set(lv, p);
    }
    const plan = a.segments.map((s) => segmentCourt(s, fichier));
    if (['verset', 'fragment', 'mixte'].includes(a.statut)) {
      table[k] = a.statut === 'fragment' ? ['~', ...plan] : plan;
      for (const s of a.segments) {
        if (s.k === 't') synthese.set(fichier(s.texte), s.texte);
        if (s.k === 'b') annexes.add(s.s);
      }
    }
    const lieux = [...new Set(e.lieux.map((l) => `${l.livre} ${l.lieu.split('.')[0]}`))]
      .slice(0, 6)
      .join(' ; ');
    const ligne = (x: string) => x.replace(/[\t\n\r]+/g, ' ');
    if (a.statut === 'doute') {
      doutes.push([genre(a.note), ligne(e.texte), lieux, ligne(a.note)].join('\t'));
      // liste finale pour le référent : les 3 versets candidats les plus proches du passage
      {
        const passage = /« (.+) »/.exec(a.note)?.[1] ?? e.texte;
        doutes93.push(
          [ligne(e.texte), ligne(passage), candidats(passage, idx).join(' ; '), lieux].join('\t'),
        );
      }
    }
    inventaireL.push(
      [livres.join(' '), a.statut, plan.join(' '), ligne(a.note), ligne(e.texte)].join('\t'),
    );
  }
  // lemmes de la surface « Mots du Coran » (inventaire global du 26/10/2026) : vocabulaire, jamais Ayyūb
  const global = join(DATA, 'ayyub-global-26-10.tsv');
  if (existsSync(global))
    for (const l of readFileSync(global, 'utf8').split('\n').slice(1)) {
      const c = l.split('\t');
      if (c[0] === 'coran-mots-lemmes' && c[4] && !lemmes.has(c[4]))
        lemmes.set(c[4], {
          livres: new Set(['coran-mots']),
          note: `lemme du Coran (${c[11] ?? ''})`,
        });
    }
  return {
    table,
    doutes,
    lemmes: [...lemmes]
      .sort(([x], [y]) => (x < y ? -1 : 1))
      .map(([t, x]) =>
        [t.replace(/[\t\n\r]+/g, ' '), audioFileId(t), [...x.livres].sort().join(' '), x.note].join(
          '\t',
        ),
      ),
    doutes93: doutes93.sort(),
    francais: francais.sort(),
    inventaire: inventaireL,
    synthese: [...synthese].sort().map(([sha, t]) => `${sha}\t${t}`),
    annexes: [...annexes].sort((x, y) => x - y),
    parLivre,
  };
}

const lireTable = () =>
  existsSync(TABLE)
    ? (JSON.parse(readFileSync(TABLE, 'utf8')) as {
        format: number;
        recitateur: string;
        t: Record<string, string[]>;
      })
    : null;

/** module des expressions réservées à Ayyūb, lu par la garde (`refusVoix`) : généré depuis `ayyub-reserves.tsv` */
function moduleReserves(): string {
  const empreintes = reserves()
    .map((r) => `${r.k.length}:${sha1Hex(r.k.join(' ')).slice(0, 16)}`)
    .sort();
  return [
    '/**',
    ' * Expressions de moins de 4 mots RÉSERVÉES à la récitation de Muḥammad Ayyūb (décisions du référent) — FICHIER GÉNÉRÉ',
    ' * par le test « recitation-ayyub » (`RECITATION_AYYUB=ecrire`) depuis `data/zero-muet/ayyub-reserves.tsv`. Empreintes :',
    ' * nombre de mots, puis 16 premiers chiffres hexadécimaux du SHA-1 de leurs squelettes joints par une espace. Lues par',
    ' * `refusVoix` (`garde-coran.ts`) : jamais de voix de synthèse sur un texte qui les contient.',
    ' */',
    `export const AYYUB_RESERVES = '${empreintes.join(' ')}';`,
    '',
  ].join('\n');
}

describe('récitation d’Ayyūb : expressions réservées', () => {
  it('le module lu par la garde est à jour (RECITATION_AYYUB=ecrire) et la garde refuse la voix à ces textes', () => {
    const f = join(import.meta.dirname, '..', 'src', 'ayyub-reserves.ts');
    if (process.env.RECITATION_AYYUB === 'ecrire') writeFileSync(f, moduleReserves());
    expect(readFileSync(f, 'utf8')).toBe(moduleReserves());
    const g = gardeCoran([mini.get('1:1')!]);
    for (const l of readFileSync(join(DATA, 'ayyub-reserves.tsv'), 'utf8')
      .split('\n')
      .slice(1)
      .filter(Boolean)) {
      const texte = l.split('\t')[0]!;
      expect(reserveAyyub(texte), texte).toBe(true);
      expect(refusVoix(`رَأَى زَيْدٌ ${texte}.`, g), texte).toBe('coran');
    }
    expect(reserveAyyub('رَأَى زَيْدٌ كِتَابًا')).toBe(false);
  });
});

describe.skipIf(!tanzil || !HAS_CONTENT)('récitation d’Ayyūb : table des livres', () => {
  it('table à jour (RECITATION_AYYUB=ecrire), doutes au référent, contrôle à 100 % contre Tanzil', () => {
    const r = construire();
    const json = `${JSON.stringify({ format: 1, recitateur: 'ayyoub-hafs', t: r.table })}\n`;
    const tete = (cols: string) => `${cols}\n`;
    const fichiersSortie: Array<[string, string]> = [
      [TABLE, json],
      [
        join(DATA, 'doutes-ayyub.tsv'),
        tete('genre\ttexte\tou\tpourquoi') +
          [...r.doutes]
            .sort()
            .map((l) => `${l}\n`)
            .join(''),
      ],
      [
        join(DATA, 'inventaire-ayyub.tsv'),
        tete('livres\tstatut\tplan\tnote\ttexte') + r.inventaire.map((l) => `${l}\n`).join(''),
      ],
      [
        join(DATA, 'synthese-mixte.tsv'),
        tete('empreinte\ttexte') + r.synthese.map((l) => `${l}\n`).join(''),
      ],
      [
        join(DATA, 'notes-francais-26-10.tsv'),
        tete(
          'texte\tlivres (note rédigée en français : non lue, décision du référent du 26/10/2026)',
        ) + r.francais.map((l) => `${l}\n`).join(''),
      ],
      [
        join(DATA, 'a-generer-lemmes-26-10.tsv'),
        tete('texte\tempreinte\tlivres\tnote (synthèse en graphie courante, pour l’agent audio)') +
          r.lemmes.map((l) => `${l}\n`).join(''),
      ],
      [
        join(DATA, 'doutes-referent-final-26-10.tsv'),
        tete('texte\tpassage\tversets candidats (score)\tou') +
          r.doutes93.map((l) => `${l}\n`).join(''),
      ],
    ];
    if (process.env.RECITATION_AYYUB === 'ecrire') {
      mkdirSync(join(STATIC, 'recitation'), { recursive: true });
      for (const [f, c] of fichiersSortie) writeFileSync(f, c);
      const rap = [...r.parLivre]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(
          ([l, p]) =>
            `${l}\t${Object.entries(p)
              .map(([s, n]) => `${s} ${n}`)
              .join(', ')}`,
        );
      writeFileSync(join(RACINE, 'reports', 'recitation-ayyub-livres.tsv'), `${rap.join('\n')}\n`);
      console.log(`annexes (Basmala de sourate) : ${r.annexes.join(' ') || 'aucune'}`);
    }
    for (const [f, c] of fichiersSortie)
      expect(readFileSync(f, 'utf8'), `${f} : RECITATION_AYYUB=ecrire`).toBe(c);
    console.log(
      `récitation d’Ayyūb : ${Object.keys(r.table).length} textes branchés ; ${r.doutes.length} doutes ; ${r.synthese.length} parties à dire en synthèse`,
    );
  }, 600_000);

  it('chaque partie coranique d’un texte branché se lit mot pour mot dans les versets joués (Tanzil trié)', () => {
    const idx = indexCoran(tanzil!);
    const t = lireTable()!;
    // textes de l'inventaire par clé (la table ne garde que la clé)
    const lieux = new Map<string, Lieu[]>();
    for (const l of inventaire()) {
      const x = lieux.get(cle(l.texte));
      if (x) x.push(l);
      else lieux.set(cle(l.texte), [l]);
    }
    const fichier = (s: string) => audioFileId(s)!;
    const dec = decisions();
    const res = reserves();
    let verifies = 0;
    let stricts = 0;
    let parties = 0;
    for (const [k, plan] of Object.entries(t.t)) {
      const ls = lieux.get(k);
      expect(ls, `clé ${k} absente des livres`).toBeTruthy();
      const texte = ls![0]!.texte;
      expect(
        plan.some((s) => /^\d+:\d+/.test(s)),
        `${k} : aucun verset dans le plan`,
      ).toBe(true);
      // versets joués, dans l'ordre du Muṣḥaf, tous présents dans Tanzil
      const mots: string[] = [];
      for (const s of plan) {
        const b = /^b:(\d+)$/.exec(s);
        if (b) {
          // Basmala annexe de la sourate : les mots de la Basmala que Tanzil écrit en tête de son verset 1
          const d = idx.bornes.get(`${b[1]}:1`)![0];
          for (let q = d - 4; q < d; q++) {
            expect(idx.mots[q]!.b, `${k} : pas de Basmala en tête de la sourate ${b[1]}`).toBe(
              true,
            );
            mots.push(idx.mots[q]!.k);
          }
          continue;
        }
        const m = /^(\d+):(\d+)(?:-(\d+))?$/.exec(s);
        if (!m) continue;
        for (let v = Number(m[2]); v <= Number(m[3] ?? m[2]); v++) {
          const bo = idx.bornes.get(`${m[1]}:${v}`);
          expect(bo, `${k} : verset ${m[1]}:${v} absent de Tanzil`).toBeTruthy();
          for (let q = bo![0]; q <= bo![1]; q++) mots.push(idx.mots[q]!.k);
        }
      }
      // l'analyse d'un des endroits du texte redonne ce plan (référence du bloc, décision du référent)
      const a = ls!
        .map((l) =>
          analyser(texte, idx, {
            decision: dec.get(audioKey(texte))?.versets,
            decisionType: dec.get(audioKey(texte))?.type,
            garde: true,
            reserves: res,
            refs: l.refs,
            presente: l.presente,
            coranique: l.coranique,
            sourates: l.sourates,
          }),
        )
        .find(
          (x) =>
            x.segments.map((s) => segmentCourt(s, fichier)).join(' ') ===
            plan.filter((s) => s !== '~').join(' '),
        );
      expect(a, `${k} : plan introuvable par l'analyse`).toBeTruthy();
      expect(a!.coran.length, `${k} : aucune partie coranique reconnue`).toBeGreaterThan(0);
      // chaque partie coranique du texte (squelette, mots consécutifs) est dans les versets joués
      for (const [d, f] of a!.coran) {
        parties++;
        const brut = motsTexte(texte.slice(d, f)).map((x) => x.k);
        if (` ${mots.join(' ')} `.includes(` ${brut.join(' ')} `)) stricts++;
        const part = brut.map((x) => x.replace(/[وي]/g, ''));
        const joue = ` ${mots.map((x) => x.replace(/[وي]/g, '')).join(' ')} `;
        expect(
          joue.includes(` ${part.join(' ')} `),
          `${k} : « ${texte.slice(d, f)} » hors des versets joués ${plan.join(' ')}`,
        ).toBe(true);
      }
      verifies++;
    }
    expect(verifies).toBe(Object.keys(t.t).length);
    console.log(
      `contrôle Tanzil : ${verifies} textes, ${parties} parties coraniques ; squelette identique ${stricts}, écriture souple (و ي) ${parties - stricts}`,
    );
    expect(skeleton('')).toBe('');
  }, 600_000);
});
