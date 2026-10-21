// Essai 1 (21/10/2026) : latences par étape, transcription littérale, écoute locale. Lancé DANS l'image de l'API en
// service (réseau awform_default pour joindre ecoute:8000), compte emprunté awzid-tuteur, aucune clé.
import https from 'node:https';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
const D = '/app/node_modules/@awform/tutor/dist/conversation/';
const { jetonGoogle, GoogleTts, corpsVertex } = await import(D + 'google.js');
const { systemPrompt, CONV_SCHEMA, REGLES } = await import(D + 'prompt.js');
const { CONTEXTE_ADULTE } = await import(D + 'batterie-contexte.js');

const PROJET = process.env.P;
const COMPTE = process.env.C;
const PLAFOND = Number(process.env.PLAFOND_EUR ?? 0.4);
const ETAPES = (process.env.ETAPES ?? 'jeton,cnx,tts,ecoute,modele').split(',');
const MODELES = (process.env.MODELES ?? 'gemini-3.8-flash').split(',');
const ms = (t0) => Math.round(performance.now() - t0);
const out = { etapes: {}, appels: [] };
let depense = 0;
const log = (...a) => console.log(...a);

// ------------------------------------------------ jeton
const jeton = jetonGoogle({ compte: COMPTE });
if (ETAPES.includes('jeton')) {
  let t = performance.now();
  await jeton.obtenir();
  const premier = ms(t);
  t = performance.now();
  await jeton.obtenir();
  out.etapes.jeton = { premierMs: premier, enCacheMs: ms(t) };
  log('jeton', out.etapes.jeton);
} else await jeton.obtenir();

// ------------------------------------------------ connexion (TLS) : neuve contre gardée ouverte
function ttfb(agent) {
  return new Promise((ok) => {
    const t = performance.now();
    const r = https.request(
      { host: 'aiplatform.eu.rep.googleapis.com', path: '/', method: 'GET', agent },
      (res) => {
        res.resume();
        res.on('end', () => ok(ms(t)));
      },
    );
    r.on('error', () => ok(-1));
    r.end();
  });
}
if (ETAPES.includes('cnx')) {
  const neuves = [];
  for (let i = 0; i < 4; i++) neuves.push(await ttfb(new https.Agent({ keepAlive: false })));
  const ka = new https.Agent({ keepAlive: true });
  const gardees = [];
  await ttfb(ka);
  for (let i = 0; i < 4; i++) {
    await new Promise((r) => setTimeout(r, 6000));
    gardees.push(await ttfb(ka));
  }
  out.etapes.connexion = { neuvesMs: neuves, gardeesApres6sMs: gardees };
  log('connexion', out.etapes.connexion);
}

// ------------------------------------------------ phrases (voix de synthèse des leçons)
const PHRASES = [
  ['H', 'ح/ه', 'أُرِيدُ كِيلُو وَاحِدًا، وَنِصْفَ كِيلُو بَصَلٍ. كَمِ الْهِسَابُ؟', 'الْحِسَابُ'],
  ['A', 'ع/ء', 'هَلْ إِنْدَكَ بَصَلٌ؟', 'عِنْدَكَ'],
  ['Q', 'ق/ك', 'أُرِيدُ كِيلُو وَاحِدًا فَكَطْ.', 'فَقَطْ'],
  ['S', 'ص/س', 'أُرِيدُ نِسْفَ كِيلُو بَصَلٍ.', 'نِصْفَ'],
  ['T', 'ط/ت', 'تَيِّبٌ، أُرِيدُ كِيلُو وَاحِدًا.', 'طَيِّبٌ'],
  ['D', 'ض/د', 'تَفَدَّلْ، هٰذِهِ ثَلَاثَةُ يُورُو.', 'تَفَضَّلْ'],
  ['Z', 'ظ/ز', 'انْزُرْ، الطَّمَاطِمُ طَازَجَةٌ.', 'انْظُرْ'],
  ['TH', 'ث/س', 'أُرِيدُ سَلَاسَةَ كِيلُو بَصَلٍ.', 'ثَلَاثَةَ'],
  ['KH', 'خ/ه', 'أَنَا بِهَيْرٍ، شُكْرًا.', 'بِخَيْرٍ'],
  ['GH', 'غ/ر', 'عِنْدِي عَمَلٌ رَدًا.', 'غَدًا'],
  ['V', 'voyelle', 'أُرِدُ كِيلُو طَمَاطِمَ.', 'أُرِيدُ'],
  ['SH', 'shadda', 'طَيِبٌ، شُكْرًا.', 'طَيِّبٌ'],
  ['OK1', 'juste', 'شُكْرًا، كَمِ الْحِسَابُ؟', ''],
  ['OK2', 'juste', 'هَلْ عِنْدَكَ طَمَاطِمُ طَازَجَةٌ؟', ''],
  ['OK3', 'juste', 'أُرِيدُ نِصْفَ كِيلُو بَصَلٍ فَقَطْ.', ''],
  ['L3', 'juste', 'السَّلَامُ عَلَيْكُمْ.', ''],
];
const SEL = process.env.SEL ? process.env.SEL.split(',') : null;
const phrases = SEL ? PHRASES.filter((p) => SEL.includes(p[0])) : PHRASES;
mkdirSync('/essai/audio', { recursive: true });
const voix = new GoogleTts({ jeton, voix: 'ar-XA-Wavenet-B' });
const audios = {};
const ttsMs = [];
for (const [id, , texte] of phrases) {
  const f = `/essai/audio/${id}.mp3`;
  if (existsSync(f) && !ETAPES.includes('tts')) {
    audios[id] = readFileSync(f);
    continue;
  }
  const t = performance.now();
  const v = await voix.lire(texte);
  ttsMs.push(ms(t));
  if (!v) throw new Error('tts ' + id);
  depense += v.caracteres * 4e-6;
  audios[id] = v.data;
  writeFileSync(f, v.data);
}
if (ttsMs.length) {
  out.etapes.tts = { ms: ttsMs };
  log('tts', ttsMs);
}

// ------------------------------------------------ écoute locale (ecoute-ia)
if (ETAPES.includes('ecoute')) {
  out.ecoute = {};
  for (const [id, , texte] of phrases) {
    const t = performance.now();
    const r = await fetch('http://ecoute:8000/ecouter', {
      method: 'POST',
      headers: { 'content-type': 'audio/mpeg' },
      body: audios[id],
    }).then((x) => x.json());
    out.ecoute[id] = {
      ms: ms(t),
      calcul: r.calcul,
      mots: (r.mots ?? []).map((m) => `${m.w}(${m.conf.toFixed(2)})`),
    };
    log('ecoute', id, out.ecoute[id].ms, 'ms |', texte, '|', out.ecoute[id].mots.join(' '));
  }
}

// ------------------------------------------------ modèle : invite et schéma « prononciation »
const AJOUT = `

PRONONCIATION (seulement quand l'élève PARLE)
- « entendu_litteral » : écris EXACTEMENT les sons entendus, lettre par lettre et vocalisés, comme une dictée, SANS rien corriger ni deviner : si l'élève dit « هِسَاب » au lieu de « حِسَاب », tu écris « هِسَاب » ; s'il dit « كَلْب » pour « قَلْب », tu écris « كَلْب ».
- « transcription_ar » : la phrase que l'élève VOULAIT dire, écrite correctement.
- « prononciation » : les mots (deux au plus) où un SON a été nettement remplacé par un autre : {entendu: le mot tel qu'entendu, correct: le mot juste vocalisé}. Sons à surveiller : ح/ه، ع/ء، ق/ك، ص/س، ط/ت، ض/د، ظ/ذ/ز، ث/س، خ/ه، غ/ر, voyelle longue ou brève, shadda. Liste VIDE si la prononciation est juste, au moindre doute, ou pour un simple accent.
- « correction » reste pour la grammaire et le vocabulaire.
- À l'écrit : entendu_litteral vide, prononciation vide.`;
const SCHEMA_P = {
  type: 'OBJECT',
  properties: {
    entendu_litteral: { type: 'STRING' },
    transcription_ar: { type: 'STRING' },
    prononciation: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { entendu: { type: 'STRING' }, correct: { type: 'STRING' } },
        required: ['entendu', 'correct'],
      },
    },
    ...Object.fromEntries(
      Object.entries(CONV_SCHEMA.properties).filter(([k]) => k !== 'transcription_ar'),
    ),
  },
  required: [
    'entendu_litteral',
    'transcription_ar',
    'prononciation',
    'sujet',
    'correction',
    'reponse_ar',
    'reponse_fr',
  ],
  propertyOrdering: [
    'entendu_litteral',
    'transcription_ar',
    'prononciation',
    'sujet',
    'correction',
    'reponse_ar',
    'reponse_fr',
  ],
};
const TARIF = {
  'gemini-3.8-flash': [0.825, 4.125],
  'gemini-3.5-flash-lite': [0.33, 2.75],
  'gemini-3.1-flash-lite': [0.55, 1.65],
};
const ka = new https.Agent({ keepAlive: true, keepAliveMsecs: 30000 });

function appelFlux(modele, corps) {
  return new Promise((ok, ko) => {
    const t0 = performance.now();
    const chemin = `/v1/projects/${PROJET}/locations/eu/publishers/google/models/${modele}:streamGenerateContent?alt=sse`;
    jeton.obtenir().then((j) => {
      const req = https.request(
        {
          host: 'aiplatform.eu.rep.googleapis.com',
          path: chemin,
          method: 'POST',
          agent: ka,
          headers: { authorization: `Bearer ${j}`, 'content-type': 'application/json' },
          timeout: 15000,
        },
        (res) => {
          let tampon = '';
          let texte = '';
          let premier = null;
          let reponseAr = null;
          let usage = null;
          let fin = null;
          let pensee = 0;
          res.setEncoding('utf8');
          res.on('data', (c) => {
            tampon += c.replace(/\r/g, '');
            let i;
            while ((i = tampon.indexOf('\n\n')) >= 0) {
              const ev = tampon.slice(0, i);
              tampon = tampon.slice(i + 2);
              const l = ev
                .split('\n')
                .filter((x) => x.startsWith('data:'))
                .map((x) => x.slice(5))
                .join('');
              if (!l.trim()) continue;
              let j;
              try {
                j = JSON.parse(l);
              } catch {
                continue;
              }
              if (j.error) {
                fin = 'ERREUR ' + JSON.stringify(j.error).slice(0, 200);
                continue;
              }
              const c0 = j.candidates?.[0];
              for (const p of c0?.content?.parts ?? []) {
                if (p.thought) {
                  pensee++;
                  continue;
                }
                if (p.text) {
                  if (premier === null) premier = ms(t0);
                  texte += p.text;
                }
              }
              if (reponseAr === null && /"reponse_ar"\s*:\s*"(?:[^"\\]|\\.)*"/.test(texte))
                reponseAr = ms(t0);
              if (j.usageMetadata) usage = j.usageMetadata;
              if (c0?.finishReason) fin = c0.finishReason;
            }
          });
          res.on('end', () =>
            ok(
              Object.assign(texte ? {} : { brut: tampon.slice(0, 400) }, {
                statut: res.statusCode,
                premierJetonMs: premier,
                reponseArMs: reponseAr,
                totalMs: ms(t0),
                texte,
                usage,
                fin,
              }),
            ),
          );
        },
      );
      req.on('error', ko);
      req.on('timeout', () => req.destroy(new Error('delai')));
      req.end(JSON.stringify(corps));
    }, ko);
  });
}

if (ETAPES.includes('modele')) {
  const systeme = systemPrompt(CONTEXTE_ADULTE, 'vous', 'x', 'adulte').replace(
    /\nFORMAT\n[\s\S]*?(?=\n\nEn français)/,
    (m) =>
      AJOUT +
      '\n' +
      m.replace(
        "transcription_ar (ce que l'élève a DIT, en arabe vocalisé tel que tu l'as entendu ; chaîne vide s'il a écrit)",
        'entendu_litteral, transcription_ar, prononciation',
      ),
  );
  if (!systeme.includes('PRONONCIATION (seulement')) throw new Error('invite non modifiée');
  const REFLEXIONS = (process.env.REFLEXIONS ?? 'LOW').split(',');
  for (const modele of MODELES)
    for (const refl of REFLEXIONS)
      for (const [id, paire, texte, attendu] of phrases) {
        if (depense > PLAFOND) {
          log('PLAFOND atteint');
          break;
        }
        const corps = corpsVertex(
          systeme,
          {
            audience: 'adulte',
            adresse: 'vous',
            genre: 'x',
            contexte: CONTEXTE_ADULTE,
            historique: [],
            audio: { mime: 'audio/mpeg', data: audios[id], secondes: 3 },
          },
          refl,
        );
        corps.generationConfig.responseSchema = SCHEMA_P;
        if (!refl) delete corps.generationConfig.thinkingConfig;
        let r;
        try {
          r = await appelFlux(modele, corps);
        } catch (e) {
          r = { erreur: String(e) };
        }
        const u = r.usage ?? {};
        const [ti, to] = TARIF[modele] ?? [1, 5];
        const cout =
          ((u.promptTokenCount ?? 0) * ti +
            ((u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0)) * to) /
          1e6;
        depense += cout;
        let b = null;
        try {
          b = JSON.parse(r.texte);
        } catch {}
        const a = {
          id,
          paire,
          modele,
          reflexion: refl,
          texte,
          attendu,
          statut: r.statut,
          fin: r.fin,
          premierJetonMs: r.premierJetonMs,
          reponseArMs: r.reponseArMs,
          totalMs: r.totalMs,
          entree: u.promptTokenCount,
          cache: u.cachedContentTokenCount,
          sortie: u.candidatesTokenCount,
          pensee: u.thoughtsTokenCount,
          cout: Number(cout.toFixed(5)),
          entendu: b?.entendu_litteral,
          voulu: b?.transcription_ar,
          prononciation: b?.prononciation,
          correction: b?.correction,
          sujet: b?.sujet,
          reponse: b?.reponse_ar,
          erreur: r.erreur ?? (b ? undefined : (r.texte || r.brut || '').slice(0, 300)),
        };
        out.appels.push(a);
        log(
          `${id} ${modele} ${refl} ${r.statut} ${r.fin} 1er=${a.premierJetonMs} rep_ar=${a.reponseArMs} total=${a.totalMs} in=${a.entree} cache=${a.cache ?? 0} out=${a.sortie} pensee=${a.pensee ?? 0} | entendu=${a.entendu} | P=${JSON.stringify(a.prononciation)} | C=${a.correction ? a.correction.correct : '-'}${a.erreur ? ' | ERR ' + a.erreur : ''}`,
        );
        await new Promise((x) => setTimeout(x, 1500));
      }
}
out.depenseEur = Number(depense.toFixed(4));
log('dépense estimée', out.depenseEur, '€');
writeFileSync(`/essai/exp1-${Date.now()}.json`, JSON.stringify(out, null, 1));
