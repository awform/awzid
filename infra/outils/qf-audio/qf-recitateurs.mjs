#!/usr/bin/env node
// Chantier A2 — diagnostic de l'audio EN LIGNE de Quran Foundation, avec les identifiants du client
// (jamais affichés). Liste les récitations verset par verset (/resources/recitations) et les récitateurs par
// sourate (/resources/chapter_reciters) de l'environnement, puis essaie al-Fātiḥa pour chaque récitateur du
// catalogue Awzid (packages/db/src/audio/qf-catalogue.ts) : nombre de fichiers, hôte de diffusion accepté.
// Usage (depuis la racine du dépôt, après « pnpm build ») :
//   env $(grep '^QF_' ~/.config/awform/prod.env | xargs) node infra/outils/qf-audio/qf-recitateurs.mjs
// QF_ENV=prelive (défaut) ou production. Aucune donnée n'est écrite (lecture seule, rien n'est gardé).
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
const env = process.env.QF_ENV ?? 'prelive';
const id = process.env.QF_CLIENT_ID;
const secret = process.env.QF_CLIENT_SECRET;
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
