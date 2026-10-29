// Mesure de latence Vertex (29/10/2026) : Flash-Lite et gemini-3.8-flash, point « eu » contre points régionaux UE.
// N appels courts par (lieu, modèle), en tourniquet ; même corps que la conversation réelle (invite système, schéma).
const D = process.env.DIST + '/';
const { jetonGoogle, corpsVertex } = await import(D + 'conversation/google.js');
const { systemPrompt } = await import(D + 'conversation/prompt.js');
const { CONTEXTE_ADULTE } = await import(D + 'conversation/batterie-contexte.js');
const P = process.env.P,
  N = Number(process.env.N || 20);
const LIEUX = (
  process.env.LIEUX || 'eu,europe-west1,europe-west4,europe-west9,europe-west3,europe-west8'
).split(',');
const MODELES = (process.env.MODELES || 'gemini-3.5-flash-lite,gemini-3.8-flash').split(',');
const jeton = jetonGoogle({ compte: process.env.C });
const sys = systemPrompt(CONTEXTE_ADULTE, 'vous', 'x', 'adulte');
const PHRASES = ['مَرْحَبًا', 'أَنَا بِخَيْرٍ', 'شُكْرًا', 'اِسْمِي سَامِي', 'مِنْ أَيْنَ أَنْتَ؟'];
const url = (l, m) =>
  `https://${l === 'eu' ? 'aiplatform.eu.rep.googleapis.com' : `${l}-aiplatform.googleapis.com`}/v1/projects/${P}/locations/${l}/publishers/google/models/${m}:generateContent`;
async function appel(l, m, i) {
  const corps = corpsVertex(
    sys,
    {
      audience: 'adulte',
      adresse: 'vous',
      genre: 'x',
      contexte: CONTEXTE_ADULTE,
      historique: [],
      texte: PHRASES[i % 5],
    },
    'LOW',
  );
  const t = await jeton.obtenir();
  const t0 = Date.now();
  try {
    const r = await fetch(url(l, m), {
      method: 'POST',
      headers: { authorization: `Bearer ${t}`, 'content-type': 'application/json' },
      body: JSON.stringify(corps),
      signal: AbortSignal.timeout(20000),
    });
    const j = await r.json().catch(() => ({}));
    const u = j.usageMetadata ?? {};
    return {
      ms: Date.now() - t0,
      st: r.status,
      msg: r.ok ? '' : String(j.error?.message ?? '').slice(0, 90),
      p: u.promptTokenCount ?? 0,
      c: u.cachedContentTokenCount ?? 0,
      o: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0),
    };
  } catch (e) {
    return { ms: Date.now() - t0, st: 'err', msg: String(e.name) };
  }
}
const res = {};
const actifs = [];
for (const l of LIEUX)
  for (const m of MODELES) {
    const r = await appel(l, m, 0); // sonde (chauffe la connexion, non comptée)
    if (r.st === 200) {
      actifs.push([l, m]);
      res[`${l} ${m}`] = [];
    } else console.log(`INDISPONIBLE ${l} ${m} ${r.st} ${r.msg}`);
  }
for (let i = 0; i < N; i++)
  for (const [l, m] of actifs) res[`${l} ${m}`].push(await appel(l, m, i + 1));
const q = (a, f) => a[Math.min(a.length - 1, Math.floor(f * a.length))];
for (const [k, a] of Object.entries(res)) {
  const ok = a.filter((x) => x.st === 200),
    ms = ok.map((x) => x.ms).sort((x, y) => x - y);
  const moy = (f) => Math.round(ok.reduce((s, x) => s + x[f], 0) / Math.max(1, ok.length));
  console.log(
    `${k.padEnd(42)} ok ${ok.length}/${a.length} med ${q(ms, 0.5)} p95 ${q(ms, 0.95)} max ${ms.at(-1)} | entrée ${moy('p')} cache ${moy('c')} sortie ${moy('o')}${a.some((x) => x.st !== 200) ? ' | ' + [...new Set(a.filter((x) => x.st !== 200).map((x) => x.st + ' ' + x.msg))].join(';') : ''}`,
  );
}
