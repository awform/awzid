#!/usr/bin/env node
/**
 * Alerte par e-mail (supervision) — envoie le message à CHAQUE destinataire, avec le service d'e-mail de l'API (mêmes
 * réglages SMTP, même périmètre de secrets : api.env) :
 *   <état du service> | node dist/cli/alerte.js "Objet de l'alerte"
 * Destinataires : AWFORM_ALERTE_A (aucun secret), une adresse ou PLUSIEURS séparées par des virgules
 * (ex. `contact@awzid.com,awzid21@gmail.com`, lot 11). Chaque adresse est validée : une seule invalide, rien ne part
 * (message clair). Un envoi par adresse ; un échec sur une adresse n'empêche pas les autres. Le corps vient de l'entrée
 * standard (au plus 8 Ko) : états des services, âge de la dernière sauvegarde, disque… jamais de donnée personnelle
 * (adresses, identifiants et jetons éventuels sont masqués avant l'envoi). Code de sortie 0 si le message est parti
 * vers TOUS les destinataires (ou écrit dans la boîte de démonstration), 2 si aucun destinataire, une adresse invalide
 * ou aucun service d'e-mail réglé, 1 si au moins un envoi a échoué.
 */
import { scrub } from '../scrub.js';
import { mailerFromEnv } from '../mail/envoi.js';
import { envoyerAChacun, lireDestinataires } from '../mail/alerte-destinataires.js';

const dest = lireDestinataires(process.env.AWFORM_ALERTE_A);
const subject = (process.argv[2] ?? 'alerte').slice(0, 120);
if (!dest.ok) {
  console.error(
    dest.raison === 'absent'
      ? 'AWFORM_ALERTE_A absent : aucune alerte envoyée'
      : `AWFORM_ALERTE_A : adresse(s) invalide(s) : ${dest.invalides.join(', ')} — aucune alerte envoyée ` +
          '(séparer les adresses par des virgules, ex. contact@awzid.com,awzid21@gmail.com)',
  );
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
const r = await envoyerAChacun(mailer, dest.adresses, {
  kind: 'alerte',
  subject: `[Awzid] ${scrub(subject)}`,
  text: `${corps}\n\n—\nAlerte automatique de la supervision d'Awzid.\n`,
  html: `<pre style="font:14px/1.4 monospace;white-space:pre-wrap">${esc(corps)}</pre>`,
});
for (const e of r.echecs) console.error(`envoi impossible vers ${e.adresse} : ${scrub(e.erreur)}`);
console.log(`alerte envoyée à ${r.parties.length} destinataire(s) sur ${dest.adresses.length}`);
if (r.echecs.length) process.exit(1);
