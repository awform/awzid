/**
 * Liste blanche « zéro muet » (décisions du référent du 25/10/2026) :
 *  - aucun VERSET ENTIER du Coran (comparaison au texte Tanzil, Basmala de tête retirée), même court (1 à 3 mots) : ils
 *    sont récités par Ayyūb, jamais lus par la synthèse ;
 *  - aucune lettre détachée ;
 *  - le relâchement côté vidéo (`autorise`) ne concerne que les textes que le serveur autorise.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { audioFileId, audioKey, skeleton } from '../src/audio-cle.js';
import { autorise, autoriseSha } from '../src/garde-coran.js';
import { loadTanzil } from '../src/index.js';
import { buildVideo, lettresDetachees } from '../src/video.js';
import { CONTENT_DIR } from './helpers.js';

interface Entree {
  cle: string;
  raison: string;
}
const data = JSON.parse(
  readFileSync(new URL('../data/zero-muet/garde-autorises.json', import.meta.url), 'utf8'),
) as { textes: Entree[] };

/**
 * Exceptions approuvées par le référent (commits 1ede102 du 26/10 et d055e72) : les deux NOMS divins du verset 1:3,
 * autorisés en synthèse comme noms (vocabulaire), jamais comme récitation du verset. Tout autre texte coranique reste
 * refusé.
 */
const NOMS_DIVINS_APPROUVES = ['1:3'];

const TSV = join(CONTENT_DIR, 'coran', 'tanzil-uthmani.tsv');
const tanzil = existsSync(TSV) ? loadTanzil(readFileSync(TSV, 'utf8')) : null;

describe('liste blanche zéro muet : jamais un verset entier, jamais une lettre détachée', () => {
  it.skipIf(!tanzil)('aucun verset entier de Tanzil (ni deux versets courts de suite)', () => {
    const basmala = skeleton(tanzil!.get('1:1')!);
    const sans = (v: string) => {
      const x = skeleton(v);
      return x.startsWith(`${basmala} `) ? x.slice(basmala.length + 1) : x;
    };
    const cles = [...tanzil!.keys()].sort((a, b) => {
      const [x, y] = a.split(':').map(Number) as [number, number];
      const [u, v] = b.split(':').map(Number) as [number, number];
      return x - u || y - v;
    });
    const versets = new Map<string, string>();
    cles.forEach((k, i) => {
      const a = sans(tanzil!.get(k)!);
      versets.set(a, k);
      const suivant = cles[i + 1];
      if (suivant) {
        const deux = `${a} ${sans(tanzil!.get(suivant)!)}`;
        if (deux.split(' ').length < 4) versets.set(deux, `${k}+${suivant}`);
      }
    });
    const trouves = data.textes
      .filter((t) => versets.has(skeleton(audioKey(t.cle))))
      .map((t) => `${versets.get(skeleton(audioKey(t.cle)))} : ${t.cle}`)
      // exceptions décidées par le référent : les deux NOMS divins, lus comme noms et non comme récitation du verset
      .filter((x) => !NOMS_DIVINS_APPROUVES.some((v) => x.startsWith(`${v} : `)));
    expect(trouves, 'versets entiers dans la liste blanche (à retirer : Ayyūb)').toEqual([]);
  });

  it('aucune lettre détachée, aucune raison vide', () => {
    for (const t of data.textes) {
      expect(lettresDetachees(t.cle), `lettres détachées : ${t.cle}`).toBe(false);
      expect(t.raison.length, t.cle).toBeGreaterThan(10);
    }
  });

  it('autoriseSha suit la liste : un texte de la liste, pas un autre', () => {
    const t = data.textes[0]!.cle;
    expect(autorise(t)).toBe(true);
    expect(autoriseSha(audioFileId(t)!)).toBe(true);
    expect(autoriseSha(audioFileId('قَلَمٌ جَدِيدٌ')!)).toBe(false);
  });
});

describe('vidéo : la graphie du Muṣḥaf ne cède que pour un texte autorisé par le serveur', () => {
  const lecon = { type: 'lecon', lecture: { phrases: [{ ar: 'ٱلْحَمْدُ' }] } };
  const garde = (opts: { autorises?: readonly string[] }) =>
    buildVideo(lecon, { unitId: 't', hasAudio: () => true, ...opts });

  it('sans autorisation : texte gardé sans voix (coran)', () => {
    const v = garde({});
    expect(v.signalements.map((s) => s.raison)).toContain('coran');
  });

  it('avec l’autorisation du serveur : plus de garde sur ce texte', () => {
    const v = garde({ autorises: [audioFileId('ٱلْحَمْدُ')!] });
    expect(v.signalements.filter((s) => s.raison === 'coran')).toEqual([]);
  });

  it('une lettre détachée reste gardée même si le serveur la listait', () => {
    const lettre = { type: 'lecon', lecture: { phrases: [{ ar: 'ٱ' }] } };
    const v = buildVideo(lettre, {
      unitId: 't',
      hasAudio: () => true,
      autorises: [audioFileId('ٱ')!],
    });
    expect(v.signalements.map((s) => s.raison)).toContain('coran');
    expect(lettresDetachees('ن')).toBe(true);
    expect(lettresDetachees('ص ق')).toBe(true);
    expect(lettresDetachees('ٱلْحَمْدُ')).toBe(false);
  });

  it('une autre ligne de la même leçon, non autorisée, reste gardée', () => {
    const deux = {
      type: 'lecon',
      lecture: { phrases: [{ ar: 'ٱلْحَمْدُ' }, { ar: 'ذَٰلِكَ ٱلْكِتَٰبُ' }] },
    };
    const v = buildVideo(deux, {
      unitId: 't',
      hasAudio: () => true,
      autorises: [audioFileId('ٱلْحَمْدُ')!],
    });
    expect(v.signalements.map((s) => s.texte)).toEqual(['ذَٰلِكَ ٱلْكِتَٰبُ']);
  });
});
