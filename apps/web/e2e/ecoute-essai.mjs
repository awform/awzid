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

// shazam_coran — « Retrouve ce verset » : ce que le service « entend » (texte Tanzil lu dans le fichier, jamais
// retapé), choisi par un marqueur que l'e2e met à la place de l'enregistrement (scenario=…) ; sans marqueur :
// Al-Ikhlāṣ 112:1-2 (passage unique)
const nus = (k, n = 99) =>
  T.get(k)
    .split(' ')
    .slice(0, n)
    .map((w, i) => ({ w, conf: 0.95, t0: i * 0.6, t1: i * 0.6 + 0.45 }));
const SCENARIOS = {
  // début identique en 11:77 et 29:31 : deux versets ex æquo
  egaux: () => ({ mots: nus('11:77', 3), voix_s: 6 }),
  // autre chose que le Coran (phrase ordinaire) : rien n'est montré
  rien: () => ({
    mots: ['سافر', 'التاجر', 'بالقطار', 'الى', 'مدينة', 'بعيدة'].map((w) => ({ w, conf: 0.9 })),
    voix_s: 6,
  }),
  // moins de 3 s de voix : aucune lecture
  court: () => ({ mots: [], voix_s: 2.1 }),
  unique: () => ({ mots: [...nus('112:1'), ...nus('112:2')], voix_s: 6 }),
};
// suivi de la récitation (mode « suivi ») : 1er morceau = mots provisoires ; 2e = les mêmes, STABLES, en deux
// lectures d'accord (le 3e mot oublié) ; ensuite, rien
const suivis = new Map();

const json = (res, code, body) => {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};
http
  .createServer((req, res) => {
    // le corps (audio) est lu puis oublié : rien n'est écrit (seul un marqueur d'essai éventuel est regardé)
    let debut = '';
    req.on('data', (b) => {
      if (debut.length < 64) debut += b.toString('latin1', 0, 64);
    });
    req.on('end', () => {
      const u = req.url ?? '';
      if (req.method === 'GET' && u === '/sante')
        return json(res, 200, { pret: true, modele: 'essai' });
      if (req.method === 'POST' && u === '/ecouter?mode=retrouver') {
        const sc = SCENARIOS[/scenario=(\w+)/.exec(debut)?.[1] ?? 'unique'] ?? SCENARIOS.unique;
        const r = sc();
        return json(res, 200, { ...r, mots_ctc: r.mots, voix: [], duree: 7, calcul: 0.1 });
      }
      if (req.method === 'POST' && u === '/ecouter')
        return json(res, 200, { mots, voix, duree: 3, calcul: 0.1 });
      const sv = /^\/direct\/([0-9a-f-]{36})\?mode=suivi$/.exec(u);
      if (sv && req.method === 'POST') {
        const n = (suivis.get(sv[1]) ?? 0) + 1;
        suivis.set(sv[1], n);
        const vide = { stables: [], stables_ctc: [], partiel: [], voix: [], t: n };
        if (n === 1) return json(res, 200, { ...vide, provisoires: mots, voix });
        if (n === 2)
          return json(res, 200, { ...vide, stables: mots, stables_ctc: mots, provisoires: [] });
        return json(res, 200, vide);
      }
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
        suivis.delete(d[1]);
        return json(res, 200, { ok: true });
      }
      json(res, 404, { error: { code: 'introuvable' } });
    });
  })
  .listen(port, '127.0.0.1');
