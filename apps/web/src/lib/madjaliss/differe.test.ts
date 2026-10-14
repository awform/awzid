import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { SORTIE, SORTIE_PROTEGEE } from '../../../scripts/madjaliss.mjs';
import { kvGet } from '$lib/idb';
import {
  chargerDifferee,
  chargerMatn,
  chargerPartie,
  cleDiffere,
  fusionnerDifferee,
  matnPour,
  type Matn,
  type PartieDifferee,
  type PartieMatn,
} from './donnees';

/** Lot 5 : complément gardé (séances différées d'Ibn ʿĀshir) — chargement, droit refusé, copie de l'appareil. */
const lire = <T>(dir: string, f: string) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as T;
const pub = lire<Matn>(SORTIE, 'ibn-ashir.json');
const diff = lire<PartieDifferee>(SORTIE_PROTEGEE, 'ibn-ashir-differe.json');
const reponse = (corps: unknown, status = 200) => new Response(JSON.stringify(corps), { status });

describe('complément différé (Ibn ʿĀshir)', () => {
  it('le fichier public annonce le complément sans en contenir une ligne', () => {
    expect(pub.differe).toEqual({ version: diff.version });
    expect(pub.seances.some((s) => s.differe)).toBe(false);
    expect(pub.seances.map((s) => s.n)).not.toContain(2);
    expect(diff.seances.map((s) => s.n)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('personnel / démonstration : le complément est demandé au serveur, fusionné, gardé sous une clé effacée à la déconnexion', async () => {
    const log: string[] = [];
    const f = async (u: string) => {
      log.push(u);
      return reponse(diff);
    };
    const m = await chargerDifferee(pub, f);
    expect(log).toEqual(['/mutun/ibn-ashir-differe.json']);
    expect(m.seances.map((s) => s.n).slice(0, 3)).toEqual([1, 2, 3]);
    expect(m.seances).toHaveLength(58);
    expect(matnPour(m, 'adulte', true).seances).toHaveLength(58);
    expect(matnPour(m, 'adulte', false).seances).toHaveLength(49);
    const cle = cleDiffere('ibn-ashir');
    expect(cle).toMatch(/^madjaliss-differe:/); // PERSONAL_KV (session.ts) l'efface à la déconnexion
    expect(((await kvGet(cle)) as PartieDifferee).version).toBe(diff.version);
    // hors ligne ensuite : la copie de l'appareil (version identique), sans appel réseau
    const log2: string[] = [];
    const m2 = await chargerDifferee(pub, async (u) => {
      log2.push(u);
      throw new TypeError('hors ligne');
    });
    expect(log2).toEqual([]);
    expect(m2.seances).toHaveLength(58);
  });

  it('droit refusé (401, 403) : le texte public seul, et la copie périmée de l’appareil n’est pas rendue', async () => {
    for (const status of [401, 403]) {
      const m = await chargerDifferee({ ...pub, differe: { version: 'autre' } }, async () =>
        reponse({ error: { code: 'droit_insuffisant' } }, status),
      );
      expect(m.seances, String(status)).toHaveLength(49);
    }
    // hors ligne (erreur réseau) : la copie de l'appareil, même ancienne
    const m = await chargerDifferee({ ...pub, differe: { version: 'autre' } }, async () => {
      throw new TypeError('hors ligne');
    });
    expect(m.seances).toHaveLength(58);
  });

  it('texte sans complément : aucun appel réseau (un invité ne télécharge rien)', async () => {
    const log: string[] = [];
    const sans = { ...pub, differe: undefined };
    const m = await chargerDifferee(sans, async (u) => {
      log.push(u);
      return reponse(diff);
    });
    expect(log).toEqual([]);
    expect(m).toBe(sans);
  });

  it('chargerMatn : l’invité ne demande JAMAIS le complément ; le personnel le demande', async () => {
    const appels: string[] = [];
    const serveur = async (u: string) => {
      appels.push(u);
      return u.endsWith('-differe.json') ? reponse(diff) : reponse(pub);
    };
    // copie déjà gardée du texte public (v2) : le réseau est tout de même interrogé en arrière-plan
    const invite = await chargerMatn('ibn-ashir', serveur, false);
    expect(invite?.seances.length).toBe(49);
    expect(appels.some((u) => u.endsWith('-differe.json'))).toBe(false);
    const staff = await chargerMatn('ibn-ashir', serveur, true);
    expect(staff?.seances.length).toBe(58);
  });

  it('fusion : séances dans l’ordre, aucune phrase en double', () => {
    const m = fusionnerDifferee(pub, diff);
    const ids = m.phrases.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(fusionnerDifferee(m, diff).phrases).toHaveLength(m.phrases.length);
    expect(m.seances.map((s) => s.n)).toEqual(m.seances.map((_, i) => i + 1));
  });

  it('grand texte (Risāla) : droit refusé = rien, même si une copie périmée traîne ; copie à jour = hors ligne', async () => {
    const index = lire<Matn>(SORTIE, 'risala.json');
    const s = index.seances[3]!;
    const partie = lire<PartieMatn>(SORTIE_PROTEGEE, `risala-p${s.p}.json`);
    // 403 : rien
    expect(await chargerPartie(index, s.n, async () => reponse({ error: {} }, 403))).toBeNull();
    // 200 : gardé sous la clé effacée à la déconnexion
    const m = await chargerPartie(index, s.n, async () => reponse(partie));
    expect(m!.phrases.length).toBeGreaterThan(0);
    expect(await kvGet(cleDiffere('risala', `:p${s.p}`))).toBeTruthy();
  });
});
