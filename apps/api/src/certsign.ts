/**
 * Signature des certificats (lot 20, V1-e) : Ed25519. La clé PRIVÉE (graine de 32 octets,
 * `AWFORM_CERT_SIGN_KEY` = « v1:<64 hex> ») n'existe que dans le périmètre de l'API ; la clé PUBLIQUE est
 * publiée (`/api/v1/public/certificats/cle`) pour une vérification hors ligne.
 * La signature porte sur les champs du REGISTRE durable (numéro, type, niveau ou passage, nom affiché,
 * mention, date) : elle reste vérifiable après la réduction du document complet (30 jours après le départ).
 */
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  randomInt,
  sign,
  verify,
  type KeyObject,
} from 'node:crypto';

export interface CertSigner {
  keyId: string;
  privateKey: KeyObject;
  publicKey: KeyObject;
  publicPem: string;
}

/** En-tête DER PKCS#8 d'une clé privée Ed25519 (suivi des 32 octets de la graine). */
const PKCS8_ED25519 = Buffer.from('302e020100300506032b657004220420', 'hex');

export function parseCertSignKey(raw: string | undefined | null): CertSigner | null {
  const m = /^(?:v\d+:)?([0-9a-f]{64})$/i.exec((raw ?? '').trim());
  if (!m) return null;
  const privateKey = createPrivateKey({
    key: Buffer.concat([PKCS8_ED25519, Buffer.from(m[1]!, 'hex')]),
    format: 'der',
    type: 'pkcs8',
  });
  const publicKey = createPublicKey(privateKey);
  const der = publicKey.export({ format: 'der', type: 'spki' });
  return {
    keyId: createHash('sha256').update(der).digest('hex').slice(0, 16),
    privateKey,
    publicKey,
    publicPem: String(publicKey.export({ format: 'pem', type: 'spki' })),
  };
}

export function certSignerFromEnv(): CertSigner | null {
  return parseCertSignKey(process.env.AWFORM_CERT_SIGN_KEY);
}

export interface RegistryFields {
  number: string;
  kind: string;
  subject: string;
  holderName: string | null;
  mention: string | null;
  issuedAt: Date;
}

/** Texte signé : préfixe de version + JSON à clés fixes (aucune normalisation Unicode). */
export function certPayload(c: RegistryFields): Buffer {
  return Buffer.from(
    'AWZID-CERT-1\n' +
      JSON.stringify([
        c.number,
        c.kind,
        c.subject,
        c.holderName ?? '',
        c.mention ?? '',
        c.issuedAt.toISOString(),
      ]),
    'utf8',
  );
}

export function signCert(s: CertSigner, c: RegistryFields): string {
  return sign(null, certPayload(c), s.privateKey).toString('base64url');
}

export function verifyCert(publicKey: KeyObject, c: RegistryFields, signature: string): boolean {
  try {
    return verify(null, certPayload(c), publicKey, Buffer.from(signature, 'base64url'));
  } catch {
    return false;
  }
}

/** Code de vérification imprimé (12 caractères sans ambiguïté : ni 0/O, ni 1/I/L). */
const ALPHA = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export function newVerifCode(): string {
  let s = '';
  for (let i = 0; i < 12; i++) s += ALPHA[randomInt(ALPHA.length)];
  return s;
}
export const VERIF_CODE = /^[2-9A-HJKMNP-Z]{12}$/;
