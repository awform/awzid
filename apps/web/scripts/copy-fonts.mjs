// Copie les polices (licence SIL OFL) depuis les paquets @fontsource vers static/fonts :
// elles sont servies par NOS serveurs (jamais par un service tiers) et mises en cache pour le hors ligne.
// Amiri Quran : sous-ensembles complets conservés (aucun signe coranique perdu).
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'static', 'fonts');
mkdirSync(out, { recursive: true });

const wanted = [
  ['@fontsource/amiri-quran', /^amiri-quran-(arabic|latin)-400-normal\.woff2$/],
  ['@fontsource/noto-naskh-arabic', /^noto-naskh-arabic-arabic-(400|700)-normal\.woff2$/],
  ['@fontsource/nunito', /^nunito-(latin|latin-ext)-(400|700)-normal\.woff2$/],
];
let n = 0;
for (const [pkg, re] of wanted) {
  const dir = join(dirname(require.resolve(`${pkg}/package.json`)), 'files');
  for (const f of readdirSync(dir).filter((x) => re.test(x))) {
    copyFileSync(join(dir, f), join(out, f));
    n++;
  }
  const lic = join(dirname(require.resolve(`${pkg}/package.json`)), 'LICENSE');
  if (existsSync(lic)) copyFileSync(lic, join(out, `${pkg.split('/')[1]}.LICENSE.txt`));
}
if (n < 7) throw new Error(`polices manquantes (${n} fichiers copiés)`);
console.log(`polices : ${n} fichiers copiés dans static/fonts`);
