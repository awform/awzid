/**
 * Page PUBLIQUE du QR code d'une leçon (cahier § 2.14) : `/l/en1-05`, adresse stable pour toujours.
 * Rendue sur le serveur, sans JavaScript, légère (< 100 Ko) : titre, objectifs, lettres, mots avec images,
 * bouton « continuer dans l'application ». JAMAIS d'exercice ni de corrigé. Si l'application est installée
 * et la leçon téléchargée, le service worker ouvre directement la leçon.
 */
import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { t } from '$lib/i18n';
import { renderPublic, type PublicUnit } from '$lib/qr';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, fetch }) => {
  if (!/^[a-z]{2,3}\d{1,2}-\d{2}$/.test(params.slug)) error(404, 'introuvable');
  const base = env.API_URL ?? 'http://127.0.0.1:3000';
  const r = await fetch(`${base}/api/v1/public/l/${params.slug}`);
  if (r.status === 404) error(404, t('qr.introuvable'));
  if (!r.ok) error(502, t('erreur.erreur_interne'));
  const u = (await r.json()) as PublicUnit;
  if (!u.lesson) error(404, t('qr.introuvable'));
  return new Response(renderPublic(u), {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=3600',
      'content-security-policy':
        "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
    },
  });
};
