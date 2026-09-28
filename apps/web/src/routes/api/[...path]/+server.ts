/**
 * Relais de développement vers l'API Fastify (même origine pour le navigateur et pour le rendu serveur).
 * En production, Caddy route /api directement vers l'API ; ce relais ne sert alors plus.
 * Lecture seule (GET), chemins /api/v1/* uniquement.
 */
import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url, fetch }) => {
  if (!/^v1\/[A-Za-z0-9._/-]+$/.test(params.path) || params.path.includes('..'))
    error(404, 'introuvable');
  const base = env.API_URL ?? 'http://127.0.0.1:3000';
  const r = await fetch(`${base}/api/${params.path}${url.search}`, {
    headers: { accept: 'application/json' },
  });
  return new Response(r.body, {
    status: r.status,
    headers: {
      'content-type': r.headers.get('content-type') ?? 'application/json',
      'cache-control': 'no-store',
    },
  });
};
