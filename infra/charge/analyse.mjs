#!/usr/bin/env node
/**
 * Dépouille un essai de charge : résultats `parcours.mjs` (JSON) + échantillons `echantillon.mjs` (JSONL) → tableaux Markdown.
 *   node infra/charge/analyse.mjs <resultats.json> <echantillon.jsonl>
 * Par palier : requêtes, req/s, erreurs, p50/p95/p99 ; CPU de la machine (moyenne, max), CPU-secondes par conteneur
 * pendant la fenêtre mesurée (donc en « cœurs » moyens), mémoire de pointe, connexions PostgreSQL (pic), E/S disque.
 */
import { readFileSync } from 'node:fs';
const res = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const ech = readFileSync(process.argv[3], 'utf8')
  .trim()
  .split('\n')
  .map((l) => JSON.parse(l))
  .map((e) => ({ ...e, ms: Date.parse(e.t) }));
const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;
const noms = ['caddy', 'web', 'api', 'db', 'worker', 'ecoute'];
const lignes = [];
const g = [];
g.push(
  '| UV | scénario | requêtes | req/s | erreurs % | p50 ms | p95 ms | p99 ms | max ms | CPU machine moy. / max % | cœurs moy. : caddy / web / api / db / écoute | mémoire api / db Mo (pic) | connexions PG (pic / actives) | générateur (cœurs) |',
);
g.push('|---:|---|---:|---:|---:|---:|---:|---:|---:|---|---|---|---|---:|');
for (const p of res.paliers) {
  const a = Date.parse(p.debut);
  const b = Date.parse(p.fin);
  const w = ech.filter((e) => e.ms >= a - 2500 && e.ms <= b + 2500);
  if (w.length < 2) {
    g.push(
      `| ${p.uv} | ${p.scenario} | ${p.global.n} | ${p.global.rps} | ${p.global.tauxErreur} | ${p.global.p50} | ${p.global.p95} | ${p.global.p99} | ${p.global.max} | (pas d'échantillon) | | | | |`,
    );
    continue;
  }
  const d = (nom) => {
    const x = w[0].conteneurs[nom]?.cpuS;
    const y = w.at(-1).conteneurs[nom]?.cpuS;
    return x == null || y == null ? 0 : (y - x) / ((w.at(-1).ms - w[0].ms) / 1000);
  };
  const cpu = w.map((e) => e.cpuHotePct);
  const pic = (f) => Math.max(...w.map(f));
  g.push(
    `| ${p.uv} | ${p.scenario} | ${p.global.n} | ${p.global.rps} | ${p.global.tauxErreur} | ${p.global.p50} | ${p.global.p95} | ${p.global.p99} | ${p.global.max} | ${r1(cpu.reduce((s, x) => s + x, 0) / cpu.length)} / ${r1(Math.max(...cpu))} | ${['caddy', 'web', 'api', 'db', 'ecoute'].map((n) => r2(d(n))).join(' / ')} | ${pic((e) => e.conteneurs.api?.memMo ?? 0)} / ${pic((e) => e.conteneurs.db?.memMo ?? 0)} | ${pic((e) => e.pg?.total ?? 0)} / ${pic((e) => e.pg?.actives ?? 0)} | ${r2(p.generateurCpuS / p.duree)} |`,
  );
}
lignes.push('### Synthèse par palier\n', ...g, '');
for (const p of res.paliers) {
  lignes.push(`### Palier ${p.uv} UV (${p.scenario}) — routes (triées par volume)\n`);
  lignes.push(
    '| route | n | req/s | err | p50 | p95 | p99 | max |',
    '|---|---:|---:|---:|---:|---:|---:|---:|',
  );
  for (const r of p.routes)
    lignes.push(
      `| ${r.route} | ${r.n} | ${r.rps} | ${r.erreurs} | ${r.p50} | ${r.p95} | ${r.p99} | ${r.max} |`,
    );
  lignes.push(
    '',
    'Courbe (fenêtres de 10 s) : ' +
      p.fenetres.map((f) => `${f.t}s:${f.rps}/s p95=${f.p95}`).join(' ; '),
    '',
  );
}
console.log(lignes.join('\n'));
