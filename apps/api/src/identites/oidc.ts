/**
 * OpenID Connect (« Continuer avec Google ») — primitives sans bibliothèque tierce (node:crypto) :
 *  - PKCE (RFC 7636, S256), `state` (anti-CSRF) et `nonce` (anti-rejeu du jeton d'identité) ;
 *  - vérification du jeton d'identité (JWT RS256) : signature par les clés publiques du fournisseur (JWKS, gardées
 *    en cache selon Cache-Control, relues si une clé inconnue apparaît, au plus une fois par minute), `iss`, `aud`,
 *    `exp` (marge de 60 s), `iat`, `nonce`, `email_verified` vrai ;
 *  - cookies de la connexion CHIFFRÉS (AES-256-GCM, clé du serveur) et datés.
 */
import { createHash, createPublicKey, randomBytes, timingSafeEqual, verify } from 'node:crypto';
import { decrypt, encrypt } from '../auth/crypto.js';

export type Fetch = typeof fetch;
const b64url = (b: Buffer) => b.toString('base64url');

export function pkce(): { verifier: string; challenge: string } {
  const verifier = b64url(randomBytes(48));
  return { verifier, challenge: b64url(createHash('sha256').update(verifier).digest()) };
}
export const aleatoire = (n = 32) => b64url(randomBytes(n));

export function egal(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Paquet chiffré et daté (cookie) ; null s'il est illisible ou expiré. */
export function sceller(key: Buffer, data: object, ttlMs: number, now = Date.now()): string {
  return encrypt(JSON.stringify({ ...data, exp: now + ttlMs }), key);
}
export function ouvrir<T extends object>(
  key: Buffer,
  box: string | null | undefined,
  now = Date.now(),
): T | null {
  if (!box || box.length > 4000) return null;
  try {
    const v = JSON.parse(decrypt(box, key)) as T & { exp?: number };
    return typeof v.exp === 'number' && v.exp > now ? v : null;
  } catch {
    return null;
  }
}

interface Jwk {
  kid?: string;
  kty: string;
  n?: string;
  e?: string;
  alg?: string;
  use?: string;
}

/** Clés publiques du fournisseur, en cache. */
export class Jwks {
  private keys = new Map<string, Jwk>();
  private until = 0;
  private lastFetch = 0;
  constructor(
    private url: string,
    private fetchImpl: Fetch = fetch,
  ) {}
  private async load(now: number) {
    this.lastFetch = now;
    const r = await this.fetchImpl(this.url, { signal: AbortSignal.timeout(8_000) });
    if (!r.ok) throw new Error(`jwks ${r.status}`);
    const body = (await r.json()) as { keys?: Jwk[] };
    this.keys = new Map((body.keys ?? []).filter((k) => k.kid).map((k) => [k.kid!, k]));
    const age = /max-age=(\d+)/.exec(r.headers.get('cache-control') ?? '');
    this.until = now + Math.min(Number(age?.[1] ?? 3600), 86_400) * 1000;
  }
  async key(kid: string, now = Date.now()): Promise<Jwk | null> {
    if (now >= this.until) await this.load(now);
    if (!this.keys.has(kid) && now - this.lastFetch > 60_000) await this.load(now);
    return this.keys.get(kid) ?? null;
  }
}

export interface Revendications {
  sub: string;
  email: string;
  name: string | null;
}

export type RefusJeton =
  | 'jeton_format'
  | 'jeton_algorithme'
  | 'jeton_cle'
  | 'jeton_signature'
  | 'jeton_emetteur'
  | 'jeton_audience'
  | 'jeton_expire'
  | 'jeton_nonce'
  | 'email_non_verifie';

export class ErreurJeton extends Error {
  constructor(public code: RefusJeton) {
    super(code);
  }
}

/** Vérifie un jeton d'identité ; lève ErreurJeton (code stable) au premier défaut. */
export async function verifierJetonIdentite(
  idToken: string,
  o: { jwks: Jwks; clientId: string; issuers: string[]; nonce: string; now?: number },
): Promise<Revendications> {
  const now = o.now ?? Date.now();
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new ErreurJeton('jeton_format');
  let head: { alg?: string; kid?: string };
  let claims: Record<string, unknown>;
  try {
    head = JSON.parse(Buffer.from(parts[0]!, 'base64url').toString('utf8'));
    claims = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8'));
  } catch {
    throw new ErreurJeton('jeton_format');
  }
  if (head.alg !== 'RS256') throw new ErreurJeton('jeton_algorithme');
  const jwk = head.kid ? await o.jwks.key(head.kid, now) : null;
  if (!jwk || jwk.kty !== 'RSA') throw new ErreurJeton('jeton_cle');
  const ok = verify(
    'RSA-SHA256',
    Buffer.from(`${parts[0]}.${parts[1]}`),
    createPublicKey({ key: { kty: 'RSA', n: jwk.n!, e: jwk.e! }, format: 'jwk' }),
    Buffer.from(parts[2]!, 'base64url'),
  );
  if (!ok) throw new ErreurJeton('jeton_signature');
  if (typeof claims.iss !== 'string' || !o.issuers.includes(claims.iss))
    throw new ErreurJeton('jeton_emetteur');
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(o.clientId)) throw new ErreurJeton('jeton_audience');
  if (aud.length > 1 && claims.azp !== o.clientId) throw new ErreurJeton('jeton_audience');
  const sec = Math.floor(now / 1000);
  if (typeof claims.exp !== 'number' || claims.exp + 60 < sec)
    throw new ErreurJeton('jeton_expire');
  if (typeof claims.iat === 'number' && claims.iat - 300 > sec)
    throw new ErreurJeton('jeton_expire');
  if (typeof claims.nonce !== 'string' || !egal(claims.nonce, o.nonce))
    throw new ErreurJeton('jeton_nonce');
  if (claims.email_verified !== true && claims.email_verified !== 'true')
    throw new ErreurJeton('email_non_verifie');
  if (typeof claims.sub !== 'string' || !claims.sub || typeof claims.email !== 'string')
    throw new ErreurJeton('jeton_format');
  return {
    sub: claims.sub,
    email: claims.email.trim().toLowerCase(),
    name: typeof claims.name === 'string' ? claims.name.slice(0, 120) : null,
  };
}
