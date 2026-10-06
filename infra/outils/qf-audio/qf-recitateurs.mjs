#!/usr/bin/env node
// Chantier A2 — diagnostic de l'audio EN LIGNE de Quran Foundation, avec les identifiants du client
// (jamais affichés). Liste les récitations verset par verset (/resources/recitations) et les récitateurs par
// sourate (/resources/chapter_reciters) de l'environnement, puis essaie al-Fātiḥa pour chaque récitateur du
// catalogue Awzid (packages/db/src/audio/qf-catalogue.ts) : nombre de fichiers, hôte de diffusion accepté.
// Usage (depuis la racine du dépôt, après « pnpm build ») : node infra/outils/qf-audio/qf-recitateurs.mjs
// Secret : ~/.config/awform/qf.env (droits 600 ; autre chemin : AWFORM_QF_SECRET), ou variables QF_CLIENT_ID,
// QF_CLIENT_SECRET, QF_ENV (prelive par défaut, ou production). Lecture seule : rien n'est écrit ni gardé.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { QF_CATALOGUE } from '../../../packages/db/dist/audio/qf-catalogue.js';

const QF = {
  prelive: {
    oauth: 'https://prelive-oauth2.quran.foundation/oauth2/token',
    api: 'https://apis-prelive.quran.foundation',
  },
  production: {
    oauth: 'https://oauth2.quran.foundation/oauth2/token',
    api: 'https://apis.quran.foundation',
  },
};
const HOSTS = [
  'verses.quran.foundation',
  'verses.quran.com',
  'audio.qurancdn.com',
  'mirrors.quranicaudio.com',
  'download.quranicaudio.com',
];
// secret : variables d'environnement, sinon le fichier de déploiement (LU, jamais exécuté ; droits 600)
const SECRET_FILE = process.env.AWFORM_QF_SECRET ?? join(homedir(), '.config', 'awform', 'qf.env');
const fromFile = {};
if (!process.env.QF_CLIENT_ID && existsSync(SECRET_FILE)) {
  if ((statSync(SECRET_FILE).mode & 0o777) !== 0o600)
    throw new Error(`${SECRET_FILE} doit avoir les droits 600`);
  for (const line of readFileSync(SECRET_FILE, 'utf8').split('\n')) {
    const m = /^(QF_CLIENT_ID|QF_CLIENT_SECRET|QF_ENV)=(.*)$/.exec(line.trim());
    if (m) fromFile[m[1]] = m[2];
  }
}
const env = process.env.QF_ENV ?? fromFile.QF_ENV ?? 'prelive';
const id = process.env.QF_CLIENT_ID ?? fromFile.QF_CLIENT_ID;
const secret = process.env.QF_CLIENT_SECRET ?? fromFile.QF_CLIENT_SECRET;
if (!QF[env]) throw new Error(`QF_ENV inconnu : ${env}`);
if (!id || !secret)
  throw new Error('QF_CLIENT_ID et QF_CLIENT_SECRET sont requis (variables d’environnement)');

const tr = await fetch(QF[env].oauth, {
  method: 'POST',
  headers: {
    authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
    'content-type': 'application/x-www-form-urlencoded',
  },
  body: 'grant_type=client_credentials&scope=content',
});
if (!tr.ok) throw new Error(`jeton refusé : HTTP ${tr.status}`);
const token = (await tr.json()).access_token;
const get = async (path) => {
  const r = await fetch(`${QF[env].api}/content/api/v4${path}`, {
    headers: { 'x-auth-token': token, 'x-client-id': id, accept: 'application/json' },
  });
  return { status: r.status, body: r.ok ? await r.json() : null };
};
const host = (u) => {
  try {
    return new URL(
      u.startsWith('//')
        ? `https:${u}`
        : /^https?:/.test(u)
          ? u
          : `https://verses.quran.foundation/${u}`,
    ).hostname;
  } catch {
    return '?';
  }
};

console.log(`Environnement QF : ${env}\n`);
const rec = await get('/resources/recitations?language=ar');
console.log(`Récitations verset par verset (HTTP ${rec.status}) :`);
for (const r of rec.body?.recitations ?? [])
  console.log(
    `  ${String(r.id).padStart(4)}  ${r.reciter_name}${r.style ? ` (${r.style})` : ''} — ${r.translated_name?.name ?? ''}`,
  );
const ch = await get('/resources/chapter_reciters?language=en');
console.log(
  `\nRécitateurs par sourate (HTTP ${ch.status}) — fichiers de sourate entière, minutage par verset :`,
);
for (const r of ch.body?.reciters ?? [])
  console.log(
    `  ${String(r.id).padStart(4)}  ${r.name ?? r.reciter_name}${r.style?.name ? ` (${r.style.name})` : ''}${r.qirat?.name ? ` — ${r.qirat.name}` : ''}`,
  );

console.log('\nCatalogue Awzid — al-Fātiḥa :');
let bad = 0;
for (const m of QF_CATALOGUE) {
  const rid = m.qf[env];
  if (rid === null) {
    console.log(`  ${m.id.padEnd(24)} non proposé dans cet environnement`);
    continue;
  }
  const r = await get(`/recitations/${rid}/by_chapter/1?per_page=50&page=1`);
  const files = r.body?.audio_files ?? [];
  const hosts = [...new Set(files.map((f) => host(f.url)))];
  const ok = r.status === 200 && files.length === 7 && hosts.every((h) => HOSTS.includes(h));
  if (!ok) bad++;
  console.log(
    `  ${m.id.padEnd(24)} id ${String(rid).padStart(3)} : HTTP ${r.status}, ${files.length}/7 fichiers, hôte ${hosts.join(', ') || '—'} ${ok ? 'OK' : 'À VOIR'}`,
  );
}
console.log(bad ? `\n${bad} récitateur(s) à voir.` : '\nTout est conforme.');
process.exitCode = bad ? 1 : 0;
