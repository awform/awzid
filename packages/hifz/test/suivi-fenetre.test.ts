import { describe, expect, it } from 'vitest';
import { motsAttendus, type MotEntendu, type VersetTexte } from '../src/ecoute.js';
import {
  FenetreSuivi,
  etatSuivi,
  REGLAGES_ETAT,
  REGLAGES_FENETRE,
  type EcartTexte,
  type LectureFenetre,
} from '../src/suivi.js';

/** Phrases ORDINAIRES (aucun texte religieux retapé) : la logique du suivi ne dépend pas du texte. */
const V: VersetTexte[] = [
  { s: 200, a: 1, text: 'ذَهَبَ الوَلَدُ إِلَى المَدْرَسَةِ صَبَاحًا مَعَ أَخِيهِ' },
  { s: 200, a: 2, text: 'وَقَرَأَ الدَّرْسَ مَعَ أَصْدِقَائِهِ فِي الفَصْلِ' },
  { s: 200, a: 3, text: 'ثُمَّ رَجَعَ إِلَى البَيْتِ مَسْرُورًا' },
];
const ATT = motsAttendus(V);
const TEXTE = V.flatMap((v) => v.text.split(' '));
/** instants d'un mot récité : 0,6 s par mot, le mot dure 0,4 s */
const motK = (w: string, k: number, conf = 0.95): MotEntendu => ({
  w,
  conf,
  t0: k * 0.6,
  t1: k * 0.6 + 0.4,
});

/**
 * Lectures successives (toutes les `pas` s) d'une récitation de `mots` ; chaque lecture voit les `fenetre` dernières
 * secondes et seulement les mots FINIS (un mot coupé par la fin de l'audio n'est pas lu). `alterer(k, lecture)` permet
 * de fausser une lecture (mot instable).
 */
function lectures(
  mots: string[],
  opt: {
    pas?: number;
    fenetre?: number;
    alterer?: (n: number, m: MotEntendu[]) => MotEntendu[];
  } = {},
): LectureFenetre[] {
  const { pas = 0.5, fenetre = 10 } = opt;
  const ent = mots.map((w, k) => motK(w, k));
  const fin = ent.length * 0.6 + 3;
  const out: LectureFenetre[] = [];
  for (let n = 1, t = pas; t <= fin; n++, t += pas) {
    let vus = ent.filter((m) => m.t1! <= t && m.t0! >= t - fenetre);
    if (opt.alterer) vus = opt.alterer(n, vus);
    out.push({
      t,
      mots: vus,
      motsCtc: vus,
      voix: vus.map((m) => [m.t0!, m.t1!] as [number, number]),
    });
  }
  return out;
}

function suivre(l: LectureFenetre[]) {
  const f = new FenetreSuivi();
  const vus: Array<{ t: number; ok: number; ecarts: string[] }> = [];
  for (const x of l) {
    f.ajouter(x);
    const { resultat } = etatSuivi(ATT, f.entree());
    vus.push({
      t: x.t,
      ok: resultat.mots.filter((m) => m === 'ok').length,
      ecarts: resultat.ecarts.map((e) => `${e.type}:${e.i}`),
    });
  }
  return { f, vus };
}

describe('suivi par fenêtre : validation des mots par accord entre lectures', () => {
  it('un mot proche du bord droit de la fenêtre n’est jamais validé', () => {
    const f = new FenetreSuivi();
    const l = lectures(TEXTE);
    // lecture à t = 3,05 s : les mots finis sont loin de la fin sauf les derniers
    f.ajouter(l[5]!);
    f.ajouter(l[6]!);
    for (const w of f.stables)
      expect(w.t1!).toBeLessThanOrEqual(l[6]!.t - REGLAGES_FENETRE.margeDroite + 0.5);
    expect(f.horizon).toBeLessThan(l[6]!.t - REGLAGES_FENETRE.margeDroite + 0.5);
  });

  it('la première lecture ne valide rien (pas d’accord possible) hors mots anciens', () => {
    const f = new FenetreSuivi();
    f.ajouter(lectures(TEXTE)[3]!);
    expect(f.stables).toEqual([]);
    expect(f.provisoires.length).toBeGreaterThan(0);
  });

  it('récitation juste : tous les mots finissent dévoilés, aucun écart à aucun moment', () => {
    const { f, vus } = suivre(lectures(TEXTE));
    expect(vus.every((v) => v.ecarts.length === 0)).toBe(true);
    expect(vus[vus.length - 1]!.ok).toBe(ATT.length);
    expect(f.stables.length).toBe(ATT.length);
  });

  it('un mot dévoilé moins de 2 s après sa fin (lectures toutes les 0,5 s)', () => {
    const { vus } = suivre(lectures(TEXTE));
    // le mot k finit à k*0,6+0,4 ; il doit être dévoilé (provisoire) avant fin + 2 s
    for (const k of [3, 8, 12]) {
      const fin = k * 0.6 + 0.4;
      const premier = vus.find((v) => v.ok >= k + 1 && v.t >= fin);
      expect(premier, `mot ${k}`).toBeDefined();
      expect(premier!.t - fin).toBeLessThanOrEqual(2);
    }
  });

  it('mot oublié : signalé seulement une fois validé (plus de margeDroite après la fin du suivant), jamais avant', () => {
    const oubli = TEXTE.filter((_, k) => k !== 7);
    const { vus } = suivre(lectures(oubli));
    const premier = vus.find((v) => v.ecarts.length > 0);
    expect(premier, 'oubli du mot 7 signalé').toBeDefined();
    // le seul mot visé est le 7 (le type peut d’abord être « ordre » tant que la suite n’est pas validée)
    expect(vus.every((v) => v.ecarts.every((e) => e.endsWith(':7')))).toBe(true);
    expect(vus[vus.length - 1]!.ecarts).toEqual(['oublie:7']);
    // dans l’audio, les mots suivants glissent d’un cran : le mot 8 (devenu 7e lu) finit à 7*0,6+0,4
    const finVoisin = 7 * 0.6 + 0.4;
    // la validation se fait sur le MILIEU du mot (0,2 s avant sa fin)
    expect(premier!.t).toBeGreaterThanOrEqual(
      finVoisin - 0.2 + REGLAGES_FENETRE.margeDroite - 0.01,
    );
    expect(vus.filter((v) => v.t < premier!.t).every((v) => v.ecarts.length === 0)).toBe(true);
  });

  it('un mot lu différemment d’une lecture à l’autre (instable) ne fait rien signaler', () => {
    // le mot 6 est lu « خطأ » une lecture sur deux : pas d’accord -> reste provisoire jusqu’à `forcer`,
    // puis la lecture la plus récente tranche ; avant cela, aucun écart
    const l = lectures(TEXTE, {
      alterer: (n, m) =>
        m.map((x) => (Math.abs(x.t0! - 6 * 0.6) < 0.01 && n % 2 === 0 ? { ...x, w: 'خطأ' } : x)),
    });
    const f = new FenetreSuivi();
    let ecartAvant = false;
    for (const x of l) {
      f.ajouter(x);
      if (x.t < 6 * 0.6 + 0.4 + REGLAGES_FENETRE.forcer - 0.5) {
        const { resultat } = etatSuivi(ATT, f.entree());
        if (resultat.ecarts.length) ecartAvant = true;
        // tant que le désaccord dure, l’horizon ne dépasse pas le mot instable
        if (f.provisoires.some((p) => Math.abs(p.t0! - 6 * 0.6) < 0.01))
          expect(f.horizon).toBeLessThanOrEqual(6 * 0.6 + 0.01);
      }
    }
    expect(ecartAvant).toBe(false);
  });

  it('fenêtre glissante : les mots anciens sortis de la fenêtre restent validés une seule fois', () => {
    const long = [...TEXTE, ...TEXTE, ...TEXTE];
    const f = new FenetreSuivi();
    for (const x of lectures(long, { fenetre: 6 })) f.ajouter(x);
    expect(f.stables.length).toBe(long.length);
    const t0 = f.stables.map((w) => w.t0!);
    expect([...t0].sort((a, b) => a - b)).toEqual(t0);
    expect(new Set(t0).size).toBe(t0.length);
  });
});

describe('suivi par fenêtre : écarts du décodage contraint (service, texte attendu)', () => {
  const v2 = ATT.filter((m) => m.a === 2).map((m) => m.i);
  /** les lectures à partir de `des` (s) portent l'écart `e` (le service renvoie tous ceux de la séance) */
  const avec = (l: LectureFenetre[], des: number, e: EcartTexte[]) =>
    l.map((x) => (x.t >= des ? { ...x, ecartsTexte: e } : x));

  it('verset sauté dit par le service : un seul écart, ses mots montrés oubliés', () => {
    const lus = V.filter((v) => v.a !== 2).flatMap((v) => v.text.split(' '));
    const e: EcartTexte = { type: 'verset_saute', i: v2[0]!, fin: v2[v2.length - 1]! };
    const { f, vus } = suivre(avec(lectures(lus), 5, [e]));
    const fin = etatSuivi(ATT, f.entree()).resultat;
    const couvrent = fin.ecarts.filter((x) => x.fin >= e.i - 1 && x.i <= e.fin + 1);
    expect(couvrent).toHaveLength(1);
    for (const i of v2) expect(fin.mots[i]).toBe('oublie');
    expect(f.ecartsTexte).toHaveLength(1); // reçu à chaque lecture, gardé une fois
    expect(vus.some((x) => x.t < 5 && x.ecarts.includes(`verset_saute:${e.i}`))).toBe(false);
  });

  it('mot ajouté dit par le service : écart « ajouté », les mots restent dévoilés', () => {
    const { f } = suivre(avec(lectures(TEXTE), 6, [{ type: 'ajoute', i: 3, fin: 3 }]));
    const r = etatSuivi(ATT, f.entree()).resultat;
    expect(r.ecarts.map((x) => `${x.type}:${x.i}`)).toEqual(['ajoute:3']);
    expect(r.mots.every((m) => m === 'ok')).toBe(true);
    expect(r.ecarts[0]).toMatchObject({ s: ATT[3]!.s, a: ATT[3]!.a });
  });

  it('écart hors du texte ignoré ; REGLAGES_ETAT.texte = false : le service n’est pas écouté', () => {
    const { f } = suivre(avec(lectures(TEXTE), 6, [{ type: 'ajoute', i: 99, fin: 99 }]));
    expect(etatSuivi(ATT, f.entree()).resultat.ecarts).toEqual([]);
    const g = suivre(avec(lectures(TEXTE), 6, [{ type: 'ajoute', i: 3, fin: 3 }])).f;
    REGLAGES_ETAT.texte = false;
    try {
      expect(etatSuivi(ATT, g.entree()).resultat.ecarts).toEqual([]);
    } finally {
      REGLAGES_ETAT.texte = true;
    }
  });
});
