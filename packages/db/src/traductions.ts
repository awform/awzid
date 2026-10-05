/**
 * Traductions des contenus (lot F1, revue G1) : lecture du calque `content_translation` (VIDE aujourd'hui :
 * les livres restent en français). Pour un objet (leçon, exercice…) et une langue d'explication, renvoie les
 * champs traduits SERVABLES (source actuelle, statut suffisant ; religieux : validé par le référent) — les
 * autres restent en français, avec la mention « texte original » côté interface.
 */
import { and, eq } from 'drizzle-orm';
import {
  pickTranslation,
  sha256Hex,
  SOURCE_LOCALE,
  translatableFields,
  type TranslationRow,
  type TranslationStatus,
} from '@awform/content';
import type { Db } from './client.js';
import * as t from './schema.js';

export type TranslationObjectKind = 'unite' | 'exercice' | 'registre' | 'niveau' | 'livret';

export async function servedTranslations(
  db: Db,
  o: {
    kind: TranslationObjectKind;
    id: string;
    content: unknown;
    locale: string;
    religiousLevel?: boolean;
  },
): Promise<Record<string, string>> {
  if (o.locale === SOURCE_LOCALE) return {};
  const rows = await db
    .select()
    .from(t.contentTranslation)
    .where(
      and(
        eq(t.contentTranslation.objectKind, o.kind),
        eq(t.contentTranslation.objectId, o.id),
        eq(t.contentTranslation.locale, o.locale),
      ),
    );
  if (!rows.length) return {};
  const byPath = new Map<string, TranslationRow[]>();
  for (const r of rows)
    byPath.set(r.fieldPath, [
      ...(byPath.get(r.fieldPath) ?? []),
      {
        locale: r.locale,
        version: r.version,
        status: r.status as TranslationStatus,
        religious: r.religious,
        sourceSha256: r.sourceSha256,
        text: r.text,
      },
    ]);
  const out: Record<string, string> = {};
  for (const f of translatableFields(o.content, o.religiousLevel)) {
    const cand = byPath.get(f.path);
    if (!cand) continue;
    // la nature religieuse vient du CONTENU, jamais de la ligne de traduction (pas de contournement)
    const pick = pickTranslation(
      cand.map((c) => ({ ...c, religious: c.religious || f.religious })),
      o.locale,
      sha256Hex(f.text),
    );
    if (pick) out[f.path] = pick.text;
  }
  return out;
}
