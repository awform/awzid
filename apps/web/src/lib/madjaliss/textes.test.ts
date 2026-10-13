import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AVEC_EXPLICATION,
  CHAMPS_INTERNES,
  construire,
  NOTE_RETIENT,
  PHRASE_INTERNE,
  SORTIE,
  SOURCE_INTERNE,
  SOURCES,
  STATUT,
  STATUTS_ACCEPTES,
  TEXTES,
  tanzil,
} from '../../../scripts/madjaliss.mjs';
import { CYCLES } from './cycles';
import {
  arSimple,
  matnPour,
  segments,
  texteVoixSynthese,
  type Matn,
  type NotesEnseignant,
  type Phrase,
} from './donnees';
import { aMemoriser } from './memo';
import { genererQuiz } from './quiz';

/**
 * Les sept textes du lot Madjaliss 2 (al-Akhḍarī, al-ʿAshmāwiyya, Tuḥfat al-Aṭfāl, Ibn ʿĀshir, al-ʿIzziyya,
 * al-Ājurrūmiyya, al-Jazariyya) : MÊMES contrôles pour chacun, à partir des sources du référent. Données à jour,
 * arabe intact octet par octet, citations coraniques identiques à Tanzil et jamais lues par une voix de synthèse,
 * aucun champ interne ni lettre latine dans l'arabe, niveaux (adulte, pudeur), statut.
 */
const lire = <T>(p: string) => JSON.parse(readFileSync(p, 'utf8')) as T;
const octets = (s: string) => Buffer.from(s, 'utf8').toString('hex');
const LATIN = /[A-Za-zʿʾḥṣḍṭẓāīūṯḏġš]/;

/** [phrases, séances] attendus (chiffres des sources du 13/10/2026 ; le colophon de l'éditeur de l'Ājurrūmiyya est hors matn). */
const ATTENDU: Record<string, [number, number]> = {
  akhdari: [233, 44],
  ashmawiyya: [159, 32],
  tuhfa: [61, 18],
  'ibn-ashir': [319, 58],
  izziyya: [481, 80],
  ajurrumiyya: [140, 32],
  jazariyya: [107, 28],
};

type SrcPhrase = {
  id: string;
  ar: string;
  type?: string;
  section?: string;
  niveau_min?: string;
  coran?: {
    segments?: Array<{ sourate: number; verset: number; texte: string }>;
    sourate?: number;
    verset?: number;
    texte?: string;
    voix_de_synthese?: boolean;
  };
};
type SrcSeance = {
  id: string;
  phrases?: string[];
  vers?: string[];
  niveau_min?: string;
  relecture_comite?: boolean;
  facultatif?: boolean;
  ordre_publication?: number;
};

const lignes = tanzil();

describe('Tanzil (coran/tanzil-uthmani.tsv)', () => {
  it('copie figée : 6 236 versets, lignes non normalisées', () => {
    expect(lignes.size).toBe(6236);
    // copie octet pour octet de coran/tanzil-uthmani.tsv (empreinte SHA-256 de la source)
    const octetsTsv = readFileSync(join(SOURCES, 'coran', 'tanzil-uthmani.tsv'));
    expect(createHash('sha256').update(octetsTsv).digest('hex')).toBe(
      '4d6d41e0b84cbdf9978ed44cc76a2ea74414c749a8ce2e41058e10148d439fe5',
    );
  });
});

describe('ordre des textes dans la rubrique : par cycle, comme dans le plan directeur', () => {
  it('les sept textes intégrés sont dans les cycles 1 à 3', () => {
    const ordre = CYCLES.flatMap((c) => c.textes.map((x) => x.id)).filter((id) =>
      TEXTES.includes(id),
    );
    expect(ordre).toEqual([
      'akhdari',
      'ashmawiyya',
      'tuhfa',
      'ibn-ashir',
      'izziyya',
      'ajurrumiyya',
      'jazariyya',
    ]);
    expect(CYCLES.map((c) => c.n)).toEqual([1, 2, 3, 4]);
  });
});

describe.each(TEXTES)('texte %s', (id) => {
  const dir = join(SOURCES, id);
  const ar = lire<{ phrases?: SrcPhrase[]; vers?: SrcPhrase[] }>(join(dir, 'texte_ar.json'));
  const unites = (ar.phrases ?? ar.vers)!;
  const fr = lire<{ statut_global?: string; phrases: Array<Record<string, unknown>> }>(
    join(dir, 'traduction_fr.json'),
  );
  const se = lire<{ statut?: string; seances: SrcSeance[] }>(join(dir, 'seances.json'));
  const brut = readFileSync(join(SORTIE, `${id}.json`), 'utf8');
  const brutEns = readFileSync(join(SORTIE, `${id}-enseignant.json`), 'utf8');
  const matn = JSON.parse(brut) as Matn;
  const ens = JSON.parse(brutEns) as NotesEnseignant;
  const de = new Map(matn.phrases.map((p) => [p.id, p]));

  it('données à jour avec les sources (node scripts/madjaliss.mjs)', () => {
    const { eleve, enseignant } = construire(id, lignes);
    expect(`${JSON.stringify(eleve)}\n`).toBe(brut);
    expect(`${JSON.stringify(enseignant)}\n`).toBe(brutEns);
  });

  it('nombre de phrases et de séances ; chaque phrase dans une séance une seule fois', () => {
    const [np, ns] = ATTENDU[id]!;
    expect(matn.phrases).toHaveLength(np);
    expect(matn.seances).toHaveLength(ns);
    const toutes = matn.seances.flatMap((s) => s.phrases);
    expect(toutes).toHaveLength(np);
    expect(new Set(toutes).size).toBe(np);
    expect(matn.seances.map((s) => s.n)).toEqual(matn.seances.map((_, i) => i + 1));
    expect(matn.v).toBe(2);
    // pas de champ `traduction` (texte de travail du référent) ni de statut par phrase
    expect(Object.keys(matn)).not.toContain('traduction');
  });

  it('statut EN_ATTENTE_SECONDE_LECTURE (l’ancien libellé est accepté en entrée, jamais montré)', () => {
    expect(matn.statut).toBe(STATUT);
    expect(brut).not.toMatch(/VALIDATION_HUMAINE|validation humaine/i);
    expect(ens.statut).toBe(STATUT);
    for (const s of [fr.statut_global, se.statut]) expect(STATUTS_ACCEPTES.has(s!)).toBe(true);
    for (const p of fr.phrases)
      expect(STATUTS_ACCEPTES.has(p.statut as string), String(p.id)).toBe(true);
  });

  it('texte arabe de l’auteur INTACT, octet par octet (jamais normalisé)', () => {
    let n = 0;
    for (const s of unites) {
      const p = de.get(s.id);
      if (!p) continue; // colophon de l'éditeur : hors matn
      if (p.explication) continue;
      n++;
      if (p.h) expect(octets(p.h.join(' * ')), s.id).toBe(octets(s.ar));
      else {
        const rebati = segments(p)
          .map((x) => (typeof x === 'string' ? x : `\u{FD3F}${x.q}\u{FD3E}`))
          .join('');
        expect(octets(rebati), s.id).toBe(octets(s.ar));
      }
    }
    expect(n).toBeGreaterThan(30);
  });

  it('mots du Coran cités : sous-chaînes EXACTES de Tanzil, jamais lus par une voix de synthèse', () => {
    const cites = matn.phrases.flatMap((p) =>
      segments(p).flatMap((x) => (typeof x === 'string' ? [] : [{ id: p.id, ...x }])),
    );
    for (const p of unites) {
      if (!p.coran) continue;
      expect(p.coran.voix_de_synthese, p.id).toBe(false);
      const segs = p.coran.segments ?? [
        { sourate: p.coran.sourate!, verset: p.coran.verset!, texte: p.coran.texte! },
      ];
      const livre = de.get(p.id)!;
      for (const s of segs) {
        const ligne = lignes.get(`${s.sourate}:${s.verset}`)!;
        expect(Buffer.from(ligne, 'utf8').includes(Buffer.from(s.texte, 'utf8')), p.id).toBe(true);
        if (!livre.explication)
          expect(
            cites.some((c) => c.id === p.id && c.q.includes(s.texte)),
            `${p.id} ${s.sourate}:${s.verset}`,
          ).toBe(true);
      }
    }
    for (const c of cites) expect(c.ref, c.id).toMatch(/^\d+:\d+(-\d+)?$/);
    // garde : une phrase qui cite le Coran ou qui est réservée n'est JAMAIS donnée à une voix de synthèse
    for (const p of matn.phrases) {
      const v = texteVoixSynthese(p);
      if (typeof p.ar === 'object' || p.explication) expect(v, p.id).toBeNull();
      else expect(v, p.id).toBe(arSimple(p));
      if (v) for (const c of cites) expect(v.includes(c.q), p.id).toBe(false);
    }
  });

  it('citations des notes (commentateur) : sous-chaînes exactes de Tanzil', () => {
    for (const p of matn.phrases)
      for (const n of p.notes ?? [])
        for (const q of n.q ?? []) {
          const [s, a] = q.ref.split(':') as [string, string];
          const [de, jusqu] = a.split('-').map(Number) as [number, number | undefined];
          const versets = Array.from({ length: (jusqu ?? de) - de + 1 }, (_, i) =>
            lignes.get(`${s}:${de + i}`)!,
          );
          // un verset : sous-chaîne exacte ; plusieurs : chaque verset y apporte une sous-chaîne exacte
          const morceaux = q.q.split(' ');
          const exact =
            versets.length === 1
              ? versets[0]!.includes(q.q)
              : versets.every((v) => morceaux.some((w) => v.includes(w))) &&
                morceaux.every((w) => versets.some((v) => v.includes(w)));
          expect(exact, `${p.id} ${q.ref}`).toBe(true);
        }
  });

  it('champs internes : jamais dans les données de l’élève (liste blanche de champs)', () => {
    const cles = new Set<string>();
    const walk = (o: unknown) => {
      if (Array.isArray(o)) o.forEach(walk);
      else if (o && typeof o === 'object')
        for (const [k, v] of Object.entries(o)) {
          cles.add(k);
          walk(v);
        }
    };
    walk(matn);
    for (const k of CHAMPS_INTERNES) expect(cles.has(k), k).toBe(false);
    for (const k of cles)
      expect(k, k).not.toMatch(/translit|interne|brouillon|collation|decision|relecture/i);
    // valeurs internes des sources : brouillons, décisions, vérifications, collations, vocalisations à confirmer
    const valeurs: string[] = [];
    const collecte = (o: unknown, cle: string) => {
      if (typeof o === 'string') {
        if (
          /brouillon|decision|verification|collation|a_verifier|voyelle_a_confirmer|consulte_interne|lacune|source_formule|statut_compte|motif_relecture/.test(
            cle,
          )
        )
          valeurs.push(o);
      } else if (Array.isArray(o)) o.forEach((x) => collecte(x, cle));
      else if (o && typeof o === 'object')
        for (const [k, v] of Object.entries(o))
          collecte(v, /relecture|decision/.test(cle) ? cle : k);
    };
    collecte(unites, '');
    collecte(fr.phrases, '');
    const echap = (s: string) => JSON.stringify(s).slice(1, -1);
    for (const v of valeurs)
      if (v.length > 30) expect(brut.includes(echap(v)), v.slice(0, 50)).toBe(false);
    // jamais de note de relecture, de référent ni de comité dans les textes de l'élève
    for (const p of matn.phrases)
      for (const n of p.notes ?? []) {
        expect(PHRASE_INTERNE.test(n.texte), `${p.id} : ${n.texte.slice(0, 80)}`).toBe(false);
        for (const s of n.sources ?? [])
          expect(SOURCE_INTERNE.test(s), `${p.id} : ${s}`).toBe(false);
      }
    expect(brut).not.toMatch(/translit_interne|matn_ar_base_numerique|fr_translit/);
  });

  it('l’arabe est toujours sur sa ligne et ne porte aucune lettre latine (translittération)', () => {
    const arabes: string[] = [];
    for (const p of matn.phrases) {
      arabes.push(...(p.h ?? []));
      for (const s of segments(p)) arabes.push(typeof s === 'string' ? s : s.q);
      arabes.push(...(p.liste ?? []).map((x) => x.ar), ...(p.exemples ?? []).map((x) => x.ar));
      if (p.titre) arabes.push(p.titre);
      for (const n of p.notes ?? []) arabes.push(...(n.ar ?? []), ...(n.q ?? []).map((q) => q.q));
    }
    for (const s of matn.seances) arabes.push(...s.mots.map((m) => m.ar));
    for (const c of matn.code?.etats ?? []) arabes.push(c.ar);
    expect(arabes.length).toBeGreaterThan(20);
    for (const a of arabes) expect(LATIN.test(a), a.slice(0, 60)).toBe(false);
    // la traduction française d'une phrase ne porte pas de mot arabe (listes et exemples ont leur ligne) : seules
    // exceptions, des lettres entre crochets de la Jazariyya (JAZ-0008, JAZ-0067) ; dans les notes, 17 notes d'Ibn ʿĀshir
    // et 2 d'al-ʿIzziyya citent un mot ou une courte expression entre guillemets (glose du référent, signalé au client)
    const dansFr = matn.phrases.filter((p) => /[؀-ۿ]/.test(p.fr ?? '')).map((p) => p.id);
    expect(dansFr).toEqual(id === 'jazariyya' ? ['JAZ-0008', 'JAZ-0067'] : []);
    const dansNotes = matn.phrases
      .flatMap((p) => p.notes ?? [])
      .filter((n) => /[؀-ۿ]/.test(n.texte));
    expect(dansNotes).toHaveLength(id === 'ibn-ashir' ? 17 : id === 'izziyya' ? 2 : 0);
  });

  it('niveau « adulte » : jamais aux enfants ni aux ados ; chapitres de pudeur : jamais aux enfants', () => {
    const adultes = matn.phrases.filter((p) => p.adulte).map((p) => p.id);
    const sAdultes = matn.seances.filter((s) => s.adulte).map((s) => s.n);
    for (const s of se.seances)
      if (s.niveau_min === 'adulte')
        for (const pid of s.phrases ?? s.vers ?? [])
          if (!matn.seances.some((x) => x.id !== s.id && !x.adulte && x.phrases.includes(pid)))
            expect(de.get(pid)!.adulte, pid).toBe(true);
    for (const u of unites)
      if (u.niveau_min === 'adulte' && de.has(u.id)) expect(de.get(u.id)!.adulte, u.id).toBe(true);
    for (const kind of ['enfant', 'ado'] as const) {
      const v = matnPour(matn, kind);
      expect(
        v.phrases.some((p) => p.adulte),
        kind,
      ).toBe(false);
      expect(
        v.seances.some((s) => s.adulte),
        kind,
      ).toBe(false);
      for (const n of sAdultes)
        expect(
          v.seances.some((s) => s.n === n),
          `${kind} ${n}`,
        ).toBe(false);
      for (const pid of adultes)
        expect(
          v.phrases.some((p) => p.id === pid),
          `${kind} ${pid}`,
        ).toBe(false);
      // tout ce qui reste est cohérent : chaque phrase d'une séance est dans les phrases
      const ids = new Set(v.phrases.map((p) => p.id));
      for (const s of v.seances) for (const pid of s.phrases) expect(ids.has(pid)).toBe(true);
    }
    expect(matnPour(matn, 'adulte').seances).toHaveLength(matn.seances.length);
    expect(matnPour(matn, 'adulte').phrases).toHaveLength(matn.phrases.length);
    // profil inconnu : jamais de contenu adulte
    expect(matnPour(matn, null).phrases.some((p) => p.adulte)).toBe(false);
    const pudeur = matn.seances.filter((s) => s.pudeur).map((s) => s.n);
    expect(matnPour(matn, 'enfant').seances.some((s) => s.pudeur)).toBe(false);
    for (const n of pudeur)
      expect(matnPour(matn, 'ado').seances.some((s) => s.n === n)).toBe(
        !matn.seances.find((s) => s.n === n)!.adulte,
      );
  });

  it('passages « présentés par le maître » : ni arabe ni traduction ni note, même pour un adulte', () => {
    const retenus = matn.phrases.filter((p) => p.explication).map((p) => p.id);
    for (const rid of retenus) {
      const p = de.get(rid) as Phrase;
      expect(p.ar).toBeUndefined();
      expect(p.h).toBeUndefined();
      expect(p.fr).toBeUndefined();
      expect(p.notes).toBeUndefined();
      expect(p.sens).toBeUndefined();
      const s = unites.find((u) => u.id === rid)!;
      expect(brut.includes(JSON.stringify(s.ar).slice(1, -1)), rid).toBe(false);
      const f = fr.phrases.find((x) => x.id === rid)!;
      expect(brut.includes(JSON.stringify(f.fr as string).slice(1, -1)), rid).toBe(false);
    }
    // règle : la séance sensible dont une note dit « le maître présente ce passage » est retenue en entier
    for (const s of se.seances) {
      const ids = s.phrases ?? s.vers ?? [];
      const notes = ids.flatMap((pid) => {
        const n = fr.phrases.find((x) => x.id === pid)?.note_explication as
          { texte: string } | Array<{ texte: string }> | undefined;
        return n ? [n].flat().map((x) => x.texte) : [];
      });
      if (
        s.relecture_comite &&
        s.niveau_min === 'adulte' &&
        notes.some((t) => NOTE_RETIENT.test(t))
      )
        for (const pid of ids) expect(retenus, `${s.id} ${pid}`).toContain(pid);
    }
    if (id === 'akhdari') expect(retenus).toEqual([...AVEC_EXPLICATION]);
    if (id === 'izziyya')
      expect(retenus).toEqual([
        'IZZ-0129',
        'IZZ-0130',
        'IZZ-0350',
        'IZZ-0351',
        'IZZ-0352',
        'IZZ-0353',
        'IZZ-0391',
        'IZZ-0452',
        'IZZ-0463',
        'IZZ-0471',
      ]);
    // leurs mots difficiles ne partent pas sans eux
    const sRetenues = matn.seances.filter((s) => s.phrases.every((pid) => retenus.includes(pid)));
    for (const s of sRetenues) expect(s.mots, s.id).toEqual([]);
  });

  it('mots difficiles : jamais de sens « à vérifier » ni de renvoi interne chez l’élève', () => {
    for (const s of matn.seances)
      for (const m of s.mots) {
        expect(/à vérifier|NON ÉTABLI|comité/i.test(m.fr), `${s.id} ${m.ar}`).toBe(false);
        expect(/\bR-[A-Z0-9]+|RAPPORT/.test(m.fr), `${s.id} ${m.ar}`).toBe(false);
      }
  });

  it('mémorisation : les vers se mémorisent (hémistiches à la suite) ; jamais un passage réservé', () => {
    const a = aMemoriser(matn.phrases);
    expect(a.length).toBeGreaterThan(5);
    for (const p of a) {
      expect(p.explication).toBeUndefined();
      expect(typeof arSimple(p)).toBe('string');
    }
    if (matn.phrases.some((p) => p.h)) for (const p of a) expect(p.h, p.id).toBeDefined();
  });

  it('quiz : au plus 5 questions, générées depuis les données, jamais sur un passage réservé ni une citation', () => {
    const vue = matnPour(matn, 'adulte');
    let avec = 0;
    for (const s of vue.seances) {
      const qs = genererQuiz(vue, s.n);
      expect(qs.length, s.id).toBeLessThanOrEqual(5);
      if (qs.length) avec++;
      for (const q of qs) {
        expect(new Set(q.options).size).toBe(3);
        if ('phrase' in q) {
          const p = de.get(q.phrase)!;
          expect(p.explication).toBeUndefined();
          expect(typeof p.ar === 'object').toBe(false);
          expect(s.phrases).toContain(q.phrase);
        }
      }
    }
    expect(avec).toBeGreaterThanOrEqual(Math.floor(vue.seances.length * 0.8));
    // enfants et ados : le quiz ne touche jamais à une phrase « adulte »
    for (const kind of ['enfant', 'ado'] as const) {
      const v = matnPour(matn, kind);
      for (const s of v.seances)
        for (const q of genererQuiz(v, s.n))
          if ('phrase' in q)
            expect(de.get(q.phrase)!.adulte, `${kind} ${q.phrase}`).toBeUndefined();
    }
  });

  it('renvois vers un autre texte : séance existante du texte désigné', () => {
    for (const s of matn.seances)
      for (const r of s.renvois ?? []) {
        expect(TEXTES).toContain(r.texte);
        expect(r.texte).not.toBe(id);
        const autre = lire<Matn>(join(SORTIE, `${r.texte}.json`));
        expect(
          autre.seances.some((x) => x.n === r.n),
          `${s.id} → ${r.texte}/${r.n}`,
        ).toBe(true);
      }
  });

  it('mode enseignant : tout ce qui est interne y est, pas chez l’élève', () => {
    const sources = unites.filter((u) => (u as { a_verifier?: unknown[] }).a_verifier?.length);
    for (const u of sources) {
      const enseigne = ens.phrases.some((x) => x.id === u.id) || de.get(u.id)?.explication;
      expect(enseigne, u.id).toBeTruthy();
      if (de.has(u.id) && !de.get(u.id)!.explication)
        expect(de.get(u.id)!.incertain, u.id).toBe(true);
    }
    expect(ens.version).toBe(matn.version);
  });
});

describe('ajouts propres à chaque texte', () => {
  const m = (id: string) => JSON.parse(readFileSync(join(SORTIE, `${id}.json`), 'utf8')) as Matn;

  it('Ājurrūmiyya : code visuel sans aucune couleur (soulignés et formes), listes et exemples chacun sur sa ligne', () => {
    const a = m('ajurrumiyya');
    expect(a.code!.etats.map((e) => e.style)).toEqual(['plein', 'double', 'ondule', 'tirete']);
    expect(JSON.stringify(a.code)).not.toMatch(/rouge|vert\b|bleu|couleur du tajw|#[0-9a-f]{3,6}/i);
    expect(a.code!.regles.join(' ')).not.toMatch(/tajw[iī]d/);
    expect(a.phrases.filter((p) => p.liste).length).toBe(21);
    expect(a.phrases.filter((p) => p.exemples).length).toBe(36);
    // explications d'al-Kafrāwī : une note sur 19 explications, versets Tanzil sur leur ligne
    const notes = a.phrases.flatMap((p) => p.notes ?? []);
    expect(notes).toHaveLength(19);
    expect(notes.flatMap((n) => n.q ?? []).length).toBeGreaterThanOrEqual(9);
  });

  it('Jazariyya : ordre de publication du référent ; rasm facultatif et réservé aux adultes', () => {
    const j = m('jazariyya');
    const ordre = lire<{ ordre_publication_13_10: { ordre: string[] } }>(
      join(SOURCES, 'jazariyya', 'seances.json'),
    ).ordre_publication_13_10.ordre;
    expect(j.seances.map((s) => s.id)).toEqual(ordre);
    const fac = j.seances.filter((s) => s.facultatif);
    expect(fac.map((s) => s.id)).toEqual(['JAZ-S23', 'JAZ-S24', 'JAZ-S25', 'JAZ-S26']);
    for (const s of fac) expect(s.adulte).toBe(true);
    expect(matnPour(j, 'ado').seances).toHaveLength(24);
    expect(matnPour(j, 'adulte').seances).toHaveLength(28);
    // la note destinée à l'élève (alignement) : apostrophes réparées
    expect(JSON.stringify(j)).not.toMatch(/\bs applique|\bl apprendre/);
  });

  it('vers : deux hémistiches par vers, intertitres de l’éditeur sans traduction', () => {
    for (const id of ['ibn-ashir', 'tuhfa', 'jazariyya']) {
      const x = m(id);
      expect(
        x.phrases.every((p) => p.h?.length === 2),
        id,
      ).toBe(true);
      expect(
        x.phrases.some((p) => p.titre),
        id,
      ).toBe(true);
    }
  });

  it('Ibn ʿĀshir : séances du taṣawwuf et du pèlerinage sensibles réservées aux adultes ; publication notée', () => {
    const x = m('ibn-ashir');
    expect(x.seances.filter((s) => s.adulte).map((s) => s.id)).toEqual([
      'IBA-S53',
      'IBA-S55',
      'IBA-S56',
      'IBA-S57',
      'IBA-S58',
    ]);
    const e = JSON.parse(
      readFileSync(join(SORTIE, 'ibn-ashir-enseignant.json'), 'utf8'),
    ) as NotesEnseignant;
    expect(e.publication).toMatch(/croyance .*IBA-S02 à S10/);
    expect(e.comite).toHaveLength(5);
  });

  it('versets cités avec leur sens (traduction de référence) : 22:7, 2:201, 25:48, 23:5-6…', () => {
    const a = m('ashmawiyya');
    expect(a.phrases.find((p) => p.id === 'ASH-0049')!.sens![0]!.ref).toBe('22:7');
    expect(a.phrases.find((p) => p.id === 'ASH-0049')!.fr).toContain('[…]');
    const z = m('izziyya');
    expect(z.phrases.find((p) => p.id === 'IZZ-0371')!.sens!.map((s) => s.ref)).toEqual([
      '23:5',
      '23:6',
    ]);
    for (const t of ['ashmawiyya', 'izziyya', 'akhdari'])
      expect(JSON.stringify(m(t))).not.toMatch(/traduction coranique|TRADUCTION DU|à insérer/i);
  });
});
