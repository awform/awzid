#!/usr/bin/env node
// A34 — Muṣḥaf de Médine « à l'identique » : lignes des 604 pages (édition 1405, glyphes QCF V1) par la
// synchronisation « Content Sync » de Quran Foundation (décision D30).
//
// POURQUOI CONTENT SYNC (conditions développeur QF, lues le 06/10/2026, mises à jour le 04/10/2026) :
//  - garder le contenu QF plus d'une semaine n'est permis que s'il est « obtained and maintained through the
//    Content Sync APIs », avec une nouvelle synchronisation « at least every 7 days when connectivity to QF
//    permits » ; Content Sync est « the only permitted path for obtaining and maintaining an offline copy » ;
//  - « The Content Sync storage exception does not itself authorize distributing a prepackaged database or
//    build-time bundle of QF Content » ⇒ AUCUN fichier de lignes dans le dépôt ni dans la construction : la copie
//    vit sur le serveur (QF_SYNC_DIR), l'API la sert page par page aux utilisateurs connectés de l'application.
//
// USAGE (sur le serveur, secret en variables d'environnement, JAMAIS en argument ni dans un fichier du dépôt) :
//   QF_CLIENT_ID=… QF_CLIENT_SECRET=… QF_ENV=prelive|production \
//   node infra/outils/qf-lignes/qf-lignes.mjs sync --dir <QF_SYNC_DIR> --polices <dossier QCF_Pnnn.ttf>
//   node infra/outils/qf-lignes/qf-lignes.mjs verifier --dir <QF_SYNC_DIR> --polices <dossier>   (sans réseau)
//   node infra/outils/qf-lignes/qf-lignes.mjs inspecter --dir <QF_SYNC_DIR>   (champs reçus, sans réseau)
// Options : --mushaf <id> (défaut 2 = « QCF V1 » ; vérifié sur la fiche du muṣḥaf), --tanzil <tsv>,
// --meta <quran-data.js>, --sans-polices (refusé pour la publication), --bootstrap (repartir de zéro).
// Relance : au moins tous les 7 jours (minuteur systemd/cron du serveur, voir EXPLOITATION.md).
//
// Sorties dans QF_SYNC_DIR : etat.json (jeton de synchronisation, dates), copie/mushafs-<id>.json (copie
// synchronisée, lignes brutes), publie/ (lignes-v1.json, pages/NNN.json, manifeste.json, rapport.txt) remplacé
// D'UN BLOC et seulement si le contrôle de cohérence est sans écart ; sinon l'ancienne publication reste en place
// et la commande sort en erreur (code 1) avec la liste des écarts.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cmapOfFile } from './ttf-cmap.mjs';
import {
  BSML_BASMALA,
  BSML_FONT_FILE,
  BSML_SOURATE,
  EXACT_FORMAT,
  EXACT_PAGES,
  bsmlSuraName,
  checkExactFile,
  pageFontFile,
} from '../../../apps/web/src/lib/quran/mushaf-exact.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..');
export const QF = {
  prelive: {
    oauth: 'https://prelive-oauth2.quran.foundation/oauth2/token',
    api: 'https://apis-prelive.quran.foundation',
  },
  production: {
    oauth: 'https://oauth2.quran.foundation/oauth2/token',
    api: 'https://apis.quran.foundation',
  },
};
export const CONTENT_BASE = '/content/api/v4';
export const DEFAULT_MUSHAF = 2;
const TERMS_URL = 'https://api-docs.quran.foundation/legal/developer-terms/';

// ---------------------------------------------------------------------------------------------- Tanzil
/** Texte Tanzil (TSV « s:a<TAB>texte », tel quel) → Map « s:a » → texte, et nombre de versets par sourate. */
export function readTanzil(path) {
  const map = new Map();
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const tab = line.indexOf('\t');
    if (tab < 0) continue;
    map.set(line.slice(0, tab), line.slice(tab + 1).replace(/\r$/, ''));
  }
  const lengths = [];
  for (let s = 1; s <= 114; s++) {
    let a = 0;
    while (map.has(`${s}:${a + 1}`)) a++;
    lengths.push(a);
  }
  return { map, lengths, basmala: map.get('1:1') ?? '' };
}

/** Débuts de page des métadonnées Tanzil (QuranData.Page) : 604 × [sourate, verset]. */
export function readPageStarts(path) {
  const src = readFileSync(path, 'utf8');
  const i = src.indexOf('QuranData.Page');
  const body = src.slice(src.indexOf('[', i), src.indexOf('];', i));
  const pairs = [...body.matchAll(/\[\s*(\d+)\s*,\s*(\d+)\s*\]/g)].map((m) => [+m[1], +m[2]]);
  return pairs.slice(0, EXACT_PAGES);
}

// ---------------------------------------------------------------------------------- copie synchronisée
/** Type d'une ligne de la copie (fiche du muṣḥaf, page, mot positionné). */
export function rowKind(row) {
  if (row.line_number !== undefined && (row.verse_id !== undefined || row.verse_key !== undefined))
    return 'word';
  if (row.first_verse_id !== undefined || row.verse_mapping !== undefined) return 'page';
  if (row.lines_per_page !== undefined || row.pages_count !== undefined) return 'mushaf';
  return 'autre';
}
/** Type normalisé (même clé pour l'instantané et les mutations, quel que soit le nom exact du type). */
function normType(recordType, data) {
  const t = String(recordType ?? '').toLowerCase();
  if (t.includes('word')) return 'word';
  if (t.includes('page')) return 'page';
  if (t.includes('mushaf')) return 'mushaf';
  return data ? rowKind(data) : t || 'autre';
}
const rowKey = (recordType, recordKey, data) =>
  `${normType(recordType, data)}:${recordKey ?? data?.id ?? JSON.stringify(data)}`;

/** Lignes d'un instantané (`records`) → Map clé → ligne (accepte {record_type, record_key, data} ou ligne nue). */
export function snapshotRows(snapshot) {
  const rows = new Map();
  for (const r of snapshot.records ?? []) {
    const data = r && typeof r === 'object' && r.data && typeof r.data === 'object' ? r.data : r;
    rows.set(rowKey(r.record_type, r.record_key, data), data);
  }
  return rows;
}

/** Applique une mutation de synchronisation à la copie ; renvoie l'action faite. */
export async function applyMutation(rows, m, fetchSnapshot) {
  switch (m.type) {
    case 'RESOURCE_CREATE':
    case 'RESOURCE_INVALIDATE': {
      const snap = await fetchSnapshot(m.snapshot_url);
      rows.clear();
      for (const [k, v] of snapshotRows(snap)) rows.set(k, v);
      return 'instantane';
    }
    case 'RESOURCE_UPDATE':
      return 'rien';
    case 'RESOURCE_DELETE':
      rows.clear();
      return 'ressource_retiree';
    case 'ROW_CREATE':
    case 'ROW_UPDATE':
      if (m.data) rows.set(rowKey(m.record_type, m.record_key, m.data), m.data);
      return 'ligne';
    case 'ROW_DELETE':
      rows.delete(rowKey(m.record_type, m.record_key, null));
      return 'ligne';
    default:
      throw new Error(`mutation inconnue : ${m.type} (mettre l'outil à jour avant de publier)`);
  }
}

// ------------------------------------------------------------------------------- copie → fichier exact
const POS_FIN = 0;
const POS_SIGNE = -1;

/** Clé de verset d'un mot : verse_key « s:a », sinon verse_id (1 à 6 236, ordre du Coran). */
function verseOf(row, ids) {
  if (typeof row.verse_key === 'string') {
    const [s, a] = row.verse_key.split(':').map(Number);
    return [s, a];
  }
  return ids[row.verse_id - 1] ?? null;
}

/**
 * Fichier de lignes (`ExactFile`, forme de mushaf-exact.ts) depuis les lignes de la copie : mots groupés par
 * page puis par ligne, dans l'ordre de position. Glyphe : `code_v1` s'il est fourni, sinon `text` (dans la
 * ressource « mushafs » d'un muṣḥaf QCF, `text` porte le glyphe de la police de la page — vérifié par la cmap).
 */
export function buildExactFile(rows, lengths, source) {
  const ids = [];
  lengths.forEach((n, i) => {
    for (let a = 1; a <= n; a++) ids.push([i + 1, a]);
  });
  const words = [...rows.values()].filter((r) => rowKind(r) === 'word');
  const unknown = [];
  const pages = new Map();
  for (const r of words) {
    const v = verseOf(r, ids);
    if (!v) {
      unknown.push(r.id ?? r.word_id);
      continue;
    }
    const type = String(r.char_type_name ?? 'word');
    const pos =
      type === 'word' ? Number(r.position_in_verse) : type === 'end' ? POS_FIN : POS_SIGNE;
    const order = Number(r.position_in_line ?? r.position_in_page ?? r.word_id ?? r.id);
    const p = Number(r.page_number);
    const n = Number(r.line_number);
    const code = String(r.code_v1 ?? r.text ?? '');
    if (!pages.has(p)) pages.set(p, new Map());
    const lines = pages.get(p);
    if (!lines.has(n)) lines.set(n, []);
    lines
      .get(n)
      .push({ order, page: Number(r.position_in_page ?? 0), w: [v[0], v[1], pos, code, type] });
  }
  const out = {
    format: EXACT_FORMAT,
    source,
    generatedAt: new Date().toISOString(),
    pages: [...pages.keys()]
      .sort((a, b) => a - b)
      .map((p) => ({
        p,
        lines: [...pages.get(p).keys()]
          .sort((a, b) => a - b)
          .map((n) => ({
            n,
            w: pages
              .get(p)
              .get(n)
              .sort((x, y) => x.order - y.order || x.page - y.page)
              .map((x) => x.w),
          })),
      })),
  };
  return { file: out, unknown };
}

// ------------------------------------------------------------------------------------------ contrôle
export function fontChecker(dir) {
  const cache = new Map();
  return (p, cp) => {
    if (!cache.has(p)) {
      const f = join(dir, pageFontFile(p));
      cache.set(p, existsSync(f) ? cmapOfFile(f) : null);
    }
    const set = cache.get(p);
    return set ? set.has(cp) : false;
  };
}

export function verify(file, { tanzil, pageStarts, fontsDir }) {
  const bsml = [];
  if (fontsDir) {
    const f = join(fontsDir, BSML_FONT_FILE);
    const set = existsSync(f) ? cmapOfFile(f) : new Set();
    const need = [...BSML_BASMALA, BSML_SOURATE];
    for (let s = 1; s <= 114; s++) need.push(bsmlSuraName(s));
    for (const ch of need)
      if (!set.has(ch.codePointAt(0)))
        bsml.push(
          `glyphe U+${ch.codePointAt(0).toString(16).toUpperCase()} absent de ${BSML_FONT_FILE}`,
        );
  }
  return bsml.concat(
    checkExactFile({
      file,
      lengths: tanzil.lengths,
      text: (s, a) => tanzil.map.get(`${s}:${a}`),
      basmala: tanzil.basmala,
      pageStarts,
      fontHas: fontsDir ? fontChecker(fontsDir) : undefined,
    }),
  );
}

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/** Publication D'UN BLOC (dossier temporaire puis renommage) — seulement si le contrôle est sans écart. */
export function publish(dir, file) {
  const tmp = join(dir, 'publie.tmp');
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(join(tmp, 'pages'), { recursive: true });
  const all = Buffer.from(JSON.stringify(file));
  writeFileSync(join(tmp, 'lignes-v1.json'), all);
  let bytes = 0;
  for (const pg of file.pages) {
    const b = Buffer.from(JSON.stringify({ format: file.format, p: pg.p, lines: pg.lines }));
    bytes += b.length;
    writeFileSync(join(tmp, 'pages', `${String(pg.p).padStart(3, '0')}.json`), b);
  }
  const manifest = {
    format: file.format,
    sha256: sha256(all),
    version: sha256(all).slice(0, 16),
    source: file.source,
    generatedAt: file.generatedAt,
    pages: file.pages.length,
    bytes: { total: all.length, pages: bytes },
    credit:
      'Données de mise en page : Quran Foundation (Content Sync) — polices : Complexe du Roi Fahd',
    terms: TERMS_URL,
  };
  writeFileSync(join(tmp, 'manifeste.json'), JSON.stringify(manifest, null, 2));
  writeFileSync(join(tmp, 'lignes-v1.sha256'), `${manifest.sha256}  lignes-v1.json\n`);
  const live = join(dir, 'publie');
  const old = join(dir, 'publie.ancien');
  rmSync(old, { recursive: true, force: true });
  if (existsSync(live)) renameSync(live, old);
  renameSync(tmp, live);
  rmSync(old, { recursive: true, force: true });
  return manifest;
}

// ------------------------------------------------------------------------------------------- réseau
async function token(env, fetchImpl) {
  const id = process.env.QF_CLIENT_ID;
  const secret = process.env.QF_CLIENT_SECRET;
  if (!id || !secret)
    throw new Error('QF_CLIENT_ID et QF_CLIENT_SECRET sont requis (variables d’environnement)');
  const r = await fetchImpl(QF[env].oauth, {
    method: 'POST',
    headers: {
      authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials&scope=content',
  });
  if (!r.ok) throw new Error(`jeton refusé : HTTP ${r.status}`);
  const j = await r.json();
  return { id, access: j.access_token };
}

/** Adresse complète d'un chemin renvoyé par l'API (« /api/v4/… » ou « /content/api/v4/… » ou absolu). */
export function apiUrl(env, path) {
  if (/^https:\/\//.test(path)) return path;
  if (path.startsWith('/content/')) return `${QF[env].api}${path}`;
  if (path.startsWith('/api/')) return `${QF[env].api}/content${path}`;
  return `${QF[env].api}${CONTENT_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
}

/** Une passe de synchronisation (amorçage ou incrémentale) : applique toutes les mutations, page après page. */
export async function syncOnce({ env, mushafId, state, rows, fetchImpl = fetch }) {
  const tk = await token(env, fetchImpl);
  const get = async (path) => {
    const r = await fetchImpl(apiUrl(env, path), {
      headers: { 'x-auth-token': tk.access, 'x-client-id': tk.id, accept: 'application/json' },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status} sur ${path.split('?')[0]}`);
    return r.json();
  };
  const resource = `mushafs:${mushafId}`;
  let next = state.syncToken
    ? `/resources/sync?sync_token=${encodeURIComponent(state.syncToken)}&resources=${resource}&per_page=100`
    : `/resources/sync?bootstrap=true&resources=${resource}&per_page=100`;
  const actions = {};
  let syncToken = state.syncToken ?? null;
  for (let guard = 0; next && guard < 10000; guard++) {
    const page = await get(next);
    for (const m of page.mutations ?? []) {
      if (m.resource_group && m.resource_group !== 'mushafs') continue;
      const a = await applyMutation(rows, m, (u) => get(u));
      actions[a] = (actions[a] ?? 0) + 1;
    }
    if (page.next_sync_token) syncToken = page.next_sync_token;
    next = page.has_more ? page.next_page_url : null;
  }
  return { syncToken, actions };
}

// ---------------------------------------------------------------------------------------- commande
function args(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
      o[k] = v;
    } else o._.push(a);
  }
  return o;
}

function loadJson(path, fallback) {
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback;
}

export function mushafRecord(rows) {
  return [...rows.values()].find((r) => rowKind(r) === 'mushaf') ?? null;
}

/** La fiche du muṣḥaf doit être celle de l'édition 1405 (QCF V1), 604 pages de 15 lignes. */
export function checkMushafRecord(m) {
  if (!m) return 'fiche du muṣḥaf absente de la copie';
  const label = `${m.name ?? ''} ${m.description ?? ''} ${m.default_font_name ?? ''}`;
  if (Number(m.pages_count) !== 604 || Number(m.lines_per_page) !== 15)
    return `muṣḥaf « ${label.trim()} » : ${m.pages_count} pages × ${m.lines_per_page} lignes (attendu 604 × 15)`;
  if (!/v1\b|1405|qcf_?p|code_v1/i.test(label))
    return `muṣḥaf « ${label.trim()} » : pas l'édition QCF V1 (1405) — choisir --mushaf`;
  return null;
}

async function main() {
  const o = args(process.argv.slice(2));
  const cmd = o._[0];
  const dir = resolve(String(o.dir ?? process.env.QF_SYNC_DIR ?? ''));
  if (
    !cmd ||
    !['sync', 'verifier', 'inspecter'].includes(cmd) ||
    (!o.dir && !process.env.QF_SYNC_DIR)
  ) {
    console.error(
      'usage : qf-lignes.mjs sync|verifier|inspecter --dir <QF_SYNC_DIR> [--polices <dossier>]',
    );
    process.exit(2);
  }
  const env = String(process.env.QF_ENV ?? 'prelive');
  if (!QF[env]) throw new Error(`QF_ENV inconnu : ${env}`);
  const mushafId = Number(o.mushaf ?? DEFAULT_MUSHAF);
  mkdirSync(join(dir, 'copie'), { recursive: true });
  const statePath = join(dir, 'etat.json');
  const copyPath = join(dir, 'copie', `mushafs-${mushafId}.json`);
  const state = o.bootstrap ? {} : loadJson(statePath, {});
  if (state.mushafId && state.mushafId !== mushafId) delete state.syncToken;
  const rows = new Map(o.bootstrap ? [] : loadJson(copyPath, []));

  if (cmd === 'inspecter') {
    const kinds = {};
    for (const r of rows.values()) {
      const k = rowKind(r);
      kinds[k] ??= { n: 0, champs: Object.keys(r), exemple: r };
      kinds[k].n++;
    }
    console.log(JSON.stringify({ etat: state, lignes: kinds }, null, 2));
    return;
  }

  if (cmd === 'sync') {
    const res = await syncOnce({ env, mushafId, state, rows });
    writeFileSync(copyPath, JSON.stringify([...rows.entries()]));
    const now = new Date().toISOString();
    writeFileSync(
      statePath,
      JSON.stringify({ ...state, env, mushafId, syncToken: res.syncToken, lastSync: now }, null, 2),
    );
    console.log(`synchronisation ${env} ${now} :`, JSON.stringify(res.actions));
    if (res.actions.ressource_retiree) {
      // ressource retirée par QF : plus rien n'est servi (l'application revient aux lignes fluides)
      rmSync(join(dir, 'publie'), { recursive: true, force: true });
      console.error('ressource retirée par Quran Foundation : publication supprimée');
      process.exit(3);
    }
  }

  const bad = checkMushafRecord(mushafRecord(rows));
  if (bad) {
    console.error(`REFUS : ${bad}`);
    process.exit(1);
  }
  const m = mushafRecord(rows);
  const tanzil = readTanzil(
    String(o.tanzil ?? join(REPO, 'infra/ci/contenu/coran/tanzil-uthmani.tsv')),
  );
  const pageStarts = readPageStarts(
    String(o.meta ?? join(REPO, 'infra/ci/contenu/coran/tanzil-quran-data.js')),
  );
  const st = loadJson(statePath, {});
  const source = {
    name: 'Quran Foundation — Content Sync',
    url: TERMS_URL,
    env,
    resource: `mushafs:${mushafId}`,
    mushafName: String(m.name ?? ''),
    syncedAt: st.lastSync ?? '',
  };
  const { file, unknown } = buildExactFile(rows, tanzil.lengths, source);
  const fontsDir = o.polices ? resolve(String(o.polices)) : null;
  const errs = verify(file, { tanzil, pageStarts, fontsDir });
  if (unknown.length) errs.unshift(`${unknown.length} mot(s) sans verset reconnu`);
  if (!fontsDir)
    errs.push('contrôle des glyphes non fait (--polices manquant) : publication refusée');
  const report = [
    `Contrôle A34 — ${new Date().toISOString()} — ${file.pages.length} pages, muṣḥaf « ${m.name} »`,
    errs.length
      ? `${errs.length} écart(s) :`
      : 'CONFORME : 604 pages, 15 lignes, mots ↔ Tanzil 1:1, glyphes présents',
    ...errs,
  ].join('\n');
  writeFileSync(join(dir, 'rapport.txt'), `${report}\n`);
  console.log(report);
  if (errs.length) process.exit(1);
  const man = publish(dir, file);
  console.log(`publié : lignes-v1.json ${man.bytes.total} octets, SHA-256 ${man.sha256}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(`ÉCHEC : ${e.message}`);
    process.exit(1);
  });
}
