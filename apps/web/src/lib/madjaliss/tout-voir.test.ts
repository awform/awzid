import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { SEANCES_SENSIBLES, SORTIE, SORTIE_PROTEGEE } from '../../../scripts/madjaliss.mjs';
import { kvGet } from '$lib/idb';
import {
  chargerMatn,
  chargerNotes,
  chargerTout,
  cleTout,
  matnPour,
  oublierTout,
  seancesPour,
  toutVoir,
  voitDiffere,
  type Matn,
  type PartieDifferee,
  type Seance,
} from './donnees';

/**
 * Mode « tout voir » du client (2/11/2026) : sur le compte administrateur (second facteur validé), tout le contenu est
 * visible ; ce contenu reste invisible pour tous les autres comptes. Ces tests lisent les vrais fichiers construits.
 */
const lire = <T>(dir: string, f: string) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as T;
const risala = lire<Matn>(SORTIE, 'risala.json');
const toutFichier = lire<PartieDifferee>(SORTIE_PROTEGEE, 'risala-tout.json');
const reponse = (corps: unknown, status = 200) => new Response(JSON.stringify(corps), { status });
const SENSIBLE = /jih[aā]d|pays ennemi|butin|captifs/i;
const NUMEROS = [134, 135, 136, 257];

/** Texte minimal : une séance par cas (ouverte, différée, pudeur, adulte, tout cela) avec une phrase « adulte » à part. */
const synth = (): Matn => ({
  v: 2,
  id: 'synth',
  version: 'x',
  statut: 'EN_ATTENTE_SECONDE_LECTURE',
  oeuvre: 'x',
  phrases: ['a', 'b', 'c', 'd', 'e']
    .map((id) => ({ id, t: 'texte' as const, ar: id, fr: id }))
    .map((p) => (p.id === 'b' ? { ...p, adulte: true as const } : p)),
  seances: [
    { n: 1, id: 'S1', titre: 'ouverte', duree: 5, phrases: ['a', 'b'], mots: [] },
    { n: 2, id: 'S2', titre: 'différée', duree: 5, phrases: ['c'], mots: [], differe: true },
    { n: 3, id: 'S3', titre: 'pudeur', duree: 5, phrases: ['d'], mots: [], pudeur: true },
    { n: 4, id: 'S4', titre: 'adulte', duree: 5, phrases: ['e'], mots: [], adulte: true },
  ] as Seance[],
});

describe('matnPour : mode « tout voir »', () => {
  it('sans ce mode, rien ne change : enfant, ado, adulte, profil inconnu, avec ou sans le différé', () => {
    const m = synth();
    const ns = (k: Parameters<typeof matnPour>[1], d: boolean, tout?: boolean) =>
      (tout === undefined ? matnPour(m, k, d) : matnPour(m, k, d, tout)).seances.map((s) => s.n);
    for (const k of ['enfant', 'ado', 'adulte', null] as const)
      for (const d of [false, true]) expect(ns(k, d, false), `${k} ${d}`).toEqual(ns(k, d));
    expect(ns('enfant', false)).toEqual([1]);
    expect(ns('ado', false)).toEqual([1, 3]);
    expect(ns(null, false)).toEqual([1, 3]);
    expect(ns('adulte', false)).toEqual([1, 3, 4]);
    expect(ns('adulte', true)).toEqual([1, 2, 3, 4]);
    // la phrase « adulte » reste masquée à l'ado dans la séance ouverte
    expect(matnPour(m, 'ado', true).seances[0]!.phrases).toEqual(['a']);
  });

  it('avec le mode : profil traité comme adulte, différé montré, pudeur levée — même pour un enfant ou sans profil', () => {
    const m = synth();
    for (const k of ['enfant', 'ado', 'adulte', null] as const) {
      const v = matnPour(m, k, false, true);
      expect(
        v.seances.map((s) => s.n),
        String(k),
      ).toEqual([1, 2, 3, 4]);
      expect(v.seances[0]!.phrases).toEqual(['a', 'b']);
      expect(v.phrases.map((p) => p.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
    }
    expect(seancesPour(m, null, false, true)).toHaveLength(4);
    expect(seancesPour(m, null, false, false)).toHaveLength(2);
  });

  it('sur les vrais textes : le mode montre tout ce que montre un adulte avec le différé, jamais moins', () => {
    for (const f of readdirSync(SORTIE).filter((x) => /^[a-z-]+\.json$/.test(x))) {
      const m = lire<Matn>(SORTIE, f);
      if (!Array.isArray(m.seances)) continue;
      const tout = matnPour(m, null, false, true);
      const adulteDiffere = matnPour(m, 'adulte', true);
      expect(
        tout.seances.map((s) => s.n),
        f,
      ).toEqual(adulteDiffere.seances.map((s) => s.n));
      expect(tout.phrases.length, f).toBe(adulteDiffere.phrases.length);
      expect(tout.seances.length, f).toBeGreaterThanOrEqual(
        matnPour(m, 'ado', false).seances.length,
      );
    }
  });

  it('toutVoir() lit le drapeau de /auth/me, rien d’autre ; il ouvre le différé côté interface', () => {
    expect(toutVoir({ toutVoir: true })).toBe(true);
    for (const me of [
      null,
      undefined,
      {},
      { toutVoir: false },
      { toutVoir: 1 as unknown as boolean },
    ])
      expect(toutVoir(me)).toBe(false);
    const compte = { account: { email: 'x@exemple.org' } };
    expect(voitDiffere({ ...compte, toutVoir: true }, false)).toBe(true);
    expect(voitDiffere({ ...compte, toutVoir: false }, false)).toBe(false);
    expect(voitDiffere(compte, false)).toBe(false);
  });
});

describe('Risāla : séances sensibles (chapitre du jihād)', () => {
  it('le sommaire PUBLIC `risala.json` ne contient aucun titre, séance, phrase ni mot du chapitre du jihād', () => {
    const brut = readFileSync(join(SORTIE, 'risala.json'), 'utf8');
    expect(brut).not.toMatch(SENSIBLE);
    expect(risala.seances.map((s) => s.n)).not.toEqual(expect.arrayContaining(NUMEROS));
    for (const n of NUMEROS)
      expect(
        risala.seances.some((s) => s.n === n),
        `n°${n}`,
      ).toBe(false);
    for (const id of SEANCES_SENSIBLES.risala!) expect(brut, id).not.toContain(id);
    for (const s of risala.seances) expect(s.titre, s.id).not.toMatch(SENSIBLE);
    expect(risala.seances).toHaveLength(261);
    expect(risala.tout).toEqual({ version: toutFichier.version });
  });

  it('aucun fichier PUBLIC de static/mutun n’a un titre de séance du jihād ; aucun fichier gardé hors « tout » non plus', () => {
    for (const f of readdirSync(SORTIE).filter((x) => x.endsWith('.json'))) {
      const m = lire<{ seances?: Seance[] }>(SORTIE, f);
      for (const s of m.seances ?? []) expect(s.titre, `${f} ${s.id}`).not.toMatch(SENSIBLE);
    }
    // phrases des séances sensibles : ni dans les parties publiques, ni dans les parties gardées ordinaires, ni dans les
    // notes de l'enseignant (personnel) — seulement dans le fichier « tout voir »
    const ids = toutFichier.phrases.map((p) => p.id);
    expect(ids).toHaveLength(25);
    for (const f of readdirSync(SORTIE_PROTEGEE).filter(
      (x) => /^risala-/.test(x) && x !== 'risala-tout.json',
    )) {
      const m = lire<{ seances?: Seance[]; phrases: Array<{ id: string }> }>(SORTIE_PROTEGEE, f);
      for (const p of m.phrases) expect(ids, `${f} ${p.id}`).not.toContain(p.id);
      for (const s of m.seances ?? []) expect(NUMEROS, `${f} ${s.id}`).not.toContain(s.n);
    }
    for (const f of readdirSync(SORTIE).filter((x) => /^risala-o\d+\.json$/.test(x)))
      for (const p of lire<{ phrases: Array<{ id: string }> }>(SORTIE, f).phrases)
        expect(ids, `${f} ${p.id}`).not.toContain(p.id);
    const ens = lire<{
      differe: number[];
      comite: Array<{ n: number }>;
      mots: Array<{ n: number }>;
      phrases: Array<{ id: string }>;
    }>(SORTIE_PROTEGEE, 'risala-enseignant.json');
    for (const n of NUMEROS) {
      expect(ens.differe).not.toContain(n);
      expect(ens.comite.map((c) => c.n)).not.toContain(n);
    }
    expect(ens.phrases.map((p) => p.id).filter((id) => ids.includes(id))).toEqual([]);
  });

  it('le fichier « tout voir » porte les 4 séances avec leurs titres, leurs phrases et leurs notes', () => {
    expect(toutFichier.seances.map((s) => s.n)).toEqual(NUMEROS);
    expect(toutFichier.seances.filter((s) => /^Le jihād/.test(s.titre))).toHaveLength(3);
    expect(toutFichier.seances.every((s) => s.differe === true && s.adulte === true)).toBe(true);
    const ids = new Set(toutFichier.phrases.map((p) => p.id));
    for (const s of toutFichier.seances)
      for (const id of s.phrases) expect(ids.has(id), id).toBe(true);
    expect(toutFichier.notes?.differe).toEqual(NUMEROS);
  });

  it('chargerMatn : un compte avec le différé mais sans le mode ne demande JAMAIS le fichier et ne voit pas le jihād', async () => {
    const demandes: string[] = [];
    const serveur = async (u: string) => {
      demandes.push(u);
      if (u === '/mutun/risala.json') return reponse(risala);
      if (u === '/mutun/risala-tout.json') return reponse(toutFichier);
      return reponse({}, 404);
    };
    const m = (await chargerMatn('risala', serveur, true, false))!;
    expect(demandes).not.toContain('/mutun/risala-tout.json');
    expect(m.seances.map((s) => s.n)).not.toEqual(expect.arrayContaining(NUMEROS));
    expect(matnPour(m, 'adulte', true).seances.some((s) => SENSIBLE.test(s.titre))).toBe(false);
  });

  it('chargerMatn : avec le mode, les 4 séances sont fusionnées à leur place ; copie gardée, effacée sans le mode', async () => {
    const serveur = async (u: string) =>
      u === '/mutun/risala-tout.json' ? reponse(toutFichier) : reponse(risala);
    const m = (await chargerMatn('risala', serveur, true, true))!;
    expect(m.seances).toHaveLength(265);
    expect(m.seances.map((s) => s.n)).toEqual(Array.from({ length: 265 }, (_, i) => i + 1));
    const vue = matnPour(m, null, false, true);
    expect(vue.seances.filter((s) => /jihād/.test(s.titre))).toHaveLength(3);
    expect(vue.phrases.length).toBe(toutFichier.phrases.length);
    expect(((await kvGet(cleTout('risala'))) as PartieDifferee).version).toBe(toutFichier.version);
    await oublierTout();
    expect(await kvGet(cleTout('risala'))).toBeUndefined();
  });

  it('droit refusé (403) : le texte public seul, et la copie périmée de l’appareil n’est pas rendue', async () => {
    const ancien = { ...toutFichier, version: 'ancienne' };
    const cache = { ...risala, tout: { version: 'nouvelle' } };
    // copie gardée d'un droit passé
    const { kvSet } = await import('$lib/idb');
    await kvSet(cleTout('risala'), ancien);
    for (const status of [401, 403]) {
      const m = await chargerTout(cache, async () => reponse({ error: {} }, status));
      expect(m.seances.map((s) => s.n)).not.toEqual(expect.arrayContaining(NUMEROS));
    }
    await oublierTout();
  });

  it('notes de l’enseignant : le mode ajoute celles des séances sensibles, sans lui rien', async () => {
    const ens = lire<ReturnType<typeof JSON.parse>>(SORTIE_PROTEGEE, 'risala-enseignant.json');
    const serveur = async (u: string) =>
      u.endsWith('-tout.json') ? reponse(toutFichier) : reponse(ens);
    const sans = (await chargerNotes('risala', serveur))!;
    const avec = (await chargerNotes('risala', serveur, true))!;
    expect(sans.differe).toHaveLength(189);
    expect(avec.differe).toHaveLength(193);
    expect(avec.phrases.length - sans.phrases.length).toBe(toutFichier.notes!.phrases!.length);
  });
});
