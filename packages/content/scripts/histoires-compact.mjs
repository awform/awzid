/**
 * « Histoire, de la création à nos jours » (4/11/2026, interrupteur `histoires`) : fabrique les fichiers COMPACTS servis à la demande
 * par l'API (`GET /api/v1/histoires/index` et `/recits/:id`) depuis les récits du référent (Markdown) et les manifestes de la narration.
 *  - Sections servies : en-tête (fiche), « Version adulte », « Version enfant », « Questions de compréhension ». « Sources… » et
 *    tout autre « ## » restent internes (jamais écrits).
 *  - Texte recopié tel quel ; versets (« > arabe [s:v] ») recopiés octet pour octet, jamais retapés ; le Markdown est converti ici
 *    en HTML ÉCHAPPÉ (gras, italique, arabe en ligne), chaque bloc garde sa ligne source (`l`) pour le lecteur audio.
 *  - Audio : manifestes `<narration>/<livre>/<récit>/<enfant|adulte>/manifest.json` (fichier + ligne ; entrées `verset` sans
 *    fichier = place d'une future récitation, gardées pour être sautées). Les MP3 ne sont JAMAIS ici : servis par le serveur.
 *  - Illustrations : seulement celles de Nouh (maquette validée), placées avant la ligne indiquée.
 * Usage : node packages/content/scripts/histoires-compact.mjs <dossier application> <dossier narration/out> [maquette nouh-v2.html]
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [APP, NARR, MAQ] = process.argv.slice(2);
if (!APP || !NARR)
  throw new Error('usage : histoires-compact.mjs <application> <narration/out> [maquette]');
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'histoires');

const LIVRES = [
  { id: 'l1', n: 1, t: 'De la création aux prophètes', dir: 'prophetes', audio: 'prophetes' },
  {
    id: 'l2',
    n: 2,
    t: 'Les belles histoires du Coran et de la Sunna',
    dir: 'histoire/livre2',
    audio: 'livre2',
  },
  { id: 'l3', n: 3, t: 'La Sīra', dir: 'sira', audio: null },
  { id: 'l4', n: 4, t: 'Les califes bien guidés', dir: 'histoire/livre4', audio: 'livre4' },
  {
    id: 'l5',
    n: 5,
    t: "La civilisation musulmane jusqu'aux temps modernes",
    dir: 'histoire/livre5',
    audio: 'livre5',
  },
];
const RECIT = /^((\d\d)|([SHCV])(\d\d))([A-Za-z]?)_[a-z0-9_]+\.md$/;
/** ordre : numéro, puis la lettre (S01 < S01B ; H38 < H38a…) */
const cle = (f) => {
  const m = RECIT.exec(f);
  return [Number(m[2] ?? m[4]), (m[5] || '').toLowerCase()];
};

const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const AR = new RegExp(
  '[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDF9\uFE70-\uFEFF](?:[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDF9\uFE70-\uFEFF\\s\u200c\u200d]*[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDF9\uFE70-\uFEFF])?',
  'g',
);
function inline(s) {
  let h = esc(s.trim());
  h = h.replace(/\[([^\]]+)\]\((?:[^)]+)\)/g, '$1'); // liens : le texte seul
  h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/(^|[^*\w])\*(?!\s)(.+?)\*(?!\w)/g, '$1<em>$2</em>');
  h = h.replace(/(^|[\s(«])_(?!\s)(.+?)_(?=[\s.,;:!?)»]|$)/g, '$1<em>$2</em>');
  h = h.replace(/`([^`]+)`/g, '$1');
  h = h.replace(AR, (a) => `<span class="ar-in" lang="ar" dir="rtl">${a}</span>`);
  return h;
}
const VERSET = /^(.*\S)\s+\[(\d{1,3}:\d{1,3}(?:-\d{1,3})?)\]\s*$/;
const aDeLArabe = (s) => /[؀-ۿ]/.test(s);

/** blocs d'une section ; `lignes` = [{l, t}] */
function blocs(lignes) {
  const out = [];
  let i = 0;
  while (i < lignes.length) {
    const { l, t } = lignes[i];
    if (!t.trim() || /^-{3,}\s*$/.test(t)) {
      i++;
      continue;
    }
    let m;
    if ((m = /^(#{3,6})\s+(.*)$/.exec(t))) {
      out.push({ k: m[1].length === 3 ? 'h' : 'h4', l, h: inline(m[2]) });
      i++;
      continue;
    }
    if (t.startsWith('>')) {
      const g = [];
      while (i < lignes.length && lignes[i].t.startsWith('>')) {
        g.push({ l: lignes[i].l, t: lignes[i].t.replace(/^>\s?/, '') });
        i++;
      }
      const vers = g.filter((x) => VERSET.test(x.t) && aDeLArabe(x.t));
      if (vers.length) {
        const b = { k: 'coran', l: g[0].l, ar: [], sens: [] };
        for (const x of g) {
          if (!x.t.trim()) continue;
          const v = VERSET.exec(x.t);
          if (v && aDeLArabe(x.t)) b.ar.push({ l: x.l, t: v[1], ref: v[2] });
          else {
            const s = /^Sens\s*:\s*(.*)$/.exec(x.t.trim());
            b.sens.push({ l: x.l, h: s ? inline(s[1]) : inline(x.t), s: s ? 1 : 0 });
          }
        }
        out.push(b);
      } else {
        const p = [];
        let cur = null;
        for (const x of g) {
          if (!x.t.trim()) {
            cur = null;
            continue;
          }
          if (!cur) p.push((cur = { l: x.l, t: x.t }));
          else cur.t += ' ' + x.t.trim();
        }
        out.push({ k: 'bq', l: g[0].l, p: p.map((x) => ({ l: x.l, h: inline(x.t) })) });
      }
      continue;
    }
    if (t.startsWith('|')) {
      const rows = [];
      const l0 = l;
      let head = false;
      while (i < lignes.length && lignes[i].t.startsWith('|')) {
        const c = lignes[i].t
          .trim()
          .replace(/^\||\|$/g, '')
          .split('|');
        if (c.every((x) => /^\s*:?-{2,}:?\s*$/.test(x))) head = rows.length === 1;
        else rows.push(c.map((x) => inline(x)));
        i++;
      }
      out.push({ k: 'table', l: l0, head, rows });
      continue;
    }
    if ((m = /^(\s*)([-*]|\d+[.)])\s+(.*)$/.exec(t))) {
      const ol = /\d/.test(m[2]);
      const items = [];
      while (i < lignes.length) {
        const x = lignes[i];
        const mm = /^(\s*)([-*]|\d+[.)])\s+(.*)$/.exec(x.t);
        if (mm && mm[1].length === 0) items.push({ l: x.l, t: mm[3], suite: [] });
        else if (x.t.trim() && /^\s+/.test(x.t) && items.length)
          items[items.length - 1].suite.push({ l: x.l, t: x.t.trim() });
        else break;
        i++;
      }
      out.push({
        k: ol ? 'ol' : 'ul',
        items: items.map((x) => ({
          l: x.l,
          h: inline([x.t, ...x.suite.map((s) => s.t)].join(' ')),
        })),
      });
      continue;
    }
    const p = { k: 'p', l, t };
    i++;
    while (
      i < lignes.length &&
      lignes[i].t.trim() &&
      !/^(#|>|\||[-*]\s|\d+[.)]\s|-{3,})/.test(lignes[i].t)
    ) {
      p.t += ' ' + lignes[i].t.trim();
      i++;
    }
    out.push({ k: 'p', l: p.l, h: inline(p.t) });
  }
  return out;
}

function questions(lignes) {
  const q = [];
  for (const { l, t } of lignes) {
    const m = /^\d+[.)]\s+(.*)$/.exec(t);
    if (m) q.push({ l, h: inline(m[1]) });
    else if (t.trim() && q.length) {
      const r = /^\s*Réponse\s*:\s*(.*)$/.exec(t);
      const last = q[q.length - 1];
      if (r) Object.assign(last, { rl: l, r: inline(r[1]) });
      else if (last.r) last.r += ' ' + inline(t);
      else last.h += ' ' + inline(t);
    }
  }
  return q;
}

/** premières lignes de bloc (pour l'audio) */
function lignesDeBlocs(bs) {
  const s = [];
  for (const b of bs) {
    if (b.k === 'ul' || b.k === 'ol') b.items.forEach((x) => s.push(x.l));
    else if (b.k === 'coran') {
      b.sens.forEach((x) => s.push(x.l));
      if (b.ar.length) s.push(b.l);
    } else if (b.k === 'bq') b.p.forEach((x) => s.push(x.l));
    else s.push(b.l);
  }
  return s.sort((a, b) => a - b);
}

function manifeste(chemin, debut, fin, rapport, nom) {
  if (!existsSync(chemin)) return null;
  const m = JSON.parse(readFileSync(chemin, 'utf8'));
  const items = [];
  let hors = 0;
  for (const p of m.paragraphes) {
    if (typeof p.ligne !== 'number') continue;
    if (p.ligne < debut || p.ligne > fin) hors++;
    if (p.fichier) {
      if (!/^p\d{3}\.mp3$/.test(p.fichier))
        throw new Error(`${nom} : fichier audio inattendu ${p.fichier}`);
      items.push({ f: p.fichier, l: p.ligne });
    } else if (p.verset) items.push({ v: String(p.verset), l: p.ligne });
  }
  if (hors) {
    rapport.push(
      `${nom} : ${hors} entrée(s) hors de la section (lignes ${debut}-${fin}) : audio écarté`,
    );
    return null;
  }
  return items;
}

/** illustrations de Nouh, prises dans la maquette validée (ordre : 3 enfant, 2 adulte) */
function illusNouh() {
  if (!MAQ || !existsSync(MAQ)) return [];
  const html = readFileSync(MAQ, 'utf8');
  const figs = [...html.matchAll(/<figure(?: class="([^"]*)")?>([\s\S]*?)<\/figure>/g)].map((f) => [
    f[0],
    f[1] ?? '',
    f[2],
  ]);
  const avant = [
    ['enfant', 166],
    ['enfant', 186],
    ['enfant', 198],
    ['adulte', 3],
    ['adulte', 122],
  ];
  if (figs.length !== avant.length)
    throw new Error(`maquette : ${figs.length} figures (5 attendues)`);
  return figs.map((f, i) => {
    const svg = /<svg[\s\S]*<\/svg>/.exec(f[2])[0];
    const cap = /<figcaption>([\s\S]*?)<\/figcaption>/.exec(f[2]);
    if (/<script|on\w+=/i.test(svg)) throw new Error('maquette : SVG non sûr');
    return {
      v: avant[i][0],
      avant: avant[i][1],
      vignette: f[1].includes('vignette') ? 1 : 0,
      svg,
      cap: cap ? cap[1].trim() : '',
    };
  });
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const rapport = [];
const index = { livres: [] };
let total = 0;
for (const L of LIVRES) {
  const fichiers = readdirSync(join(APP, L.dir))
    .filter((f) => RECIT.test(f))
    .sort((a, b) => {
      const [x, y] = [cle(a), cle(b)];
      return x[0] - y[0] || x[1].localeCompare(y[1]);
    });
  const liste = [];
  for (const f of fichiers) {
    const id = f.replace(/\.md$/, '');
    const src = readFileSync(join(APP, L.dir, f), 'utf8')
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/);
    const titre = src[0]
      .replace(/^#\s+/, '')
      .replace(/^[0-9]{2}[A-Za-z]?\.\s*|^[SHCV][0-9]{2}[A-Za-z]?\.\s*/, '')
      .trim();
    const sections = {};
    let cur = 'tete';
    sections[cur] = [];
    src.forEach((t, k) => {
      if (k === 0) return;
      const h = /^##\s+(.*)$/.exec(t);
      if (h) {
        const n = h[1].trim();
        cur = /^Version adulte/.test(n)
          ? 'adulte'
          : /^Version enfant/.test(n)
            ? 'enfant'
            : /^Questions de compr/.test(n)
              ? 'questions'
              : null;
        if (cur) sections[cur] = [];
        sections[`_${cur}_debut`] = k + 1;
        return;
      }
      if (cur) sections[cur].push({ l: k + 1, t });
    });
    if (!sections.adulte && !sections.enfant) {
      rapport.push(`${id} : pas un récit (aucune version), ignoré`);
      continue;
    }
    for (const s of ['adulte', 'enfant', 'questions'])
      if (!sections[s] || !sections[s].length) throw new Error(`${id} : section ${s} absente`);
    const tete = blocs(sections.tete);
    const fiche = tete.filter((b) => b.k === 'ul').flatMap((b) => b.items);
    const nomAr = (() => {
      const n = sections.tete.find((x) => /^\s*-\s+\*\*Nom\*\*/.test(x.t));
      const a = n && n.t.match(AR);
      return a ? a[0] : null;
    })();
    const r = {
      id,
      livre: L.id,
      titre,
      ar: nomAr,
      fiche,
      adulte: blocs(sections.adulte),
      enfant: blocs(sections.enfant),
      questions: questions(sections.questions),
    };
    const borne = (s) => [sections[s][0].l, sections[s][sections[s].length - 1].l];
    if (L.audio) {
      const base = join(NARR, L.audio, id);
      const a = {};
      for (const v of ['enfant', 'adulte']) {
        const [d, fin] = borne(v);
        const it = manifeste(join(base, v, 'manifest.json'), d, fin, rapport, `${id}/${v}`);
        if (it) {
          // chaque entrée doit tomber sur un bloc de la version
          const ls = lignesDeBlocs(r[v]);
          const sans = it.filter((x) => !ls.some((y) => y <= x.l));
          if (sans.length) rapport.push(`${id}/${v} : ${sans.length} entrée(s) sans bloc`);
          a[v === 'enfant' ? 'e' : 'a'] = it;
        } else if (!existsSync(join(base, v, 'manifest.json')))
          rapport.push(`${id}/${v} : pas d'audio`);
      }
      if (a.e || a.a) r.audio = a;
    }
    if (id === '03_nouh') r.illus = illusNouh();
    writeFileSync(join(OUT, `${id}.json`), JSON.stringify(r));
    liste.push({ id, t: titre, e: r.audio?.e ? 1 : 0, a: r.audio?.a ? 1 : 0 });
    total++;
  }
  index.livres.push({ id: L.id, n: L.n, t: L.t, r: liste });
}
writeFileSync(join(OUT, 'index.json'), JSON.stringify(index));
console.log(`histoires : ${total} récits`);
for (const x of rapport) console.log(' - ' + x);
