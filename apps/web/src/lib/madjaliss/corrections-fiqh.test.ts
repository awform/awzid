import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AUDIO_MANIFESTE,
  portionDuSens,
  SENS_TAFSIR,
  SORTIE,
  SORTIE_PROTEGEE,
  SOURCES,
  sensTafsirDe,
  tanzil,
} from '../../../scripts/madjaliss.mjs';
import { decider, deciderAudio, ROLE_BETA, type CompteMutun } from '../server/mutun-acces';
import { COMPTE_TOUT_VOIR } from '@awform/school/tout-voir';
import { matnPour, type Matn, type PartieDifferee } from './donnees';

/**
 * Corrections de contenu du 2/11/2026 (référent) : F3 sens des versets cités, F2 « عليه وسلم » chez an-Nawawī, F4 libellé de
 * statut, Ibn ʿĀshir (croyance différée) jamais montrée aux invités, et le test des adultes.
 */
const lire = <T>(p: string) => JSON.parse(readFileSync(p, 'utf8')) as T;
const fichiers = (dir: string, re: RegExp) =>
  readdirSync(dir)
    .filter((f) => re.test(f))
    .sort()
    .map((f) => join(dir, f));
/** Tous les objets d'un JSON (parcours en profondeur), avec la clé qui les porte. */
function parcourir(x: unknown, f: (o: Record<string, unknown>) => void) {
  if (Array.isArray(x)) for (const v of x) parcourir(v, f);
  else if (x && typeof x === 'object') {
    f(x as Record<string, unknown>);
    for (const v of Object.values(x)) parcourir(v, f);
  }
}

interface Citation {
  id: string;
  fichier: string;
  refs: string[];
  q: Array<{ q: string; ref: string }>;
  sens: Array<{ ref: string; texte: string; source: string; extrait?: true }>;
}
/** « 23:5-6 » → 23:5 et 23:6. */
const developper = (ref: string) => {
  const m = /^(\d+):(\d+)-(\d+)$/.exec(ref);
  if (!m) return [ref];
  return Array.from(
    { length: Number(m[3]) - Number(m[2]) + 1 },
    (_, i) => `${m[1]}:${Number(m[2]) + i}`,
  );
};
/** Toutes les phrases (fichiers publics ET gardés) qui citent un verset de Tanzil (segment `q`, ou liste `q` d'un hadith). */
function citations(): Citation[] {
  const sortie = new Map<string, Citation>();
  const dossiers = [...fichiers(SORTIE, /\.json$/), ...fichiers(SORTIE_PROTEGEE, /\.json$/)];
  for (const f of dossiers) {
    parcourir(lire(f), (o) => {
      if (typeof o.id !== 'string' || !/^[A-Z]{3}-/.test(o.id)) return;
      const q: Array<{ q: string; ref: string }> = [];
      if (Array.isArray(o.ar))
        for (const s of o.ar) if (s && typeof s === 'object' && 'q' in s) q.push(s as never);
      if (Array.isArray(o.q)) for (const s of o.q) q.push(s as never);
      if (!q.length) return;
      const ancien = sortie.get(o.id);
      const c: Citation = {
        id: o.id,
        fichier: f,
        refs: q.flatMap((s) => developper(s.ref)),
        q,
        sens: (o.sens as Citation['sens']) ?? [],
      };
      // la même phrase peut figurer dans un fichier public et dans un fichier gardé : on garde la version AVEC sens
      if (!ancien || (!ancien.sens.length && c.sens.length)) sortie.set(o.id, c);
    });
  }
  return [...sortie.values()];
}

describe('F3 : un verset cité a toujours son sens', () => {
  const toutes = citations();
  const source = lire<{
    versets: Record<string, { fichier: string; sens: string }>;
    phrases: Record<string, Array<{ ref: string; texte: string; extrait?: true }>>;
  }>(SENS_TAFSIR);

  it('chaque phrase qui cite un verset (public et gardé) montre le sens de chaque verset cité', () => {
    expect(toutes.length).toBeGreaterThanOrEqual(42);
    for (const c of toutes) {
      expect(c.sens.length, `${c.id} (${c.fichier}) : verset cité sans sens`).toBeGreaterThan(0);
      const vus = new Set(c.sens.flatMap((s) => developper(s.ref)));
      for (const r of c.refs) expect(vus.has(r), `${c.id} : sens de ${r}`).toBe(true);
      for (const s of c.sens) {
        expect(s.texte.trim().length, `${c.id} ${s.ref}`).toBeGreaterThan(3);
        expect(s.texte, `${c.id} ${s.ref}`).not.toMatch(/[؀-ۿ]|\[(?:TRADUCTION|À INSÉRER)/);
      }
    }
  });

  it('les phrases signalées par le référent y sont (RIS-0392, RIS-0672 à 0684, AKH-0015) avec le sens du tafsīr', () => {
    const ids = new Map(toutes.map((c) => [c.id, c]));
    expect(ids.get('AKH-0015')!.sens[0]!.ref).toBe('9:62');
    for (const id of ['RIS-0392', ...Array.from({ length: 13 }, (_, i) => `RIS-0${672 + i}`)]) {
      const c = ids.get(id);
      if (!c) continue; // RIS-0673 ne cite pas de verset
      expect(
        c.sens.every((s) => s.source === 'tafsir_awzid'),
        id,
      ).toBe(true);
    }
    expect(ids.get('RIS-0392')!.sens[0]).toMatchObject({ ref: '24:59', extrait: true });
    expect(ids.get('RIS-0672')!.sens[0]!.texte).toBe(
      '… ils Le glorifient et se prosternent devant Lui.',
    );
    // verset cité en entier : le sens entier, sans coupure ni libellé « passage cité »
    expect(ids.get('RIS-0675')!.sens[0]).toEqual({
      ref: '16:50',
      texte:
        'ils craignent leur Seigneur, au-dessus d’eux, et font ce qui leur est ordonné.'.replace(
          '’',
          "'",
        ),
      source: 'tafsir_awzid',
    });
  });

  it('chaque sens du tafsīr est le sens validé du verset (entier) ou une portion EXACTE de ce sens', () => {
    const phrases = Object.entries(source.phrases);
    expect(phrases.length).toBe(27);
    for (const [id, entrees] of phrases)
      for (const e of entrees) {
        const v = source.versets[e.ref]!;
        expect(v, `${id} ${e.ref}`).toBeTruthy();
        if (e.extrait) expect(v.sens.includes(portionDuSens(e.texte)), `${id} ${e.ref}`).toBe(true);
        else expect(e.texte, `${id} ${e.ref}`).toBe(v.sens);
      }
    // ce qui est servi est ce qui est dans la source
    const parId = new Map(toutes.map((c) => [c.id, c]));
    for (const [id, entrees] of phrases)
      expect(
        parId.get(id)!.sens.map((s) => [s.ref, s.texte, s.extrait ?? false]),
        id,
      ).toEqual(entrees.map((e) => [e.ref, e.texte, e.extrait ?? false]));
  });

  it('l’arabe cité reste Tanzil octet pour octet (aucune normalisation)', () => {
    const lignes = tanzil();
    for (const c of toutes)
      for (const s of c.q) {
        // une plage « 23:5-6 » : les versets se suivent (séparés par une espace)
        const texte = developper(s.ref)
          .map((r) => lignes.get(r) ?? '')
          .join(' ');
        const ok = texte.includes(s.q);
        expect(ok, `${c.id} ${s.ref}`).toBe(true);
      }
  });

  it('la construction refuse un sens qui n’est pas celui du tafsīr, un verset non cité, ou un sens en double', () => {
    const src = {
      versets: {
        '24:59': { sens: 'Et quand les enfants atteignent la puberté, qu’ils demandent.' },
      },
      phrases: {
        A: [
          {
            ref: '24:59',
            texte: 'Et quand les enfants atteignent la puberté …',
            extrait: true as const,
          },
        ],
        B: [
          {
            ref: '24:59',
            texte: 'Et quand les enfants deviennent grands …',
            extrait: true as const,
          },
        ],
        C: [{ ref: '24:59', texte: 'autre chose' }],
      },
    };
    const phrase = { ar: ['x', { q: 'y', ref: '24:59' }] };
    expect(sensTafsirDe('A', phrase, src)![0]).toMatchObject({ ref: '24:59', extrait: true });
    expect(sensTafsirDe('inconnue', phrase, src)).toBeNull();
    expect(() => sensTafsirDe('B', phrase, src)).toThrow(/différent du sens validé/);
    expect(() => sensTafsirDe('C', phrase, src)).toThrow(/différent du sens validé/);
    expect(() => sensTafsirDe('A', { ar: ['x'] }, src)).toThrow(/non cité/);
    expect(() => sensTafsirDe('A', { ...phrase, sens: [{}] }, src)).toThrow(/déjà un sens/);
  });
});

describe('F2 : an-Nawawī, « عليه وسلم » sans espace après le wāw', () => {
  const ESPACE = 'عليه و سلم';
  const COLLE = 'عليه وسلم';
  const ar = lire<Record<string, unknown>>(join(SOURCES, 'nawawi40', 'texte_ar.json'));

  it('plus aucune forme espacée dans les textes de Nawawī (source et fichiers servis)', () => {
    const reste: string[] = [];
    // seules exceptions : les traces d'audit « avant_* » (état avant la correction du 18/10, gardé tel quel)
    const visiter = (x: unknown, cle = '') => {
      if (typeof x === 'string') {
        if (x.includes(ESPACE) && !cle.startsWith('avant_')) reste.push(cle);
      } else if (Array.isArray(x)) for (const v of x) visiter(v, cle);
      else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) visiter(v, k);
    };
    visiter(ar);
    expect(reste).toEqual([]);
    for (const f of [join(SORTIE, 'nawawi.json'), join(SORTIE_PROTEGEE, 'nawawi-enseignant.json')])
      expect(readFileSync(f, 'utf8').includes(ESPACE), f).toBe(false);
  });

  it('les deux traces « avant_* » gardent l’ancienne forme (elles décrivent l’état d’avant)', () => {
    const brut = readFileSync(join(SOURCES, 'nawawi40', 'texte_ar.json'), 'utf8');
    expect(brut.split(ESPACE).length - 1).toBe(2);
  });

  it('la forme collée est servie à l’élève et les voyelles restent celles de la source', () => {
    const servi = lire<{ phrases: Array<{ id: string; ar?: string }> }>(
      join(SORTIE, 'nawawi.json'),
    );
    const h1 = servi.phrases.find((p) => p.id === 'NAW-H02')!;
    expect(h1.ar).toContain(COLLE);
    expect(h1.ar).toContain('رَسُولِ اللَّهِ صلى الله عليه وسلم');
    expect(servi.phrases.filter((p) => p.ar?.includes(COLLE)).length).toBeGreaterThan(20);
  });
});

describe('F4 : le libellé VALIDATION_HUMAINE_REQUISE n’existe plus', () => {
  const ANCIEN = 'VALIDATION_HUMAINE_REQUISE';
  const NOUVEAU = 'EN_ATTENTE_SECONDE_LECTURE';

  it('aucune occurrence dans les sources des Madjaliss ni dans les fichiers servis', () => {
    const touches: string[] = [];
    const parcours = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) parcours(p);
        else if (/\.(json|md|tsv)$/.test(f) && readFileSync(p, 'utf8').includes(ANCIEN))
          touches.push(p);
      }
    };
    parcours(SOURCES);
    parcours(SORTIE);
    parcours(SORTIE_PROTEGEE);
    expect(touches).toEqual([]);
  });

  it('chaque texte servi porte le libellé « en attente de seconde lecture »', () => {
    for (const f of fichiers(SORTIE, /^(?!risala-).*\.json$/)) {
      const d = lire<{ statut?: string }>(f);
      if (d.statut !== undefined) expect(d.statut, f).toBe(NOUVEAU);
    }
  });

  it('l’élève ne voit que le texte « en attente de relecture », jamais un code ni un mot « savant »', () => {
    const dir = join(SORTIE, '..', 'i18n');
    for (const l of ['fr-madjaliss', 'en', 'ar', 'de', 'es']) {
      const c = lire<Record<string, string>>(join(dir, `${l}.json`));
      for (const cle of ['mj.statut', 'mj.beta_relecture']) {
        expect(c[cle], `${l} ${cle}`).toBeTruthy();
        expect(c[cle], `${l} ${cle}`).not.toMatch(
          /VALIDATION|EN_ATTENTE|_REQUISE|savant|scholar|Gelehrte|erudito|عالم/i,
        );
      }
    }
    for (const f of fichiers(join(SORTIE, '..', 'i18n'), /\.json$/))
      expect(readFileSync(f, 'utf8').includes(ANCIEN), f).toBe(false);
  });

  // Le registre des livres (mutun.json, fiqh.json) n'est pas dans le dépôt : il vit dans la source du PC et dans la copie
  // `~/awform-content` (infra/sync-content.ps1). Contrôle facultatif : AWFORM_REGISTRE=<dossier registre>.
  const registre = process.env.AWFORM_REGISTRE;
  it.skipIf(!registre || !existsSync(registre))(
    'registre des livres (AWFORM_REGISTRE) : plus aucun statut VALIDATION_HUMAINE_REQUISE',
    () => {
      for (const f of ['mutun.json', 'fiqh.json']) {
        const d = lire<Record<string, { statut?: string }>>(join(registre!, f));
        const anciens = Object.entries(d).filter(([, v]) => v.statut === ANCIEN);
        expect(
          anciens.map(([k]) => k),
          f,
        ).toEqual([]);
      }
      expect(
        Object.values(
          lire<Record<string, { statut: string }>>(join(registre!, 'mutun.json')),
        ).every((v) => v.statut === NOUVEAU),
      ).toBe(true);
    },
  );
});

describe('Ibn ʿĀshir, croyance différée (IBA-S02 à S10) : jamais montrée aux invités ni aux visiteurs', () => {
  const pub = lire<Matn>(join(SORTIE, 'ibn-ashir.json'));
  const diff = lire<PartieDifferee>(join(SORTIE_PROTEGEE, 'ibn-ashir-differe.json'));
  const idsDiffere = diff.phrases.map((p) => p.id);
  /** Ce qui identifie les vers différés : leurs hémistiches arabes et leurs traductions. */
  const aiguilles = diff.phrases.flatMap((p) => [
    ...((p as { h?: string[] }).h ?? []),
    ...(((p as { fr?: string }).fr ?? '').length > 30 ? [(p as { fr: string }).fr] : []),
  ]);

  const invite: CompteMutun = { account: { kind: 'parent', email: 'famille@exemple.org' } };
  const adulte: CompteMutun = { account: { kind: 'adulte', email: 'adulte@exemple.org' } };
  const invitePaye: CompteMutun = { ...adulte, roles: ['eleve_adulte'] };
  const eleveSession: CompteMutun = { ...invite, enfantSession: true };
  const tablette: CompteMutun = { ...invite, tablette: { classId: 'c1' } };
  const betaSansInterrupteur: CompteMutun = {
    account: { kind: 'adulte', email: 'ami@exemple.org' },
    roles: [ROLE_BETA],
    betaDiffere: false,
  };
  const betaSansRole: CompteMutun = { ...adulte, betaDiffere: true };
  const betaMfaEnAttente: CompteMutun = {
    ...adulte,
    roles: [ROLE_BETA],
    betaDiffere: true,
    mfaRequired: true,
    mfaVerified: false,
  };
  const autreAdmin: CompteMutun = {
    account: { id: 'autre-admin', kind: 'admin', email: 'admin2@exemple.org', totpEnabled: true },
    mfaRequired: true,
    mfaVerified: true,
    toutVoir: true, // drapeau forgé : seul le compte du client est accepté
  };
  const interdits: Array<[string, CompteMutun | null]> = [
    ['visiteur sans session', null],
    ['invité (parent)', invite],
    ['adulte ordinaire', adulte],
    ['adulte avec rôle d’élève', invitePaye],
    ['session d’enfant', eleveSession],
    ['tablette de classe', tablette],
    ['groupe bêta, interrupteur éteint', betaSansInterrupteur],
    ['indication bêta sans le rôle', betaSansRole],
    ['groupe bêta, second facteur non validé', betaMfaEnAttente],
  ];
  const autorises: Array<[string, CompteMutun]> = [
    [
      'groupe bêta (rôle + interrupteur)',
      {
        account: { kind: 'adulte', email: 'ami@exemple.org' },
        roles: [ROLE_BETA],
        betaDiffere: true,
      },
    ],
    [
      'compte « tout voir » du client',
      {
        account: {
          id: COMPTE_TOUT_VOIR,
          kind: 'admin',
          email: 'client@awzid.org',
          totpEnabled: true,
        },
        mfaRequired: true,
        mfaVerified: true,
        toutVoir: true,
      },
    ],
  ];

  it('le complément est annoncé, jamais contenu, dans le fichier public', () => {
    expect(diff.seances.map((s) => s.n)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(diff.phrases.length).toBe(43);
    expect(pub.differe).toEqual({ version: diff.version });
    expect(pub.seances.map((s) => s.n)).not.toEqual(expect.arrayContaining([2]));
    const pubIds = new Set(pub.phrases.map((p) => p.id));
    for (const id of idsDiffere) expect(pubIds.has(id), id).toBe(false);
  });

  it('le texte d’un vers différé (arabe, français) n’est dans aucun fichier public du site', () => {
    expect(aiguilles.length).toBeGreaterThan(80);
    const statique = join(SORTIE, '..');
    const trouves: string[] = [];
    const parcours = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) parcours(p);
        else if (statSync(p).size < 6_000_000 && /\.(json|js|html|svg|txt|webmanifest)$/.test(f)) {
          const s = readFileSync(p, 'utf8');
          if (aiguilles.some((a) => s.includes(a))) trouves.push(p);
        }
      }
    };
    parcours(statique);
    expect(trouves).toEqual([]);
  });

  it('aucun audio public n’existe pour une phrase différée', () => {
    const m = lire<{ fichiers: Record<string, { d: string }> }>(AUDIO_MANIFESTE);
    for (const id of idsDiffere) expect(m.fichiers[`ibn-ashir/${id}.mp3`], id).toBeUndefined();
  });

  it('le profil d’un invité (sans droit) ne reçoit aucune séance différée, quel que soit son âge', () => {
    for (const kind of ['enfant', 'ado', 'adulte', null] as const) {
      const m = matnPour(pub, kind, false, false);
      expect(m.seances.some((s) => s.differe || (s.n >= 2 && s.n <= 10))).toBe(false);
      expect(m.phrases.some((p) => idsDiffere.includes(p.id))).toBe(false);
    }
  });

  it.each(interdits)('%s : 401 ou 403 sur le fichier différé et sur son audio', (_nom, me) => {
    const attendu = me?.account ? 403 : 401;
    expect(decider('ibn-ashir-differe.json', me)).toBe(attendu);
    // audio : une session à moitié ouverte (second facteur exigé, non validé) est traitée comme sans session
    const demi = !me?.account || (me.mfaRequired && !me.mfaVerified);
    expect(deciderAudio('differe', me)).toBe(demi ? 401 : 403);
    expect(decider('ibn-ashir-enseignant.json', me)).toBe(attendu);
  });

  it('un autre administrateur (drapeau « tout voir » forgé) : le différé ordinaire oui (personnel), jamais « tout voir »', () => {
    expect(decider('ibn-ashir-differe.json', autreAdmin)).toBe(200);
    expect(decider('risala-tout.json', autreAdmin)).toBe(403);
  });

  it.each(autorises)('%s : le complément reste visible (comme aujourd’hui)', (_nom, me) => {
    expect(decider('ibn-ashir-differe.json', me)).toBe(200);
    expect(deciderAudio('differe', me)).toBe(200);
    expect(decider('ibn-ashir-enseignant.json', me)).toBe(me.toutVoir ? 200 : 403);
  });
});

describe('Test de positionnement des adultes : la série de Médine compte 3 tomes', () => {
  // data/eval/pos-ad.js n'est pas dans le dépôt (source du PC, hors du contenu copié sur la VM) : contrôle facultatif
  const pos = process.env.AWFORM_POS_AD;
  it.skipIf(!pos || !existsSync(pos))(
    'la source de l’application ne sert aucune correspondance « tome 4 »',
    () => {
      const s = readFileSync(pos!, 'utf8');
      expect(s).not.toMatch(/tome 4/i);
      expect(s).toContain('tome 3 → P4');
    },
  );
});
