/**
 * Vidéos vivantes des cahiers de lecture des enfants (en1) et des ados (ado1), 25/10/2026 — le mode « cahier » du générateur
 * (`buildVideoCahier`) et le lecteur sont GÉNÉRIQUES : mêmes règles que pour Adultes 1 (voir `video-cahier.test.ts`),
 * vérifiées ici sur les pages de ces deux cahiers, y compris les grilles débloquées case par case :
 *  - la vidéo montre exactement les éléments de la lecture guidée (jamais une case fermée), dans le même ordre ;
 *  - aucune scène muette : tout texte qui a un fichier est dit ; un texte sans fichier est LISTÉ (rien de caché) ;
 *  - jamais de synthèse sur le Coran ; arabe jamais normalisé ; aucune transcription latine.
 * Le test « liste réelle » lit `~/lecons-audio/liste.csv` (niveaux du livre ET du cahier) : sauté sans elle.
 */
/* eslint-disable no-misleading-character-class -- signes combinants du Muṣḥaf voulus (garde coranique) */
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { audioFileId } from '@awform/content/audio-cle';
import {
  CAHIER_SANS_VIDEO,
  buildVideoCahier,
  unitesDe,
  type PageIn,
} from '@awform/content/video-cahier';
import { elementsDeLaPage, type Cahier, type Page } from '../cahier/donnees';
import { filtrerPage } from '../cahier/outils';

const BOM = new RegExp(`^${String.fromCharCode(0xfeff)}`);
const lire = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const NIVEAUX = ['en1', 'ado1'] as const;
const LISTE = process.env.AWFORM_LECONS_AUDIO_LISTE ?? join(homedir(), 'lecons-audio', 'liste.csv');
/** textes (sha1) de la liste réelle des audios, par niveau du cahier (livre + cahier) ; null sans la liste */
const reels = (n: string): Set<string> | null =>
  existsSync(LISTE)
    ? new Set(
        readFileSync(LISTE, 'utf8')
          .split('\n')
          .slice(1)
          .map((l) => l.split(';'))
          .filter((c) =>
            (c[5] ?? '').split(' ').some((x) => x === n || x === `cahier-lecture-${n}`),
          )
          .map((c) => c[0]!.replace(BOM, '')),
      )
    : null;
/** le texte a un fichier : tout texte non coranique (graphie du Muṣḥaf : jamais de synthèse) */
const c16 = String.fromCharCode;
const MUSHAF = new RegExp(`[${c16(0x6d6)}-${c16(0x6ed)}${c16(0x671)}${c16(0x8f0)}-${c16(0x8f2)}]`);
const toutVoix = (s: string) => !MUSHAF.test(s);
const video = (p: Page, hasAudio: (s: string) => boolean = toutVoix) =>
  buildVideoCahier(p as unknown as PageIn, { hasAudio });

for (const n of NIVEAUX) {
  const app = JSON.parse(lire(`../../../static/cahier-data/${n}.json`)) as Cahier;
  const avecVideo = app.pages.filter((p) => !CAHIER_SANS_VIDEO.includes(p.type));

  describe(`vidéos du cahier ${n} : fidélité à la lecture guidée`, () => {
    it('les éléments de la vidéo sont ceux de la lecture guidée, dans le même ordre, sur toutes les pages', () => {
      let total = 0;
      for (const p of avecVideo) {
        const vus = unitesDe(video(p))
          .filter((u) => !u.etiquette)
          .map((u) => [u.cle, u.ar, u.a]);
        const attendus = elementsDeLaPage(p).map(({ cle, el }) => [cle, el.ar, el.a]);
        expect(vus, p.id).toEqual(attendus);
        total += vus.length;
      }
      expect(total).toBeGreaterThan(1500);
    });
    it('grilles débloquées case par case : la vidéo ne montre jamais une case fermée (leçons 1, 3, 12, 24)', () => {
      const grilles = app.pages.filter((p) => p.type === 'grille');
      expect(grilles.length).toBeGreaterThan(20);
      for (const lecon of [0, 1, 3, 12, 24]) {
        let ouvertes = 0;
        for (const g of grilles) {
          const f = filtrerPage(g, lecon);
          const vus = unitesDe(video(f))
            .filter((u) => !u.etiquette)
            .map((u) => [u.cle, u.ar, u.a]);
          expect(vus, `${g.id} @${lecon}`).toEqual(
            elementsDeLaPage(f).map(({ cle, el }) => [cle, el.ar, el.a]),
          );
          // chaque élément montré est ouvert à cette leçon
          for (const { el } of elementsDeLaPage(f))
            expect(el.n === undefined || el.n <= lecon).toBe(true);
          ouvertes += vus.length;
        }
        if (lecon === 0) expect(ouvertes).toBe(0);
        else expect(ouvertes).toBeGreaterThan(0);
      }
    });
    it('arabe jamais normalisé, aucune phonétique latine ; les jeux et les blocs de jeux n’ont pas de scène', () => {
      for (const p of avecVideo) {
        for (const u of unitesDe(video(p)))
          expect(u.ar, `${p.id} ${u.cle}`).not.toMatch(/[A-Za-z]/);
        for (const sc of video(p).scenes)
          expect(['jeux', 'jeu_colorie', 'jeu_chasse'], `${p.id} ${sc.id}`).not.toContain(sc.bloc);
      }
    });
  });

  describe(`vidéos du cahier ${n} : voix, garde coranique, aucune scène muette`, () => {
    it('aucune scène muette quand un audio existe (fichiers simulés pour tout texte non coranique)', () => {
      for (const p of avecVideo) {
        const v = video(p);
        for (const sc of v.scenes) {
          const us = sc.lignes.flatMap((l) => l.unites);
          for (const u of us.filter((x) => x.a !== 'q'))
            expect(u.voix, `${p.id} ${u.cle}`).toBe('oui');
          if (us.some((u) => u.voix === 'oui' || u.voix === 'recitation')) continue;
          for (const u of us) expect(['garde', 'aucune'], `${p.id} ${sc.id}`).toContain(u.voix);
        }
      }
    });
    it('jamais de synthèse sur le Coran : un élément « q » est une récitation (référence de verset)', () => {
      let q = 0;
      for (const p of avecVideo)
        for (const u of unitesDe(video(p)))
          if (u.a === 'q') {
            q++;
            expect(u.voix === 'recitation' || u.voix === 'aucune', `${p.id} ${u.cle}`).toBe(true);
            if (u.voix === 'recitation') expect(u.ref).toMatch(/^\d{1,3}:\d{1,3}$/);
          }
      expect(q).toBeGreaterThan(20);
    });
    it.skipIf(!reels(n))(
      'liste réelle des audios : aucune scène muette ; seuls les textes sans fichier sont sans voix (liste connue)',
      () => {
        const ids = reels(n)!;
        const hasAudio = (s: string) => toutVoix(s) && ids.has(audioFileId(s) ?? '');
        const sans: string[] = [];
        // titres arabes des textes suivis : la liste des audios du cahier n'en a pas encore (à générer) ; comptés à part
        const titres: string[] = [];
        let oui = 0;
        for (const p of avecVideo) {
          const v = buildVideoCahier(p as unknown as PageIn, { hasAudio });
          for (const u of unitesDe(v)) {
            if (u.a === 'q' || u.etiquette) continue;
            if (u.voix === 'oui') oui++;
            else if (u.cle === 't.t') titres.push(`${p.id} ${u.ar}`);
            else sans.push(`${p.id} ${u.ar}`);
          }
          // une scène n'est jamais muette : au moins une voix (ou une récitation) par scène
          for (const sc of v.scenes) {
            const us = sc.lignes.flatMap((l) => l.unites);
            expect(
              us.some((u) => u.voix === 'oui' || u.voix === 'recitation'),
              `${p.id} ${sc.id} muette`,
            ).toBe(true);
          }
        }
        expect(oui).toBeGreaterThan(1500);
        // enfants : tout est dit. Ados : trois textes qui contiennent « بسم الله » n'ont jamais de synthèse (règle Basmala,
        // en attente de la récitation d'Ayyūb) ; ils sont listés ici pour qu'aucun autre ne s'ajoute en silence
        expect(sans.map((s) => s.split(' ')[0]).sort()).toEqual(
          n === 'ado1' ? ['P089', 'P092', 'P100'] : [],
        );
        // (comparaison sur les lettres seules : les signes sont comparés par ailleurs, octet pour octet)
        const lettres = (s: string) =>
          s.replace(new RegExp(`[${c16(0x64b)}-${c16(0x652)}${c16(0x670)}]`, 'g'), '');
        for (const s of sans) expect(lettres(s)).toContain('بسم الله');
        // titres de textes sans fichier : 5 pour les enfants, 9 pour les ados (jamais plus ; la liste ne fait que diminuer)
        expect(titres.length, titres.join(' | ')).toBeLessThanOrEqual(n === 'en1' ? 5 : 9);
      },
    );
  });
}
