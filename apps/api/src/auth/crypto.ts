/**
 * Primitives cryptographiques de l'authentification (OWASP ASVS 5.0 niveau 2, chapitres V6 à V7) :
 *  - mots de passe et code parent : Argon2id (node:crypto, paramètres OWASP : 19 Mio, 2 passes, 1 fil) ;
 *  - jetons de session : 32 octets aléatoires, seul le SHA-256 est stocké ;
 *  - secret TOTP chiffré au repos : AES-256-GCM, clé serveur hors dépôt ;
 *  - TOTP (RFC 6238, SHA-1, 6 chiffres, 30 s, fenêtre ±1) pour les enseignants et administrateurs.
 * Aucune bibliothèque tierce : uniquement node:crypto.
 */
import {
  argon2,
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

interface ArgonParams {
  memory: number;
  passes: number;
  parallelism: number;
  tagLength: number;
}
const ARGON: ArgonParams = { memory: 19_456, passes: 2, parallelism: 1, tagLength: 32 };

function argon2id(message: string, nonce: Buffer, p = ARGON): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    argon2(
      'argon2id',
      {
        message,
        nonce,
        memory: p.memory,
        passes: p.passes,
        parallelism: p.parallelism,
        tagLength: p.tagLength,
      },
      (err, out) => (err ? reject(err) : resolve(out)),
    ),
  );
}

/** Empreinte au format PHC : $argon2id$v=19$m=19456,t=2,p=1$<sel>$<empreinte> (base64 sans remplissage). */
export async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(16);
  const h = await argon2id(secret, salt);
  const b64 = (b: Buffer) => b.toString('base64').replace(/=+$/, '');
  return `$argon2id$v=19$m=${ARGON.memory},t=${ARGON.passes},p=${ARGON.parallelism}$${b64(salt)}$${b64(h)}`;
}

export async function verifySecret(
  secret: string,
  phc: string | null | undefined,
): Promise<boolean> {
  const m = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/.exec(
    phc ?? '',
  );
  if (!m) {
    // compte inconnu : on calcule quand même une empreinte (pas d'écart de temps exploitable)
    await argon2id(secret, randomBytes(16));
    return false;
  }
  const expected = Buffer.from(m[5] ?? '', 'base64');
  const got = await argon2id(secret, Buffer.from(m[4] ?? '', 'base64'), {
    memory: Number(m[1]),
    passes: Number(m[2]),
    parallelism: Number(m[3]),
    tagLength: expected.length,
  });
  return got.length === expected.length && timingSafeEqual(got, expected);
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

// ------------------------------------------------------------------ chiffrement au repos (AES-256-GCM)

export function encrypt(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return `v1.${iv.toString('base64url')}.${data.toString('base64url')}.${c.getAuthTag().toString('base64url')}`;
}

export function decrypt(box: string, key: Buffer): string {
  const [v, iv, data, tag] = box.split('.');
  if (v !== 'v1' || !iv || !data || !tag) throw new Error('format chiffré inconnu');
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(data, 'base64url')), d.final()]).toString('utf8');
}

// ------------------------------------------------------------------ TOTP (RFC 6238)

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.replace(/=+$/, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error('base32 invalide');
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function totpAt(secretB32: string, counter: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', base32Decode(secretB32)).update(msg).digest();
  const off = (h[h.length - 1] ?? 0) & 0x0f;
  const code = ((h.readUInt32BE(off) & 0x7fffffff) % 1_000_000).toString();
  return code.padStart(6, '0');
}

/** Vérifie un code à 6 chiffres (fenêtre ±30 s) ; renvoie le compteur accepté (anti-rejeu) ou null. */
export function verifyTotp(secretB32: string, code: string, now = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const c = Math.floor(now / 30_000);
  for (const d of [0, -1, 1]) {
    const expected = Buffer.from(totpAt(secretB32, c + d));
    if (timingSafeEqual(expected, Buffer.from(code))) return c + d;
  }
  return null;
}

export function newTotpSecret(): string {
  return base32Encode(randomBytes(20));
}
