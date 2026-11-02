// Fichiers du tafsīr de l'API de TEST (AWFORM_TAFSIR_DIR) : copie des fichiers livrés (packages/content/tafsir), puis deux segments FICTIFS
// ajoutés à la sourate 112 (verset 1) pour vérifier le filtrage par public : un segment « niveau adulte » (avec sa note de contexte) et un
// segment « mention publique interdite » (réservé au compte « tout voir »). Textes marqués [TEST] : aucun contenu religieux.
// Usage : node e2e/tafsir-essai.mjs <dossier>
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dossier = process.argv[2];
if (!dossier) throw new Error('usage : node e2e/tafsir-essai.mjs <dossier>');
const source = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'packages',
  'content',
  'tafsir',
);
rmSync(dossier, { recursive: true, force: true });
mkdirSync(dossier, { recursive: true });
cpSync(source, dossier, { recursive: true });
const f = join(dossier, '112.json');
const x = JSON.parse(readFileSync(f, 'utf8'));
const base = x.points.length;
x.points.push(
  {
    id: base,
    titre: '[TEST] segment pour adultes (v. 1)',
    texte: '[TEST] TEXTE-ADULTE-SEUL',
    sources: [],
    plage: [[1, 1]],
    acces: 'adulte',
    note_contexte: '[TEST] NOTE-DE-CONTEXTE-ADULTE',
  },
  {
    id: base + 1,
    titre: '[TEST] segment réservé (v. 1)',
    texte: '[TEST] TEXTE-RESERVE-CLIENT',
    sources: [],
    plage: [[1, 1]],
    acces: 'interdit',
  },
);
x.versets[0].p.push(base, base + 1);
writeFileSync(f, `${JSON.stringify(x)}\n`);
console.log(`tafsir d'essai : ${dossier} (112 : +2 segments fictifs)`);
