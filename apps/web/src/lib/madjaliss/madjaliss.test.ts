import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import {
  AVEC_EXPLICATION,
  construire,
  MOT_A_PRECISER,
  SENS_A_VERIFIER,
  SORTIE,
  SORTIE_PROTEGEE,
  SOURCES,
  STATUT,
  tanzil,
} from '../../../scripts/madjaliss.mjs';
import { CYCLES, cycleConseille } from './cycles';
import { chargerMatn, segments, seancesPour, type Matn, type NotesEnseignant } from './donnees';
import { aMemoriser, apresEval, chargerMoteur, lireCarnet, masques, noter } from './memo';
import { genererQuiz, motsACompleter, questionnable } from './quiz';
import { lireProgres, marquerFaite, seanceEnCours, toutFait } from './progression';

/**
 * Madjaliss (P3-1) : données construites depuis les seules sources du référent, texte arabe INTACT octet par octet,
 * AKH-0052 jamais livré sans son explication, mots du Coran repris de Tanzil, quiz généré automatiquement.
 */
type Source = { id: string; type: string; ar: string; a_verifier?: string[] };
const lire = <T>(p: string) => JSON.parse(readFileSync(p, 'utf8')) as T;
const src = lire<{ phrases: Source[] }>(join(SOURCES, 'akhdari', 'texte_ar.json'));
const srcFr = lire<{
  phrases: Array<{ id: string; fr: string; brouillon_non_publiable?: string }>;
}>(join(SOURCES, 'akhdari', 'traduction_fr.json'));
const brut = readFileSync(join(SORTIE, 'akhdari.json'), 'utf8');
const matn = JSON.parse(brut) as Matn;
const brutEns = readFileSync(join(SORTIE_PROTEGEE, 'akhdari-enseignant.json'), 'utf8');
const notes = JSON.parse(brutEns) as NotesEnseignant;
const de = new Map(matn.phrases.map((p) => [p.id, p]));
const octets = (s: string) => Buffer.from(s, 'utf8').toString('hex');

describe('données construites (static/mutun)', () => {
  it('sont à jour avec les sources (node scripts/madjaliss.mjs)', () => {
    const { eleve, enseignant } = construire('akhdari');
    expect(`${JSON.stringify(eleve)}\n`).toBe(brut);
    expect(`${JSON.stringify(enseignant)}\n`).toBe(brutEns);
  });

  it('233 phrases, 44 séances, statut EN_ATTENTE_SECONDE_LECTURE (jamais « validation humaine requise »)', () => {
    expect(matn.phrases).toHaveLength(233);
    expect(matn.seances).toHaveLength(44);
    expect(matn.statut).toBe(STATUT);
    expect(STATUT).toBe('EN_ATTENTE_SECONDE_LECTURE');
    expect(brut).not.toMatch(/VALIDATION_HUMAINE|validation humaine/i);
    const toutes = matn.seances.flatMap((s) => s.phrases);
    expect(new Set(toutes).size).toBe(233);
  });

  it('texte arabe de l’auteur INTACT, octet par octet (jamais normalisé)', () => {
    for (const s of src.phrases) {
      if (AVEC_EXPLICATION.has(s.id) || ['AKH-0015', 'AKH-0132'].includes(s.id)) continue;
      const p = de.get(s.id)!;
      expect(typeof p.ar, s.id).toBe('string');
      expect(octets(p.ar as string), s.id).toBe(octets(s.ar));
    }
    // citation intégrée (AKH-0132, T7) : texte de l'auteur, puis les mots de Tanzil entre les ornements, à l'identique
    const [avant, q, apres] = segments(de.get('AKH-0132')!);
    const mots = (q as { q: string }).q;
    expect(octets(`${avant as string}\u{FD3F}${mots}\u{FD3E}${apres as string}`)).toBe(
      octets(src.phrases.find((x) => x.id === 'AKH-0132')!.ar),
    );
    // AKH-0015 (T7, 12/10) : la citation 9:62 est copiée de Tanzil dans la source, en fin de phrase, entre ﴿﴾
    const [avant15, q15, ...reste] = segments(de.get('AKH-0015')!);
    expect(reste).toHaveLength(0);
    const s15 = src.phrases.find((x) => x.id === 'AKH-0015')! as Source & {
      coran?: { texte: string; voix_de_synthese: boolean };
    };
    expect(octets(`${avant15 as string}\u{FD3F}${(q15 as { q: string }).q}\u{FD3E}`)).toBe(
      octets(s15.ar),
    );
    expect(s15.coran?.texte).toBe((q15 as { q: string }).q);
    expect(s15.coran?.voix_de_synthese).toBe(false);
  });

  it('mots du Coran cités : sous-chaînes EXACTES de Tanzil (AKH-0015 : 9:62, AKH-0132 : 29:45)', () => {
    const lignes = tanzil();
    const cites = matn.phrases.flatMap((p) =>
      segments(p).flatMap((s) => (typeof s === 'string' ? [] : [{ id: p.id, ...s }])),
    );
    expect(cites.map((c) => `${c.id} ${c.ref}`)).toEqual(['AKH-0015 9:62', 'AKH-0132 29:45']);
    for (const c of cites) {
      const ligne = lignes.get(c.ref)!;
      expect(ligne.includes(c.q), c.ref).toBe(true);
      expect(Buffer.from(ligne, 'utf8').includes(Buffer.from(c.q, 'utf8'))).toBe(true);
    }
    // 9:62 : « depuis وَاللَّهُ وَرَسُولُهُ jusqu'à la fin du verset »
    const q15 = cites[0]!.q;
    expect(lignes.get('9:62')!.endsWith(q15)).toBe(true);
    expect(q15.split(' ')).toHaveLength(8);
    // jamais l'emplacement ni le brouillon non publiable
    expect(brut).not.toMatch(/\[TANZIL|À INSÉRER|\[TRADUCTION/);
    for (const f of srcFr.phrases)
      if (f.brouillon_non_publiable) expect(brut).not.toContain(f.brouillon_non_publiable);
  });

  it('AKH-0052 n’est jamais livré sans son explication (ni l’arabe, ni la traduction)', () => {
    const p = de.get('AKH-0052')!;
    expect(p.explication).toBe(true);
    expect(p.ar).toBeUndefined();
    expect(p.fr).toBeUndefined();
    const ar = src.phrases.find((x) => x.id === 'AKH-0052')!.ar;
    const fr = srcFr.phrases.find((x) => x.id === 'AKH-0052')!.fr;
    for (const f of [brut, brutEns]) {
      expect(f).not.toContain(ar);
      expect(f).not.toContain(fr);
      expect(f).not.toContain('كَافِرٌ');
    }
    // son mot difficile propre part avec lui (mode enseignant seulement)
    expect(matn.seances[12]!.mots.map((m) => m.ar)).not.toContain('وَالْعِيَاذُ بِاللَّهِ');
    expect(notes.mots.some((m) => m.motif === 'explication')).toBe(true);
  });

  it('variantes, vocalisations « à vérifier » et sens non établis : mode enseignant seulement', () => {
    expect(brut).not.toMatch(/a_verifier|variantes|à vérifier|NON ÉTABLI/);
    for (const s of matn.seances)
      for (const m of s.mots) expect(SENS_A_VERIFIER.test(m.fr)).toBe(false);
    expect(notes.phrases.length).toBeGreaterThan(20);
    expect(notes.mots.filter((m) => m.motif === 'sens')).toHaveLength(3);
    // les phrases « incertaines » le restent pour l'élève (aucune question « compléter »)
    for (const s of src.phrases)
      if (s.a_verifier?.length && !AVEC_EXPLICATION.has(s.id))
        expect(de.get(s.id)!.incertain, s.id).toBe(true);
  });

  it('jamais une translittération sans explication : wadhaḥ et khazz remplacés chez l’élève', () => {
    for (const id of ['AKH-0023', 'AKH-0024']) {
      const fr = de.get(id)!.fr!;
      expect(fr, id).toContain(MOT_A_PRECISER);
      expect(fr, id).not.toMatch(/wadhaḥ|khazz/);
    }
    expect(brut).not.toMatch(/wadhaḥ|khazz/);
    expect(notes.phrases.find((p) => p.id === 'AKH-0024')!.a_verifier.join(' ')).toMatch(
      /NON ÉTABLI/,
    );
  });

  it('mémorisation : le matn seulement (ni formule, ni basmala, ni titre, ni citation)', () => {
    const s1 = matn.seances[0]!.phrases.map((id) => de.get(id)!);
    expect(aMemoriser(s1).map((p) => p.id)).toEqual(['AKH-0002', 'AKH-0003', 'AKH-0004']);
    const tout = aMemoriser(matn.phrases);
    expect(tout.every((p) => p.t === 'texte' && typeof p.ar === 'string')).toBe(true);
    expect(tout.map((p) => p.id)).not.toContain('AKH-0052');
  });

  it('titres arabes du cursus vocalisés', () => {
    for (const x of CYCLES.flatMap((c) => c.textes)) expect(/[ً-ْ]/.test(x.ar), x.id).toBe(true);
  });

  it('chapitres des règles et des lochies : ados et adultes seulement', () => {
    const pudeur = matn.seances.filter((s) => s.pudeur).map((s) => s.n);
    expect(pudeur.length).toBeGreaterThan(0);
    expect(seancesPour(matn, 'enfant').some((s) => s.pudeur)).toBe(false);
    expect(seancesPour(matn, 'ado')).toHaveLength(44);
    expect(seancesPour(matn, 'adulte')).toHaveLength(44);
  });
});

describe('quiz généré depuis les données', () => {
  it('3 à 5 questions pour CHAQUE séance, toutes vérifiables dans les données', () => {
    for (const s of matn.seances) {
      const qs = genererQuiz(matn, s.n);
      expect(qs.length, `séance ${s.n}`).toBeGreaterThanOrEqual(3);
      expect(qs.length, `séance ${s.n}`).toBeLessThanOrEqual(5);
      for (const q of qs) {
        expect(new Set(q.options).size).toBe(q.options.length);
        expect(q.options.length).toBe(3);
        const bonne = q.options[q.bonne]!;
        if (q.type === 'traduction') {
          expect(s.phrases).toContain(q.phrase);
          expect(bonne).toBe(de.get(q.phrase)!.fr);
          expect(q.ar).toBe(de.get(q.phrase)!.ar);
        } else if (q.type === 'completer') {
          const p = de.get(q.phrase)!;
          expect(s.phrases).toContain(q.phrase);
          expect(p.incertain).toBeUndefined();
          expect(`${q.avant} ${bonne}${q.apres}`).toBe(p.ar);
        } else expect(s.mots).toContainEqual({ ar: q.ar, fr: bonne });
        if ('phrase' in q) {
          expect(q.phrase).not.toBe('AKH-0052');
          expect(questionnable(de.get(q.phrase)!)).toBe(true);
        }
      }
    }
  });

  it('jamais sur un passage réservé, une citation (Coran, hadith), un titre ni une formule', () => {
    for (const id of ['AKH-0052', 'AKH-0015', 'AKH-0016', 'AKH-0132', 'AKH-0001', 'AKH-0020'])
      expect(questionnable(de.get(id)!), id).toBe(false);
  });

  it('déterministe (même graine, même quiz) ; une autre graine peut en donner un autre', () => {
    expect(genererQuiz(matn, 3)).toEqual(genererQuiz(matn, 3));
    const autres = [1, 2, 3, 4, 5].map((g) => JSON.stringify(genererQuiz(matn, 7, g)));
    expect(new Set(autres).size).toBeGreaterThan(1);
  });

  it('autres choix pris dans les séances voisines, jamais dans les chapitres réservés (règles, lochies)', () => {
    const reserve = new Set(
      matn.seances
        .filter((s) => s.pudeur)
        .flatMap((s) => s.phrases)
        .map((id) => de.get(id)!.fr),
    );
    for (const s of matn.seances.filter((x) => !x.pudeur))
      for (const q of genererQuiz(matn, s.n))
        if (q.type === 'traduction')
          for (const o of q.options) expect(reserve.has(o), `séance ${s.n}`).toBe(false);
  });

  it('mot à compléter : jamais le premier mot ni le nom d’Allah', () => {
    const ar = 'وَيَجِبُ عَلَيْهِ أَنْ يُحَافِظَ عَلَى حُدُودِ اللَّهِ، وَيَقِفَ';
    const rangs = motsACompleter(ar);
    expect(rangs).not.toContain(0);
    // « اللَّهِ، » (rang 6) jamais ; « أَنْ » (2 lettres) non plus
    expect(rangs).not.toContain(6);
    expect(rangs).not.toContain(2);
    expect(rangs).toEqual([1, 3, 4, 5, 7]);
  });
});

describe('mémorisation (moteur du hifẓ)', () => {
  it('masquage progressif : rien, un mot sur deux après l’amorce, tout sauf l’amorce, tout', async () => {
    const { amorce } = await chargerMoteur();
    expect(amorce(9)).toBe(3);
    expect(masques(9, 0, amorce).every((x) => !x)).toBe(true);
    const un = masques(9, 1, amorce);
    expect(un.slice(0, 3).every((x) => !x)).toBe(true);
    expect(un.filter(Boolean).length).toBeGreaterThan(0);
    expect(un.filter(Boolean).length).toBeLessThan(6);
    const deux = masques(9, 2, amorce);
    expect(deux.filter((x) => !x)).toHaveLength(3);
    expect(masques(9, 3, amorce).every(Boolean)).toBe(true);
  });

  it('oublié : la phrase revient en fin de file ; notes du hifẓ gardées sur l’appareil', async () => {
    expect(apresEval(['a', 'b', 'c'], 'oublie')).toEqual(['b', 'c', 'a']);
    expect(apresEval(['a', 'b'], 'juste')).toEqual(['b']);
    await noter(null, 'essai-memo', 'AKH-0003', 'oublie', '2026-10-12');
    const c = await noter(null, 'essai-memo', 'AKH-0003', 'juste', '2026-10-13');
    expect(c['AKH-0003']).toEqual({ q: 3, jour: '2026-10-13', fois: 2 });
    expect((await lireCarnet(null, 'essai-memo'))['AKH-0003']?.fois).toBe(2);
  });
});

describe('cycles, progression et chargement', () => {
  it('cycle conseillé selon le niveau (tableau des cycles du plan directeur)', () => {
    const p = (kind: 'enfant' | 'ado' | 'adulte', levelCode: string | null) => ({
      kind,
      levelCode,
    });
    expect(cycleConseille(p('enfant', 'en3'))).toBeNull();
    expect(cycleConseille(p('ado', 'ado2'))).toBe(1);
    expect(cycleConseille(p('ado', 'ado1'))).toBe(1);
    expect(cycleConseille(p('ado', 'ado3'))).toBe(2);
    expect(cycleConseille(p('ado', 'ado4'))).toBe(2);
    expect(cycleConseille(p('adulte', 'ad1'))).toBe(1);
    expect(cycleConseille(p('adulte', 'ad4'))).toBe(2);
    expect(cycleConseille(p('adulte', 'ad6'))).toBe(3);
    expect(cycleConseille(p('adulte', 'ad8'))).toBe(4);
    expect(cycleConseille(p('adulte', 'ad3'))).toBe(1);
    expect(cycleConseille(p('adulte', 'ad5'))).toBe(2);
    expect(cycleConseille(p('adulte', 'ad7'))).toBe(3);
    expect(cycleConseille(p('adulte', 'ad10'))).toBe(4);
    expect(cycleConseille(p('adulte', null))).toBe(1);
  });

  it('séance en cours, séances faites, tout fait (sans profil : appareil seul, rien n’est envoyé)', async () => {
    const n = [1, 2, 3];
    expect(seanceEnCours({ faites: [], ouverte: null }, n)).toBe(1);
    expect(seanceEnCours({ faites: [1], ouverte: 3 }, n)).toBe(3);
    expect(seanceEnCours({ faites: [1, 3], ouverte: 3 }, n)).toBe(2);
    expect(toutFait({ faites: [1, 2, 3], ouverte: 3 }, n)).toBe(true);
    await marquerFaite(null, 'essai', 2, { quiz: 3, sur: 4 });
    await marquerFaite(null, 'essai', 1, { quiz: 4, sur: 4 });
    const p = await lireProgres(null, 'essai');
    expect(p.faites).toEqual([1, 2]);
    expect(p.fini).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('texte gardé sur l’appareil au premier usage, relu hors ligne', async () => {
    let appels = 0;
    const enLigne = async () => {
      appels++;
      return new Response(brut, { status: 200 });
    };
    const m1 = await chargerMatn('akhdari', enLigne);
    expect(m1?.seances).toHaveLength(44);
    const horsLigne = async (): Promise<Response> => {
      throw new TypeError('hors ligne');
    };
    const m2 = await chargerMatn('akhdari', horsLigne);
    expect(m2?.version).toBe(matn.version);
    expect(appels).toBe(1);
  });

  it('textes de l’interface : jamais le mot « ijāza » ; bandeau et rappel du référent', () => {
    const fr = lire<Record<string, string>>(
      fileURLToPath(new URL('../../../static/i18n/fr-madjaliss.json', import.meta.url)),
    );
    expect(JSON.stringify(fr)).not.toMatch(/ij[aā]za/i);
    expect(fr['mj.bandeau']).toBe('Traduction Awzid — en cours de relecture savante');
    expect(fr['mj.fatwa']).toBe(
      "Ce n'est pas une fatwa : pour un cas personnel, interroge un savant ou l'imam.",
    );
    expect(fr['mj.explication_bientot']).toBe(
      "Passage présenté avec son explication par l'enseignant — bientôt",
    );
    expect(fr['mj.attestation_relecture']).toMatch(/en cours de relecture savante/);
  });
});
