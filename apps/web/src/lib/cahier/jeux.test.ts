/**
 * Cahiers de lecture des enfants (en1) et des ados (ado1), 25/10/2026 — jeux de fin de grille et déblocage des grilles :
 *  - les données des jeux n'utilisent que des éléments VUS (mots et syllabes du cahier, jamais ceux des bilans à froid),
 *    décodables à la leçon `n` annoncée (lettres et signes enseignés), avec leur audio ;
 *  - les signes sont limités à ceux enseignés à la leçon atteinte ; aucun nom latin de signe (ni dans les textes, ni dans
 *    le balisage des jeux) ;
 *  - fidélité de l'arabe (octet pour octet, ni NFC, ni normalisation) ;
 *  - règles pures : mots jouables, manches, vérification d'un mot construit, médailles, déblocage case par case.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { concordance, convertir } from '../../../scripts/cahier-donnees.mjs';
import { CAHIER_NIVEAUX } from '../cahier-pages';
import { REGLES, analyser, leconDuSigne, lettresN } from '../../../scripts/cahier-regles.mjs';
import type { Cahier, El, JeuPage, MotJeu, Page, Rang, SigneCle } from './donnees';
import { elementsDeLaPage } from './donnees';
import { fusionAudio, niveauxAudio } from './audio';
import { filtrerPage, ouvert, prochaineLecon } from './outils';
import {
  CERCLE,
  JEUX_DU_PUBLIC,
  LONGUEUR_MAX,
  MARQUES,
  MANCHES_MIN,
  PALIERS_CHRONO,
  casesASigner,
  colorieJouable,
  gagnantDuel,
  jeuxOuverts,
  lettresJustes,
  manchesJouables,
  medailleChrono,
  medailleScore,
  melanger,
  motConstruit,
  motsJouables,
  paliersConstruis,
  paliersDefi,
  paliersDuel,
  publicDe,
  recomposer,
  secondesChrono,
  signesJustes,
  signesOuverts,
  tuilesDuMot,
  type ContexteJeu,
} from './jeux/modele';

const lire = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const NIVEAUX = ['en1', 'ado1'] as const;
type Source = {
  pages: Array<{
    id: string;
    type: string;
    apres: string;
    apres_n: number;
    blocs?: Array<{ type: string; elements?: unknown[] }>;
  }>;
  concordance: Array<{ apres: string; lecon: string; sujet: string }>;
};
const sources = Object.fromEntries(
  NIVEAUX.map((n) => [
    n,
    JSON.parse(lire(`../../../../../packages/content/data/cahier/${n}.json`)),
  ]),
) as Record<(typeof NIVEAUX)[number], Source>;
const audios = Object.fromEntries(
  NIVEAUX.map((n) => [
    n,
    JSON.parse(lire(`../../../../../packages/content/data/cahier/${n}.audio.json`)) as {
      garde_coran: string[];
      tts: string[];
      tts_syllabe: string[];
      tts_controle: string[];
    },
  ]),
) as Record<
  (typeof NIVEAUX)[number],
  { garde_coran: string[]; tts: string[]; tts_syllabe: string[]; tts_controle: string[] }
>;
const apps = Object.fromEntries(
  NIVEAUX.map((n) => [n, JSON.parse(lire(`../../../static/cahier-data/${n}.json`)) as Cahier]),
) as Record<(typeof NIVEAUX)[number], Cahier>;
const avecAudio = (n: (typeof NIVEAUX)[number]) =>
  new Set([...audios[n].tts, ...audios[n].tts_syllabe, ...audios[n].tts_controle]);
const grilles = (n: (typeof NIVEAUX)[number]) => apps[n].pages.filter((p) => p.type === 'grille');
const chaines = (o: unknown, out: string[] = []): string[] => {
  if (typeof o === 'string') out.push(o);
  else if (Array.isArray(o)) o.forEach((x) => chaines(x, out));
  else if (o && typeof o === 'object') Object.values(o).forEach((x) => chaines(x, out));
  return out;
};
/** tous les textes arabes de la source (jamais normalisés) */
const textesSource = (n: (typeof NIVEAUX)[number]) => new Set(chaines(sources[n]));

/** mots des pages de bilan à froid de la source : ils doivent rester inconnus de l'élève jusqu'au bilan */
function motsDesBilans(n: (typeof NIVEAUX)[number]): Set<string> {
  const out = new Set<string>();
  for (const p of sources[n].pages)
    if (p.type === 'bilan')
      for (const b of p.blocs ?? [])
        for (const e of (b.elements ?? []) as Array<{ ar?: string }>) if (e.ar) out.add(e.ar);
  return out;
}
const ctxTout = (n: (typeof NIVEAUX)[number], atteinte: number | null = null): ContexteJeu => {
  const a = avecAudio(n);
  return { atteinte, audioOk: (ar) => a.has(ar) };
};

describe('cahiers en1 et ado1 : données de l’application tirées de la source unique', () => {
  for (const n of NIVEAUX) {
    it(`${n} : le fichier de l’application est exactement la conversion de la source`, () => {
      const conv = convertir(sources[n], n, audios[n].garde_coran, audios[n]);
      expect(JSON.parse(JSON.stringify(conv))).toEqual(apps[n]);
      expect(apps[n].pages).toHaveLength(sources[n].pages.length);
    });
    it(`${n} : l’arabe est celui de la source, octet pour octet (ni NFC, ni normalisation)`, () => {
      const src = textesSource(n);
      // (les cases d'un mot à construire sont des lettres seules : le mot entier, lui, est contrôlé par recomposition)
      const absents = chaines(apps[n].pages).filter(
        (s) => s.length > 1 && /[؀-ۿ]/.test(s) && !src.has(s),
      );
      expect(absents).toEqual([]);
    });
  }
  it('jeux papier remplacés : plus de bloc « atelier », « jeu_grille » ni « jeu_ado » dans l’application', () => {
    for (const n of NIVEAUX)
      for (const p of apps[n].pages)
        for (const b of p.blocs)
          expect(['jeu_grille', 'jeu_ado', 'atelier_mot', 'jeu_relie']).not.toContain(b.type);
  });
  it('27 grilles pour les enfants, 28 pour les ados, chacune avec ses jeux et son bloc « jeux »', () => {
    expect(grilles('en1')).toHaveLength(27);
    expect(grilles('ado1')).toHaveLength(28);
    for (const n of NIVEAUX)
      for (const p of grilles(n)) {
        expect(p.jeu, p.id).toBeTruthy();
        expect(p.blocs.at(-1)!.type, p.id).toBe('jeux');
      }
  });
  it('le « défi » des ados (score sur N) et les paliers de la mission d’un bilan sont repris du cahier', () => {
    const ado = apps.ado1.pages;
    expect(ado.filter((p) => p.defi).length).toBeGreaterThan(100);
    const bilan = ado.find((p) => p.type === 'bilan')!;
    expect(bilan.defi?.paliers).toEqual({ bronze: 7, argent: 9, or: 10 });
    expect(apps.en1.pages.some((p) => p.defi)).toBe(false);
  });
});

describe('règles d’enseignement des livres (ordre des leçons)', () => {
  it('l’ordre de REGLES est celui de la concordance du cahier (sujet de chaque leçon)', () => {
    const num = (n: (typeof NIVEAUX)[number], re: RegExp) => {
      const c = sources[n].concordance.find((x) => re.test(x.sujet));
      return c ? Number(/^l(\d+)$/.exec(c.apres)![1]) : null;
    };
    // enfants : un son long par leçon, puis soukoun, tanwīn (et ة), chadda
    expect(num('en1', /son long .*?َا|le son long َا/)).toBe(REGLES.en1.longA);
    expect(num('en1', /le soukoun/)).toBe(REGLES.en1.soukoun);
    expect(num('en1', /le tanwīn/)).toBe(REGLES.en1.tanwin);
    expect(num('en1', /la chadda/)).toBe(REGLES.en1.shadda);
    expect(num('en1', /hamza sur l'alif/)).toBe(REGLES.en1.hamzaTete);
    expect(REGLES.en1.taMarbuta).toBe(REGLES.en1.tanwin);
    // ados : voyelles longues et soukoun, puis tanwīn et chadda, article/ة/ى, hamza
    expect(num('ado1', /voyelles longues et soukoun/)).toBe(REGLES.ado1.longA);
    expect(REGLES.ado1.soukoun).toBe(REGLES.ado1.longA);
    expect(num('ado1', /tanwīn et chadda/)).toBe(REGLES.ado1.tanwin);
    expect(REGLES.ado1.shadda).toBe(REGLES.ado1.tanwin);
    expect(num('ado1', /article, ة et ى/)).toBe(REGLES.ado1.taMarbuta);
    expect(REGLES.ado1.maqsura).toBe(REGLES.ado1.taMarbuta);
    expect(num('ado1', /hamza et écriture du Coran/)).toBe(REGLES.ado1.hamzaSiege);
    // le livre des enfants n’enseigne ni ى ni hamza sur siège : le jeu ne les emploie jamais
    expect(REGLES.en1.maqsura).toBeNull();
    expect(REGLES.en1.hamzaSiege).toBeNull();
  });
  it('analyse : voyelles longues, tanwīn, chadda, ة, soukoun, prolongation seulement après la bonne voyelle', () => {
    const ln = lettresN(sources.en1);
    const a = (s: string) => analyser(s, 'en1', ln);
    const ok = a('طَاوِلَةٌ');
    expect(ok.ok).toBe(true);
    expect(ok.segs.map((g) => g.s)).toEqual(['fatha', '', 'kasra', 'fatha', 'dammatan']);
    expect(ok.segs.map((g) => !!g.fixe)).toEqual([false, true, false, false, false]);
    expect(ok.n).toBe(REGLES.en1.taMarbuta);
    expect(a('بُو').n).toBe(REGLES.en1.longU);
    expect(a('بِي').n).toBe(REGLES.en1.longI);
    expect(a('بَا').n).toBe(REGLES.en1.longA);
    expect(a('بْ').n).toBe(REGLES.en1.soukoun);
    // un ا sans fatḥa avant lui n'est pas une prolongation : texte écarté (jamais une lettre sans signe au hasard)
    expect(a('بِا').ok).toBe(false);
    expect(a('بُي').ok).toBe(false);
    // l'article, l'alif waṣla, la madda ne sont pas construits
    expect(a('الْ').ok).toBe(false);
    expect(a('ٱلْ').ok).toBe(false);
    expect(a('آ').ok).toBe(false);
    // chadda AVANT la voyelle (graphie du cahier) : l'ordre inverse est refusé
    expect(a('بَّ').ok).toBe(false);
    expect(a('بَّ').ok).toBe(false);
    // ado1 : ى et ة enseignés en leçon 7, la hamza sur siège en leçon 8
    const lb = lettresN(sources.ado1);
    expect(analyser('سَأَلَ', 'ado1', lb).n).toBe(REGLES.ado1.hamzaSiege);
    expect(analyser('سَأَلَ', 'en1', ln).n).toBe(Infinity);
  });
  it('chaque signe a une leçon d’enseignement, croissante dans l’ordre du livre', () => {
    for (const n of NIVEAUX) {
      const l = (k: string) => leconDuSigne(n, k);
      expect(l('fatha')).toBeLessThanOrEqual(l('kasra'));
      expect(l('kasra')).toBeLessThanOrEqual(l('damma'));
      expect(l('soukoun')).toBeGreaterThanOrEqual(l('damma'));
      expect(l('fathatan')).toBe(l('dammatan'));
      expect(l('shadda_damma')).toBeGreaterThanOrEqual(l('shadda_fatha'));
    }
    expect(leconDuSigne('en1', 'shadda_kasra')).toBe(24);
    expect(leconDuSigne('ado1', 'dammatan')).toBe(7);
  });
});

describe('jeux : uniquement des éléments déjà vus, décodables, avec leur audio', () => {
  for (const n of NIVEAUX) {
    const src = textesSource(n);
    const a = avecAudio(n);
    const bilans = motsDesBilans(n);
    const lettreN = lettresN(sources[n]);
    // enseignement des lettres et des signes, ÉCRIT ICI (second énoncé de l'ordre du livre, indépendant du générateur)
    const livre =
      n === 'en1'
        ? {
            fatha: 1,
            kasra: 2,
            damma: 3,
            longA: 18,
            longU: 19,
            longI: 20,
            sk: 21,
            tn: 23,
            sh: 24,
            ta: 23,
          }
        : {
            fatha: 1,
            kasra: 1,
            damma: 1,
            longA: 6,
            longU: 6,
            longI: 6,
            sk: 6,
            tn: 7,
            sh: 7,
            ta: 8,
          };
    const code = (s: string) => [...s].map((c) => c.charCodeAt(0));
    /** leçon minimale d'un texte, recalculée caractère par caractère à partir des codes Unicode */
    const requise = (s: string): number => {
      let r = 1;
      const cs = code(s);
      cs.forEach((c, i) => {
        if (c === 0x64e) r = Math.max(r, livre.fatha);
        else if (c === 0x650) r = Math.max(r, livre.kasra);
        else if (c === 0x64f) r = Math.max(r, livre.damma);
        else if (c === 0x652) r = Math.max(r, livre.sk);
        else if (c === 0x64b || c === 0x64c || c === 0x64d) r = Math.max(r, livre.tn);
        else if (c === 0x651) r = Math.max(r, livre.sh);
        else if (c === 0x629) r = Math.max(r, livre.ta);
        else if (c >= 0x621 && c <= 0x64a) {
          const lettre = String.fromCharCode(c);
          r = Math.max(r, lettreN[lettre] ?? 0);
          // prolongation : ا après fatḥa, و après ḍamma, ي après kasra (ou ا après tanwīn fatḥ)
          const marques = [] as number[];
          for (let j = i + 1; j < cs.length && cs[j]! >= 0x64b && cs[j]! <= 0x652; j++)
            marques.push(cs[j]!);
          const avant = [] as number[];
          for (let j = i - 1; j >= 0 && cs[j]! >= 0x64b && cs[j]! <= 0x652; j--) avant.push(cs[j]!);
          if (!marques.length) {
            if (c === 0x627 && avant.includes(0x64e)) r = Math.max(r, livre.longA);
            if (c === 0x648 && avant.includes(0x64f)) r = Math.max(r, livre.longU);
            if (c === 0x64a && avant.includes(0x650)) r = Math.max(r, livre.longI);
          }
        }
      });
      return r;
    };
    it(`${n} : chaque mot à construire est un mot du cahier (hors bilans), avec son audio, sans Coran, et sa leçon est juste`, () => {
      const coranSource = new Set<string>();
      const parcours = (x: unknown): void => {
        if (Array.isArray(x)) return x.forEach(parcours);
        if (!x || typeof x !== 'object') return;
        const o = x as { ar?: string; src?: { type?: string; coran?: string } };
        if (o.ar && (o.src?.type === 'coran' || o.src?.coran)) coranSource.add(o.ar);
        Object.values(x).forEach(parcours);
      };
      parcours(sources[n].pages);
      let total = 0;
      for (const p of grilles(n)) {
        for (const m of p.jeu!.construis) {
          total++;
          expect(src.has(m.ar), `${p.id} ${m.ar} est dans la source`).toBe(true);
          expect(a.has(m.ar), `${p.id} ${m.ar} a son audio`).toBe(true);
          expect(bilans.has(m.ar), `${p.id} ${m.ar} n'est pas un mot de bilan`).toBe(false);
          expect(coranSource.has(m.ar), `${p.id} ${m.ar} n'est pas un mot du Coran`).toBe(false);
          expect(recomposer(m), `${p.id} ${m.ar} recomposé`).toBe(m.ar);
          expect(m.c.length, m.ar).toBeGreaterThanOrEqual(2);
          // la leçon annoncée couvre tout ce que le mot emploie (jamais sous-estimée)
          expect(m.n, `${p.id} ${m.ar} leçon`).toBeGreaterThanOrEqual(requise(m.ar));
          expect(Number.isFinite(m.n)).toBe(true);
        }
      }
      expect(total).toBeGreaterThan(300);
    });
    it(`${n} : manches de « Trouve… » : la cible est en premier parmi 4 choix distincts, tous vus, tous avec audio`, () => {
      for (const p of grilles(n)) {
        for (const m of p.jeu!.trouve) {
          expect(m.choix[0], p.id).toBe(m.cible);
          expect(m.choix).toHaveLength(4);
          expect(new Set(m.choix).size).toBe(4);
          for (const c of m.choix) {
            expect(src.has(c), `${p.id} ${c} dans la source`).toBe(true);
            expect(a.has(c), `${p.id} ${c} a son audio`).toBe(true);
            if (m.k === 'm') expect(bilans.has(c), `${p.id} ${c} mot de bilan`).toBe(false);
          }
          expect(m.n, `${p.id} ${m.cible}`).toBeGreaterThanOrEqual(
            Math.max(...m.choix.map(requise)),
          );
        }
      }
    });
    it(`${n} : signes — seulement ceux enseignés, avec le son de la syllabe de la grille qui les porte`, () => {
      const enseignes: Record<string, number> = {
        fatha: livre.fatha,
        kasra: livre.kasra,
        damma: livre.damma,
        soukoun: livre.sk,
        fathatan: livre.tn,
        kasratan: livre.tn,
        dammatan: livre.tn,
        shadda_fatha: livre.sh,
        shadda_kasra: livre.sh,
        shadda_damma: livre.sh,
      };
      for (const p of grilles(n)) {
        const j = p.jeu!;
        const cles = j.signes.map((s) => s.k);
        expect(new Set(cles).size).toBe(cles.length);
        for (const s of j.signes) {
          expect(Object.keys(MARQUES)).toContain(s.k);
          expect(s.n, `${p.id} ${s.k}`).toBeGreaterThanOrEqual(enseignes[s.k]!);
          expect(a.has(s.ar), `${p.id} son du signe ${s.k}`).toBe(true);
          expect(src.has(s.ar)).toBe(true);
        }
        // l'ordre est celui de l'enseignement
        expect(j.signes.map((s) => s.n)).toEqual(
          [...j.signes.map((s) => s.n)].sort((x, y) => x - y),
        );
        // chaque signe d'un mot est dans la liste des signes de la page, enseigné au plus tard à la leçon du mot
        for (const m of j.construis)
          for (const [, s] of m.c) {
            if (!s) continue;
            const e = j.signes.find((x) => x.k === s);
            expect(e, `${p.id} ${m.ar} signe ${s}`).toBeTruthy();
            expect(e!.n, `${p.id} ${m.ar} ${s}`).toBeLessThanOrEqual(m.n);
          }
      }
    });
    it(`${n} : syllabes des cases et du « je colorie » : vues, avec audio, leçon juste`, () => {
      for (const p of grilles(n)) {
        const g = p.blocs.find((b) => b.type === 'grille')!;
        for (const r of g.el as Rang[])
          for (const e of r.el) {
            expect(a.has(e.ar), `${p.id} ${e.ar}`).toBe(true);
            expect(e.n!, `${p.id} ${e.ar}`).toBeGreaterThanOrEqual(requise(e.ar));
          }
        for (const c of p.jeu!.colorie?.cases ?? []) {
          expect(a.has(c.ar), `${p.id} ${c.ar}`).toBe(true);
          expect(src.has(c.ar)).toBe(true);
        }
      }
    });
  }
  it('pour les enfants, le jeu existe pour chaque grille dès la fin du niveau (au moins 2 mots, 4 manches)', () => {
    for (const n of NIVEAUX) {
      const ctx = ctxTout(n);
      for (const p of grilles(n)) {
        const pub = publicDe(n);
        expect(motsJouables(p.jeu!, ctx, pub).length, `${n} ${p.id} mots`).toBeGreaterThanOrEqual(
          pub === 'enfant' ? 2 : 3,
        );
        expect(manchesJouables(p.jeu!, ctx).length, `${n} ${p.id} manches`).toBeGreaterThanOrEqual(
          MANCHES_MIN,
        );
        expect(jeuxOuverts(p.jeu!, ctx, pub).length, `${n} ${p.id}`).toBeGreaterThanOrEqual(2);
      }
    }
  });
});

describe('textes du cahier : chaque appel t() fournit exactement les arguments du message', () => {
  // (une clé réutilisée par erreur avec un autre message — « valeur manquante : mpm » — se voit ici, pas en production)
  const textes = JSON.parse(lire('./textes-fr.json')) as Record<string, string>;
  const args = (msg: string) =>
    [...msg.matchAll(/\{\s*([A-Za-z_]\w*)\s*[,}]/g)].map((m) => m[1]!).sort();
  const dossiers = ['./', './jeux/'];
  it('PageVue, Cahier, Atelier, Mesure et les jeux', () => {
    let verifies = 0;
    for (const d of dossiers)
      for (const f of readdirSync(fileURLToPath(new URL(d, import.meta.url))).filter((x) =>
        x.endsWith('.svelte'),
      )) {
        const src = lire(`${d}${f}`);
        for (const m of src.matchAll(/\bt\(\s*'([a-z_.0-9]+)'\s*(?:,\s*\{([^}]*)\})?\s*\)/g)) {
          const msg = textes[m[1]!];
          if (msg === undefined) continue;
          const donnes = (m[2] ?? '')
            .split(',')
            .map((s) => s.trim().split(':')[0]!.trim())
            .filter(Boolean)
            .sort();
          expect(donnes, `${f} : ${m[1]}`).toEqual(args(msg));
          verifies++;
        }
      }
    expect(verifies).toBeGreaterThan(60);
  });
  it('chaque clé « cahier.* » des jeux existe dans les cinq langues avec les mêmes arguments', () => {
    const langues = ['en', 'ar', 'de', 'es'].map(
      (l) => JSON.parse(lire(`../../../static/i18n/${l}.json`)) as Record<string, string>,
    );
    const cles = Object.keys(textes).filter((k) =>
      /^cahier\.(jeu_|cons_|trouve_|chrono_temps|chrono_erreur$|chrono_consigne|chrono_vise|duel_|med_|defi_|colorie|chasse_|grille_suite|reessaie)/.test(
        k,
      ),
    );
    expect(cles.length).toBeGreaterThan(50);
    for (const k of cles)
      for (const l of langues) {
        expect(l[k], k).toBeTruthy();
        expect(args(l[k]!), k).toEqual(args(textes[k]!));
      }
  });
});

describe('aucune transcription latine des signes', () => {
  const NOMS = /fat[hḥ]a|kasra|[dḍ]amma|sou?kou?n|suk[uū]n|shadda|chadda|tanw[iī]n|tanween|sukun/i;
  const dossier = fileURLToPath(new URL('./jeux/', import.meta.url));
  it('le balisage et les textes des jeux ne contiennent aucun nom latin de signe', () => {
    for (const f of readdirSync(dossier).filter((x) => x.endsWith('.svelte'))) {
      const src = lire(`./jeux/${f}`)
        .replace(/<script[\s\S]*?<\/script>/g, '')
        .replace(/<style[\s\S]*?<\/style>/g, '')
        .replace(/<!--[\s\S]*?-->/g, '');
      expect(src, f).not.toMatch(NOMS);
    }
    const textes = JSON.parse(lire('./textes-fr.json')) as Record<string, string>;
    const jeux = Object.entries(textes).filter(([k]) =>
      /^cahier\.(jeu_|cons_|trouve_|chrono_|duel_|med_|defi_|colorie|chasse_|grille_suite|reessaie)/.test(
        k,
      ),
    );
    expect(jeux.length).toBeGreaterThan(50);
    for (const [k, v] of jeux) expect(v, k).not.toMatch(NOMS);
  });
  it('les données ne portent que des clés de signe et de l’arabe : aucune lettre latine dans l’arabe', () => {
    for (const n of NIVEAUX)
      for (const p of grilles(n)) {
        const j = p.jeu!;
        const arabe = [
          ...j.construis.flatMap((m) => [m.ar, ...m.c.map(([l]) => l)]),
          ...j.trouve.flatMap((m) => [m.cible, ...m.choix]),
          ...j.signes.map((s) => s.ar),
          ...(j.colorie?.cases.map((c) => c.ar) ?? []),
        ];
        for (const s of arabe) expect(/[A-Za-z]/.test(s), `${p.id} ${s}`).toBe(false);
        for (const m of j.construis)
          for (const [, s] of m.c) expect(['', ...Object.keys(MARQUES)]).toContain(s);
      }
  });
  it('le signe est montré par lui-même sur un cercle pointillé (U+25CC), les marques viennent des points de code', () => {
    expect(CERCLE).toBe(String.fromCharCode(0x25cc));
    expect(MARQUES.fatha).toBe(String.fromCharCode(0x64e));
    expect(MARQUES.dammatan).toBe(String.fromCharCode(0x64c));
    expect(MARQUES.shadda_kasra).toBe(String.fromCharCode(0x651, 0x650));
    expect(Object.keys(MARQUES)).toHaveLength(10);
  });
});

describe('déblocage des grilles : une grille s’ouvre dès que ses lettres sont enseignées', () => {
  const p = (n: (typeof NIVEAUX)[number], id: string): Page =>
    apps[n].pages.find((x) => x.id === id)!;
  it('en1 : la grille du ب s’ouvre à la leçon 1, celle du ن à la leçon 2 (et non aux leçons 20-21)', () => {
    const b = p('en1', 'P083');
    expect(b.n).toBe(1);
    expect(b.apres).toBe('l01');
    expect(b.lecon).toBe('Leçon 1');
    expect(p('en1', 'P086').n).toBe(2);
    expect(p('en1', 'P109').n).toBe(15);
    for (const g of grilles('en1')) expect(g.n, g.id).toBeLessThanOrEqual(15);
  });
  it('ado1 : la grille du ب s’ouvre à la leçon 1, celle du ك à la leçon 4, celle de l’alif-hamza à la leçon 4 (hamza en tête de mot)', () => {
    expect(p('ado1', 'P048').n).toBe(1);
    expect(p('ado1', 'P072').n).toBe(4);
    expect(p('ado1', 'P086').n).toBe(4);
    // mais la hamza au milieu d'un mot attend la leçon 8 (hamza et ses sièges)
    const g = p('ado1', 'P086').blocs.find((x) => x.type === 'grille')!;
    const milieu = (g.el as Rang[])
      .flatMap((r) => r.el)
      .find((e) => (e.n ?? 0) >= REGLES.ado1.hamzaSiege!);
    expect(milieu).toBeTruthy();
  });
  it('à la leçon 1 de en1, seule la fatḥa du ب est ouverte ; les autres cases s’ouvrent avec leurs signes', () => {
    const b = p('en1', 'P083');
    const ouvertes = (a: number | null) => {
      const f = filtrerPage(b, a);
      return elementsDeLaPage(f).length;
    };
    const g = b.blocs.find((x) => x.type === 'grille')!;
    const cellules = (g.el as Rang[]).flatMap((r) => r.el);
    expect(cellules).toHaveLength(15);
    const au = (a: number) => cellules.filter((e) => ouvert(e.n, a)).map((e) => e.ar);
    expect(au(0)).toEqual([]);
    expect(au(1)).toHaveLength(1);
    expect(au(3).length).toBeGreaterThanOrEqual(3);
    expect(au(24)).toHaveLength(15);
    // tout est ouvert quand la leçon atteinte est inconnue (comme les pages du parcours)
    expect(filtrerPage(b, null)).toBe(b);
    expect(ouvertes(24)).toBeGreaterThan(ouvertes(1));
    expect(filtrerPage(b, 24)).toBe(b);
    expect(prochaineLecon(b, 24)).toBeNull();
    expect(prochaineLecon(b, 1)).toBe(2);
    // la lecture guidée et la vidéo n'ont jamais une case fermée
    const f1 = filtrerPage(b, 1);
    const gf = f1.blocs.find((x) => x.type === 'grille')!;
    expect((gf.el as Rang[]).flatMap((r) => r.el).every((e) => ouvert(e.n, 1))).toBe(true);
    expect(elementsDeLaPage(f1).every((x) => ouvert(x.el.n, 1))).toBe(true);
    // la page d'origine n'est jamais modifiée
    expect((g.el as Rang[]).flatMap((r) => r.el)).toHaveLength(15);
  });
  it('concordance : les grilles se lisent après la leçon qui ouvre leur première case ; le lien de la leçon suit', () => {
    for (const [n, max] of [
      ['en1', 26],
      ['ado1', 25],
    ] as const) {
      const c = concordance(apps[n], n);
      // toutes les unités ont des pages, sauf le Bilan 1 d'Ados 1 (sa leçon n'a pas de page : le lien ouvre le sommaire)
      const sans = Array.from(
        { length: max },
        (_, i) => `${n}.l${String(i + 1).padStart(2, '0')}`,
      ).filter((id) => !c[id]);
      expect(sans).toEqual(n === 'ado1' ? ['ado1.l05'] : []);
    }
    expect(concordance(apps.en1, 'en1')['en1.l01']).toEqual([6, 7, 83, 84, 85]);
    expect(concordance(apps.en1, 'en1')['en1.l24']).not.toContain(83);
    expect(CAHIER_NIVEAUX).toEqual(['ad1', 'en1', 'ado1']);
  });
  it('une grille à moitié ouverte garde les mots du cahier déjà décodables seulement', () => {
    const b = p('en1', 'P083');
    const mots = (a: number) =>
      (filtrerPage(b, a).blocs.find((x) => x.type === 'ligne_mots')!.el as El[]).map((e) => e.ar);
    expect(mots(1)).toEqual([]);
    expect(mots(24).length).toBe(6);
    expect(mots(10).length).toBeLessThan(mots(24).length + 1);
  });
});

describe('règles pures des jeux', () => {
  const pageB = apps.en1.pages.find((x) => x.id === 'P083')!;
  const jeu = pageB.jeu as JeuPage;
  it('mots jouables : ouverts à la leçon atteinte, longueur adaptée au public, audio présent', () => {
    const ctx = ctxTout('en1', 24);
    const enfant = motsJouables(jeu, ctx, 'enfant');
    expect(enfant.length).toBeGreaterThanOrEqual(2);
    for (const m of enfant) expect(m.c.length).toBeLessThanOrEqual(LONGUEUR_MAX.enfant);
    const ado = motsJouables(jeu, ctx, 'ado');
    expect(ado.length).toBeGreaterThanOrEqual(enfant.length);
    expect(Math.max(...ado.map((m) => m.c.length))).toBeLessThanOrEqual(6);
    // à la leçon 2, ni tanwīn ni chadda ni voyelle longue
    const tot = motsJouables(jeu, ctxTout('en1', 5), 'enfant');
    for (const m of tot) {
      expect(m.n).toBeLessThanOrEqual(5);
      for (const [, s] of m.c) expect(['', 'fatha', 'kasra', 'damma']).toContain(s);
    }
    // sans audio : aucun mot
    expect(motsJouables(jeu, { atteinte: 24, audioOk: () => false }, 'enfant')).toEqual([]);
  });
  it('signes ouverts : seulement ceux enseignés à la leçon atteinte', () => {
    expect(signesOuverts(jeu, ctxTout('en1', 1)).map((s) => s.k)).toEqual(['fatha']);
    expect(signesOuverts(jeu, ctxTout('en1', 3)).map((s) => s.k)).toEqual([
      'fatha',
      'kasra',
      'damma',
    ]);
    expect(signesOuverts(jeu, ctxTout('en1', 21)).map((s) => s.k)).toEqual([
      'fatha',
      'kasra',
      'damma',
      'soukoun',
    ]);
    const tout = signesOuverts(jeu, ctxTout('en1', 24)).map((s) => s.k);
    expect(tout).toContain('dammatan');
    expect(tout).toContain('shadda_fatha');
    expect(tout).toHaveLength(10);
    // un mot jouable n'a jamais un signe fermé
    for (const a of [3, 6, 12, 21, 23, 24]) {
      const ouverts = signesOuverts(jeu, ctxTout('en1', a)).map((s) => s.k);
      for (const m of motsJouables(jeu, ctxTout('en1', a), 'ado'))
        for (const [, s] of m.c) if (s) expect(ouverts, `${m.ar} à la leçon ${a}`).toContain(s);
    }
  });
  it('jeux ouverts : enfants (construis, trouve, colorie), ados (chrono, construis, duel)', () => {
    expect(JEUX_DU_PUBLIC.enfant).toEqual(['construis', 'trouve', 'colorie']);
    expect(JEUX_DU_PUBLIC.ado).toEqual(['chrono', 'construis', 'duel']);
    expect(JEUX_DU_PUBLIC.adulte).toEqual([]);
    expect(jeuxOuverts(jeu, ctxTout('en1', 24), 'enfant')).toEqual([
      'construis',
      'trouve',
      'colorie',
    ]);
    expect(jeuxOuverts(jeu, ctxTout('en1', 0), 'enfant')).toEqual([]);
    expect(jeuxOuverts(jeu, ctxTout('en1', 24), 'ado')).toEqual(['chrono', 'construis', 'duel']);
    expect(colorieJouable(jeu, ctxTout('en1', 24)).length).toBeGreaterThan(5);
    expect(publicDe('en1')).toBe('enfant');
    expect(publicDe('ado1')).toBe('ado');
    expect(publicDe('ad1')).toBe('adulte');
  });
  it('mot construit : les lettres se posent de droite à gauche (case 0 à droite), puis les signes', () => {
    const mot = apps.en1.pages
      .flatMap((x) => x.jeu?.construis ?? [])
      .find((m) => m.c.some(([, s]) => s === 'fathatan' || s === 'dammatan')) as MotJeu;
    expect(mot).toBeTruthy();
    const lettres = mot.c.map(([l]) => l);
    expect(lettresJustes(mot, lettres).every(Boolean)).toBe(true);
    // une lettre à la mauvaise place est signalée
    const inversees = [...lettres];
    [inversees[0], inversees[1]] = [inversees[1]!, inversees[0]!];
    if (inversees[0] !== lettres[0])
      expect(lettresJustes(mot, inversees).every(Boolean)).toBe(false);
    // signes : les lettres de prolongation n'en ont pas, les autres doivent avoir le bon
    const aSigner = casesASigner(mot);
    expect(aSigner.length).toBeGreaterThan(0);
    const poses = mot.c.map(([, s]) => (s || null) as SigneCle | null);
    expect(signesJustes(mot, poses).every(Boolean)).toBe(true);
    expect(motConstruit(lettres, poses)).toBe(mot.ar);
    const faux = [...poses];
    faux[aSigner[0]!] = faux[aSigner[0]!] === 'fatha' ? 'kasra' : 'fatha';
    expect(signesJustes(mot, faux).every(Boolean)).toBe(false);
    // un signe sur une lettre de prolongation est faux
    const fixe = mot.c.findIndex(([, s]) => !s);
    if (fixe >= 0) {
      const p2 = [...poses];
      p2[fixe] = 'fatha';
      expect(signesJustes(mot, p2)[fixe]).toBe(false);
    }
  });
  it('plateau : les lettres du mot, mélangées (jamais dans l’ordre du mot), chacune une fois', () => {
    const mot = jeu.construis.find((m) => new Set(m.c.map(([l]) => l)).size >= 3) as MotJeu;
    let graine = 7;
    const rnd = () => (graine = (graine * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 40; i++) {
      const t = tuilesDuMot(mot, rnd);
      expect(t.map((x) => x.l).sort()).toEqual(mot.c.map(([l]) => l).sort());
      expect(new Set(t.map((x) => x.id)).size).toBe(mot.c.length);
      expect(t.map((x) => x.l).join('')).not.toBe(mot.c.map(([l]) => l).join(''));
    }
    expect(melanger([1, 2, 3, 4], () => 0.99)).toHaveLength(4);
  });
  it('médailles : bronze, argent, or ; défi chrono (10 manches, +2 s par erreur) ; duel ; défi d’une page', () => {
    expect(medailleScore(0, { bronze: 1, argent: 2, or: 3 })).toBe(0);
    expect(medailleScore(1, { bronze: 1, argent: 2, or: 3 })).toBe(1);
    expect(medailleScore(2, { bronze: 1, argent: 2, or: 3 })).toBe(2);
    expect(medailleScore(3, { bronze: 1, argent: 2, or: 3 })).toBe(3);
    expect(PALIERS_CHRONO).toEqual({ or: 30, argent: 40, bronze: 55 });
    expect(secondesChrono(20_000, 0)).toBe(20);
    expect(secondesChrono(20_000, 3)).toBe(26);
    expect(medailleChrono(25)).toBe(3);
    expect(medailleChrono(30)).toBe(3);
    expect(medailleChrono(31)).toBe(2);
    expect(medailleChrono(55)).toBe(1);
    expect(medailleChrono(55.1)).toBe(0);
    expect(paliersConstruis(5)).toEqual({ bronze: 1, argent: 4, or: 5 });
    expect(paliersDuel(5)).toEqual({ bronze: 3, argent: 4, or: 5 });
    expect(paliersDefi(10)).toEqual({ bronze: 7, argent: 9, or: 10 });
    expect(paliersDefi(84)).toEqual({ bronze: 59, argent: 76, or: 84 });
    expect(paliersDefi(10, { bronze: 7, argent: 9, or: 10 })).toEqual({
      bronze: 7,
      argent: 9,
      or: 10,
    });
    expect(gagnantDuel(3, 3)).toBe(0);
    expect(gagnantDuel(4, 3)).toBe(1);
    expect(gagnantDuel(2, 5)).toBe(2);
  });
});

describe('audio du cahier des enfants et des ados', () => {
  it('niveaux d’audio : le livre et le cahier (cahier-lecture-<niveau>) pour en1 et ado1, le livre seul pour ad1', () => {
    expect(niveauxAudio('en1')).toEqual(['en1', 'cahier-lecture-en1']);
    expect(niveauxAudio('ado1')).toEqual(['ado1', 'cahier-lecture-ado1']);
    expect(niveauxAudio('ad1')).toEqual(['ad1']);
  });
  it('fusion : fichiers réunis, liste blanche réunie, rien si aucun niveau', () => {
    const a = {
      niveau: 'en1',
      fichiers: new Set(['a']),
      octets: 1,
      mention: 'm',
      credits: ['x'],
      autorises: ['a'],
    };
    const b = {
      niveau: 'cahier-lecture-en1',
      fichiers: new Set(['b']),
      octets: 2,
      mention: 'm',
      credits: ['x', 'y'],
    };
    const f = fusionAudio([a, b])!;
    expect([...f.fichiers].sort()).toEqual(['a', 'b']);
    expect(f.octets).toBe(3);
    expect(f.credits).toEqual(['x', 'y']);
    expect(f.autorises).toEqual(['a']);
    expect(fusionAudio([null, b])).toBe(b);
    expect(fusionAudio([null, null])).toBeNull();
  });
});
