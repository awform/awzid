import { afterEach, describe, expect, it } from 'vitest';
import { motsAttendus, type MotEntendu, type VersetTexte } from '../src/ecoute.js';
import { REGLAGES_ETAT, etatSuivi, type EntreeSuivi } from '../src/suivi.js';

/**
 * Décision d'un écart entre les deux lectures du même audio (RNN-T et tête CTC) : `accord`, `rnnt`, `veto` (défaut). Phrases
 * ORDINAIRES (aucun texte religieux retapé).
 */
const V: VersetTexte[] = [
  { s: 200, a: 1, text: 'ذَهَبَ الوَلَدُ إِلَى المَدْرَسَةِ صَبَاحًا مَعَ أَخِيهِ' },
  { s: 200, a: 2, text: 'وَقَرَأَ الدَّرْسَ مَعَ أَصْدِقَائِهِ فِي الفَصْلِ' },
  { s: 200, a: 3, text: 'ثُمَّ رَجَعَ إِلَى البَيْتِ مَسْرُورًا' },
];
const ATT = motsAttendus(V);
const TEXTE = V.flatMap((v) => v.text.split(' '));
const ent = (mots: string[]): MotEntendu[] =>
  mots.map((w, k) => ({ w, conf: 0.95, t0: k * 0.6, t1: k * 0.6 + 0.4 }));
const entree = (rnnt: MotEntendu[], ctc: MotEntendu[]): EntreeSuivi => ({
  stables: rnnt,
  stablesCtc: ctc,
  provisoires: [],
  partiel: [],
  voix: rnnt.map((m) => [m.t0!, m.t1!] as [number, number]),
});
const sans7 = TEXTE.filter((_, k) => k !== 7);
const avant = { ...REGLAGES_ETAT };
afterEach(() => Object.assign(REGLAGES_ETAT, avant));

describe('suivi : décision d’un écart entre les deux lectures', () => {
  it('par défaut (veto) : la lecture CTC qui lit « ok » le mot visé empêche le signalement', () => {
    expect(REGLAGES_ETAT.mode).toBe('veto');
    // les deux lectures voient le mot 7 absent : signalé
    const deux = etatSuivi(ATT, entree(ent(sans7), ent(sans7))).resultat.ecarts;
    expect(deux.some((e) => e.i <= 7 && e.fin >= 7)).toBe(true);
    // la tête CTC, elle, le lit : machine hésitante, rien n’est signalé
    const contredit = etatSuivi(ATT, entree(ent(sans7), ent(TEXTE))).resultat.ecarts;
    expect(contredit).toEqual([]);
  });

  it('veto : la lecture CTC qui ne lit rien de précis à cet endroit ne s’y oppose pas', () => {
    // la CTC a lu autre chose (mot différent, pas « ok ») : l’oubli vu par le RNN-T est signalé
    const w = [...sans7];
    w.splice(7, 0, 'الحديقة'); // mot inconnu à la place du mot 7
    const r = etatSuivi(ATT, entree(ent(sans7), ent(w))).resultat.ecarts;
    expect(r.some((e) => e.i <= 7 && e.fin >= 7)).toBe(true);
  });

  it('accord : les deux lectures doivent voir l’écart ; rnnt : la lecture RNN-T suffit', () => {
    REGLAGES_ETAT.mode = 'accord';
    expect(etatSuivi(ATT, entree(ent(sans7), ent(TEXTE))).resultat.ecarts).toEqual([]);
    expect(etatSuivi(ATT, entree(ent(sans7), ent(sans7))).resultat.ecarts.length).toBeGreaterThan(
      0,
    );
    REGLAGES_ETAT.mode = 'rnnt';
    expect(etatSuivi(ATT, entree(ent(sans7), ent(TEXTE))).resultat.ecarts.length).toBeGreaterThan(
      0,
    );
  });

  it('un mot AJOUTÉ exige l’accord des deux lectures, même en veto', () => {
    const plus = [...TEXTE];
    plus.splice(10, 0, 'السيارة');
    // vu par le RNN-T seulement : rien
    expect(etatSuivi(ATT, entree(ent(plus), ent(TEXTE))).resultat.ecarts).toEqual([]);
    // vu par les deux : signalé
    const les2 = etatSuivi(ATT, entree(ent(plus), ent(plus))).resultat.ecarts;
    expect(les2).toEqual([expect.objectContaining({ type: 'ajoute' })]);
  });

  it('récitation juste : aucun écart dans aucun mode', () => {
    for (const mode of ['accord', 'rnnt', 'veto'] as const) {
      REGLAGES_ETAT.mode = mode;
      expect(etatSuivi(ATT, entree(ent(TEXTE), ent(TEXTE))).resultat.ecarts).toEqual([]);
    }
  });
});
