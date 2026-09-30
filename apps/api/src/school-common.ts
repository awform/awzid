/** Motifs et aides communs aux routes de l'espace école (QUA-3, repris de school.ts). */
import type { FastifyReply } from 'fastify';
import { suraName } from '@awform/hifz';

export type Edition = () => Promise<{ id: string; code: string } | null>;

export const err = (reply: FastifyReply, status: number, code: string, extra: object = {}) =>
  reply.code(status).send({ error: { code, ...extra } });

export const UUID = { type: 'string', format: 'uuid' } as const;
export const DAY = '^\\d{4}-\\d{2}-\\d{2}$';
export const LEVEL = '^[a-z]{2,3}[0-9]{1,2}$';
export const UNIT_ID = /^[a-z]{2,3}\d{1,2}\.l\d{2}$/;
export const PART = /^(\d{1,3}):(\d{1,3})(?:-(\d{1,3}))?$/;
export const BOOKLET = /^[a-z]{2,3}\d{1,2}-\d{2}$/;
export const TXT = (max: number) => ({ type: ['string', 'null'], maxLength: max }) as const;
export const COUNT = { type: 'integer', minimum: 0, maximum: 50 } as const;

export const today = () => new Date().toISOString().slice(0, 10);
export const partLabel = (key: string) => {
  const m = PART.exec(key);
  return m ? `${suraName(Number(m[1]))} (${key})` : key;
};
