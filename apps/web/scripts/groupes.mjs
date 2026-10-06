// Lot F5 (succède à personnel.mjs, A27) : GROUPES de fichiers de la coquille, calculés après `vite build`.
//  - « personnel » : pages de l'enseignant, de la direction et de l'administrateur (D-F2 9) ;
//  - « rares » : pages rares, utiles EN LIGNE seulement (offres, abonnement, inscription, certificats, protections
//    du compte, réglages du tuteur, garanties, errata, démonstration…) ;
//  - « enLigne » : modules chargés À LA DEMANDE qui ont de toute façon besoin du réseau (Muṣḥaf exact, tuteur,
//    « Donner mon avis » et sa capture d'écran).
// Aucun de ces fichiers n'est préchargé sur l'appareil d'un élève : le service worker les garde au premier usage.
// Un fichier atteint par une page de l'élève (imports statiques ou dynamiques, sauf les modules « enLigne ») n'est
// JAMAIS dans un groupe : le hors ligne de l'élève reste complet. Liste écrite dans `groupes.json` à la racine du
// site (lue par le service worker et par budget.mjs).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Préfixes des routes réservées au personnel. */
export const STAFF_ROUTES = ['/enseignant', '/admin'];
/** Pages rares, utiles en ligne seulement (gardées au premier usage, jamais préchargées). */
export const RARE_ROUTES = [
  '/abonnement',
  '/offres',
  '/garanties',
  '/activation',
  '/certificats',
  '/compte/protections',
  '/compte/tuteur',
  '/demo',
  '/inscription',
  '/errata',
];
/** Modules chargés à la demande ET qui ont besoin du réseau (chemin du fichier source). */
export const EN_LIGNE_MODULES = [
  /src\/lib\/quran\/LignesExactes\.svelte$/,
  /src\/lib\/TutorPanel\.svelte$/,
  /src\/lib\/avis\/AvisDialog\.svelte$/,
  /src\/lib\/avis\/capture\.ts$/,
];

const under = (r, prefixes) => prefixes.some((p) => r === p || r.startsWith(`${p}/`));

/** Routes du dictionnaire de SvelteKit avec leurs nœuds (racine, mises en page, page). */
export function readRoutes(root) {
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
  return routes;
}

export function groupFiles(root) {
  const client = join(root, '.svelte-kit', 'output', 'client');
  const manifest = JSON.parse(readFileSync(join(client, '.vite', 'manifest.json'), 'utf8'));
  const routes = readRoutes(root);
  const keyOf = (suffix) => Object.keys(manifest).find((k) => k.endsWith(suffix));
  const enLigneKeys = new Set(
    Object.entries(manifest)
      .filter(([k, e]) => e.isDynamicEntry && EN_LIGNE_MODULES.some((re) => re.test(e.src ?? k)))
      .map(([k]) => k),
  );
  // imports statiques et dynamiques — sauf ceux de l'application elle-même (app.js charge TOUS les nœuds à la
  // demande : les suivre rendrait chaque page « partagée ») et, si demandé, les modules « en ligne »
  const closure = (keys, { out = new Set(), dynamic = true, stop = new Set() } = {}) => {
    const seen = new Set();
    const visit = (k) => {
      if (!k || seen.has(k) || !manifest[k] || stop.has(k)) return;
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
  const kindOf = (r) =>
    under(r, STAFF_ROUTES) ? 'personnel' : under(r, RARE_ROUTES) ? 'rares' : 'eleve';
  const nodes = { personnel: new Set(), rares: new Set(), eleve: new Set() };
  const layouts = { personnel: new Set(), rares: new Set() };
  for (const r of routes) {
    const k = kindOf(r.route);
    nodes[k].add(r.nodes[r.nodes.length - 1]);
    for (const n of r.nodes.slice(0, -1)) (k === 'eleve' ? nodes.eleve : layouts[k]).add(n);
  }
  // une mise en page qui ne sert QU'À des pages d'un groupe (chargement de leurs textes) est à ce groupe
  for (const g of ['personnel', 'rares'])
    for (const n of layouts[g]) if (!nodes.eleve.has(n)) nodes[g].add(n);
  const base = [
    keyOf('/@sveltejs/kit/src/runtime/client/entry.js'),
    keyOf('client-optimized/app.js'),
  ];
  // tout ce que l'élève peut atteindre sans réseau (modules « en ligne » exclus)
  const eleve = closure([...nodes.eleve].map(nodeKey), {
    out: closure(base, { dynamic: false }),
    stop: enLigneKeys,
  });
  const staff = closure([...nodes.personnel].map(nodeKey));
  const rares = closure([...nodes.rares].map(nodeKey));
  const enLigne = closure([...enLigneKeys]);
  const pick = (set, ...minus) =>
    [...set].filter((f) => !eleve.has(f) && !minus.some((m) => m.has(f))).sort();
  return {
    personnel: pick(staff),
    rares: pick(rares, staff),
    enLigne: pick(enLigne, staff, rares),
  };
}

/** Compatibilité (A27) : fichiers propres aux pages du personnel. */
export const staffOnlyFiles = (root) => groupFiles(root).personnel;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const g = groupFiles(root);
  const json = `${JSON.stringify(
    Object.fromEntries(Object.entries(g).map(([k, l]) => [k, l.map((f) => `/${f}`)])),
  )}\n`;
  for (const dir of [join(root, '.svelte-kit', 'output', 'client'), join(root, 'build', 'client')])
    if (existsSync(dir)) writeFileSync(join(dir, 'groupes.json'), json);
  console.log(
    `hors du préchargement de l'élève : personnel ${g.personnel.length}, pages rares ${g.rares.length}, en ligne ${g.enLigne.length} fichiers`,
  );
}
