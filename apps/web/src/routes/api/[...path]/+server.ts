/**
 * Relais de développement vers l'API Fastify (même origine pour le navigateur et pour le rendu serveur).
 * En production, Caddy route /api directement vers l'API ; ce relais ne sert alors plus.
 * GET sur /api/v1/* ; POST uniquement sur /api/v1/attempts (JSON, 1 Mo au plus).
 */
import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

const base = () => env.API_URL ?? 'http://127.0.0.1:3000';

function relay(r: Response): Response {
  return new Response(r.body, {
    status: r.status,
    headers: {
      'content-type': r.headers.get('content-type') ?? 'application/json',
      'cache-control': 'no-store',
    },
  });
}

export const GET: RequestHandler = async ({ params, url, fetch }) => {
  if (!/^v1\/[A-Za-z0-9._/-]+$/.test(params.path) || params.path.includes('..'))
    error(404, 'introuvable');
  const r = await fetch(`${base()}/api/${params.path}${url.search}`, {
    headers: { accept: 'application/json' },
  });
  return relay(r);
};

export const POST: RequestHandler = async ({ params, request, fetch }) => {
  if (params.path !== 'v1/attempts') error(404, 'introuvable');
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    error(415, 'JSON attendu');
  const body = await request.text();
  if (body.length > 1_048_576) error(413, 'trop volumineux');
  const r = await fetch(`${base()}/api/v1/attempts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body,
  });
  return relay(r);
};
