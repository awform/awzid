import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import { loadTanzil } from '@awform/content';
import { tanwinUndo } from '@awform/content/text';
import DouaTexte from './DouaTexte.svelte';
import { CROCHETS, forChild, groupOf, inRubrique, type Doua, type DouasData } from './douas';

/**
 * Douas (phases 1 à 3) : ce que l'onglet affiche est EXACTEMENT ce que le référent a retenu.
 *  - texte arabe des hadiths : identique octet par octet au dossier (`douas_phase1.json`, `douas_phase2.json` dont
 *    chaque texte porte l'empreinte SHA-256 lue sur la source), rendu compris ;
 *  - douas du Coran : sous-chaîne exacte du verset Tanzil (copie verbatim du dépôt, infra/ci/contenu), rendu
 *    compris (`tanwinUndo` rend Tanzil, comme pour VerseText) ; JAMAIS de voix de synthèse ;
 *  - aucune doua écartée, aucune doua « en attente » (ECA-07) ; aucune doua sans source ;
 *  - sens en français pour toutes ; voix de synthèse provisoire pour des hadiths seulement ;
 *  - décisions du référent (DECISIONS_REFERENT_DOUAS.md, DOUAS_PHASE2_15-10.md) ; fichier publié à jour.
 */
const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const tanzil = loadTanzil(
  readFileSync(at('../../../../../infra/ci/contenu/coran/tanzil-uthmani.tsv'), 'utf8'),
);
type SrcDoua = {
  id: string;
  texte_ar: string | null;
  coran_ref: string | null;
  sha256?: string;
  url_reference?: string;
};
type Src = { douas: SrcDoua[]; ecartees: Array<{ id: string; texte_ar: string }> };
const rawSource = readFileSync(at('../../../../../docs/projet/douas/douas_phase1.json'));
const rawSource2 = readFileSync(at('../../../../../docs/projet/douas/douas_phase2.json'));
const rawSource3 = readFileSync(at('../../../../../docs/projet/douas/douas_phase3.json'));
const source = JSON.parse(rawSource.toString('utf8')) as Src;
const source3 = JSON.parse(rawSource3.toString('utf8')) as Src;
/** phases 2 et 3 : même format, même méthode (texte copié par script, empreinte lue sur la source) */
const source2 = JSON.parse(rawSource2.toString('utf8')) as Src;
source2.douas.push(...source3.douas);
source2.ecartees.push(...source3.ecartees);
const traductions = JSON.parse(
  readFileSync(at('../../../../../docs/projet/douas/traductions_fr.json'), 'utf8'),
) as { traductions: Record<string, { fr: string; origine: string }> };
const data = JSON.parse(readFileSync(at('../../../static/douas/douas.json'), 'utf8')) as DouasData;
const audioIndex = JSON.parse(
  readFileSync(at('../../../static/douas/audio/index.json'), 'utf8'),
) as {
  mention: string;
  fichiers: Record<string, { fichier: string; texte_sha1: string }>;
};
const EN_ATTENTE = ['ECA-07'];
const ids2 = new Set(source2.douas.map((x) => x.id));
/** texte source d'une doua : la phase 2 remplace l'entrée « en attente » de la phase 1 (DOU-ANG-08) */
const srcDe = (id: string) =>
  source2.douas.find((x) => x.id === id) ?? source.douas.find((x) => x.id === id);
/**
 * SEULES exceptions à « chaîne exacte » (décision du référent, ajout du 12/10) : marques du chercheur.
 * rlm : U+200F retirés ; points : « ... » → « … » ; fois : « (×3) », « (×7) » retirés (dits dans le moment) ;
 * ligne_point (MOS-01, deux formules) et ligne_etoile (VOY-01, deux versets) : le séparateur devient un saut de ligne.
 * Phase 2 : espace_virgule (ANG-08) : espace isolée avant une virgule arabe, mise en page de la source.
 */
type Op = 'rlm' | 'points' | 'fois' | 'ligne_point' | 'ligne_etoile' | 'espace_virgule';
const EXCEPTIONS: Record<string, Op[]> = {
  'DOU-SOM-07': ['rlm', 'points'],
  'DOU-MOS-01': ['rlm', 'ligne_point'],
  'DOU-VOY-01': ['points', 'fois', 'ligne_etoile'],
  'DOU-PLU-05': ['points'],
  'DOU-MAL-04': ['points', 'fois'],
  'DOU-ETE-01': ['points'],
  'DOU-ANG-08': ['espace_virgule'],
  // phase 3 : point de la source (U+200F . U+200F) au milieu de l'invocation pour Abū Salama → saut de ligne
  'DOU-DEC-02': ['rlm', 'ligne_point'],
};
function attenduDe(id: string, texte: string): string {
  let t = texte;
  for (const op of EXCEPTIONS[id] ?? []) {
    if (op === 'rlm') t = t.split('‏').join('');
    if (op === 'points') t = t.split('...').join('…');
    if (op === 'fois') t = t.split(' (×3)').join('').split(' (×7)').join('');
    if (op === 'ligne_point') t = t.split(' . ').join('\n');
    if (op === 'ligne_etoile') t = t.split(' * ').join('\n');
    if (op === 'espace_virgule') t = t.split(' ،').join('،');
  }
  return t;
}
const entries = Object.entries(data.douas);
const bytes = (s: string) => Buffer.from(s, 'utf8').toString('hex');
const sha = (alg: string, s: string) =>
  createHash(alg).update(Buffer.from(s, 'utf8')).digest('hex');
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
  it('données construites depuis CES dossiers (empreintes), 94 douas retenues', () => {
    expect(data.source_sha256).toBe(createHash('sha256').update(rawSource).digest('hex'));
    expect(data.source2_sha256).toBe(createHash('sha256').update(rawSource2).digest('hex'));
    expect(data.source3_sha256).toBe(createHash('sha256').update(rawSource3).digest('hex'));
    const phase1 = source.douas.filter((x) => !ids2.has(x.id) && !EN_ATTENTE.includes(x.id));
    expect(entries.length).toBe(phase1.length + source2.douas.length);
    expect(entries.length).toBe(94);
    expect(source3.douas.length).toBe(7);
  });

  it('phases 2 et 3 : chaque texte de hadith a l’empreinte SHA-256 lue sur la source (sunnah.com, dorar.net)', () => {
    let n = 0;
    for (const x of source2.douas) {
      if (!x.texte_ar) {
        expect(x.coran_ref, x.id).toBeTruthy();
        continue;
      }
      expect(sha('sha256', x.texte_ar), x.id).toBe(x.sha256);
      expect(x.url_reference, x.id).toMatch(
        /^https:\/\/(sunnah\.com\/[a-z]+:\d+[a-z]?|dorar\.net\/h\/\w+)$/,
      );
      n++;
    }
    // 16 en phase 2, 7 en phase 3
    expect(n).toBe(23);
  });

  it('chaque hadith affiché est identique octet par octet au dossier (données et rendu), sauf les 7 exceptions listées', () => {
    let n = 0;
    for (const [id, d] of entries) {
      const src = srcDe(id);
      expect(src, id).toBeTruthy();
      if (!d.ar) continue;
      const attendu = attenduDe(id, src!.texte_ar!);
      expect(bytes(d.ar), id).toBe(bytes(attendu));
      // aucune marque du chercheur ne reste, nulle part
      expect(/[\u200F×*]|\.\.\.| \. | ،/.test(d.ar), id).toBe(false);
      const html = render(DouaTexte, { props: { doua: d } }).body;
      // texte du paragraphe, balises d'isolement (<bdi>) ôtées : seul le texte compte
      const shown = [...html.matchAll(/data-douas-ar[^>]*>([\s\S]*?)<\/p>/g)].map((m) =>
        decode(m[1]!.replace(/<[^>]+>/g, '')),
      );
      // une ligne affichée par ligne du texte (deux formules de MOS-01, deux versets de VOY-01)
      expect(shown.length, id).toBe(attendu.split('\n').length);
      expect(bytes(shown.join('\n')), id).toBe(bytes(attendu));
      n++;
    }
    expect(n).toBeGreaterThan(60);
  });

  it('exceptions : seulement les marques du chercheur retirées, rien d’autre', () => {
    for (const [id, ops] of Object.entries(EXCEPTIONS)) {
      const avant = srcDe(id)!.texte_ar!;
      const apres = data.douas[id]!.ar!;
      expect(apres, id).not.toBe(avant);
      // en retirant les mêmes marques des deux côtés, les mots sont identiques
      const mots = (s: string) =>
        s
          .replace(/\u200F/g, '')
          .replace(/\.\.\.|…/g, ' ')
          .replace(/\(×\d+\)/g, ' ')
          .replace(/ ،/g, '،')
          .split(/\s+/)
          .filter((w) => w && w !== '.' && w !== '*');
      expect(mots(apres), id).toEqual(mots(avant));
      expect(ops.length, id).toBeGreaterThan(0);
    }
  });

  it('douas du Coran : texte Tanzil (sans voix de synthèse), rendu entre ﴿ ﴾', () => {
    const coran = entries.filter(([, d]) => d.coran);
    // 15 douas du Coran + la doua de Yūnus (21:87) + 5 versets de la phase 2 (11:41, 28:24, 23:29, 14:40, 3:38)
    expect(coran.length).toBe(21);
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

  it('le fichier publié est exactement celui que construit le script (dossiers + présentation + Tanzil + audio)', () => {
    const out = execFileSync('node', [at('../../../scripts/douas.mjs'), '--verifier'], {
      encoding: 'utf8',
    });
    expect(out).toContain('à jour');
  });

  it('aucune doua écartée ni en attente n’est rendue ; aucune doua sans source', () => {
    const ids = new Set(Object.keys(data.douas));
    const ecartees = [...source.ecartees, ...source2.ecartees];
    for (const id of [...EN_ATTENTE, ...ecartees.map((e) => e.id)])
      expect(ids.has(id), id).toBe(false);
    const listed = [...data.rubriques.flatMap((r) => r.douas), ...data.enfant];
    for (const id of EN_ATTENTE) expect(listed).not.toContain(id);
    const all = JSON.stringify(data);
    for (const e of ecartees) {
      // le texte arabe de l'écartée (sans ses mentions entre crochets) n'apparaît nulle part
      const ar = e.texte_ar.replace(/^\[[^\]]*\]\s*|^\([^)]*\)\s*/, '').replace(/\.\.\.$/, '');
      if (ar) expect(all.includes(ar), e.id).toBe(false);
    }
    // toutes les douas affichables sont dans une rubrique, une seule fois
    expect(data.rubriques.flatMap((r) => r.douas).sort()).toEqual([...ids].sort());
    for (const [id, d] of entries) expect(d.source.recueil, id).toBeTruthy();
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
    expect(src).not.toContain('لَّهُمَّ');
  });
  it('6. tonnerre : parole d’un Compagnon, d’après le Muwaṭṭaʾ', () => {
    expect(d('DOU-PLU-05').compagnon).toMatch(/Compagnon.*Muwaṭṭaʾ/);
  });
  it('7. DOU-ANG-08 (Aḥmad 3712) : réintégrée, texte de dorar.net, divergence signalée', () => {
    expect(d('DOU-ANG-08').source.lien).toMatch(/^https:\/\/dorar\.net\/h\//);
    expect(d('DOU-ANG-08').note).toMatch(/Shuʿayb/);
  });
  it('8. un nombre de répétitions seulement là où il est dans le hadith, dit en français', () => {
    const nombre = /\b(\d+|deux|trois|quatre|sept|dix|cent)\s+fois\b|\d+\s*x\b|×/i;
    const avecNombre = entries
      .filter(([, x]) => nombre.test(`${x.titre} ${x.moment}`))
      .map(([id]) => id);
    // VOY-09 : « trois takbīr » est dans le récit d'al-Bukhārī 1797 (ثَلاَثَ تَكْبِيرَاتٍ), pas dans la formule
    expect(avecNombre.sort()).toEqual(['DOU-MAL-04', 'DOU-VOY-01', 'DOU-VOY-09']);
    expect(d('DOU-MAL-04').moment).toMatch(/trois fois.*sept fois/);
    expect(d('DOU-VOY-01').moment).toMatch(/trois fois/);
    for (const id of ['DOU-MAL-04', 'DOU-VOY-01'])
      expect(source.douas.find((x) => x.id === id)!.texte_ar, id).toContain('×');
  });
  it('voyage : véhicules (note), verset 11:41 sans sunna inventée, ville seulement avec un degré bon', () => {
    for (const id of ['DOU-VOY-01', 'DOU-VOY-02'])
      expect(d(id).note, id).toMatch(/voiture, avion, bateau/);
    expect(d('DOU-VOY-10').coran?.[0]).toMatchObject({ s: 11, a: 41 });
    expect(d('DOU-VOY-10').note).toMatch(/faible/);
    expect(d('DOU-VOY-08').source.degre).toBe('bon');
    expect(inRubrique(data, 'voyage')).toEqual([
      'DOU-VOY-05',
      'DOU-VOY-06',
      'DOU-VOY-02',
      'DOU-VOY-01',
      'DOU-VOY-07',
      'DOU-VOY-04',
      'DOU-VOY-08',
      'DOU-VOY-03',
      'DOU-VOY-09',
      'DOU-VOY-10',
    ]);
  });
  it('titres : le moment seul, sans citation traduite ; pas de redite dans la ligne du moment', () => {
    for (const [id, x] of entries) {
      expect(/[«»“”]/.test(x.titre), `${id} : ${x.titre}`).toBe(false);
      expect(x.titre).not.toMatch(/Compagnon/);
      if (x.moment) expect(x.moment.startsWith(x.titre), id).toBe(false);
    }
  });
  it('panneau Source : recueil, degré en français, savant ; aucune note interne ni URL brute', () => {
    const DEGRES = /^(authentique|bon)$/;
    for (const [id, x] of entries) {
      const s = x.source;
      const textes = [s.recueil, s.degre ?? '', s.juge ?? '', x.note ?? '', x.compagnon ?? ''];
      for (const t of textes) {
        expect(t, id).not.toMatch(
          /confirmer|recherche web|sunnah\.com|http|dorar|islamqa|sahih|da'if|hasan/i,
        );
        // accents : aucun nom de recueil ou de savant écrit sans ses signes
        expect(t, id).not.toMatch(/\b(Bukhari|Tirmidhi|Abu Dawud|Albani|Majah|Muwatta|Nasai)\b/);
      }
      // douas du Coran (la doua de Yūnus, texte coranique, a pour source le hadith d'at-Tirmidhī qui la recommande)
      if (x.coran && id !== 'DOU-ANG-02') {
        expect(s.recueil, id).toMatch(/^Coran \d+:\d+(-\d+)?$/);
        expect(s.lien, id).toBeUndefined();
      } else if (x.compagnon) {
        // parole de Compagnon : aucun degré avant vérification sur l'édition, seulement le lien
        expect(s.degre, id).toBeUndefined();
        expect(s.juge, id).toBeUndefined();
        expect(s.lien, id).toMatch(/^https:\/\/(sunnah\.com\/|dorar\.net\/h\/)/);
      } else {
        expect(s.degre, id).toMatch(DEGRES);
        expect(s.lien, id).toMatch(/^https:\/\/(sunnah\.com\/[a-z]+[:/]|dorar\.net\/h\/)/);
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
  it('aucune phrase arabe sur la ligne du français (titres, moments, notes, sens)', () => {
    for (const [id, x] of entries)
      for (const s of [x.titre, x.moment, x.note ?? '', x.compagnon ?? '', x.traduction])
        expect(/[؀-ۿ]/.test(s), `${id} : ${s}`).toBe(false);
  });
  it('sens en français : présent pour toutes les douas, celui du dossier des traductions', () => {
    for (const [id, x] of entries) {
      expect(x.traduction.trim().length, id).toBeGreaterThan(5);
      expect(x.traduction, id).toBe(traductions.traductions[id]!.fr);
      // deux formules ou deux versets : autant de lignes de sens que de lignes d'arabe
      if (x.ar?.includes('\n'))
        expect(x.traduction.split('\n').length, id).toBe(x.ar.split('\n').length);
    }
  });
});

describe('douas : voix de synthèse provisoire (hadiths seulement)', () => {
  const avecAudio = entries.filter(([, x]) => x.audio);
  it('jamais pour un verset ni pour un hadith qui cite un verset', () => {
    for (const [id, x] of entries) if (x.coran || x.coran_cite) expect(x.audio, id).toBeNull();
    for (const [id, x] of avecAudio) {
      expect(x.ar, id).toBeTruthy();
      // eslint-disable-next-line no-misleading-character-class -- marques coraniques isolées cherchées une à une
      expect(/[\uFD3E\uFD3F\u0671\u06D6-\u06ED]/.test(x.ar!), id).toBe(false);
    }
  });
  it('chaque fichier existe et correspond au texte affiché (empreinte SHA-1)', () => {
    expect(avecAudio.length).toBeGreaterThan(40);
    for (const [id, x] of avecAudio) {
      const a = audioIndex.fichiers[id]!;
      expect(x.audio, id).toBe(`/douas/audio/${a.fichier}`);
      expect(a.texte_sha1, id).toBe(sha('sha1', x.ar!));
      const f = at(`../../../static/douas/audio/${a.fichier}`);
      expect(existsSync(f) && statSync(f).size > 1000, id).toBe(true);
    }
    expect(data.audio?.mention).toBe('Voix de synthèse provisoire');
  });
});

describe('douas : architecture de la phase 2', () => {
  it('groupes : quotidien, moments de la vie, temps de l’année, besoins, Coran ; chaque rubrique dans un seul groupe', () => {
    expect(data.groupes!.map((g) => g.id)).toEqual([
      'quotidien',
      'vie',
      'annee',
      'besoins',
      'coran',
    ]);
    expect(data.groupes!.flatMap((g) => g.rubriques)).toEqual(data.rubriques.map((r) => r.id));
    for (const r of [
      'subsistance',
      'dette',
      'installation',
      'parents',
      'guerison',
      'epreuve',
      'coeur',
      'repentir',
    ])
      expect(groupOf(data, r), r).toBe('besoins');
  });
  it('renvois « Voir aussi » : vers une doua d’une autre rubrique ou vers les adhkār, jamais une copie', () => {
    let adhkar = 0;
    for (const r of data.rubriques)
      for (const v of r.voir_aussi ?? []) {
        if ('doua' in v) {
          expect(data.douas[v.doua], v.doua).toBeTruthy();
          expect(data.douas[v.doua]!.rubrique).not.toBe(r.id);
        } else {
          expect(v.lien).toMatch(/^\/quotidien\/adhkar/);
          adhkar++;
        }
      }
    // « بسم الله الذي لا يضر… » : dans les adhkār du matin et du soir (livre re3.l05), renvoi seulement
    expect(adhkar).toBe(1);
    expect(JSON.stringify(data)).not.toContain('يَضُرُّ');
  });
  it('fiche « Comment invoquer » : chaque point sourcé (hadith lu, ou ouvrage mālikite lu, avec la page)', () => {
    const f = data.fiches!.invoquer!;
    const points = f.sections.flatMap((s) => s.points);
    expect(points.length).toBeGreaterThan(8);
    for (const p of points) {
      expect(/[؀-ۿ]/.test(p.texte), p.texte).toBe(false);
      expect(p.sources.length, p.texte).toBeGreaterThan(0);
      for (const s of p.sources)
        expect(s.lien, s.recueil).toMatch(
          /^https:\/\/(sunnah\.com\/[a-z]+:\d+|app\.turath\.io\/book\/\d+\?page=\d+)$/,
        );
    }
    // langue de l'invocation dans la prière : tranché sur ad-Dardīr et ad-Dusūqī (page lue), plus « en cours »
    const langue = f.sections.find((s) => /autre langue/.test(s.titre))!.points[0]!;
    expect(langue.texte).toMatch(/déconseille.*makrūh.*permis/);
    expect(langue.sources[0]!.recueil).toMatch(/ad-Dardīr.*ad-Dusūqī.*1\/253/);
    expect(JSON.stringify(f)).not.toMatch(/en cours de vérification/);
    // conclure par la prière sur le Prophète : aucune source authentique ou bonne lue, rien d'affiché
    expect(JSON.stringify(f)).not.toMatch(/conclu|terminer|finir par/i);
    expect(source3.ecartees.find((e) => e.id === 'EC3-08')).toBeTruthy();
  });
});

describe('douas : phase 3 (moments de la vie, temps de l’année, aumône)', () => {
  const rub = (id: string) => data.rubriques.find((r) => r.id === id)!;
  const tout = JSON.stringify(data);
  const LIEN = /^https:\/\/(sunnah\.com\/[a-z]+:\d+[a-z]?|dorar\.net\/h\/\w+|app\.turath\.io\/)/;
  it('rubriques : naissance, mariage, décès (vie) ; Ramadan, fêtes et ʿArafa (année)', () => {
    expect(data.groupes!.find((g) => g.id === 'vie')!.rubriques).toEqual([
      'voyage',
      'maladie',
      'naissance',
      'mariage',
      'deces',
    ]);
    expect(data.groupes!.find((g) => g.id === 'annee')!.rubriques).toEqual(['ramadan', 'fetes']);
    expect(rub('mariage').douas).toEqual(['DOU-MAR-01', 'DOU-MAR-02']);
    expect(rub('deces').douas).toEqual(['DOU-DEC-01', 'DOU-DEC-02', 'DOU-DEC-03']);
    expect(rub('ramadan').douas).toEqual(['DOU-RAM-01']);
    expect(rub('fetes').douas).toEqual(['DOU-EID-01']);
    // naissance : aucune formule fixe du Prophète ; seulement des points sourcés
    expect(rub('naissance').douas).toEqual([]);
    expect(rub('naissance').a_savoir!.length).toBeGreaterThanOrEqual(2);
  });
  it('points « À savoir » et « Ce que nous n’ajoutons pas » : en français, sources lues avec lien', () => {
    let n = 0;
    for (const r of data.rubriques)
      for (const [k, ps] of [
        ['a_savoir', r.a_savoir ?? []],
        ['non_ajoute', r.non_ajoute ?? []],
      ] as const)
        for (const p of ps) {
          n++;
          expect(/[؀-ۿ]/.test(p.texte), p.texte).toBe(false);
          if (k === 'a_savoir') expect(p.sources.length, p.texte).toBeGreaterThan(0);
          for (const s of p.sources) expect(s.lien, s.recueil).toMatch(LIEN);
          // « À savoir » : seulement ce qui est authentique ou bon
          if (k === 'a_savoir')
            for (const s of p.sources) expect(s.degre, s.recueil).toMatch(/^(authentique|bon)$/);
        }
    expect(n).toBeGreaterThanOrEqual(15);
  });
  it('naissance : adhān dans l’oreille avec son degré exact et la divergence, jamais présenté comme sunna', () => {
    const p = rub('naissance').non_ajoute!.find((x) => /adhān/.test(x.texte))!;
    expect(p.texte).toMatch(/divergent/);
    expect(p.texte).toMatch(/pas comme une sunna établie/);
    expect(p.sources.map((s) => s.recueil)).toEqual([
      'Abū Dāwūd 5105',
      'at-Tirmidhī 1514',
      'Ibn Ḥajar, at-Talkhīṣ al-ḥabīr 4/1501',
    ]);
    expect(p.sources.map((s) => s.degre)).toEqual(['bon', 'faible', 'faible']);
    // taḥnīk et ʿaqīqa : hadiths authentiques seulement
    const savoir = rub('naissance').a_savoir!.flatMap((x) => x.sources.map((s) => s.recueil));
    expect(savoir).toEqual(['al-Bukhārī 5467', 'al-Bukhārī 5472', 'Abū Dāwūd 2838']);
  });
  it('mariage (Abū Dāwūd 2130), condoléances (al-Bukhārī 1284), rupture du jeûne (Abū Dāwūd 2357)', () => {
    expect(data.douas['DOU-MAR-01']!.source).toMatchObject({
      recueil: 'Abū Dāwūd 2130',
      degre: 'authentique',
      lien: 'https://sunnah.com/abudawud:2130',
    });
    expect(data.douas['DOU-DEC-01']!.source.lien).toBe('https://sunnah.com/bukhari:1284');
    expect(data.douas['DOU-RAM-01']!.source).toMatchObject({ degre: 'bon', juge: 'al-Albānī' });
    // la formule faible de la rupture du jeûne (Abū Dāwūd 2358) n'est pas affichée comme doua
    expect(tout).not.toContain('صُمْتُ');
    expect(tout).not.toContain('صمت');
    // Abū Salama : deux lignes (point de la source), autant de lignes de sens
    expect(data.douas['DOU-DEC-02']!.ar!.split('\n')).toHaveLength(2);
    expect(data.douas['DOU-DEC-02']!.traduction.split('\n')).toHaveLength(2);
  });
  it('fêtes : vœux des Compagnons présentés comme tels, jamais comme hadith du Prophète', () => {
    const e = data.douas['DOU-EID-01']!;
    expect(e.compagnon).toMatch(/Compagnons/);
    expect(e.compagnon).toMatch(/Ce n'est pas une parole du Prophète/);
    expect(e.source.degre).toBeUndefined();
    expect(e.source.lien).toBe('https://dorar.net/h/eksoiWAb');
    const faible = rub('fetes')
      .non_ajoute!.map((p) => p.texte)
      .join(' ');
    expect(faible).toMatch(/très faible/);
  });
  it('ʿArafa : at-Tirmidhī 3585 (faible) et le Muwaṭṭaʾ (mursal) traités honnêtement, pas de doua affichée', () => {
    const p = rub('fetes').non_ajoute!.find((x) => /ʿArafa/.test(x.texte))!;
    expect(p.texte).toMatch(/faible/);
    expect(p.texte).toMatch(/mursal/);
    expect(p.texte).toMatch(/pas comme une parole établie du Prophète/);
    expect(p.sources.map((s) => s.degre)).toEqual(['faible', 'faible', 'mursal']);
    // les mérites du jour de ʿArafa affichés : Muslim seulement
    expect(rub('fetes').a_savoir!.flatMap((x) => x.sources.map((s) => s.recueil))).toEqual([
      'Muslim 1348',
      'Muslim 1162',
    ]);
  });
  it('Ramadan : « trente douas » non ajoutées, nuit du Destin par renvoi (aucun doublon)', () => {
    expect(rub('ramadan').non_ajoute!.some((p) => /trente douas/.test(p.texte))).toBe(true);
    expect(rub('ramadan').voir_aussi).toEqual([{ doua: 'DOU-PAR-05' }]);
    expect(data.douas['DOU-PAR-05']!.rubrique).toBe('repentir');
  });
  it('fiche « L’aumône » : hadiths authentiques ou bons seulement, renvois vers la zakāt des Madjaliss', () => {
    const f = data.fiches!.sadaqa!;
    expect(f.titre).toBe("L'aumône (ṣadaqa)");
    const sources = f.sections.flatMap((s) => s.points.flatMap((p) => p.sources));
    expect(sources.length).toBeGreaterThanOrEqual(8);
    for (const s of sources) {
      expect(s.degre, s.recueil).toMatch(/^(authentique|bon)$/);
      expect(s.lien, s.recueil).toMatch(/^https:\/\/sunnah\.com\/[a-z]+:\d+$/);
    }
    for (const r of ['Muslim 2588', 'al-Bukhārī 1410', 'al-Bukhārī 1417', 'Muslim 1006'])
      expect(sources.map((s) => s.recueil)).toContain(r);
    expect(f.renvois!.map((r) => r.lien)).toEqual([
      '/madjaliss/ibn-ashir/36',
      '/madjaliss/ibn-ashir/40',
    ]);
    // la zakāt n'est pas réécrite : aucun taux ni minimum imposable dans la fiche
    expect(JSON.stringify(f)).not.toMatch(/\d+\s*%|niṣāb|nisab|grammes/i);
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
