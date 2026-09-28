/**
 * Tests GÉNÉRÉS à partir du contenu réel (CDC §2.3.2 « exigence de parité », §6.4) :
 * pour CHAQUE exercice des 8 types « langue » d'en1 et d'ad1,
 *  1. la réponse du corrigé obtient 100 % ;
 *  2. chaque mauvaise réponse est refusée (chaque mauvaise option de chaque item, l'autre valeur d'un
 *     vrai/faux, chaque case ou mot non attendu, un appariement décalé, un ordre faux).
 */
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadEdition } from '@awform/content';
import type { LanguageExercise } from '@awform/content/types';
import {
  checkChasseCell,
  checkComplete,
  checkContientMot,
  checkEcoute,
  checkOrdre,
  checkPremiereLettre,
  checkRelier,
  checkVraiFaux,
  correctResponse,
  ecouteExpected,
  exerciseTotal,
  gradeExercise,
  isLanguageExercise,
  ordreSolution,
  plain,
} from '../src/index.js';

const CONTENT_DIR = process.env.AWFORM_CONTENT_DIR ?? join(homedir(), 'awform-content');
const HAS_CONTENT = existsSync(join(CONTENT_DIR, 'data', 'index-lecons.js'));
const LEVELS = ['en1', 'ad1'];

interface Case {
  key: string;
  ex: LanguageExercise;
}

const cases: Case[] = [];
if (HAS_CONTENT) {
  const load = loadEdition({ contentDir: CONTENT_DIR, levels: LEVELS, withRegistry: false });
  for (const level of load.levels)
    for (const unit of level.units)
      for (const e of unit.exercises)
        if (isLanguageExercise(e.content)) cases.push({ key: `${e.key} ${e.type}`, ex: e.content });
}

/** Vérifie qu'au moins une mauvaise réponse existe et qu'elles sont toutes refusées. Renvoie leur nombre. */
function assertWrongAnswersRefused(ex: LanguageExercise): number {
  let wrong = 0;
  switch (ex.type) {
    case 'premiere_lettre':
      ex.items.forEach((it, i) => {
        const bad = it.options.filter((o) => o !== String(it.reponse));
        expect(bad.length, `item ${i + 1} sans mauvaise option`).toBeGreaterThan(0);
        for (const o of bad)
          expect(checkPremiereLettre(ex, i, o), `item ${i + 1} option ${o}`).toBe(false);
        wrong += bad.length;
      });
      break;
    case 'ecoute':
      ex.items.forEach((it, i) => {
        const bad = it.options.filter((o) => plain(o) !== ecouteExpected(it));
        expect(bad.length, `item ${i + 1} sans mauvaise option`).toBeGreaterThan(0);
        for (const o of bad) expect(checkEcoute(ex, i, o), `item ${i + 1} option ${o}`).toBe(false);
        wrong += bad.length;
      });
      break;
    case 'complete':
      ex.items.forEach((it, i) => {
        const bad = it.options.filter((o) => plain(o) !== plain(it.reponse));
        expect(bad.length, `item ${i + 1} sans mauvaise option`).toBeGreaterThan(0);
        for (const o of bad)
          expect(checkComplete(ex, i, o), `item ${i + 1} option ${o}`).toBe(false);
        wrong += bad.length;
      });
      break;
    case 'vrai_faux':
      ex.items.forEach((it, i) => {
        expect(checkVraiFaux(ex, i, !it.vrai)).toBe(false);
        wrong++;
      });
      break;
    case 'relier': {
      const n = ex.items.length;
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++)
          if (i !== j) {
            expect(checkRelier(ex, i, j)).toBe(false);
            wrong++;
          }
      // appariement entièrement décalé (comme la colonne de droite du moteur) : 0 point
      const shifted = ex.items.map((_, i) => (i + 1) % n);
      expect(gradeExercise(ex, { type: 'relier', pairs: shifted }).correct).toBe(0);
      break;
    }
    case 'chasse': {
      const bad = ex.grille.flatMap((_, k) => (checkChasseCell(ex, k) ? [] : [k]));
      expect(bad.length, 'grille sans intrus').toBeGreaterThan(0);
      const r = gradeExercise(ex, { type: 'chasse', selected: bad });
      expect(r.correct).toBe(0);
      expect(r.wrongSelections).toBe(bad.length);
      wrong += bad.length;
      break;
    }
    case 'contient': {
      const bad = ex.mots.flatMap((_, k) => (checkContientMot(ex, k) ? [] : [k]));
      expect(bad.length, 'aucun mot à ne pas toucher').toBeGreaterThan(0);
      expect(gradeExercise(ex, { type: 'contient', selected: bad }).correct).toBe(0);
      wrong += bad.length;
      break;
    }
    case 'ordre':
      ex.items.forEach((it, i) => {
        const sol = ordreSolution(ex, i);
        expect(sol, `item ${i + 1} : phrase impossible à reconstituer`).not.toBeNull();
        if (!sol) return;
        // ordre inverse (s'il donne une autre phrase), sinon ordre incomplet
        const reversed = [...sol].reverse();
        const labels = it.mots.map((m) => plain(m));
        const differs =
          reversed.map((k) => labels[k]).join('|') !== sol.map((k) => labels[k]).join('|');
        const bad = differs ? reversed : sol.slice(0, -1);
        expect(checkOrdre(ex, i, bad), `item ${i + 1}`).toBe(false);
        wrong++;
      });
      break;
  }
  return wrong;
}

describe.skipIf(!HAS_CONTENT)(
  `corpus réel ${LEVELS.join(' + ')} : corrigé accepté, mauvaises réponses refusées`,
  () => {
    it('le corpus contient les 8 types « langue »', () => {
      expect(new Set(cases.map((c) => c.ex.type)).size).toBe(8);
      expect(cases.length).toBeGreaterThan(200);
    });

    it.each(cases)('$key', ({ ex }) => {
      const good = gradeExercise(ex, correctResponse(ex));
      expect(good.total).toBe(exerciseTotal(ex));
      expect(good.total).toBeGreaterThan(0);
      expect(good.correct).toBe(good.total);
      expect(good.score).toBe(1);
      expect(assertWrongAnswersRefused(ex)).toBeGreaterThan(0);
    });
  },
);
