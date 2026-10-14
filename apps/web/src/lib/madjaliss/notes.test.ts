import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  construire,
  nettoyerNote,
  SORTIE,
  SORTIE_PROTEGEE,
  SOURCE_INTERNE,
  SOURCES,
  tanzil,
} from '../../../scripts/madjaliss.mjs';
import { segments, texteVoixSynthese, type Matn, type NotesEnseignant } from './donnees';

/**
 * Madjaliss, décisions du référent sur la contre-vérification (12/10) : notes d'explication sous la phrase, notes de
 * traduction au mode enseignant, segment coranique de AKH-0132 identique à Tanzil et JAMAIS donné à une voix de
 * synthèse, traductions corrigées reprises telles quelles.
 */
type SrcAr = {
  phrases: Array<{
    id: string;
    ar: string;
    coran?: { sourate: number; verset: number; texte: string; voix_de_synthese?: boolean };
  }>;
};
type SrcFr = {
  phrases: Array<{
    id: string;
    fr: string;
    note_explication?: { texte: string; sources?: string[]; citations_ar?: string[] };
    note_traduction?: string;
    citations_ar?: string[];
  }>;
};
const lire = <T>(p: string) => JSON.parse(readFileSync(p, 'utf8')) as T;
const src = lire<SrcAr>(join(SOURCES, 'akhdari', 'texte_ar.json'));
const srcFr = lire<SrcFr>(join(SOURCES, 'akhdari', 'traduction_fr.json'));
const brut = readFileSync(join(SORTIE, 'akhdari.json'), 'utf8');
const brutEns = readFileSync(join(SORTIE_PROTEGEE, 'akhdari-enseignant.json'), 'utf8');
const matn = JSON.parse(brut) as Matn;
const notes = JSON.parse(brutEns) as NotesEnseignant;
const de = new Map(matn.phrases.map((p) => [p.id, p]));
const sha = (s: string) => createHash('sha256').update(Buffer.from(s, 'utf8')).digest('hex');

describe('AKH-0132 : segment coranique (T7)', () => {
  const s132 = src.phrases.find((p) => p.id === 'AKH-0132')!;
  const seg = segments(de.get('AKH-0132')!).find((x) => typeof x !== 'string') as {
    q: string;
    ref: string;
  };

  it('empreinte identique à la source et à Tanzil (29:45), octet par octet', () => {
    expect(seg.ref).toBe('29:45');
    expect(sha(seg.q)).toBe(sha(s132.coran!.texte));
    expect(s132.ar.includes(`\u{FD3F}${seg.q}\u{FD3E}`)).toBe(true);
    const ligne = tanzil().get('29:45')!;
    expect(Buffer.from(ligne, 'utf8').includes(Buffer.from(seg.q, 'utf8'))).toBe(true);
    // alif + madda conservés (jamais normalisé)
    expect(seg.q.includes('\u0627\u0653')).toBe(true);
  });

  it('la source l’exclut de la voix de synthèse ; un Tanzil différent fait échouer la construction', () => {
    expect(s132.coran!.voix_de_synthese).toBe(false);
    const faux = new Map(tanzil());
    faux.set('29:45', faux.get('29:45')!.replaceAll('\u0627\u0653', '\u0622'));
    expect(() => construire('akhdari', faux)).toThrow(/AKH-0132/);
  });

  it('garde : aucune phrase citant le Coran ni réservée n’est donnée à une voix de synthèse', () => {
    for (const id of ['AKH-0132', 'AKH-0015', 'AKH-0052'])
      expect(texteVoixSynthese(de.get(id)!), id).toBeNull();
    const cites = matn.phrases.flatMap((p) =>
      segments(p).flatMap((s) => (typeof s === 'string' ? [] : [s.q])),
    );
    for (const p of matn.phrases) {
      const v = texteVoixSynthese(p);
      if (v === null) continue;
      expect(v, p.id).not.toMatch(/[\u{FD3E}\u{FD3F}]/u);
      for (const q of cites) expect(v.includes(q), p.id).toBe(false);
    }
    expect(texteVoixSynthese(de.get('AKH-0051')!)).toBe(de.get('AKH-0051')!.ar);
  });

  it('la rubrique n’appelle aucune voix de synthèse (enregistrements humains seulement)', () => {
    const dir = fileURLToPath(new URL('.', import.meta.url));
    for (const f of readdirSync(dir).filter(
      (x) => /\.(svelte|ts)$/.test(x) && !x.endsWith('.test.ts'),
    ))
      expect(readFileSync(join(dir, f), 'utf8'), f).not.toMatch(
        /speechSynthesis|SpeechSynthesisUtterance|\/tts/,
      );
  });
});

describe('notes du référent', () => {
  it('notes d’explication (AKH-0051, 0060, 0081, 0145, 0146, 0158, 0162, 0172) : sous la phrase, telles que la source les donne', () => {
    const avec = matn.phrases.filter((p) => p.notes).map((p) => p.id);
    expect(avec).toEqual([
      'AKH-0051',
      'AKH-0060',
      'AKH-0081',
      'AKH-0145',
      'AKH-0146',
      'AKH-0158',
      'AKH-0162',
      'AKH-0172',
    ]);
    for (const id of avec) {
      const n = srcFr.phrases.find((x) => x.id === id)!.note_explication!;
      const note = de.get(id)!.notes![0]!;
      // le texte du référent, sans ses phrases internes (comité, codes de décision : nettoyerNote) ni ses sources internes
      expect(note.texte).toBe(nettoyerNote(n.texte));
      expect(note.sources ?? []).toEqual((n.sources ?? []).filter((s) => !SOURCE_INTERNE.test(s)));
      expect(note.ar).toEqual(n.citations_ar);
    }
    expect(de.get('AKH-0051')!.notes![0]!.texte.startsWith('Pour les familles.')).toBe(true);
  });

  it('nouvelles notes AKH-0145, 0146, 0158 (13/10) : citations arabes sur leur ligne, décision interne absente', () => {
    for (const id of ['AKH-0145', 'AKH-0146', 'AKH-0158']) {
      const note = de.get(id)!.notes![0]!;
      expect(note.ar!.length, id).toBeGreaterThanOrEqual(2);
      expect(JSON.stringify(note), id).not.toMatch(/K32|RAPPORT_COMPLET|Décision du référent/);
    }
    expect(de.get('AKH-0145')!.notes![0]!.texte).toContain('quatre ou moins');
    expect(de.get('AKH-0158')!.notes![0]!.sources).toHaveLength(1);
  });

  it('notes de traduction (AKH-0055, 0092) : mode enseignant seulement', () => {
    const avec = srcFr.phrases.filter((x) => x.note_traduction);
    expect(avec.map((x) => x.id)).toEqual(['AKH-0055', 'AKH-0092']);
    for (const f of avec) {
      expect(brut).not.toContain(f.note_traduction);
      const n = notes.phrases.find((x) => x.id === f.id)!;
      expect(n.traduction).toBe(f.note_traduction);
      expect(n.ar).toEqual(f.citations_ar);
      for (const a of f.citations_ar ?? []) expect(brut).not.toContain(a);
    }
  });

  it('références du hadith (AKH-0016) : jamais affichées avant la relecture', () => {
    for (const f of [brut, brutEns]) expect(f).not.toMatch(/Sharḥ as-Sunna|Hidāyat ar-ruwāt/);
  });

  it('traductions corrigées reprises telles quelles (AKH-0055, 0076, 0092…)', () => {
    for (const id of ['AKH-0033', 'AKH-0037', 'AKH-0044', 'AKH-0055', 'AKH-0062', 'AKH-0076'])
      expect(de.get(id)!.fr, id).toBe(srcFr.phrases.find((x) => x.id === id)!.fr);
    expect(de.get('AKH-0055')!.fr).toContain('dans un sexe (farj)');
    expect(de.get('AKH-0092')!.fr).toContain('[de jouir de]');
    expect(brut).not.toContain('[de toucher]');
  });
});
