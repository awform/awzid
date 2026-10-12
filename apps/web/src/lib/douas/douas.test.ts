import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import { loadTanzil } from '@awform/content';
import { tanwinUndo } from '@awform/content/text';
import DouaTexte from './DouaTexte.svelte';
import { CROCHETS, forChild, inRubrique, type Doua, type DouasData } from './douas';

/**
 * Douas (phase 1) : ce que l'onglet affiche est EXACTEMENT ce que le référent a retenu.
 *  - texte arabe des hadiths : identique octet par octet au dossier (`douas_phase1.json`), rendu compris ;
 *  - douas du Coran : sous-chaîne exacte du verset Tanzil (copie verbatim du dépôt, infra/ci/contenu), rendu
 *    compris (`tanwinUndo` rend Tanzil, comme pour VerseText) ;
 *  - aucune doua écartée, aucune doua « en attente » (DOU-ANG-08, ECA-07) ;
 *  - décisions 1 à 8 du référent (DECISIONS_REFERENT_DOUAS.md) ; fichier publié à jour (scripts/douas.mjs).
 */
const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const tanzil = loadTanzil(
  readFileSync(at('../../../../../infra/ci/contenu/coran/tanzil-uthmani.tsv'), 'utf8'),
);
const rawSource = readFileSync(at('../../../../../docs/projet/douas/douas_phase1.json'));
const source = JSON.parse(rawSource.toString('utf8')) as {
  douas: Array<{ id: string; texte_ar: string | null; coran_ref: string | null }>;
  ecartees: Array<{ id: string; texte_ar: string }>;
};
const data = JSON.parse(readFileSync(at('../../../static/douas/douas.json'), 'utf8')) as DouasData;
const EN_ATTENTE = ['DOU-ANG-08', 'ECA-07'];
/**
 * SEULES exceptions à « chaîne exacte » (décision du référent, ajout du 12/10) : marques du chercheur.
 * rlm : U+200F retirés ; points : « ... » → « … » ; fois : « (×3) », « (×7) » retirés (dits dans le moment).
 */
const EXCEPTIONS: Record<string, Array<'rlm' | 'points' | 'fois'>> = {
  'DOU-SOM-07': ['rlm', 'points'],
  'DOU-MOS-01': ['rlm'],
  'DOU-VOY-01': ['points', 'fois'],
  'DOU-PLU-05': ['points'],
  'DOU-MAL-04': ['points', 'fois'],
  'DOU-ETE-01': ['points'],
};
function attenduDe(id: string, texte: string): string {
  let t = texte;
  for (const op of EXCEPTIONS[id] ?? []) {
    if (op === 'rlm') t = t.split('‏').join('');
    if (op === 'points') t = t.split('...').join('…');
    if (op === 'fois') t = t.split(' (×3)').join('').split(' (×7)').join('');
  }
  return t;
}
const entries = Object.entries(data.douas);
const bytes = (s: string) => Buffer.from(s, 'utf8').toString('hex');
const decode = (h: string) =>
  h
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
/** contenu d'un élément du rendu serveur, repéré par son attribut (aucun élément imbriqué dedans) */
const inner = (html: string, attr: string) =>
  [...html.matchAll(new RegExp(`${attr}(?:="[^"]*")?>([^<]*)<`, 'g'))].map((m) => decode(m[1]!));

describe('douas : texte exact', () => {
  it('données construites depuis CE dossier (empreinte), 66 douas retenues', () => {
    expect(data.source_sha256).toBe(createHash('sha256').update(rawSource).digest('hex'));
    expect(entries.length).toBe(source.douas.length - 1);
  });

  it('chaque hadith affiché est identique octet par octet au dossier (données et rendu), sauf les 6 exceptions listées', () => {
    let n = 0;
    for (const [id, d] of entries) {
      const src = source.douas.find((x) => x.id === id);
      expect(src, id).toBeTruthy();
      if (!d.ar) continue;
      const attendu = attenduDe(id, src!.texte_ar!);
      expect(bytes(d.ar), id).toBe(bytes(attendu));
      // aucune marque du chercheur ne reste, nulle part
      expect(/[‏×]|\.\.\./.test(d.ar), id).toBe(false);
      const html = render(DouaTexte, { props: { doua: d } }).body;
      // texte du paragraphe, balises d'isolement (<bdi>) ôtées : seul le texte compte
      const shown = [...html.matchAll(/data-douas-ar[^>]*>([\s\S]*?)<\/p>/g)].map((m) =>
        decode(m[1]!.replace(/<[^>]+>/g, '')),
      );
      expect(shown.length, id).toBe(1);
      expect(bytes(shown[0]!), id).toBe(bytes(attendu));
      n++;
    }
    expect(n).toBeGreaterThan(45);
  });

  it('exceptions : seulement les marques du chercheur retirées, rien d’autre', () => {
    for (const [id, ops] of Object.entries(EXCEPTIONS)) {
      const avant = source.douas.find((x) => x.id === id)!.texte_ar!;
      const apres = data.douas[id]!.ar!;
      expect(apres, id).not.toBe(avant);
      // en retirant les mêmes marques des deux côtés, les mots sont identiques
      const mots = (s: string) =>
        s
          .replace(/[‏]/g, '')
          .replace(/\.\.\.|…/g, ' ')
          .replace(/\(×\d+\)/g, ' ')
          .split(/\s+/)
          .filter(Boolean);
      expect(mots(apres), id).toEqual(mots(avant));
      expect(ops.length, id).toBeGreaterThan(0);
    }
  });

  it('douas du Coran : texte Tanzil (sans voix de synthèse), rendu entre ﴿ ﴾', () => {
    const coran = entries.filter(([, d]) => d.coran);
    // 15 douas du Coran + la doua de Yūnus (texte coranique, 21:87)
    expect(coran.length).toBe(16);
    for (const [id, d] of coran) {
      expect(d.ar, id).toBeUndefined();
      expect(d.audio, id).toBeNull();
      const html = render(DouaTexte, { props: { doua: d } }).body;
      expect(html, id).toContain(CROCHETS.ouvre);
      expect(html, id).toContain(CROCHETS.ferme);
      const shown = inner(html, 'data-verset');
      expect(shown.map(tanwinUndo), id).toEqual(d.coran!.map((p) => p.text));
      for (const p of d.coran!) {
        expect(p.text, id).not.toContain(CROCHETS.ouvre);
        const verse = tanzil.get(`${p.s}:${p.a}`)!;
        expect(bytes(verse.slice(verse.length - p.text.length)), `${id} ${p.s}:${p.a}`).toBe(
          bytes(p.text),
        );
        // le passage commence au début d'un mot du verset
        const before = verse.slice(0, verse.length - p.text.length);
        expect(before === '' || before.endsWith(' '), id).toBe(true);
      }
    }
  });

  it('le fichier publié est exactement celui que construit le script (dossier + présentation + Tanzil)', () => {
    const out = execFileSync('node', [at('../../../scripts/douas.mjs'), '--verifier'], {
      encoding: 'utf8',
    });
    expect(out).toContain('à jour');
  });

  it('aucune doua écartée ni en attente n’est rendue', () => {
    const ids = new Set(Object.keys(data.douas));
    for (const id of [...EN_ATTENTE, ...source.ecartees.map((e) => e.id)])
      expect(ids.has(id), id).toBe(false);
    const listed = [...data.rubriques.flatMap((r) => r.douas), ...data.enfant];
    for (const id of EN_ATTENTE) expect(listed).not.toContain(id);
    const all = JSON.stringify(data);
    for (const e of source.ecartees) {
      // le texte arabe de l'écartée (sans ses mentions entre crochets) n'apparaît nulle part
      const ar = e.texte_ar.replace(/^\[[^\]]*\]\s*|^\([^)]*\)\s*/, '').replace(/\.\.\.$/, '');
      expect(all.includes(ar), e.id).toBe(false);
    }
    // toutes les douas affichables sont dans une rubrique, une seule fois
    expect(data.rubriques.flatMap((r) => r.douas).sort()).toEqual([...ids].sort());
  });
});

describe('douas : décisions du référent', () => {
  const d = (id: string) => data.douas[id] as Doua;

  it('1. DOU-ABL-02 : ajout facultatif, juste après la shahāda', () => {
    expect(d('DOU-ABL-02').facultatif).toBe(true);
    const r = inRubrique(data, 'ablutions_mosquee');
    expect(r.indexOf('DOU-ABL-02')).toBe(r.indexOf('DOU-ABL-01') + 1);
    expect(d('DOU-ABL-01').facultatif).toBeUndefined();
    expect(d('DOU-ABL-02').source.recueil).toContain('at-Tirmidhī');
    expect(d('DOU-ABL-02').source.juge).toBe('al-Albānī');
    expect(d('DOU-ABL-02').note).toMatch(/discuté sa chaîne/);
  });
  it('2. DOU-MAI-01 retenue, divergence signalée derrière « Source »', () => {
    expect(d('DOU-MAI-01').note).toMatch(/divergent/);
  });
  it('3. pas de basmala à part avant les toilettes : note sous la doua d’al-Bukhārī', () => {
    expect(d('DOU-TOI-01').note).toContain('606');
  });
  it('4. DOU-PAR-05 sans « كَرِيمٌ »', () => {
    expect(d('DOU-PAR-05').ar).not.toContain('كَرِيمٌ');
    expect(d('DOU-PAR-05').ar).not.toContain('كريم');
  });
  it('5. DOU-PLU-01 : texte d’al-Bukhārī tel quel, sans « اللَّهُمَّ » ajouté', () => {
    const src = source.douas.find((x) => x.id === 'DOU-PLU-01')!.texte_ar!;
    expect(d('DOU-PLU-01').ar).toBe(src);
    expect(src.split(' ').length).toBe(2);
    expect(src).not.toContain('لَّهُمَّ');
  });
  it('6. tonnerre : parole d’un Compagnon, d’après le Muwaṭṭaʾ', () => {
    expect(d('DOU-PLU-05').compagnon).toMatch(/Compagnon.*Muwaṭṭaʾ/);
  });
  it('8. un nombre de répétitions seulement là où il est dans le hadith (VOY-01, MAL-04), dit en français', () => {
    const nombre = /\b(\d+|deux|trois|quatre|sept|dix|cent)\s+fois\b|\d+\s*x\b|×/i;
    const avecNombre = entries
      .filter(([, x]) => nombre.test(`${x.titre} ${x.moment}`))
      .map(([id]) => id);
    expect(avecNombre.sort()).toEqual(['DOU-MAL-04', 'DOU-VOY-01']);
    expect(d('DOU-MAL-04').moment).toMatch(/trois fois.*sept fois/);
    expect(d('DOU-VOY-01').moment).toMatch(/trois fois/);
    for (const id of avecNombre)
      expect(source.douas.find((x) => x.id === id)!.texte_ar, id).toContain('×');
  });
  it('titres : le moment seul, sans citation traduite ; pas de redite dans la ligne du moment', () => {
    for (const [id, x] of entries) {
      expect(/[«»“”]/.test(x.titre), `${id} : ${x.titre}`).toBe(false);
      expect(x.titre).not.toMatch(/Compagnon/);
      if (x.moment) expect(x.moment.startsWith(x.titre), id).toBe(false);
    }
  });
  it('panneau Source : recueil, degré en français, savant ; aucune note interne ni URL brute', () => {
    const DEGRES = /^(authentique|bon|parole d'un Compagnon — degré en cours de vérification)$/;
    for (const [id, x] of entries) {
      const s = x.source;
      const textes = [s.recueil, s.degre ?? '', s.juge ?? '', x.note ?? '', x.compagnon ?? ''];
      for (const t of textes) {
        expect(t, id).not.toMatch(
          /confirmer|recherche web|sunnah\.com|http|dorar|islamqa|sahih|da'if|hasan/i,
        );
        // accents : aucun nom de recueil ou de savant écrit sans ses signes
        expect(t, id).not.toMatch(/\b(Bukhari|Tirmidhi|Abu Dawud|Albani|Majah|Muwatta)\b/);
      }
      // douas du Coran (la doua de Yūnus, texte coranique, a pour source le hadith d'at-Tirmidhī qui la recommande)
      if (x.coran && id !== 'DOU-ANG-02') {
        expect(s.recueil, id).toMatch(/^Coran \d+:\d+(-\d+)?$/);
        expect(s.lien, id).toBeUndefined();
      } else {
        expect(s.degre, id).toMatch(DEGRES);
        expect(s.lien, id).toMatch(/^https:\/\/sunnah\.com\/[a-z]+[:/]/);
        // savant cité seulement hors al-Bukhārī et Muslim
        if (/^(al-Bukhārī|Muslim) \d+/.test(s.recueil)) expect(s.juge, id).toBeUndefined();
        else expect(s.juge ?? s.degre, id).toBeTruthy();
      }
    }
  });
  it('versets cités dans un hadith : formulation du narrateur, signalée', () => {
    const cites = entries.filter(([, x]) => x.coran_cite).map(([id]) => id);
    expect(cites.sort()).toEqual(['DOU-ANG-04', 'DOU-PLU-05', 'DOU-VOY-01', 'DOU-VOY-02']);
    for (const id of cites) {
      expect(d(id).ar, id).toBeTruthy();
      expect(d(id).coran, id).toBeUndefined();
      expect(d(id).audio, id).toBeNull();
    }
  });
  it('aucune phrase arabe sur la ligne du français (titres, moments, notes)', () => {
    for (const [id, x] of entries)
      for (const s of [x.titre, x.moment, x.note ?? '', x.compagnon ?? ''])
        expect(/[؀-ۿ]/.test(s), `${id} : ${s}`).toBe(false);
  });
  it('traductions pas encore fournies : champ vide (« Traduction en préparation »)', () => {
    for (const [, x] of entries) expect(x.traduction).toBe('');
  });
});

describe('douas : version enfant', () => {
  it('10 à 12 douas courtes du quotidien, authentiques, aucune parole de Compagnon', () => {
    const ids = forChild(data);
    expect(ids.length).toBeGreaterThanOrEqual(10);
    expect(ids.length).toBeLessThanOrEqual(12);
    for (const id of ids) {
      const x = data.douas[id]!;
      expect(x.compagnon, id).toBeUndefined();
      expect(x.facultatif, id).toBeUndefined();
      const len = x.ar?.length ?? x.coran!.reduce((s, p) => s + p.text.length, 0);
      expect(len, id).toBeLessThanOrEqual(110);
      if (x.ar) expect(x.source.degre, id).toMatch(/^(authentique|bon)$/);
    }
  });
});
