/**
 * Décision de fin de niveau selon les règles d'évaluation des livres (data/eval/regles.js) :
 *   CC = 70 % moyenne des bilans (chacun ramené sur 100) + 15 % récitations + 15 % productions ;
 *   NF = 60 % examen (sur 100) + 40 % CC, arrondie au demi-point ;
 *   ≥ 80 Très bien · ≥ 70 Bien · ≥ 60 Assez bien (certificat) · ≥ 40 validation conditionnelle · < 40 reprise ;
 *   condition : examen ≥ 50/100 (sinon validation conditionnelle au mieux).
 * Les règles sont LUES dans le fichier des livres (importé) ; les valeurs ci-dessous ne servent que si le
 * fichier est absent (elles en sont la copie au 24/09/2026).
 * L'enseignant reste le seul juge : ce calcul reprend ses saisies, il ne les remplace pas.
 */

export interface EvalRules {
  cc: { bilans: number; recitations: number; productions: number };
  nf: { examen: number; cc: number; arrondi: number };
  decisions: Array<{
    min: number;
    code: string;
    fr: string;
    mention_ar?: string;
    document: string;
  }>;
  conditions: Record<string, { examen_min: number }>;
}

export const DEFAULT_RULES: EvalRules = {
  cc: { bilans: 0.7, recitations: 0.15, productions: 0.15 },
  nf: { examen: 0.6, cc: 0.4, arrondi: 0.5 },
  decisions: [
    {
      min: 80,
      code: 'TB',
      fr: 'Validé, mention Très bien',
      mention_ar: 'مُمْتَازٌ',
      document: 'certificat',
    },
    {
      min: 70,
      code: 'B',
      fr: 'Validé, mention Bien',
      mention_ar: 'جَيِّدٌ جِدًّا',
      document: 'certificat',
    },
    {
      min: 60,
      code: 'AB',
      fr: 'Validé, mention Assez bien',
      mention_ar: 'جَيِّدٌ',
      document: 'certificat',
    },
    { min: 40, code: 'VC', fr: 'Validation conditionnelle', document: 'attestation' },
    { min: 0, code: 'R', fr: 'Reprise', document: 'releve' },
  ],
  conditions: { enfants: { examen_min: 50 }, adultes: { examen_min: 50 } },
};

/** Mentions (texte des certificats) par code de décision. */
export const MENTIONS: Record<string, { fr: string; ar: string }> = {
  TB: { fr: 'Très bien', ar: 'مُمْتَازٌ' },
  B: { fr: 'Bien', ar: 'جَيِّدٌ جِدًّا' },
  AB: { fr: 'Assez bien', ar: 'جَيِّدٌ' },
};

/** Lecture tolérante des règles importées (regles.js) ; repli sur DEFAULT_RULES champ par champ. */
export function rulesFrom(raw: unknown): EvalRules {
  const r = (raw ?? {}) as Partial<EvalRules>;
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const decisions = Array.isArray(r.decisions)
    ? r.decisions
        .filter((d) => d && typeof d.min === 'number' && typeof d.code === 'string')
        .sort((a, b) => b.min - a.min)
    : [];
  return {
    cc: {
      bilans: num(r.cc?.bilans, DEFAULT_RULES.cc.bilans),
      recitations: num(r.cc?.recitations, DEFAULT_RULES.cc.recitations),
      productions: num(r.cc?.productions, DEFAULT_RULES.cc.productions),
    },
    nf: {
      examen: num(r.nf?.examen, DEFAULT_RULES.nf.examen),
      cc: num(r.nf?.cc, DEFAULT_RULES.nf.cc),
      arrondi: num(r.nf?.arrondi, DEFAULT_RULES.nf.arrondi),
    },
    decisions: decisions.length ? decisions : DEFAULT_RULES.decisions,
    conditions:
      r.conditions && typeof r.conditions === 'object' ? r.conditions : DEFAULT_RULES.conditions,
  };
}

export interface Score {
  score: number;
  max: number;
}

export interface LevelInput {
  /** un élément par bilan du livre, dans l'ordre ; null = pas encore saisi */
  bilans: Array<Score | null>;
  examen: Score | null;
  recitations?: Score | null;
  productions?: Score | null;
  /** filière du niveau (enfants, adultes, religion, ados) : conditions de l'examen */
  track: string;
}

export interface LevelResult {
  /** « incomplet » tant qu'un bilan ou l'examen manque */
  status: 'complet' | 'incomplet';
  missing: string[];
  bilansPct: number | null;
  cc: number | null;
  /** CC calculé sur les bilans seuls (récitations et productions non saisies) */
  ccPartiel: boolean;
  examenPct: number | null;
  nf: number | null;
  decision: { code: string; fr: string; document: string } | null;
  /** une condition manque (examen < plancher) : décision abaissée à la validation conditionnelle */
  conditionManquante: string | null;
  /** certificat de niveau délivrable */
  certificat: boolean;
  mention: { fr: string; ar: string } | null;
}

const pct = (s: Score) => (s.max > 0 ? Math.max(0, Math.min(100, (100 * s.score) / s.max)) : 0);
const round = (x: number, step: number) => (step > 0 ? Math.round(x / step) * step : x);
const r2 = (x: number) => Math.round(x * 100) / 100;

export function levelResult(input: LevelInput, rules: EvalRules = DEFAULT_RULES): LevelResult {
  const missing: string[] = [];
  input.bilans.forEach((b, i) => {
    if (!b) missing.push(`bilan ${i + 1}`);
  });
  if (!input.examen) missing.push('examen');
  const done = input.bilans.filter((b): b is Score => !!b);
  // moyenne des bilans ARRONDIE à l'unité avant le contrôle continu, comme l'exemple des règles des livres
  // (« moyenne 14,5/20 → 72,5/100 », puis « 0,7 × 73 » : décision du pilote du 29/09/2026)
  const bilansPct = done.length
    ? Math.round(done.reduce((a, b) => a + pct(b), 0) / done.length)
    : null;
  // CC : composantes saisies seulement (poids renormalisés), signalé si partiel
  let cc: number | null = null;
  let ccPartiel = false;
  if (bilansPct !== null) {
    let w = rules.cc.bilans;
    let sum = rules.cc.bilans * bilansPct;
    for (const k of ['recitations', 'productions'] as const) {
      const s = input[k];
      if (s) {
        w += rules.cc[k];
        sum += rules.cc[k] * pct(s);
      } else ccPartiel = true;
    }
    cc = r2(sum / w);
  }
  const examenPct = input.examen ? r2(pct(input.examen)) : null;
  const status = missing.length ? 'incomplet' : 'complet';
  if (status === 'incomplet' || cc === null || examenPct === null)
    return {
      status,
      missing,
      bilansPct,
      cc,
      ccPartiel,
      examenPct,
      nf: null,
      decision: null,
      conditionManquante: null,
      certificat: false,
      mention: null,
    };
  const nf = round(rules.nf.examen * examenPct + rules.nf.cc * cc, rules.nf.arrondi);
  let d = rules.decisions.find((x) => nf >= x.min) ?? rules.decisions[rules.decisions.length - 1]!;
  const plancher =
    rules.conditions[
      input.track === 'enfants' || input.track === 'religion' ? 'enfants' : 'adultes'
    ]?.examen_min ?? 50;
  let conditionManquante: string | null = null;
  if (examenPct < plancher && d.document === 'certificat') {
    conditionManquante = `examen < ${plancher}/100`;
    d = rules.decisions.find((x) => x.code === 'VC') ?? d;
  }
  const certificat = d.document === 'certificat';
  return {
    status,
    missing,
    bilansPct,
    cc,
    ccPartiel,
    examenPct,
    nf,
    decision: { code: d.code, fr: d.fr, document: d.document },
    conditionManquante,
    certificat,
    mention: certificat ? (MENTIONS[d.code] ?? null) : null,
  };
}
