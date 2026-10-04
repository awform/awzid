// Lot 27 — e2e : deux récitateurs D'ESSAI dans la base de TEST, avec des FICHIERS NON CORANIQUES (bips
// générés), jamais une récitation inventée ou synthétisée. Un en Ḥafṣ (sourates 1 et 112 à 114) et un en
// Qālūn (sourate 1) pour vérifier le badge de riwāya, l'absence de surlignage et le refus du mode Mémoriser.
// Usage : node e2e/audio-essai.mjs <dossier de stockage>  (TEST_DATABASE_URL = compte propriétaire)
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connect } from '../../../packages/db/dist/client.js';
import {
  importReciterAudio,
  upsertReciter,
  writeTestMushaf,
} from '../../../packages/db/dist/audio/index.js';

const storageDir = process.argv[2];
if (!storageDir) throw new Error('dossier de stockage attendu');
const meta = (id, riwaya, nameFr) => ({
  id,
  nameAr: 'تجربة',
  nameFr,
  riwaya,
  speed: null,
  style: 'murattal',
  expectedVerses: riwaya === 'hafs' ? 6236 : 6214,
  licenseSource: 'Essai automatique (bips générés, aucun enregistrement)',
  licenseUrl: 'https://example.invalid/essai',
  licenseArchivedOn: '2025-07-30',
  licenseText: 'Fichiers d’essai non coraniques.',
  credit: `${nameFr} — fichiers d’essai non coraniques (bips).`,
});
const h = connect(process.env.TEST_DATABASE_URL, 2);
try {
  for (const [id, riwaya, nameFr, suras, counts] of [
    ['essai-hafs', 'hafs', 'Essai Ḥafṣ (bips)', [1, 112, 113, 114], undefined],
    ['essai-qalun', 'qalun', 'Essai Qālūn (bips)', [1], { 1: 7 }],
  ]) {
    await upsertReciter(h.db, meta(id, riwaya, nameFr));
    const dir = join(tmpdir(), `awform-e2e-source-${id}`);
    rmSync(dir, { recursive: true, force: true });
    writeTestMushaf(dir, suras, { ms: 600, counts, ext: 'wav' });
    const r = await importReciterAudio(h.db, {
      reciterId: id,
      dir,
      pattern: 'SSSVVV.wav',
      suras,
      // autre riwāya : nombre de versets déclaré (ici, celui des fichiers d'essai)
      ...(riwaya === 'hafs'
        ? {}
        : { declaredVerses: Object.values(counts ?? {}).reduce((s, n) => s + n, 0) }),
      silence: false,
      storageDir,
      activate: true,
      partialOk: true,
      reactivate: true,
    });
    if (r.report.blocking > 0)
      throw new Error(
        `${id} : import bloqué (${r.status}) ${JSON.stringify(r.report.issues.slice(0, 3))}`,
      );
  }
  console.log('audio d’essai : 2 récitateurs (bips non coraniques) importés');
} finally {
  await h.close();
}
