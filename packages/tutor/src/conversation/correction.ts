/**
 * CORRECTION DE GRAMMAIRE DE L'ÉCRIT (29/10/2026, décision du chef de projet) : même schéma qu'à l'oral. Flash-Lite
 * répond tout de suite ; EN PARALLÈLE, gemini-3.8-flash cherche UNE faute de langue nette dans la phrase écrite
 * (accord, voyelle finale, genre…), coupé à 6 s. La correction arrive juste après, dans une carte discrète ; si
 * gemini-3.8-flash est lent ou absent, la conversation continue sans (noté au journal).
 *
 * L'application vérifie : le passage « dit » figure dans la phrase de l'élève, la forme juste est de l'arabe différent,
 * et la correction passe TOUS les filtres de sortie (Coran, avis, citation, sujets refusés, contact, phonétique…).
 */
import { bareWords, type QuranIndex } from '../arabic.js';
import { filtrerSortie } from './garde.js';
import type { ConvBrouillon, ConvSortieFournisseur, CorrFournisseur } from './types.js';

export type Correction = NonNullable<ConvBrouillon['correction']>;

export interface IssueCorrection {
  correction: Correction | null;
  filtre: Array<{ step: string; action: 'ok' | 'bloque' | 'ecarte' | 'corrige'; detail?: string }>;
}

/** Correction vérifiée à montrer, ou null (rien dans le doute). */
export function issueCorrection(
  out: Pick<ConvSortieFournisseur, 'status' | 'brouillon' | 'detail'>,
  o: { texte: string; index: QuranIndex },
): IssueCorrection {
  const rien = (action: 'ok' | 'bloque' | 'ecarte', detail: string): IssueCorrection => ({
    correction: null,
    filtre: [{ step: 'correction_differee', action, detail }],
  });
  if (out.status !== 'ok') return rien('ecarte', `${out.status}:${out.detail ?? ''}`);
  const b = out.brouillon as { correction?: unknown } | null;
  if (
    !b ||
    typeof b !== 'object' ||
    Array.isArray(b) ||
    Object.keys(b).some((k) => k !== 'correction')
  )
    return rien('ecarte', 'schema');
  if (b.correction === null || b.correction === undefined) return rien('ok', 'aucune');
  const c = b.correction as Record<string, unknown>;
  const dit = typeof c.dit === 'string' ? c.dit.trim() : '';
  const correct = typeof c.correct === 'string' ? c.correct.trim() : '';
  const explication_fr = typeof c.explication_fr === 'string' ? c.explication_fr.trim() : '';
  if (
    !dit ||
    !correct ||
    !explication_fr ||
    dit.length > 200 ||
    correct.length > 200 ||
    explication_fr.length > 300
  )
    return rien('ecarte', 'schema');
  const nuDit = bareWords(dit);
  const nuTexte = ` ${bareWords(o.texte).join(' ')} `;
  // le passage « fautif » doit être dans la phrase de l'élève ; la forme juste doit en différer
  if (!nuDit.length || !nuTexte.includes(` ${nuDit.join(' ')} `))
    return rien('ecarte', 'dit_absent');
  if (correct === dit) return rien('ecarte', 'identique');
  const f = filtrerSortie(
    {
      transcription_ar: '',
      sujet: 'langue',
      correction: { dit, correct, explication_fr },
      reponse_ar: correct,
      reponse_fr: '',
    },
    o.index,
  );
  if (!f.ok || !f.brouillon?.correction)
    return {
      correction: null,
      filtre: f.events
        .filter((e) => e.action === 'bloque')
        .map((e) => ({ ...e, step: `correction_${e.step}` })),
    };
  return {
    correction: f.brouillon.correction,
    filtre: [{ step: 'correction_differee', action: 'ok' }],
  };
}

/** Correction SIMULÉE (tests, démonstration) : aucune (la conversation simulée corrige déjà elle-même). */
export class CorrectionSimulee implements CorrFournisseur {
  readonly name = 'simule';
  readonly real = false;
  constructor(readonly modele = 'gemini-3.8-flash') {}
  async corriger(systeme: string) {
    return {
      status: 'ok' as const,
      brouillon: { correction: null },
      usage: { texte: Math.ceil(systeme.length / 3), audio: 0, sortie: 60 },
    };
  }
}
