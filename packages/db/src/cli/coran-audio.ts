#!/usr/bin/env node
/**
 * Audio du Coran (lot 27) — outil d'exploitation, compte PROPRIÉTAIRE de la base (service « outils »).
 *
 *   node dist/cli/coran-audio.js catalogue [--licence-url URL] [--licence-texte FICHIER]
 *   node dist/cli/coran-audio.js verifier --recitateur ID --dossier DIR [options]
 *   node dist/cli/coran-audio.js importer --recitateur ID --dossier DIR [--activer] [options]
 *   node dist/cli/coran-audio.js activer  --recitateur ID [--reactiver]
 *   node dist/cli/coran-audio.js retirer  --recitateur ID --motif "…"
 *   node dist/cli/coran-audio.js etat
 *
 * Options : --nommage SSSVVV.mp3 (défaut : nommage relevé du Complexe ; plusieurs, séparés par des virgules)
 * · --dossier répété (dossiers supplémentaires) · --sourate-du-dossier (sous-dossiers « NNN … » : sourate lue
 * dans le nom du dossier) · --fichiers-sourate DIR [--nommage-sourate 06-SSSD00-10mp3.mp3] (repli sur le
 * fichier de sourate entière d'une sourate au découpage non conforme, riwāyāt autres que Ḥafṣ) ·
 * --repli-sourates 42 (repli imposé par le référent, Ḥafṣ compris ; exige --fichiers-sourate) · --sourates 1,112-114 (muṣḥaf partiel) · --versets N (compte
 * déclaré, riwāyāt autres que Ḥafṣ) · --empreintes SHA256SUMS · --sans-silences · --silence-max 4000 (ms)
 * · --stockage DIR (défaut AWFORM_AUDIO_DIR) · --rapport fichier.json · --partiel · --reactiver · --test.
 * Code de sortie : 0 succès ; 2 import bloqué ou refus ; 1 erreur.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import { connect } from '../client.js';
import { loadRootEnv } from '../env.js';
import {
  activateReciter,
  COMPLEXE_CATALOGUE,
  COMPLEXE_NOMMAGES,
  COMPLEXE_NOMMAGES_SOURATE,
  formatReport,
  importReciterAudio,
  parseSuraList,
  readChecksums,
  retireReciter,
  scanAudioDir,
  upsertReciter,
} from '../audio/index.js';
import * as t from '../schema.js';
import { eq } from 'drizzle-orm';

loadRootEnv();
const [cmd, ...rest] = process.argv.slice(2);
const flags = new Map<string, string | true>();
/** --dossier peut être répété : dossiers supplémentaires (fichiers lus tels quels) */
const dossiers: string[] = [];
for (let i = 0; i < rest.length; i++) {
  const a = rest[i]!;
  if (!a.startsWith('--')) continue;
  const next = rest[i + 1];
  if (next !== undefined && !next.startsWith('--')) {
    if (a === '--dossier') dossiers.push(next);
    flags.set(a.slice(2), a === '--dossier' ? dossiers[0]! : next);
    i++;
  } else flags.set(a.slice(2), true);
}
const str = (k: string) =>
  typeof flags.get(k) === 'string' ? (flags.get(k) as string) : undefined;
const need = (k: string) => {
  const v = str(k);
  if (!v) {
    console.error(`option --${k} obligatoire`);
    process.exit(1);
  }
  return v;
};

const h = connect(flags.has('test') ? process.env.TEST_DATABASE_URL : process.env.DATABASE_URL, 2);
let code = 0;
try {
  if (cmd === 'catalogue') {
    const url = str('licence-url');
    const texte = str('licence-texte');
    for (const m of COMPLEXE_CATALOGUE)
      await upsertReciter(h.db, {
        ...m,
        ...(url ? { licenseUrl: url } : {}),
        ...(texte ? { licenseText: readFileSync(texte, 'utf8').trim() } : {}),
      });
    console.log(`${COMPLEXE_CATALOGUE.length} récitateurs posés (statut inchangé).`);
  } else if (cmd === 'verifier' || cmd === 'importer') {
    const id = need('recitateur');
    const common = {
      dir: need('dossier'),
      ...(dossiers.length > 1 ? { extraDirs: dossiers.slice(1) } : {}),
      pattern: str('nommage') ?? COMPLEXE_NOMMAGES[id] ?? 'SSSVVV.mp3',
      ...(flags.has('sourate-du-dossier') ? { suraFromFolder: true } : {}),
      ...(str('repli-sourates')
        ? { forceSuraFallback: parseSuraList(str('repli-sourates')!) }
        : {}),
      ...(str('fichiers-sourate')
        ? {
            suraFilesDir: str('fichiers-sourate')!,
            suraFilesPattern: str('nommage-sourate') ?? COMPLEXE_NOMMAGES_SOURATE[id] ?? 'SSS.mp3',
          }
        : {}),
      ...(str('sourates') ? { suras: parseSuraList(str('sourates')!) } : {}),
      ...(str('versets') ? { declaredVerses: Number(str('versets')) } : {}),
      ...(str('empreintes') ? { checksums: readChecksums(str('empreintes')!) } : {}),
      silence: !flags.has('sans-silences'),
      ...(str('silence-max') ? { longSilenceMs: Number(str('silence-max')) } : {}),
    };
    let report;
    let status: string | undefined;
    if (cmd === 'verifier') {
      const [rec] = await h.db.select().from(t.quranReciter).where(eq(t.quranReciter.id, id));
      if (!rec) throw new Error(`récitateur inconnu : ${id}`);
      report = await scanAudioDir({
        ...common,
        riwaya: rec.riwaya,
        ...(rec.riwaya !== 'hafs' && !common.suras && !common.declaredVerses
          ? { declaredVerses: rec.expectedVerses }
          : {}),
      });
    } else {
      const storageDir = str('stockage') ?? process.env.AWFORM_AUDIO_DIR;
      if (!storageDir) throw new Error('stockage audio : --stockage ou AWFORM_AUDIO_DIR');
      const r = await importReciterAudio(h.db, {
        ...common,
        reciterId: id,
        storageDir,
        activate: flags.has('activer'),
        partialOk: flags.has('partiel'),
        reactivate: flags.has('reactiver'),
      });
      report = r.report;
      status = r.status;
    }
    console.log(formatReport(report, status));
    const out = str('rapport');
    if (out) {
      const { tracks, ...rep } = report;
      writeFileSync(out, JSON.stringify({ ...rep, status, tracks }, null, 1));
      console.log(`Rapport complet : ${out}`);
    }
    if (report.blocking > 0) code = 2;
  } else if (cmd === 'activer') {
    const r = await activateReciter(h.db, need('recitateur'), {
      reactivate: flags.has('reactiver'),
      partialOk: flags.has('partiel'),
    });
    console.log(r.ok ? 'Activé.' : `Refus : ${r.reason}`);
    if (!r.ok) code = 2;
  } else if (cmd === 'retirer') {
    const ok = await retireReciter(h.db, need('recitateur'), need('motif'));
    console.log(ok ? 'Retiré immédiatement (réponses, paquets, fichiers).' : 'Récitateur inconnu.');
    if (!ok) code = 2;
  } else if (cmd === 'etat') {
    const rows = await h.db
      .select({
        id: t.quranReciter.id,
        riwaya: t.quranReciter.riwaya,
        status: t.quranReciter.status,
        expected: t.quranReciter.expectedVerses,
        tracks: sql<number>`(select count(*)::int from quran_track q where q.reciter_id = ${t.quranReciter.id} and q.aya > 0)`,
      })
      .from(t.quranReciter)
      .orderBy(t.quranReciter.id);
    for (const r of rows)
      console.log(
        `${r.id.padEnd(16)} ${r.riwaya.padEnd(6)} ${r.status.padEnd(10)} ${r.tracks}/${r.expected}`,
      );
  } else {
    console.error('commandes : catalogue | verifier | importer | activer | retirer | etat');
    code = 1;
  }
} catch (e) {
  console.error(`Erreur : ${(e as Error).message}`);
  code = 1;
} finally {
  await h.close();
}
process.exit(code);
