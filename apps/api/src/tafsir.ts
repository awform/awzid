/**
 * Tafsīr abrégé et mot à mot (2/11/2026, interrupteur `tafsir_sens`, coupé par défaut) — « Sens et explication » d'un verset dans
 * le lecteur du Coran. Les 114 fichiers (`packages/content/tafsir/NNN.json`, générés depuis les fichiers du référent, versionnés,
 * livrés avec le paquet `@awform/content`) ne sont JAMAIS publics (ni dans `apps/web/static`, ni dans le code du client) :
 *  - `GET /api/v1/tafsir/sourates/:n` : UNE sourate à la fois, après FILTRAGE PAR PUBLIC fait ici, côté serveur (D-TF-445, D-TF-498) :
 *      · compte « tout voir » du client (critère unique de `@awform/school/tout-voir`, revérifié ici) : tout, dont les segments
 *        « mention publique INTERDITE avant relecture » ;
 *      · profil de type adulte : les segments « niveau adulte », toujours avec leur note de contexte ;
 *      · tout autre (enfant, ado, sans profil adulte) : ni l'un ni l'autre, sans la moindre trace dans la réponse.
 *  - personne connectée (401) ; fonction ouverte pour elle (403 « fonction_coupee ») ; profil proposé par l'en-tête `x-profil`,
 *    retenu seulement s'il appartient à la personne (sinon ignoré : le public est alors celui du compte).
 * L'application garde sur l'appareil les sourates reçues, PAR PROFIL (hors ligne ensuite). Le contenu est en français.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { filtrerSourate, publicDe, type SourateTafsir } from '@awform/content/tafsir';
import { schema as t, type Db } from '@awform/db';
import { COMPTE_TOUT_VOIR, voitTout } from './auth/tout-voir.js';
import { contexteDe, exigeFonction, profilDe } from './f5.js';
import { err } from './guards.js';

/** Dossier des fichiers : livré avec le paquet `@awform/content` (champ `files`) ; `AWFORM_TAFSIR_DIR` pour les essais. */
export function tafsirDir(): string {
  if (process.env.AWFORM_TAFSIR_DIR) return process.env.AWFORM_TAFSIR_DIR;
  const main = fileURLToPath(import.meta.resolve('@awform/content'));
  return join(dirname(main), '..', 'tafsir');
}

export function registerTafsir(app: FastifyInstance, db: Db, dossier: string = tafsirDir()): void {
  /** sourates lues une fois (corps brut et objet) */
  const lues = new Map<number, { corps: string; sourate: SourateTafsir }>();
  const lire = async (n: number) => {
    let x = lues.get(n);
    if (!x) {
      const corps = await readFile(join(dossier, `${String(n).padStart(3, '0')}.json`), 'utf8');
      x = { corps, sourate: JSON.parse(corps) as SourateTafsir };
      lues.set(n, x);
    }
    return x;
  };

  app.get<{ Params: { n: number } }>(
    '/api/v1/tafsir/sourates/:n',
    {
      schema: {
        params: {
          type: 'object',
          properties: { n: { type: 'integer', minimum: 1, maximum: 114 } },
          required: ['n'],
        },
      },
    },
    async (req, reply) => {
      if (!req.auth) return err(reply, 401, 'non_connecte');
      const pid = await profilDe(db, req, req.headers['x-profil']);
      if (!(await exigeFonction(db, req, reply, 'tafsir_sens', pid))) return reply;
      const ctx = await contexteDe(db, req, pid);
      // « tout voir » : le critère est revérifié ICI à partir de la session (jamais d'un drapeau envoyé par le navigateur)
      let toutVoir = false;
      if (req.auth.accountId === COMPTE_TOUT_VOIR) {
        const [a] = await db
          .select({ email: t.account.email })
          .from(t.account)
          .where(eq(t.account.id, req.auth.accountId));
        toutVoir = voitTout({
          id: req.auth.accountId,
          kind: req.auth.kind,
          email: a?.email,
          mfaVerified: req.auth.mfaVerified,
          totpEnabled: req.auth.totpEnabled,
          limitee: !!req.auth.tablet || !!req.auth.profileId,
        });
      }
      const pub = publicDe({ toutVoir, age: ctx.age });
      let x;
      try {
        x = await lire(req.params.n);
      } catch {
        return err(reply, 404, 'introuvable');
      }
      const filtree = filtrerSourate(x.sourate, pub);
      // rien de retiré : les octets du fichier tels quels
      const corps = filtree === x.sourate ? x.corps : JSON.stringify(filtree);
      return reply
        .header('Cache-Control', 'private, no-store')
        .header('Vary', 'Cookie, X-Profil')
        .type('application/json; charset=utf-8')
        .send(corps);
    },
  );
}
