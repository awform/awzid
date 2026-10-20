/**
 * Garde coranique de la voix (`src/garde-coran.ts`) sur le VRAI texte Tanzil : règle partagée par les vidéos vivantes
 * et l'import des audios des leçons. Aucun texte coranique n'est écrit ici : les extraits sont pris dans le fichier
 * Tanzil, les formules dans `data/dhikr-formules.json`. `HADITH_GARDE=ecrire` régénère `src/hadith-garde.ts`.
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { audioKey, looksQuranic, skeleton } from '../src/audio-cle.js';
import {
  citationInterdite,
  citeCoran,
  estHadith,
  gardeCle,
  gardeCoran,
  motsSquelette,
  refusVoix,
} from '../src/garde-coran.js';
import { HADITH_CITANTS } from '../src/hadith-garde.js';
import { motsDhikr } from '../src/dhikr.js';
import { loadTanzil, parseDataFile } from '../src/index.js';
import { CONTENT_DIR, HAS_CONTENT } from './helpers.js';

const TSV = join(CONTENT_DIR, 'coran', 'tanzil-uthmani.tsv');
const tanzil = existsSync(TSV) ? loadTanzil(readFileSync(TSV, 'utf8')) : null;
const cleVerset = (k: string) => k.split(':').map(Number) as [number, number];
const verses = tanzil
  ? [...tanzil.entries()]
      .sort(([a], [b]) => {
        const [x, y] = cleVerset(a);
        const [u, v] = cleVerset(b);
        return x - u || y - v;
      })
      .map(([, v]) => v)
  : [];
const formules = (
  JSON.parse(readFileSync(new URL('../data/dhikr-formules.json', import.meta.url), 'utf8')) as {
    formules: { ar: string; fr: string; categorie: string }[];
  }
).formules;
/** formule de la liste, en clé audio (comme l'index du moteur des livres) */
const formule = (cat: string, n = 0) =>
  audioKey(formules.filter((f) => f.categorie === cat)[n]!.ar);
/** salut final de la prière (« السلام عليكم ورحمة الله »), pris dans la liste */
const salut = () => audioKey(formules.find((f) => f.fr.includes('taslīm'))!.ar);
/** mots d'un verset, en clés audio, sans signe propre au Muṣḥaf */
const mots = (ref: string) =>
  audioKey(tanzil!.get(ref)!)
    .split(' ')
    .filter((w) => !looksQuranic(w));
/** écriture courante approchée d'un verset : l'alif suscrit devient un alif (ٱلْعَٰلَمِينَ → الْعَالَمِينَ) */
const courant = (v: string) => audioKey(v.replace(/ٰ/g, 'ا'));

describe.skipIf(!tanzil)('garde coranique de la voix (Tanzil)', () => {
  const g = tanzil ? gardeCoran(verses) : null!;
  /** sans la liste blanche, ce texte contiendrait-il 4 mots consécutifs du Coran ? (squelette seul) */
  const quatreMots = (s: string) => {
    const w = skeleton(s).split(' ');
    return w.some((_, i) => g.suites.has(w.slice(i, i + 4).join(' ')));
  };

  it('« مَا شَاءَ اللَّهُ » (dans 18:39) et la kaffārat al-majlis sont des formules : voix permise', () => {
    const ms = formule('formule');
    expect(skeleton(audioKey(tanzil!.get('18:39')!))).toContain(skeleton(ms));
    expect(refusVoix(ms, g)).toBeNull();
    const k = formule('kaffara');
    expect(refusVoix(k, g)).toBeNull();
    // sans la liste blanche, la kaffāra serait une citation (« أَنْ لَا إِلٰهَ إِلَّا أَنْتَ », 21:87)
    expect(quatreMots(k)).toBe(true);
  });

  it('isti‘ādha (liste blanche, 16:98) : voix permise, seule ou dans une phrase', () => {
    const a = formule('istiadha');
    expect(quatreMots(a)).toBe(true);
    expect(refusVoix(a, g)).toBeNull();
    expect(refusVoix(`${a}.`, g)).toBeNull();
    expect(refusVoix(`قُلْ: ${a}، وَاجْلِسْ.`, g)).toBeNull();
  });

  it('« أَعُوذُ بِكَلِمَاتِ اللَّهِ التَّامَّاتِ مِنْ شَرِّ مَا خَلَقَ » (entrée nominative) : voix permise ; 113:2 seul ou récité : refusé', () => {
    const f = formule('istiadha', 1);
    expect(quatreMots(f)).toBe(true);
    expect(refusVoix(f, g)).toBeNull();
    // le hadith (Muslim) qui la contient
    expect(
      refusVoix(
        `مَنْ نَزَلَ مَنْزِلًا ثُمَّ قَالَ: ${f}، لَمْ يَضُرَّهُ شَيْءٌ حَتَّى يَرْتَحِلَ مِنْ مَنْزِلِهِ ذٰلِكَ`,
        g,
      ),
    ).toBeNull();
    // 113:2 seul (verset entier) : refusé, même s'il fait partie de la formule
    const v2 = mots('113:2').join(' ');
    expect(skeleton(f).endsWith(skeleton(v2))).toBe(true);
    expect(refusVoix(v2, g)).toBe('coran');
    // récitation d'Al-Falaq (113:1 sans sa Basmala, puis 113:2) : refusée
    const falaq = `${mots('113:1').slice(4).join(' ')} ${v2}`;
    expect(refusVoix(falaq, g)).not.toBeNull();
    // le seuil général ne bouge pas : 4 mots du Coran hors formule restent une citation
    expect(refusVoix(`${mots('2:255').slice(3, 7).join(' ')}`, g)).toBe('citation');
  });

  it('Basmala complète : suivie d’un salut (début de lettre), voix permise ; seule ou en tête de sourate, refusée', () => {
    const b = formule('basmala', 1);
    expect(skeleton(b)).toBe(skeleton(audioKey(tanzil!.get('1:1')!)));
    expect(refusVoix(`${b}. ${salut()}. كَيْفَ حَالُكِ؟`, g)).toBeNull();
    // citée en tafsir (décision du référent) : pas une récitation, voix permise
    expect(refusVoix(`كَلِمَةُ التَّقْوَى عِنْدَ ابْنِ عَبَّاسٍ هِيَ «${b}».`, g)).toBeNull();
    // seule : verset entier (1:1)
    expect(refusVoix(b, g)).toBe('coran');
    // en tête de sourate : la Basmala puis le début du verset (112:1, texte Tanzil sans sa Basmala)
    const ikhlas = mots('112:1').slice(4).join(' ');
    expect(refusVoix(`${b} ${ikhlas}`, g)).not.toBeNull();
    // en contexte de récitation (« قرأ », la Fātiḥa, une sourate) : du Coran
    expect(refusVoix(`قَرَأَ الْإِمَامُ «${b}» قَبْلَ الْفَاتِحَةِ.`, g)).toBe('coran');
    expect(refusVoix(`${b}. ${salut()}. نَقْرَأُ سُورَةً.`, g)).toBe('coran');
  });

  it('une suite de 4 mots du Coran est refusée, seule ou dans une phrase ; 3 mots ou un mot isolé sont permis', () => {
    const w = mots('2:255');
    const quatre = w.slice(3, 7).join(' ');
    expect(citeCoran(quatre, g)).toBe(true);
    expect(refusVoix(quatre, g)).toBe('citation');
    expect(refusVoix(`${formule('formule')} ${quatre}`, g)).toBe('citation');
    expect(refusVoix(w.slice(3, 6).join(' '), g)).toBeNull();
    expect(refusVoix(w[3]!, g)).toBeNull();
  });

  it('hadith identifié (« رواه », parole du Prophète ﷺ citée) : accepté même avec 4 mots du Coran ; jamais s’il annonce un verset', () => {
    const quatre = mots('2:255').slice(3, 7).join(' ');
    expect(refusVoix(`قَالَ النَّبِيُّ ﷺ: «${quatre}»`, g)).toBeNull();
    expect(refusVoix(`عَنْ أَبِي هُرَيْرَةَ: ${quatre}. رَوَاهُ مُسْلِمٌ.`, g)).toBeNull();
    expect(estHadith(`${quatre} رَوَاهُ الْبُخَارِيُّ`)).toBe(true);
    // un verset annoncé, même dans un hadith : refusé
    expect(refusVoix(`قَالَ اللَّهُ تَعَالَى: ${quatre}. رَوَاهُ مُسْلِمٌ.`, g)).toBe('citation');
    expect(refusVoix(`ثُمَّ قَرَأَ ﷺ: «${quatre}»`, g)).toBe('citation');
    // un hadith qui récite un verset entier (112:1, 1:2) : refusé
    const ikhlas = mots('112:1').slice(4).join(' ');
    expect(refusVoix(`قَالَ النَّبِيُّ ﷺ: «${ikhlas}، وَالْمُعَوِّذَتَيْنِ»`, g)).toBe('citation');
    expect(refusVoix(`${mots('1:2').join(' ')} رَوَاهُ مُسْلِمٌ`, g)).toBe('citation');
    // sans marque de hadith : refusé
    expect(refusVoix(`قَالَ الْإِمَامُ: ${quatre}`, g)).toBe('citation');
    // référence de verset : jamais exempté, même dans un hadith
    expect(refusVoix(`${quatre} (2:255) رَوَاهُ مُسْلِمٌ`, g)).toBe('citation');
  });

  it('alifs : « قَالَتْ: مَا شَاءَ اللَّهُ » et « فَقَالَ: الْحَمْدُ لِلَّهِ الَّذِي… » ne sont pas 18:39 ni 23:28', () => {
    const ms = formule('formule');
    const hamd = formule('tahmid');
    // les vrais versets (Tanzil) : citations
    const v18 = mots('18:39');
    const i18 = v18.findIndex(
      (_, i) => skeleton(v18.slice(i + 1, i + 4).join(' ')) === skeleton(ms),
    );
    expect(i18).toBeGreaterThanOrEqual(0);
    expect(citeCoran(v18.slice(i18, i18 + 4).join(' '), g)).toBe(true);
    const v23 = mots('23:28');
    const i23 = v23.findIndex(
      (_, i) => skeleton(v23.slice(i + 1, i + 3).join(' ')) === skeleton(hamd),
    );
    expect(i23).toBeGreaterThanOrEqual(0);
    expect(citeCoran(v23.slice(i23, i23 + 4).join(' '), g)).toBe(true);
    // les phrases des livres : même squelette, mais un alif écrit là où le Coran n'en a pas
    for (const s of [
      `قَالَتْ: ${ms}! الصُّحُونُ مَغْسُولَةٌ، وَالْمَطْبَخُ نَظِيفٌ!`,
      `قَالَتْ: ${ms}! الْيَوْمَ دَرْسُنَا.`,
      `وَبَعْدَ الطَّعَامِ قَامَ الْإِمَامُ فَقَالَ: ${hamd} الَّذِي جَمَعَنَا عَلَى الْخَيْرِ.`,
    ]) {
      expect(quatreMots(s), s).toBe(true);
      expect(citeCoran(s, g), s).toBe(false);
      expect(refusVoix(s, g), s).toBeNull();
    }
    // mots découpés comme le squelette
    for (const v of verses.slice(0, 300))
      expect(
        motsSquelette(v)
          .map((x) => x.k)
          .join(' '),
      ).toBe(skeleton(v));
  });

  it('aucune régression : chaque verset de 4 mots ou plus, en écriture du Muṣḥaf ou courante, reste une citation', () => {
    let n = 0;
    for (const v of verses)
      for (const t of [audioKey(v), courant(v)]) {
        const w = t.split(' ').filter((x) => !looksQuranic(x));
        const quatre = w.slice(0, 4).join(' ');
        // moins de 4 mots de squelette, ou 4 mots d'une formule de la liste (Basmala de tête de sourate…) : hors sujet
        if (skeleton(quatre).split(' ').length < 4 || motsDhikr(quatre).every((x) => x.f)) continue;
        n++;
        expect(citeCoran(quatre, g), t).toBe(true);
      }
    expect(n).toBeGreaterThan(6000);
  });

  it('présenté comme Coran (référence de verset, verset entier) : refusé, même court, même pour une formule', () => {
    const deux = mots('2:255').slice(3, 5).join(' ');
    expect(refusVoix(deux, g)).toBeNull();
    expect(refusVoix(`${deux} (2:255)`, g)).toBe('coran');
    expect(refusVoix(`${formule('formule')} (18:39)`, g)).toBe('coran');
    const court = verses.findIndex((v) => audioKey(v).split(' ').length === 2);
    expect(court).toBeGreaterThan(0);
    expect(refusVoix(audioKey(verses[court]!), g)).toBe('coran');
  });
});

/** source d'un recueil de hadiths citée dans la traduction */
const RECUEIL =
  /al-Bukhārī|\bMuslim\b|Abū Dāwūd|at-Tirmidhī|an-Nasāʾī|Ibn Mājah|al-Muwaṭṭaʾ|rapporté par/i;
/** ce qui renvoie au Coran : référence de verset, sourate, verset */
const VERS_LE_CORAN = /\d{1,3}\s*:\s*\d{1,3}|sourate|verset|Coran/i;
/** fichiers de données des livres (tous les niveaux) */
function fichiersLivres(d = join(CONTENT_DIR, 'data'), out: string[] = []): string[] {
  for (const f of readdirSync(d).sort()) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) fichiersLivres(p, out);
    else if (f.endsWith('.js')) out.push(p);
  }
  return out;
}

describe.skipIf(!tanzil || !HAS_CONTENT)('hadiths des livres', () => {
  it('hadiths à jour : textes que les livres donnent comme hadith ou athar et qui reprennent 4 mots du Coran', () => {
    const g = gardeCoran(verses);
    const out = new Set<string>();
    const visit = (v: unknown, parent: string, horsCoran: boolean) => {
      if (Array.isArray(v)) return v.forEach((x) => visit(x, parent, horsCoran));
      if (!v || typeof v !== 'object') return;
      const o = v as Record<string, unknown>;
      if (horsCoran && typeof o.ar === 'string' && citeCoran(o.ar, g)) {
        const champs = Object.entries(o)
          .filter(([k, x]) => k !== 'ar' && typeof x === 'string')
          .map(([, x]) => x as string)
          .join(' ');
        const fr = typeof o.fr === 'string' ? o.fr : '';
        const hadith =
          'grade' in o ||
          'rawi_fr' in o ||
          'source_fr' in o ||
          parent === 'hadiths' ||
          RECUEIL.test(fr);
        if (hadith && !VERS_LE_CORAN.test(champs)) out.add(gardeCle(o.ar));
      }
      for (const [k, x] of Object.entries(o)) visit(x, k, horsCoran && k !== 'coran');
    };
    let lus = 0;
    for (const f of fichiersLivres()) {
      let value: unknown;
      try {
        value = parseDataFile(readFileSync(f, 'utf8'), f).value;
      } catch {
        continue;
      }
      lus++;
      visit(value, '', true);
    }
    expect(lus).toBeGreaterThan(500);
    const want = [...out].sort().join(' ');
    if (process.env.HADITH_GARDE === 'ecrire') {
      const p = new URL('../src/hadith-garde.ts', import.meta.url);
      writeFileSync(
        p,
        readFileSync(p, 'utf8').replace(
          /export const HADITH_CITANTS =[^;]*;/,
          `export const HADITH_CITANTS =\n  '${want}';`,
        ),
      );
      return;
    }
    expect(HADITH_CITANTS.split(' ').filter(Boolean).sort().join(' '), 'HADITH_GARDE=ecrire').toBe(
      want,
    );
    // le référent : un hadith n'est pas du Coran (toute empreinte de la liste est exemptée de la règle des 4 mots)
    expect(citationInterdite).toBeTypeOf('function');
  }, 300_000);
});
