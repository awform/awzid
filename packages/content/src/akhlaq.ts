/**
 * Chantier A37 — fiches du livret « Bon comportement » (côté livres : `data/akhlaq/fiches/*.json`) et index
 * officiel des rubriques (`data/akhlaq/index-adab.json`).
 *
 * Format attendu d'une fiche (JSON strict, une fiche par fichier ; à reporter dans SCHEMA.md des livres) :
 * {
 *   "id": "akh.ecole.01",                       // identifiant gelé, unique
 *   "titre_fr": "…", "titre_ar": "…",           // titre_ar facultatif
 *   "cercles": ["ecole"], "lieux": ["ecole"],   // identifiants de adab.ts (CERCLES, LIEUX)
 *   "ages": ["enfant", "ado", "adulte"],        // publics de la fiche
 *   "prerequis": ["en1.l05"],                   // facultatif : leçons à avoir atteintes
 *   "situation_fr": "…",
 *   "etapes": { "avant": [Point], "pendant": [Point], "apres": [Point] },
 *   "dire": [{ "ar": "…", "fr": "…", "source_fr": "…" }],   // ce qu'on dit : arabe, traduction, source
 *   "pourquoi_fr": "…", "vraie_vie_fr": "…",
 *   "situations": [{ "question_fr": "Que fais-tu si… ?", "reponse_fr": "…" }],   // ados, adultes
 *   "defi_fr": "…"
 * }
 * Point = { "fr": "…", "statut": "obligatoire|recommande|permis|deconseille|interdit", "ar": "…", "source_fr": "…" }
 * (`ar`, `source_fr` facultatifs ; `statut` exigé dans les étapes — c'est l'étiquette de couleur affichée).
 * Une fiche invalide n'est pas importée : l'import la signale (fichier et motif) sans bloquer le reste.
 */
import {
  isCercle,
  isLieu,
  isStatut,
  KINDS,
  type Fiche,
  type FicheDire,
  type FichePoint,
  type Kind,
} from './adab.js';

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => !!x && typeof x === 'object' && !Array.isArray(x);
const text = (x: unknown) => (typeof x === 'string' ? x.trim() : '');

/** Lit et contrôle une fiche ; `fiche` est null si elle ne peut pas être montrée. */
export function parseFiche(raw: unknown, file = ''): { fiche: Fiche | null; errors: string[] } {
  const errors: string[] = [];
  const at = (m: string) => errors.push(file ? `${file} : ${m}` : m);
  if (!isObj(raw)) {
    at('fiche illisible (objet JSON attendu)');
    return { fiche: null, errors };
  }
  const id = text(raw.id);
  if (!/^[a-z0-9][a-z0-9._-]{1,80}$/.test(id)) at(`identifiant invalide « ${id} »`);
  const titre_fr = text(raw.titre_fr);
  if (!titre_fr) at('titre_fr manquant');
  const situation_fr = text(raw.situation_fr);
  if (!situation_fr) at('situation_fr manquante');
  const ids = (k: string, ok: (x: unknown) => boolean) => {
    const v = raw[k];
    if (v === undefined) return [];
    if (!Array.isArray(v)) {
      at(`${k} : liste attendue`);
      return [];
    }
    for (const x of v) if (!ok(x)) at(`${k} : « ${String(x)} » inconnu`);
    return v.filter(ok) as string[];
  };
  const cercles = ids('cercles', isCercle) as Fiche['cercles'];
  const lieux = ids('lieux', isLieu) as Fiche['lieux'];
  if (!cercles.length && !lieux.length) at('ni cercle ni lieu');
  const ages = ids('ages', (x) => KINDS.includes(x as Kind)) as Kind[];
  if (!ages.length) at('ages manquants (enfant, ado, adulte)');
  const prerequis = ids(
    'prerequis',
    (x) => typeof x === 'string' && /^[a-z]{2,4}\d{1,2}\.l\d{2}$/.test(x),
  );

  const point = (x: unknown, where: string, statutExige: boolean): FichePoint | null => {
    if (!isObj(x) || !text(x.fr)) {
      at(`${where} : point sans texte français`);
      return null;
    }
    if (x.statut !== undefined && !isStatut(x.statut))
      at(`${where} : statut « ${String(x.statut)} » inconnu`);
    if (statutExige && x.statut === undefined) at(`${where} : statut manquant`);
    return {
      fr: text(x.fr),
      ...(isStatut(x.statut) ? { statut: x.statut } : {}),
      ...(text(x.ar) ? { ar: text(x.ar) } : {}),
      ...(text(x.source_fr) ? { source_fr: text(x.source_fr) } : {}),
    };
  };
  const E = isObj(raw.etapes) ? raw.etapes : {};
  if (!isObj(raw.etapes)) at('etapes manquantes (avant, pendant, après)');
  const step = (k: 'avant' | 'pendant' | 'apres') =>
    (Array.isArray(E[k]) ? (E[k] as unknown[]) : [])
      .map((x, i) => point(x, `etapes.${k}[${i}]`, true))
      .filter((p): p is FichePoint => !!p);
  const etapes = { avant: step('avant'), pendant: step('pendant'), apres: step('apres') };
  if (!etapes.avant.length && !etapes.pendant.length && !etapes.apres.length) at('aucune étape');

  const dire: FicheDire[] = [];
  (Array.isArray(raw.dire) ? raw.dire : []).forEach((x, i) => {
    if (!isObj(x) || !text(x.ar) || !text(x.fr)) {
      at(`dire[${i}] : arabe et traduction exigés`);
      return;
    }
    dire.push({
      ar: text(x.ar),
      fr: text(x.fr),
      ...(text(x.source_fr) ? { source_fr: text(x.source_fr) } : {}),
    });
  });
  const situations: Fiche['situations'] = [];
  (Array.isArray(raw.situations) ? raw.situations : []).forEach((x, i) => {
    if (!isObj(x) || !text(x.question_fr) || !text(x.reponse_fr)) {
      at(`situations[${i}] : question et réponse exigées`);
      return;
    }
    situations.push({ question_fr: text(x.question_fr), reponse_fr: text(x.reponse_fr) });
  });
  if (errors.length) return { fiche: null, errors };
  const opt = (k: string) => (text(raw[k]) ? { [k]: text(raw[k]) } : {});
  return {
    fiche: {
      id,
      titre_fr,
      ...opt('titre_ar'),
      cercles,
      lieux,
      ages,
      prerequis,
      situation_fr,
      etapes,
      dire,
      ...opt('pourquoi_fr'),
      ...opt('vraie_vie_fr'),
      situations,
      ...opt('defi_fr'),
      ...(raw.test === true ? { test: true } : {}),
    } as Fiche,
    errors,
  };
}

/** Lit un ensemble de fiches (identifiants en double refusés). */
export function readFiches(files: ReadonlyArray<{ file: string; raw: unknown }>): {
  fiches: Fiche[];
  errors: string[];
} {
  const fiches: Fiche[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const { file, raw } of files) {
    const r = parseFiche(raw, file);
    errors.push(...r.errors);
    if (!r.fiche) continue;
    if (seen.has(r.fiche.id)) {
      errors.push(`${file} : identifiant « ${r.fiche.id} » en double`);
      continue;
    }
    seen.add(r.fiche.id);
    fiches.push(r.fiche);
  }
  return { fiches: fiches.sort((a, b) => a.id.localeCompare(b.id)), errors };
}

/**
 * Fiches d'ESSAI (A37), en attendant les vraies : textes NEUTRES, sans contenu religieux, marqués `test`.
 * Servies SEULEMENT quand l'API tourne avec `AWFORM_AKHLAQ_ESSAI=on` (tests de bout en bout) ; jamais en
 * démonstration ni en production. Les statuts n'y sont que des exemples d'affichage des cinq étiquettes.
 */
export const FICHES_ESSAI: readonly Fiche[] = [
  {
    id: 'essai.chambre.01',
    titre_fr: 'Fiche d’essai : ranger sa chambre',
    titre_ar: 'تَجْرِبَةٌ',
    cercles: ['soi'],
    lieux: ['chambre', 'maison'],
    ages: ['enfant', 'ado', 'adulte'],
    prerequis: [],
    situation_fr: 'Situation d’essai : le soir, des jouets sont restés par terre.',
    etapes: {
      avant: [{ fr: 'Point d’essai A (avant).', statut: 'recommande' }],
      pendant: [
        { fr: 'Point d’essai B (pendant).', statut: 'obligatoire' },
        { fr: 'Point d’essai C (pendant).', statut: 'permis' },
      ],
      apres: [{ fr: 'Point d’essai D (après).', statut: 'deconseille' }],
    },
    dire: [
      {
        ar: 'هٰذَا نَصٌّ لِلتَّجْرِبَةِ',
        fr: 'Ceci est un texte d’essai.',
        source_fr: 'Source d’essai',
      },
    ],
    pourquoi_fr: 'Explication d’essai.',
    vraie_vie_fr: 'Exemple d’essai dans la vraie vie.',
    situations: [
      { question_fr: 'Que fais-tu si… (question d’essai) ?', reponse_fr: 'Réponse d’essai.' },
    ],
    defi_fr: 'Défi d’essai : ranger trois objets chaque soir.',
    test: true,
  },
  {
    id: 'essai.rue.01',
    titre_fr: 'Fiche d’essai : marcher sur le trottoir',
    cercles: ['rue'],
    lieux: ['rue', 'transports'],
    ages: ['ado', 'adulte'],
    prerequis: [],
    situation_fr: 'Situation d’essai : un trottoir étroit.',
    etapes: {
      avant: [],
      pendant: [
        { fr: 'Point d’essai E (pendant).', statut: 'interdit' },
        { fr: 'Point d’essai F (pendant).', statut: 'recommande' },
      ],
      apres: [],
    },
    dire: [],
    situations: [
      {
        question_fr: 'Que fais-tu si… (deuxième question d’essai) ?',
        reponse_fr: 'Réponse d’essai 2.',
      },
    ],
    defi_fr: 'Défi d’essai : laisser passer quelqu’un.',
    test: true,
  },
  {
    id: 'essai.travail.01',
    titre_fr: 'Fiche d’essai : arriver à l’heure',
    cercles: ['travail'],
    lieux: ['travail'],
    ages: ['adulte'],
    prerequis: [],
    situation_fr: 'Situation d’essai : une réunion à 9 h.',
    etapes: {
      avant: [{ fr: 'Point d’essai G (avant).', statut: 'permis' }],
      pendant: [],
      apres: [],
    },
    dire: [],
    situations: [],
    test: true,
  },
];
