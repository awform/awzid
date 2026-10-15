import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import {
  AUDIO_MANIFESTE,
  audioDe as audioConstruction,
  indexAudio,
  manifesteAudio,
  SORTIE,
  SORTIE_PROTEGEE,
  texteLu,
} from '../../../scripts/madjaliss.mjs';
import { audioDe } from './audio';
import { texteVoixSynthese, type Phrase } from './donnees';
import { deciderAudio, type CompteMutun } from '../server/mutun-acces';

/**
 * Lot 9 : audio de synthèse des Madjaliss. Règle (décision du client des 13 et 14/10/2026) : voix de synthèse autorisée
 * pour les textes de fiqh des cycles 1 et 2, JAMAIS pour le Coran. Un audio n'est servi que pour le texte tel qu'il a été
 * généré (SHA-1), jamais pour une phrase masquée au profil (adulte pour enfant/ado, différée, masquée, incertaine).
 */
type Manifeste = { v: number; fichiers: Record<string, { o: number; e: string; d: string }> };
const ix = indexAudio();
const sha1 = (s: string) => createHash('sha1').update(s, 'utf8').digest('hex');
const lire = <T>(p: string) => JSON.parse(readFileSync(p, 'utf8')) as T;

/** Toutes les phrases servies (fichiers publics et gardés), avec leur fichier. */
const servies: Array<{ f: string; pub: boolean; p: Phrase }> = [
  ...readdirSync(SORTIE)
    .filter((f) => f.endsWith('.json'))
    .flatMap((f) =>
      (lire<{ phrases?: Phrase[] }>(join(SORTIE, f)).phrases ?? []).map((p) => ({
        f,
        pub: true,
        p,
      })),
    ),
  ...readdirSync(SORTIE_PROTEGEE)
    .filter((f) => f.endsWith('.json') && !f.includes('enseignant'))
    .flatMap((f) =>
      (lire<{ phrases?: Phrase[] }>(join(SORTIE_PROTEGEE, f)).phrases ?? []).map((p) => ({
        f,
        pub: false,
        p,
      })),
    ),
];
const avec = servies.filter((x) => x.p.audio);
const manifeste = lire<Manifeste>(AUDIO_MANIFESTE);

describe('audio des Madjaliss : construction', () => {
  it('1 483 phrases générées (1 328 le 14/10 + 155 de la Risāla le 15/10), toutes servies avec leur audio', () => {
    const n = Object.values(ix.textes).reduce((s, x) => s + Object.keys(x).length, 0);
    expect(n).toBe(1483);
    expect(Object.keys(ix.textes['risala']!)).toHaveLength(418);
    expect(avec.length).toBe(1483);
    expect(Object.keys(manifeste.fichiers).length).toBe(1483);
  });

  it('lot 10 : RIS-0014, 0032, 0098 (texte changé le 15/10) : audio du texte ACTUEL ; l’ancien texte n’aurait pas de bouton', () => {
    const de = new Map(servies.map((x) => [x.p.id, x.p]));
    for (const id of ['RIS-0014', 'RIS-0032', 'RIS-0098']) {
      const p = de.get(id)!;
      expect(p.audio, id).toBe(`risala/${id}.mp3`);
      expect(sha1(texteLu(p)!), id).toBe(ix.textes['risala']![id]!.t);
      // un index fait sur un autre texte (génération périmée) : pas de champ, donc pas de bouton
      const perime = {
        textes: { risala: { [id]: { ...ix.textes['risala']![id]!, t: sha1('ancien texte') } } },
      };
      expect(audioConstruction('risala', { ...p, audio: undefined }, perime), id).toBeNull();
    }
    // citations du Coran ouvertes le 15/10 (RIS-0183 = 2:201 depuis Tanzil, RIS-0392 = 24:59) : jamais d'audio
    for (const id of ['RIS-0183', 'RIS-0392']) expect(de.get(id)!.audio, id).toBeUndefined();
  });

  it('chaque audio : SHA-1 du texte SERVI = celui de la génération ; chemin = <texte>/<id>.mp3', () => {
    for (const { p } of avec) {
      const texte = p.audio!.split('/')[0]!;
      expect(p.audio, p.id).toBe(`${texte}/${p.id}.mp3`);
      expect(sha1(texteLu(p)!), p.id).toBe(ix.textes[texte]![p.id]!.t);
    }
  });

  it('texte changé depuis la génération : audio périmé, pas de champ (donc pas de bouton)', () => {
    const { p } = avec.find((x) => typeof x.p.ar === 'string')!;
    const texte = p.audio!.split('/')[0]!;
    expect(audioConstruction(texte, { ...p, audio: undefined }, ix)).toBe(p.audio);
    expect(audioConstruction(texte, { ...p, ar: `${p.ar as string} ` }, ix)).toBeNull();
    // et jamais pour une phrase sans fichier
    expect(audioConstruction(texte, { ...p, id: 'AKH-9999' }, ix)).toBeNull();
  });

  it('JAMAIS le Coran : aucune phrase avec audio ne cite le Coran (segments Tanzil, versets d’un hadith, ﴿﴾)', () => {
    for (const { p } of avec) {
      expect(texteVoixSynthese(p), p.id).not.toBeNull();
      expect(p.t, p.id).not.toBe('citation_coran');
      expect(p.q, p.id).toBeUndefined();
      expect(typeof p.ar === 'string' || Array.isArray(p.h), p.id).toBe(true);
      expect(texteLu(p), p.id).not.toMatch(/[﴾﴿]/);
    }
    // phrases citant le Coran dans les données ou refusées par la garde V3 : sans audio
    const de = new Map(servies.map((x) => [x.p.id, x.p]));
    for (const id of ['AKH-0001', 'AKH-0015', 'AKH-0132', 'IZZ-0001', 'IZZ-0198', 'RIS-0151'])
      expect(de.get(id)?.audio, id).toBeUndefined();
  });

  it('jamais pour une phrase masquée, non confirmée, réservée ou incertaine', () => {
    for (const { p } of avec) {
      expect(p.masque || p.nc || p.explication || p.incertain, p.id).toBeFalsy();
    }
  });

  it('manifeste à jour : « public » pour les fichiers publics, « differe » pour les fichiers gardés', () => {
    const entrees = avec.map((x) => ({ chemin: x.p.audio!, droit: x.pub ? 'public' : 'differe' }));
    expect(manifesteAudio(entrees, ix)).toEqual(manifeste);
    for (const [chemin, f] of Object.entries(manifeste.fichiers)) {
      const [texte, nom] = chemin.split('/');
      const e = ix.textes[texte!]![nom!.replace(/\.mp3$/, '')]!;
      expect(f.o).toBe(e.o);
      expect(f.e).toBe(e.s.slice(0, 32));
    }
  });

  it('les MP3 ne sont jamais dans static/ (servis seulement par la route gardée)', () => {
    const statique = fileURLToPath(new URL('../../../static', import.meta.url));
    expect(existsSync(join(statique, 'mutun', 'audio'))).toBe(false);
    const walk = (d: string): string[] =>
      readdirSync(d, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(d, e.name)) : [e.name],
      );
    expect(walk(join(statique, 'mutun')).filter((f) => f.endsWith('.mp3'))).toEqual([]);
  });
});

describe('audio des Madjaliss : bouton selon le profil', () => {
  const adultes = avec.filter((x) => x.p.adulte).map((x) => x.p);
  const simple = avec.find((x) => !x.p.adulte)!.p;

  it('phrase « adulte » : jamais pour un enfant, un ado ni un profil inconnu ; oui pour un adulte', () => {
    expect(adultes.map((p) => p.id).sort()).toEqual(['IZZ-0082', 'IZZ-0394', 'IZZ-0395']);
    for (const p of adultes) {
      expect(audioDe(p, 'enfant'), p.id).toBeNull();
      expect(audioDe(p, 'ado'), p.id).toBeNull();
      expect(audioDe(p, null), p.id).toBeNull();
      expect(audioDe(p, 'adulte'), p.id).toBe(p.audio);
    }
  });

  it('phrase ordinaire : bouton pour tous les profils ; jamais si incertaine, masquée, non confirmée ou citant le Coran', () => {
    for (const k of ['enfant', 'ado', 'adulte', null] as const)
      expect(audioDe(simple, k)).toBe(simple.audio);
    expect(audioDe({ ...simple, incertain: true }, 'adulte')).toBeNull();
    expect(audioDe({ ...simple, masque: true }, 'adulte')).toBeNull();
    expect(audioDe({ ...simple, nc: true }, 'adulte')).toBeNull();
    expect(audioDe({ ...simple, explication: true }, 'adulte')).toBeNull();
    expect(audioDe({ ...simple, q: [{ q: 'x', ref: '1:1' }] }, 'adulte')).toBeNull();
    expect(audioDe({ ...simple, t: 'citation_coran' }, 'adulte')).toBeNull();
    expect(audioDe({ ...simple, audio: undefined }, 'adulte')).toBeNull();
  });
});

describe('audio des Madjaliss : droit de la route /mutun/audio', () => {
  const invite: CompteMutun = { account: { kind: 'parent', email: 'famille@exemple.org' } };
  const demo: CompteMutun = { account: { kind: 'adulte', email: 'adulte-x7k@demo.awform.test' } };
  const enseignant: CompteMutun = { account: { kind: 'enseignant', email: 'prof@ecole.sn' } };

  it('sans session : 401 ; session à moitié ouverte : 401', () => {
    expect(deciderAudio('public', null)).toBe(401);
    expect(deciderAudio('public', {})).toBe(401);
    expect(deciderAudio('public', { ...enseignant, mfaRequired: true, mfaVerified: false })).toBe(
      401,
    );
  });

  it('« public » : toute session ; « differe » : personnel, démonstration, groupe bêta avec l’interrupteur', () => {
    expect(deciderAudio('public', invite)).toBe(200);
    expect(deciderAudio('differe', invite)).toBe(403);
    expect(deciderAudio('differe', demo)).toBe(200);
    expect(deciderAudio('differe', enseignant)).toBe(200);
    expect(deciderAudio('differe', { ...invite, roles: ['beta_fermee'], betaDiffere: true })).toBe(
      200,
    );
    expect(deciderAudio('differe', { ...invite, roles: ['beta_fermee'], betaDiffere: false })).toBe(
      403,
    );
    expect(deciderAudio('autre', enseignant)).toBe(403);
  });
});

describe('règle de la voix de synthèse (commentaires et consignes à jour)', () => {
  const dir = fileURLToPath(new URL('.', import.meta.url));
  it('Memoriser et la garde disent la règle : autorisée pour le fiqh des cycles 1-2, jamais pour le Coran', () => {
    for (const f of ['Memoriser.svelte', 'donnees.ts', 'audio.ts']) {
      const s = readFileSync(join(dir, f), 'utf8');
      expect(s, f).not.toMatch(/jamais de voix de synth[èe]se\)?\s*\*\//);
      expect(s, f).toMatch(/jamais pour le Coran|JAMAIS pour le Coran/);
    }
  });
});
