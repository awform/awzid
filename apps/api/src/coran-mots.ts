/**
 * « Mots du Coran » (interrupteur `coran_mots`, coupé par défaut) : la fonction signature « Je reconnais X % des mots »
 * du lecteur, la recherche par mot arabe et par racine, la fiche racine.
 *
 * Les DONNÉES sont celles du paquet `@awform/coran-mots-data` (dérivées du Quranic Arabic Corpus, GNU GPL v3), lues à
 * l'exécution et servies À LA DEMANDE (une sourate à la fois) : aucune n'est recopiée dans le code. Le calcul du
 * pourcentage se fait SUR L'APPAREIL, à partir de ces données et de ce que l'élève a réellement appris :
 *  - `GET /api/v1/coran-mots/sourates/:n` : les mots d'une sourate (rang de leur lemme dans la liste des 1 000) ;
 *  - `GET /api/v1/coran-mots/rangs` : pour chaque rang, le lemme et la leçon qui l'enseigne ;
 *  - `GET /api/v1/profiles/:id/coran-mots/connus` : leçons faites et niveau de l'élève (sa progression dans les livres) ;
 *  - `GET /api/v1/coran-mots/recherche` : recherche d'un mot ou d'une racine, versets TELS QUE DANS TANZIL ;
 *  - `GET /api/v1/coran-mots/racine?r=` : la fiche d'une racine (le sens seulement s'il est VALIDÉ).
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { eq } from 'drizzle-orm';
import { DONNEES } from '@awform/coran-mots-data';
import { levelParts } from '@awform/content';
import { levelSpace, schema as t, versesOf, type Db } from '@awform/db';
import { splitBasmala } from '@awform/hifz';
import { exigeFonction } from './f5.js';
import { err, familyProfile, UUID } from './guards.js';
import {
  chargerIndex,
  indiceDuJeton,
  type IndexMots,
  type Lemme,
  type Mot,
} from './coran-mots-recherche.js';
import type { Edition } from './school-common.js';

/** résultats par page de recherche */
export const PAR_PAGE = 20;
/** statuts d'une leçon FAITE (comme `DONE` de `packages/db/src/parcours.ts`) */
const FAITE = new Set(['terminee', 'maitrisee']);

/** pour chaque rang de la liste des 1 000 : [lemme en arabe, leçon qui l'enseigne en premier] */
type Rangs = Array<[string, string | null] | null>;

interface SensRacine {
  sens: string;
  sources: string[];
  statut: string;
  a_verifier: boolean;
  note?: string;
}

export function registerCoranMots(
  app: FastifyInstance,
  db: Db,
  edition: Edition,
  dossier: string = DONNEES,
): void {
  const fichiers = new Map<string, { corps: string; etag: string }>();
  let index: IndexMots | null = null;
  let sens: Record<string, SensRacine> | null = null;
  let rangs: Rangs | null = null;
  let meta: { empreintes: Record<string, string>; attribution: string } | null = null;

  const presentes = () => existsSync(join(dossier, 'meta.json'));
  const lireMeta = () => (meta ??= JSON.parse(readFileSync(join(dossier, 'meta.json'), 'utf8')));
  const lireIndex = () => (index ??= chargerIndex(dossier));
  const lireSens = () =>
    (sens ??= JSON.parse(readFileSync(join(dossier, 'racines-sens.json'), 'utf8')) as Record<
      string,
      SensRacine
    >);
  const lireRangs = () =>
    (rangs ??= JSON.parse(readFileSync(join(dossier, 'rangs.json'), 'utf8')) as Rangs);

  /** Connecté, fonction ouverte et données présentes ; sinon le refus est envoyé et la fonction renvoie false. */
  const acces = async (req: FastifyRequest, reply: FastifyReply, profileId?: string) => {
    if (!req.auth) {
      void err(reply, 401, 'non_connecte');
      return false;
    }
    if (!(await exigeFonction(db, req, reply, 'coran_mots', profileId))) return false;
    if (!presentes()) {
      void err(reply, 503, 'donnees_absentes');
      return false;
    }
    return true;
  };

  /** Fichier de données servi tel quel, avec une empreinte (ETag) : l'appareil ne le retélécharge pas s'il n'a pas changé. */
  const servir = (req: FastifyRequest, reply: FastifyReply, nom: string) => {
    let f = fichiers.get(nom);
    if (!f) {
      const corps = readFileSync(join(dossier, nom), 'utf8');
      f = {
        corps,
        etag: `"${(lireMeta().empreintes[nom] ?? createHash('sha256').update(corps).digest('hex')).slice(0, 32)}"`,
      };
      fichiers.set(nom, f);
    }
    reply.header('ETag', f.etag).header('Cache-Control', 'private, max-age=86400');
    if (req.headers['if-none-match'] === f.etag) return reply.code(304).send();
    return reply.type('application/json; charset=utf-8').send(f.corps);
  };

  app.get<{ Params: { n: number } }>(
    '/api/v1/coran-mots/sourates/:n',
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
      if (!(await acces(req, reply))) return reply;
      return servir(req, reply, `sourates/${String(req.params.n).padStart(3, '0')}.json`);
    },
  );

  app.get('/api/v1/coran-mots/rangs', async (req, reply) => {
    if (!(await acces(req, reply))) return reply;
    return servir(req, reply, 'rangs.json');
  });

  /**
   * Ce que l'élève sait, d'après SA progression dans les livres : le niveau de sa filière et les leçons faites de ce
   * niveau (les niveaux précédents sont acquis), plus les mots validés par le petit jeu du niveau. Le pourcentage est
   * calculé sur l'appareil avec ces seules informations. Les livres ne sont reliés au Coran que pour la filière Adultes
   * (`ad`) : pour les autres, `disponible: false`, jamais un chiffre inventé.
   */
  app.get<{ Params: { id: string } }>(
    '/api/v1/profiles/:id/coran-mots/connus',
    { schema: { params: { type: 'object', properties: { id: UUID }, required: ['id'] } } },
    async (req, reply) => {
      const p = await familyProfile(db, req, reply, req.params.id);
      if (!p) return reply;
      if (!(await acces(req, reply, p.id))) return reply;
      const ed = await edition();
      if (!ed) return err(reply, 503, 'aucune_edition');
      const space = await levelSpace(db, ed.id, p.id, 'arabe');
      const niveau = space?.courant ? levelParts(space.courant.code) : null;
      reply.header('Cache-Control', 'private, no-store');
      if (!space || !niveau) return { disponible: false, raison: 'aucun_niveau' };
      if (space.piste !== 'ad') return { disponible: false, raison: 'filiere', piste: space.piste };
      const valides = await db
        .select({ rank: t.profileLemma.rank })
        .from(t.profileLemma)
        .where(eq(t.profileLemma.profileId, p.id));
      return {
        disponible: true,
        piste: space.piste,
        niveau: niveau.n,
        unites: space.unites.filter((u) => u.statut && FAITE.has(u.statut)).map((u) => u.id),
        valides: valides.map((v) => v.rank).sort((a, b) => a - b),
      };
    },
  );

  // ---------------------------------------------------------------- recherche

  const resume = (l: Lemme, n?: number) => ({
    bw: l.bw,
    ar: l.ar,
    nature: l.nature,
    racine: l.racine,
    n: n ?? l.n,
  });

  /** Page de résultats : versets lus dans Tanzil (base), basmala d'en-tête séparée comme dans le lecteur. */
  async function page(mots: Mot[], numero: number) {
    const tranche = mots.slice((numero - 1) * PAR_PAGE, numero * PAR_PAGE);
    const basmala = (await versesOf(db, 1, 1, 1))[0]?.text ?? '';
    const parSourate = new Map<number, Map<number, string>>();
    for (const s of new Set(tranche.map((m) => m.s))) {
      const lo = Math.min(...tranche.filter((m) => m.s === s).map((m) => m.a));
      const hi = Math.max(...tranche.filter((m) => m.s === s).map((m) => m.a));
      parSourate.set(s, new Map((await versesOf(db, s, lo, hi)).map((v) => [v.a, v.text])));
    }
    return tranche.map((m) => {
      const brut = parSourate.get(m.s)?.get(m.a) ?? '';
      const { rest } = splitBasmala(m.s, m.a, brut, basmala);
      return {
        ref: `${m.s}:${m.a}`,
        s: m.s,
        a: m.a,
        texte: rest,
        // la basmala d'en-tête occupe les 4 premiers jetons de Tanzil : elle n'est pas comptée dans `ordre`
        i: indiceDuJeton(rest, m.ordre),
        forme: m.forme,
        lemme: m.lemme,
      };
    });
  }

  app.get<{
    Querystring: { q: string; mode?: 'mot' | 'racine'; lemme?: string; page?: number };
  }>(
    '/api/v1/coran-mots/recherche',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['q'],
          additionalProperties: false,
          properties: {
            q: { type: 'string', minLength: 1, maxLength: 60 },
            mode: { enum: ['mot', 'racine'] },
            lemme: { type: 'string', maxLength: 40 },
            page: { type: 'integer', minimum: 1, maximum: 500 },
          },
        },
      },
    },
    async (req, reply) => {
      if (!(await acces(req, reply))) return reply;
      const idx = lireIndex();
      const mode = req.query.mode ?? 'mot';
      const numero = req.query.page ?? 1;
      reply.header('Cache-Control', 'private, no-store');
      let mots: Mot[];
      let approx = false;
      let racine: string | null = null;
      if (mode === 'racine') {
        racine = idx.racineDe(req.query.q);
        mots = racine ? idx.motsDeRacine(racine, req.query.lemme) : [];
      } else {
        const r = idx.chercherMot(req.query.q, req.query.lemme);
        mots = r.mots;
        approx = r.approx;
      }
      // familles de lemmes trouvés (filtre) et racines à proposer
      const nb = new Map<string, number>();
      if (req.query.lemme) {
        // filtre actif : on garde la liste complète pour pouvoir en sortir
        const base =
          mode === 'racine'
            ? racine
              ? idx.motsDeRacine(racine)
              : []
            : idx.chercherMot(req.query.q).mots;
        for (const m of base) nb.set(m.lemme, (nb.get(m.lemme) ?? 0) + 1);
      } else for (const m of mots) nb.set(m.lemme, (nb.get(m.lemme) ?? 0) + 1);
      const lemmes = [...nb.entries()]
        .map(([bw, n]) => ({ l: idx.lemmes.get(bw), n }))
        .filter((x): x is { l: Lemme; n: number } => !!x.l)
        .sort((a, b) => b.n - a.n || (a.l.bw < b.l.bw ? -1 : 1))
        .slice(0, 12)
        .map((x) => resume(x.l, x.n));
      const racines = [...new Set(lemmes.map((l) => l.racine).filter(Boolean))].slice(0, 3);
      return {
        q: req.query.q,
        mode,
        approx,
        racine,
        total: mots.length,
        page: numero,
        parPage: PAR_PAGE,
        lemmes,
        racines,
        items: await page(mots, numero),
      };
    },
  );

  // ---------------------------------------------------------------- fiche racine

  // la racine est dans la requête (`?r=كتب`) et non dans le chemin : le relais de développement n'accepte que des chemins ASCII
  app.get<{ Querystring: { r: string } }>(
    '/api/v1/coran-mots/racine',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['r'],
          additionalProperties: false,
          properties: { r: { type: 'string', minLength: 1, maxLength: 24 } },
        },
      },
    },
    async (req, reply) => {
      if (!(await acces(req, reply))) return reply;
      const idx = lireIndex();
      const racine = idx.racineDe(req.query.r);
      const fam = racine ? idx.famille(racine) : null;
      if (!racine || !fam) return err(reply, 404, 'racine_inconnue');
      const r = lireRangs();
      // LE SENS N'EST ENVOYÉ QUE S'IL EST VALIDÉ (`a_verifier` faux) : sinon l'élève ne reçoit que la famille de mots
      const s = lireSens()[racine];
      const valide = s && s.a_verifier === false && s.sens ? s : null;
      return {
        racine,
        frequence: fam.frequence,
        famille: fam.lemmes.map((l) => ({
          ...resume(l),
          rang: l.rang || null,
          unite: (l.rang && r?.[l.rang]?.[1]) || null,
        })),
        ...(valide ? { sens: valide.sens, sources: valide.sources } : {}),
        attribution: lireMeta().attribution,
      };
    },
  );
}
