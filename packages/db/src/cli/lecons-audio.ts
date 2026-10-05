#!/usr/bin/env node
/**
 * Audio des leçons (chantier A3) — outil d'exploitation (service « lecons-audio », compte propriétaire).
 *
 *   node dist/cli/lecons-audio.js importer [--source DIR] [--stockage DIR] [--niveaux en1,ad1] [--si-present] [--test]
 *   node dist/cli/lecons-audio.js etat [--stockage DIR]
 *
 * --source : dossier produit par audio/gen-audio.ps1 (index.js + <sha1>.mp3) ; défaut /source.
 * --stockage : défaut AWFORM_LECONS_AUDIO_DIR. --si-present : rien à faire (code 0) si la source est absente.
 * Code de sortie : 0 succès ; 2 fichiers refusés (absents, illisibles, incohérents) ; 1 erreur.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { asc } from 'drizzle-orm';
import { connect } from '../client.js';
import { loadRootEnv } from '../env.js';
import { importLeconsAudio, readLeconsManifest } from '../lecons-audio.js';
import * as t from '../schema.js';

loadRootEnv();
const [cmd, ...rest] = process.argv.slice(2);
const flags = new Map<string, string | true>();
for (let i = 0; i < rest.length; i++) {
  const a = rest[i]!;
  if (!a.startsWith('--')) continue;
  const next = rest[i + 1];
  if (next !== undefined && !next.startsWith('--')) {
    flags.set(a.slice(2), next);
    i++;
  } else flags.set(a.slice(2), true);
}
const str = (k: string) =>
  typeof flags.get(k) === 'string' ? (flags.get(k) as string) : undefined;
const dest = str('stockage') ?? process.env.AWFORM_LECONS_AUDIO_DIR;
if (!dest) throw new Error('--stockage ou AWFORM_LECONS_AUDIO_DIR attendu');

if (cmd === 'etat') {
  const m = readLeconsManifest(dest);
  if (!m) {
    console.log('aucun audio des leçons importé');
    process.exit(0);
  }
  const par: Record<string, { fichiers: number; octets: number }> = {};
  for (const f of Object.values(m.fichiers))
    for (const n of f.n) {
      const p = (par[n] ??= { fichiers: 0, octets: 0 });
      p.fichiers++;
      p.octets += f.o;
    }
  console.log(
    JSON.stringify(
      {
        genere: m.genere,
        fichiers: Object.keys(m.fichiers).length,
        coraniques: m.coraniques.length,
        credits: m.credits,
        parNiveau: par,
      },
      null,
      1,
    ),
  );
} else if (cmd === 'importer') {
  const source = str('source') ?? '/source';
  if (!existsSync(join(source, 'index.js'))) {
    if (flags.has('si-present')) {
      console.log(`audio des leçons : source absente (${source}), rien à importer`);
      process.exit(0);
    }
    throw new Error(`${source}/index.js absent`);
  }
  const h = connect(
    flags.has('test') ? process.env.TEST_DATABASE_URL : process.env.DATABASE_URL,
    2,
  );
  try {
    const verses = (
      await h.db
        .select({ text: t.quranVerse.text })
        .from(t.quranVerse)
        .orderBy(asc(t.quranVerse.sura), asc(t.quranVerse.aya))
    ).map((v) => v.text);
    const niveaux = str('niveaux')?.split(',').filter(Boolean);
    const r = importLeconsAudio({ source, dest, verses, niveaux });
    const { absents, illisibles, incoherents, ...resume } = r;
    console.log(
      JSON.stringify(
        {
          ...resume,
          absents: absents.length,
          illisibles: illisibles.length,
          incoherents: incoherents.length,
        },
        null,
        1,
      ),
    );
    const refus = [...absents, ...illisibles, ...incoherents];
    if (refus.length) {
      console.error(`refusés (${refus.length}) : ${refus.slice(0, 20).join(' ')}`);
      process.exitCode = 2;
    }
  } finally {
    await h.close();
  }
} else {
  console.error('commande attendue : importer | etat');
  process.exitCode = 1;
}
