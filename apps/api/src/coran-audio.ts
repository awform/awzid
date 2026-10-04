/**
 * Audio du Coran (lot 27) — récitations du Complexe du Roi Fahd hébergées chez nous.
 *  - récitateurs ACTIFS avec riwāya, étiquettes, crédit et licence ; pistes d'une sourate ;
 *  - fichiers servis par l'API (lecture partielle « Range », ETag = empreinte SHA-256, cache public d'un
 *    jour : un retrait se propage au plus tard en 24 h dans les caches, immédiatement ici) ;
 *  - paquets hors ligne PAR SOURATE : manifeste (fichiers, tailles, empreintes) pour le téléchargement
 *    « Wi-Fi seulement » et le quota décidés sur l'appareil ;
 *  - profil : liste autorisée (parent : code parent ; enseignant : par classe ; intersection des deux),
 *    préférence, conseil débutant (Muḥammad Ayyūb) ;
 *  - riwāya : en mode « mémoriser » (carnets de hifẓ, texte Tanzil de Ḥafṣ) seuls les récitateurs Ḥafṣ
 *    sont proposés ; les pistes d'une autre riwāya sont marquées « sans_surlignage » (numérotation
 *    différente : pas de surlignage verset par verset sur le texte de Ḥafṣ) ;
 *  - retrait immédiat (administrateur, second facteur) : disparaît des réponses, paquets et fichiers ;
 *  - relais d'école : liste des fichiers des récitateurs choisis pour l'école (préchargement).
 */
import { createReadStream, existsSync } from 'node:fs';
import { join, normalize } from 'node:path';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  BEGINNER_RECITER,
  RIWAYA_FR,
  relayByToken,
  retireReciter,
  schema as t,
  type Db,
} from '@awform/db';
import { err, familyProfile, needTeacher, parentGate } from './guards.js';

/** riwāya des carnets de hifẓ : texte Tanzil de Ḥafṣ ʿan ʿĀṣim */
export const CARNET_RIWAYA = 'hafs';
const RECITER_ID = { type: 'string', pattern: '^[a-z0-9]+(-[a-z0-9]+)*$', maxLength: 40 } as const;
const SURA = { type: 'integer', minimum: 1, maximum: 114 } as const;
const UUIDP = { type: 'string', format: 'uuid' } as const;
const MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  m4a: 'audio/mp4',
};
const FILE_CACHE = 'public, max-age=86400';
const LIST_CACHE = 'public, max-age=300';

type Reciter = typeof t.quranReciter.$inferSelect;

const fileUrl = (path: string) => `/api/v1/quran/audio/file/${path}`;
const highlight = (riwaya: string) => (riwaya === CARNET_RIWAYA ? 'verset' : 'sans_surlignage');

function publicReciter(r: Reciter, verses: number) {
  return {
    id: r.id,
    nameAr: r.nameAr,
    nameFr: r.nameFr,
    riwaya: r.riwaya,
    riwayaFr: RIWAYA_FR[r.riwaya] ?? r.riwaya,
    speed: r.speed,
    style: r.style,
    credit: r.credit,
    license: {
      source: r.licenseSource,
      url: r.licenseUrl,
      archivedOn: r.licenseArchivedOn,
      text: r.licenseText,
    },
    verses,
    surlignage: highlight(r.riwaya),
    conseilDebutant: r.id === BEGINNER_RECITER,
  };
}

async function activeReciters(db: Db, ids?: string[]) {
  const rows = await db
    .select({
      r: t.quranReciter,
      n: sql<number>`(select count(*)::int from quran_track q where q.reciter_id = ${t.quranReciter.id} and q.aya > 0)`,
    })
    .from(t.quranReciter)
    .where(
      and(
        eq(t.quranReciter.status, 'actif'),
        ids ? inArray(t.quranReciter.id, ids.length ? ids : ['']) : undefined,
      ),
    )
    .orderBy(asc(t.quranReciter.id));
  // conseil débutant en tête, puis ordre alphabétique
  return rows
    .sort((a, b) => Number(b.r.id === BEGINNER_RECITER) - Number(a.r.id === BEGINNER_RECITER))
    .map((x) => publicReciter(x.r, x.n));
}

async function activeReciter(db: Db, id: string): Promise<Reciter | null> {
  const [r] = await db
    .select()
    .from(t.quranReciter)
    .where(and(eq(t.quranReciter.id, id), eq(t.quranReciter.status, 'actif')));
  return r ?? null;
}

async function suraTracks(db: Db, reciterId: string, sura: number) {
  return db
    .select({
      aya: t.quranTrack.aya,
      path: t.quranTrack.path,
      durationMs: t.quranTrack.durationMs,
      bytes: t.quranTrack.bytes,
      sha256: t.quranTrack.sha256,
      format: t.quranTrack.format,
    })
    .from(t.quranTrack)
    .where(and(eq(t.quranTrack.reciterId, reciterId), eq(t.quranTrack.sura, sura)))
    .orderBy(asc(t.quranTrack.aya));
}

/** Empreinte d'un paquet de sourate : celle de la suite de ses fichiers. */
async function suraManifest(db: Db, r: Reciter, sura: number) {
  const tracks = await suraTracks(db, r.id, sura);
  if (tracks.length === 0) return null;
  const { createHash } = await import('node:crypto');
  const hash = createHash('sha256')
    .update(tracks.map((x) => `${x.aya}:${x.sha256}`).join('\n'))
    .digest('hex');
  const surlignage = highlight(r.riwaya);
  return {
    format: 1 as const,
    reciter: r.id,
    riwaya: r.riwaya,
    credit: r.credit,
    sura,
    hash,
    surlignage,
    wifiSeulement: true,
    bytes: tracks.reduce((n, x) => n + x.bytes, 0),
    durationMs: tracks.reduce((n, x) => n + x.durationMs, 0),
    files: tracks.map((x) => ({
      aya: x.aya,
      url: fileUrl(x.path),
      bytes: x.bytes,
      sha256: x.sha256,
      durationMs: x.durationMs,
      format: x.format,
      surlignage,
    })),
  };
}

/**
 * Récitateurs autorisés pour un profil : intersection de la liste du parent (si elle existe) et des listes
 * des classes de l'élève (s'il y en a) ; null = aucune restriction.
 */
export async function allowedFor(db: Db, profileId: string): Promise<Set<string> | null> {
  const lists: string[][] = [];
  const [p] = await db
    .select({ a: t.profileReciterRule.allowed })
    .from(t.profileReciterRule)
    .where(eq(t.profileReciterRule.profileId, profileId));
  if (p) lists.push(p.a);
  const cls = await db.execute<{ allowed: string[] }>(sql`
    select r.allowed from class_reciter_rule r
    where r.class_id in (
      select class_id from class_member where profile_id = ${profileId}
      union select class_id from class_pupil where profile_id = ${profileId})`);
  for (const row of cls.rows) lists.push(row.allowed);
  if (lists.length === 0) return null;
  let out = new Set(lists[0]);
  for (const l of lists.slice(1)) out = new Set(l.filter((x) => out.has(x)));
  return out;
}

/** Récitateurs proposés à un profil, selon le mode (mémoriser : riwāya du carnet seulement). */
async function offeredFor(db: Db, profileId: string, mode: 'ecouter' | 'memoriser') {
  const allowed = await allowedFor(db, profileId);
  const all = await activeReciters(db);
  return {
    restreint: allowed !== null,
    reciters: all.filter(
      (r) => (!allowed || allowed.has(r.id)) && (mode === 'ecouter' || r.riwaya === CARNET_RIWAYA),
    ),
  };
}

async function knownReciters(db: Db, ids: string[]): Promise<boolean> {
  if (ids.length === 0) return true;
  const rows = await db
    .select({ id: t.quranReciter.id })
    .from(t.quranReciter)
    .where(inArray(t.quranReciter.id, ids));
  return rows.length === new Set(ids).size;
}

/** Envoi d'un fichier audio : lecture partielle (Range), ETag, 304, 416. */
export function sendAudioFile(
  req: FastifyRequest,
  reply: FastifyReply,
  file: string,
  o: { size: number; etag: string; type: string; cache: string },
) {
  const etag = `"${o.etag}"`;
  reply
    .header('Accept-Ranges', 'bytes')
    .header('ETag', etag)
    .header('Cache-Control', o.cache)
    .header('Content-Type', o.type)
    // fichiers publics (licence) : lisibles par le relais et le lecteur hors ligne
    .header('Cross-Origin-Resource-Policy', 'same-site');
  if (req.headers['if-none-match'] === etag) return reply.code(304).send();
  const range = req.headers.range;
  const ifRange = req.headers['if-range'];
  if (range && (!ifRange || ifRange === etag)) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    let start = -1;
    let end = o.size - 1;
    if (m && (m[1] || m[2])) {
      if (!m[1]) start = Math.max(0, o.size - Number(m[2]));
      else {
        start = Number(m[1]);
        if (m[2]) end = Math.min(Number(m[2]), o.size - 1);
      }
    }
    if (start < 0 || start > end || start >= o.size)
      return reply.code(416).header('Content-Range', `bytes */${o.size}`).send();
    reply
      .code(206)
      .header('Content-Range', `bytes ${start}-${end}/${o.size}`)
      .header('Content-Length', String(end - start + 1));
    return reply.send(req.method === 'HEAD' ? '' : createReadStream(file, { start, end }));
  }
  reply.header('Content-Length', String(o.size));
  return reply.send(req.method === 'HEAD' ? '' : createReadStream(file));
}

export function registerCoranAudio(app: FastifyInstance, db: Db, audioDir: string | null): void {
  const needAdmin = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.auth) return err(reply, 401, 'non_connecte');
    if (req.auth.kind !== 'admin') return err(reply, 403, 'reserve_admin');
    if (!req.auth.mfaVerified)
      return err(reply, 403, req.auth.totpEnabled ? 'totp_requis' : 'mfa_a_configurer');
  };

  // ---------------------------------------------------------------- public (contenus mis en copie)

  app.get('/api/v1/quran/audio/reciters', async (_req, reply) => {
    reply.header('Cache-Control', LIST_CACHE);
    return { reciters: await activeReciters(db), conseilDebutant: BEGINNER_RECITER };
  });

  app.get<{ Params: { id: string; sura: number } }>(
    '/api/v1/quran/audio/reciters/:id/suras/:sura',
    { schema: { params: { type: 'object', properties: { id: RECITER_ID, sura: SURA } } } },
    async (req, reply) => {
      const r = await activeReciter(db, req.params.id);
      if (!r) return err(reply, 404, 'recitateur_indisponible');
      const m = await suraManifest(db, r, req.params.sura);
      if (!m) return err(reply, 404, 'sourate_absente');
      reply.header('Cache-Control', LIST_CACHE);
      return m;
    },
  );

  /** Paquets hors ligne d'un récitateur : une entrée par sourate disponible (taille, durée, empreinte). */
  app.get<{ Params: { id: string } }>(
    '/api/v1/quran/audio/reciters/:id/packs',
    { schema: { params: { type: 'object', properties: { id: RECITER_ID } } } },
    async (req, reply) => {
      const r = await activeReciter(db, req.params.id);
      if (!r) return err(reply, 404, 'recitateur_indisponible');
      const rows = await db.execute<{
        sura: number;
        n: number;
        bytes: number;
        ms: number;
        h: string;
      }>(sql`
        select sura, count(*)::int as n, sum(bytes)::int as bytes, sum(duration_ms)::int as ms,
          encode(sha256(convert_to(string_agg(aya || ':' || sha256, E'\n' order by aya), 'UTF8')), 'hex') as h
        from quran_track where reciter_id = ${r.id} group by sura order by sura`);
      reply.header('Cache-Control', LIST_CACHE);
      const suras = rows.rows.map((x) => ({
        sura: Number(x.sura),
        files: x.n,
        bytes: Number(x.bytes),
        durationMs: Number(x.ms),
        hash: x.h,
        url: `/api/v1/quran/audio/reciters/${r.id}/packs/${x.sura}`,
      }));
      return {
        reciter: r.id,
        credit: r.credit,
        surlignage: highlight(r.riwaya),
        wifiSeulement: true,
        totalBytes: suras.reduce((n, x) => n + x.bytes, 0),
        suras,
      };
    },
  );

  app.get<{ Params: { id: string; sura: number } }>(
    '/api/v1/quran/audio/reciters/:id/packs/:sura',
    { schema: { params: { type: 'object', properties: { id: RECITER_ID, sura: SURA } } } },
    async (req, reply) => {
      const r = await activeReciter(db, req.params.id);
      if (!r) return err(reply, 404, 'recitateur_indisponible');
      const m = await suraManifest(db, r, req.params.sura);
      if (!m) return err(reply, 404, 'sourate_absente');
      reply.header('Cache-Control', LIST_CACHE);
      return m;
    },
  );

  app.get<{ Params: { id: string; file: string } }>(
    '/api/v1/quran/audio/file/:id/:file',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            id: RECITER_ID,
            file: { type: 'string', pattern: '^[0-9]{6}-[0-9a-f]{16}\\.(mp3|wav|ogg|opus|m4a)$' },
          },
        },
      },
    },
    async (req, reply) => {
      const path = `${req.params.id}/${req.params.file}`;
      const [tr] = await db
        .select({
          bytes: t.quranTrack.bytes,
          sha256: t.quranTrack.sha256,
          format: t.quranTrack.format,
          status: t.quranReciter.status,
        })
        .from(t.quranTrack)
        .innerJoin(t.quranReciter, eq(t.quranReciter.id, t.quranTrack.reciterId))
        .where(and(eq(t.quranTrack.reciterId, req.params.id), eq(t.quranTrack.path, path)));
      if (!tr) return err(reply, 404, 'introuvable');
      // coupure : plus aucun fichier servi (410 : les caches et le relais l'effacent)
      if (tr.status !== 'actif') return err(reply, 410, 'recitateur_retire');
      if (!audioDir) return err(reply, 503, 'audio_indisponible');
      const file = normalize(join(audioDir, path));
      if (!file.startsWith(normalize(audioDir)) || !existsSync(file))
        return err(reply, 404, 'fichier_absent');
      return sendAudioFile(req, reply, file, {
        size: tr.bytes,
        etag: tr.sha256,
        type: MIME[tr.format] ?? 'application/octet-stream',
        cache: FILE_CACHE,
      });
    },
  );

  // ---------------------------------------------------------------- profil (famille connectée)

  app.get<{ Params: { id: string }; Querystring: { mode?: 'ecouter' | 'memoriser' } }>(
    '/api/v1/profiles/:id/quran/reciters',
    {
      schema: {
        params: { type: 'object', properties: { id: UUIDP } },
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: { mode: { type: 'string', enum: ['ecouter', 'memoriser'] } },
        },
      },
    },
    async (req, reply) => {
      const p = await familyProfile(db, req, reply, req.params.id);
      if (!p) return reply;
      const mode = req.query.mode ?? 'ecouter';
      const o = await offeredFor(db, p.id, mode);
      const [pref] = await db
        .select({ r: t.profileReciterPref.reciterId })
        .from(t.profileReciterPref)
        .where(eq(t.profileReciterPref.profileId, p.id));
      const ids = o.reciters.map((r) => r.id);
      const choisi = pref?.r ?? null;
      const effectif =
        choisi && ids.includes(choisi)
          ? choisi
          : ids.includes(BEGINNER_RECITER)
            ? BEGINNER_RECITER
            : (ids[0] ?? null);
      return {
        mode,
        riwayaCarnet: mode === 'memoriser' ? CARNET_RIWAYA : null,
        restreint: o.restreint,
        reciters: o.reciters,
        preference: { choisi, effectif },
        conseilDebutant: ids.includes(BEGINNER_RECITER) ? BEGINNER_RECITER : null,
      };
    },
  );

  /** Pistes d'une sourate pour un profil : liste autorisée et règle de riwāya appliquées. */
  app.get<{
    Params: { id: string; sura: number };
    Querystring: { recitateur: string; mode?: 'ecouter' | 'memoriser' };
  }>(
    '/api/v1/profiles/:id/quran/suras/:sura/tracks',
    {
      schema: {
        params: { type: 'object', properties: { id: UUIDP, sura: SURA } },
        querystring: {
          type: 'object',
          additionalProperties: false,
          required: ['recitateur'],
          properties: {
            recitateur: RECITER_ID,
            mode: { type: 'string', enum: ['ecouter', 'memoriser'] },
          },
        },
      },
    },
    async (req, reply) => {
      const p = await familyProfile(db, req, reply, req.params.id);
      if (!p) return reply;
      const r = await activeReciter(db, req.query.recitateur);
      if (!r) return err(reply, 404, 'recitateur_indisponible');
      const allowed = await allowedFor(db, p.id);
      if (allowed && !allowed.has(r.id)) return err(reply, 403, 'recitateur_non_autorise');
      if (req.query.mode === 'memoriser' && r.riwaya !== CARNET_RIWAYA)
        return err(reply, 409, 'riwaya_differente_du_carnet', { riwayaCarnet: CARNET_RIWAYA });
      const m = await suraManifest(db, r, req.params.sura);
      if (!m) return err(reply, 404, 'sourate_absente');
      return m;
    },
  );

  app.put<{ Params: { id: string }; Body: { reciterId: string | null } }>(
    '/api/v1/profiles/:id/quran/reciter',
    {
      schema: {
        params: { type: 'object', properties: { id: UUIDP } },
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['reciterId'],
          properties: { reciterId: { anyOf: [RECITER_ID, { type: 'null' }] } },
        },
      },
    },
    async (req, reply) => {
      const p = await familyProfile(db, req, reply, req.params.id);
      if (!p) return reply;
      const id = req.body.reciterId;
      if (id === null) {
        await db.delete(t.profileReciterPref).where(eq(t.profileReciterPref.profileId, p.id));
        return { ok: true, choisi: null };
      }
      if (!(await activeReciter(db, id))) return err(reply, 404, 'recitateur_indisponible');
      const allowed = await allowedFor(db, p.id);
      if (allowed && !allowed.has(id)) return err(reply, 403, 'recitateur_non_autorise');
      await db
        .insert(t.profileReciterPref)
        .values({ profileId: p.id, reciterId: id })
        .onConflictDoUpdate({
          target: t.profileReciterPref.profileId,
          set: { reciterId: id, updatedAt: new Date() },
        });
      return { ok: true, choisi: id };
    },
  );

  /** Liste autorisée par le PARENT pour un profil mineur (code parent exigé) ; null : sans restriction. */
  app.get<{ Params: { id: string } }>(
    '/api/v1/profiles/:id/quran/allowed-reciters',
    { schema: { params: { type: 'object', properties: { id: UUIDP } } } },
    async (req, reply) => {
      const p = await familyProfile(db, req, reply, req.params.id);
      if (!p) return reply;
      const [r] = await db
        .select({ a: t.profileReciterRule.allowed })
        .from(t.profileReciterRule)
        .where(eq(t.profileReciterRule.profileId, p.id));
      return { parent: r?.a ?? null };
    },
  );

  app.put<{ Params: { id: string }; Body: { reciters: string[] | null } }>(
    '/api/v1/profiles/:id/quran/allowed-reciters',
    {
      schema: {
        params: { type: 'object', properties: { id: UUIDP } },
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['reciters'],
          properties: {
            reciters: {
              anyOf: [{ type: 'array', items: RECITER_ID, maxItems: 50 }, { type: 'null' }],
            },
          },
        },
      },
    },
    async (req, reply) => {
      const p = await familyProfile(db, req, reply, req.params.id);
      if (!p) return reply;
      if (p.kind === 'adulte') return err(reply, 403, 'reserve_aux_mineurs');
      if (!(await parentGate(db, req, reply, 'enfant'))) return reply;
      const list = req.body.reciters;
      if (list === null) {
        await db.delete(t.profileReciterRule).where(eq(t.profileReciterRule.profileId, p.id));
        return { ok: true, parent: null };
      }
      if (!(await knownReciters(db, list))) return err(reply, 400, 'recitateur_inconnu');
      const allowed = [...new Set(list)].sort();
      await db
        .insert(t.profileReciterRule)
        .values({ profileId: p.id, allowed, setBy: req.auth!.accountId })
        .onConflictDoUpdate({
          target: t.profileReciterRule.profileId,
          set: { allowed, setBy: req.auth!.accountId, updatedAt: new Date() },
        });
      return { ok: true, parent: allowed };
    },
  );

  // ---------------------------------------------------------------- enseignant (par classe)

  const ownClass = async (req: FastifyRequest, classId: string) => {
    const [c] = await db
      .select({ id: t.classGroup.id })
      .from(t.classGroup)
      .where(
        and(eq(t.classGroup.id, classId), eq(t.classGroup.teacherAccountId, req.auth!.accountId)),
      );
    return !!c;
  };

  app.get<{ Params: { id: string } }>(
    '/api/v1/teacher/classes/:id/quran/allowed-reciters',
    { preHandler: needTeacher, schema: { params: { type: 'object', properties: { id: UUIDP } } } },
    async (req, reply) => {
      if (!(await ownClass(req, req.params.id))) return err(reply, 404, 'introuvable');
      const [r] = await db
        .select({ a: t.classReciterRule.allowed })
        .from(t.classReciterRule)
        .where(eq(t.classReciterRule.classId, req.params.id));
      return { classe: r?.a ?? null, reciters: await activeReciters(db) };
    },
  );

  app.put<{ Params: { id: string }; Body: { reciters: string[] | null } }>(
    '/api/v1/teacher/classes/:id/quran/allowed-reciters',
    {
      preHandler: needTeacher,
      schema: {
        params: { type: 'object', properties: { id: UUIDP } },
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['reciters'],
          properties: {
            reciters: {
              anyOf: [{ type: 'array', items: RECITER_ID, maxItems: 50 }, { type: 'null' }],
            },
          },
        },
      },
    },
    async (req, reply) => {
      if (!(await ownClass(req, req.params.id))) return err(reply, 404, 'introuvable');
      const list = req.body.reciters;
      if (list === null) {
        await db.delete(t.classReciterRule).where(eq(t.classReciterRule.classId, req.params.id));
        return { ok: true, classe: null };
      }
      if (!(await knownReciters(db, list))) return err(reply, 400, 'recitateur_inconnu');
      const allowed = [...new Set(list)].sort();
      await db
        .insert(t.classReciterRule)
        .values({ classId: req.params.id, allowed, setBy: req.auth!.accountId })
        .onConflictDoUpdate({
          target: t.classReciterRule.classId,
          set: { allowed, setBy: req.auth!.accountId, updatedAt: new Date() },
        });
      return { ok: true, classe: allowed };
    },
  );

  // ---------------------------------------------------------------- administrateur

  app.get('/api/v1/admin/quran/reciters', { preHandler: needAdmin }, async () => {
    const rows = await db.execute<Record<string, unknown>>(sql`
      select r.id, r.name_fr as "nameFr", r.riwaya, r.status, r.expected_verses as "expectedVerses",
        r.retired_at as "retiredAt", r.retired_reason as "retiredReason",
        (select count(*)::int from quran_track q where q.reciter_id = r.id and q.aya > 0) as tracks,
        (select json_build_object('status', i.status, 'at', i.finished_at, 'blocking', i.blocking,
            'warnings', i.warnings)
          from quran_audio_import i where i.reciter_id = r.id order by i.finished_at desc limit 1) as "lastImport"
      from quran_reciter r order by r.id`);
    return { reciters: rows.rows };
  });

  /** Coupure immédiate d'un récitateur (motif obligatoire, journalisé). */
  app.post<{ Params: { id: string }; Body: { motif: string } }>(
    '/api/v1/admin/quran/reciters/:id/retire',
    {
      preHandler: needAdmin,
      schema: {
        params: { type: 'object', properties: { id: RECITER_ID } },
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['motif'],
          properties: { motif: { type: 'string', minLength: 3, maxLength: 500 } },
        },
      },
    },
    async (req, reply) => {
      const ok = await retireReciter(db, req.params.id, req.body.motif, req.auth!.accountId);
      if (!ok) return err(reply, 404, 'introuvable');
      return { ok: true, status: 'retire' };
    },
  );

  /** Récitateurs préchargés par le relais d'une école (choix de l'école). */
  app.put<{ Params: { id: string }; Body: { reciters: string[] } }>(
    '/api/v1/admin/relais/:id/quran-reciters',
    {
      preHandler: needAdmin,
      schema: {
        params: { type: 'object', properties: { id: UUIDP } },
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['reciters'],
          properties: { reciters: { type: 'array', items: RECITER_ID, maxItems: 20 } },
        },
      },
    },
    async (req, reply) => {
      const [rel] = await db
        .select({ id: t.relay.id })
        .from(t.relay)
        .where(and(eq(t.relay.id, req.params.id), isNull(t.relay.revokedAt)));
      if (!rel) return err(reply, 404, 'introuvable');
      const list = [...new Set(req.body.reciters)];
      if (!(await knownReciters(db, list))) return err(reply, 400, 'recitateur_inconnu');
      await db.transaction(async (tx) => {
        await tx.delete(t.relayReciter).where(eq(t.relayReciter.relayId, rel.id));
        if (list.length)
          await tx
            .insert(t.relayReciter)
            .values(list.map((r) => ({ relayId: rel.id, reciterId: r })));
      });
      return { ok: true, reciters: list.sort() };
    },
  );

  // ---------------------------------------------------------------- relais d'école (préchargement)

  /**
   * Fichiers à précharger par le relais (jeton du relais) : seulement les récitateurs ACTIFS choisis par
   * l'école ; un récitateur retiré disparaît de la liste et le relais efface ses fichiers.
   */
  app.get('/api/v1/relais/quran-audio', async (req, reply) => {
    const relay = await relayByToken(db, String(req.headers['x-relais-jeton'] ?? '') || undefined);
    if (!relay) return err(reply, 401, 'relais_inconnu');
    const rows = await db
      .select({
        reciterId: t.quranTrack.reciterId,
        path: t.quranTrack.path,
        bytes: t.quranTrack.bytes,
        sha256: t.quranTrack.sha256,
      })
      .from(t.relayReciter)
      .innerJoin(t.quranReciter, eq(t.quranReciter.id, t.relayReciter.reciterId))
      .innerJoin(t.quranTrack, eq(t.quranTrack.reciterId, t.relayReciter.reciterId))
      .where(and(eq(t.relayReciter.relayId, relay.id), eq(t.quranReciter.status, 'actif')))
      .orderBy(asc(t.quranTrack.reciterId), asc(t.quranTrack.sura), asc(t.quranTrack.aya));
    const by = new Map<
      string,
      Array<{ path: string; url: string; bytes: number; sha256: string }>
    >();
    for (const r of rows) {
      const l = by.get(r.reciterId) ?? [];
      l.push({ path: r.path, url: fileUrl(r.path), bytes: r.bytes, sha256: r.sha256 });
      by.set(r.reciterId, l);
    }
    reply.header('Cache-Control', 'no-store');
    return {
      reciters: [...by.entries()].map(([id, files]) => ({
        id,
        bytes: files.reduce((n, f) => n + f.bytes, 0),
        files,
      })),
    };
  });
}
