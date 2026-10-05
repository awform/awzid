/**
 * Compte connecté côté appareil : appels à l'API (cookie de session HttpOnly, en-tête anti-CSRF),
 * informations du compte gardées pour le hors ligne (sans aucun secret), profil actif.
 */
import { clearStore, delMany, kvGet, kvKeys, kvSet } from './idb';
import { flushQueue, pendingCount } from './sync-core';

export interface ProfileInfo {
  id: string;
  kind: 'enfant' | 'ado' | 'adulte';
  pseudonym: string;
  birthYear: number | null;
  avatar: string | null;
  levelCode: string | null;
  /** lot F2 : titulaire du profil, parent responsable (second parent), élève de la classe (tablette) */
  lien?: 'titulaire' | 'parent' | 'classe';
}

export interface Me {
  /** lot F2 (revue E2) : rôles du compte (plateforme et écoles), en plus du type du titulaire */
  roles?: string[];
  ecoles?: Array<{ id: string; name: string; personal: boolean; roles: string[] }>;
  /** session de tablette de classe (compte de l'école) */
  tablette?: { classId: string; className: string; school: string } | null;
  account: {
    id: string;
    kind: 'parent' | 'adulte' | 'enseignant' | 'admin' | 'ecole';
    email: string | null;
    country: string | null;
    locale: string;
    totpEnabled: boolean;
    hasPin: boolean;
    createdAt: string;
  };
  profiles: ProfileInfo[];
  mfaRequired: boolean;
  mfaVerified: boolean;
}

/**
 * Lot F2 : espace enseignant ouvert par un RÔLE (enseignant, direction, secrétariat d'une école) ou par un
 * compte de personnel (enseignant, admin) — un parent peut aussi être enseignant avec le même e-mail.
 */
export function isStaff(me: Me | null | undefined): boolean {
  if (!me) return false;
  if (me.account.kind === 'enseignant' || me.account.kind === 'admin') return true;
  return (me.roles ?? []).some(
    (r) => r === 'enseignant' || r === 'direction' || r === 'secretariat',
  );
}

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  /** code d'erreur stable renvoyé par l'API (traduit par l'interface) */
  code: string | null;
  error: Record<string, unknown> | null;
}

export async function call<T>(
  method: string,
  path: string,
  body?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<ApiResult<T>> {
  try {
    const r = await fetch(`/api/v1${path}`, {
      method,
      headers: {
        accept: 'application/json',
        ...(method !== 'GET' ? { 'content-type': 'application/json', 'x-awform': '1' } : {}),
        ...(extraHeaders ?? {}),
      },
      body: method !== 'GET' ? JSON.stringify(body ?? {}) : undefined,
      credentials: 'same-origin',
    });
    const json = (await r.json().catch(() => null)) as
      (T & { error?: Record<string, unknown> }) | null;
    const err = json?.error ?? null;
    return {
      ok: r.ok,
      status: r.status,
      data: r.ok ? json : null,
      code: (err?.code as string) ?? null,
      error: err,
    };
  } catch {
    return { ok: false, status: 0, data: null, code: 'reseau', error: null };
  }
}

/** Compte connecté (réseau), sinon la dernière copie gardée sur l'appareil. */
export async function fetchMe(): Promise<Me | null> {
  const r = await call<Me>('GET', '/auth/me');
  if (r.ok && r.data) {
    await kvSet('me', r.data).catch(() => {});
    return r.data;
  }
  if (r.status === 401) {
    await kvSet('me', null).catch(() => {});
    return null;
  }
  return (await kvGet<Me | null>('me').catch(() => null)) ?? null;
}

export async function cachedMe(): Promise<Me | null> {
  return (await kvGet<Me | null>('me').catch(() => null)) ?? null;
}

/** Données PERSONNELLES laissées sur l'appareil par le compte : effacées à la déconnexion (audit OFF-3). */
const PERSONAL_KV = /^(cards|recLocal):/;

/** Réponses pas encore envoyées (à dire avant de se déconnecter). */
export async function unsentCount(): Promise<number> {
  return pendingCount().catch(() => 0);
}

/**
 * Déconnexion (audit OFF-3, appareil partagé) : envoi de la file tenté D'ABORD ; puis voix enregistrées,
 * cartes de mots et réglages par profil effacés. Les réponses encore non envoyées restent (elles partiront à
 * la prochaine connexion du même compte ; un autre compte ne les efface plus) : leur nombre est renvoyé.
 */
export async function logout(): Promise<{ pending: number }> {
  const f = await flushQueue().catch(() => null);
  await call('POST', '/auth/logout');
  await kvSet('me', null).catch(() => {});
  await kvSet('activeProfile', null).catch(() => {});
  await clearStore('recordings').catch(() => {});
  const keys = (await kvKeys().catch(() => [] as string[])).filter((k) => PERSONAL_KV.test(k));
  if (keys.length) await delMany('kv', keys).catch(() => {});
  return { pending: f?.remaining ?? (await unsentCount()) };
}
