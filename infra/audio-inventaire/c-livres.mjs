// Collecteurs : leçons + vidéos vivantes (19 livres), cahiers de lecture, cahiers « Je parle »
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import * as L from './lib.mjs';
const P = '/home/awzid/awform-demo/packages/content/dist/';
const V = await import(P + 'video.js');
const VN = await import(P + 'video-niveaux.js');
const CD = '/home/awzid/awform-content/data';
const STATIC = '/home/awzid/awform-demo/apps/web/static/cahier-data';

const raw = (livre, f) => L.C.parseDataFile(readFileSync(join(CD, livre, f), 'utf8'), f).value;
const strings = (v, out = []) => {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => strings(x, out));
  return out;
};

export function lecons() {
  const livres = [...VN.VIDEO_NIVEAUX];
  for (const livre of livres) {
    const d = join(CD, livre);
    if (!existsSync(d)) continue;
    for (const f of readdirSync(d)
      .filter((x) => /^l\d+\.js$/.test(x))
      .sort()) {
      const Lc = L.C.studentProjection(raw(livre, f), livre);
      const images = new Set(strings([Lc.mots, Lc.exercices]).filter((s) => /^[a-z_]+$/.test(s)));
      const audioList = [...L.index].filter(([, n]) => n.has(livre)).map(([sha]) => sha);
      const v = V.buildVideo(Lc, {
        unitId: `${livre}.${f.slice(0, 3)}`,
        hasAudio: (s) => L.aFichier(s, livre),
        images,
        audioList,
      });
      for (const s of v.sansSon)
        L.noter({
          surface: 'lecons-et-videos',
          niveau: livre,
          id: `${livre}.${f.slice(0, 3)} ${s.part}`,
          texte: s.texte,
          niveaux: livre,
        });
      for (const s of v.signalements)
        L.noter({
          surface: 'lecons-et-videos',
          niveau: livre,
          id: `${livre}.${f.slice(0, 3)} garde:${s.raison}`,
          texte: s.texte,
          niveaux: livre,
        });
    }
  }
}

export function cahierLecture() {
  for (const [n, niveau] of [
    ['ad1', 'ad1'],
    ['en1', 'cahier-lecture-en1'],
    ['ado1', 'cahier-lecture-ado1'],
  ]) {
    const f = join(STATIC, `${n}.json`);
    if (!existsSync(f)) continue;
    const surface = 'cahier-lecture';
    const walk = (x, page) => {
      if (Array.isArray(x)) return x.forEach((y) => walk(y, page));
      if (!x || typeof x !== 'object') return;
      const o = x;
      if (typeof o.ar === 'string' && typeof o.a === 'string' && /[ء-ي]/.test(o.ar)) {
        if (o.a === 'q')
          L.noter({
            surface: 'cahier-lecture-recites-ayyub',
            niveau: n,
            id: page,
            texte: o.ar,
            audio: true,
          });
        else L.noter({ surface, niveau: n, id: page, texte: o.ar, niveaux: niveau });
      }
      if (Array.isArray(o.lignes) && typeof o.a === 'string') {
        const recite = o.recite ?? {};
        for (const l of o.lignes) {
          if (typeof l !== 'string' || !/[ء-ي]/.test(l)) continue;
          if (o.a === 'q' || l in recite)
            L.noter({
              surface: 'cahier-lecture-recites-ayyub',
              niveau: n,
              id: page,
              texte: l,
              audio: true,
            });
          else L.noter({ surface, niveau: n, id: page, texte: l, niveaux: niveau });
        }
      }
      for (const [k, y] of Object.entries(o)) if (k !== 'ar' && k !== 'lignes') walk(y, page);
    };
    const c = JSON.parse(readFileSync(f, 'utf8'));
    for (const p of c.pages ?? []) {
      walk(p, p.id);
      const j = p.jeu;
      if (j)
        for (const texte of [
          ...j.construis.map((m) => m.ar),
          ...j.trouve.flatMap((m) => m.choix),
          ...j.signes.map((s) => s.ar),
          ...(j.colorie?.cases.map((x) => x.ar) ?? []),
        ])
          L.noter({ surface, niveau: n, id: p.id + ' jeu', texte, niveaux: niveau });
    }
  }
}

export function cahierParler() {
  const fichiers = readdirSync(STATIC)
    .filter((x) => /^parler-[a-z]+\d+\.json$/.test(x))
    .sort();
  for (const nom of fichiers) {
    const niveau = nom.slice('parler-'.length, -'.json'.length);
    const d = JSON.parse(readFileSync(join(STATIC, nom), 'utf8'));
    const ajoute = (texte, id) =>
      L.noter({ surface: 'cahier-je-parle', niveau, id, texte, niveaux: niveau });
    for (const [id, p] of Object.entries(d.phrases)) {
      ajoute(p.ar, `phrase ${id}`);
      for (const g of p.f ?? []) ajoute(g.ar, `phrase ${id}`);
    }
    for (const [id, c] of Object.entries(d.conversations))
      for (const r of c.r) ajoute(r.ar, `conversation ${id}`);
    for (const e of d.etapes) {
      ajoute(e.jour?.ar, `étape ${e.id}`);
      for (const [ar] of e.antiseche ?? []) ajoute(ar, `antisèche ${e.id}`);
    }
  }
}
