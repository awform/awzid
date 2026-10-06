// A27 (décision D-F2 9) : pages du PERSONNEL (enseignant, direction, administrateur) exclues du cache hors ligne
// de l'appareil d'un élève. Après `vite build`, on calcule les fichiers (JS, CSS) qui ne servent QU'À ces pages
// (fermeture des imports statiques et dynamiques depuis leurs nœuds, moins tout ce qu'atteint une autre page), et
// on écrit leur liste dans `personnel.json` à la racine du site : le service worker ne les précharge pas (ils sont
// gardés au premier usage — le personnel est en ligne pour son second facteur). Utilisé aussi par budget.mjs.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Préfixes des routes réservées au personnel. */
export const STAFF_ROUTES = ['/enseignant', '/admin'];

export function staffOnlyFiles(root) {
  const client = join(root, '.svelte-kit', 'output', 'client');
  const manifest = JSON.parse(readFileSync(join(client, '.vite', 'manifest.json'), 'utf8'));
  const app = readFileSync(
    join(root, '.svelte-kit', 'generated', 'client-optimized', 'app.js'),
    'utf8',
  );
  const dict = app.slice(app.indexOf('export const dictionary'));
  const routes = [...dict.matchAll(/"([^"]+)":\s*\[\s*~?(\d+)(?:\s*,\s*\[([^\]]*)\])?/g)].map(
    (m) => ({
      route: m[1],
      nodes: [
        0,
        ...(m[3] ? m[3].split(',').map((x) => Number(x.replace('~', '').trim())) : []),
        Number(m[2]),
      ],
    }),
  );
  if (!routes.length) throw new Error('dictionnaire des routes illisible');
  const keyOf = (suffix) => Object.keys(manifest).find((k) => k.endsWith(suffix));
  // imports statiques et dynamiques — sauf ceux de l'application elle-même (app.js charge TOUS les nœuds à la
  // demande : les suivre rendrait chaque page « partagée »)
  const closure = (keys, out = new Set(), seen = new Set(), dynamic = true) => {
    const visit = (k) => {
      if (!k || seen.has(k) || !manifest[k]) return;
      seen.add(k);
      const e = manifest[k];
      out.add(e.file);
      for (const c of e.css ?? []) out.add(c);
      for (const i of [...(e.imports ?? []), ...(dynamic ? (e.dynamicImports ?? []) : [])])
        visit(i);
    };
    keys.forEach(visit);
    return out;
  };
  const nodeKey = (n) => keyOf(`client-optimized/nodes/${n}.js`);
  const isStaff = (r) => STAFF_ROUTES.some((p) => r === p || r.startsWith(`${p}/`));
  const staffNodes = new Set();
  const otherNodes = new Set();
  const staffLayouts = new Set();
  for (const r of routes) {
    // le dernier nœud est la page ; les autres sont les mises en page ou la racine
    const page = r.nodes[r.nodes.length - 1];
    (isStaff(r.route) ? staffNodes : otherNodes).add(page);
    for (const n of r.nodes.slice(0, -1)) (isStaff(r.route) ? staffLayouts : otherNodes).add(n);
  }
  // A37 : une mise en page qui ne sert QU'À des pages du personnel (chargement de leurs textes) est à elles
  for (const n of staffLayouts) if (!otherNodes.has(n)) staffNodes.add(n);
  const base = [
    keyOf('/@sveltejs/kit/src/runtime/client/entry.js'),
    keyOf('client-optimized/app.js'),
  ];
  const others = closure([...otherNodes].map(nodeKey), closure(base, new Set(), new Set(), false));
  const staff = closure([...staffNodes].map(nodeKey));
  return [...staff].filter((f) => !others.has(f)).sort();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const files = staffOnlyFiles(root).map((f) => `/${f}`);
  const json = `${JSON.stringify({ fichiers: files })}\n`;
  for (const dir of [join(root, '.svelte-kit', 'output', 'client'), join(root, 'build', 'client')])
    if (existsSync(dir)) writeFileSync(join(dir, 'personnel.json'), json);
  console.log(`pages du personnel : ${files.length} fichiers hors du cache de l'élève`);
}
