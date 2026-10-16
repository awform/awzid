/**
 * Lot 11 (chantier D) — destinataires des alertes de supervision : AWFORM_ALERTE_A accepte PLUSIEURS adresses séparées
 * par des virgules (ex. `contact@awzid.com,awzid21@gmail.com`). Chaque adresse est validée (une seule invalide : rien
 * n'est envoyé, message clair) ; un envoi PAR adresse (aucune adresse n'est visible des autres destinataires) ; un
 * échec sur une adresse n'empêche pas les autres.
 */
import type { Mailer, MailMessage } from './envoi.js';

const EMAIL_RE = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/;

export type Destinataires =
  | { ok: true; adresses: string[] }
  | { ok: false; raison: 'absent' }
  | { ok: false; raison: 'invalide'; invalides: string[] };

/** Lit AWFORM_ALERTE_A : adresses séparées par des virgules (espaces tolérés, doublons retirés). */
export function lireDestinataires(brut: string | undefined): Destinataires {
  const morceaux = (brut ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!morceaux.length) return { ok: false, raison: 'absent' };
  const invalides = morceaux.filter((a) => !EMAIL_RE.test(a));
  if (invalides.length) return { ok: false, raison: 'invalide', invalides };
  return { ok: true, adresses: [...new Set(morceaux.map((a) => a.toLowerCase()))] };
}

/** Un envoi par adresse ; renvoie les adresses parties et celles en échec (avec le message d'erreur). */
export async function envoyerAChacun(
  mailer: Mailer,
  adresses: string[],
  message: Omit<MailMessage, 'to'>,
): Promise<{ parties: string[]; echecs: Array<{ adresse: string; erreur: string }> }> {
  const parties: string[] = [];
  const echecs: Array<{ adresse: string; erreur: string }> = [];
  for (const adresse of adresses) {
    try {
      await mailer.send({ ...message, to: adresse } as MailMessage);
      parties.push(adresse);
    } catch (e) {
      echecs.push({ adresse, erreur: String((e as Error).message) });
    }
  }
  return { parties, echecs };
}
