// Essai 2 (21/10/2026) : transcription LITTÉRALE par un appel court, sans le contexte de la leçon (le contexte tire
// le modèle vers le mot attendu). Mêmes audios que l'essai 1 (/essai/audio), même compte emprunté.
import https from 'node:https';
import { readFileSync, writeFileSync } from 'node:fs';
const D = '/app/node_modules/@awform/tutor/dist/conversation/';
const { jetonGoogle } = await import(D + 'google.js');
const { REGLAGES_GENERATION } = await import(D + 'prompt.js');
const { CONTEXTE_ADULTE } = await import(D + 'batterie-contexte.js');
const DIALOGUE = JSON.stringify(CONTEXTE_ADULTE.dialogue.map((r) => r.ar));
const PROJET = process.env.P;
const jeton = jetonGoogle({ compte: process.env.C });
const ms = (t0) => Math.round(performance.now() - t0);
const ka = new https.Agent({ keepAlive: true });
const IDS = (process.env.SEL || 'H,A,Q,S,T,D,Z,TH,KH,GH,V,SH,OK1,OK2,OK3,L3').split(',');
const MODELES = (process.env.MODELES || 'gemini-3.5-flash-lite:MINIMAL,gemini-3.8-flash:LOW').split(
  ',',
);
const INVITES = {
  neutre: `Tu es un transcripteur PHONÉTIQUE de l'arabe. Un apprenant (non arabophone) dit une courte phrase. Écris EXACTEMENT les sons qu'il a prononcés, en lettres arabes entièrement vocalisées, lettre par lettre, comme une dictée : NE CORRIGE RIEN, ne devine pas le mot voulu, n'écris pas le mot le plus probable. Si un son est prononcé à la place d'un autre, écris la lettre du son ENTENDU. Réponds seulement par le JSON demandé.`,
  amorce: `Tu es un transcripteur PHONÉTIQUE de l'arabe. Un apprenant (non arabophone) dit une courte phrase. Écris EXACTEMENT les sons qu'il a prononcés, en lettres arabes entièrement vocalisées, lettre par lettre, comme une dictée : NE CORRIGE RIEN, ne devine pas le mot voulu, n'écris pas le mot le plus probable. Les apprenants confondent souvent ح/ه، ع/ء، ق/ك، ص/س، ط/ت، ض/د، ظ/ذ/ز، ث/س، خ/ه، غ/ر, les voyelles longues et brèves, la shadda : écris la lettre et la voyelle VRAIMENT entendues, même si le mot obtenu n'existe pas ou change de sens. Si le son est juste, écris-le juste. Réponds seulement par le JSON demandé.`,
};
const LECON =
  `Tu écoutes un apprenant NON arabophone qui parle en arabe littéral dans la situation de sa leçon (dialogue ci-dessous : il sert seulement à savoir quels mots il VEUT dire). Ta seule tâche : repérer ses fautes de PRONONCIATION nettes.
- « entendu » : les sons exactement prononcés, lettre par lettre et vocalisés, comme une dictée, SANS corriger ni deviner : s'il dit هِسَاب pour حِسَاب, tu écris هِسَاب ; s'il dit كَلْب pour قَلْب, tu écris كَلْب.
- « voulu » : la phrase qu'il voulait dire, écrite correctement et vocalisée.
- « fautes » : les mots (deux au plus) où un SON a été nettement remplacé par un autre : {entendu: le mot tel qu'entendu, correct: le mot juste vocalisé}. Sons à surveiller : ح/ه، ع/ء، ق/ك، ص/س، ط/ت، ض/د، ظ/ذ/ز، ث/س، خ/ه، غ/ر, voyelle longue ou brève, shadda. Liste VIDE si la prononciation est juste, au moindre doute, ou pour un simple accent.
Réponds seulement par le JSON demandé.
<dialogue_de_la_lecon>` +
  DIALOGUE +
  `</dialogue_de_la_lecon>`;
INVITES.lecon = LECON;
const SCHEMA_L = {
  type: 'OBJECT',
  properties: {
    entendu: { type: 'STRING' },
    voulu: { type: 'STRING' },
    fautes: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { entendu: { type: 'STRING' }, correct: { type: 'STRING' } },
        required: ['entendu', 'correct'],
      },
    },
  },
  required: ['entendu', 'voulu', 'fautes'],
  propertyOrdering: ['entendu', 'voulu', 'fautes'],
};
const SCHEMA = {
  type: 'OBJECT',
  properties: { entendu: { type: 'STRING' } },
  required: ['entendu'],
};
const SECURITE = REGLAGES_GENERATION.securite.categories.map((category) => ({
  category,
  threshold: REGLAGES_GENERATION.securite.seuil,
}));
const TARIF = {
  'gemini-3.8-flash': [0.825, 4.125],
  'gemini-3.5-flash-lite': [0.33, 2.75],
  'gemini-3.1-flash-lite': [0.55, 1.65],
};

function appel(modele, corps) {
  return new Promise((ok) => {
    const t0 = performance.now();
    jeton.obtenir().then((j) => {
      const req = https.request(
        {
          host: 'aiplatform.eu.rep.googleapis.com',
          method: 'POST',
          agent: ka,
          timeout: 12000,
          path: `/v1/projects/${PROJET}/locations/eu/publishers/google/models/${modele}:generateContent`,
          headers: { authorization: `Bearer ${j}`, 'content-type': 'application/json' },
        },
        (res) => {
          let b = '';
          res.setEncoding('utf8');
          res.on('data', (c) => (b += c));
          res.on('end', () => {
            let j = null;
            try {
              j = JSON.parse(b);
            } catch {}
            ok({ statut: res.statusCode, ms: ms(t0), j, brut: j ? '' : b.slice(0, 200) });
          });
        },
      );
      req.on('error', (e) => ok({ erreur: String(e), ms: ms(t0) }));
      req.on('timeout', () => req.destroy(new Error('delai')));
      req.end(JSON.stringify(corps));
    });
  });
}

let depense = 0;
const res = [];
for (const mm of MODELES) {
  const [modele, refl] = mm.split(':');
  for (const [nom, inv] of Object.entries(INVITES)) {
    if (process.env.INVITES && !process.env.INVITES.split(',').includes(nom)) continue;
    for (const id of IDS) {
      const audio = readFileSync(`/essai/audio/${id}.mp3`);
      const corps = {
        systemInstruction: { parts: [{ text: inv }] },
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType: 'audio/mpeg', data: audio.toString('base64') } },
              { text: 'Transcris littéralement.' },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: nom === 'lecon' ? SCHEMA_L : SCHEMA,
          maxOutputTokens: 1024,
          temperature: 0,
          ...(refl ? { thinkingConfig: { thinkingLevel: refl } } : {}),
        },
        safetySettings: SECURITE,
        labels: { app: 'awzid', fonction: 'tuteur-essai' },
      };
      const r = await appel(modele, corps);
      const c0 = r.j?.candidates?.[0];
      const u = r.j?.usageMetadata ?? {};
      const [ti, to] = TARIF[modele];
      const cout =
        ((u.promptTokenCount ?? 0) * ti +
          ((u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0)) * to) /
        1e6;
      depense += cout;
      let e = null;
      try {
        const o = JSON.parse(
          (c0?.content?.parts ?? [])
            .filter((p) => !p.thought)
            .map((p) => p.text)
            .join(''),
        );
        e = nom === 'lecon' ? JSON.stringify(o) : o.entendu;
      } catch {}
      const secu = (c0?.safetyRatings ?? [])
        .filter((x) => x.blocked || (x.probability && x.probability !== 'NEGLIGIBLE'))
        .map((x) => `${x.category}:${x.probability}${x.blocked ? ':BLOQUE' : ''}`);
      res.push({
        id,
        modele,
        invite: nom,
        ms: r.ms,
        fin: c0?.finishReason,
        entendu: e,
        secu,
        in: u.promptTokenCount,
        out: u.candidatesTokenCount,
        pensee: u.thoughtsTokenCount,
      });
      console.log(
        `${id} ${modele} ${nom} ${r.statut} ${c0?.finishReason} ${r.ms} ms in=${u.promptTokenCount} out=${u.candidatesTokenCount} pensee=${u.thoughtsTokenCount ?? 0} | ${e} ${secu.length ? '| SECU ' + secu.join(' ') : ''}${r.erreur || r.brut ? ' | ERR ' + (r.erreur || r.brut) : ''}`,
      );
      await new Promise((x) => setTimeout(x, 800));
    }
  }
}
console.log('dépense estimée', depense.toFixed(4), '€');
writeFileSync(`/essai/exp2-${Date.now()}.json`, JSON.stringify(res, null, 1));
