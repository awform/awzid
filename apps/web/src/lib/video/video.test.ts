/**
 * Vidéos vivantes (19/10/2026) : interrupteur `video_vivante`, arabe sur sa propre ligne, tracés des lettres
 * (seulement les formes validées par le référent, allers-retours superposés exactement).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  FONCTIONS,
  etatsAvecDemo,
  fonctionsParDefaut,
  fonctionsPour,
  type ContexteFonction,
} from '@awform/school';
import { VIDEO_NIVEAUX } from '@awform/content/video-niveaux';
import {
  STATUTS_VALIDES,
  contenu,
  forme,
  source,
  superposer,
} from '../../../scripts/video-traits.mjs';
import { frH } from './lecteur';
import { arW, frH as frH2 } from './lecteur-v2';

const c = String.fromCharCode;
const traits = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../../static/video/traits.json', import.meta.url)),
    'utf8',
  ),
) as Record<string, Array<{ s: string; t: number[][] } | null>>;

describe('vidéos vivantes : interrupteur « video_vivante »', () => {
  const ctx: ContexteFonction = {
    roles: ['eleve'],
    age: 'adulte',
    pays: 'FR',
    ecoles: [],
    canal: 'beta',
  };
  it('coupé en production et en bêta, allumé sur la démonstration, réglable par l’administrateur', () => {
    expect(FONCTIONS.video_vivante).toEqual({ defaut: 'off', demo: 'on' });
    expect(fonctionsParDefaut().video_vivante).toBe(false);
    expect(fonctionsParDefaut('beta').video_vivante).toBe(false);
    expect(fonctionsPour(ctx, etatsAvecDemo({}, false), []).video_vivante).toBe(false);
    expect(fonctionsPour(ctx, etatsAvecDemo({}, true), []).video_vivante).toBe(true);
    expect(
      fonctionsPour(ctx, etatsAvecDemo({ video_vivante: 'off' }, true), []).video_vivante,
    ).toBe(false);
    expect(
      fonctionsPour(ctx, {}, [{ cle: 'video_vivante', effet: 'on', canal: 'beta' }]).video_vivante,
    ).toBe(true);
  });
  it('indépendant de la refonte et des animations', () => {
    const v = fonctionsPour(ctx, { design_v4: 'on', animations: 'off' }, []);
    expect(v.video_vivante).toBe(false);
    expect(fonctionsPour(ctx, { video_vivante: 'on', design_v4: 'off' }, []).video_vivante).toBe(
      true,
    );
  });
  it('proposé seulement pour les niveaux dont la garde vidéo est calculée (Adultes 1 à 10)', () => {
    expect(VIDEO_NIVEAUX).toEqual([
      'ad1',
      'ad2',
      'ad3',
      'ad4',
      'ad5',
      'ad6',
      'ad7',
      'ad8',
      'ad9',
      'ad10',
      'en1',
    ]);
  });
});

describe('vidéos vivantes v2 : interrupteur « video_v2 », surlignage, animations, textes', () => {
  const ctx: ContexteFonction = {
    roles: ['eleve'],
    age: 'adulte',
    pays: 'FR',
    ecoles: [],
    canal: 'beta',
  };
  const lire = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
  it('coupé en production et en bêta, allumé sur la démonstration, réglable par l’administrateur', () => {
    expect(FONCTIONS.video_v2).toEqual({ defaut: 'off', demo: 'on' });
    expect(fonctionsParDefaut().video_v2).toBe(false);
    expect(fonctionsParDefaut('beta').video_v2).toBe(false);
    expect(
      fonctionsPour({ ...ctx, canal: 'production' }, etatsAvecDemo({}, false), []).video_v2,
    ).toBe(false);
    expect(fonctionsPour(ctx, etatsAvecDemo({}, false), []).video_v2).toBe(false);
    expect(fonctionsPour(ctx, etatsAvecDemo({}, true), []).video_v2).toBe(true);
    expect(fonctionsPour(ctx, etatsAvecDemo({ video_v2: 'off' }, true), []).video_v2).toBe(false);
    expect(fonctionsPour(ctx, {}, [{ cle: 'video_v2', effet: 'on', pays: 'FR' }]).video_v2).toBe(
      true,
    );
  });
  it('coupé : le bouton charge le lecteur v1 (inchangé) ; allumé : le lecteur v2 ; jamais les deux', () => {
    const b = lire('../VideoBouton.svelte');
    expect(b).toMatch(
      /fn\('video_v2'\)\s*\?\s*chargerModule\(\(\) => import\('\$lib\/video\/lecteur-v2'\)\)\s*:\s*chargerModule\(\(\) => import\('\$lib\/video\/lecteur'\)\)/,
    );
  });
  it('surlignage : découpe aux espaces SEULEMENT (aucune liaison de lettres touchée, texte rendu octet pour octet)', () => {
    const ph = `${c(0x628, 0x650, 0x633, 0x652, 0x645, 0x650)} ${c(0x627, 0x644, 0x644, 0x651, 0x64e, 0x647, 0x650)}  ${c(0x644, 0x627)}`;
    const h = arW(ph);
    const mots = [...h.matchAll(/<span class="w">([^<]*)<\/span>/g)].map((m) => m[1]!);
    expect(mots).toEqual(ph.split(/\s+/));
    for (const m of mots) expect(m).not.toMatch(/\s/);
    // les espaces d'origine restent entre les mots : le texte affiché est exactement celui du livre
    expect(h.replace(/<[^>]+>/g, '')).toBe(ph);
    // un mot seul : un seul morceau (son filet doré se remplit)
    expect([...arW(c(0x645, 0x64e, 0x627, 0x621)).matchAll(/class="w"/g)].length).toBe(1);
    // « طَالِبٌ / طُلَّابٌ » : deux mots allumés, la barre jamais ; texte toujours identique
    const deux = `${c(0x637, 0x627, 0x644, 0x650, 0x628)} / ${c(0x637, 0x64f, 0x644, 0x651, 0x627, 0x628)}`;
    expect([...arW(deux).matchAll(/class="w"/g)].length).toBe(2);
    expect(arW(deux).replace(/<[^>]+>/g, '')).toBe(deux);
    // liste de formes, précision entre parenthèses, vers d'un poème : mise en page par classes, texte identique
    for (const t of [`${deux} / ${deux}`, `${ph} (${deux})`, `${ph} … ${ph}`])
      expect(arW(t).replace(/<[^>]+>/g, '')).toBe(t);
    expect(arW(deux)).toContain('class="nw"');
    expect(arW(`${ph} … ${ph}`)).toContain('class="vb"');
  });
  it('l’article cité seul (« ال ») reste dans la phrase, comme une lettre citée', () => {
    const h = frH2(`Leçons 10 à 14 : tanwin, chadda, ${c(0x627, 0x644)}, hamza`);
    expect(h).not.toContain('class="ar');
    expect(h).toContain(`<bdi class="lt" lang="ar" dir="rtl">${c(0x627, 0x644)}</bdi>`);
    // « وَ + لَا : et ne… pas » : lām-alif voyellé compté comme une lettre, tout reste sur une ligne
    expect(frH2(`${c(0x648, 0x64e)} + ${c(0x644, 0x64e, 0x627)} : et ne… pas`)).not.toContain(
      'class="ar',
    );
  });
  it('typographie française : guillemets et ? ! : ; jamais seuls en début ou fin de ligne', () => {
    const h = frH2('La famille de la « dent » et les voyelles : qui parle ?');
    expect(h).toContain('« dent »');
    expect(h).toContain('voyelles :');
    expect(h).toContain('parle ?');
  });
  it('parenthèse ouverte avant une ligne arabe et fermée après : aucune parenthèse orpheline', () => {
    const md = c(0x627, 0x644, 0x652, 0x645, 0x64e, 0x62f, 0x651, 0x64f);
    const h = frH2(`Les voyelles longues (l'allongement naturel, ${md})`, 'h');
    expect(h.replace(/<span class="ar[^>]*>[^<]*<\/span>/g, '')).not.toMatch(/[()]/);
    expect(h).toContain("Les voyelles longues l'allongement naturel,");
    // une parenthèse fermée avant la ligne arabe reste
    expect(frH2(`le mot (au pluriel) ${md}`, 'h')).toContain('(au pluriel)');
    // ouverte avant la ligne arabe, fermée plus loin : les deux partent
    const al = c(0x627, 0x644, 0x643, 0x62a, 0x627, 0x628);
    const h2 = frH2(`former l'annexion (premier nom sans ${al} ni tanwin, au génitif) et la suite`);
    expect(h2.replace(/<span class="ar[^>]*>[^<]*<\/span>/g, '')).not.toMatch(/[()]/);
    // « (arabe) : la suite » : ni parenthèse ni deux-points en tête de ligne
    const h3 = frH2(`L'annexion (${al}) : le complément du nom`);
    expect(h3).toContain('>le complément du nom<');
    expect(h3.replace(/<span class="ar[^>]*>[^<]*<\/span>/g, '')).not.toMatch(/[()]/);
  });
  it('arabe sur sa propre ligne, comme la v1', () => {
    const mot = `${c(0x628, 0x64e, 0x64a, 0x652, 0x62a, 0x64c)}`;
    expect(frH2(`le mot ${mot} veut dire maison`)).toBe(frH(`le mot ${mot} veut dire maison`));
  });
  it('animations sur transform et opacity seulement ; animations réduites : fondus seuls', () => {
    const css = lire('./lecteur-v2.css').replace(/\/\*[\s\S]*?\*\//g, '');
    // transitions : chaque propriété animée est transform ou opacity
    for (const m of css.matchAll(/transition:\s*([^;]+);/g))
      for (const part of m[1]!.split(','))
        expect(['transform', 'opacity'], m[0]).toContain(part.trim().split(/\s+/)[0]);
    // images clés : seulement transform et opacity
    const cles = [...css.matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})*)\s*\}/g)];
    expect(cles.length).toBeGreaterThan(3);
    for (const [, nom, corps] of cles)
      for (const d of corps!.matchAll(/([\w-]+)\s*:/g))
        expect(['transform', 'opacity'], `${nom} : ${d[1]}`).toContain(d[1]);
    // aucune propriété de mise en page animée par le lecteur (largeur, hauteur, marges, position)
    const ts = lire('./lecteur-v2.ts');
    expect(ts).not.toMatch(/style\.(width|height|left|top|margin|padding)\s*=/);
    // animations réduites : fondus seuls (ni glissement, ni zoom, ni filet qui se déroule)
    const reduit = css.slice(css.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
    expect(reduit).toMatch(/animation: vv-fondu/);
    expect(reduit).toMatch(/\.vv \.lc\.joue \.gl \.ar[\s\S]*transform: none/);
    expect(reduit).toMatch(/\.vv \.filet::before[\s\S]*animation: none/);
  });
  it('textes de la v2 (chapitres, sommaire, intertitres, récapitulatif) : français et brouillons en, es, de, ar', () => {
    const fr = JSON.parse(lire('../../../static/i18n/fr-video.json')) as Record<string, string>;
    const cles = [
      'vv.ch_decouvrir',
      'vv.ch_lire',
      'vv.ch_comprendre',
      'vv.ch_entrainer',
      'vv.ch_retenir',
      'vv.programme',
      'vv.chapitre',
      'vv.vu',
      'vv.ecoute_noms',
      'vv.ecoute_mot',
    ];
    for (const k of cles) expect(fr[k], k).toBeTruthy();
    for (const l of ['en', 'es', 'de', 'ar']) {
      const j = JSON.parse(lire(`../../../static/i18n/${l}.json`)) as Record<string, string>;
      for (const k of cles) expect(j[k], `${l} ${k}`).toBeTruthy();
      expect(j['fn.video_v2'], l).toBeTruthy();
    }
    expect(fr['vv.chapitre']).toBe('Chapitre {n} sur {total}');
    // tutoiement dans l'application
    expect(fr['vv.vu']).toBe('Ce que tu as vu');
    // toutes les clés employées par le lecteur v2 existent en français
    const ts = lire('./lecteur-v2.ts');
    const utilisees = new Set(
      [...ts.matchAll(/'(vv\.[a-z_]+)'/g)].map((m) => m[1]!).filter((k) => !k.endsWith('_')),
    );
    for (const k of utilisees) expect(fr[k], k).toBeTruthy();
  });
});

describe('vidéos vivantes : l’arabe sur sa propre ligne', () => {
  const ba = c(0x628);
  const mot = `${c(0x628, 0x64e, 0x64a, 0x652, 0x62a, 0x64c)}`;
  it('une lettre isolée citée reste dans la phrase (police arabe)', () => {
    const h = frH(`la lettre ${ba} se lit b`);
    expect(h).toContain(`<bdi class="lt" lang="ar" dir="rtl">${ba}</bdi>`);
    expect(h).not.toContain('class="ar');
  });
  it('entre parenthèses, le mot arabe garde ses parenthèses sur sa ligne (aucune parenthèse orpheline)', () => {
    expect(frH(`Le Coran imprimé (${mot}) : même texte`)).toBe(
      `<div class="frh"><span class="fr">Le Coran imprimé </span><span class="ar l" lang="ar" dir="rtl">(${mot})</span><span class="fr"> : même texte</span></div>`,
    );
  });
  it('après une ligne arabe, la ligne française ne commence pas par sa virgule', () => {
    expect(frH(`Lettres ${mot}, la ligature`)).toBe(
      `<div class="frh"><span class="fr">Lettres </span><span class="ar l" lang="ar" dir="rtl">${mot}</span><span class="fr">la ligature</span></div>`,
    );
  });
  it('lettres isolées citées (ك ل م ه, la ligature لا) : restent dans la phrase française', () => {
    const k = [0x643, 0x644, 0x645, 0x647].map((x) => c(x)).join(' ');
    const la = c(0x644, 0x627);
    const h = frH(`${k}, la ligature ${la} et le nom d'Allah`);
    expect(h).not.toContain('class="ar');
    expect(h).toContain(
      `<bdi class="lt" lang="ar" dir="rtl">${k}</bdi>, la ligature <bdi class="lt" lang="ar" dir="rtl">${la}</bdi>`,
    );
  });
  it('parenthèse fermante orpheline après une ligne arabe : retirée', () => {
    expect(frH(`un monde (pluriel : ${mot})`)).toBe(
      `<div class="frh"><span class="fr">un monde (pluriel : </span><span class="ar l" lang="ar" dir="rtl">${mot}</span></div>`,
    );
  });
  it('une terminaison citée avec tatweel (une seule lettre) reste dans la phrase', () => {
    const tu = c(0x640, 0x652, 0x62a, 0x64f);
    expect(frH(`base + ${tu} je`)).not.toContain('class="ar');
  });
  it('deux formes arabes séparées par « / » restent sur la même ligne ; « ? » orphelin retiré', () => {
    const fin = c(0x640, 0x64e, 0x627, 0x646, 0x650);
    expect(frH(`Le duel : ${fin} / ${mot} ?`)).toBe(
      `<div class="frh"><span class="fr">Le duel : </span><span class="ar l" lang="ar" dir="rtl">${fin} / ${mot}</span></div>`,
    );
  });
  it('un mot ou une phrase arabe passe sur sa propre ligne, le français autour reste entier', () => {
    const h = frH(`un exemple : ${mot} et la suite`);
    expect(h).toBe(
      `<div class="frh"><span class="fr">un exemple : </span><span class="ar l" lang="ar" dir="rtl">${mot}</span><span class="fr">et la suite</span></div>`,
    );
  });
});

describe('vidéos vivantes : tracés des lettres', () => {
  it('le fichier servi est à jour (scripts/video-traits.mjs)', () => {
    expect(traits).toEqual(JSON.parse(contenu()));
  });
  it('seules les formes validées par le référent sont tracées ; les autres restent complètes', () => {
    // décision du référent (19/10/2026, données v3) : « sur », « sur (dérivé) », « probable », « divergent » tracés
    expect(STATUTS_VALIDES).toEqual(['sur', 'sur (dérivé)', 'probable', 'divergent']);
    const j = source();
    expect(j.version).toBe(3);
    const formes = ['isolee', 'debut', 'milieu', 'fin'];
    let n = 0;
    let total = 0;
    for (const [l, def] of Object.entries(j.lettres))
      formes.forEach((f, i) => {
        const ref = def.formes[f];
        const x = ref ? forme(j, ref, f) : undefined;
        const t = traits[l]![i];
        if (t) n++;
        if (x) total++;
        // le statut reste lisible dans le fichier servi (plus tard : n'afficher que les formes « sur »)
        expect(t?.s, `${l} ${f}`).toBe(
          x && STATUTS_VALIDES.includes(x.statut) ? x.statut : undefined,
        );
      });
    // v3 : toutes les formes sont tracées, aucune « insuffisant » (119 formes distinctes dans SENS_DES_TRAITS.md ;
    // ici, une entrée par lettre et par forme, alias compris : دـ = د…)
    expect(total).toBeGreaterThanOrEqual(119);
    expect(n).toBe(total);
    // ـلا après liaison : « sur (dérivé) » en v3
    const lamalif = c(0x644, 0x627);
    expect(traits[lamalif]![0]?.s).toBe('sur');
    expect(traits[lamalif]![3]?.s).toBe('sur (dérivé)');
    // ع au milieu et à la fin : sens horaire (2ᵉ passe) ; لا : deux traits ; كـ : le corps d'abord, la barre ensuite
    expect(traits[lamalif]![0]!.t).toHaveLength(2);
    const kaf = traits[c(0x643)]![1]!.t;
    expect(kaf).toHaveLength(2);
    expect(kaf[1]!.slice(0, 2)).toEqual([98, 98]);
  });
  it('au milieu du mot, la dent fait un aller-retour superposé exactement', () => {
    const p = superposer({
      pts: [
        [1, 0],
        [0.55, 0.01],
        [0.52, 0.4],
        [0.52, 0.05],
        [0, 0],
      ],
      retours: [[2, 3]],
    });
    // le retour est SUR le segment de montée (pts[1] → pts[2]), à sa hauteur
    const [a, b, r] = [p[1]!, p[2]!, p[3]!];
    const cross = (b[0]! - a[0]!) * (r[1]! - a[1]!) - (b[1]! - a[1]!) * (r[0]! - a[0]!);
    expect(Math.abs(cross)).toBeLessThan(1e-9);
    expect(r[1]).toBe(0.05);
  });
});
