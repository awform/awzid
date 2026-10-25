// 19/10/2026 — catalogues de textes VERSIONNÉS. Après `vite build`, copie `static/i18n/` sous `i18n/<version>/` dans la
// sortie du client (`.svelte-kit/output/client` et `build/client`) : l'application demande ses catalogues à
// l'adresse de SA version (`catalogUrl` dans src/lib/i18n/index.ts), jamais à une adresse fixe qu'un ancien service
// worker ou le cache HTTP pourrait servir avec le contenu d'une version précédente (incident du 19/10 : clés brutes
// `⟦id.google⟧` affichées par le nouveau code sur un téléphone resté sur l'ancienne version).
// La version est celle de SvelteKit (`_app/version.json`), la même que `version` du service worker et de
// `$app/environment`. Les catalogues de l'accueil public (`i18n/accueil`) sont lus par le serveur : non copiés.
import { cpSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'static', 'i18n');

/** Copie les catalogues sous i18n/<version>/ dans un dossier de sortie ; renvoie la version, ou null (absent). */
export function versionner(sortie) {
  const fichier = join(sortie, '_app', 'version.json');
  if (!existsSync(fichier)) return null;
  const version = String(JSON.parse(readFileSync(fichier, 'utf8')).version ?? '');
  if (!version) throw new Error(`${fichier} : version vide`);
  const dest = join(sortie, 'i18n', version);
  cpSync(src, dest, {
    recursive: true,
    filter: (p) => !/[\\/]accueil([\\/]|$)/.test(p),
  });
  compacter(dest);
  return version;
}

/**
 * 25/10/2026 — les copies servies sont COMPACTÉES (sans indentation ni retour à la ligne) : même contenu, moins d'octets à
 * télécharger (les catalogues de l'élève sont préchargés). Les textes ne sont pas touchés : JSON.parse puis JSON.stringify
 * recopie chaque chaîne telle quelle (aucune normalisation, l'arabe reste octet pour octet). Les sources restent lisibles.
 */
export function compacter(dossier) {
  for (const f of readdirSync(dossier)) {
    const p = join(dossier, f);
    if (statSync(p).isDirectory()) compacter(p);
    else if (f.endsWith('.json'))
      writeFileSync(p, JSON.stringify(JSON.parse(readFileSync(p, 'utf8'))));
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const vues = [];
  for (const dir of [
    join(root, '.svelte-kit', 'output', 'client'),
    join(root, 'build', 'client'),
  ]) {
    const v = versionner(dir);
    if (v) vues.push(v);
  }
  if (!vues.length)
    throw new Error('catalogues versionnés : aucune sortie de construction trouvée');
  console.log(`catalogues copiés sous /i18n/${vues[0]}/ (${vues.length} sortie(s))`);
}
