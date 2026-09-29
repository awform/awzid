#!/usr/bin/env node
/**
 * Batterie adverse des tuteurs, en ligne de commande.
 *   node dist/cli/eval.js [--fournisseur simule|claude] [--sortie rapport.json] [--confirmer]
 * « claude » appelle le vrai modèle (clé ANTHROPIC_API_KEY fournie par l'environnement, jamais écrite) :
 * le nombre d'appels est affiché et --confirmer est exigé. Le rapport JSON réussi avec « claude » est
 * celui que AWFORM_TUTEUR_BATTERIE doit désigner pour autoriser la mise en service (gate.ts).
 */
import { writeFileSync } from 'node:fs';
import { QuranIndex } from '../arabic.js';
import { effectiveModels, modelFor } from '../gate.js';
import { hasTanzil, loadTanzil, tanzilFile } from '../load.js';
import { ClaudeProvider } from '../providers/claude.js';
import { SimulatedProvider } from '../providers/simule.js';
import { batteryMarkdown, runBattery } from '../evals/run.js';

const arg = (k: string) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const which = arg('--fournisseur') ?? 'simule';
const out = arg('--sortie') ?? 'tuteur-batterie.json';

if (!hasTanzil()) {
  console.error(`Tanzil absent (${tanzilFile()}) : la batterie a besoin du texte de référence.`);
  process.exit(2);
}
if (which === 'claude') {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(
      'ANTHROPIC_API_KEY absent : fournissez la clé par l’environnement (jamais dans un fichier du dépôt).',
    );
    process.exit(2);
  }
  if (!process.argv.includes('--confirmer')) {
    console.error(
      'La batterie avec Claude appelle le vrai modèle (≈ 350 appels facturés, ≈ 3 à 5 $ ; le reste est local). Relancez avec --confirmer.',
    );
    process.exit(2);
  }
}

const tanzil = loadTanzil();
const index = new QuranIndex(tanzil);
const provider = which === 'claude' ? new ClaudeProvider() : new SimulatedProvider();
const res = await runBattery({
  provider,
  index,
  basmala: tanzil.get('1:1') ?? '',
  models: effectiveModels(process.env),
  modelFor: modelFor(process.env),
});
writeFileSync(out, JSON.stringify(res, null, 2));
writeFileSync(out.replace(/\.json$/, '.md'), batteryMarkdown(res));
console.log(batteryMarkdown(res));
process.exit(res.reussi ? 0 : 1);
