/**
 * Formules de dhikr : LISTE BLANCHE (décision du référent, 20/10/2026). Ce sont des adhkār, pas de la tilāwa : la
 * voix de synthèse les lit (vidéos vivantes, génération des audios). Source relue : `data/dhikr-formules.json` (même
 * fichier pour `gen-audio.ps1`) ; `DHIKR` en est la forme SANS VOYELLES, générée par le test
 * (`DHIKR=ecrire pnpm --filter @awform/content test video`), qui échoue si elle diffère du fichier.
 *
 * Comparaison mot pour mot sur le texte sans voyelles (`sansVoyelles`) ; le premier mot d'une formule peut porter
 * و ou ف collé. La garde coranique reste entière pour tout ce qui est présenté comme Coran (voir `video.ts`).
 */
export const DHIKR =
  'لا اله الا الله|لا اله الا الله وحده لا شريك له|اشهد ان لا اله الا الله|اشهد ان محمدا عبده ورسوله|اشهد ان محمدا رسول الله|ما شاء الله|ان شاء الله|سبحان الله|سبحان الله وبحمده|الحمد لله|الحمد لله علي السلامه|الله اكبر|استغفر الله|لا حول ولا قوه الا بالله|بسم الله|بسم الله الرحمن الرحيم|صلي الله عليه وسلم|اللهم صل علي محمد|التحيات لله الزاكيات لله الطيبات الصلوات لله السلام عليك ايها النبي ورحمه الله وبركاته السلام علينا وعلي عباد الله الصالحين اشهد ان لا اله الا الله واشهد ان محمدا عبده ورسوله|سبحان ربي العظيم|سبحان ربي الاعلي|سمع الله لمن حمده|ربنا ولك الحمد|السلام عليكم ورحمه الله|اللهم انت السلام ومنك السلام تباركت يا ذا الجلال والاكرام|جزاك الله خيرا|جزاكم الله خيرا|جزاكما الله خيرا|بارك الله|تقبل الله منا ومنكم|تقبل الله منك|شفانا الله جميعا|اللهم اجعل القران ربيع قلوبنا|سبحانك اللهم وبحمدك اشهد ان لا اله الا انت استغفرك واتوب اليك|اعوذ بالله من الشيطان الرجيم';

// classes écrites par codes (une fonction : la règle no-misleading-character-class ne les évalue pas)
const c = (n: number) => String.fromCharCode(n);
/** voyelles et signes (U+064B à U+065F, alif suscrit, tatweel, signes du Muṣḥaf) : classe écrite par codes */
const MARQUES = new RegExp(
  `[${c(0x64b)}-${c(0x65f)}${c(0x670)}${c(0x640)}${c(0x6d6)}-${c(0x6ed)}]`,
  'g',
);
/** texte sans voyelles ni signes ; formes d'alif, alif maqṣūra et tā' marbūṭa ramenées à une seule */
export const sansVoyelles = (s: string): string =>
  s
    .replace(MARQUES, '')
    .replace(/[آأإٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه');

/** mot arabe (lettres et signes) */
const MOT = new RegExp(`[${c(0x621)}-${c(0x65f)}${c(0x670)}-${c(0x6ed)}]+`, 'g');
let liste: string[][] | null = null;

export interface MotDhikr {
  /** place dans le texte (début, fin) */
  a: number;
  b: number;
  /** le mot appartient à une formule de la liste */
  f: boolean;
}

/** Mots arabes d'un texte et, pour chacun, s'il appartient à une formule de la liste blanche. */
export function motsDhikr(s: string): MotDhikr[] {
  liste ??= DHIKR.split('|').map((x) => x.split(' '));
  const ms = [...s.matchAll(MOT)].map((m) => ({
    a: m.index,
    b: m.index + m[0].length,
    w: sansVoyelles(m[0]),
    f: false,
  }));
  for (const f of liste)
    for (let i = 0; i + f.length <= ms.length; i++) {
      const w = ms[i]!.w;
      if (w !== f[0] && w !== `و${f[0]}` && w !== `ف${f[0]}`) continue;
      if (f.every((x, k) => !k || ms[i + k]!.w === x))
        for (let k = 0; k < f.length; k++) ms[i + k]!.f = true;
    }
  return ms.map(({ a, b, f }) => ({ a, b, f }));
}

/** Le texte contient-il une formule de la liste ? */
export const contientDhikr = (s: string): boolean => motsDhikr(s).some((m) => m.f);

/** espaces et ponctuation (latine et arabe) au bord d'un morceau */
const BORD = /^[\s،؛؟.,:;!?«»"()…—–|/←-]+|[\s،؛؟.,:;!?«»"()…—–|/←-]+$/g;

/** Morceaux du texte HORS des formules de la liste (le texte entier s'il n'en contient pas). */
export function horsDhikr(s: string): string[] {
  const out: string[] = [];
  let a = 0;
  for (const m of motsDhikr(s))
    if (m.f) {
      out.push(s.slice(a, m.a));
      a = m.b;
    }
  out.push(s.slice(a));
  return out.map((x) => x.replace(BORD, '')).filter((x) => /[ء-ي]/.test(x));
}
