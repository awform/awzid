/**
 * ORCHESTRATEUR des tuteurs (ARCHITECTURE_V2 § 1.3) :
 * 1. politique (public, texte libre interdit sous 13 ans, horaires, plafond de coût) ;
 * 2. classifieur local de la question (détresse, rencontre, injection, avis religieux, polémique,
 *    données personnelles, Coran, hadith) → réponses TYPES, sans modèle ;
 * 3. local d'abord : indices, « que dit ma leçon », mots → banque d'explications validées ;
 * 4. appel au fournisseur (contexte en lecture seule) ; 5. filtre de sortie ; 6. rendu ; le résultat est
 *    journalisé par l'appelant (l'API), qui enregistre aussi la question transmise ou l'alerte.
 */
import { SURA_NAMES } from '@awform/hifz';
import { searchBank } from './bank.js';
import { classify, fold, helpline, type Category } from './classify.js';
import { filterDraft, MAX_VERSES, renderCoran } from './filter.js';
import type { QuranIndex } from './arabic.js';
import type { TutorProvider } from './providers/types.js';
import { costMicros, ROLES, type RoleConfig } from './roles.js';
import type { ContextPack, Decision, Route, Segment, TutorRequest, TutorResult } from './types.js';

export interface OrchestratorDeps {
  index: QuranIndex;
  basmala: string;
  /** null : tuteur IA désactivé → tuteur local seul */
  provider: TutorProvider | null;
  /** dépense du mois pour ce profil (micro-dollars) */
  monthSpentMicros?: number;
  /** surcharge des modèles (variables d'environnement) */
  modelFor?: (role: RoleConfig) => string;
  /** batterie « modèle seul » : sans le classifieur local, pour éprouver le modèle et le filtre */
  skipClassifier?: boolean;
}

export const TEXTS = {
  avis: 'Je ne donne pas d’avis religieux. Je transmets ta question à ton enseignant ; sa réponse apparaîtra ici.',
  polemique:
    'Je ne parle ni d’actualité, ni des affaires publiques, ni des différences entre groupes, écoles ou religions. Revenons à ta leçon d’arabe.',
  injection:
    'Je suis le tuteur de ta leçon : mes règles ne changent pas. Pose-moi une question sur la leçon.',
  perso:
    'Ne donne jamais d’informations personnelles (adresse, téléphone, école, réseaux). Je n’en ai pas besoin pour t’aider.',
  identite:
    'Je suis un programme informatique, pas une personne. Je t’aide à comprendre ta leçon d’arabe.',
  rencontre:
    'Je suis un programme : je ne rencontre personne et je n’ai ni numéro ni adresse. Ne donne jamais tes coordonnées en ligne. Si quelqu’un te demande de le rencontrer, parles-en tout de suite à un adulte de confiance.',
  detresse: (tel: string) =>
    `Merci de me l’avoir dit. Ce que tu vis est important et tu n’es pas seul. Parle tout de suite à un adulte de confiance (un parent, ton enseignant). Tu peux aussi appeler le ${tel}. Je suis un programme : je ne peux pas t’aider moi-même, mais ces personnes le peuvent.`,
  coranIntro:
    'Je n’écris jamais le Coran moi-même. Voici le texte de référence (Tanzil, riwāya Ḥafṣ) :',
  coranPhonetique:
    'Je n’écris pas le Coran en lettres latines : écoute ton enseignant et suis le texte exact.',
  coranCorrige: 'Je ne corrige pas un verset recopié : compare-le avec le texte exact.',
  coranInconnu:
    'Je n’écris jamais le Coran moi-même. Ouvre le lecteur coranique (onglet Coran) ou demande à ton enseignant.',
  coranSuite: 'La suite est dans le lecteur coranique.',
  hadithAucun:
    'Je ne cite jamais un hadith de mémoire : seuls les hadiths vérifiés de tes livres peuvent être montrés. Demande à ton enseignant.',
  hadithLecon: 'Je ne cite que les hadiths vérifiés de tes livres. Dans cette leçon :',
  repli: 'Je n’ai pas de réponse sûre à te donner. Voici ce que dit ta leçon :',
  plafond: 'Le tuteur en ligne a atteint sa limite ce mois-ci : je te réponds avec ta leçon.',
  vide: 'Relis ta leçon calmement, puis refais l’exercice. Tu peux aussi demander à ton enseignant.',
};

const ZERO = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };

/** clés de recherche des sourates : « al-mulk » → « mulk », « Āl ʿImrān » → « alimran » */
const SURA_KEYS: Array<[string, number]> = SURA_NAMES.flatMap((n, i) => {
  const f = fold(n).replace(/[^a-z' -]/g, '');
  const noArt = f.replace(/^(a[lnrstdz]{1,2}|ash|ath|adh|az)[- ]/, '');
  return [
    [noArt.replace(/[^a-z]/g, ''), i + 1],
    [f.replace(/[^a-z]/g, ''), i + 1],
  ] as Array<[string, number]>;
});
const ALIASES: Record<string, string> = {
  kursi: '2:255',
  koursi: '2:255',
  fatiha: '1:1-7',
  ikhlas: '112:1-4',
  falaq: '113:1-5',
  nas: '114:1-6',
  mulk: '67:1-20',
  yasin: '36:1-20',
};

/** Référence demandée dans une question (numéro, nom de sourate, ou passage arabe) ; null si aucune. */
export function findQuranRef(question: string, index: QuranIndex): string | null {
  const q = fold(question);
  const num = /(sourate|surah|sura|surat|سورة)\s*(n[°o]?\s*)?(\d{1,3})/.exec(q);
  const verse = /verset\s*(\d{1,3})/.exec(q);
  let s = 0;
  if (num) s = Number(num[3]);
  const words = q
    .split(/[^a-z']+/)
    .map((w) => w.replace(/^(al|an|ar|as|at|ad|az|ash|ath)'?/, '').replace(/'/g, ''))
    .filter(Boolean);
  if (!s) {
    // mots seuls et mots accolés (« ya sin » → « yasin »)
    const cand = new Set<string>();
    words.forEach((w, i) => {
      cand.add(w);
      if (words[i + 1] !== undefined) cand.add(w + words[i + 1]);
      if (words[i + 2] !== undefined) cand.add(w + words[i + 1] + words[i + 2]);
    });
    for (const w of cand) {
      const alias = ALIASES[w];
      if (alias) return alias;
    }
    for (const [key, n] of SURA_KEYS) if (key.length >= 3 && cand.has(key)) s = n;
  }
  if (!s || s > 114) {
    const loc = index.locate(question);
    return loc ? `${loc}` : null;
  }
  let count = 0;
  while (index.verses.has(`${s}:${count + 1}`)) count++;
  if (!count) return null;
  if (verse) {
    const a = Math.min(Number(verse[1]), count);
    return `${s}:${a}`;
  }
  return `${s}:1-${Math.min(count, MAX_VERSES)}`;
}

export class Orchestrator {
  constructor(private readonly deps: OrchestratorDeps) {}

  async ask(req: TutorRequest, context: ContextPack): Promise<TutorResult> {
    const role = ROLES[req.audience];
    const base = {
      provider: this.deps.provider?.name ?? 'local',
      model: null as string | null,
      roleId: role.id,
      roleVersion: role.version,
      usage: ZERO,
      costMicros: 0,
      filter: [] as TutorResult['filter'],
    };
    const done = (
      route: Route,
      decision: Decision,
      segments: Segment[],
      extra: Partial<TutorResult> = {},
    ): TutorResult => ({ ...base, route, decision, segments, ...extra });
    const text = (v: string): Segment => ({ t: 'texte', v });

    // ---- 1. politique
    if (req.action === 'question' && !role.freeText)
      return done('politique', 'recadrer', [], { refused: 'texte_libre_interdit' });
    if (req.audience === 'enfant' && req.hour !== undefined && (req.hour >= 21 || req.hour < 7))
      return done('politique', 'recadrer', [], { refused: 'horaire' });
    // audit CON-6 : seul « question » porte du texte libre (classé ci-dessous) ; pour les autres actions, un
    // texte envoyé est IGNORÉ, jamais transmis au modèle sans classement
    const question =
      req.action === 'question' ? (req.text ?? '').slice(0, Math.max(role.maxChars, 0)) : '';
    if (req.action === 'question' && !question.trim())
      return done('politique', 'recadrer', [], { refused: 'question_vide' });

    // ---- 2. classifieur local (texte libre seulement)
    if (req.action === 'question' && !this.deps.skipClassifier) {
      const cat: Category = classify(question);
      switch (cat) {
        case 'detresse':
          return done('protection', 'proteger', [text(TEXTS.detresse(helpline(req.country)))], {
            alert: { motif: 'detresse' },
          });
        case 'rencontre':
          return done('protection', 'proteger', [text(TEXTS.rencontre)], {
            alert: { motif: 'rencontre' },
          });
        case 'injection':
          return done('injection', 'recadrer', [text(TEXTS.injection)]);
        case 'avis_religieux':
          return done('transmission', 'transmettre', [text(TEXTS.avis)], {
            transmit: { text: question, motif: 'avis_religieux' },
          });
        case 'polemique':
          return done('recadrage', 'recadrer', [text(TEXTS.polemique)]);
        case 'donnees_perso':
          return done('recadrage', 'recadrer', [text(TEXTS.perso)]);
        case 'identite':
          return done('recadrage', 'repondre', [text(TEXTS.identite)]);
        case 'hadith':
          return context.registre.length
            ? done('hadith_local', 'repondre', [
                text(TEXTS.hadithLecon),
                ...context.registre.map((r): Segment => ({
                  t: 'registre',
                  id: r.id,
                  ...(r.recueil ? { recueil: r.recueil } : {}),
                  ...(r.numero !== undefined ? { numero: String(r.numero) } : {}),
                  ...(r.degre ? { degre: r.degre } : {}),
                  ...(r.texteAr ? { texteAr: r.texteAr } : {}),
                })),
              ])
            : done('hadith_local', 'repondre', [text(TEXTS.hadithAucun)]);
        case 'coran_texte':
          return this.coranLocal(question, done, text);
        case 'normal':
          break;
      }
    }

    // ---- 3. local d'abord
    const bank = context.bank.filter((e) => e.statut === 'valide');
    const local = (list: typeof bank, intro?: string) => {
      const e = list.length ? list[(req.turn ?? 0) % list.length]! : bank[0];
      return done('banque_locale', 'repondre', [
        ...(intro ? [text(intro)] : []),
        ...(e
          ? [
              {
                t: 'explication',
                id: e.id,
                texteFr: e.texteFr,
                ...(e.ar ? { ar: e.ar } : {}),
                source: e.source,
              } as Segment,
            ]
          : [text(TEXTS.vide)]),
      ]);
    };
    if (req.action === 'indice')
      return local(
        bank.filter(
          (e) => e.notion === 'regle' || e.notion.startsWith('lettre') || e.notion === 'decouverte',
        ),
      );
    if (req.action === 'lecon') return local(bank.filter((e) => e.notion === 'objectif'));
    if (req.action === 'mot') {
      const w = req.word ?? '';
      return local(bank.filter((e) => e.notion.startsWith('mot') && (!w || e.notion.includes(w))));
    }

    // ---- 4. modèle (explique encore ; question libre des ados et adultes)
    const provider = this.deps.provider;
    const fallbackList = searchBank(bank, question);
    if (!provider) return local(fallbackList.length ? fallbackList : bank);
    if ((this.deps.monthSpentMicros ?? 0) >= role.monthlyCapMicros)
      return local(fallbackList.length ? fallbackList : bank, TEXTS.plafond);
    const model = this.deps.modelFor?.(role) ?? role.model;
    const out = await provider.respond({
      role,
      model,
      context: { ...context, bank },
      action: req.action,
      question:
        question || (req.action === 'explique' ? 'Explique encore la leçon, autrement.' : ''),
    });
    base.model = provider.real ? model : null;
    base.usage = out.usage;
    base.costMicros = provider.real ? costMicros(model, out.usage) : 0;
    if (out.status === 'refus')
      return done('transmission', 'transmettre', [text(TEXTS.avis)], {
        transmit: { text: question, motif: 'refus_modele' },
      });
    if (out.status === 'erreur') {
      base.filter = [{ step: 'fournisseur', action: 'bloque', detail: out.detail ?? 'erreur' }];
      return { ...local(fallbackList.length ? fallbackList : bank, TEXTS.repli), route: 'repli' };
    }

    // ---- 5. filtre de sortie et rendu
    const f = filterDraft(out.draft, {
      index: this.deps.index,
      basmala: this.deps.basmala,
      context: { ...context, bank },
      audience: req.audience,
    });
    base.filter = f.events;
    if (!f.ok)
      return { ...local(fallbackList.length ? fallbackList : bank, TEXTS.repli), route: 'repli' };
    if (f.decision === 'transmettre')
      return done('transmission', 'transmettre', [text(TEXTS.avis)], {
        transmit: { text: question, motif: 'modele' },
      });
    if (f.decision === 'proteger')
      return done('protection', 'proteger', [text(TEXTS.detresse(helpline(req.country)))], {
        alert: { motif: 'modele' },
      });
    return done('modele', f.decision, f.segments);
  }

  private coranLocal(
    question: string,
    done: (r: Route, d: Decision, s: Segment[], x?: Partial<TutorResult>) => TutorResult,
    text: (v: string) => Segment,
  ): TutorResult {
    const ref = findQuranRef(question, this.deps.index);
    const seg = ref ? renderCoran(ref, this.deps.index.verses, this.deps.basmala) : null;
    if (!seg) return done('coran_local', 'repondre', [text(TEXTS.coranInconnu)]);
    const q = fold(question);
    const intro = /phoneti|latin|transcri|lettres latines/.test(q)
      ? TEXTS.coranPhonetique
      : /corrige/.test(q)
        ? TEXTS.coranCorrige
        : TEXTS.coranIntro;
    let count = 0;
    while (this.deps.index.verses.has(`${seg.s}:${count + 1}`)) count++;
    return done('coran_local', 'repondre', [
      text(intro),
      seg,
      ...(seg.to < count ? [text(TEXTS.coranSuite)] : []),
    ]);
  }
}
