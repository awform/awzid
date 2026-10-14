import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import {
  ARABE_LIGNE,
  CHAMPS_INTERNES,
  construire,
  departager,
  DIFFERE_CYCLE,
  PHRASE_INTERNE,
  PHRASE_INTERNE_RISALA,
  SORTIE,
  SORTIE_PROTEGEE,
  SOURCES,
  STATUT,
  TAILLE_PARTIE,
  tanzil,
  TRANSLIT,
  TEXTES,
  TEXTES_LOT4,
} from '../../../scripts/madjaliss.mjs';
import { ACTIFS, CYCLES, TOUT_DIFFERE } from './cycles';
import {
  arSimple,
  avecArabe,
  chargerPartie,
  matnPour,
  segments,
  texteVoixSynthese,
  voitDiffere,
  type Matn,
  type NotesEnseignant,
  type PartieMatn,
  type Phrase,
} from './donnees';
import { genererQuiz } from './quiz';

/**
 * Lot 4 : ar-Risāla d'Ibn Abī Zayd al-Qayrawānī (1 769 phrases, 164 séances) — servie en fichiers séparés chargés à la
 * demande (`risala.json` = sommaire, `risala-p<k>.json` = phrases), jamais dans le paquet de départ. Mêmes garanties
 * que les dix autres textes : arabe intact octet par octet, Coran identique à Tanzil et jamais lu par une voix de
 * synthèse, aucun champ ni mot interne chez l'élève, publication différée (cycle 3), niveau adulte masqué.
 */
const lire = <T>(p: string) => JSON.parse(readFileSync(p, 'utf8')) as T;
const octets = (s: string) => Buffer.from(s, 'utf8').toString('hex');
const LATIN = /[A-Za-zʿʾḥṣḍṭẓāīūṯḏġš]/;
const dir = join(SOURCES, 'risala');
const lignes = tanzil();

type SrcPhrase = {
  id: string;
  ar: string;
  type: string;
  chapitre: string;
  coran?: { sourate: number; verset: number; texte: string; voix_de_synthese?: boolean };
};
const srcAr = lire<{ statut: string; phrases: SrcPhrase[] }>(join(dir, 'texte_ar.json'));
const srcFr = lire<{
  statut_global: string;
  phrases: Array<{ id: string; niveau_min?: string; statut: string }>;
}>(join(dir, 'traduction_fr.json'));
const srcSe = lire<{
  statut: string;
  point_referent: string;
  seances: Array<{ id: string; phrases: string[]; cycle: number; titre: string }>;
}>(join(dir, 'seances.json'));

const brutIndex = readFileSync(join(SORTIE, 'risala.json'), 'utf8');
const index = JSON.parse(brutIndex) as Matn;
// lot 5 : notes de l'enseignant et parties de phrases sont des fichiers GARDÉS (servis après authentification)
const brutEns = readFileSync(join(SORTIE_PROTEGEE, 'risala-enseignant.json'), 'utf8');
const ens = JSON.parse(brutEns) as NotesEnseignant;
const parties = (index.parts ?? []).map(
  (p) =>
    JSON.parse(readFileSync(join(SORTIE_PROTEGEE, `risala-p${p.n}.json`), 'utf8')) as PartieMatn,
);
/** Le texte entier (index + toutes les parties), tel que le reconstitue l'application séance après séance. */
const complet: Matn = { ...index, phrases: parties.flatMap((p) => p.phrases) };
const de = new Map(complet.phrases.map((p) => [p.id, p]));

describe('ar-Risāla : données construites', () => {
  it('à jour avec les sources (node scripts/madjaliss.mjs) : sommaire, parties et notes de l’enseignant', () => {
    const { eleve, enseignant } = construire('risala', lignes);
    const d = departager(eleve as Parameters<typeof departager>[0]);
    expect(`${JSON.stringify(d.index)}\n`).toBe(brutIndex);
    expect(d.fichiers).toHaveLength(parties.length);
    d.fichiers.forEach((f, i) =>
      expect(`${JSON.stringify(f)}\n`).toBe(
        readFileSync(join(SORTIE_PROTEGEE, `risala-p${i + 1}.json`), 'utf8'),
      ),
    );
    expect(`${JSON.stringify(enseignant)}\n`).toBe(brutEns);
    // aucun fichier de partie en trop dans le dossier gardé, et AUCUN dans static/mutun (public)
    expect(readdirSync(SORTIE_PROTEGEE).filter((f) => /^risala-p\d+\.json$/.test(f))).toHaveLength(
      parties.length,
    );
    expect(readdirSync(SORTIE).filter((f) => /^risala/.test(f))).toEqual(['risala.json']);
  });

  it('1 769 phrases, 164 séances ; chaque phrase dans une séance une seule fois ; numéros 1…164', () => {
    expect(srcAr.phrases).toHaveLength(1769);
    expect(complet.phrases).toHaveLength(1769);
    expect(index.seances).toHaveLength(164);
    const toutes = index.seances.flatMap((s) => s.phrases);
    expect(toutes).toHaveLength(1769);
    expect(new Set(toutes).size).toBe(1769);
    expect(index.seances.map((s) => s.n)).toEqual(index.seances.map((_, i) => i + 1));
    expect(index.v).toBe(2);
    expect(index.id).toBe('risala');
    // le sommaire ne porte AUCUNE phrase : elles sont dans les parties
    expect(index.phrases).toEqual([]);
    // ordre du livre : les séances suivent l'ordre des phrases de la source
    expect(toutes).toEqual(srcAr.phrases.map((p) => p.id));
    expect(srcSe.seances.flatMap((s) => s.phrases)).toEqual(toutes);
    expect(index.seances.every((s) => s.duree >= 4 && s.duree <= 12)).toBe(true);
    expect(index.seances.every((s) => s.phrases.length >= 1 && s.phrases.length <= 12)).toBe(true);
  });

  it('parties : chaque séance dans une seule partie, phrases de la séance toutes dans sa partie, poids bornés', () => {
    expect(parties.length).toBeGreaterThanOrEqual(8);
    for (const s of index.seances) {
      const part = parties.find((p) => p.part === s.p);
      expect(part, `séance ${s.n}`).toBeDefined();
      const ids = new Set(part!.phrases.map((p) => p.id));
      for (const id of s.phrases) expect(ids.has(id), `${s.id} ${id}`).toBe(true);
    }
    // aucune phrase dans deux parties
    expect(new Set(parties.flatMap((p) => p.phrases.map((x) => x.id))).size).toBe(1769);
    for (const [i, p] of parties.entries()) {
      expect(p.part).toBe(i + 1);
      expect(index.parts![i]).toEqual({ n: i + 1, version: p.version });
      const o = Buffer.byteLength(JSON.stringify(p));
      // une partie dépasse la taille visée d'au plus une séance
      expect(o, `partie ${p.part}`).toBeLessThan(TAILLE_PARTIE + 60_000);
    }
    // le sommaire reste léger : il est chargé à l'ouverture du texte
    expect(Buffer.byteLength(brutIndex)).toBeLessThan(80_000);
  });

  it('statut EN_ATTENTE_SECONDE_LECTURE partout ; jamais « validation humaine » ni « validé par un comité »', () => {
    expect(index.statut).toBe(STATUT);
    expect(ens.statut).toBe(STATUT);
    expect(srcAr.statut).toBe(STATUT);
    expect(srcFr.statut_global).toBe(STATUT);
    expect(srcSe.statut).toBe(STATUT);
    for (const p of srcFr.phrases) expect(p.statut, p.id).toBe(STATUT);
    const tout = brutIndex + parties.map((p) => JSON.stringify(p)).join('') + brutEns;
    expect(tout).not.toMatch(
      /VALIDATION_HUMAINE|validation humaine|valid[ée]+ par (?:un|le) comité/i,
    );
  });

  it('texte arabe de l’auteur INTACT, octet par octet (jamais normalisé)', () => {
    let n = 0;
    for (const s of srcAr.phrases) {
      const p = de.get(s.id)!;
      expect(p, s.id).toBeDefined();
      n++;
      const rebati = segments(p)
        .map((x) => (typeof x === 'string' ? x : `\u{FD3F}${x.q}\u{FD3E}`))
        .join('');
      expect(octets(rebati), s.id).toBe(octets(s.ar));
    }
    expect(n).toBe(1769);
  });

  it('mots du Coran cités : sous-chaînes EXACTES de Tanzil, jamais lus par une voix de synthèse', () => {
    const avecCoran = srcAr.phrases.filter((p) => p.coran);
    expect(avecCoran).toHaveLength(24);
    for (const s of avecCoran) {
      const c = s.coran!;
      expect(c.voix_de_synthese, s.id).toBe(false);
      const ligne = lignes.get(`${c.sourate}:${c.verset}`)!;
      expect(Buffer.from(ligne, 'utf8').includes(Buffer.from(c.texte, 'utf8')), s.id).toBe(true);
      const p = de.get(s.id)!;
      expect(
        segments(p).some((x) => typeof x !== 'string' && x.q === c.texte),
        s.id,
      ).toBe(true);
      expect(texteVoixSynthese(p), s.id).toBeNull();
    }
    // aucun ornement coranique hors des segments cités
    for (const p of complet.phrases)
      if (typeof p.ar === 'string') expect(p.ar, p.id).not.toMatch(/[﴿﴾]/);
  });

  it('aucun champ interne ni mot du travail du projet chez l’élève ; l’arabe sans lettre latine ; pas d’arabe sur la ligne du français', () => {
    const tout = JSON.stringify(complet);
    for (const c of CHAMPS_INTERNES) expect(tout, c).not.toContain(`"${c}"`);
    const champs: string[] = [];
    for (const p of complet.phrases) {
      champs.push(p.fr ?? '', ...(p.notes ?? []).map((n) => n.texte));
      for (const n of p.notes ?? []) champs.push(...(n.sources ?? []));
    }
    champs.push(...index.seances.map((s) => s.titre));
    for (const c of champs) {
      expect(c).not.toMatch(PHRASE_INTERNE_RISALA);
      expect(c).not.toMatch(/\b(?:RIS|IBA|IZZ|AKH|ASH|JAZ|TUH|AJR)-(?:INT-)?\d{4}\b/);
      expect(c).not.toMatch(
        /referent|référent|comité|seconde lecture|turath|shamela|\.json|\.md\b/i,
      );
      expect(c).not.toMatch(/&quot;|&amp;/);
      expect(ARABE_LIGNE.test(c), c.slice(0, 80)).toBe(false);
    }
    // phrases de notes : même tri que les autres textes (aucune phrase interne ne survit)
    for (const p of complet.phrases)
      for (const n of p.notes ?? [])
        expect(PHRASE_INTERNE.test(n.texte), `${p.id} : ${n.texte.slice(0, 100)}`).toBe(false);
    // l'arabe : aucune lettre latine
    const arabes: string[] = [];
    for (const p of complet.phrases) {
      arabes.push(...segments(p).map((x) => (typeof x === 'string' ? x : x.q)));
      for (const n of p.notes ?? []) arabes.push(...(n.ar ?? []), ...(n.ma ?? []));
    }
    for (const a of arabes) expect(LATIN.test(a), a.slice(0, 80)).toBe(false);
    // mots arabes isolés : tous les marqueurs ont leur mot
    for (const p of complet.phrases)
      if (p.fr?.includes('{ar:')) expect(avecArabe(p.fr, p.ma)).not.toMatch(/\{ar:/);
  });

  it('mention d’affichage : texte unique du client ; sources citées sans lien de numérisation', () => {
    const notes = complet.phrases.flatMap((p) => p.notes ?? []);
    expect(notes.length).toBeGreaterThan(1000);
    expect(notes.filter((n) => n.sources?.length).length).toBeGreaterThan(900);
    for (const n of notes)
      for (const s of n.sources ?? []) expect(s).not.toMatch(/turath|lu le|\bscan\b/i);
    // écarts au mashhūr : les notes « école mālikite » portent leur source
    const malikite = notes.filter((n) => n.k === 'malikite');
    expect(malikite.length).toBeGreaterThanOrEqual(40);
    expect(malikite.every((n) => n.sources?.length)).toBe(true);
  });

  it('translittération latine dans le français affiché : plafond mesuré (jamais à relever), noms propres exceptés', () => {
    const estNom = (w: string) =>
      /^[ʿʾ'’]?[A-ZÀ-ÖḤṢḌṬẒĀĪŪ]/.test(w) ||
      w.split('-').some((p) => /^[ʿʾ'’]?[A-ZḤṢḌṬẒĀĪŪ]/.test(p));
    let n = 0;
    const champs: string[] = [];
    for (const p of complet.phrases)
      champs.push(p.fr ?? '', ...(p.notes ?? []).map((x) => x.texte));
    champs.push(...index.seances.map((s) => s.titre));
    for (const c of champs)
      for (const mot of c.replace(/\{ar:\d+\}/g, ' ').match(/[\p{L}ʿʾ'’-]+/gu) ?? [])
        if (TRANSLIT.test(mot) && !estNom(mot)) n++;
    expect(n, `${n} mots translittérés (plafond ${PLAFOND_TRANSLIT})`).toBeLessThanOrEqual(
      PLAFOND_TRANSLIT,
    );
  });
});

/** Mots translittérés (hors noms propres) dans le français de la Risāla, mesurés le 13/10/2026. */
const PLAFOND_TRANSLIT = 2862;

describe('ar-Risāla : publication différée (cycle 3), niveau adulte, enseignant', () => {
  it('toutes les séances sont de cycle 3 et en publication différée ; consigne contrôlée contre la source', () => {
    expect(DIFFERE_CYCLE['risala']!.cycle_min).toBe(3);
    expect(srcSe.point_referent).toMatch(DIFFERE_CYCLE['risala']!.consigne);
    expect(srcSe.seances.every((s) => s.cycle === 3)).toBe(true);
    expect(index.seances.every((s) => s.differe === true)).toBe(true);
    expect(TOUT_DIFFERE.has('risala')).toBe(true);
    expect(ens.differe).toHaveLength(164);
    expect(ens.consigne_differe).toMatch(/masquées aux invités de la bêta/);
    expect(ens.publication).toMatch(/Publication différée de toute la Risāla/);
    // risala est au cycle 3 du plan directeur et ouvert
    expect(CYCLES.find((c) => c.n === 3)!.textes.map((t) => t.id)).toContain('risala');
    expect(ACTIFS.has('risala')).toBe(true);
    expect(TEXTES_LOT4).toEqual(['risala']);
    expect(TEXTES).not.toContain('risala');
  });

  it('un invité de la bêta ne voit aucune séance ni aucune phrase, quel que soit son profil', () => {
    for (const kind of ['adulte', 'ado', 'enfant', null] as const) {
      const v = matnPour(complet, kind);
      expect(v.seances, String(kind)).toHaveLength(0);
      expect(v.phrases, String(kind)).toHaveLength(0);
    }
    const invite = { account: { email: 'invite@exemple.org' } };
    expect(voitDiffere(invite, false)).toBe(false);
    expect(voitDiffere(null, false)).toBe(false);
    expect(voitDiffere(invite, true)).toBe(true);
    expect(voitDiffere({ account: { email: 'adulte-x7k@demo.awform.test' } }, false)).toBe(true);
  });

  it('personnel et démonstration : toutes les séances ; passages « adulte » (niveau_min) jamais aux enfants ni aux ados', () => {
    const adultes = srcFr.phrases.filter((p) => p.niveau_min === 'adulte').map((p) => p.id);
    expect(adultes).toHaveLength(444);
    expect(complet.phrases.filter((p) => p.adulte).map((p) => p.id)).toEqual(adultes);
    expect(matnPour(complet, 'adulte', true).seances).toHaveLength(164);
    for (const kind of ['ado', 'enfant', null] as const) {
      const v = matnPour(complet, kind, true);
      expect(v.phrases.some((p) => p.adulte)).toBe(false);
      for (const id of adultes) expect(v.phrases.some((p) => p.id === id)).toBe(false);
      for (const s of v.seances) for (const id of s.phrases) expect(adultes).not.toContain(id);
      expect(v.phrases.length).toBe(1769 - 444);
    }
    expect(matnPour(complet, 'adulte', true).phrases).toHaveLength(1769);
  });

  it('notes de l’enseignant : vocalisations à confirmer, écarts au mashhūr, relectures demandées', () => {
    expect(ens.version).toBe(index.version);
    const incertaines = complet.phrases.filter((p) => p.incertain).length;
    expect(incertaines).toBe(299);
    expect(ens.phrases.filter((x) => x.a_verifier.length).length).toBeGreaterThanOrEqual(
      incertaines,
    );
    expect(ens.phrases.some((x) => /Écart au mashhūr E\d+/.test(x.traduction ?? ''))).toBe(true);
    expect(ens.decoupage).toMatch(/Découpage mécanique/);
  });

  it('quiz et mémorisation : une séance se travaille avec les seules phrases de sa partie', () => {
    const s = index.seances[40]!;
    const part = parties.find((p) => p.part === s.p)!;
    const partiel: Matn = { ...index, phrases: part.phrases };
    const q = genererQuiz(matnPour(partiel, 'adulte', true), s.n);
    expect(q.length).toBeGreaterThan(0);
    for (const x of q) expect(x.type === 'mot' || !!x.phrase).toBe(true);
  });
});

describe('ar-Risāla : chargement à la demande', () => {
  const serveur =
    (log: string[], echec = false) =>
    async (url: string) => {
      log.push(url);
      const f = url.replace('/mutun/', '');
      if (echec) return new Response('', { status: 503 });
      return new Response(readFileSync(join(SORTIE_PROTEGEE, f), 'utf8'), { status: 200 });
    };

  it('chargerPartie ne charge QUE le fichier de la séance ouverte, puis le garde sur l’appareil', async () => {
    const s = index.seances[100]!;
    const log: string[] = [];
    const m1 = await chargerPartie(index, s.n, serveur(log));
    expect(log).toEqual([`/mutun/risala-p${s.p}.json`]);
    const ids = new Set(m1!.phrases.map((p) => p.id));
    for (const id of s.phrases) expect(ids.has(id)).toBe(true);
    expect(m1!.phrases.length).toBeLessThan(1769);
    // hors ligne ensuite : la copie de l'appareil
    const log2: string[] = [];
    const m2 = await chargerPartie(index, s.n, serveur(log2, true));
    expect(log2).toEqual([]);
    expect(m2!.phrases.map((p) => p.id)).toEqual(m1!.phrases.map((p) => p.id));
    // une autre partie : un autre fichier, sans réseau elle n'existe pas
    const autre = index.seances.find((x) => x.p !== s.p)!;
    expect(await chargerPartie(index, autre.n, serveur([], true))).toBeNull();
    // un texte sans parties est rendu tel quel
    const sans = { ...index, parts: undefined };
    expect(await chargerPartie(sans, s.n, serveur([], true))).toBe(sans);
  });

  it('le texte de la Risāla n’est dans aucun fichier des dix autres textes ni dans le code', () => {
    for (const id of TEXTES)
      expect(readFileSync(join(SORTIE, `${id}.json`), 'utf8')).not.toContain('"RIS-0');
    const signe = createHash('sha256').update(brutIndex).digest('hex');
    expect(signe).toHaveLength(64);
    // arabe de la phrase d’ouverture du chapitre des ablutions : présent seulement dans les parties
    const phrase = arSimple(de.get('RIS-0001') as Phrase)!;
    expect(parties.some((p) => JSON.stringify(p).includes(phrase))).toBe(true);
    expect(brutIndex).not.toContain(phrase);
  });
});
