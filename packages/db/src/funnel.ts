/**
 * V2-0 (29/10/2026) — mesure anonyme de l'inscription et de la connexion (voir `funnelEvent` dans le schéma).
 * Compteurs par (heure arrondie, étape, plateforme, langue) : AUCUNE donnée personnelle, aucune adresse IP.
 */
import { and, lt, sql } from 'drizzle-orm';
import type { Db } from './client.js';
import * as t from './schema.js';

export type EtapeFunnel = (typeof t.FUNNEL_ETAPES)[number];
export type PlateformeFunnel = (typeof t.FUNNEL_PLATEFORMES)[number];
export type LangueFunnel = (typeof t.FUNNEL_LANGUES)[number];

/** Conservation des compteurs : 90 jours. */
export const FUNNEL_JOURS = 90;

/** Étapes de l'entonnoir de chaque parcours, dans l'ordre ; les `cotes` sont des issues à part (échec, blocage). */
export const FUNNEL_PARCOURS = {
  inscription: {
    etapes: [
      'inscription_ouverte',
      'inscription_choix',
      'inscription_identifiants',
      'inscription_mdp_valide',
      'inscription_compte_cree',
    ],
    cotes: [],
  },
  connexion: {
    etapes: ['connexion_ouverte', 'connexion_identifiants', 'connexion_reussie'],
    cotes: ['connexion_echec_mdp', 'connexion_blocage'],
  },
} as const satisfies Record<
  string,
  { etapes: readonly EtapeFunnel[]; cotes: readonly EtapeFunnel[] }
>;

const estEtape = (s: string): s is EtapeFunnel =>
  (t.FUNNEL_ETAPES as readonly string[]).includes(s);

/** Heure arrondie (UTC) : la seule information de temps gardée. */
export const heureArrondie = (d: Date): Date =>
  new Date(Math.floor(d.getTime() / 3600_000) * 3600_000);

/**
 * Compte UNE étape atteinte. Étape, plateforme ou langue inconnues : plateforme « bureau » et langue « autre » par
 * défaut, étape inconnue ignorée. Renvoie vrai si un compteur a été incrémenté.
 */
export async function recordFunnel(
  db: Db,
  etape: string,
  plateforme: string,
  langue: string,
  now = new Date(),
): Promise<boolean> {
  if (!estEtape(etape)) return false;
  const p = (t.FUNNEL_PLATEFORMES as readonly string[]).includes(plateforme)
    ? plateforme
    : 'bureau';
  const l = (t.FUNNEL_LANGUES as readonly string[]).includes(langue) ? langue : 'autre';
  await db
    .insert(t.funnelEvent)
    .values({ hour: heureArrondie(now), step: etape, platform: p, locale: l, n: 1 })
    .onConflictDoUpdate({
      target: [
        t.funnelEvent.hour,
        t.funnelEvent.step,
        t.funnelEvent.platform,
        t.funnelEvent.locale,
      ],
      set: { n: sql`${t.funnelEvent.n} + 1` },
    });
  return true;
}

export interface LigneEntonnoir {
  etape: EtapeFunnel;
  n: number;
  /** pourcentage de la PREMIÈRE étape du parcours (arrondi à l'unité), null si cette première étape est à zéro */
  pourcent: number | null;
  /** issue à côté de l'entonnoir (échec, blocage) plutôt qu'une étape à franchir */
  cote: boolean;
}
export type Entonnoir = Record<keyof typeof FUNNEL_PARCOURS, LigneEntonnoir[]>;

/** Entonnoir des `jours` derniers jours (7 ou 30 en général) : nombre et pourcentage à chaque étape. */
export async function funnelReport(db: Db, jours: number, now = new Date()): Promise<Entonnoir> {
  const depuis = new Date(now.getTime() - jours * 86400_000);
  const rows = await db
    .select({ step: t.funnelEvent.step, n: sql<number>`sum(${t.funnelEvent.n})::int` })
    .from(t.funnelEvent)
    .where(sql`${t.funnelEvent.hour} >= ${depuis}`)
    .groupBy(t.funnelEvent.step);
  const par = new Map(rows.map((r) => [r.step, Number(r.n)]));
  const parcours = (k: keyof typeof FUNNEL_PARCOURS): LigneEntonnoir[] => {
    const { etapes, cotes } = FUNNEL_PARCOURS[k];
    const base = par.get(etapes[0]) ?? 0;
    const ligne = (etape: EtapeFunnel, cote: boolean): LigneEntonnoir => {
      const n = par.get(etape) ?? 0;
      return { etape, n, pourcent: base > 0 ? Math.round((n * 100) / base) : null, cote };
    };
    return [...etapes.map((e) => ligne(e, false)), ...cotes.map((e) => ligne(e, true))];
  };
  return { inscription: parcours('inscription'), connexion: parcours('connexion') };
}

/** Effacement automatique : compteurs de plus de 90 jours. Renvoie le nombre de lignes effacées. */
export async function purgeFunnel(db: Db, now = new Date(), jours = FUNNEL_JOURS): Promise<number> {
  const r = await db
    .delete(t.funnelEvent)
    .where(and(lt(t.funnelEvent.hour, new Date(now.getTime() - jours * 86400_000))));
  return r.rowCount ?? 0;
}
