/**
 * « La prière de A à Z » (25/10/2026) : interrupteur `parcours_priere` (coupé par défaut, canal bêta) ; données de l'application
 * identiques à la génération et FIDÈLES au JSON du référent (arabe octet pour octet) ; AUCUN verset en voix de synthèse (garde
 * respectée, jamais contournée), jamais de synthèse sur la Basmala complète (la tasmiya seule est un dhikr, 26/10/2026) ; Coran par Ayyūb seulement (la Fātiḥa de la prière
 * commence à 1:2) ; compteur du tasbīḥ ; calendrier des mots ; progression gardée ; chorégraphie cohérente avec le livre ;
 * chaque code de niveau a son affichage (clair et sombre) ; aucun texte en dur dans le code ; chargement à la demande.
 * Aucun texte arabe n'est écrit dans ce test : tout est lu dans les fichiers du référent.
 */
import 'fake-indexeddb/auto';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
import {
  FONCTIONS,
  etatsAvecDemo,
  fonctionsParDefaut,
  fonctionsPour,
  type ContexteFonction,
} from '@awform/school';
import { audioFileId, looksQuranic } from '@awform/content/audio-cle';
import type { LevelAudio } from '$lib/lecons-audio';
import { ajouterTextes } from '$lib/i18n';
import {
  classer,
  collecter,
  contientBasmala as basmalaScript,
  tableaux,
} from '../../../scripts/priere-audio.mjs';
import { analyser } from '../../../scripts/priere-calage.mjs';
import { fabriquer, serialiser } from '../../../scripts/priere-donnees.mjs';
import { contientBasmala, interditSynthese, refsAyyub, sourceAudio } from './audio';
import { calendrier, calageParDefaut, motActif, mots, passages, poids } from './calendrier';
import {
  annuler,
  aller as allerCompteur,
  etatInitial,
  suivante,
  toucher,
  totalFait,
} from './compteur';
import {
  CLASSE_NIVEAU,
  charger,
  clePriere,
  decouper,
  ecrireProgres,
  ici,
  lignesVoix,
  lireProgres,
  marquerVu,
  parcourir,
  repetitions,
  stations,
  trouver,
  type Element,
  type Plan,
} from './donnees';
import { vibrer } from './mouvement';
import Parole from './Parole.svelte';
import Pastilles from './Pastilles.svelte';
import textes from './textes-fr.json';

ajouterTextes(textes);

const ici_ = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const lire = (rel: string) => readFileSync(ici_(rel), 'utf8');
const DONNEES = '../../../../../packages/content/data/priere/';
const STATIC = '../../../static/priere-data/';
const priere = JSON.parse(lire(`${DONNEES}priere.json`)) as {
  meta: { statut: string; niveaux: Record<string, string> };
  sections: Array<Record<string, unknown> & { id: string; statut: string }>;
};
const sourates = JSON.parse(lire(`${DONNEES}sourates.json`)) as {
  basmala: Record<string, unknown>;
  sourates: Array<{
    numero: number;
    nombre_versets: number;
    versets: Array<{ ref: string; ar: string; audio: string; mot_a_mot: Array<{ ar: string }> }>;
  }>;
};
const animation = JSON.parse(lire(`${DONNEES}animation.json`)) as Plan['animation'];
const noms = readdirSync(ici_(STATIC)).filter((f) => f.endsWith('.json') && f !== 'calage.json');
/** HTML rendu sans les repères d'hydratation */
const net = (h: string) => h.replace(/<!--[\s\S]*?-->/g, '');
const statique = (n: string) => JSON.parse(lire(`${STATIC}${n}`)) as Record<string, unknown>;

/** clés internes jamais montrées (retirées de la projection) */
const INTERNES = new Set([
  'ar_source',
  'statut_technique',
  'illustration',
  'nom_ar_source',
  'transformations',
  'motif_squelette',
]);
const AR = new RegExp(`[${String.fromCharCode(0x600)}-${String.fromCharCode(0x6ff)}]`);
/** toutes les chaînes qui contiennent de l'arabe, hors clés internes */
function chainesArabes(o: unknown, out = new Set<string>()): Set<string> {
  if (typeof o === 'string') {
    if (AR.test(o)) out.add(o);
  } else if (Array.isArray(o)) o.forEach((x) => chainesArabes(x, out));
  else if (o && typeof o === 'object')
    for (const [k, v] of Object.entries(o)) if (!INTERNES.has(k)) chainesArabes(v, out);
  return out;
}
const tousElements = (): Element[] => {
  const out: Element[] = [];
  parcourir(priere.sections, (o) => {
    if (typeof o.id === 'string' && typeof o.type === 'string') out.push(o as unknown as Element);
    // textes arabes d'une règle, lus eux aussi par la synthèse
    const t = o.textes as Array<{ ar: string; audio?: string }> | undefined;
    t?.forEach((x, i) =>
      out.push({ ...x, id: `${String(o.id)}#textes${i}`, type: 'parole' } as unknown as Element),
    );
  });
  return out;
};
const sansMarques = (s: string) =>
  s
    .replace(
      new RegExp(
        `[${String.fromCharCode(0x64b)}-${String.fromCharCode(0x65f)}${String.fromCharCode(0x670)}${String.fromCharCode(0x6d6)}-${String.fromCharCode(0x6ed)}${String.fromCharCode(0x640)}]`,
        'g',
      ),
      '',
    )
    .replace(new RegExp(String.fromCharCode(0x671), 'g'), String.fromCharCode(0x627))
    .replace(/\s+/g, ' ')
    .trim();

describe('interrupteur `parcours_priere`', () => {
  const ctx = (canal: 'beta' | 'production'): ContexteFonction => ({
    roles: ['eleve'],
    age: 'adulte',
    pays: 'FR',
    ecoles: [],
    canal,
  });
  it('coupé par défaut partout, démonstration comprise ; ouvert seulement au canal bêta une fois réglé', () => {
    expect(FONCTIONS.parcours_priere).toEqual({ defaut: 'off' });
    expect(fonctionsParDefaut().parcours_priere).toBe(false);
    expect(fonctionsParDefaut('beta').parcours_priere).toBe(false);
    expect(etatsAvecDemo({}, true).parcours_priere).toBeUndefined();
    const etats = { parcours_priere: 'beta' as const };
    expect(fonctionsPour(ctx('production'), etats, []).parcours_priere).toBe(false);
    expect(fonctionsPour(ctx('beta'), etats, []).parcours_priere).toBe(true);
  });
  it('le libellé de l’administration existe dans les cinq langues', () => {
    for (const f of ['fr-personnel', 'ar', 'de', 'en', 'es'])
      expect(
        JSON.parse(lire(`../../../static/i18n/${f}.json`))['fn.parcours_priere'],
        f,
      ).toBeTruthy();
  });
});

describe('données de l’application', () => {
  it('les fichiers de static/priere-data sont exactement ce que génère le script (rien à relancer)', () => {
    const attendu = fabriquer(priere, sourates, animation) as Record<string, unknown>;
    expect(Object.keys(attendu).sort()).toEqual(noms.sort());
    for (const [nom, o] of Object.entries(attendu))
      expect(lire(`${STATIC}${nom}`), nom).toBe(serialiser(o));
  });
  it('un fichier par écran : le plus lourd reste raisonnable (non compressé)', () => {
    for (const n of noms) expect(lire(`${STATIC}${n}`).length, n).toBeLessThan(80_000);
  });
  it('chargement hors ligne d’abord : le réseau garde la copie, puis la copie suffit sans réseau', async () => {
    const plan = statique('plan.json');
    let appels = 0;
    const reseau = (async () => {
      appels++;
      return new Response(JSON.stringify(plan), { status: 200 });
    }) as unknown as typeof fetch;
    const a = await charger<{ v: string }>('plan', reseau);
    expect(a?.v).toBe(plan.v);
    const hors = (async () => {
      throw new Error('hors ligne');
    }) as unknown as typeof fetch;
    const b = await charger<{ v: string }>('plan', hors);
    expect(b?.v).toBe(plan.v);
    expect(appels).toBeGreaterThan(0);
    expect(clePriere('plan')).toBe('priere-data:plan');
  });
  it('un fichier invalide ou absent donne null (jamais une erreur)', async () => {
    const faux = (async () => new Response('{"x":1}', { status: 200 })) as unknown as typeof fetch;
    expect(await charger('inexistant-1', faux)).toBeNull();
    const absent = (async () => new Response('', { status: 404 })) as unknown as typeof fetch;
    expect(await charger('inexistant-2', absent)).toBeNull();
  });
});

describe('fidélité au JSON du référent : l’arabe octet pour octet', () => {
  const projetees = new Set<string>();
  for (const n of noms) chainesArabes(statique(n), projetees);
  const sources = chainesArabes(priere.sections);
  chainesArabes(sourates, sources);
  it('toute chaîne arabe du référent est dans les données de l’application, identique', () => {
    expect(sources.size).toBeGreaterThan(500);
    const absentes = [...sources].filter((s) => !projetees.has(s));
    expect(absentes).toEqual([]);
    for (const s of [...sources].slice(0, 200))
      expect(
        Buffer.from(
          [...projetees].find((x) => x === s)!,
          'utf8',
        ).equals(Buffer.from(s, 'utf8')),
      ).toBe(true);
  });
  it('rien n’est ajouté : l’application n’a aucune chaîne arabe qui ne soit du référent', () => {
    expect([...projetees].filter((s) => !sources.has(s))).toEqual([]);
  });
  it('le texte affiché d’une parole est celui du livre : chaque mot rendu tel quel', () => {
    const s5 = (statique('s5.json') as { section: unknown }).section;
    const voix = {
      preparer: () => new Promise(() => undefined),
      la: null,
      arreter: () => undefined,
    };
    let n = 0;
    parcourir(s5, (o) => {
      if (o.type !== 'parole' || typeof o.ar !== 'string' || !o.ar) return;
      const html = net(
        render(Parole, { props: { p: o as unknown as Element, voix: voix as never } }).body,
      );
      for (const w of mots(o.ar))
        expect(html.includes(`>${w}</span>`), `${o.id} : ${w}`).toBe(true);
      n++;
    });
    expect(n).toBeGreaterThan(15);
    // la Fātiḥa de la prière : chaque verset (1:2 à 1:7) rendu tel quel, sur sa ligne
    const f = trouver(s5, 'S5.fatiha')!;
    const html = net(render(Parole, { props: { p: f, voix: voix as never } }).body);
    expect(f.ar_versets).toHaveLength(6);
    for (const v of f.ar_versets!) expect(html.includes(`>${v.ar}</span>`), v.ref).toBe(true);
  });
  it('l’ordre des versets de la Fātiḥa et de chaque sourate est celui du livre', () => {
    for (const so of sourates.sourates) {
      const d = (
        statique(`sourate-${so.numero}.json`) as {
          sourate: { versets: Array<{ ar: string; ref: string }> };
        }
      ).sourate;
      expect(d.versets.map((v) => v.ref)).toEqual(so.versets.map((v) => v.ref));
      expect(d.versets.map((v) => v.ar)).toEqual(so.versets.map((v) => v.ar));
      expect(so.versets.length).toBe(so.nombre_versets);
    }
  });
});

describe('voix : le Coran par Ayyūb seulement, jamais de synthèse sur un verset ni sur la basmala', () => {
  const elements = tousElements();
  const ttsTextes = elements.filter((e) => e.audio === 'tts' && e.ar);
  const toutes = new Set(ttsTextes.map((e) => audioFileId(e.ar!)!));
  const verset = sourates.sourates[0]!.versets[1]!;
  // tous les fichiers de synthèse « existent », et la liste blanche du serveur les autorise tous : la garde doit tenir
  const la: LevelAudio = {
    niveau: 'priere',
    fichiers: new Set([...toutes, audioFileId(verset.ar)!]),
    octets: 0,
    mention: '',
    credits: [],
    autorises: [...toutes, audioFileId(verset.ar)!],
  };
  it('les références Ayyūb : plages, basmala annexe, listes ; la Fātiḥa de la prière commence à 1:2', () => {
    expect(refsAyyub('ayyub:1:2-7')).toEqual([2, 3, 4, 5, 6, 7].map((v) => ({ s: 1, v })));
    expect(refsAyyub('ayyub:112:1-4')).toHaveLength(4);
    expect(refsAyyub('ayyub:2:255')).toEqual([{ s: 2, v: 255 }]);
    expect(refsAyyub('ayyub:basmala')).toEqual([{ s: 1, v: 1 }]);
    expect(refsAyyub(['ayyub:112:1-4', 'ayyub:113:1-5'])).toHaveLength(9);
    expect(refsAyyub('tts')).toEqual([]);
    expect(refsAyyub(undefined)).toEqual([]);
    expect(refsAyyub('ayyub:x:y')).toEqual([]);
    const fatiha = trouver(priere.sections, 'S5.fatiha');
    const refs = refsAyyub(fatiha?.audio);
    expect(refs[0]).toEqual({ s: 1, v: 2 });
    expect(refs.some((r) => r.s === 1 && r.v === 1)).toBe(false);
    expect(refs).toHaveLength(6);
  });
  it('tout verset du livre passe par Ayyūb, même si la liste des fichiers de synthèse le contient', () => {
    let n = 0;
    for (const so of sourates.sourates)
      for (const v of so.versets) {
        expect(sourceAudio({ audio: v.audio, ar: v.ar }, la).type, v.ref).toBe('ayyub');
        // un verset marqué « tts » par erreur n'a JAMAIS de voix : refusé (graphie du Muṣḥaf, garde coranique), même
        // autorisé par la liste ; et sans fichier dans la liste du serveur (la garde de l'import n'en laisse aucun), muet
        const s = sourceAudio({ audio: 'tts', ar: v.ar }, la);
        const sans = sourceAudio(
          { audio: 'tts', ar: v.ar },
          { ...la, fichiers: new Set(), autorises: [] },
        );
        if (looksQuranic(v.ar)) expect(s.type, v.ref).toBe('interdit');
        expect(sans.type === 'interdit' || (sans.type === 'tts' && sans.id === null), v.ref).toBe(
          true,
        );
        n++;
      }
    expect(n).toBeGreaterThan(80);
  });
  it('tout élément du livre dont `audio` est un verset passe par Ayyūb, jamais par la synthèse', () => {
    let n = 0;
    for (const e of elements) {
      const a = Array.isArray(e.audio) ? e.audio : [e.audio];
      if (!a.some((x) => typeof x === 'string' && x.startsWith('ayyub'))) continue;
      const s = sourceAudio(e, la);
      expect(s.type, e.id).toBe('ayyub');
      n++;
    }
    expect(n).toBeGreaterThan(8);
  });
  it('une parole « tts » n’est lue par la synthèse que si son texte n’est ni la Basmala complète ni du Coran', () => {
    expect(ttsTextes.length).toBeGreaterThan(40);
    for (const e of ttsTextes) {
      const s = sourceAudio(e, la);
      if (s.type === 'tts') {
        expect(contientBasmala(e.ar!), e.id).toBe(false);
        expect(looksQuranic(e.ar!), e.id).toBe(false);
        expect(interditSynthese(e.ar!), e.id).toBeNull();
      } else {
        expect(s.type, e.id).toBe('interdit');
        // le message « Récitation de Muḥammad Ayyūb » ne s'affiche que pour la Basmala complète ou le Coran
        expect(s.raison === 'basmala' ? contientBasmala(e.ar!) : looksQuranic(e.ar!), e.id).toBe(
          true,
        );
      }
    }
  });
  it('aucun texte de synthèse ne contient un verset du livre (comparaison sans voyelles)', () => {
    const versets = sourates.sourates
      .flatMap((s) => s.versets)
      .map((v) => sansMarques(v.ar))
      .filter((v) => v.split(' ').length >= 3);
    for (const e of ttsTextes) {
      if (sourceAudio(e, la).type !== 'tts') continue;
      const t = ` ${sansMarques(e.ar!)} `;
      for (const v of versets)
        expect(t.includes(` ${v} `), `${e.id} contient un verset`).toBe(false);
    }
  });
  it('« Au nom d’Allah » dit avant un acte (ablutions) est un dhikr : lu par la synthèse, comme les autres paroles', () => {
    const tasmiya = trouver(priere.sections, 'S2A.w.tasmiya')!;
    // fichier de synthèse existant : la voix de la tasmiya est branchée (pas de message « sans voix »)
    expect(sourceAudio(tasmiya, la)).toEqual({ type: 'tts', id: audioFileId(tasmiya.ar!) });
    // sans fichier : « audio en préparation », jamais une voix improvisée
    expect(sourceAudio(tasmiya, null)).toEqual({ type: 'tts', id: null });
    expect(contientBasmala(tasmiya.ar!)).toBe(false);
    expect(interditSynthese(tasmiya.ar!)).toBeNull();
    // dans une phrase dite avant un acte : même chose
    const phrase = `${tasmiya.ar} ${trouver(priere.sections, 'S5.w.takbir')!.ar}`;
    expect(interditSynthese(phrase)).toBeNull();
  });
  it('la Basmala complète (verset 1:1) n’a jamais de voix de synthèse : « Récitation de Muḥammad Ayyūb » à la place', () => {
    const complete = sourates.basmala.ar as string;
    expect(sourceAudio({ audio: 'tts', ar: complete }, la)).toEqual({
      type: 'interdit',
      raison: 'basmala',
    });
    expect(sourceAudio({ audio: 'tts', ar: `${complete} ${complete}` }, la)).toEqual({
      type: 'interdit',
      raison: 'basmala',
    });
    expect(contientBasmala(complete)).toBe(true);
    expect(basmalaScript(complete)).toBe(true);
    expect((textes as Record<string, string>)['priere.sans_voix_basmala']).toBe(
      'Récitation de Muḥammad Ayyūb',
    );
    // la règle est la même dans le script des tableaux audio et dans l'application
    for (const e of elements.filter((x) => x.ar))
      expect(basmalaScript(e.ar!), e.id).toBe(contientBasmala(e.ar!));
  });
  it('aucune carte du parcours n’affiche le message « sans voix » pour un simple « Au nom d’Allah »', () => {
    let n = 0;
    for (const e of tousElements().filter((x) => x.ar && x.audio === 'tts')) {
      const s = sourceAudio(e, la);
      if (s.type === 'interdit' && s.raison === 'basmala')
        expect(contientBasmala(e.ar!)).toBe(true);
      else expect(s.type, e.id).toBe('tts');
      n++;
    }
    expect(n).toBeGreaterThan(40);
  });
  it('sans fichier : « audio en préparation » (id nul), jamais une voix improvisée', () => {
    const e = trouver(priere.sections, 'S5.w.qunut')!;
    expect(sourceAudio(e, null)).toEqual({ type: 'tts', id: null });
    expect(sourceAudio({ audio: 'aucun', ar: e.ar }, la)).toEqual({ type: 'aucun' });
    expect(sourceAudio({ audio: 'tts' }, la)).toEqual({ type: 'aucun' });
  });
  it('les tableaux audio : rien d’interdit à générer ni à étiqueter, textes uniques, existants séparés', () => {
    const entrees = collecter(priere);
    const existant = trouver(priere.sections, 'S5.w.takbir')!;
    const liste = new Map([
      [audioFileId(existant.ar!)!, { niveaux: 'ad1 re2', texte: existant.ar ?? '' }],
    ]);
    const c = classer(entrees, liste);
    // « Au nom d'Allah » est un dhikr : à générer (ou existant), plus interdit ; la Basmala complète reste interdite
    expect(c.interdits.map((x: { id: string }) => x.id)).not.toContain('S2A.w.tasmiya');
    expect(
      [...c.aGenerer, ...c.existants].some((x: { ids: string[] }) =>
        x.ids.includes('S2A.w.tasmiya'),
      ),
    ).toBe(true);
    const complete = sourates.basmala.ar as string;
    const cc = classer([{ id: 'X', ar: complete, type: 'parole', titre: '' }], new Map());
    expect(cc.interdits.map((x: { id: string }) => x.id)).toEqual(['X']);
    for (const x of [...c.aGenerer, ...c.existants]) {
      expect(contientBasmala(x.ar)).toBe(false);
      expect(looksQuranic(x.ar)).toBe(false);
    }
    const shas = [...c.aGenerer, ...c.existants].map((x: { sha: string }) => x.sha);
    expect(new Set(shas).size).toBe(shas.length);
    expect(c.existants.some((x: { ids: string[] }) => x.ids.includes('S5.w.takbir'))).toBe(true);
    const t = tableaux(c) as Record<string, string>;
    expect(t['audio_a_generer.tsv']!.split('\n')[0]).toBe('sha1\tniveau\tids\tcaracteres\ttexte');
    expect(t['audio_a_generer.tsv']).toContain('\tpriere\t');
    expect(Object.keys(t)).toContain('audio_existant.tsv');
  });
  it('le calage lit la sortie de ffmpeg : silence de tête, silences intérieurs, fin', () => {
    const sortie = `silence_start: 0\nsilence_end: 0.12 | silence_duration: 0.12\nsilence_start: 1.2\nsilence_end: 1.61\nsilence_start: 2.77\nsilence_end: 3.26\nsilence_start: 4.9`;
    expect(analyser(sortie, 5.2)).toEqual({
      a: 0.12,
      b: 4.9,
      s: [
        [1.2, 1.61],
        [2.77, 3.26],
      ],
    });
    expect(analyser('', 3)).toEqual({ a: 0, b: 3, s: [] });
  });
});

describe('calendrier des mots', () => {
  it('poids : les voyelles ne comptent pas, au moins 1', () => {
    expect(poids('.')).toBe(1);
    expect(poids('ab')).toBe(2);
  });
  it('sans silence : les mots se suivent sans trou ni chevauchement sur tout le son utile', () => {
    const liste = ['aaaa', 'bb', 'cccccc'];
    const p = calendrier(liste, { a: 0.1, b: 3.1, s: [] });
    expect(p[0]![0]).toBeCloseTo(0.1);
    expect(p[2]![1]).toBeCloseTo(3.1);
    for (let i = 1; i < p.length; i++) expect(p[i]![0]).toBeCloseTo(p[i - 1]![1]);
    expect(p[2]![1] - p[2]![0]).toBeGreaterThan(p[0]![1] - p[0]![0]);
  });
  it('un silence par virgule arabe : le calage suit les membres de phrase', () => {
    const virgule = String.fromCharCode(0x60c);
    const liste = ['aa', `bb${virgule}`, 'cc', 'dd'];
    const p = calendrier(liste, { a: 0, b: 6, s: [[2, 3]] });
    expect(p[1]![1]).toBeCloseTo(2);
    expect(p[2]![0]).toBeCloseTo(3);
    expect(motActif(p, 2.5)).toBe(-1);
    expect(motActif(p, 0.1)).toBe(0);
    expect(motActif(p, 5.9)).toBe(3);
  });
  it('les passages de l’attestation : un par membre de phrase, de mot en mot, sans trou', () => {
    const el = trouver(priere.sections, 'S5.w.tashahhud')!;
    const m = mots(el.ar!);
    const ps = passages(m);
    expect(ps.length).toBeGreaterThan(4);
    expect(ps[0]![0]).toBe(0);
    expect(ps[ps.length - 1]![1]).toBe(m.length - 1);
    for (let i = 1; i < ps.length; i++) expect(ps[i]![0]).toBe(ps[i - 1]![1] + 1);
    expect(calageParDefaut(10).b).toBeGreaterThan(9);
  });
});

describe('compteur du tasbīḥ : 33 · 33 · 33 + 1', () => {
  const s6 = priere.sections.find((s) => s.id === 'S6');
  const items = animation.apres.compteur.map((id) => trouver(s6, id)!);
  const fois = items.map((e) => repetitions(e));
  it('les nombres viennent du livre : 3, 1, 33, 33, 33, 1 ; la centaine fait 100', () => {
    expect(items.every(Boolean)).toBe(true);
    expect(fois).toEqual([3, 1, 33, 33, 33, 1]);
    const c = animation.apres.centaine.map((id) => repetitions(trouver(s6, id)!));
    expect(c.reduce((a, b) => a + b, 0)).toBe(100);
    expect(repetitions({ repetition: '33 fois' })).toBe(33);
    expect(repetitions({})).toBe(1);
  });
  it('un toucher compte ; la série finie, on passe à la suivante ; on peut annuler et revenir', () => {
    let s = etatInitial(fois.length);
    for (let i = 0; i < 2; i++) {
      expect(toucher(s, fois).fin).toBe(false);
      s = toucher(s, fois).etat;
    }
    expect(s.n).toBe(2);
    const dernier = toucher(s, fois);
    expect(dernier.fin).toBe(true);
    s = dernier.etat;
    expect(toucher(s, fois).etat).toBe(s); // série finie : rien de plus
    s = suivante(s, fois);
    expect([s.et, s.n]).toEqual([1, 0]);
    s = annuler(s);
    expect(s.n).toBe(0);
    s = allerCompteur(s, 0, fois); // série finie : on repart de zéro
    expect([s.et, s.n]).toEqual([0, 0]);
    s = allerCompteur(s, 1, fois);
    expect(toucher(s, fois).fin).toBe(true); // « Tu es la Paix » : une fois
  });
  it('33 touchers terminent « gloire à Allah » ; le total sur 100 monte avec les trois séries et la phrase finale', () => {
    let s = { ...etatInitial(fois.length), et: 2 };
    for (let i = 0; i < 33; i++) s = toucher(s, fois).etat;
    expect(s.n).toBe(33);
    expect(toucher(s, fois).fin).toBe(false);
    const dans = animation.apres.compteur.map((id) => animation.apres.centaine.includes(id));
    expect(totalFait(s, dans)).toBe(33);
  });
  it('vibration courte si l’appareil le permet, rien sinon', () => {
    const vibrate = vi.fn();
    vi.stubGlobal('navigator', { vibrate, userActivation: { hasBeenActive: true } });
    vibrer(12);
    vibrer([30, 60, 30]);
    expect(vibrate).toHaveBeenNthCalledWith(1, 12);
    expect(vibrate).toHaveBeenNthCalledWith(2, [30, 60, 30]);
    vi.stubGlobal('navigator', {});
    expect(() => vibrer(12)).not.toThrow();
    vi.unstubAllGlobals();
  });
});

describe('progression de l’élève', () => {
  const plan = {
    sections: [{ id: 'S1' }, { id: 'S2' }, { id: 'S3' }],
    unites: { S1: ['S1'], S2: ['a', 'b'], S3: ['S3'] },
  } as unknown as Plan;
  it('une section est faite quand toutes ses unités sont vues ; « ici » est la première qui reste', () => {
    let vus: string[] = [];
    expect(ici(stations(plan, vus))).toBe('S1');
    vus = ['S1', 'a'];
    const st = stations(plan, vus);
    expect(st.map((x) => x.fait)).toEqual([true, false, false]);
    expect(st[1]).toMatchObject({ n: 1, total: 2 });
    expect(ici(st)).toBe('S2');
    expect(ici(stations(plan, ['S1', 'a', 'b', 'S3']))).toBeNull();
  });
  it('marquer vu est idempotent', () => {
    const p = { vus: [] as string[], genre: 'homme' as const, trad: true, entr: {} };
    const a = marquerVu(p, 'x');
    expect(a.vus).toEqual(['x']);
    expect(marquerVu(a, 'x')).toBe(a);
  });
  it('gardée sur l’appareil, par profil, comme les autres progressions', async () => {
    const p = {
      vus: ['S5.e1'],
      genre: 'femme' as const,
      trad: false,
      entr: { fatiha: { niveau: 2, revision: '2026-10-28' } },
    };
    await ecrireProgres('profil-1', p);
    expect(await lireProgres('profil-1')).toEqual(p);
    expect((await lireProgres('profil-2')).vus).toEqual([]);
    expect((await lireProgres(null)).genre).toBe('homme');
  });
  it('les unités du plan viennent du livre : sections, étapes, situations, sourates', () => {
    const plan2 = statique('plan.json') as unknown as Plan;
    expect(plan2.sections.map((s) => s.id)).toEqual(priere.sections.map((s) => s.id));
    expect(plan2.unites.S5).toHaveLength(18);
    expect(plan2.unites.S2).toHaveLength(11);
    expect(plan2.unites.S6).toEqual(animation.apres.compteur);
    expect(plan2.unites.S7).toHaveLength(10);
    expect(plan2.unites.S8).toHaveLength(sourates.sourates.length);
    expect(plan2.unites.S1).toEqual(['S1']);
  });
});

describe('chorégraphie (animation.json) cohérente avec le livre', () => {
  const POSES = ['debout', 'takbir', 'ruku', 'releve', 'sujud', 'assise', 'tashahhud', 'salam'];
  const s = (id: string) => priere.sections.find((x) => x.id === id);
  const etapes5 = (trouver(s('S5'), 'S5.subh')?.etapes ?? []) as Element[];
  it('chaque étape du pas à pas a sa position et son unité ; les positions existent', () => {
    expect(etapes5.map((e) => e.id).sort()).toEqual(Object.keys(animation.pas.etapes).sort());
    for (const [id, a] of Object.entries(animation.pas.etapes)) {
      expect(POSES, id).toContain(a.pose);
      expect(a.rakaa).toBeGreaterThanOrEqual(1);
      expect(a.rakaa).toBeLessThanOrEqual(animation.pas.rakaat);
      for (const p of a.suite ?? []) expect(POSES).toContain(p);
    }
  });
  it('la vidéo : étapes, paroles et sourates existent ; elle chaîne les deux unités ; le Coran passe par Ayyūb', () => {
    const v = animation.video;
    expect(new Set(v.beats.map((b) => b.r))).toEqual(new Set([1, 2]));
    for (const b of v.beats) {
      expect(POSES).toContain(b.pose);
      expect(
        etapes5.some((e) => e.id === b.etape),
        b.etape,
      ).toBe(true);
      for (const id of b.paroles ?? []) expect(trouver(s('S5'), id), id).toBeTruthy();
      if (b.coran) expect(refsAyyub(trouver(s('S5'), b.coran)?.audio).length).toBeGreaterThan(0);
    }
    expect(trouver(s('S5'), 'S5.w.takbir')).toBeTruthy();
    for (const n of Object.values(v.sourates))
      expect(
        sourates.sourates.some((x) => x.numero === n),
        String(n),
      ).toBe(true);
    // première unité avant la seconde, jamais l'inverse
    const rs = v.beats.map((b) => b.r);
    expect(rs).toEqual([...rs].sort());
  });
  it('les gestes des ablutions : une entrée par étape ; le « ×3 » n’est mis que là où le livre parle de trois fois', () => {
    const e2 = (trouver(s('S2'), 'S2A.etapes')?.etapes ?? []) as Element[];
    expect(e2.map((e) => e.id).sort()).toEqual(Object.keys(animation.ablutions).sort());
    const GESTES = [
      'intention',
      'mains',
      'bouche',
      'nez',
      'visage',
      'bras',
      'tete',
      'oreilles',
      'pieds',
      'invocation',
    ];
    for (const e of e2) {
      const a = animation.ablutions[e.id]!;
      expect(GESTES).toContain(a.geste);
      if ((a.fois ?? 1) > 1) expect(/trois|troisi/i.test(e.geste ?? ''), e.id).toBe(true);
    }
  });
  it('la tête : illustration de l’homme seulement, la règle de la femme est donnée par le texte du livre', () => {
    const a = animation.ablutions['S2A.e8']!;
    expect(a.homme_seulement).toBe(true);
    const regle = trouver(s('S2'), a.regle!);
    expect(regle?.fr).toBeTruthy();
  });
  it('situations, pictogrammes, entraînement, après la prière : tous les identifiants existent', () => {
    const sit = (s('S7')?.sous_sections ?? []) as Element[];
    expect(sit.map((x) => x.id).sort()).toEqual(Object.keys(animation.situations).sort());
    for (const id of Object.keys(animation.pictos))
      expect(trouver(priere.sections, id), id).toBeTruthy();
    for (const x of animation.entrainement)
      expect(trouver(s('S5'), x.parole), x.parole).toBeTruthy();
    for (const id of [...animation.apres.compteur, ...animation.apres.suite])
      expect(trouver(s('S6'), id), id).toBeTruthy();
    expect(Object.keys(animation.accueil.stations).sort()).toEqual(
      priere.sections.map((x) => x.id).sort(),
    );
    expect(trouver(priere.sections, animation.accueil.citation)).toBeTruthy();
  });
});

describe('niveaux et voix : chaque code des données a son affichage', () => {
  const codes = new Set<string>();
  parcourir(priere.sections, (o) => {
    for (const n of Array.isArray(o.niveau) ? o.niveau : o.niveau ? [o.niveau] : [])
      if (n && typeof n === 'object' && 'code' in n)
        codes.add(String((n as { code: string }).code));
  });
  const css = lire('./priere.css');
  it('chaque code de niveau présent dans les données a une pastille (classe, règle de style et libellé)', () => {
    expect(codes.size).toBeGreaterThan(4);
    expect(codes.has('HARAM')).toBe(true);
    for (const c of codes) {
      const classe = CLASSE_NIVEAU[c];
      expect(classe, `code ${c} sans affichage`).toBeTruthy();
      expect(css.includes(`.priere .pastille.${classe}`), `${c} → .${classe} sans style`).toBe(
        true,
      );
      expect(priere.meta.niveaux[c], `${c} sans libellé`).toBeTruthy();
    }
    // tous les codes déclarés par le référent sont aussi couverts
    for (const c of Object.keys(priere.meta.niveaux)) expect(CLASSE_NIVEAU[c], c).toBeTruthy();
  });
  it('les niveaux doubles montrent les deux pastilles ; « interdit » a sa couleur', () => {
    const html = render(Pastilles, {
      props: {
        niveau: [
          { code: 'MANDUB', libelle: 'recommandé' },
          { code: 'JAIZ', libelle: 'permis' },
        ],
      },
    }).body;
    expect((html.match(/class="pastille /g) ?? []).length).toBe(2);
    expect(html).toContain('data-niveau="MANDUB"');
    expect(html).toContain('data-niveau="JAIZ"');
    const h = render(Pastilles, { props: { niveau: { code: 'HARAM', libelle: 'interdit' } } }).body;
    expect(h).toContain('pastille interdit');
  });
  it('« interdit » est lisible en clair et en sombre (contraste ≥ 4,5:1 sur la carte et le fond)', () => {
    const lum = (hex: string) => {
      const v = [1, 3, 5]
        .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
      return 0.2126 * v[0]! + 0.7152 * v[1]! + 0.0722 * v[2]!;
    };
    const ratio = (a: string, b: string) =>
      (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
    const val = (bloc: string, v: string) =>
      new RegExp(`${v}:\\s*(#[0-9a-fA-F]{6})`).exec(bloc)?.[1] ?? '';
    const clair = css.slice(0, css.indexOf(":root[data-mode='sombre']"));
    const sombre = css.slice(
      css.indexOf(":root[data-mode='sombre']"),
      css.indexOf('@media (prefers-color-scheme: dark)'),
    );
    for (const bloc of [clair, sombre]) {
      const it = val(bloc, '--interdit');
      expect(it).toMatch(/^#/);
      expect(ratio(it, val(bloc, '--carte'))).toBeGreaterThanOrEqual(4.5);
      expect(ratio(it, val(bloc, '--fond'))).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('la voix : une ligne par cas, haute ou basse (le takbīr d’entrée et les autres takbīr se distinguent)', () => {
    const takbir = trouver(priere.sections, 'S5.w.takbir')!;
    const l = lignesVoix(takbir.voix);
    expect(l).toHaveLength(2);
    expect(l[0]!.haute).toBe(true);
    expect(l[0]!.basse).toBe(false);
    expect(l[1]!.haute && l[1]!.basse).toBe(true);
    expect(lignesVoix('basse')).toEqual([{ texte: 'basse', haute: false, basse: true }]);
    expect(lignesVoix(undefined)).toEqual([]);
  });
});

describe('arabe sur sa propre ligne, statut du référent, aucun texte en dur', () => {
  const sources = (dir: string, re: RegExp): string[] =>
    readdirSync(ici_(dir)).filter((f) => re.test(f) && !f.endsWith('.test.ts'));
  it('un texte français qui cite de l’arabe est découpé : l’arabe passe sur sa ligne, le ﷺ reste', () => {
    const el = trouver(priere.sections, 'S2A.tete.femme')!;
    const ar = el.textes![0]!.ar;
    const m = decouper(`Il dit « ${ar} » puis ﷺ.`);
    expect(m.some((x) => 'ar' in x && x.ar === ar)).toBe(true);
    expect(m.filter((x) => 'fr' in x).every((x) => !AR.test((x as { fr: string }).fr))).toBe(true);
    expect(JSON.stringify(m)).toContain('ﷺ');
  });
  it('aucun champ français du livre ne mêle l’arabe au français', () => {
    const mel: string[] = [];
    parcourir(priere.sections, (o) => {
      for (const k of ['fr', 'geste', 'sens', 'note', 'intro', 'explication', 'autres_ecoles'])
        if (typeof o[k] === 'string' && AR.test(o[k] as string)) mel.push(`${String(o.id)}.${k}`);
    });
    expect(mel).toEqual([]);
  });
  it('le statut du référent est celui des données, affiché sur chaque écran', () => {
    expect(priere.meta.statut).toMatch(/^Tranché par le référent/);
    expect(priere.meta.statut).toMatch(/En attente de relecture\.$/);
    for (const s of priere.sections) expect(s.statut).toBe(priere.meta.statut);
    const shell = lire('./Priere.svelte');
    expect(shell).toContain('plan?.meta.statut');
    expect(shell).toContain('data-testid="priere-statut"');
  });
  it('aucun texte arabe écrit dans le code du parcours (ni dans les textes de l’interface)', () => {
    for (const f of [
      ...sources('.', /\.(svelte|ts|css)$/),
      'textes-fr.json',
      'textes-carte-fr.json',
    ])
      expect(AR.test(lire(`./${f}`)), f).toBe(false);
    for (const f of ['priere-donnees.mjs', 'priere-audio.mjs', 'priere-calage.mjs'])
      expect(AR.test(lire(`../../../scripts/${f}`)), f).toBe(false);
  });
  it('aucune normalisation Unicode, aucune transcription latine des paroles dans l’interface', () => {
    for (const f of sources('.', /\.(svelte|ts)$/))
      expect(lire(`./${f}`), f).not.toMatch(/\.normalize\(/);
    const ui = JSON.stringify(textes);
    expect(ui).not.toMatch(/Allāhu|akbar|subḥān|ʿalaykum|bismi|lā ilāha|alḥamdu/i);
  });
  it('aucune silhouette ne dessine de visage : ni œil, ni bouche, ni nez dans les moteurs', () => {
    for (const f of ['silhouette.ts', 'SilhouetteVue.svelte'])
      expect(lire(`./${f}`)).not.toMatch(/\b(oeil|eye|yeux|bouche|mouth|nez|nose|sourcil)\b/i);
    // l'ovale du visage est sans trait : un seul élément « sil-visage », jamais de trait de visage
    expect(lire('./silhouette.ts')).toContain("class: 'sil-visage'");
  });
  it('les cibles de toucher sont d’au moins 44 px (règles de style)', () => {
    const css = lire('./priere.css');
    for (const sel of [
      '.priere .btn',
      '.priere .puce',
      '.priere .rond.petit',
      '.priere .ruban button',
      '.priere .frise-dhikr button',
      '.priere .ibtn',
      '.priere .seg button',
    ])
      expect(css.includes(sel), sel).toBe(true);
    expect(css).toMatch(/\.priere \.rond\.petit \{\s*width: 46px;\s*height: 46px;/);
    expect(css).toMatch(/\.priere \.ibtn \{\s*width: 44px;\s*height: 44px;/);
    expect(css).toMatch(/\.priere \.mot\.masque \{[^}]*min-width: 44px;\s*min-height: 44px;/);
    expect(css).toMatch(/prefers-reduced-motion: reduce/);
  });
});

describe('chargement à la demande : rien dans la coquille de l’élève', () => {
  const web = (rel: string) => lire(`../../../${rel}`);
  it('construction, service worker et budget connaissent le parcours (groupe à la demande, garde de poids dédiée)', () => {
    expect(web('vite.config.ts')).toContain('priereALaDemande');
    expect(web('vite.config.ts')).toMatch(/lib\\\/priere\\\//);
    expect(web('scripts/groupes.mjs')).toContain("'/vivre/priere'");
    expect(web('scripts/groupes.mjs')).toMatch(/lib\\\/priere\\\/carte/);
    const sw = web('src/service-worker.ts');
    expect(sw).toContain("p.startsWith('/priere-data/')");
    expect(sw).toContain('!isPriere(f)');
    expect(sw).toContain('/_app/priere.json');
    const b = web('scripts/budget.mjs');
    expect(b).toContain('BUDGET_PRIERE');
    expect(b).toContain('BUDGET_PRIERE_DONNEES');
    expect(b).toContain('MARGE_ELEVE_MIN');
  });
  it('seuls l’interrupteur et deux imports dynamiques touchent le parcours hors de lib/priere', () => {
    const vivre = web('src/routes/vivre/+page.svelte');
    expect(vivre).toContain("import('$lib/priere/carte')");
    expect(vivre).not.toMatch(/from '\$lib\/priere/);
    const page = web('src/routes/vivre/priere/+page.svelte');
    expect(page).toContain("import('$lib/priere')");
    expect(page).not.toMatch(/from '\$lib\/priere/);
    expect(page).toContain("fn('parcours_priere')");
  });
  it('les moteurs animés et chaque écran sont chargés à l’appel, jamais ensemble', () => {
    expect(lire('./SilhouetteVue.svelte')).toContain("import('./silhouette')");
    expect(lire('./AblutionVue.svelte')).toContain("import('./ablution')");
    for (const f of ['SilhouetteVue.svelte', 'AblutionVue.svelte'])
      expect(lire(`./${f}`)).not.toMatch(/^\s*import \{[^}]*\} from '\.\/(silhouette|ablution)';/m);
    const shell = lire('./Priere.svelte');
    for (const e of [
      'Accueil',
      'PasAPas',
      'Video',
      'Ablutions',
      'Sourate',
      'Entrainement',
      'Situations',
      'Apres',
    ])
      expect(shell).toContain(`import('./${e}.svelte')`);
  });
  it('la Fātiḥa : les données ne sont lues qu’à la demande de l’écran (aucune donnée du référent dans le code)', () => {
    for (const f of readdirSync(ici_('.')).filter(
      (x) => /\.(svelte|ts)$/.test(x) && !x.endsWith('.test.ts'),
    ))
      expect(lire(`./${f}`), f).not.toMatch(/(import|from)[^;\n]*priere\.json/);
  });
});
