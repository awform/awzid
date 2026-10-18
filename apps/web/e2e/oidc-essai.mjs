// FAUX fournisseur OpenID Connect pour les e2e (18/10/2026) : remplace accounts.google.com SEULEMENT dans les essais
// (AWFORM_GOOGLE_ESSAI_URL, refusée par l'API en production). Aucune donnée réelle : identités inventées (.test).
//  - GET  /auth   : « connexion » immédiate de l'identité préparée (POST /essai/identite) ou d'une identité neuve,
//                   retour vers redirect_uri avec un code à usage unique (state renvoyé tel quel) ;
//  - POST /token  : échange du code (secret client et vérificateur PKCE contrôlés) contre un jeton d'identité RS256 ;
//  - GET  /certs  : clés publiques (JWKS) ; GET /sante : vivant.
// Usage : node e2e/oidc-essai.mjs <port>
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { createServer } from 'node:http';

const port = Number(process.argv[2] ?? 3112);
const ISS = `http://127.0.0.1:${port}`;
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'e2e', alg: 'RS256', use: 'sig' };
const codes = new Map();
let prochaine = null;
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (claims) => {
  const data = `${b64({ alg: 'RS256', kid: 'e2e', typ: 'JWT' })}.${b64(claims)}`;
  return `${data}.${sign('RSA-SHA256', Buffer.from(data), privateKey).toString('base64url')}`;
};
const lire = (req) =>
  new Promise((ok) => {
    let s = '';
    req.on('data', (c) => (s += c));
    req.on('end', () => ok(s));
  });
const json = (res, status, o) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(o));
};

createServer(async (req, res) => {
  const u = new URL(req.url ?? '/', ISS);
  if (u.pathname === '/sante') return json(res, 200, { ok: true });
  if (u.pathname === '/certs') return json(res, 200, { keys: [jwk] });
  if (u.pathname === '/essai/identite' && req.method === 'POST') {
    prochaine = JSON.parse(await lire(req));
    return json(res, 200, { ok: true });
  }
  if (u.pathname === '/auth') {
    const q = u.searchParams;
    const id = prochaine ?? {
      sub: `e2e-${randomBytes(6).toString('hex')}`,
      email: `google.${randomBytes(4).toString('hex')}@e2e.test`,
      name: 'Famille Google',
    };
    prochaine = null;
    const code = randomBytes(16).toString('hex');
    codes.set(code, {
      nonce: q.get('nonce'),
      challenge: q.get('code_challenge'),
      client: q.get('client_id'),
      redirect: q.get('redirect_uri'),
      id,
    });
    const back = new URL(q.get('redirect_uri') ?? '');
    back.searchParams.set('code', code);
    back.searchParams.set('state', q.get('state') ?? '');
    res.writeHead(302, { location: back.toString() });
    return res.end();
  }
  if (u.pathname === '/token' && req.method === 'POST') {
    const p = new URLSearchParams(await lire(req));
    const e = codes.get(p.get('code') ?? '');
    codes.delete(p.get('code') ?? '');
    const pkce = createHash('sha256')
      .update(p.get('code_verifier') ?? '')
      .digest('base64url');
    if (
      !e ||
      p.get('client_secret') !== 'e2e-secret' ||
      p.get('client_id') !== e.client ||
      p.get('redirect_uri') !== e.redirect ||
      pkce !== e.challenge
    )
      return json(res, 400, { error: 'invalid_grant' });
    const now = Math.floor(Date.now() / 1000);
    return json(res, 200, {
      id_token: jwt({
        iss: ISS,
        aud: e.client,
        sub: e.id.sub,
        email: e.id.email,
        email_verified: true,
        name: e.id.name,
        nonce: e.nonce,
        iat: now,
        exp: now + 600,
      }),
    });
  }
  json(res, 404, { error: 'introuvable' });
}).listen(port, '127.0.0.1');
