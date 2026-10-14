#!/usr/bin/env node
/**
 * Test de charge par PARCOURS RÉALISTES, à paliers d'utilisateurs simultanés (14/10/2026) — sans dépendance.
 * Contre la DÉMONSTRATION PRIVÉE seulement (jamais la bêta, jamais une adresse externe) : comptes fictifs
 * `charge-<n>@demo.awform.test` créés par `infra/charge/semis-comptes.mjs` (mot de passe tiré au hasard, rangé hors
 * dépôt, jamais affiché).
 *
 *   AWFORM_CHARGE_PW_FILE=~/.awzid-charge/pw AWFORM_CHARGE_PALIERS=5,20,50,100 AWFORM_CHARGE_SECONDES=90 \
 *     node infra/charge/parcours.mjs
 *
 * Variables : AWFORM_CHARGE_URL (défaut http://127.0.0.1, Caddy), AWFORM_CHARGE_PALIERS, AWFORM_CHARGE_SECONDES (durée
 * mesurée d'un palier), AWFORM_CHARGE_MONTEE (secondes de montée, non mesurées), AWFORM_CHARGE_PENSEE_MS (pause entre
 * deux gestes, « min,max »), AWFORM_CHARGE_COMPTES (nombre de comptes semés), AWFORM_CHARGE_SCENARIO
 * (parcours | connexion), AWFORM_CHARGE_SORTIE (fichier JSON des résultats).
 * Un utilisateur virtuel (UV) enchaîne : [connexion] → accueil → leçon + audio → séance Madjaliss → Coran (page du
 * muṣḥaf, audio d'un verset) → hifẓ → synchronisation, avec des pauses de réflexion, puis recommence.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';

export function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1];
}
const r1 = (x) => Math.round(x * 10) / 10;
export function resume(durations, errors) {
  const s = [...durations].sort((a, b) => a - b);
  return {
    n: s.length,
    erreurs: errors,
    p50: r1(percentile(s, 50)),
    p95: r1(percentile(s, 95)),
    p99: r1(percentile(s, 99)),
    max: r1(s.at(-1) ?? 0),
  };
}

/** Garde-fou : adresse locale seulement (la démonstration est sur cette machine). */
export function cibleAutorisee(url) {
  try {
    const h = new URL(url).hostname;
    return ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(h);
  } catch {
    return false;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const alea = (a, b) => a + Math.random() * (b - a);
const choix = (xs) => xs[Math.floor(Math.random() * xs.length)];

async function main() {
  const BASE = (process.env.AWFORM_CHARGE_URL ?? 'http://127.0.0.1').replace(/\/$/, '');
  if (!cibleAutorisee(BASE))
    throw new Error(`refusé : ${BASE} n'est pas local (démonstration privée seulement)`);
  const PW = (
    process.env.AWFORM_CHARGE_PW ??
    readFileSync(
      (process.env.AWFORM_CHARGE_PW_FILE ?? `${homedir()}/.awzid-charge/pw`).replace(
        /^~/,
        homedir(),
      ),
      'utf8',
    )
  ).trim();
  const PALIERS = (process.env.AWFORM_CHARGE_PALIERS ?? '5,20,50,100')
    .split(',')
    .map(Number)
    .filter(Boolean);
  const SEC = Number(process.env.AWFORM_CHARGE_SECONDES ?? 90);
  const MONTEE = Number(process.env.AWFORM_CHARGE_MONTEE ?? 10);
  const [PMIN, PMAX] = (process.env.AWFORM_CHARGE_PENSEE_MS ?? '800,3000').split(',').map(Number);
  const COMPTES = Number(process.env.AWFORM_CHARGE_COMPTES ?? 50);
  const SCENARIO = process.env.AWFORM_CHARGE_SCENARIO ?? 'parcours';
  const SORTIE = process.env.AWFORM_CHARGE_SORTIE ?? 'charge-resultats.json';
  const API = `${BASE}/api/v1`;
  const H = { 'content-type': 'application/json', 'x-awform': '1' };

  // ---- état de mesure du palier courant
  let mesure = null; // { t0, lab: Map(label → {d: [], err: 0, statuts: {}}), fen: Map(fenêtre 10 s → {n, err, d: []}) }
  const enreg = (label, ms, statut, ok) => {
    if (!mesure) return;
    const e = mesure.lab.get(label) ?? { d: [], err: 0, statuts: {} };
    e.d.push(ms);
    if (!ok) e.err++;
    e.statuts[statut] = (e.statuts[statut] ?? 0) + 1;
    mesure.lab.set(label, e);
    const w = Math.floor((performance.now() - mesure.t0) / 10_000);
    const f = mesure.fen.get(w) ?? { n: 0, err: 0, d: [] };
    f.n++;
    if (!ok) f.err++;
    f.d.push(ms);
    mesure.fen.set(w, f);
  };

  /** Une requête mesurée. `ok` : statuts acceptés. Renvoie { s, buf, h } (jamais d'exception). */
  async function req(label, method, url, cookie = '', body, opts = {}) {
    const t = performance.now();
    let s;
    let buf = Buffer.alloc(0);
    let h = new Headers();
    try {
      const ctl = new AbortController();
      const to = setTimeout(() => ctl.abort(), 30_000);
      const r = await fetch(url, {
        method,
        headers: {
          ...(opts.web ? {} : H),
          ...(opts.range ? { range: opts.range } : {}),
          ...(cookie ? { cookie } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: ctl.signal,
      });
      s = r.status;
      h = r.headers;
      buf = Buffer.from(await r.arrayBuffer());
      clearTimeout(to);
    } catch {
      s = 0;
    }
    const ok = s >= 200 && s < 400;
    enreg(label, performance.now() - t, s === 0 ? 'timeout/réseau' : s, ok);
    return { s, buf, h };
  }
  const api = (label, method, path, ck, body, opts) =>
    req(label, method, `${API}${path}`, ck, body, opts);
  const json = (r) => {
    try {
      return JSON.parse(r.buf.toString('utf8'));
    } catch {
      return null;
    }
  };

  // ---- données de référence (hors mesure)
  const setup = await (async () => {
    const l = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({ email: 'charge-0@demo.awform.test', password: PW }),
    });
    if (!l.ok) throw new Error(`connexion de référence : ${l.status} (comptes semés ?)`);
    const ck = (l.headers.get('set-cookie') ?? '').split(';')[0];
    const get = async (p) => (await fetch(`${API}${p}`, { headers: { ...H, cookie: ck } })).json();
    const units = (await get('/levels/ad1/units')).units.map((u) => u.id);
    const audioLecons = (await get('/lecons-audio/niveaux/ad1')).fichiers.slice(0, 120);
    const rec = (await get('/quran/audio/reciters')).reciters
      .map((r) => r.id)
      .filter((id) => !id.startsWith('qf-')); // les qf-* sont servis par des miroirs EXTERNES : jamais appelés
    return { units, audioLecons, rec };
  })();

  /** Un parcours complet d'un utilisateur virtuel (une « séance d'étude »). */
  async function parcours(vu, etat) {
    const email = `charge-${vu % COMPTES}@demo.awform.test`;
    const pense = () => sleep(alea(PMIN, PMAX));
    if (!etat.ck || Math.random() < 0.25) {
      const l = await api('POST /auth/login', 'POST', '/auth/login', '', { email, password: PW });
      if (l.s !== 200) return;
      etat.ck = (l.h.get('set-cookie') ?? '').split(';')[0];
      etat.pid = undefined;
    }
    const ck = etat.ck;
    // 1. accueil élève
    const [, me] = await Promise.all([
      req('web / (page)', 'GET', `${BASE}/`, '', undefined, { web: true }),
      api('GET /auth/me', 'GET', '/auth/me', ck),
      api('GET /config', 'GET', '/config', ck),
      api('GET /levels', 'GET', '/levels', ck),
      api('GET /fonctions', 'GET', '/fonctions', ck),
      api('GET /acces/statut', 'GET', '/acces/statut', ck),
    ]).then((rs) => [rs[0], rs[1]]);
    const pid = etat.pid ?? json(me)?.profiles?.[0]?.id;
    if (!pid) return;
    etat.pid = pid;
    await Promise.all([
      api('GET /today/:id', 'GET', `/today/${pid}`, ck),
      api('GET /profiles/:id/parcours', 'GET', `/profiles/${pid}/parcours`, ck),
    ]);
    await pense();
    // 2. ouverture d'une leçon + son audio
    await api('GET /levels/:code/units', 'GET', '/levels/ad1/units', ck);
    await req(
      'web /lecons/:id (page)',
      'GET',
      `${BASE}/lecons/${choix(setup.units)}`,
      '',
      undefined,
      { web: true },
    );
    await api('GET /units/:id (leçon)', 'GET', `/units/${choix(setup.units)}`, ck);
    await pense();
    for (let i = 0; i < 3; i++)
      await api(
        'GET audio de leçon (mp3)',
        'GET',
        `/lecons-audio/fichiers/${choix(setup.audioLecons)}.mp3`,
        ck,
      );
    await pense();
    // 3. séance Madjaliss (texte statique + complément différé du groupe bêta + séances faites)
    await req(
      'web /madjaliss/:texte (page)',
      'GET',
      `${BASE}/madjaliss/ibn-ashir/${1 + Math.floor(Math.random() * 40)}`,
      '',
      undefined,
      { web: true },
    );
    await Promise.all([
      req('GET /mutun/:texte.json', 'GET', `${BASE}/mutun/ibn-ashir.json`, '', undefined, {
        web: true,
      }),
      req(
        'GET /mutun/:texte-differe.json (bêta)',
        'GET',
        `${BASE}/mutun/ibn-ashir-differe.json`,
        ck,
        undefined,
        { web: true },
      ),
      api('GET /profiles/:id/madjaliss', 'GET', `/profiles/${pid}/madjaliss`, ck),
    ]);
    await pense();
    // 4. Coran : récitants, page du muṣḥaf, audio d'un verset
    await req('web /coran/mushaf (page)', 'GET', `${BASE}/coran/mushaf`, '', undefined, {
      web: true,
    });
    await Promise.all([
      api('GET /quran/audio/reciters', 'GET', '/quran/audio/reciters', ck),
      api('GET /quran/mushaf-exact', 'GET', '/quran/mushaf-exact', ck),
    ]);
    for (let i = 0; i < 3; i++) {
      await api(
        'GET /quran/mushaf-exact/pages/:p',
        'GET',
        `/quran/mushaf-exact/pages/${1 + Math.floor(Math.random() * 604)}`,
        ck,
      );
      await pense();
    }
    const sura = 1 + Math.floor(Math.random() * 114);
    const tr = await api(
      'GET /quran/audio/reciters/:id/suras/:n',
      'GET',
      `/quran/audio/reciters/${choix(setup.rec)}/suras/${sura}`,
      ck,
    );
    const f = json(tr)?.files?.[0]?.url;
    if (f && f.startsWith('/api/v1/'))
      await api('GET audio de verset (mp3)', 'GET', f.replace('/api/v1', ''), ck);
    await pense();
    // 5. hifẓ
    await req('web /hifz (page)', 'GET', `${BASE}/hifz`, '', undefined, { web: true });
    await Promise.all([
      api('GET /hifz/profiles/:id', 'GET', `/hifz/profiles/${pid}`, ck),
      api('GET /hifz/books', 'GET', '/hifz/books', ck),
    ]);
    await pense();
    // 6. synchronisation de la séance (5 événements)
    const day = new Date().toISOString().slice(0, 10);
    const events = Array.from({ length: 5 }, () => ({
      id: crypto.randomUUID(),
      profileId: pid,
      unitId: 'ad1.l01',
      eventType: 'trace',
      response: { item: 'ب', ok: true, day },
      deviceAt: new Date().toISOString(),
    }));
    await api('POST /attempts (5 événements)', 'POST', '/attempts', ck, { events });
    await api('GET /famille/messages', 'GET', '/famille/messages', ck);
    await pense();
  }

  /** Scénario « rentrée » : tous les UV se connectent en même temps, en boucle (argon2id). */
  async function connexion(vu) {
    await api('POST /auth/login', 'POST', '/auth/login', '', {
      email: `charge-${vu % COMPTES}@demo.awform.test`,
      password: PW,
    });
    await sleep(alea(PMIN, PMAX));
  }

  const resultats = [];
  for (const vus of PALIERS) {
    process.stderr.write(`palier ${vus} UV (${SCENARIO}) : montée ${MONTEE} s + ${SEC} s\n`);
    mesure = null;
    let fin = false;
    const etats = Array.from({ length: vus }, () => ({}));
    const debutMontee = Date.now();
    const boucles = etats.map(async (etat, vu) => {
      await sleep((MONTEE * 1000 * vu) / vus); // montée linéaire
      while (!fin)
        await (SCENARIO === 'connexion' ? connexion(vu) : parcours(vu, etat)).catch(() => {});
    });
    await sleep(Math.max(0, MONTEE * 1000 - (Date.now() - debutMontee)));
    const cpu0 = process.cpuUsage();
    mesure = { t0: performance.now(), lab: new Map(), fen: new Map() };
    const horodatage = { debut: new Date().toISOString() };
    await sleep(SEC * 1000);
    const duree = (performance.now() - mesure.t0) / 1000;
    const m = mesure;
    mesure = null;
    horodatage.fin = new Date().toISOString();
    const cpu = process.cpuUsage(cpu0);
    fin = true;
    await Promise.race([Promise.all(boucles), sleep(35_000)]); // les parcours en cours se terminent (30 s au plus)
    const routes = [...m.lab.entries()]
      .map(([route, e]) => ({
        route,
        ...resume(e.d, e.err),
        statuts: e.statuts,
        rps: r1(e.d.length / duree),
      }))
      .sort((a, b) => b.n - a.n);
    const tout = [...m.lab.values()];
    const toutes = resume(
      tout.flatMap((e) => e.d),
      tout.reduce((a, e) => a + e.err, 0),
    );
    const fenetres = [...m.fen.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([w, f]) => ({
        t: w * 10,
        rps: r1(f.n / 10),
        erreurs: f.err,
        ...(({ p50, p95, p99 }) => ({ p50, p95, p99 }))(resume(f.d, 0)),
      }));
    resultats.push({
      uv: vus,
      scenario: SCENARIO,
      ...horodatage,
      duree: r1(duree),
      global: {
        ...toutes,
        rps: r1(toutes.n / duree),
        tauxErreur: r1((100 * toutes.erreurs) / Math.max(1, toutes.n)),
      },
      generateurCpuS: r1((cpu.user + cpu.system) / 1e6),
      routes,
      fenetres,
    });
    writeFileSync(
      SORTIE,
      JSON.stringify({ base: BASE, date: new Date().toISOString(), paliers: resultats }, null, 1),
    );
    const g = resultats.at(-1).global;
    process.stderr.write(
      `  → ${g.n} requêtes, ${g.rps}/s, erreurs ${g.tauxErreur} %, p50 ${g.p50} p95 ${g.p95} p99 ${g.p99} ms\n`,
    );
    await sleep(8000); // retour au calme entre deux paliers
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(2);
  });
}
