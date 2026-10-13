#!/usr/bin/env node
/**
 * Alerte par e-mail (supervision) — envoie UN message à l'adresse du responsable, avec le service d'e-mail de
 * l'API (mêmes réglages SMTP, même périmètre de secrets : api.env) :
 *   <état du service> | node dist/cli/alerte.js "Objet de l'alerte"
 * L'adresse du destinataire est AWFORM_ALERTE_A (aucun secret). Le corps vient de l'entrée standard (au plus 8 Ko) :
 * états des services, âge de la dernière sauvegarde, disque… jamais de donnée personnelle (adresses, identifiants et
 * jetons éventuels sont masqués avant l'envoi). Code de sortie 0 si le message est parti (ou écrit dans la boîte
 * de démonstration), 2 si aucun destinataire ou aucun service d'e-mail n'est réglé, 1 en cas d'échec d'envoi.
 */
import { scrub } from '../scrub.js';
import { mailerFromEnv } from '../mail/envoi.js';

const to = (process.env.AWFORM_ALERTE_A ?? '').trim();
const subject = (process.argv[2] ?? 'alerte').slice(0, 120);
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
  console.error('AWFORM_ALERTE_A absent ou invalide : aucune alerte envoyée');
  process.exit(2);
}
const mailer = mailerFromEnv(process.env, (m) => console.error(m));
if (mailer.mode === 'inactif') {
  console.error("service d'e-mail non réglé (AWFORM_MAIL) : aucune alerte envoyée");
  process.exit(2);
}
const chunks: Buffer[] = [];
let size = 0;
for await (const c of process.stdin) {
  const b = c as Buffer;
  if (size < 8192) chunks.push(b.subarray(0, 8192 - size));
  size += b.length;
}
const corps = scrub(Buffer.concat(chunks).toString('utf8'));
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
try {
  await mailer.send({
    to,
    kind: 'alerte',
    subject: `[Awzid] ${scrub(subject)}`,
    text: `${corps}\n\n—\nAlerte automatique de la supervision d'Awzid.\n`,
    html: `<pre style="font:14px/1.4 monospace;white-space:pre-wrap">${esc(corps)}</pre>`,
  });
  console.log('alerte envoyée');
} catch (e) {
  console.error(`envoi impossible : ${scrub(String((e as Error).message))}`);
  process.exit(1);
}
