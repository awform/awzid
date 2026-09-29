/**
 * Mise en service du tuteur (décision du pilote, lot 9) : DÉSACTIVÉ par défaut en production.
 *   AWFORM_TUTEUR=off      (défaut) aucun tuteur ;
 *   AWFORM_TUTEUR=local    banque d'explications validées seule, sans modèle ;
 *   AWFORM_TUTEUR=simule   fournisseur simulé déterministe (tests, démonstration) ;
 *   AWFORM_TUTEUR=claude   Claude — SEULEMENT si ANTHROPIC_API_KEY est fourni par l'environnement ET si
 *                          AWFORM_TUTEUR_BATTERIE désigne un rapport de la batterie adverse RÉUSSI avec le
 *                          fournisseur « claude », les mêmes rôles (empreinte) et les mêmes modèles ;
 *                          audit CON-9 : rapport SIGNÉ (HMAC-SHA256, clé d'exploitation
 *                          AWFORM_TUTEUR_BATTERIE_CLE), au moins BATTERY_MIN_CASES cas, daté de moins de
 *                          90 jours, même empreinte du filtre de sortie.
 *                          Sinon : repli sur « local » et état « claude_bloque_* » visible.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { filterFingerprint } from './filter.js';
import { ClaudeProvider } from './providers/claude.js';
import { SimulatedProvider } from './providers/simule.js';
import type { TutorProvider } from './providers/types.js';
import { ROLES, rolesFingerprint, type RoleConfig } from './roles.js';

export type TutorMode = 'off' | 'local' | 'simule' | 'claude';

export interface TutorSetup {
  mode: TutorMode;
  provider: TutorProvider | null;
  /** raison d'un repli (clé absente, batterie non passée…) */
  blocked?: string;
  modelFor: (role: RoleConfig) => string;
}

export function modelFor(env: NodeJS.ProcessEnv) {
  return (role: RoleConfig) =>
    (role.audience === 'enfant'
      ? env.AWFORM_TUTEUR_MODELE_ENFANT
      : env.AWFORM_TUTEUR_MODELE_ADULTE) || role.model;
}

/** Modèles effectifs par rôle (la batterie les enregistre ; ils doivent être identiques à la mise en service). */
export function effectiveModels(env: NodeJS.ProcessEnv): Record<string, string> {
  const f = modelFor(env);
  return Object.fromEntries(Object.values(ROLES).map((r) => [r.id, f(r)]));
}

export interface BatteryReport {
  fournisseur: string;
  reussi: boolean;
  roles: string;
  modeles: Record<string, string>;
  date: string;
  cas: number;
  /** empreinte du filtre de sortie au moment de la batterie */
  filtre?: string;
  /** HMAC-SHA256 du rapport (sans ce champ), clé d'exploitation */
  signature?: string;
}

/** nombre minimal de cas d'un rapport de mise en service (batterie complète) */
export const BATTERY_MIN_CASES = 1147;
const BATTERY_MAX_AGE_MS = 90 * 86_400_000;

/** JSON canonique (clés triées) : la signature ne dépend pas de l'ordre d'écriture */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object')
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  return JSON.stringify(v);
}

export function signReport<T extends object>(rep: T, key: string): T & { signature: string } {
  const { signature: _drop, ...rest } = rep as T & { signature?: string };
  void _drop;
  const sig = createHmac('sha256', key).update(canonical(rest)).digest('hex');
  return { ...(rest as T), signature: sig };
}

function signatureOk(rep: BatteryReport, key: string): boolean {
  if (!rep.signature) return false;
  const want = Buffer.from(signReport(rep, key).signature);
  const got = Buffer.from(rep.signature);
  return got.length === want.length && timingSafeEqual(got, want);
}

export function setupTutor(env: NodeJS.ProcessEnv = process.env): TutorSetup {
  const mode = (env.AWFORM_TUTEUR ?? 'off') as TutorMode;
  const mf = modelFor(env);
  if (mode === 'simule') return { mode, provider: new SimulatedProvider(), modelFor: mf };
  if (mode === 'local') return { mode, provider: null, modelFor: mf };
  if (mode !== 'claude') return { mode: 'off', provider: null, modelFor: mf };
  if (!env.ANTHROPIC_API_KEY)
    return { mode: 'local', provider: null, blocked: 'claude_bloque_cle_absente', modelFor: mf };
  const path = env.AWFORM_TUTEUR_BATTERIE;
  if (!path || !existsSync(path))
    return {
      mode: 'local',
      provider: null,
      blocked: 'claude_bloque_batterie_absente',
      modelFor: mf,
    };
  const key = env.AWFORM_TUTEUR_BATTERIE_CLE ?? '';
  if (key.length < 32)
    return {
      mode: 'local',
      provider: null,
      blocked: 'claude_bloque_cle_batterie_absente',
      modelFor: mf,
    };
  try {
    const rep = JSON.parse(readFileSync(path, 'utf8')) as BatteryReport;
    const models = effectiveModels(env);
    const sameModels = Object.entries(models).every(([k, v]) => rep.modeles?.[k] === v);
    const age = Date.now() - Date.parse(rep.date);
    if (
      rep.fournisseur !== 'claude' ||
      !rep.reussi ||
      rep.roles !== rolesFingerprint() ||
      !sameModels ||
      !signatureOk(rep, key) ||
      !(rep.cas >= BATTERY_MIN_CASES) ||
      !(age >= 0 && age <= BATTERY_MAX_AGE_MS) ||
      rep.filtre !== filterFingerprint()
    )
      return {
        mode: 'local',
        provider: null,
        blocked: 'claude_bloque_batterie_non_conforme',
        modelFor: mf,
      };
  } catch {
    return {
      mode: 'local',
      provider: null,
      blocked: 'claude_bloque_batterie_illisible',
      modelFor: mf,
    };
  }
  return { mode, provider: new ClaudeProvider(), modelFor: mf };
}
