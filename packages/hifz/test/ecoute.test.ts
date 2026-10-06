import { describe, expect, it } from 'vitest';
import {
  cleMot,
  comparer,
  motsARevoir,
  motsAttendus,
  ressemblance,
  type MotEntendu,
  type VersetTexte,
} from '../src/ecoute.js';
import { HAS_TANZIL, loadTanzil } from './helpers.js';

/**
 * A5 — comparaison mot à mot. Phrases ORDINAIRES (aucun texte religieux retapé) pour la logique ; le vrai
 * texte Tanzil n'est lu que depuis le fichier des livres (tests sautés sans lui).
 */
const V: VersetTexte[] = [
  { s: 200, a: 1, text: 'ذَهَبَ الوَلَدُ إِلَى المَدْرَسَةِ صَبَاحًا ۚ مَعَ أَخِيهِ' },
  { s: 200, a: 2, text: 'وَقَرَأَ الدَّرْسَ مَعَ أَصْدِقَائِهِ فِي الفَصْلِ' },
  { s: 200, a: 3, text: 'ثُمَّ رَجَعَ إِلَى البَيْتِ مَسْرُورًا' },
];
const ATT = motsAttendus(V);

/** « entendu » : le texte sans voyelles (comme une transcription), 0,5 s par mot, confiance 0,95 */
function entendu(
  mots: string[],
  conf = 0.95,
): { ent: MotEntendu[]; voix: Array<[number, number]> } {
  const ent = mots.map((w, n) => ({ w, conf, t0: n * 0.5, t1: n * 0.5 + 0.4 }));
  return { ent, voix: ent.map((e) => [e.t0, e.t1] as [number, number]) };
}
const nus = () => ATT.map((m) => m.cle);

describe('A5 : mots attendus', () => {
  it('ignore les signes d’arrêt isolés, garde le rang exact du mot pour l’affichage', () => {
    expect(ATT.length).toBe(7 + 6 + 5);
    const m = ATT.find((x) => x.a === 1 && x.cle === cleMot('مَعَ'))!;
    expect(m.k).toBe(6); // « ۚ » est le 6e jeton (rang 5), non attendu
    expect(V[0]!.text.split(' ')[m.k]).toBe(m.texte);
  });
  it('normalise voyelles, hamza et alifs pour COMPARER seulement', () => {
    expect(cleMot('إِلَى')).toBe(cleMot('الي'));
    expect(ressemblance(cleMot('أَصْدِقَائِهِ'), cleMot('اصدقائه'))).toBe(1);
    expect(ressemblance(cleMot('الصلوة'), cleMot('الصلاة'))).toBeGreaterThanOrEqual(0.7);
    expect(ressemblance(cleMot('البيت'), cleMot('الفصل'))).toBeLessThan(0.45);
  });
});

describe('A5 : écarts sur cas simulés', () => {
  it('récitation juste : aucun écart, tout est reconnu', () => {
    const { ent, voix } = entendu(nus());
    const r = comparer(ATT, ent, { voix });
    expect(r.statut).toBe('resultat');
    expect(r.ecarts).toEqual([]);
    expect(r.couverture).toBe(1);
    expect(r.mots.every((x) => x === 'ok')).toBe(true);
  });

  it('mot oublié (silence à sa place) : signalé à sa position', () => {
    // le mot n'a pas été dit : silence à sa place (zones de voix = les autres mots seulement)
    const { ent: tous } = entendu(nus());
    const ent = tous.filter((_, n) => n !== 8);
    const voix = ent.map((e) => [e.t0!, e.t1!] as [number, number]);
    const r = comparer(ATT, ent, { voix });
    expect(r.ecarts).toHaveLength(1);
    expect(r.ecarts[0]).toMatchObject({ type: 'oublie', i: 8, fin: 8, s: 200, a: 2 });
    expect(r.mots[8]).toBe('oublie');
    expect(motsARevoir(r)).toBe(1);
  });

  it('mot absent mais de la VOIX à sa place : doute, rien n’est signalé', () => {
    const ent = entendu(nus()).ent.filter((_, n) => n !== 8);
    const voix: Array<[number, number]> = [[0, 20]]; // voix continue : le mot a peut-être été dit
    const r = comparer(ATT, ent, { voix });
    expect(r.ecarts).toEqual([]);
    expect(r.doutes).toBe(1);
    expect(r.mots[8]).toBe('doute');
  });

  it('mot remplacé (machine sûre d’elle) : signalé ; machine hésitante : doute', () => {
    const w = nus();
    w[3] = 'السوق';
    const sur = comparer(ATT, entendu(w).ent, { voix: entendu(w).voix });
    expect(sur.ecarts).toEqual([expect.objectContaining({ type: 'remplace', i: 3 })]);
    const ent = entendu(w).ent.map((e, n) => (n === 3 ? { ...e, conf: 0.4 } : e));
    const hesitant = comparer(ATT, ent, { voix: entendu(w).voix });
    expect(hesitant.ecarts).toEqual([]);
    expect(hesitant.doutes).toBe(1);
  });

  it('mot ajouté : signalé après le bon mot ; répétition et isti‘ādha : jamais', () => {
    const w = nus();
    w.splice(10, 0, 'السيارة');
    const r = comparer(ATT, entendu(w).ent, { voix: entendu(w).voix });
    expect(r.ecarts).toEqual([expect.objectContaining({ type: 'ajoute', i: 9 })]);
    // l'élève reprend deux mots (se corrige) : normal
    const rep = nus();
    rep.splice(10, 0, rep[8]!, rep[9]!);
    expect(comparer(ATT, entendu(rep).ent, { voix: entendu(rep).voix }).ecarts).toEqual([]);
    // formule d'ouverture avant de commencer
    const ist = ['أعوذ', 'بالله', 'من', 'الشيطان', 'الرجيم', ...nus()];
    expect(comparer(ATT, entendu(ist).ent, { voix: entendu(ist).voix }).ecarts).toEqual([]);
  });

  it('deux mots inversés : « ordre »', () => {
    const w = nus();
    [w[7], w[8]] = [w[8]!, w[7]!];
    const r = comparer(ATT, entendu(w).ent, { voix: entendu(w).voix });
    expect(r.ecarts.length).toBeGreaterThanOrEqual(1);
    expect(r.ecarts.every((e) => e.type === 'ordre' && e.i >= 7 && e.fin <= 8)).toBe(true);
  });

  it('verset sauté : un seul écart « verset sauté »', () => {
    const w = nus().filter((_, n) => ATT[n]!.a !== 2);
    const r = comparer(ATT, entendu(w).ent, { voix: entendu(w).voix });
    expect(r.ecarts).toEqual([expect.objectContaining({ type: 'verset_saute', s: 200, a: 2 })]);
    expect(motsARevoir(r)).toBe(6);
  });

  it('arrêt avant la fin : la suite est « non récitée », jamais une erreur', () => {
    const w = nus().slice(0, 9);
    const r = comparer(ATT, entendu(w).ent, { voix: entendu(w).voix });
    expect(r.ecarts).toEqual([]);
    expect(r.finRecitee).toBe(8);
    expect(r.mots.slice(9).every((x) => x === 'non_recite')).toBe(true);
  });

  it('autre texte ou bruit : « pas compris », aucun écart', () => {
    const w = ['كتب', 'الطالب', 'رسالة', 'طويلة', 'الى', 'جده', 'في', 'القرية', 'البعيدة'];
    const r = comparer(ATT, entendu(w).ent, { voix: entendu(w).voix });
    expect(r.statut).toBe('pas_compris');
    expect(r.ecarts).toEqual([]);
    expect(comparer(ATT, [], {}).statut).toBe('pas_compris');
  });

  it('confiance basse partout : « pas compris »', () => {
    const r = comparer(ATT, entendu(nus(), 0.3).ent, {});
    expect(r.statut).toBe('pas_compris');
  });
});

describe.skipIf(!HAS_TANZIL)('A5 : vrai texte Tanzil (lu, jamais retapé)', () => {
  const T = loadTanzil();
  const bism = T.get('1:1')!;
  it('basmala facultative et lettres isolées prononcées en noms de lettres', () => {
    const vs = [1, 2, 3].map((a) => ({ s: 2, a, text: T.get(`2:${a}`)! }));
    const att = motsAttendus(vs, bism);
    expect(att.slice(0, 4).every((m) => m.facultatif)).toBe(true);
    expect(att[4]!.lettres).toBe(true);
    // sans basmala, lettres dites « alif lām mīm », texte sans voyelles
    const w = ['الف', 'لام', 'ميم', ...att.slice(5).map((m) => m.cle)];
    const ent = w.map((x, n) => ({ w: x, conf: 0.95, t0: n * 0.5, t1: n * 0.5 + 0.4 }));
    const r = comparer(att, ent, { voix: ent.map((e) => [e.t0, e.t1] as [number, number]) });
    expect(r.ecarts).toEqual([]);
    expect(r.statut).toBe('resultat');
  });
  it('graphie ʿuthmānī : toute une sourate courte relue sans voyelles = aucun écart', () => {
    const vs = [1, 2, 3, 4, 5, 6, 7].map((a) => ({ s: 1, a, text: T.get(`1:${a}`)! }));
    const att = motsAttendus(vs, bism);
    const ent = att.map((m, n) => ({ w: m.cle, conf: 0.9, t0: n * 0.5, t1: n * 0.5 + 0.4 }));
    expect(comparer(att, ent, {}).ecarts).toEqual([]);
  });
});
