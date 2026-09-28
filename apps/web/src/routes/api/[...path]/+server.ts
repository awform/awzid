/**
 * Relais de développement vers l'API Fastify (même origine : le cookie de session HttpOnly reste celui
 * de l'application). En production, Caddy route /api directement vers l'API ; ce relais ne sert plus.
 * Chemins /api/v1/* seulement ; corps JSON d'au plus 1 Mo ; en-têtes relayés : cookie, anti-CSRF,
 * cache (ETag) ; en retour : Set-Cookie, ETag, Content-Disposition.
 */
import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

const base = () => env.API_URL ?? 'http://127.0.0.1:3000';
const FORWARD = [
  'cookie',
  'x-awform',
  'content-type',
  'accept',
  'if-none-match',
  'x-forwarded-for',
];
const BACK = ['content-type', 'set-cookie', 'etag', 'content-disposition', 'cache-control'];

const handler: RequestHandler = async ({ params, url, request, fetch, getClientAddress }) => {
  if (!/^v1\/[A-Za-z0-9._/-]+$/.test(params.path) || params.path.includes('..'))
    error(404, 'introuvable');
  const headers = new Headers();
  for (const h of FORWARD) {
    const v = request.headers.get(h);
    if (v) headers.set(h, v);
  }
  headers.set('x-forwarded-for', getClientAddress());
  let body: string | undefined;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    body = await request.text();
    if (body.length > 1_048_576) error(413, 'trop volumineux');
  }
  const r = await fetch(`${base()}/api/${params.path}${url.search}`, {
    method: request.method,
    headers,
    body,
    redirect: 'manual',
  });
  const out = new Headers();
  for (const h of BACK) {
    if (h === 'set-cookie') for (const c of r.headers.getSetCookie()) out.append('set-cookie', c);
    else {
      const v = r.headers.get(h);
      if (v) out.set(h, v);
    }
  }
  if (!out.has('cache-control')) out.set('cache-control', 'no-store');
  return new Response(r.status === 304 ? null : r.body, { status: r.status, headers: out });
};

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const DELETE = handler;
