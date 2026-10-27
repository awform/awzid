/**
 * Test « zéro muet » GLOBAL (27/10/2026) — enfants, ados et tout l'inventaire global de l'application.
 *
 * Complète `zero-muet.test.ts` (adultes, cahiers) : pour chaque texte arabe « à écouter » de l'inventaire
 * (`data/zero-muet/a-generer-global-26-10.tsv`, `a-generer-synthese-v2.tsv` = livres Enfants en1-en5 et Ados ado1-ado4,
 * `muets-v2-mis-de-cote.tsv` = textes déjà sonorisés dans un autre niveau, `a-rattacher-niveau-26-10.tsv`), il faut :
 *   1. un fichier audio dans l'index (`liste.csv`) à l'un des niveaux du texte (voix de synthèse : Achernar enfants,
 *      Charon ados et adultes) ; OU
 *   2. une RÉCITATION d'Ayyūb branchée (`apps/web/static/recitation/ayyub.json`) ; OU
 *   3. une EXCLUSION DÉCLARÉE (`exclusions-declarees-26-10.tsv`, décisions du client et du référent du 26/10) :
 *      Madjaliss cycles 3-4 et tajwīd qc1-qc3 (pas de synthèse), ad7 à ad10 non essentiels (consignes, quiz, récapitulatifs),
 *      niveau indéterminé, texte mêlé de français non lu, niveaux exclus ; OU
 *   4. un DOUTE remis au référent ou à l'agent Ayyūb (`doutes-referent.tsv`, `doutes-ayyub.tsv`, `muets-restants-27-10.tsv`),
 *      compté à part.
 * Tout autre texte est un muet caché : le test échoue et le LISTE. Les exclusions sont comptées et listées, jamais silencieuses.
 *
 * Il lit la liste des audios (`~/lecons-audio/liste.csv`, ou AWFORM_LECONS_AUDIO_LISTE) : sans elle, il est ignoré.
 * `ZERO_MUET_RAPPORT=1` écrit `reports/zero-muet-global.md`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const BOM = new RegExp(`^${String.fromCharCode(0xfeff)}`);
const DATA = join(import.meta.dirname, '..', 'data', 'zero-muet');
const STATIC_WEB = join(import.meta.dirname, '..', '..', '..', 'apps', 'web', 'static');
const LISTE = process.env.AWFORM_LECONS_AUDIO_LISTE ?? join(homedir(), 'lecons-audio', 'liste.csv');

const lignes = (f: string): string[] =>
  existsSync(f) ? readFileSync(f, 'utf8').replace(BOM, '').split(/\r?\n/).filter(Boolean) : [];
const tsv = (nom: string): string[][] =>
  lignes(join(DATA, nom))
    .slice(1)
    .map((l) => l.split('\t'));

const niveauExclu = (t: string): boolean => /^qc[123]$/.test(t) || t.startsWith('madjaliss');
const niveaux = (s: string | undefined): string[] =>
  (s ?? '').split(' ').filter((x) => x && x !== 'A-DETERMINER');

/** un texte de l'inventaire : empreinte de sa clé audio, niveaux où il doit être entendu */
interface Item {
  sha: string;
  niv: string[];
  texte: string;
  source: string;
}

function inventaire(): Item[] {
  const items: Item[] = [];
  for (const p of tsv('a-generer-global-26-10.tsv'))
    items.push({ sha: p[0]!, niv: niveaux(p[2]), texte: p[7] ?? '', source: 'global' });
  for (const p of tsv('a-generer-synthese-v2.tsv'))
    items.push({
      sha: p[0]!,
      niv: niveaux(p[1]),
      texte: p[5] ?? '',
      source: 'livres enfants/ados',
    });
  for (const p of tsv('muets-v2-mis-de-cote.tsv'))
    if (p[1] === 'autre_niveau')
      items.push({ sha: p[3]!, niv: [p[0]!], texte: p[5] ?? '', source: 'rattachement livres' });
  for (const p of tsv('a-rattacher-niveau-26-10.tsv'))
    items.push({
      sha: p[0]!,
      niv: niveaux(p[2]),
      texte: p[4] ?? '',
      source: 'rattachement global',
    });
  return items;
}

const RUN = existsSync(LISTE) && existsSync(join(DATA, 'a-generer-global-26-10.tsv'));

describe.skipIf(!RUN)("zéro muet global : enfants, ados, inventaire de l'application", () => {
  const fichiers = new Map<string, Set<string>>();
  for (const l of lignes(LISTE).slice(1)) {
    const c = l.split(';');
    if (c.length >= 6) fichiers.set(c[0]!, new Set((c[5] ?? '').split(' ').filter(Boolean)));
  }
  const ayyub = existsSync(join(STATIC_WEB, 'recitation', 'ayyub.json'))
    ? new Set(
        Object.keys(
          (
            JSON.parse(readFileSync(join(STATIC_WEB, 'recitation', 'ayyub.json'), 'utf8')) as {
              t: Record<string, unknown>;
            }
          ).t,
        ),
      )
    : new Set<string>();
  const exclus = new Map<string, string>();
  for (const p of tsv('exclusions-declarees-26-10.tsv')) exclus.set(p[0]!, p[1]!);
  const doutes = new Map<string, string>();
  for (const f of ['doutes-referent.tsv', 'doutes-ayyub.tsv', 'muets-restants-27-10.tsv'])
    for (const p of tsv(f))
      if (p[0] && /^[0-9a-f]{40}$/.test(p[0])) doutes.set(p[0], f.replace('.tsv', ''));

  const compte = new Map<string, number>();
  const muets: Item[] = [];
  const inc = (k: string) => compte.set(k, (compte.get(k) ?? 0) + 1);
  const vus = new Set<string>();
  for (const it of inventaire()) {
    const cle = `${it.sha}|${it.niv.join(' ')}`;
    if (vus.has(cle)) continue;
    vus.add(cle);
    const requis = it.niv.filter((t) => !niveauExclu(t));
    const f = fichiers.get(it.sha);
    if (exclus.has(it.sha)) inc(`exclusion déclarée : ${exclus.get(it.sha)}`);
    else if (f && (requis.length === 0 || requis.some((t) => f.has(t)))) inc('audio de synthèse');
    else if (ayyub.has(it.sha.slice(0, 12))) inc("récitation d'Ayyūb");
    else if (doutes.has(it.sha)) inc(`doute remis (${doutes.get(it.sha)})`);
    else if (requis.length === 0) inc('exclusion déclarée : niveau exclu (Madjaliss, qc)');
    else muets.push(it);
  }

  it('aucun texte ne reste muet sans solution ni exclusion déclarée', () => {
    if (process.env.ZERO_MUET_RAPPORT === '1') {
      const dir = join(import.meta.dirname, '..', '..', '..', 'reports');
      mkdirSync(dir, { recursive: true });
      const out = [
        "# Zéro muet global (enfants, ados, inventaire de l'application)",
        '',
        `Textes contrôlés : ${vus.size}. Muets cachés : ${muets.length}.`,
        '',
        '| Statut | Textes |',
        '|---|---|',
        ...[...compte].sort((a, b) => b[1] - a[1]).map(([k, v]) => `| ${k} | ${v} |`),
        '',
        ...muets.slice(0, 200).map((m) => `- ${m.sha} (${m.niv.join(' ')}) : ${m.texte}`),
      ];
      writeFileSync(join(dir, 'zero-muet-global.md'), out.join('\n') + '\n');
    }
    expect(
      muets.map(
        (m) => `${m.sha.slice(0, 12)} ${m.niv.join(',')} ${m.source} : ${m.texte.slice(0, 60)}`,
      ),
    ).toEqual([]);
  });

  it('les exclusions déclarées sont listées (aucune exclusion silencieuse)', () => {
    expect(exclus.size).toBeGreaterThan(0);
    for (const sha of exclus.keys()) expect(sha).toMatch(/^[0-9a-f]{40}$/);
  });
});
