/**
 * Récitations envoyées à l'enseignant (lot 16) : chiffrement AES-256-GCM (clé hors de la base, version de clé
 * pour la rotation), durée de conservation courte (réglée par la classe), suppression par la famille,
 * effacement automatique à l'échéance (travailleur). L'audio n'est déchiffré que pour l'enseignant de la
 * classe (contrôle dans l'API) ; aucun autre chemin ne le lit (aucune IA, aucun export).
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { and, desc, eq, gt, inArray, lt } from 'drizzle-orm';
import type { Db } from './client.js';
import * as t from './schema.js';

export interface RecitationKey {
  version: number;
  key: Buffer;
}

/** « v1:<64 hex> » ou « <64 hex> » (version 1). */
export function parseRecitationKey(raw: string | undefined | null): RecitationKey | null {
  if (!raw) return null;
  const m = /^(?:v(\d+):)?([0-9a-f]{64})$/i.exec(raw.trim());
  return m ? { version: Number(m[1] ?? 1), key: Buffer.from(m[2]!, 'hex') } : null;
}

export function encryptAudio(k: RecitationKey, audio: Buffer): { iv: Buffer; ciphertext: Buffer } {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', k.key, iv);
  const body = Buffer.concat([c.update(audio), c.final()]);
  return { iv, ciphertext: Buffer.concat([body, c.getAuthTag()]) };
}

export function decryptAudio(k: RecitationKey, iv: Buffer, ciphertext: Buffer): Buffer {
  const d = createDecipheriv('aes-256-gcm', k.key, iv);
  d.setAuthTag(ciphertext.subarray(ciphertext.length - 16));
  return Buffer.concat([d.update(ciphertext.subarray(0, ciphertext.length - 16)), d.final()]);
}

export async function storeRecitation(
  db: Db,
  k: RecitationKey,
  r: {
    profileId: string;
    classId: string;
    part: string;
    mime: string;
    durationS: number | null;
    audio: Buffer;
    sentBy: string;
    days: number;
    now?: Date;
  },
) {
  const { iv, ciphertext } = encryptAudio(k, r.audio);
  const now = r.now ?? new Date();
  const [row] = await db
    .insert(t.recitationUpload)
    .values({
      profileId: r.profileId,
      classId: r.classId,
      part: r.part,
      mime: r.mime,
      durationS: r.durationS,
      size: r.audio.length,
      keyVersion: k.version,
      iv,
      ciphertext,
      sentBy: r.sentBy,
      createdAt: now,
      expiresAt: new Date(now.getTime() + r.days * 86_400_000),
    })
    .returning({
      id: t.recitationUpload.id,
      createdAt: t.recitationUpload.createdAt,
      expiresAt: t.recitationUpload.expiresAt,
    });
  return row!;
}

/** Métadonnées (jamais l'audio). */
const META = {
  id: t.recitationUpload.id,
  profileId: t.recitationUpload.profileId,
  classId: t.recitationUpload.classId,
  part: t.recitationUpload.part,
  mime: t.recitationUpload.mime,
  durationS: t.recitationUpload.durationS,
  size: t.recitationUpload.size,
  createdAt: t.recitationUpload.createdAt,
  expiresAt: t.recitationUpload.expiresAt,
  listenedAt: t.recitationUpload.listenedAt,
  grade: t.recitationUpload.grade,
  gradedAt: t.recitationUpload.gradedAt,
};

export async function profileRecitations(db: Db, profileId: string, now = new Date()) {
  return db
    .select(META)
    .from(t.recitationUpload)
    .where(and(eq(t.recitationUpload.profileId, profileId), gt(t.recitationUpload.expiresAt, now)))
    .orderBy(desc(t.recitationUpload.createdAt));
}

/** Récitations d'une classe, seulement des élèves ENCORE inscrits (retrait = plus d'accès). */
export async function classRecitations(db: Db, classId: string, now = new Date()) {
  const members = await db
    .select({ p: t.classMember.profileId })
    .from(t.classMember)
    .where(eq(t.classMember.classId, classId));
  if (!members.length) return [];
  return db
    .select({ ...META, pseudonym: t.profile.pseudonym })
    .from(t.recitationUpload)
    .innerJoin(t.profile, eq(t.profile.id, t.recitationUpload.profileId))
    .where(
      and(
        eq(t.recitationUpload.classId, classId),
        gt(t.recitationUpload.expiresAt, now),
        inArray(
          t.recitationUpload.profileId,
          members.map((m) => m.p),
        ),
      ),
    )
    .orderBy(desc(t.recitationUpload.createdAt));
}

export async function recitationById(db: Db, id: string) {
  const [r] = await db.select().from(t.recitationUpload).where(eq(t.recitationUpload.id, id));
  return r ?? null;
}

export async function deleteRecitation(db: Db, profileId: string, id: string): Promise<boolean> {
  const r = await db
    .delete(t.recitationUpload)
    .where(and(eq(t.recitationUpload.id, id), eq(t.recitationUpload.profileId, profileId)))
    .returning({ id: t.recitationUpload.id });
  return r.length > 0;
}

export async function deleteProfileRecitations(db: Db, profileId: string): Promise<number> {
  const r = await db
    .delete(t.recitationUpload)
    .where(eq(t.recitationUpload.profileId, profileId))
    .returning({ id: t.recitationUpload.id });
  return r.length;
}

/** Effacement des récitations échues (tâche nocturne du travailleur). */
export async function purgeExpiredRecitations(db: Db, now = new Date()): Promise<number> {
  const r = await db
    .delete(t.recitationUpload)
    .where(lt(t.recitationUpload.expiresAt, now))
    .returning({ id: t.recitationUpload.id });
  return r.length;
}
