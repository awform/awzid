/**
 * « Sens et explication » — le contenu du tafsīr n'est PAS dans les fichiers publics ni dans le code du client (D-TF-445 : le filtrage
 * par public est fait par le serveur ; ce qui n'est pas servi ne doit pas être livré par ailleurs).
 *  - `apps/web/static` (servi sans authentification) ne contient aucun texte du tafsīr (tous les fichiers texte, 114 sourates) ;
 *  - la construction du client (`.svelte-kit/output/client` et `server`), quand elle existe, non plus ;
 *  - aucun segment « mention publique INTERDITE » dans les fichiers publics ;
 *  - le code de l'application n'importe aucun fichier de `packages/content/tafsir` (types seulement depuis `@awform/content/tafsir`).
 * Les repères cherchés sont des passages entiers (≥ 80 caractères) de la prose du tafsīr de chaque sourate.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { SourateTafsir } from '@awform/content/tafsir';

const WEB = fileURLToPath(new URL('../../../', import.meta.url));
const TAFSIR = join(WEB, '..', '..', 'packages', 'content', 'tafsir');
const TEXTE = /\.(json|js|mjs|html|css|svg|txt|webmanifest|csv|tsv|map)$/i;

function fichiers(dossier: string): string[] {
  if (!existsSync(dossier)) return [];
  return readdirSync(dossier).flatMap((f) => {
    const p = join(dossier, f);
    return statSync(p).isDirectory() ? fichiers(p) : [p];
  });
}

/**
 * Passages de chaque sourate : la présentation, le premier, celui du milieu et le dernier point du tafsīr (de la prose du référent,
 * jamais une traduction de verset, qui se retrouve légitimement ailleurs : « Au nom d'Allah… »).
 */
function reperes(): Array<{ s: number; texte: string }> {
  const out: Array<{ s: number; texte: string }> = [];
  for (let s = 1; s <= 114; s++) {
    const x = JSON.parse(
      readFileSync(join(TAFSIR, `${String(s).padStart(3, '0')}.json`), 'utf8'),
    ) as SourateTafsir;
    for (const t of [
      x.sens_general ?? '',
      x.points[0]?.texte ?? '',
      x.points[Math.floor(x.points.length / 2)]?.texte ?? '',
      x.points.at(-1)?.texte ?? '',
    ])
      if (t.length >= 80) out.push({ s, texte: t.slice(0, 120) });
  }
  return out;
}

/**
 * Le parcours « La prière de A à Z » (`static/priere-data/`, interrupteur `parcours_priere`, décidé avant ce chantier) publie déjà, pour
 * al-Fātiḥa et les sourates 101 à 114 SEULEMENT, le même contenu du référent (reprises « telles quelles », sans segment réservé) : ces
 * passages-là sont tolérés dans ce dossier et nulle part ailleurs ; pour les 99 autres sourates, rien n'est toléré.
 */
const PRIERE = new Set([1, ...Array.from({ length: 14 }, (_, i) => 101 + i)]);
const toleree = (f: string, s: number) =>
  /[\\/](?:static|client)[\\/]priere-data[\\/]/.test(f) && PRIERE.has(s);

function cherche(liste: string[], rep: Array<{ s: number; texte: string }>) {
  const trouves: string[] = [];
  let lus = 0;
  for (const f of liste) {
    if (!TEXTE.test(f) || statSync(f).size > 60 * 1024 * 1024) continue;
    const brut = readFileSync(f, 'utf8');
    lus++;
    for (const r of rep)
      if (brut.includes(r.texte) && !toleree(f, r.s)) trouves.push(`${f} ← sourate ${r.s}`);
    // D-TF-445 : aucun segment « mention publique interdite » dans les fichiers publics
    if (/mention publique interdite/i.test(brut)) trouves.push(`${f} ← mention publique interdite`);
  }
  return { trouves, lus };
}

describe('aucun contenu du tafsīr dans les fichiers publics', () => {
  const rep = reperes();

  it('les repères sont nombreux (plusieurs passages par sourate, 114 sourates)', () => {
    expect(rep.length).toBeGreaterThan(300);
    expect(new Set(rep.map((r) => r.s)).size).toBe(114);
  });

  it('apps/web/static : aucun passage du tafsīr, aucun marqueur réservé', () => {
    const { trouves, lus } = cherche(fichiers(join(WEB, 'static')), rep);
    expect(lus).toBeGreaterThan(1000);
    expect(trouves).toEqual([]);
  });

  it.skipIf(!existsSync(join(WEB, '.svelte-kit', 'output', 'client')))(
    'construction du client (.svelte-kit/output/client et server) : aucun passage du tafsīr',
    () => {
      const sortie = join(WEB, '.svelte-kit', 'output');
      const { trouves, lus } = cherche(
        [...fichiers(join(sortie, 'client')), ...fichiers(join(sortie, 'server'))],
        rep,
      );
      expect(lus).toBeGreaterThan(50);
      expect(trouves).toEqual([]);
    },
  );

  it('le code de l’application n’importe aucun fichier de données du tafsīr', () => {
    const sources = [...fichiers(join(WEB, 'src')), ...fichiers(join(WEB, 'scripts'))].filter((f) =>
      /\.(ts|svelte|mjs|js)$/.test(f),
    );
    const fautifs = sources.filter((f) => {
      if (f.endsWith('statique.test.ts')) return false;
      return /content\/tafsir\/|tafsir\/\d{3}\.json|from '@awform\/content\/tafsir\/\d/.test(
        readFileSync(f, 'utf8'),
      );
    });
    expect(fautifs).toEqual([]);
  });

  it('seuls des TYPES viennent de @awform/content/tafsir dans le client (rien du paquet n’entre dans le code)', () => {
    const fautifs = fichiers(join(WEB, 'src')).filter((f) => {
      if (!/\.(ts|svelte)$/.test(f) || f.endsWith('.test.ts')) return false;
      const t = readFileSync(f, 'utf8');
      return /import\s+(?!type\b)[^;]*from '@awform\/content\/tafsir'/.test(t);
    });
    expect(fautifs).toEqual([]);
  });
});
