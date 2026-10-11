// A5 — service d'écoute FACTICE des e2e (aucun modèle, rien n'est gardé) : il « entend » le texte Tanzil
// d'Al-Ikhlāṣ (112:1-4, lu dans le fichier des livres, jamais retapé) SANS son 3e mot, pour vérifier le
// surlignage d'un mot oubli\u00E9. M\u00EAme interface que services/ecoute-ia (sante, ecouter, direct).
//   node e2e/ecoute-essai.mjs <port>
import { existsSync, readFileSync } from 'node:fs';
import http from 'node:http';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { motsAttendus } from '../../../packages/hifz/dist/index.js';

const port = Number(process.argv[2] ?? 3111);
const dir = process.env.AWFORM_CONTENT_DIR ?? join(homedir(), 'awform-content');
const tsv = [
  join(dir, 'coran', 'tanzil-uthmani.tsv'),
  fileURLToPath(
    new URL('../../../infra/ci/contenu-synthetique/coran/tanzil-uthmani.tsv', import.meta.url),
  ),
].find((f) => existsSync(f));
const T = new Map();
for (const l of readFileSync(tsv, 'utf8')
  .replace(/^\uFEFF/, '')
  .split('\n')) {
  const x = l.replace(/\r$/, '');
  const t = x.indexOf('\t');
  if (t > 0) T.set(x.slice(0, t).trim(), x.slice(t + 1).replace(/^\uFEFF/, ''));
}
const att = motsAttendus(
  [1, 2, 3, 4].map((a) => ({ s: 112, a, text: T.get(`112:${a}`) })),
  T.get('1:1'),
).filter((m) => !m.facultatif && !m.lettres);
const OUBLI = 2;
const mots = att
  .filter((_, n) => n !== OUBLI)
  .map((m, n) => ({ w: m.cle, conf: 0.95, t0: n * 0.6, t1: n * 0.6 + 0.45 }));
const voix = mots.map((m) => [m.t0, m.t1]);
const seances = new Set();

const json = (res, code, body) => {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};
http
  .createServer((req, res) => {
    // le corps (audio) est lu puis ignoré : rien n'est écrit
    req.on('data', () => {});
    req.on('end', () => {
      const u = req.url ?? '';
      if (req.method === 'GET' && u === '/sante')
        return json(res, 200, { pret: true, modele: 'essai' });
      if (req.method === 'POST' && u === '/ecouter')
        return json(res, 200, { mots, voix, duree: 3, calcul: 0.1 });
      const d = /^\/direct\/([0-9a-f-]{36})$/.exec(u);
      if (d && req.method === 'POST') {
        const premier = !seances.has(d[1]);
        seances.add(d[1]);
        return json(res, 200, {
          mots: premier ? mots : [],
          partiel: [],
          voix: premier ? voix : [],
          t: 1,
        });
      }
      if (d && req.method === 'DELETE') {
        seances.delete(d[1]);
        return json(res, 200, { ok: true });
      }
      json(res, 404, { error: { code: 'introuvable' } });
    });
  })
  .listen(port, '127.0.0.1');
