/**
 * « Histoire, de la création à nos jours » (4/11/2026, interrupteur `histoires`) : fabrique les fichiers COMPACTS servis à la demande
 * par l'API (`GET /api/v1/histoires/index` et `/recits/:id`) depuis les récits du référent (Markdown) et les manifestes de la narration.
 *  - Sections servies : en-tête (fiche), « Version adulte », « Version enfant », « Questions de compréhension ». « Sources… » et
 *    tout autre « ## » restent internes (jamais écrits).
 *  - Texte recopié tel quel ; versets (« > arabe [s:v] ») recopiés octet pour octet, jamais retapés ; le Markdown est converti ici
 *    en HTML ÉCHAPPÉ (gras, italique, arabe en ligne), chaque bloc garde sa ligne source (`l`) pour le lecteur audio.
 *  - Audio : manifestes `<narration>/<livre>/<récit>/<enfant|adulte>/manifest.json` (fichier + ligne ; entrées `verset` sans
 *    fichier = place d'une future récitation, gardées pour être sautées). Les MP3 ne sont JAMAIS ici : servis par le serveur.
 *  - Illustrations (5/11) : `<application>/histoire/illustrations/<prophetes|livre2>/<récit>/placement.json` (`apres_ligne` :
 *    ligne du .md après laquelle l'image se place ; `enfant-n.svg` / `adulte-n.svg` ; format 1:1 = vignette), SVG recopiés tels
 *    quels dans le récit (servis avec lui, jamais précachés) ; à défaut, Nouh garde les figures de la maquette validée.
 *  - Avertissement au lecteur (5/11) : `00_avertissement` (texte de `histoire/AVERTISSEMENT_LECTEUR.md`, mis en page et
 *    lignes du manifeste par `<narration>/../src/commun/00_avertissement.md`, contrôlé paragraphe par paragraphe), en tête de
 *    chaque livre (`index.av`) ; audio `commun/00_avertissement/<enfant|adulte>`.
 *  - Cycle de Mūsā (5/11) : `index.livres[l2].cycle`, ordre de lecture de `histoire/CYCLE_MOUSSA.md` (§ 2), avec le renvoi
 *    vers `16_moussa` du livre 1 à sa place.
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

const mots = (s) =>
  new Set(
    s
      .toLowerCase()
      .split(/[^\p{L}]+/u)
      .filter((w) => w.length >= 4),
  );
/** part des mots du passage audio présents dans le paragraphe du .md qui commence à la ligne l */
function accord(src, l, texte) {
  if (!src || l < 1 || l > src.length || !src[l - 1].trim()) return 0;
  let para = '';
  for (let k = l - 1; k < src.length && src[k].trim(); k++) para += ' ' + src[k];
  const a = mots(texte);
  if (!a.size) return 1;
  const b = mots(para);
  return [...a].filter((w) => b.has(w)).length / a.size;
}

/**
 * `src` : lignes du .md. 5/11 : quand la version adulte a été réécrite (passages sensibles) sans que la version enfant change,
 * le manifeste enfant garde les lignes d'avant ; on le réaligne d'un décalage constant, seulement si chaque passage retrouve
 * son texte (accord des mots ≥ 0,6 en moyenne, ≥ 0,3 pour chacun) ; sinon l'audio est écarté.
 */
function manifeste(chemin, debut, fin, rapport, nom, src) {
  if (!existsSync(chemin)) return null;
  const m = JSON.parse(readFileSync(chemin, 'utf8'));
  const ps = m.paragraphes.filter((p) => typeof p.ligne === 'number');
  const hors = (dl) => ps.filter((p) => p.ligne + dl < debut || p.ligne + dl > fin).length;
  let delta = 0;
  if (hors(0) && src) {
    let meilleur = null;
    for (let dl = -60; dl <= 60; dl++) {
      if (!dl || hors(dl)) continue;
      const sc = ps.filter((p) => p.fichier).map((p) => accord(src, p.ligne + dl, p.texte ?? ''));
      const moy = sc.reduce((x, y) => x + y, 0) / (sc.length || 1);
      if (sc.length && Math.min(...sc) >= 0.3 && moy >= 0.6 && (!meilleur || moy > meilleur.moy))
        meilleur = { dl, moy };
    }
    if (meilleur) {
      delta = meilleur.dl;
      rapport.push(
        `${nom} : manifeste réaligné de ${delta > 0 ? '+' : ''}${delta} ligne(s) (accord ${meilleur.moy.toFixed(2)})`,
      );
    }
  }
  if (src && !hors(delta)) {
    const sc = ps.filter((p) => p.fichier).map((p) => accord(src, p.ligne + delta, p.texte ?? ''));
    const moy = sc.reduce((x, y) => x + y, 0) / (sc.length || 1);
    if (moy < 0.6) rapport.push(`${nom} : ATTENTION accord texte/audio faible (${moy.toFixed(2)})`);
  }
  const items = [];
  for (const p of ps) {
    if (p.fichier) {
      if (!/^p\d{3}\.mp3$/.test(p.fichier))
        throw new Error(`${nom} : fichier audio inattendu ${p.fichier}`);
      items.push({ f: p.fichier, l: p.ligne + delta });
    } else if (p.verset) items.push({ v: String(p.verset), l: p.ligne + delta });
  }
  const hors0 = hors(delta);
  if (hors0) {
    const hors = hors0;
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

/** illustrations du dossier `illustrations/<livre>/<récit>` (null si absent) */
const SVG_INTERDIT =
  /<\s*(?:text|image|script|foreignObject|a|iframe|style)\b|\bon\w+\s*=|https?:|url\(\s*['"]?(?!#)|href\s*=\s*["'](?!#)/i;
function illusDossier(livreDir, id) {
  const d = join(APP, 'histoire', 'illustrations', livreDir, id);
  const pl = join(d, 'placement.json');
  if (!existsSync(pl)) return null;
  const p = JSON.parse(readFileSync(pl, 'utf8').replace(/^\uFEFF/, ''));
  return Object.entries(p)
    .map(([nom, x]) => {
      const m = /^(enfant|adulte)-\d+$/.exec(nom);
      if (!m) throw new Error(`${id} : illustration ${nom} inattendue`);
      if (!Number.isInteger(x.apres_ligne)) throw new Error(`${id}/${nom} : apres_ligne`);
      const svg = readFileSync(join(d, `${nom}.svg`), 'utf8')
        .replace(/^\uFEFF/, '')
        .replace(/^\s*<\?xml[^>]*>\s*/, '')
        .trim();
      if (!/^<svg[\s>]/.test(svg) || !svg.endsWith('</svg>'))
        throw new Error(`${id}/${nom} : pas un SVG`);
      if (SVG_INTERDIT.test(svg.replace(/\sxmlns(?::\w+)?="[^"]*"/g, '')))
        throw new Error(`${id}/${nom} : SVG non sûr (texte, image, script ou ressource externe)`);
      return {
        v: m[1],
        avant: x.apres_ligne + 1,
        vignette: String(x.format).trim() === '1:1' ? 1 : 0,
        svg,
        cap: '',
      };
    })
    .sort((a, b) => a.avant - b.avant);
}

/** Section « ## Version … » d'un fichier ; lignes numérotées à partir de 1 */
function sectionsDe(src) {
  const s = {};
  let cur = null;
  src.forEach((t, k) => {
    const h = /^##\s+(.*)$/.exec(t);
    if (h) {
      cur = /^Version adulte/.test(h[1])
        ? 'adulte'
        : /^Version enfant/.test(h[1])
          ? 'enfant'
          : null;
      if (cur) s[cur] = [];
      return;
    }
    if (cur) s[cur].push({ l: k + 1, t });
  });
  return s;
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
        const it = manifeste(join(base, v, 'manifest.json'), d, fin, rapport, `${id}/${v}`, src);
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
    const ill = { l1: 'prophetes', l2: 'livre2' }[L.id];
    const dessins = ill ? illusDossier(ill, id) : null;
    if (dessins) {
      for (const x of dessins) {
        const [d, fin] = borne(x.v);
        if (x.avant - 1 > fin)
          throw new Error(`${id} : illustration ${x.v} après sa version (ligne ${x.avant - 1})`);
        if (x.avant - 1 < d - 1)
          rapport.push(
            `${id} : illustration ${x.v} (ligne ${x.avant - 1}) placée en tête de la version`,
          );
      }
      r.illus = dessins;
    } else if (id === '03_nouh') r.illus = illusNouh();
    writeFileSync(join(OUT, `${id}.json`), JSON.stringify(r));
    liste.push({ id, t: titre, e: r.audio?.e ? 1 : 0, a: r.audio?.a ? 1 : 0 });
    total++;
  }
  index.livres.push({ id: L.id, n: L.n, t: L.t, r: liste });
}
// ---------------------------------------------------------------- avertissement au lecteur, en tête de chaque livre
{
  const lire = (p) =>
    readFileSync(p, 'utf8')
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/);
  const officiel = lire(join(APP, 'histoire', 'AVERTISSEMENT_LECTEUR.md'));
  const titre = officiel[0].replace(/^#\s+/, '').trim();
  const paras = officiel.slice(1).filter((t) => t.trim());
  const mise = lire(join(NARR, '..', 'src', 'commun', '00_avertissement.md'));
  const s = sectionsDe(mise);
  const r = { id: '00_avertissement', livre: 'commun', titre, ar: null, fiche: [], questions: [] };
  const a = {};
  for (const v of ['adulte', 'enfant']) {
    // le titre est déjà l'en-tête : le « ### » qui le répète n'est pas recopié (son audio est sauté)
    const lignes = s[v].filter(
      (x) => !(/^#{3}\s/.test(x.t) && x.t.replace(/^#+\s+/, '').trim() === titre),
    );
    const texte = lignes.map((x) => x.t).filter((t) => t.trim());
    if (texte.join('\n') !== paras.join('\n'))
      throw new Error(
        `avertissement (${v}) : la mise en page audio ne reprend pas AVERTISSEMENT_LECTEUR.md`,
      );
    r[v] = blocs(lignes);
    const [d, fin] = [s[v][0].l, s[v][s[v].length - 1].l];
    const it = manifeste(
      join(NARR, 'commun', '00_avertissement', v, 'manifest.json'),
      d,
      fin,
      rapport,
      `00_avertissement/${v}`,
    );
    if (it) a[v === 'enfant' ? 'e' : 'a'] = it;
  }
  if (a.e || a.a) r.audio = a;
  writeFileSync(join(OUT, '00_avertissement.json'), JSON.stringify(r));
  index.av = { id: r.id, t: titre, e: r.audio?.e ? 1 : 0, a: r.audio?.a ? 1 : 0 };
}

// ---------------------------------------------------------------- cycle de Mūsā (livre 2), ordre de lecture
{
  const src = readFileSync(join(APP, 'histoire', 'CYCLE_MOUSSA.md'), 'utf8').split(/\r?\n/);
  const debut = src.findIndex((t) => /^##\s+2\./.test(t));
  const fin = src.findIndex((t, k) => k > debut && /^##\s/.test(t));
  const l1 = index.livres.find((l) => l.id === 'l1');
  const l2 = index.livres.find((l) => l.id === 'l2');
  const cycle = [];
  for (const t of src.slice(debut + 1, fin)) {
    const m = /^(\d+)\.\s+(.*)$/.exec(t);
    if (!m || m[1] === '0') continue; // 0 : survol facultatif
    const code = /^\*\*(H\d\d[a-z]?)\*\*/.exec(m[2]);
    if (code) {
      const r = l2.r.find((x) => x.id.startsWith(code[1] + '_'));
      if (!r) throw new Error(`cycle de Mūsā : ${code[1]} introuvable dans le livre 2`);
      cycle.push({ ...r });
    } else if (/Livre 1, 16/.test(m[2])) {
      const r = l1.r.find((x) => x.id === '16_moussa');
      if (!r) throw new Error('cycle de Mūsā : 16_moussa introuvable dans le livre 1');
      cycle.push({ ...r, l: 'l1' });
    }
  }
  if (cycle.length < 10) throw new Error(`cycle de Mūsā : ${cycle.length} récits seulement`);
  l2.cycle = { t: 'Le cycle de Mūsā', r: cycle };
  rapport.push(`cycle de Mūsā : ${cycle.map((x) => x.id.split('_')[0]).join(' → ')}`);
}

writeFileSync(join(OUT, 'index.json'), JSON.stringify(index));
console.log(`histoires : ${total} récits`);
for (const x of rapport) console.log(' - ' + x);
