// Cahier de lecture, niveau 1 (25/10/2026) — DONNÉES DES JEUX de fin de grille des cahiers des enfants (en1) et des
// ados (ado1), générées depuis le cahier lui-même (source unique packages/content/data/cahier/<niveau>.json) :
//  - `construis` : mots à construire (lettres glissées dans les cases de droite à gauche, puis le signe de chaque lettre) ;
//  - `trouve` : manches « j'entends une syllabe (ou un mot), je touche la bonne parmi 3 ou 4 » (aussi le défi chrono et le
//    duel des ados) ;
//  - `colorie` : le « je colorie » de la grille ;
//  - `signes` : le SON de chaque signe, donné par la syllabe de la grille qui porte ce signe sur la lettre de la grille.
// Règles (contrôlées par src/lib/cahier/jeux.test.ts, qui refait l'analyse sans passer par ces données) :
//  - uniquement des mots et des syllabes DÉJÀ VUS dans le cahier (éléments des pages, jamais les mots des bilans à froid,
//    qui doivent rester inconnus) et décodables à la leçon `n` (lettres et signes enseignés, `cahier-regles.mjs`) ;
//  - chaque mot ou syllabe a son AUDIO (liste du cahier) : sinon il est exclu ;
//  - aucun mot attesté dans le Coran à l'identique pour « Construis le mot » (garde du cahier de l'atelier d'ad1) ;
//  - l'arabe est recopié tel quel (aucune normalisation) ; les signes sont des CLÉS (fatha, kasra, shadda_fatha…), jamais
//    des noms latins affichés à l'élève.
import { analyser, CLES_SIGNES, leconDuSigne, lettresN, recomposer } from './cahier-regles.mjs';

/** petit générateur pseudo-aléatoire déterministe (mulberry32) à partir d'une chaîne */
function graine(s) {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const melanger = (liste, rnd) => {
  const a = [...liste];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const MAX_MOTS = 24;
const MAX_MANCHES = 14;
const LONG_MIN = 2;
const LONG_MAX = 6;

/** contexte : éléments vus du cahier (syllabes, mots) avec leur leçon requise, et textes qui ont un audio */
export function contexteJeux(src, niveau, audio) {
  const lettreN = lettresN(src);
  const avecAudio = new Set([
    ...(audio.tts ?? []),
    ...(audio.tts_syllabe ?? []),
    ...(audio.tts_controle ?? []),
  ]);
  const syllabes = new Map();
  const mots = new Map();
  // mots des bilans à froid : l'élève ne doit pas les avoir vus avant le bilan, où qu'ils apparaissent dans le cahier
  const motsDeBilan = new Set();
  for (const p of src.pages)
    if (p.type === 'bilan')
      for (const b of p.blocs ?? [])
        for (const e of b.elements ?? []) if (typeof e.ar === 'string') motsDeBilan.add(e.ar);
  const ajouterMot = (ar, coran, img) => {
    if (typeof ar !== 'string' || /\s/.test(ar) || !avecAudio.has(ar) || motsDeBilan.has(ar))
      return;
    const a = analyser(ar, niveau, lettreN);
    if (!a.ok || a.segs.length < LONG_MIN || a.segs.length > LONG_MAX) return;
    const ex = mots.get(ar);
    if (ex) {
      ex.coran ||= coran;
      return;
    }
    mots.set(ar, { ar, n: a.n, segs: a.segs, coran: !!coran, ...(img ? { img } : {}) });
  };
  const ajouterSyllabe = (ar) => {
    if (typeof ar !== 'string' || !avecAudio.has(ar) || syllabes.has(ar)) return;
    const a = analyser(ar, niveau, lettreN);
    if (a.ok) syllabes.set(ar, { ar, n: a.n, segs: a.segs });
  };
  for (const p of src.pages) {
    const bilan = p.type === 'bilan';
    for (const b of p.blocs ?? []) {
      for (const e of b.elements ?? []) {
        if (e.nature === 'syllabe') ajouterSyllabe(e.ar);
        for (const c of e.cellules ?? []) if (c.nature === 'syllabe') ajouterSyllabe(c.ar);
        if (bilan) continue;
        const coran = e.src?.type === 'coran' || !!e.src?.coran;
        if (e.nature === 'mot') ajouterMot(e.ar, coran, e.img);
        if (e.nature === 'paire') {
          ajouterMot(e.a?.ar, e.a?.src?.type === 'coran' || !!e.a?.src?.coran);
          ajouterMot(e.b?.ar, e.b?.src?.type === 'coran' || !!e.b?.src?.coran);
        }
        // mots des jeux papier (atelier d'en1, jeux des ados) : mots de la page, avec leur audio
        if (e.nature === 'atelier')
          ajouterMot(e.solution, !!e.src?.coran || e.src?.type === 'coran', e.img);
        if (e.nature === 'jeu') {
          for (const m of e.mots ?? [])
            ajouterMot(m.mot?.ar ?? m.ar, m.mot?.src?.type === 'coran' || !!m.mot?.src?.coran);
          for (const m of [...(e.joueur_a ?? []), ...(e.joueur_b ?? [])])
            ajouterMot(m.ar, m.src?.type === 'coran' || !!m.src?.coran);
        }
      }
    }
  }
  return { niveau, lettreN, avecAudio, syllabes, mots };
}

/** leçon du premier affichage d'un texte : sa leçon requise (Infinity : repli sur la leçon de la page) */
export function nDe(texte, ctx, repli) {
  const a = analyser(texte, ctx.niveau, ctx.lettreN);
  return Number.isFinite(a.n) ? a.n : repli;
}

/** lettre de la grille, d'après son titre (« La grille de la lettre ب ») ou la première cellule de la première ligne */
export function lettreDeGrille(page) {
  const g = (page.blocs ?? []).find((b) => b.type === 'grille');
  const premiere = g?.elements?.[0]?.cellules?.[0]?.ar ?? '';
  const m = /[\u0621-\u064a]/.exec(premiere);
  return m ? m[0] : '';
}

/** son de chaque signe : syllabe de la grille qui porte ce signe sur la lettre de la grille (rang 1 : voyelles, etc.) */
function signesDeGrille(grille, ctx) {
  const out = {};
  // d'abord les syllabes d'UNE lettre (voyelles, tanwīn : le signe est sur la lettre de la grille), puis celles de deux
  // lettres (soukoun, chadda : après une hamza)
  for (const nb of [1, 2]) {
    for (const r of grille.elements) {
      for (const c of r.cellules) {
        const a = analyser(c.ar, ctx.niveau, ctx.lettreN);
        if (!a.ok || !ctx.avecAudio.has(c.ar)) continue;
        const utiles = a.segs.filter((g) => !g.fixe);
        if (utiles.length !== nb) continue;
        const s = utiles[nb - 1].s;
        if (s && !out[s]) out[s] = c.ar;
      }
    }
  }
  // dans l'ordre d'enseignement du livre, chacun avec la leçon où il est enseigné
  return CLES_SIGNES.filter((k) => out[k])
    .map((k) => ({ k, ar: out[k], n: leconDuSigne(ctx.niveau, k) }))
    .filter((s) => Number.isFinite(s.n))
    .sort((a, b) => a.n - b.n);
}

/** lettres de la « famille » d'une grille : l'alif et la hamza (grille d'ado1) vont ensemble */
const famille = (lettre) =>
  new Set(/[ءأإاؤئ]/.test(lettre) ? ['ا', 'أ', 'إ', 'ء', 'ؤ', 'ئ'] : [lettre]);

/** mot à construire : cases `[lettre, signe]` ; `signe` vide pour la prolongation (lettre qui n'a pas de signe) */
const motAConstruire = (m) => ({
  ar: m.ar,
  c: m.segs.map((g) => [g.l, g.s]),
  n: m.n,
  ...(m.img ? { img: m.img } : {}),
});

export function jeuxDePage(page, ctx, repliN) {
  const grille = (page.blocs ?? []).find((b) => b.type === 'grille');
  if (!grille) return null;
  const lettre = lettreDeGrille(page);
  const rnd = graine(`${ctx.niveau}:${page.id}`);

  // ——— Construis le mot : mots du cahier qui contiennent la lettre de la grille
  const lettres = famille(lettre);
  const candidats = [...ctx.mots.values()]
    .filter((m) => !m.coran && m.segs.some((g) => lettres.has(g.l)))
    .sort((a, b) => a.n - b.n || a.segs.length - b.segs.length || a.ar.localeCompare(b.ar));
  // un échantillon de chaque palier de leçon (2 par palier), pour que le jeu existe dès que possible et couvre tous les signes
  const signes = signesDeGrille(grille, ctx);
  const parN = new Map();
  for (const m of candidats) {
    // le son de chaque signe du mot doit être connu (syllabe de la grille), sinon le mot est exclu
    if (!m.segs.every((g) => !g.s || signes.some((s) => s.k === g.s))) continue;
    const l = parN.get(m.n) ?? [];
    if (l.length < 2) l.push(m);
    parN.set(m.n, l);
  }
  const construis = [...parN.values()].flat().slice(0, MAX_MOTS).map(motAConstruire);

  // ——— Trouve la syllabe / le mot : manches à 4 choix (la cible en premier)
  const cellules = grille.elements.flatMap((r) => r.cellules.map((c) => c.ar));
  const cibles = [];
  for (const ar of cellules) {
    const s = ctx.syllabes.get(ar);
    if (s && !cibles.includes(s)) cibles.push(s);
  }
  const toutes = [...ctx.syllabes.values()];
  const premiereLettre = (s) => s.segs[0].l;
  const signeDe = (s) => s.segs.map((g) => g.s).join('+');
  const manches = [];
  for (const t of cibles) {
    const ok = (s) =>
      s.ar !== t.ar &&
      s.n <= Math.max(t.n, 1) &&
      s.segs.length === t.segs.length &&
      s.segs.every((g, i) => !!g.fixe === !!t.segs[i].fixe);
    const memeLettre = toutes.filter(
      (s) => ok(s) && premiereLettre(s) === premiereLettre(t) && signeDe(s) !== signeDe(t),
    );
    const memeSigne = toutes.filter(
      (s) => ok(s) && premiereLettre(s) !== premiereLettre(t) && signeDe(s) === signeDe(t),
    );
    const autres = toutes.filter(
      (s) => ok(s) && premiereLettre(s) !== premiereLettre(t) && signeDe(s) !== signeDe(t),
    );
    const choix = [t];
    for (const liste of [memeLettre, memeSigne, memeLettre, memeSigne, autres, autres]) {
      if (choix.length >= 4) break;
      const l = melanger(liste, rnd).find((s) => !choix.includes(s));
      if (l) choix.push(l);
    }
    if (choix.length === 4)
      manches.push({
        k: 's',
        cible: t.ar,
        choix: choix.map((s) => s.ar),
        n: Math.max(...choix.map((s) => s.n)),
      });
  }
  // manches « mot » : mots de la grille (même lettre) contre des mots de même longueur du cahier
  const motsPage = [...ctx.mots.values()]
    .filter((m) => m.segs.some((g) => lettres.has(g.l)))
    .sort((a, b) => a.n - b.n || a.ar.localeCompare(b.ar));
  const parNm = new Map();
  for (const t of motsPage) {
    const l = parNm.get(t.n) ?? [];
    if (l.length < 2) l.push(t);
    parNm.set(t.n, l);
  }
  for (const t of [...parNm.values()].flat()) {
    const proches = [...ctx.mots.values()].filter(
      (m) => m.ar !== t.ar && m.n <= t.n && Math.abs(m.segs.length - t.segs.length) <= 1,
    );
    const choix = [t];
    for (const m of melanger(proches, rnd)) {
      if (choix.length >= 4) break;
      if (!choix.includes(m)) choix.push(m);
    }
    if (choix.length === 4)
      manches.push({ k: 'm', cible: t.ar, choix: choix.map((m) => m.ar), n: t.n });
  }
  // au plus MAX_MANCHES manches de chaque sorte, les plus précoces d'abord
  const trie = (k) =>
    manches
      .filter((m) => m.k === k)
      .sort((a, b) => a.n - b.n)
      .slice(0, MAX_MANCHES);
  const trouve = [...trie('s'), ...trie('m').slice(0, 12)];

  // ——— Je colorie : syllabes de la lettre, parmi des syllabes d'autres lettres (source du cahier, `jeu_grille`)
  const jg = (page.blocs ?? []).find((b) => b.type === 'jeu_grille');
  const col = jg?.elements?.find((e) => e.nature === 'colorie');
  const colorie = col
    ? {
        lettre: col.lettre,
        cases: col.cases
          .filter((c) => ctx.avecAudio.has(c.ar))
          .map((c) => ({ ar: c.ar, cible: !!c.cible, n: nDe(c.ar, ctx, repliN) })),
      }
    : null;

  return {
    lettre,
    signes,
    construis,
    trouve,
    ...(colorie ? { colorie } : {}),
  };
}

export { recomposer };
