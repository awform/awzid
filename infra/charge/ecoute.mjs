#!/usr/bin/env node
/**
 * Essai de CHARGE de l'écoute IA (démonstration privée, comptes fictifs `charge-<n>@demo.awform.test`), sans surcharger :
 * des sessions d'écoute simultanées (1, 2, 4) envoient chacune un court enregistrement SYNTHÉTIQUE (un fichier audio de
 * leçon, voix de synthèse : aucune voix humaine, aucun enfant) à `/profiles/:id/ecoute/verifier`, puis une séance « en
 * direct » (morceaux PCM de silence). Mesure latence de bout en bout et réponses (429 / 503 / 409).
 *   AWFORM_CHARGE_SORTIE=ecoute.json node infra/charge/ecoute.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { percentile } from './parcours.mjs';

const BASE = process.env.AWFORM_CHARGE_URL ?? 'http://127.0.0.1';
if (!['127.0.0.1', 'localhost'].includes(new URL(BASE).hostname))
  throw new Error('démonstration locale seulement');
const PW = readFileSync(`${homedir()}/.awzid-charge/pw`, 'utf8').trim();
const API = `${BASE}/api/v1`;
const H = { 'content-type': 'application/json', 'x-awform': '1' };
const NIVEAUX = (process.env.AWFORM_CHARGE_ECOUTE ?? '1,2,4').split(',').map(Number);
const PAR_UV = Number(process.env.AWFORM_CHARGE_ECOUTE_REQ ?? 3);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function session(n) {
  const l = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ email: `charge-${n}@demo.awform.test`, password: PW }),
  });
  const ck = (l.headers.get('set-cookie') ?? '').split(';')[0];
  const me = await (await fetch(`${API}/auth/me`, { headers: { ...H, cookie: ck } })).json();
  const pid = me.profiles[0].id;
  const a = await fetch(`${API}/profiles/${pid}/ecoute/accord`, {
    method: 'POST',
    headers: { ...H, cookie: ck },
    body: '{}',
  });
  if (!a.ok) throw new Error(`accord ${a.status}`);
  return { ck, pid };
}

async function main() {
  const s0 = await session(0);
  const aud = (
    await (
      await fetch(`${API}/lecons-audio/niveaux/ad5`, { headers: { ...H, cookie: s0.ck } })
    ).json()
  ).fichiers;
  // un fichier de 8 à 20 s environ (≈ 60 à 160 Ko en mp3 à 64 kbit/s) : on prend le premier dans la fourchette
  let mp3 = null;
  for (const f of aud.slice(0, 400)) {
    const r = await fetch(`${API}/lecons-audio/fichiers/${f}.mp3`, {
      headers: { ...H, cookie: s0.ck },
    });
    const b = Buffer.from(await r.arrayBuffer());
    if (b.length > 70_000 && b.length < 160_000) {
      mp3 = b;
      break;
    }
  }
  if (!mp3) throw new Error('aucun fichier de la taille voulue');
  const sorties = [];
  for (const uv of NIVEAUX) {
    const sess = await Promise.all(Array.from({ length: uv }, (_, i) => session(i)));
    const t0 = Date.now();
    const durees = [];
    const statuts = {};
    const corps = [];
    await Promise.all(
      sess.map(async (s) => {
        for (let k = 0; k < PAR_UV; k++) {
          const t = performance.now();
          const r = await fetch(`${API}/profiles/${s.pid}/ecoute/verifier?s=1&from=1&to=2`, {
            method: 'POST',
            headers: { ...H, 'content-type': 'audio/mpeg', cookie: s.ck },
            body: mp3,
          });
          const txt = await r.text();
          durees.push(performance.now() - t);
          statuts[r.status] = (statuts[r.status] ?? 0) + 1;
          if (corps.length < 2) corps.push(txt.slice(0, 160));
        }
      }),
    );
    const sd = durees.sort((a, b) => a - b);
    sorties.push({
      sessions: uv,
      requetes: sd.length,
      statuts,
      p50: Math.round(percentile(sd, 50)),
      p95: Math.round(percentile(sd, 95)),
      max: Math.round(sd.at(-1)),
      debut: new Date(t0).toISOString(),
      fin: new Date().toISOString(),
      exemple: corps,
    });
    process.stderr.write(`écoute ${uv} session(s) : ${JSON.stringify(sorties.at(-1))}\n`);
    await sleep(10_000);
  }
  // séance en direct : 8 morceaux PCM de 4 s de silence
  const s = await session(3);
  const t = performance.now();
  const d = await fetch(`${API}/profiles/${s.pid}/ecoute/direct?s=1&from=1&to=2`, {
    method: 'POST',
    headers: { ...H, cookie: s.ck },
    body: '{}',
  });
  const dj = await d.json().catch(() => ({}));
  const direct = { demarrage: d.status, ms: Math.round(performance.now() - t), morceaux: [] };
  if (dj.sid) {
    const pcm = Buffer.alloc(4 * 2 * 16000);
    for (let i = 0; i < 8; i++) {
      const tt = performance.now();
      const r = await fetch(`${API}/ecoute/direct/${dj.sid}`, {
        method: 'POST',
        headers: { ...H, 'content-type': 'application/octet-stream', cookie: s.ck },
        body: pcm,
      });
      await r.arrayBuffer();
      direct.morceaux.push({ s: r.status, ms: Math.round(performance.now() - tt) });
    }
    await fetch(`${API}/ecoute/direct/${dj.sid}`, {
      method: 'DELETE',
      headers: { ...H, cookie: s.ck },
    });
  }
  sorties.push({ direct });
  writeFileSync(
    process.env.AWFORM_CHARGE_SORTIE ?? 'ecoute.json',
    JSON.stringify({ taille_mp3: mp3.length, sorties }, null, 1),
  );
  console.log(JSON.stringify({ taille_mp3: mp3.length, sorties }, null, 1));
}
main().catch((e) => {
  console.error(e);
  process.exit(2);
});
