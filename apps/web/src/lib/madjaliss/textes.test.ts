import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ARABE_LIGNE,
  AVEC_EXPLICATION,
  CHAMPS_INTERNES,
  construire,
  DIFFERE,
  dossier,
  expanser,
  NOTE_RETIENT,
  PHRASE_INTERNE,
  SORTIE,
  SOURCE_INTERNE,
  SOURCES,
  STATUT,
  STATUTS_ACCEPTES,
  TEXTES,
  TRANSLIT,
  tanzil,
} from '../../../scripts/madjaliss.mjs';
import { CYCLES } from './cycles';
import {
  arSimple,
  avecArabe,
  matnPour,
  segments,
  texteVoixSynthese,
  voitDiffere,
  type Matn,
  type NotesEnseignant,
  type Phrase,
} from './donnees';
import { aMemoriser } from './memo';
import { genererQuiz } from './quiz';

/**
 * Les dix textes des lots Madjaliss 2 et 3 (al-Akhḍarī, al-ʿAshmāwiyya, Tuḥfat al-Aṭfāl, Ibn ʿĀshir, al-ʿIzziyya,
 * al-Ājurrūmiyya, al-Jazariyya, al-Bayqūniyya, les Quarante hadiths d'an-Nawawī, al-Waraqāt) : MÊMES contrôles pour
 * chacun, à partir des sources du référent. Données à jour, arabe intact octet par octet, citations coraniques
 * identiques à Tanzil et jamais lues par une voix de synthèse, aucun champ interne ni lettre latine dans l'arabe,
 * mots arabes isolés `{ar:K}`, niveaux (adulte, pudeur), publication différée, statut.
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
  bayquniyya: [34, 14],
  nawawi: [42, 42],
  waraqat: [139, 26],
};

type SrcCoran = { sourate: number; verset: number; texte: string; voix_de_synthese?: boolean };
type SrcPhrase = {
  id: string;
  ar: string;
  /** hadith d'an-Nawawī : introduction et matn (le texte appris), versets cités */
  intro_ar?: string;
  matn_ar?: string;
  type?: string;
  section?: string;
  niveau_min?: string;
  coran?:
    | {
        segments?: Array<{ sourate: number; verset: number; texte: string }>;
        sourate?: number;
        verset?: number;
        texte?: string;
        voix_de_synthese?: boolean;
      }
    | SrcCoran[]
    | Array<{ ref: string; texte_tanzil: string; voix_de_synthese?: boolean }>;
};
type SrcSeance = {
  id: string;
  phrases?: string[];
  vers?: string[];
  hadith?: string[];
  niveau_min?: string;
  relecture_comite?: boolean;
  facultatif?: boolean;
  ordre_publication?: number;
};

/** Mots translittérés (hors noms propres) dans le français affiché, mesurés le 13/10/2026 : plafond, jamais à relever. */
const PLAFOND_TRANSLIT: Record<string, number> = {
  akhdari: 91,
  ashmawiyya: 91,
  tuhfa: 151,
  'ibn-ashir': 110,
  izziyya: 473,
  ajurrumiyya: 269,
  jazariyya: 368,
  bayquniyya: 92,
  nawawi: 157,
  waraqat: 57,
};

type SrcNote = { texte: string; mots_ar?: string[]; texte_avec_arabe_interne?: string };
type SrcHadith = {
  id: string;
  takhrij_nawawi_ar: string;
  degre_affiche: { discute: boolean; juges: unknown[] };
  version_recueil_affichee?: unknown[];
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
  it('les dix textes intégrés sont rangés par cycle, comme dans le plan directeur', () => {
    const ordre = CYCLES.flatMap((c) => c.textes.map((x) => x.id)).filter((id) =>
      TEXTES.includes(id),
    );
    expect(ordre).toEqual([
      'akhdari',
      'ashmawiyya',
      'nawawi',
      'tuhfa',
      'ibn-ashir',
      'izziyya',
      'bayquniyya',
      'ajurrumiyya',
      'jazariyya',
      'waraqat',
    ]);
    expect([...TEXTES].sort()).toEqual([...ordre].sort());
    expect(CYCLES.map((c) => c.n)).toEqual([1, 2, 3, 4]);
  });
});

describe.each(TEXTES)('texte %s', (id) => {
  const dir = dossier(id);
  const ar = lire<{ phrases?: SrcPhrase[]; vers?: SrcPhrase[]; hadiths?: SrcPhrase[] }>(
    join(dir, 'texte_ar.json'),
  );
  const unites = (ar.phrases ?? ar.vers ?? ar.hadiths)!;
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
      if (s.matn_ar !== undefined) {
        // hadith : introduction + matn d'an-Nawawī (Būlāq 1321), séparés au plus par une espace, octet par octet
        expect(
          [`${s.intro_ar}${s.matn_ar}`, `${s.intro_ar} ${s.matn_ar}`].map(octets),
          s.id,
        ).toContain(octets(p.ar as string));
      } else if (p.h) expect(octets(p.h.join(' * ')), s.id).toBe(octets(s.ar));
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
    // segments cités par la source : objet (un segment ou `segments`), liste (Waraqāt) ou versets d'un hadith
    const segsDe = (p: SrcPhrase): Array<SrcCoran & { voix?: boolean }> => {
      const c = p.coran;
      if (!c) return [];
      if (Array.isArray(c))
        return (c as Array<Record<string, unknown>>).map((x) =>
          typeof x.ref === 'string'
            ? {
                sourate: Number(x.ref.split(':')[0]),
                verset: Number(x.ref.split(':')[1]),
                texte: x.texte_tanzil as string,
                voix: x.voix_de_synthese as boolean,
              }
            : { ...(x as unknown as SrcCoran), voix: x.voix_de_synthese as boolean },
        );
      const o = c as { segments?: SrcCoran[]; sourate?: number; verset?: number; texte?: string };
      return (o.segments ?? [{ sourate: o.sourate!, verset: o.verset!, texte: o.texte! }]).map(
        (x) => ({ ...x, voix: (c as { voix_de_synthese?: boolean }).voix_de_synthese }),
      );
    };
    for (const p of unites) {
      const segs = segsDe(p);
      if (!segs.length) continue;
      for (const s of segs) expect(s.voix, p.id).toBe(false);
      const livre = de.get(p.id)!;
      for (const s of segs) {
        const ligne = lignes.get(`${s.sourate}:${s.verset}`)!;
        expect(Buffer.from(ligne, 'utf8').includes(Buffer.from(s.texte, 'utf8')), p.id).toBe(true);
        if (!livre.explication)
          expect(
            cites.some((c) => c.id === p.id && c.q.includes(s.texte)) ||
              (livre.q ?? []).some((c) => c.q === s.texte),
            `${p.id} ${s.sourate}:${s.verset}`,
          ).toBe(true);
      }
    }
    for (const c of cites) expect(c.ref, c.id).toMatch(/^\d+:\d+(-\d+)?$/);
    // garde : une phrase qui cite le Coran ou qui est réservée n'est JAMAIS donnée à une voix de synthèse
    for (const p of matn.phrases) {
      const v = texteVoixSynthese(p);
      if (typeof p.ar === 'object' || p.explication || p.q?.length) expect(v, p.id).toBeNull();
      else expect(v, p.id).toBe(arSimple(p));
      if (v) for (const c of cites) expect(v.includes(c.q), p.id).toBe(false);
      // jamais pour un segment coranique ni un hadith qui cite le Coran
      if (p.q?.length || p.sens?.length) expect(v, p.id).toBeNull();
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
          /brouillon|decision|verification|collation|a_verifier|voyelle_a_confirmer|consulte_interne|lacune|source_formule|statut_compte|motif_relecture|interne|translit_|rattachement_mashhur/.test(
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
    expect(brut).not.toMatch(
      /translit_interne|matn_ar_base_numerique|fr_translit|texte_avec_arabe_interne|brouillon_non_publiable|rattachement_mashhur|mots_ar_note|voyelle_a_confirmer|collation|a_verifier/,
    );
    // l'ancien libellé du statut n'est nulle part, ni dans les données de l'élève ni dans celles de l'enseignant
    expect(brut + brutEns).not.toMatch(/VALIDATION_HUMAINE|validation humaine/i);
  });

  it('l’arabe est toujours sur sa ligne et ne porte aucune lettre latine (translittération)', () => {
    const arabes: string[] = [];
    for (const p of matn.phrases) {
      arabes.push(...(p.h ?? []));
      for (const s of segments(p)) arabes.push(typeof s === 'string' ? s : s.q);
      arabes.push(...(p.liste ?? []).map((x) => x.ar), ...(p.exemples ?? []).map((x) => x.ar));
      if (p.titre) arabes.push(p.titre);
      for (const n of p.notes ?? [])
        arabes.push(...(n.ar ?? []), ...(n.q ?? []).map((q) => q.q), ...(n.ma ?? []));
      arabes.push(...(p.ma ?? []), ...(p.q ?? []).map((q) => q.q));
      if (p.hadith) {
        if (p.hadith.tk?.ar) arabes.push(p.hadith.tk.ar);
        for (const v of p.hadith.v ?? []) arabes.push(v.ar);
      }
    }
    for (const s of matn.seances) arabes.push(...s.mots.map((m) => m.ar), ...(s.tma ?? []));
    for (const c of matn.code?.etats ?? []) arabes.push(c.ar);
    expect(arabes.length).toBeGreaterThan(20);
    for (const a of arabes) expect(LATIN.test(a), a.slice(0, 60)).toBe(false);
    // AUCUNE phonétique latine en guise d'arabe : le français ne porte jamais de lettre arabe (hors ﷺ) — les mots arabes
    // isolés sont des marqueurs `{ar:K}` (affichés en arabe, vocalisés), chacun renvoyant à un mot de `ma`
    const francais: Array<[string, string, string[] | undefined]> = [];
    for (const p of matn.phrases) {
      if (p.fr !== undefined) francais.push([p.id, p.fr, p.ma]);
      for (const n of p.notes ?? []) francais.push([`${p.id} (note)`, n.texte, n.ma]);
      for (const x of p.liste ?? []) francais.push([`${p.id} (liste)`, x.fr, undefined]);
      for (const x of p.exemples ?? []) francais.push([`${p.id} (exemple)`, x.fr, undefined]);
      if (p.hadith) {
        francais.push([`${p.id} (takhrij)`, p.hadith.tk?.fr.texte ?? '', p.hadith.tk?.fr.ma]);
        francais.push([`${p.id} (degré)`, p.hadith.deg.texte, p.hadith.deg.ma]);
        for (const v of p.hadith.v ?? [])
          for (const d of v.d ?? []) francais.push([`${p.id} (version)`, d.texte, d.ma]);
      }
    }
    for (const s of matn.seances) francais.push([s.id, s.titre, s.tma]);
    for (const [où, texte, ma] of francais) {
      expect(ARABE_LIGNE.test(texte), `${où} : lettre arabe dans le français`).toBe(false);
      const ks = [...texte.matchAll(/\{ar:(\d+)\}/g)].map((m) => Number(m[1]));
      for (const k of ks) expect(ma?.[k], `${où} : {ar:${k}}`).toBeTruthy();
      expect(ma === undefined || ks.length > 0, `${où} : mots arabes inutilisés`).toBe(true);
      // le texte réaffiché contient bien l'arabe à la place des marqueurs
      if (ks.length) expect(ARABE_LIGNE.test(avecArabe(texte, ma))).toBe(true);
    }
  });

  it('niveau « adulte » : jamais aux enfants ni aux ados ; chapitres de pudeur : jamais aux enfants', () => {
    const adultes = matn.phrases.filter((p) => p.adulte).map((p) => p.id);
    const sAdultes = matn.seances.filter((s) => s.adulte).map((s) => s.n);
    for (const s of se.seances)
      if (s.niveau_min === 'adulte')
        for (const pid of s.phrases ?? s.vers ?? s.hadith ?? [])
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
    // (les séances en publication différée ne sont vues que du personnel et de la démonstration)
    const nDiffere = matn.seances.filter((s) => s.differe).length;
    expect(matnPour(matn, 'adulte', true).seances).toHaveLength(matn.seances.length);
    expect(matnPour(matn, 'adulte', true).phrases).toHaveLength(matn.phrases.length);
    expect(matnPour(matn, 'adulte').seances).toHaveLength(matn.seances.length - nDiffere);
    // profil inconnu : jamais de contenu adulte
    expect(matnPour(matn, null).phrases.some((p) => p.adulte)).toBe(false);
    const pudeur = matn.seances.filter((s) => s.pudeur).map((s) => s.n);
    expect(matnPour(matn, 'enfant').seances.some((s) => s.pudeur)).toBe(false);
    for (const n of pudeur)
      expect(matnPour(matn, 'ado').seances.some((s) => s.n === n)).toBe(
        !matn.seances.find((s) => s.n === n)!.adulte &&
          !matn.seances.find((s) => s.n === n)!.differe,
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
      const ids = s.phrases ?? s.vers ?? s.hadith ?? [];
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
    const vue = matnPour(matn, 'adulte', true);
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

describe('lot 3 : publication différée, hadiths, Bayqūniyya, Waraqāt, mots arabes isolés, statut', () => {
  const m = (id: string) => JSON.parse(readFileSync(join(SORTIE, `${id}.json`), 'utf8')) as Matn;
  const ens = (id: string) =>
    JSON.parse(readFileSync(join(SORTIE, `${id}-enseignant.json`), 'utf8')) as NotesEnseignant;

  it('publication différée : IBA-S02 à S10 masquées aux invités de la bêta, vues du personnel et de la démonstration', () => {
    const x = m('ibn-ashir');
    const ids = x.seances.filter((s) => s.differe).map((s) => s.id);
    expect(ids).toEqual(DIFFERE['ibn-ashir']!.seances);
    expect(ids).toEqual([
      'IBA-S02',
      'IBA-S03',
      'IBA-S04',
      'IBA-S05',
      'IBA-S06',
      'IBA-S07',
      'IBA-S08',
      'IBA-S09',
      'IBA-S10',
    ]);
    // invité (ni personnel ni démonstration) : ni les séances ni leurs phrases, quel que soit son profil
    for (const kind of ['adulte', 'ado', 'enfant', null] as const) {
      const v = matnPour(x, kind);
      expect(
        v.seances.some((s) => s.differe),
        String(kind),
      ).toBe(false);
      const cachees = new Set(x.seances.filter((s) => s.differe).flatMap((s) => s.phrases));
      expect(
        v.phrases.some((p) => cachees.has(p.id)),
        String(kind),
      ).toBe(false);
    }
    // personnel et démonstration : toutes les séances
    expect(matnPour(x, 'adulte', true).seances).toHaveLength(58);
    expect(matnPour(x, 'adulte').seances).toHaveLength(49);
    // la consigne est écrite dans les données de l'enseignant (affichée en mode enseignant)
    const e = ens('ibn-ashir');
    expect(e.differe).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(e.consigne_differe).toMatch(/masquées aux invités de la bêta/);
    expect(e.publication).toMatch(/croyance \(IBA-S02 à S10\)/);
    // aucun autre texte n'a de séance différée
    for (const id of TEXTES.filter((t) => t !== 'ibn-ashir'))
      expect(
        m(id).seances.some((s) => s.differe),
        id,
      ).toBe(false);
    // qui voit : personnel, compte de démonstration ; pas un invité, pas un visiteur inconnu
    const invite = { account: { email: 'invite@exemple.org' } };
    expect(voitDiffere(invite, false)).toBe(false);
    expect(voitDiffere(null, false)).toBe(false);
    expect(voitDiffere(invite, true)).toBe(true);
    expect(voitDiffere({ account: { email: 'adulte-x7k@demo.awform.test' } }, false)).toBe(true);
    expect(voitDiffere({ account: { email: 'adulte@demo.awform.test.evil.org' } }, false)).toBe(
      false,
    );
  });

  it('Quarante hadiths : texte d’an-Nawawī, takhrīj, degré (« authenticité discutée » avec juge nommé), version du recueil dessous', () => {
    const x = m('nawawi');
    const src = lire<{ hadiths: SrcHadith[] }>(join(dossier('nawawi'), 'texte_ar.json')).hadiths;
    expect(x.phrases).toHaveLength(42);
    const discutes = ['12', '18', '27', '29', '30', '31', '32', '39', '41', '42'].map(
      (n) => `NAW-H${n}`,
    );
    for (const h of src) {
      const p = x.phrases.find((q) => q.id === h.id)!;
      expect(p.hadith, h.id).toBeDefined();
      expect(p.hadith!.tk?.ar, h.id).toBe(h.takhrij_nawawi_ar);
      expect(p.hadith!.deg.texte.length, h.id).toBeGreaterThan(10);
      const discute = /^authenticité discutée/.test(p.hadith!.deg.texte);
      expect(discute, h.id).toBe(discutes.includes(h.id));
      expect(discute, h.id).toBe(h.degre_affiche.discute);
      if (discute) expect(h.degre_affiche.juges.length, h.id).toBeGreaterThan(0);
      // version du recueil : sous le texte d'an-Nawawī (jamais à sa place), arabe du recueil
      const v = p.hadith!.v ?? [];
      expect(v.length, h.id).toBe((h.version_recueil_affichee ?? []).length);
      for (const r of v) expect(ARABE_LIGNE.test(r.ar), h.id).toBe(true);
      expect(typeof p.ar, h.id).toBe('string');
    }
    expect(x.phrases.filter((p) => p.hadith!.v?.length)).toHaveLength(19);
    // hadith 4 : ordre des récits (alerte d'al-Bukhārī) et différences consignées
    const h4 = x.phrases.find((p) => p.id === 'NAW-H04')!;
    expect(h4.notes!.some((n) => /n° 7454.*n° 3208/.test(n.texte))).toBe(true);
    expect(h4.hadith!.v!.some((r) => r.d && r.d.length > 2)).toBe(true);
    // prudence des hadiths 31 et 41 ; glose du hadith 22 ; contexte sobre des passages sensibles
    for (const id of ['NAW-H31', 'NAW-H41'])
      expect(
        x.phrases.find((p) => p.id === id)!.notes!.some((n) => /^Prudence/.test(n.texte)),
        id,
      ).toBe(true);
    expect(x.phrases.find((p) => p.id === 'NAW-H22')!.notes!.some((n) => n.ar?.length)).toBe(true);
    expect(x.phrases.filter((p) => p.notes?.length).length).toBeGreaterThanOrEqual(12);
    // les versets cités dans un hadith (10 et 29) : Tanzil, jamais lus par une voix de synthèse
    for (const id of ['NAW-H10', 'NAW-H29']) {
      const p = x.phrases.find((q) => q.id === id)!;
      expect(p.q!.length).toBe(2);
      expect(texteVoixSynthese(p), id).toBeNull();
      expect(p.t).toBe('citation_hadith');
    }
    // une séance par hadith ; cycles du référent
    expect(x.seances.map((s) => s.phrases)).toEqual(x.phrases.map((p) => [p.id]));
  });

  it('Bayqūniyya : 34 vers à deux hémistiches, notes d’écart avec la page de l’imprimé', () => {
    const x = m('bayquniyya');
    expect(x.phrases.every((p) => p.t === 'vers' && p.h?.length === 2)).toBe(true);
    const notes = x.phrases.flatMap((p) => p.notes ?? []);
    expect(notes.filter((n) => n.k === 'ecart').length).toBeGreaterThanOrEqual(6);
    const p12 = x.phrases.find((p) => p.id === 'BAY-0012')!;
    expect(p12.notes![0]!.sources![0]).toMatch(/Nuzhat an-naẓar.*p\. 47-48/);
    expect(p12.notes![0]!.texte).toMatch(/^Selon Ibn Ḥajar/);
    // ni consigne du référent ni nom de champ chez l'élève
    expect(JSON.stringify(x)).not.toMatch(/regle|decision|R-E1|az_zurqani/);
  });

  it('Waraqāt : note obligatoire de l’école mālikite (17 phrases), versets avec leur sens, sans « ﴿ … ﴾ » dans le français', () => {
    const x = m('waraqat');
    const mal = x.phrases.filter((p) => p.notes?.some((n) => n.k === 'malikite'));
    expect(mal).toHaveLength(17);
    for (const p of mal) {
      const n = p.notes!.find((q) => q.k === 'malikite')!;
      expect(n.texte.length).toBeGreaterThan(40);
    }
    const p45 = x.phrases.find((p) => p.id === 'WRQ-0045')!;
    expect(p45.sens!.map((s) => s.ref)).toEqual(['74:42', '74:43']);
    expect(p45.fr).toContain('[…]');
    for (const p of x.phrases) expect(p.fr ?? '', p.id).not.toMatch(/[﴿﴾]|sens_verset/);
    expect(x.phrases.find((p) => p.id === 'WRQ-0001')!.t).toBe('formule');
    // aucun passage retenu : aucune note ne demande la présentation par le maître (règle des textes précédents)
    expect(x.phrases.filter((p) => p.explication)).toHaveLength(0);
  });

  it('mots arabes isolés : schéma {ar:K} + mots_ar, texte rétabli identique à l’ancien texte du référent', () => {
    const lireFr = (id: string) =>
      lire<{ phrases: Array<{ id: string; note_explication?: SrcNote | SrcNote[] }> }>(
        join(dossier(id), 'traduction_fr.json'),
      ).phrases;
    // Ibn ʿĀshir : 24 notes, ʿIzziyya : 4 notes
    for (const [id, n] of [
      ['ibn-ashir', 24],
      ['izziyya', 4],
    ] as const) {
      const avec = lireFr(id).filter((p) =>
        [p.note_explication ?? []].flat().some((x) => x.mots_ar),
      );
      expect(avec, id).toHaveLength(n);
      for (const p of avec)
        for (const x of [p.note_explication].flat() as SrcNote[])
          if (x.mots_ar)
            expect(expanser(x.texte, x.mots_ar), p.id).toBe(x.texte_avec_arabe_interne);
    }
    // Jazariyya : JAZ-0008 et JAZ-0067 ; Waraqāt : 52 phrases (55 portent mots_ar, 3 le laissent vide)
    const jaz = m('jazariyya');
    for (const id of ['JAZ-0008', 'JAZ-0067']) {
      const p = jaz.phrases.find((q) => q.id === id)!;
      expect(p.fr).toMatch(/\{ar:0\}/);
      expect(p.ma!.length).toBeGreaterThan(1);
      expect(ARABE_LIGNE.test(p.fr!)).toBe(false);
      expect(ARABE_LIGNE.test(avecArabe(p.fr!, p.ma))).toBe(true);
    }
    expect(jaz.phrases.find((p) => p.id === 'JAZ-0008')!.ma).toEqual(['ة', 'ت']);
    expect(m('waraqat').phrases.filter((p) => p.ma?.length)).toHaveLength(52);
    // titre de séance (Waraqāt S25, S26) : mot arabe isolé
    const w = m('waraqat');
    expect(w.seances.filter((s) => s.tma?.length).map((s) => s.id)).toEqual(['WRQ-S25', 'WRQ-S26']);
    expect(w.seances[24]!.titre).toBe('Le {ar:0}');
    // aucune phonétique entre parenthèses dans les mots difficiles (le mot est en arabe)
    for (const id of TEXTES)
      for (const s of m(id).seances)
        for (const mot of s.mots)
          expect(mot.fr, `${id} ${s.id}`).not.toMatch(/\([a-zʿʾ'’\- ]*[ḥṣḍṭẓāīūʿʾ][^)]*\)/);
  });

  it('translittération latine dans le français affiché : aucune nouvelle (plafond mesuré), noms propres exceptés', () => {
    const PLAFOND: Record<string, number> = PLAFOND_TRANSLIT;
    const estNom = (w: string) =>
      /^[ʿʾ'’]?[A-ZÀ-ÖḤṢḌṬẒĀĪŪ]/.test(w) ||
      w.split('-').some((p) => /^[ʿʾ'’]?[A-ZḤṢḌṬẒĀĪŪ]/.test(p));
    for (const id of TEXTES) {
      const x = m(id);
      const champs: string[] = [];
      for (const p of x.phrases) {
        champs.push(p.fr ?? '', ...(p.notes ?? []).map((n) => n.texte));
        champs.push(...(p.liste ?? []).map((l) => l.fr), ...(p.exemples ?? []).map((l) => l.fr));
        if (p.hadith) {
          champs.push(p.hadith.tk?.fr.texte ?? '', p.hadith.deg.texte);
          for (const v of p.hadith.v ?? []) champs.push(...(v.d ?? []).map((d) => d.texte));
        }
      }
      for (const s of x.seances) champs.push(s.titre, ...s.mots.map((w) => w.fr));
      let n = 0;
      for (const c of champs)
        for (const mot of c.replace(/\{ar:\d+\}/g, ' ').match(/[\p{L}ʿʾ'’-]+/gu) ?? [])
          if (TRANSLIT.test(mot) && !estNom(mot)) n++;
      expect(n, `${id} : ${n} mots translittérés (plafond ${PLAFOND[id]})`).toBeLessThanOrEqual(
        PLAFOND[id]!,
      );
    }
  });

  it('mention de statut : texte unique du client partout, ancien libellé nulle part', () => {
    const MENTION =
      "Tranché par le référent selon l'école mālikite (mashhūr), sources citées. En attente d'une seconde lecture savante.";
    const i18n = fileURLToPath(new URL('../../../static/i18n/', import.meta.url));
    expect(lire<Record<string, string>>(join(i18n, 'fr-madjaliss.json'))['mj.statut']).toBe(
      MENTION,
    );
    for (const l of ['en', 'es', 'de', 'ar'])
      expect(lire<Record<string, string>>(join(i18n, `${l}.json`))['mj.statut'], l).toBeTruthy();
    for (const f of readdirSync(i18n).filter((n) => n.endsWith('.json')))
      expect(readFileSync(join(i18n, f), 'utf8'), f).not.toMatch(
        /VALIDATION_HUMAINE|validation humaine requise|À valider par un humain/i,
      );
    for (const id of TEXTES)
      for (const f of [`${id}.json`, `${id}-enseignant.json`])
        expect(readFileSync(join(SORTIE, f), 'utf8'), f).not.toMatch(/VALIDATION_HUMAINE/i);
    expect(STATUT).toBe('EN_ATTENTE_SECONDE_LECTURE');
    expect([...STATUTS_ACCEPTES]).toEqual([STATUT]);
  });
});
