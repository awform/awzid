/* eslint-disable -- outil d'exploitation (inventaire audio global du 26/10/2026), pas du code de l'application */
// Collecteurs : religion, lectures, Coran-lecture, hifz, vivre (fiches, douas), prière, Madjaliss, mutashābihāt, interface arabe
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import * as L from './lib.mjs';
const CD = '/home/awzid/awform-content/data';
const W = '/home/awzid/awform-demo/';
const AR = /[ء-ي]/;
const SKIP_KEY =
  /(^|_)fr$|^(src|source|sources|codes?|id|type|ref|refs|serie|niveau|public|domaine|sous_domaine|competences|prerequis|renvoi_[a-z]+|ar_source|consigne_tuteur|reponse|options|cible|grille|controle)$/;

/** parcourt un objet : appelle cb(chaîne arabe, chemin) ; ignore les champs français et techniques */
export function walkAr(v, cb, p = '') {
  if (typeof v === 'string') {
    if (AR.test(v)) cb(v, p);
  } else if (Array.isArray(v)) v.forEach((x, i) => walkAr(x, cb, p + '[]'));
  else if (v && typeof v === 'object')
    for (const [k, x] of Object.entries(v)) {
      if (!SKIP_KEY.test(k)) walkAr(x, cb, p + '.' + k);
    }
}
const ctxDe = (p) => ({
  coran:
    /\.coran\b|versets_ref|\.mushaf\b|verset_tanzil|\.extraits\[\]\.vers|\.versets\b/.test(p) ||
    undefined,
  hadith: /hadith/.test(p) || undefined,
  dhikr: /formules|\.dire\b|situations|\.invocation/.test(p) || undefined,
});
const parseLivre = (livre, f) =>
  L.C.parseDataFile(readFileSync(join(CD, livre, f), 'utf8'), f).value;

export function religionEtLectures() {
  const jobs = [];
  for (const livre of ['re1', 're2', 're3', 're4', 're5'])
    jobs.push({ surface: 'religion-livres-enfants', livre, niveaux: [livre] });
  for (const livre of ['ra1', 'ra2', 'ra3', 'ra4'])
    jobs.push({ surface: 'religion-livres-ados-adultes', livre, niveaux: [livre] });
  for (const livre of ['qc1', 'qc2', 'qc3'])
    jobs.push({ surface: 'coran-lecture-qc', livre, niveaux: [livre] });
  for (const { surface, livre, niveaux } of jobs) {
    const d = join(CD, livre);
    for (const f of readdirSync(d)
      .filter((x) => /^(l\d+|book)\.js$/.test(x))
      .sort()) {
      const v = parseLivre(livre, f);
      const proj = f === 'book.js' ? v : L.C.studentProjection(v, livre);
      walkAr(proj, (s, p) =>
        L.noter({
          surface,
          niveau: livre,
          id: `${livre}.${f.replace('.js', '')}${p.replace(/\[\]/g, '')}`,
          texte: s,
          niveaux,
          ctx: ctxDe(p),
        }),
      );
    }
  }
  // lectures graduées (lect-*)
  const dl = join(CD, 'lect');
  for (const f of readdirSync(dl)
    .filter((x) => x.endsWith('.js'))
    .sort()) {
    const code = f.replace('.js', '');
    const v = parseLivre('lect', f);
    walkAr(v, (s, p) =>
      L.noter({
        surface: 'lectures-graduees',
        niveau: code.replace(/-\d+$/, ''),
        id: `lect-${code}${p.replace(/\[\]/g, '')}`,
        texte: s,
        niveaux: [`lect-${code}`],
        ctx: ctxDe(p),
      }),
    );
  }
  // gp (blocs coraniques), livrets hifz
  for (const f of readdirSync(join(CD, 'gp')).filter((x) => x.endsWith('.js'))) {
    walkAr(parseLivre('gp', f), (s, p) =>
      L.noter({
        surface: 'gp-valeurs',
        niveau: 'gp',
        id: `gp.${f}${p.replace(/\[\]/g, '')}`,
        texte: s,
        niveaux: ['gp'],
        ctx: { ...ctxDe(p), coran: /blocs/.test(p) || undefined },
      }),
    );
  }
  for (const f of readdirSync(join(CD, 'hifz'))
    .filter((x) => x.endsWith('.js'))
    .sort()) {
    const code = f.replace('.js', '');
    walkAr(parseLivre('hifz', f), (s, p) =>
      L.noter({
        surface: 'hifz-livrets',
        niveau: code,
        id: `hifz.${code}${p.replace(/\[\]/g, '')}`,
        texte: s,
        niveaux: ['hifz-' + code],
        ctx: { coran: /tajwid_ex/.test(p) || undefined },
      }),
    );
  }
}

export function vivreFiches() {
  const d = join(CD, 'akhlaq', 'fiches');
  for (const f of readdirSync(d)
    .filter((x) => x.endsWith('.json'))
    .sort()) {
    const j = JSON.parse(readFileSync(join(d, f), 'utf8'));
    walkAr(j, (s, p) =>
      L.noter({
        surface: 'vivre-fiches-adab',
        niveau: 'akhlaq',
        id: `${f.replace('.json', '')}${p.replace(/\[\]/g, '')}`,
        texte: s,
        niveaux: ['akhlaq', 'akhlaq-enf'],
        ctx: { dhikr: /\.dire/.test(p) || undefined },
      }),
    );
  }
}

export function douas() {
  const j = JSON.parse(readFileSync(W + 'apps/web/static/douas/douas.json', 'utf8'));
  for (const [id, d] of Object.entries(j.douas)) {
    if (!d.ar) continue;
    L.noter({
      surface: 'vivre-douas',
      niveau: 'douas',
      id,
      texte: d.ar,
      audio: !!d.audio,
      ctx: { dhikr: true, hadith: !!d.source?.recueil },
      note: d.rubrique,
    });
  }
}

export function priere() {
  const d = JSON.parse(readFileSync(W + 'packages/content/data/priere/priere.json', 'utf8'));
  const walk = (x, pk, ctxPere) => {
    if (Array.isArray(x)) return x.forEach((y) => walk(y, pk, ctxPere));
    if (!x || typeof x !== 'object') return;
    const coranCle = pk === 'debut' || pk === 'fin' || pk === 'ar_versets';
    if (typeof x.ar === 'string' && AR.test(x.ar) && pk !== 'mot_a_mot') {
      const a = x.audio;
      const ayyub = coranCle || (typeof a === 'string' && a.startsWith('ayyub:'));
      const id = x.id ?? pk;
      if (ayyub)
        L.noter({
          surface: 'priere-coran-ayyub-existant',
          niveau: 'priere',
          id,
          texte: x.ar,
          audio: true,
          ctx: { coran: true },
        });
      else
        L.noter({
          surface: 'priere',
          niveau: 'priere',
          id,
          texte: x.ar,
          niveaux: ['priere'],
          audio: a === 'tts' ? L.aFichier(x.ar, 'priere') : false,
          ctx: {
            hadith:
              x.type === 'preuve' ||
              x.type === 'preuves' ||
              pk === 'preuves' ||
              x.type === 'preuve' ||
              undefined,
          },
          note: a === 'tts' ? 'bouton prévu' : 'aucun bouton',
        });
    }
    for (const [k, y] of Object.entries(x))
      if (k !== 'ar_source' && k !== 'mot_a_mot' && k !== 'ar') {
        if (k === 'ar_versets')
          for (const v of y) {
            if (v.ar)
              L.noter({
                surface: 'priere-coran-ayyub-existant',
                niveau: 'priere',
                id: v.ref ?? 'ar_versets',
                texte: v.ar,
                audio: true,
                ctx: { coran: true },
              });
          }
        else walk(y, k);
      }
  };
  walk(d, 'root');
}

export function madjaliss() {
  const idx = JSON.parse(readFileSync(L.HOME + 'madjaliss-audio/index_madjaliss.json', 'utf8'));
  const actifs = [
    'akhdari',
    'ashmawiyya',
    'tuhfa',
    'ibn-ashir',
    'izziyya',
    'ajurrumiyya',
    'jazariyya',
    'bayquniyya',
    'nawawi',
    'waraqat',
    'risala',
    'lamiyya',
  ];
  for (const m of actifs) {
    const f = W + `apps/web/static/mutun/${m}.json`;
    if (!existsSync(f)) continue;
    const j = JSON.parse(readFileSync(f, 'utf8'));
    const avec = idx.textes[m] ?? {};
    for (const p of j.phrases ?? []) {
      let texte = null;
      let ctx = {};
      if (typeof p.ar === 'string') texte = p.ar;
      else if (Array.isArray(p.ar)) {
        texte = p.ar.map((x) => (typeof x === 'string' ? x : (x.q ?? ''))).join(' ');
        if (p.ar.some((x) => x && typeof x === 'object' && x.q)) ctx = { hadith: undefined };
      } else if (Array.isArray(p.h)) texte = p.h.join(' ');
      else if (typeof p.titre === 'string') texte = p.titre;
      if (!texte) continue;
      const q = Array.isArray(p.ar)
        ? p.ar.filter((x) => x && typeof x === 'object' && x.q).map((x) => x.q)
        : [];
      L.noter({
        surface: 'madjaliss-phrases',
        niveau: m,
        id: p.id,
        texte,
        audio: !!avec[p.id],
        nature: q.length ? 'a' : undefined,
        ctx,
        note:
          (idx.sans_audio[m]?.[p.id] ?? (avec[p.id] ? '' : "pas dans l'index Madjaliss")).slice(
            0,
            80,
          ) + (q.length ? ' | verset: ' + q.join(' ') : ''),
      });
    }
    for (const s of j.seances ?? [])
      for (const w of s.mots ?? [])
        if (w.ar)
          L.noter({
            surface: 'madjaliss-vocabulaire',
            niveau: m,
            id: `${m} séance mot`,
            texte: w.ar,
            audio: false,
            ctx: {},
          });
  }
}

export function mutashabihat() {
  const v = JSON.parse(
    readFileSync(W + 'packages/content/data/mutashabihat/mutashabihat.json', 'utf8'),
  );
  const refs = new Set();
  for (const g of v.groupes) for (const m of g.membres ?? []) refs.add(m.ref);
  for (const g of v.groupes)
    for (const p of g.paires ?? [])
      for (const k of ['a', 'b']) {
        const r = p[k]?.ref ?? p['ref_' + k];
        if (r) refs.add(r);
      }
  for (const r of refs) {
    const t = L.tanzil.get(r);
    if (t)
      L.noter({
        surface: 'mutashabihat',
        niveau: 'coran',
        id: r,
        texte: t,
        audio: false,
        nature: 'a',
        note: 'verset entier (Ayyūb)',
      });
  }
  return refs.size;
}

export const AGREGES = [];
/** surfaces coraniques pilotées par référence (le texte vient de Tanzil, la voix est celle d'Ayyūb) : une ligne par surface */
export function coranAgreges() {
  const surfaces = [
    ['coran-lecteur', 'lecteur et mushaf : 114 sourates, 6 236 versets'],
    [
      'coran-mot-a-mot',
      'mot à mot : 77 430 mots du Coran affichés avec leur sens (aucun audio par mot, seulement par verset)',
    ],
    ['coran-khatma-lecture-du-jour', 'khatma et lecture du jour : portions de 1:1 à 114:6'],
    [
      'coran-hifz-memoriser',
      'hifẓ (mémoriser, révisions, hifẓ en classe, récital) : tout verset au programme',
    ],
    ['coran-retrouver-un-verset', "retrouver un verset : le verset trouvé s'affiche"],
    [
      'coran-tafsir-si-affiche',
      "tafsīr : le texte arabe du verset commenté s'affiche (le commentaire lui-même est en français)",
    ],
  ];
  for (const [surface, note] of surfaces)
    AGREGES.push({
      surface,
      niveau: 'coran',
      id: 'ensemble',
      texte: `[${note}]`,
      nature: 'a',
      refs: '1:1-114:6',
      precision: 'surface-par-reference',
      sha: '',
      cours: false,
      ailleurs: false,
      voc: true,
      note: 'voix attendue : Ayyūb (agent « lecteur partout »)',
      cible: 'ayyub',
    });
}

export function lemmes() {
  const lignes = readFileSync(W + 'packages/coran-mots-data/data/lemmes.tsv', 'utf8').split('\n');
  for (const l of lignes) {
    const c = l.split('\t');
    if (c.length < 5 || !AR.test(c[1])) continue;
    L.noter({
      surface: 'coran-mots-lemmes',
      niveau: 'coran-mots',
      id: c[0],
      texte: c[1],
      audio: false,
      ctx: {},
      note: `racine ${c[2]} · ${c[3]} · ${c[4]} occurrences`,
    });
  }
}

export function termesI18n() {
  const D = W + 'apps/web/static/i18n/';
  for (const f of readdirSync(D).filter((x) => /^fr.*\.json$/.test(x))) {
    const j = JSON.parse(readFileSync(D + f, 'utf8'));
    const walk = (v, p) => {
      if (typeof v === 'string') {
        for (const m of v.matchAll(/[ء-يً-ٰٟٱ][ء-يً-ٰٟٱ\s]*/g)) {
          const s = m[0].trim();
          if (s.split(' ').join('').length >= 2)
            L.noter({
              surface: 'plus-aide-termes-arabes-dans-le-francais',
              niveau: 'interface',
              id: `${f}:${p}`,
              texte: s,
              audio: undefined,
              ctx: {},
              note: 'terme arabe dans une phrase française',
            });
        }
      } else if (v && typeof v === 'object')
        for (const [k, x] of Object.entries(v)) walk(x, p ? p + '.' + k : k);
    };
    walk(j, '');
  }
}

/** chaînes arabes citées dans le code de l'interface (titres, consignes, intitulés) */
export function interfaceArabe() {
  const fichiers = [
    'apps/web/src/lib/quran/sura-names-ar.ts',
    'apps/web/src/lib/trace/letters.ts',
    'apps/web/src/lib/parcours/UniteCouverture.svelte',
    'apps/web/src/routes/quotidien/+page.svelte',
    'apps/web/src/routes/lecons/[id]/+page.svelte',
    'apps/web/src/lib/Exercise.svelte',
    'apps/web/src/lib/LettresLecon.svelte',
    'apps/web/src/routes/vivre/+page.svelte',
    'apps/web/src/routes/sciences/+page.svelte',
    'apps/web/src/routes/coran/+page.svelte',
    'apps/web/src/lib/madjaliss/cycles.ts',
    'apps/web/src/routes/coran/lecteur/+page.svelte',
    'apps/web/src/routes/tuteur/[unit]/+page.svelte',
    'apps/web/src/routes/vivre/douas/+page.svelte',
    'apps/web/src/lib/quran/riwayat.ts',
    'apps/web/src/lib/video/lecteur-v2.ts',
    'apps/web/src/lib/video/lecteur.ts',
    'apps/web/src/lib/video/lecteur-cahier.ts',
    'packages/content/src/roots.ts',
    'apps/web/src/lib/qc/check.ts',
    'apps/web/src/lib/madjaliss/quiz.ts',
    'apps/web/src/lib/theme/signes.ts',
    'packages/content/src/akhlaq.ts',
  ];
  const re = /(['"`])((?:(?!\1)[^\\\n]|\\.)*?)\1/g;
  for (const f of fichiers) {
    const t = readFileSync(W + f, 'utf8');
    let m;
    while ((m = re.exec(t))) {
      const s = m[2].replace(/\\u([0-9a-fA-F]{4})/g, (_, h) =>
        String.fromCharCode(parseInt(h, 16)),
      );
      if (!AR.test(s) || (/\$\{|[A-Za-z]{4,}/.test(s) && !/^[؀-ۿ\s]+$/.test(s))) continue;
      const arabe = s
        .replace(/[^ء-يً-ٰٟٱ\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (!AR.test(arabe)) continue;
      const surface = /sura-names/.test(f)
        ? 'coran-noms-sourates'
        : /letters\.ts/.test(f)
          ? 'ecriture-tracer-lettres'
          : /roots/.test(f)
            ? 'arabe-racines-pluriels'
            : 'interface-titres-consignes';
      L.noter({
        surface,
        niveau: 'interface',
        id: f.split('/').slice(-1)[0],
        texte: arabe,
        audio: undefined,
        niveaux: undefined,
        ctx: {},
        note: "niveau d'audio dépend de la page",
      });
    }
  }
}
