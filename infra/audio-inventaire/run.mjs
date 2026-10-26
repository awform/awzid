/* eslint-disable -- outil d'exploitation (inventaire audio global du 26/10/2026), pas du code de l'application */
/**
 * Inventaire global des textes arabes sans audio (26/10/2026) — chantier « zéro muet », toutes surfaces.
 * Usage (sur la VM, après chaque arrivée de fichiers) :
 *   node infra/audio-inventaire/run.mjs     -> lit les livres (~/awform-content), l'index (~/lecons-audio/liste.csv), les données
 *                                              de l'application ; écrit rows.json dans $INVENTAIRE_SORTIE (défaut ~/inventaire-audio-out)
 *   node infra/audio-inventaire/ecrire.mjs  -> écrit les TSV (inventaire, à générer, Ayyūb, à rattacher, anomalies)
 *   node infra/audio-inventaire/resume.mjs  -> tableaux chiffrés (surfaces, livres)
 * Les TSV se copient ensuite dans packages/content/data/zero-muet/. Aucun audio n'est généré ni modifié.
 * Les règles de nature sont celles de la garde coranique (`@awform/content`, dist) : aucune règle nouvelle ici.
 */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import * as L from './lib.mjs';
import * as B from './c-livres.mjs';
import * as A from './c-autres.mjs';
const t0 = Date.now();
for (const [n, f] of [
  ['lecons', B.lecons],
  ['cahierLecture', B.cahierLecture],
  ['cahierParler', B.cahierParler],
  ['religion', A.religionEtLectures],
  ['vivreFiches', A.vivreFiches],
  ['douas', A.douas],
  ['priere', A.priere],
  ['madjaliss', A.madjaliss],
  ['mutashabihat', A.mutashabihat],
  ['interface', A.interfaceArabe],
  ['termesI18n', A.termesI18n],
  ['lemmes', A.lemmes],
  ['agreges', A.coranAgreges],
]) {
  try {
    f();
    console.error(n, 'ok', Date.now() - t0);
  } catch (e) {
    console.error(n, 'ERR', e.stack.slice(0, 500));
    process.exit(1);
  }
}
mkdirSync(process.env.INVENTAIRE_SORTIE ?? process.env.HOME + '/inventaire-audio-out', {
  recursive: true,
});
const OUT = (process.env.INVENTAIRE_SORTIE ?? process.env.HOME + '/inventaire-audio-out') + '/';
writeFileSync(
  OUT + 'rows.json',
  JSON.stringify({ rows: L.rows, agreges: A.AGREGES, stats: L.S, anomalies: L.anomalies }),
);
console.error('rows', L.rows.length, 'anomalies', L.anomalies.length);
