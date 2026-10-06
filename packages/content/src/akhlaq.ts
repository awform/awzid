/**
 * Chantier A37 — fiches du livret « Bon comportement » des livres (`data/akhlaq/fiches/akh.fNNN.json`).
 * Le format des LIVRES fait foi (`ids/akhlaq-SCHEMA-B9.md`, chantier B9) : ce module le LIT tel quel, contrôle ce
 * dont l'application a besoin et garde les champs utiles à l'affichage ; aucun texte n'est réécrit. Les sources
 * (clés de `data/akhlaq/sources.json`, hadiths du registre, versets) sont rendues lisibles à l'import.
 * Une fiche invalide n'est pas importée : l'import la signale (fichier et motif) sans bloquer le reste.
 */
import {
  isCercle,
  isKind,
  isLieu,
  isStatut,
  verseRef,
  type Fiche,
  type FicheDire,
  type FichePoint,
  type Kind,
} from './adab.js';

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => !!x && typeof x === 'object' && !Array.isArray(x);
const text = (x: unknown) => (typeof x === 'string' ? x.trim() : '');
const strs = (x: unknown) =>
  Array.isArray(x) ? x.filter((y): y is string => typeof y === 'string') : [];

/** Libellés des sources : ouvrages (`sources.json`) et hadiths du registre (recueil et numéro). */
export interface SourceLabels {
  ouvrage?: (key: string) => string | null;
  hadith?: (id: string) => string | null;
}

/** Libellé lisible d'une clé de source (null : clé interne, non montrée). */
export function sourceLabel(key: string, L: SourceLabels): string | null {
  const q = /^QUR:(\d{1,3}:\d{1,3}(?:-\d{1,3})?)$/.exec(key);
  if (q) return `Coran ${q[1]}`;
  if (key.startsWith('HAD_')) return L.hadith?.(key) ?? null;
  if (/^[A-Z]{3}\.[\w.]+$/.test(key)) return L.ouvrage?.(key) ?? null;
  return null;
}

/** Lit et contrôle une fiche ; `fiche` est null si elle ne peut pas être montrée. */
export function parseFiche(
  raw: unknown,
  file = '',
  L: SourceLabels = {},
): { fiche: Fiche | null; errors: string[] } {
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
  const cercles = [text(raw.cercle), ...strs(raw.cercles_lies)].filter(Boolean);
  for (const c of cercles) if (!isCercle(c)) at(`cercle « ${c} » inconnu`);
  if (!cercles.length) at('cercle manquant');
  const lieux = strs(raw.lieux);
  for (const l of lieux) if (!isLieu(l)) at(`lieu « ${l} » inconnu`);
  const ages = strs(raw.ages).filter(isKind);
  if (!ages.length) at('ages manquants (enfant, ado, adulte)');
  const enfant = ages.includes('enfant');
  const S = isObj(raw.situation) ? raw.situation : {};
  const situation: Fiche['situation'] = {};
  for (const k of ['enfant', 'ado', 'adulte', 'tous'] as const)
    if (text(S[k])) situation[k] = text(S[k]);
  if (!Object.keys(situation).length) at('situation manquante');
  const agesOf = (x: Obj, where: string): Kind[] | undefined => {
    if (x.ages === undefined) return undefined;
    const a = strs(x.ages);
    if (!a.length || !a.every(isKind)) at(`${where} : ages invalides`);
    return a.filter(isKind);
  };
  const srcs = (keys: unknown) => [...new Set(strs(keys).flatMap((k) => sourceLabel(k, L) ?? []))];

  const point = (x: unknown, where: string): FichePoint | null => {
    if (!isObj(x) || !text(x.fr)) {
      at(`${where} : point sans texte`);
      return null;
    }
    if (!isStatut(x.statut)) at(`${where} : statut « ${String(x.statut)} » inconnu`);
    if (x.force !== undefined && x.force !== 'forte')
      at(`${where} : force « ${String(x.force)} » inconnue`);
    const pa = agesOf(x, where);
    if (enfant && (!pa || pa.includes('enfant')) && !text(x.enfant_fr))
      at(`${where} : texte de l'enfant manquant (enfant_fr)`);
    const s = srcs(x.src);
    return {
      id: text(x.id) || where,
      fr: text(x.fr),
      ...(text(x.enfant_fr) ? { enfant_fr: text(x.enfant_fr) } : {}),
      ...(text(x.ado_fr) ? { ado_fr: text(x.ado_fr) } : {}),
      ...(text(x.adulte_fr) ? { adulte_fr: text(x.adulte_fr) } : {}),
      ...(pa ? { ages: pa } : {}),
      statut: isStatut(x.statut) ? x.statut : 'conseil',
      ...(x.force === 'forte' ? { force: 'forte' as const } : {}),
      ...(text(x.note_fr) ? { note_fr: text(x.note_fr) } : {}),
      ...(s.length ? { sources_fr: s } : {}),
    };
  };
  const E = isObj(raw.etapes) ? raw.etapes : {};
  const step = (k: 'avant' | 'pendant' | 'apres') =>
    (Array.isArray(E[k]) ? (E[k] as unknown[]) : [])
      .map((x, i) => point(x, `etapes.${k}[${i}]`))
      .filter((p): p is FichePoint => !!p);
  const etapes = { avant: step('avant'), pendant: step('pendant'), apres: step('apres') };
  if (!etapes.avant.length && !etapes.pendant.length && !etapes.apres.length) at('aucune étape');

  const dire: FicheDire[] = [];
  (Array.isArray(raw.dire) ? raw.dire : []).forEach((x, i) => {
    const where = `dire[${i}]`;
    if (!isObj(x) || !text(x.ar) || !text(x.fr)) {
      at(`${where} : arabe et traduction exigés`);
      return;
    }
    const type = text(x.type);
    if (!['hadith', 'coran', 'formule'].includes(type)) {
      at(`${where} : type « ${type} » inconnu`);
      return;
    }
    // un verset : texte Tanzil, récitant humain seulement (jamais de voix de synthèse)
    if (type === 'coran' && (x.audio === true || !verseRef(text(x.src)))) {
      at(`${where} : verset sans référence, ou avec un audio de synthèse`);
      return;
    }
    const pa = agesOf(x, where);
    const source_fr =
      type === 'coran'
        ? `Coran ${text(x.src)}`
        : type === 'hadith'
          ? (L.hadith?.(text(x.had)) ?? '')
          : (strs(x.fondement)
              .map((k) => sourceLabel(k, L))
              .find(Boolean) ?? '');
    dire.push({
      id: text(x.id) || where,
      ...(['avant', 'pendant', 'apres'].includes(text(x.moment))
        ? { moment: text(x.moment) as 'avant' }
        : {}),
      role: text(x.role) === 'rappel' ? 'rappel' : 'dire',
      type: type as FicheDire['type'],
      ar: text(x.ar),
      fr: text(x.fr),
      ...(text(x.enfant_fr) ? { enfant_fr: text(x.enfant_fr) } : {}),
      ...(pa ? { ages: pa } : {}),
      ...(type === 'coran'
        ? { src: text(x.src), recitation: text(x.recitation) || text(x.src) }
        : {}),
      ...(source_fr ? { source_fr } : {}),
    });
  });
  const vraie_vie = (Array.isArray(raw.vraie_vie) ? raw.vraie_vie : []).flatMap((v) =>
    isObj(v) && text(v.fr)
      ? [{ pays: strs(v.pays).length ? strs(v.pays) : ['tous'], fr: text(v.fr) }]
      : [],
  );
  const Li = isObj(raw.liens) ? raw.liens : {};
  if (errors.length) return { fiche: null, errors };
  const opt = (k: string) => (text(raw[k]) ? { [k]: text(raw[k]) } : {});
  return {
    fiche: {
      id,
      ...opt('theme'),
      titre_fr,
      ...opt('titre_ar'),
      cercles: [...new Set(cercles.filter(isCercle))],
      lieux: lieux.filter(isLieu),
      ages,
      situation,
      etapes,
      dire,
      ...opt('pourquoi_fr'),
      ...opt('pourquoi_enfant_fr'),
      ...opt('attention_fr'),
      vraie_vie,
      ...opt('religion_coutume_fr'),
      ...opt('defi_fr'),
      ...opt('defi_enfant_fr'),
      liens: { lecons: strs(Li.lecons), fiches: strs(Li.fiches), gp: strs(Li.gp) },
      ...(raw.test === true ? { test: true } : {}),
    } as Fiche,
    errors,
  };
}

/** Lit un ensemble de fiches (identifiants en double refusés). */
export function readFiches(
  files: ReadonlyArray<{ file: string; raw: unknown }>,
  L: SourceLabels = {},
): { fiches: Fiche[]; errors: string[] } {
  const fiches: Fiche[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const { file, raw } of files) {
    const r = parseFiche(raw, file, L);
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

const pt = (k: string, statut: string, extra: Obj = {}): Obj => ({
  id: `essai.${k}`,
  fr: `Point d’essai ${k}.`,
  enfant_fr: `Point d’essai ${k} (enfant).`,
  statut,
  ...extra,
});

/**
 * Fiches d'ESSAI (A37), au format des livres : textes NEUTRES, sans contenu religieux, marqués `test`. Servies
 * SEULEMENT quand l'API tourne avec `AWFORM_AKHLAQ_ESSAI=on` (tests de bout en bout) ; jamais en démonstration
 * ni en production. Les statuts n'y sont que des exemples d'affichage des étiquettes.
 */
export const FICHES_ESSAI_BRUTES: readonly Obj[] = [
  {
    id: 'essai.chambre.01',
    titre_fr: 'Fiche d’essai : ranger sa chambre',
    titre_ar: 'تَجْرِبَةٌ',
    cercle: 'soi',
    lieux: ['chambre', 'maison'],
    ages: ['enfant', 'ado', 'adulte'],
    situation: {
      enfant: 'Situation d’essai pour l’enfant.',
      tous: 'Situation d’essai : des jouets par terre.',
    },
    etapes: {
      avant: [pt('A', 'recommande', { force: 'forte' })],
      pendant: [
        pt('B', 'obligatoire'),
        pt('C', 'permis', { ado_fr: 'Point d’essai C (ado).' }),
        pt('D', 'conseil'),
      ],
      apres: [
        pt('E', 'deconseille'),
        { id: 'essai.F', fr: 'Point d’essai F (adultes).', statut: 'recommande', ages: ['adulte'] },
      ],
    },
    dire: [
      {
        id: 'essai.d1',
        role: 'dire',
        type: 'formule',
        ar: 'هٰذَا نَصٌّ لِلتَّجْرِبَةِ',
        fr: 'Ceci est un texte d’essai.',
        enfant_fr: 'Texte d’essai (enfant).',
        audio: true,
      },
    ],
    pourquoi_fr: 'Explication d’essai.',
    pourquoi_enfant_fr: 'Explication d’essai (enfant).',
    vraie_vie: [
      { pays: ['tous'], fr: 'Exemple d’essai dans la vraie vie.' },
      { pays: ['SN'], fr: 'Exemple d’essai au Sénégal.' },
    ],
    religion_coutume_fr: 'Religion et coutume : texte d’essai.',
    defi_fr: 'Défi d’essai : ranger trois objets chaque soir.',
    defi_enfant_fr: 'Défi d’essai (enfant) : ranger un jouet.',
    test: true,
  },
  {
    id: 'essai.rue.01',
    titre_fr: 'Fiche d’essai : marcher sur le trottoir',
    cercle: 'espace_public',
    lieux: ['rue', 'transports'],
    ages: ['ado', 'adulte'],
    situation: { tous: 'Situation d’essai : un trottoir étroit.' },
    etapes: { avant: [], pendant: [pt('G', 'interdit'), pt('H', 'recommande')], apres: [] },
    dire: [],
    attention_fr: 'Attention d’essai.',
    defi_fr: 'Défi d’essai : laisser passer quelqu’un.',
    test: true,
  },
  {
    id: 'essai.travail.01',
    titre_fr: 'Fiche d’essai : arriver à l’heure',
    cercle: 'travail',
    lieux: ['travail'],
    ages: ['adulte'],
    situation: { tous: 'Situation d’essai : une réunion à 9 h.' },
    etapes: { avant: [pt('I', 'permis')], pendant: [], apres: [] },
    dire: [],
    test: true,
  },
];
export const FICHES_ESSAI: readonly Fiche[] = readFiches(
  FICHES_ESSAI_BRUTES.map((raw) => ({ file: 'essai', raw })),
).fiches;
