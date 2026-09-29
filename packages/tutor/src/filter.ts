/**
 * FILTRE DE SORTIE (ARCHITECTURE_V2 § 1.6), appliqué à chaque brouillon du modèle AVANT affichage :
 * 1. schéma ; 2. références rendues par l'application (Coran = Tanzil octet par octet, registre VERIFIE,
 * explications validées) ; 3. détecteur de Coran hors référence ; 4. citations sans identifiant du registre,
 * numéros de hadith ; 5. avis religieux formulé ; 6. phonétique latine, émoji visage, données personnelles,
 * identité humaine, arabe généré pour un enfant. Toute violation bloquante → réponse de repli locale.
 */
import {
  bareWords,
  hasArabic,
  PRESENTATION_FORMS,
  transliterationRuns,
  type QuranIndex,
} from './arabic.js';
import type {
  Audience,
  ContextPack,
  Decision,
  FilterEvent,
  RegistryItem,
  Segment,
  TutorDraft,
} from './types.js';
import { fold } from './classify.js';

const DECISIONS: Decision[] = ['repondre', 'transmettre', 'recadrer', 'proteger'];
export const MAX_MESSAGE = 1500;
/** plage de versets affichable par le tuteur (au-delà : le lecteur coranique) */
export const MAX_VERSES = 20;

export function validateDraft(x: unknown): TutorDraft | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  const keys = Object.keys(o);
  if (keys.some((k) => k !== 'decision' && k !== 'message_fr')) return null;
  if (!DECISIONS.includes(o.decision as Decision)) return null;
  if (typeof o.message_fr !== 'string' || !o.message_fr.trim() || o.message_fr.length > MAX_MESSAGE)
    return null;
  return { decision: o.decision as Decision, message_fr: o.message_fr };
}

/** Schéma JSON donné au modèle (sortie structurée). */
export const DRAFT_SCHEMA = {
  type: 'object',
  properties: {
    decision: { type: 'string', enum: DECISIONS },
    message_fr: { type: 'string' },
  },
  required: ['decision', 'message_fr'],
  additionalProperties: false,
} as const;

export interface FilterDeps {
  index: QuranIndex;
  /** basmala d'en-tête (Tanzil 1:1), retirée des versets 1 sauf Al-Fātiḥa et At-Tawba */
  basmala: string;
  context: ContextPack;
  audience: Audience;
}

const PLACEHOLDER = /\{\{\s*(coran|registre|explication)\s*:\s*([^}]+?)\s*\}\}/g;

/** Référence « s:a-b » → versets Tanzil exacts ; null si invalide. */
export function renderCoran(
  ref: string,
  verses: ReadonlyMap<string, string>,
  basmala: string,
): Extract<Segment, { t: 'coran' }> | null {
  const m = /^(\d{1,3}):(\d{1,3})(?:-(\d{1,3}))?$/.exec(ref.replace(/\s+/g, ''));
  if (!m) return null;
  const s = Number(m[1]);
  const from = Number(m[2]);
  const to = Number(m[3] ?? m[2]);
  if (s < 1 || s > 114 || from < 1 || to < from || to - from + 1 > MAX_VERSES) return null;
  const parts: string[] = [];
  for (let a = from; a <= to; a++) {
    const v = verses.get(`${s}:${a}`);
    if (v === undefined) return null;
    parts.push(
      a === 1 && s !== 1 && s !== 9 && basmala && v.startsWith(`${basmala} `)
        ? v.slice(basmala.length + 1)
        : v,
    );
  }
  return { t: 'coran', ref: `${s}:${from}-${to}`, s, from, to, text: parts.join(' ') };
}

/** Contrôle octet par octet d'un segment coranique rendu (même règle que le lecteur et le carnet). */
export function coranIsExact(
  seg: Extract<Segment, { t: 'coran' }>,
  verses: ReadonlyMap<string, string>,
  basmala: string,
): boolean {
  const expected: string[] = [];
  for (let a = seg.from; a <= seg.to; a++) {
    const v = verses.get(`${seg.s}:${a}`) ?? '\u0000';
    expected.push(
      a === 1 && seg.s !== 1 && seg.s !== 9 && v.startsWith(`${basmala} `)
        ? v.slice(basmala.length + 1)
        : v,
    );
  }
  return expected.join(' ') === seg.text;
}

export const CITATION = new RegExp(
  [
    'le prophete\\s*(\\(?\\s*(ﷺ|saw|sws|psl|paix)[^)]*\\)?)?\\s*(a|aurait) dit',
    'a dit le prophete',
    'rapporte par',
    'rapporte que',
    "d'apres (abu|abou|ibn|aicha|anas|omar|umar|ali)",
    'selon (l.imam|al.|abu|abou|ibn)',
    'dans (un|le) hadith',
    'un hadith (dit|rapporte|enseigne)',
    'the prophet (said|says)',
    'narrated',
    'قال رسول الله',
    'قال النبي',
    'رواه',
    'عن النبي',
  ].join('|'),
  'i',
);
export const COLLECTION_NUMBER =
  /(bukh[a]?ri|boukhari|muslim|mouslim|tirmid|abu da|abou da|nasa.?i|ibn maj|ahmad|malik|muwatta|البخاري|مسلم|الترمذي)[^.\n]{0,25}\d+/i;
export const VERDICT =
  /\b(c.est|c.est bien|est|sont|serait|reste|devient)\s+(tout a fait\s+)?(haram|halal|licite|illicite|interdit|permis|obligatoire|recommande|deconseille|makruh|mustahab|wajib|fard|un peche|pas un peche|autorise)\b|\btu (dois|peux|ne dois pas|ne peux pas) (prier|jeuner|payer|epouser|manger|boire|ecouter|porter)|\b(it is|it's) (haram|halal|forbidden|allowed)\b|حرام|حلال|يجوز|لا يجوز/i;
export const PERSONAL =
  /(ton|votre|ta) (nom de famille|adresse|numero|telephone|ecole|photo|mail|e-?mail|compte|snap|insta)|ou (habites|vis|habitez)|quel age (as-tu|avez-vous) exactement|envoie.?moi (une|ta) photo/i;
export const HUMAN =
  /je m.appelle\b|je suis (un humain|une humaine|une personne|humain|humaine|ton ami|ton amie|ta copine|ton copain|ta soeur|ton frere)\b|je ne suis pas (un programme|une ia|une intelligence|un robot)|i am (a )?human|i'm your friend/i;
/** groupes, religions, politique : jamais dans une réponse du tuteur de langue */
export const POLEMIC_OUT =
  /\b(chiites?|sunnites?|salafi\w*|soufi\w*|wahhab\w*|confreries?|mourides?|tidjan\w*|freres musulmans|chretiens?|juifs?|judaisme|christianisme|athees?|politique|elections?|president|guerre|terroris\w*|jihad\w*|daech|etat islamique)\b/i;
export const FACE_EMOJI =
  /[\u{1F600}-\u{1F64F}\u{1F910}-\u{1F92F}\u{1F970}-\u{1F97A}\u{1F9D0}\u{263A}\u{2639}\u{1F479}-\u{1F47A}\u{1F47F}\u{1F480}]/gu;

export interface FilterOutcome {
  ok: boolean;
  decision: Decision;
  segments: Segment[];
  events: FilterEvent[];
}

export function filterDraft(raw: unknown, d: FilterDeps): FilterOutcome {
  const events: FilterEvent[] = [];
  const draft = validateDraft(raw);
  if (!draft) {
    events.push({ step: 'schema', action: 'bloque' });
    return { ok: false, decision: 'repondre', segments: [], events };
  }
  events.push({ step: 'schema', action: 'ok' });

  // ---- références → segments rendus par l'application
  const segments: Segment[] = [];
  const allowedReg = new Map<string, RegistryItem>(d.context.registre.map((r) => [r.id, r]));
  const bank = new Map(d.context.bank.filter((e) => e.statut === 'valide').map((e) => [e.id, e]));
  let last = 0;
  let blocked = false;
  const msg = draft.message_fr.replace(FACE_EMOJI, () => {
    events.push({ step: 'emoji_visage', action: 'corrige' });
    return '';
  });
  for (const m of msg.matchAll(PLACEHOLDER)) {
    const before = msg.slice(last, m.index);
    if (before.trim()) segments.push({ t: 'texte', v: before });
    last = (m.index ?? 0) + m[0].length;
    const kind = m[1];
    const id = m[2] ?? '';
    if (kind === 'coran') {
      const seg = renderCoran(id, d.index.verses, d.basmala);
      if (!seg || !coranIsExact(seg, d.index.verses, d.basmala)) {
        events.push({ step: 'reference_coran', action: 'bloque', detail: id });
        blocked = true;
      } else segments.push(seg);
    } else if (kind === 'registre') {
      const r = allowedReg.get(id);
      if (!r || r.statut !== 'VERIFIE') {
        events.push({ step: 'registre', action: 'bloque', detail: id });
        blocked = true;
      } else
        segments.push({
          t: 'registre',
          id: r.id,
          ...(r.recueil ? { recueil: r.recueil } : {}),
          ...(r.numero !== undefined && r.numero !== '' ? { numero: String(r.numero) } : {}),
          ...(r.degre ? { degre: r.degre } : {}),
          ...(r.texteAr ? { texteAr: r.texteAr } : {}),
        });
    } else {
      const e = bank.get(id);
      if (!e) events.push({ step: 'explication', action: 'corrige', detail: `inconnue ${id}` });
      else
        segments.push({
          t: 'explication',
          id: e.id,
          texteFr: e.texteFr,
          ...(e.ar ? { ar: e.ar } : {}),
          source: e.source,
        });
    }
  }
  const tail = msg.slice(last);
  if (tail.trim()) segments.push({ t: 'texte', v: tail });

  // ---- contrôles du texte libre du modèle (jamais sur les segments rendus par l'application)
  const free = segments
    .filter((s): s is { t: 'texte'; v: string } => s.t === 'texte')
    .map((s) => s.v)
    .join('\n');
  const folded = fold(free);
  const hasRegistry = segments.some((s) => s.t === 'registre');
  const check = (step: string, bad: boolean, detail?: string) => {
    if (bad) {
      events.push({ step, action: 'bloque', ...(detail ? { detail } : {}) });
      blocked = true;
    }
  };
  check('formes_de_presentation', PRESENTATION_FORMS.test(free));
  if (hasArabic(free)) {
    const hits = d.index.matches(free);
    check('coran_hors_reference', hits.length > 0, hits[0]);
    if (d.audience === 'enfant') {
      // enfants : aucun arabe généré — seulement des mots de la leçon
      const known = new Set(d.context.bank.flatMap((e) => bareWords(`${e.ar ?? ''} ${e.texteFr}`)));
      const extra = bareWords(free).filter((w) => !known.has(w));
      check('arabe_genere_enfant', extra.length > 0, extra[0]);
    }
  }
  check('citation_sans_registre', CITATION.test(folded) && !hasRegistry);
  check('numero_de_hadith', COLLECTION_NUMBER.test(folded));
  const verdict = VERDICT.test(folded);
  check('avis_religieux', verdict);
  const tr = transliterationRuns(free);
  check('phonetique_latine', tr.length > 0, tr[0]);
  check('donnees_personnelles', PERSONAL.test(folded));
  check('polemique', POLEMIC_OUT.test(folded));
  check('identite_humaine', HUMAN.test(folded));

  if (blocked) return { ok: false, decision: draft.decision, segments: [], events };
  events.push({ step: 'filtre', action: 'ok' });
  return { ok: true, decision: draft.decision, segments, events };
}
