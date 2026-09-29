/**
 * Vérification publique d'un certificat (lot 20) : `/verifier/AWF-EN1-2026-0001?c=<code du QR>`.
 * Rendue sur le serveur, sans JavaScript, jamais mise en cache (l'état peut changer : annulation).
 */
import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { t } from '$lib/i18n';
import { renderVerification, type Verification } from '$lib/verification';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url, fetch, getClientAddress }) => {
  if (!/^AWF-[A-Z0-9]{2,4}-\d{4}-\d{4,6}$/.test(params.numero))
    error(404, t('verif.introuvable', { numero: '' }));
  const base = env.API_URL ?? 'http://127.0.0.1:3000';
  const code = (url.searchParams.get('c') ?? '').slice(0, 20);
  const r = await fetch(
    `${base}/api/v1/public/certificats/${encodeURIComponent(params.numero)}?c=${encodeURIComponent(code)}`,
    // l'adresse du visiteur, pour la limite d'essais de l'API (derrière le mandataire de confiance)
    { headers: { 'x-forwarded-for': getClientAddress() } },
  );
  if (r.status === 429) error(429, t('erreur.trop_de_demandes'));
  if (!r.ok && r.status !== 404) error(502, t('erreur.erreur_interne'));
  const v = r.ok ? ((await r.json()) as Verification) : null;
  return new Response(renderVerification(v, params.numero), {
    status: v ? 200 : 404,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'content-security-policy':
        "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
    },
  });
};
