/**
 * Versets cités dans les blocs des leçons (chantier « versets dans les leçons ») : index de recherche bâti une
 * fois par processus sur le texte Tanzil de la base (`quran_verse`, octet pour octet), puis annotation des
 * leçons servies (`verset_tanzil` sur chaque point dont le texte arabe est un passage exact du Coran).
 */
import { annotateVerses, buildVerseLocator, type VerseLocator } from '@awform/content/versets';
import type { Db } from './client.js';
import * as t from './schema.js';

let cached: Promise<VerseLocator | null> | null = null;
let names: ((s: number) => string) | undefined;

/** Noms des sourates pour la référence affichée (fournis par l'API : paquet hifz, métadonnées Tanzil). */
export function setVerseSuraNames(fn: (s: number) => string): void {
  names = fn;
}

/** Index des versets (null si la table est vide : contenu synthétique, base neuve). */
export function verseLocator(db: Db): Promise<VerseLocator | null> {
  if (!cached) {
    cached = (async () => {
      const rows = await db
        .select({ s: t.quranVerse.sura, a: t.quranVerse.aya, text: t.quranVerse.text })
        .from(t.quranVerse);
      if (!rows.length) {
        cached = null; // table encore vide : nouvel essai à la prochaine leçon
        return null;
      }
      return buildVerseLocator(rows);
    })().catch((e: unknown) => {
      cached = null;
      throw e;
    });
  }
  return cached;
}

/** À appeler après un import du texte coranique (tests, outils). */
export function resetVerseLocator(): void {
  cached = null;
}

/** Annote les versets cités dans une leçon (projection élève) ; renvoie le nombre de versets repérés. */
export async function annotateLessonVerses(db: Db, lesson: unknown): Promise<number> {
  return annotateVerses(lesson, await verseLocator(db), names);
}
