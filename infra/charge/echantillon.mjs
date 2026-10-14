#!/usr/bin/env node
/**
 * Échantillonneur de ressources de la machine pendant un test de charge (démonstration, Linux, cgroup v2).
 *   node infra/charge/echantillon.mjs sortie.jsonl [intervalle_s=5]
 * Une ligne JSON par échantillon : CPU de la machine (% de 100 par cœur), charge, mémoire disponible, E/S disque,
 * octets réseau, CPU-secondes cumulées de chaque conteneur `awform-*` (cgroup), mémoire des conteneurs, connexions
 * PostgreSQL (total / actives). Arrêt : SIGTERM. Ne lit aucun secret ; ne modifie rien.
 */
import { appendFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const OUT = process.argv[2] ?? 'echantillon.jsonl';
const DT = Number(process.argv[3] ?? 5) * 1000;
const noms = ['caddy', 'web', 'api', 'worker', 'db', 'ecoute'].map((n) => `awform-${n}-1`);
const ids = Object.fromEntries(
  noms.map((n) => [n, execFileSync('docker', ['inspect', '-f', '{{.Id}}', n]).toString().trim()]),
);
const lire = (f) => readFileSync(f, 'utf8');
const cpuHote = () => {
  const l = lire('/proc/stat').split('\n')[0].split(/\s+/).slice(1).map(Number);
  return { total: l.reduce((a, b) => a + b, 0), idle: l[3] + l[4] };
};
const disque = () => {
  let lec = 0,
    ecr = 0;
  for (const l of lire('/proc/diskstats').split('\n')) {
    const c = l.trim().split(/\s+/);
    if (/^(sd[a-z]|vd[a-z]|nvme\d+n\d+)$/.test(c[2] ?? '')) {
      lec += Number(c[5]);
      ecr += Number(c[9]);
    }
  }
  return { lecMo: (lec * 512) / 1e6, ecrMo: (ecr * 512) / 1e6 };
};
const reseau = () => {
  let rx = 0,
    tx = 0;
  for (const l of lire('/proc/net/dev').split('\n').slice(2)) {
    const c = l.trim().split(/[:\s]+/);
    if (c[0] && c[0] !== 'lo' && !/^(veth|br-|docker)/.test(c[0])) {
      rx += Number(c[1]);
      tx += Number(c[9]);
    }
  }
  return { rxMo: rx / 1e6, txMo: tx / 1e6 };
};
const cg = (id, f) => lire(`/sys/fs/cgroup/system.slice/docker-${id}.scope/${f}`);
const pg = () => {
  try {
    const r = execFileSync(
      'docker',
      [
        'exec',
        'awform-db-1',
        'psql',
        '-U',
        'awform',
        '-d',
        'awform',
        '-tAF,',
        '-c',
        "select count(*), count(*) filter (where state='active') from pg_stat_activity where datname='awform'",
      ],
      { timeout: 4000 },
    )
      .toString()
      .trim()
      .split(',');
    return { total: Number(r[0]), actives: Number(r[1]) };
  } catch {
    return null;
  }
};
let prev = cpuHote();
let stop = false;
process.on('SIGTERM', () => (stop = true));
process.on('SIGINT', () => (stop = true));
while (!stop) {
  await new Promise((r) => setTimeout(r, DT));
  const c = cpuHote();
  const util = 100 * (1 - (c.idle - prev.idle) / (c.total - prev.total));
  prev = c;
  const mem = Object.fromEntries(
    lire('/proc/meminfo')
      .split('\n')
      .map((l) => l.split(/:\s+/))
      .filter((x) => x[1])
      .map((x) => [x[0], parseInt(x[1], 10)]),
  );
  const cont = {};
  for (const n of noms) {
    try {
      const us = Number(/usage_usec (\d+)/.exec(cg(ids[n], 'cpu.stat'))[1]);
      cont[n.replace(/^awform-|-1$/g, '')] = {
        cpuS: us / 1e6,
        memMo: Math.round(Number(cg(ids[n], 'memory.current')) / 1048576),
      };
    } catch {}
  }
  const la = lire('/proc/loadavg').split(' ');
  appendFileSync(
    OUT,
    JSON.stringify({
      t: new Date().toISOString(),
      cpuHotePct: Math.round(util * 10) / 10,
      charge1: Number(la[0]),
      memDispoMo: Math.round(mem.MemAvailable / 1024),
      swapUtiliseMo: Math.round((mem.SwapTotal - mem.SwapFree) / 1024),
      ...disque(),
      ...reseau(),
      conteneurs: cont,
      pg: pg(),
    }) + '\n',
  );
}
