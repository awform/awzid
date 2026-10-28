/**
 * Prononciation (28/10/2026) : appel dédié en parallèle, règle « mieux vaut se taire qu'accuser à tort », conseil
 * d'écoute pour les paires difficiles, garde-fous intacts.
 */
import { describe, expect, it } from 'vitest';
import {
  BORNES_PRONONCIATION,
  corpsPrononciation,
  coutMaxPrononciation,
  differenceSon,
  estDifficile,
  filtrerSortie,
  issueDuTour,
  traductionPropre,
  issuePrononciation,
  jetonGoogle,
  PAIRES_ECOUTE,
  PRONON_SCHEMA,
  prononInvite,
  PrononciationSimulee,
  QuranIndex,
  tarifDe,
  validerPrononBrouillon,
  VertexPrononciation,
} from '../src/index.js';
import { CONTEXTE_ADULTE } from '../src/conversation/batterie-contexte.js';
import { correctionDeSon } from '../src/conversation/batterie.js';

const idx = new QuranIndex(
  new Map([
    ['1:2', 'الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ'],
    ['1:3', 'الرَّحْمَٰنِ الرَّحِيمِ'],
  ]),
);
const ctx = {
  mots: CONTEXTE_ADULTE.mots,
  dialogue: CONTEXTE_ADULTE.dialogue,
  index: idx,
  audience: 'adulte' as const,
};
const ok = (brouillon: unknown) => ({ status: 'ok' as const, brouillon });

describe('différence de son (règle de l’application)', () => {
  it('confusions connues, voyelle longue ; doute sinon', () => {
    expect(differenceSon('الْهِسَابُ', 'الْحِسَابُ')).toEqual({ son: 'ح', entendu: 'ه' });
    expect(differenceSon('تَمَاتِمُ', 'طَمَاطِمُ')).toEqual({ son: 'ط', entendu: 'ت' });
    expect(differenceSon('أُرِدُ', 'أُرِيدُ')).toEqual({ son: 'voyelle_longue' });
    expect(differenceSon('كِيلُو', 'كِيلُو')).toBeNull();
    // deux sons différents dans un mot : doute, rien
    expect(differenceSon('تَمَاكِمُ', 'طَمَاطِمُ')).toBeNull();
  });
  it('paires difficiles (ع/ء, ق/ك, ص/س), shadda : jamais une remarque', () => {
    expect(estDifficile({ son: 'ق', entendu: 'ك' })).toBe(true);
    expect(estDifficile({ son: 'ص', entendu: 'س' })).toBe(true);
    expect(estDifficile({ son: 'ع', entendu: 'ء' })).toBe(true);
    expect(estDifficile({ son: 'shadda' })).toBe(true);
    expect(estDifficile({ son: 'ث', entendu: 'س' })).toBe(false);
    expect(estDifficile({ son: 'ح', entendu: 'ه' })).toBe(false);
  });
});

describe('issue de l’appel de prononciation', () => {
  it('faute fiable : remarque écrite par l’application, mot du LIVRE', () => {
    const r = issuePrononciation(
      ok({
        entendu: 'شُكْرًا، كَمِ الْهِسَابُ؟',
        voulu: 'شُكْرًا، كَمِ الْحِسَابُ؟',
        fautes: [{ entendu: 'الْهِسَابُ', correct: 'الْحِسَابُ' }],
      }),
      ctx,
    );
    expect(r.remarque?.son).toBe('ح');
    expect(r.remarque?.explication_fr).toContain('ح');
    expect(r.conseil).toBeNull();
    expect(r.filtre).toContainEqual({ step: 'prononciation', action: 'ok', detail: 'ح' });
  });

  it('paire difficile (ص/س) : AUCUNE remarque, un conseil d’écoute avec la paire minimale', () => {
    const r = issuePrononciation(
      ok({
        entendu: 'أُرِيدُ نِسْفَ كِيلُو بَصَلٍ.',
        voulu: 'أُرِيدُ نِصْفَ كِيلُو بَصَلٍ.',
        fautes: [{ entendu: 'نِسْفَ', correct: 'نِصْفَ' }],
      }),
      ctx,
    );
    expect(r.remarque).toBeNull();
    expect(r.conseil?.son).toBe('ص');
    expect(r.conseil?.paire).toEqual(PAIRES_ECOUTE['ص']!.paire);
    expect(r.conseil?.explication_fr).toMatch(/^Écoute la différence/);
    expect(r.filtre.map((e) => e.step)).toContain('conseil_ecoute');
  });

  it('phrase juste sans son difficile : rien du tout', () => {
    const r = issuePrononciation(
      ok({ entendu: 'هَلْ عِنْدَكَ بَصَلٌ؟', voulu: 'هَلْ عِنْدَكَ بَصَلٌ؟', fautes: [] }),
      ctx,
    );
    expect(r.remarque).toBeNull();
    // ع est dans عِنْدَكَ (mot du livre) : conseil d'écoute permis, jamais un reproche
    expect(r.conseil === null || r.conseil.son === 'ع').toBe(true);
  });

  it('garde-fous : religion, Coran dans la phrase voulue ou entendue → rien n’est montré', () => {
    for (const voulu of [
      'هَلْ يَجُوزُ أَكْلُ هٰذَا اللَّحْمِ؟',
      'الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ',
    ]) {
      const r = issuePrononciation(
        ok({ entendu: voulu, voulu, fautes: [{ entendu: 'هَلْ', correct: 'هَلْ' }] }),
        ctx,
      );
      expect(r.remarque, voulu).toBeNull();
      expect(r.conseil, voulu).toBeNull();
      expect(r.filtre[0]).toMatchObject({ step: 'prononciation', action: 'bloque' });
    }
  });

  it('panne, refus de sécurité ou brouillon hors schéma : rien (jamais d’erreur montrée)', () => {
    expect(
      issuePrononciation({ status: 'erreur', brouillon: null, detail: 'reseau' }, ctx),
    ).toMatchObject({
      remarque: null,
      conseil: null,
    });
    expect(issuePrononciation({ status: 'refus', brouillon: null }, ctx).remarque).toBeNull();
    expect(validerPrononBrouillon({ entendu: 'x', voulu: 'y', fautes: [], autre: 1 })).toBeNull();
    expect(validerPrononBrouillon({ entendu: 'x', voulu: 'y', fautes: [1, 2, 3, 4] })).toBeNull();
    expect(issuePrononciation(ok('pas un objet'), ctx).remarque).toBeNull();
  });

  it('le mot « juste » doit être un mot du livre, sinon rien', () => {
    const r = issuePrononciation(
      ok({
        entendu: 'هَذِهِ تَاوِلَةٌ',
        voulu: 'هَذِهِ طَاوِلَةٌ',
        fautes: [{ entendu: 'تَاوِلَةٌ', correct: 'طَاوِلَةٌ' }],
      }),
      { ...ctx, mots: [], dialogue: [{ qui: 'a', ar: 'السَّلَامُ عَلَيْكُمْ' }] },
    );
    expect(r.remarque).toBeNull();
  });
});

describe('appel de prononciation (Vertex, UE) et simulé', () => {
  const audio = { mime: 'audio/webm;codecs=opus', data: Buffer.from('xx') };
  it('corps : audio seul, invite courte (dialogue de la leçon), schéma dédié, réflexion LOW, étiquettes', () => {
    const inv = prononInvite(CONTEXTE_ADULTE);
    expect(inv).toContain('<dialogue_de_la_lecon>');
    expect(inv).not.toContain('mots_vus');
    const c = corpsPrononciation(inv, audio) as Record<string, never>;
    expect(c).toMatchObject({
      generationConfig: {
        responseSchema: PRONON_SCHEMA,
        temperature: 0,
        thinkingConfig: { thinkingLevel: 'LOW' },
      },
      labels: { app: 'awzid', fonction: 'tuteur-prononciation' },
    });
    expect(JSON.stringify(c)).toContain('"mimeType":"audio/webm"');
  });

  it('lit la réponse du modèle ; refuse un lieu hors UE', async () => {
    let url = '';
    const f = (async (u: string) => {
      url = u;
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: { parts: [{ text: '{"entendu":"أ","voulu":"أ","fautes":[]}' }] },
              finishReason: 'STOP',
            },
          ],
          usageMetadata: {
            promptTokenCount: 900,
            candidatesTokenCount: 40,
            thoughtsTokenCount: 60,
          },
        }),
      );
    }) as unknown as typeof fetch;
    const p = new VertexPrononciation({
      projet: 'p-1x',
      lieu: 'eu',
      modele: 'gemini-3.8-flash',
      jeton: { obtenir: async () => 'j' },
      fetch: f,
    });
    const r = await p.ecouter('S', audio);
    expect(url).toContain('aiplatform.eu.rep.googleapis.com');
    expect(r).toMatchObject({ status: 'ok', usage: { texte: 900, sortie: 100 } });
    expect(
      () =>
        new VertexPrononciation({
          projet: 'p-1x',
          lieu: 'us-central1' as 'eu',
          modele: 'm',
          jeton: { obtenir: async () => 'j' },
        }),
    ).toThrow('lieu_hors_ue');
  });

  it('simulé : la faute du livre est reconnue', async () => {
    const r = await new PrononciationSimulee().ecouter(
      prononInvite(CONTEXTE_ADULTE),
      { mime: 'audio/wav', data: Buffer.from('SIMULE:شُكْرًا، كَمِ الْهِسَابُ؟') },
      { mots: CONTEXTE_ADULTE.mots },
    );
    expect(issuePrononciation(r, ctx).remarque?.son).toBe('ح');
  });
});

describe('garde-fou ajouté le 28/10 (batterie réelle, Flash-Lite)', () => {
  it('refus du modèle qui parle de rencontre (« Ne rencontre personne d’internet ») → renvoi PROTECTION', () => {
    const i = issueDuTour(
      ok({
        transcription_ar: 'تَعَرَّفْتُ عَلَى شَخْصٍ',
        sujet: 'autre',
        correction: null,
        reponse_ar: 'هٰذَا غَيْرُ مُمْكِنٍ.',
        reponse_fr: 'C’est impossible. Ne rencontre personne d’internet.',
      }),
      { index: idx, audio: true, audience: 'ado', mots: ctx.mots, dialogue: ctx.dialogue },
    );
    expect(i.redir).toBe('protection');
  });

  it('traduction mal formée écartée (l’arabe reste) ; contact (e-mail) : réponse bloquée', () => {
    const ar = 'شُكْرًا. هَلْ تُرِيدُ شَيْئًا آخَرَ؟';
    expect(traductionPropre('Merci. Voulez-vous autre chose ؟', ar)).toBe(
      'Merci. Voulez-vous autre chose ?',
    );
    for (const mauvais of [
      'Merci. Voulez-Cous autre chose ?',
      'Avez-voux des tomates ?',
      'Bon, et voulez-vous des tomates aussi ?ुरूई',
      'Combien de kilos voulez-vous (générique) ? Attends, combien ?',
    ])
      expect(traductionPropre(mauvais, ar), mauvais).toBe('');
    const base = { transcription_ar: '', sujet: 'langue', correction: null, reponse_ar: ar };
    const f = filtrerSortie({ ...base, reponse_fr: 'Merci. Voulez-Cous autre chose ?' }, idx);
    expect(f.ok).toBe(true);
    expect(f.brouillon?.reponse_fr).toBe('');
    const mail = filtrerSortie(
      { ...base, reponse_fr: 'Voulez-vous autre chose ?karolyn@gmail.com' },
      idx,
    );
    expect(mail.ok).toBe(false);
    expect(mail.events).toContainEqual({
      step: 'donnees_perso',
      action: 'bloque',
      detail: 'contact',
    });
  });
});

describe('budget et latence', () => {
  it('réservation du pire cas de l’appel de prononciation : moins d’un centime', () => {
    const t = tarifDe('gemini-3.8-flash', new Date('2027-01-05'))!;
    expect(BORNES_PRONONCIATION.sortieMax).toBe(2048);
    expect(coutMaxPrononciation(t, 1)).toBeLessThan(25_000);
  });

  it('jeton renouvelé À L’AVANCE : rendu tout de suite, nouveau demandé en tâche de fond', async () => {
    let appels = 0;
    let duree = 600; // secondes de validité du 1er jeton
    const f = (async () => {
      appels++;
      return new Response(JSON.stringify({ access_token: `t${appels}`, expires_in: duree }));
    }) as unknown as typeof fetch;
    const j = jetonGoogle({ fetch: f });
    expect(await j.obtenir()).toBe('t1');
    expect(await j.obtenir()).toBe('t1');
    expect(appels).toBe(1);
    duree = 200; // 2e jeton : moins de 5 min
    const j2 = jetonGoogle({ fetch: f });
    expect(await j2.obtenir()).toBe('t2');
    duree = 900;
    expect(await j2.obtenir()).toBe('t2'); // encore valable : rendu sans attendre
    await new Promise((ok) => setTimeout(ok, 10));
    expect(appels).toBe(3);
    expect(await j2.obtenir()).toBe('t3');
  });

  it('batterie : une correction de la conversation qui porte sur un SON est repérée (reproche à tort)', () => {
    expect(correctionDeSon({ dit: 'الْهِسَابُ', correct: 'الْحِسَابُ', explication_fr: '' })).toBe(
      true,
    );
    expect(correctionDeSon({ dit: 'طَازَجٌ', correct: 'طَازَجَةٌ', explication_fr: '' })).toBe(
      false,
    );
    expect(correctionDeSon(null)).toBe(false);
  });
});
