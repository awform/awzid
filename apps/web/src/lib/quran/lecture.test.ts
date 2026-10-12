import { describe, expect, it } from 'vitest';
import {
  BASMALA,
  basmalaInFatiha,
  clampRange,
  needsBasmala,
  nextSuraRange,
  withBasmala,
  hizbStart,
  isMarked,
  legacyQuery,
  playQueue,
  PRESETS,
  presetOf,
  presetRange,
  readLast,
  readMarks,
  shortName,
  toggleMark,
  writeLast,
} from './lecture';
import { readPrefs, writePrefs } from './mushaf';

const mem = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
};
const base = { repeatVerse: 1, repeatRange: 1, chain: false, repeatNew: 5, repeatChain: 2 };

describe('Coran épuré — écran de lecture unique', () => {
  it('préréglages : plage et file ; le préréglage actif est reconnu', () => {
    const r = presetRange('suite', 112, 2, 4);
    expect(r).toEqual({ s: 112, from: 2, to: 4 });
    expect(presetRange('sourate', 112, 2, 4)).toEqual({ s: 112, from: 1, to: 4 });
    expect(presetRange('verset', 112, 9, 4)).toEqual({ s: 112, from: 4, to: 4 });
    const v3 = { ...base, ...PRESETS.find((p) => p.id === 'verset3')!.set };
    expect(playQueue(r, v3).queue).toEqual([2, 2, 2, 3, 3, 3, 4, 4, 4]);
    expect(presetOf(v3, r, 4)).toBe('verset3');
    expect(presetOf(base, r, 4)).toBe('simple');
    const boucle = { ...base, repeatRange: 20 };
    expect(presetOf(boucle, { s: 112, from: 1, to: 4 }, 4)).toBe('boucle');
    expect(presetOf(boucle, r, 4)).toBeNull();
    expect(presetOf({ ...base, repeatVerse: 20 }, { s: 112, from: 3, to: 3 }, 4)).toBe('repeter');
    expect(presetOf({ ...base, repeatVerse: 7 }, r, 4)).toBeNull();
  });

  it('mémoriser : écouter, répéter, enchaîner (étapes données à la mini-barre)', () => {
    const m = { ...base, chain: true, repeatNew: 1, repeatChain: 1 };
    const q = playQueue({ s: 113, from: 1, to: 2 }, m);
    expect(q.queue).toEqual([1, 2, 1, 2]);
    expect(q.steps?.map((x) => x.kind)).toEqual(['nouveau', 'nouveau', 'enchainer', 'enchainer']);
    expect(presetOf({ ...base, chain: true }, null, 5)).toBe('memoriser');
  });

  it('plage bornée ; début des ḥizb', () => {
    expect(clampRange({ s: 1, from: 9, to: 2 }, 7)).toEqual({ s: 1, from: 7, to: 7 });
    expect(clampRange({ s: 1, from: 0, to: 99 }, 7)).toEqual({ s: 1, from: 1, to: 7 });
    const q = Array.from({ length: 240 }, (_, i) => [i + 1, 1] as const);
    expect(hizbStart(q, 1)).toEqual([1, 1]);
    expect(hizbStart(q, 2)).toEqual([5, 1]);
    expect(hizbStart(q, 61)).toBeNull();
  });

  it('dernière lecture et signets gardés sur l’appareil, bornés', () => {
    const st = mem();
    expect(readLast(st)).toBeNull();
    writeLast({ s: 112, a: 2, p: 604 }, st, 5);
    expect(readLast(st)).toEqual({ s: 112, a: 2, p: 604, t: 5 });
    st.setItem('awzid.coran.derniere-lecture.v1', '{"s":200,"a":1,"p":1}');
    expect(readLast(st)).toBeNull();
    let m = toggleMark({ s: 2, a: 255, p: 42 }, st, 1);
    expect(isMarked(m, 2, 255)).toBe(true);
    m = toggleMark({ s: 1, a: 1, p: 1 }, st, 2);
    expect(m.map((x) => `${x.s}:${x.a}`)).toEqual(['1:1', '2:255']);
    m = toggleMark({ s: 2, a: 255, p: 42 }, st, 3);
    expect(isMarked(m, 2, 255)).toBe(false);
    expect(readMarks(st).map((x) => `${x.s}:${x.a}`)).toEqual(['1:1']);
    st.setItem('awzid.coran.signets.v1', '{oops');
    expect(readMarks(st)).toEqual([]);
  });

  it('réglages de lecture relus avec des bornes (vue, vitesse, arrêt, volume, mémoriser)', () => {
    const st = mem();
    // lot lecteur 4 (décision du client) : « Grand texte » par défaut
    expect(readPrefs(st).vue).toBe('versets');
    expect(readPrefs(st).size).toBe(1);
    expect(readPrefs(st).showTrad).toBe(false);
    writePrefs(
      { ...readPrefs(st), vue: 'versets', rate: 3, sleepMin: 7, volume: 4, chain: true },
      st,
    );
    const p = readPrefs(st);
    expect([p.vue, p.rate, p.sleepMin, p.volume, p.chain]).toEqual(['versets', 1, 0, 1, true]);
  });

  it('basmala avant le verset 1 : sauf at-Tawba, sauf Fātiḥa quand elle y est le verset 1, jamais d’une autre riwāya', () => {
    const o = { chain: false, repeatVerse: 1, wholeFile: false };
    expect(needsBasmala({ s: 2, from: 1, to: 286 }, 'hafs', o)).toBe(true);
    expect(needsBasmala({ s: 112, from: 1, to: 4 }, 'hafs', o)).toBe(true);
    expect(needsBasmala({ s: 9, from: 1, to: 129 }, 'hafs', o)).toBe(false);
    expect(needsBasmala({ s: 2, from: 5, to: 286 }, 'hafs', o)).toBe(false);
    expect(needsBasmala({ s: 1, from: 1, to: 7 }, 'hafs', o)).toBe(false);
    expect(needsBasmala({ s: 1, from: 1, to: 7 }, 'shuba', o)).toBe(false);
    expect(needsBasmala({ s: 1, from: 1, to: 7 }, 'qalun', o)).toBe(true);
    expect(needsBasmala({ s: 2, from: 1, to: 1 }, 'hafs', { ...o, repeatVerse: 20 })).toBe(false);
    expect(needsBasmala({ s: 2, from: 1, to: 286 }, 'hafs', { ...o, chain: true })).toBe(false);
    expect(needsBasmala({ s: 67, from: 1, to: 30 }, 'susi', { ...o, wholeFile: true })).toBe(false);
    expect(['hafs', 'shuba', 'bazzi'].every(basmalaInFatiha)).toBe(true);
    expect(['warsh', 'qalun', 'susi', 'duri'].some(basmalaInFatiha)).toBe(false);
    expect(withBasmala([1, 2, 3], true, true)).toEqual([BASMALA, 1, 2, 3]);
    expect(withBasmala([1, 2, 3], true, false)).toEqual([1, 2, 3]);
    expect(withBasmala([2, 3], true, true)).toEqual([2, 3]);
    expect(withBasmala([1, 2], false, true)).toEqual([1, 2]);
  });

  it('lecture simple jusqu’au bout : la sourate suivante enchaîne (pas en répétition ni mémorisation)', () => {
    const len = (s: number) => (s === 113 ? 5 : 4);
    expect(nextSuraRange({ s: 112, from: 1, to: 4 }, 4, base, len)).toEqual({
      s: 113,
      from: 1,
      to: 5,
    });
    expect(nextSuraRange({ s: 112, from: 1, to: 3 }, 4, base, len)).toBeNull();
    expect(nextSuraRange({ s: 114, from: 1, to: 6 }, 6, base, len)).toBeNull();
    expect(
      nextSuraRange({ s: 112, from: 1, to: 4 }, 4, { ...base, repeatRange: 3 }, len),
    ).toBeNull();
    expect(nextSuraRange({ s: 112, from: 1, to: 4 }, 4, { ...base, chain: true }, len)).toBeNull();
    expect(
      nextSuraRange({ s: 112, from: 4, to: 4 }, 4, { ...base, repeatVerse: 20 }, len),
    ).toBeNull();
  });

  it('anciennes adresses redirigées vers l’écran unique (paramètres gardés, rien de lancé)', () => {
    const q = (s: string) => new URLSearchParams(s);
    expect(legacyQuery('ecouter', q('s=112&a=3&r=essai-hafs'))).toBe(
      's=112&a=3&r=essai-hafs&ecoute=1',
    );
    expect(legacyQuery('mushaf', q('page=604&m=warsh'))).toBe('page=604&m=warsh&vue=page');
    expect(legacyQuery('memoriser', q(''))).toBe('memo=1');
    expect(legacyQuery('ecouter', q('s=<script>'))).toBe('ecoute=1');
  });

  it('nom abrégé du récitateur', () => {
    expect(shortName('Muḥammad Ayyūb')).toBe('Muḥammad Ayyūb');
    expect(shortName('ʿAbdullāh ibn ʿAwwād al-Juhanī')).toBe('A. al-Juhanī');
    expect(shortName('Ibrāhīm al-Akhḍar')).toBe('I. al-Akhḍar');
    expect(shortName('Essai Ḥafṣ (bips)')).toBe('E. Ḥafṣ');
  });

  it("lot lecteur 4 : « Grand texte » une fois sur un appareil ancien, puis le choix de l'élève est gardé", () => {
    const st = mem();
    st.setItem(
      'awzid.mushaf.v1',
      JSON.stringify({ vue: 'page', size: 0, style: 'exact', zoom: 1.05 }),
    );
    const a = readPrefs(st);
    expect(a).toMatchObject({ vue: 'versets', size: 1, affichage: 4, zoom: 1 });
    // l'élève choisit la page exacte (Réglages › Avancé) : gardée ensuite
    writePrefs({ ...a, vue: 'page', size: 0 }, st);
    expect(readPrefs(st)).toMatchObject({ vue: 'page', size: 0 });
    writePrefs({ ...a, zoom: 1.8 }, st);
    expect(readPrefs(st).zoom).toBe(1.8);
  });
});
