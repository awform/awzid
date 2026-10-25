import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FONCTIONS } from '@awform/school';
import textes from './textes-fr.json';
import { portionDe, total, TYPES } from './donnees';

const lire = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

describe('hifẓ en classe : règles pures', () => {
  it('portion « s:a-b » lue sans ambiguïté', () => {
    expect(portionDe('112:1-4')).toEqual({ s: 112, from: 1, to: 4 });
    expect(portionDe('2:255')).toEqual({ s: 2, from: 255, to: 255 });
    expect(portionDe('x')).toBeNull();
    expect(portionDe('112:1-')).toBeNull();
  });
  it('quatre types d’erreur : oubli, ajout, changement, tajwīd ; le total les additionne', () => {
    expect([...TYPES]).toEqual(['oubli', 'ajout', 'changement', 'tajwid']);
    expect(total({ oubli: 1, ajout: 2, changement: 3, tajwid: 4 })).toBe(10);
  });
});

describe('hifẓ en classe : règles du projet', () => {
  const maitre = [
    './Marquage.svelte',
    './Seance.svelte',
    './HifzClasse.svelte',
    './classe.ts',
    './donnees.ts',
  ]
    .map(lire)
    .join('\n');
  const eleve = lire('./Enregistrer.svelte');

  it('mode « direct » : le côté maître n’ouvre JAMAIS le micro et ne garde aucun enregistrement', () => {
    expect(maitre).not.toMatch(
      /getUserMedia|MediaRecorder|mediaDevices|AudioContext|saveRecording/,
    );
    // le maître n'envoie aucun audio : seulement des marques de mots
    expect(lire('./donnees.ts')).not.toMatch(/audio\/|Blob/);
  });

  it('mode enregistrement : micro seulement au toucher du bouton, adultes seulement, accord avant tout, durée annoncée', () => {
    expect(eleve.match(/getUserMedia/g)).toHaveLength(1);
    // le micro est ouvert dans `commencer` (appelée par le bouton), jamais au chargement
    expect(eleve).toMatch(/async function commencer\(\)[\s\S]*getUserMedia/);
    expect(eleve).not.toMatch(/onMount\([^)]*getUserMedia/);
    expect(eleve).toMatch(/etat\.adulte/);
    expect(eleve).toMatch(/!etat\.accord/);
    expect(textes['hc.eleve_garanties']).toMatch(/jamais utilisé pour entraîner une IA/);
    expect(textes['hc.eleve_garanties']).toMatch(/supprimé automatiquement/);
    expect(textes['hc.enreg_intro']).toMatch(/30 jours au plus/);
    // rien n'est gardé sur l'appareil
    expect(eleve).not.toMatch(/saveRecording|localStorage|indexedDB|kvSet/);
  });

  it('aucune note chiffrée côté parents : portion, issue, erreurs par type, remarque', () => {
    const s = lire('./Suivi.svelte');
    expect(s).not.toMatch(/\/20|pourcentage|classement|rang\b/i);
    expect(s).not.toMatch(/<audio|recitation_upload|audio/);
  });

  it('coupée par défaut ; la coquille ne contient aucun import statique du module', () => {
    expect(FONCTIONS.hifz_classe.defaut).toBe('off');
    for (const p of [
      '../../routes/enseignant/classe/[id]/+page.svelte',
      '../../routes/ma-classe/+page.svelte',
      '../../routes/famille/+page.svelte',
    ]) {
      const page = lire(p);
      expect(page, p).toMatch(/fn\('hifz_classe'\)[\s\S]{0,80}import\('\$lib\/hifz-classe\//);
      expect(page, p).not.toMatch(/^\s*import .* from '\$lib\/hifz-classe/m);
    }
    expect(lire('../../../scripts/groupes.mjs')).toMatch(
      /lib\\\/hifz-classe\\\/\(classe\|eleve\)\\\.ts/,
    );
  });

  it('textes : l’arabe n’est jamais sur la ligne du français ; toutes les clés existent', () => {
    for (const [k, v] of Object.entries(textes as Record<string, string>))
      expect(v, k).not.toMatch(/[؀-ۿ]/);
    const src = [
      './Marquage.svelte',
      './Seance.svelte',
      './HifzClasse.svelte',
      './Enregistrer.svelte',
      './Suivi.svelte',
    ]
      .map(lire)
      .join('\n');
    const cles = new Set([...src.matchAll(/['"`](hc\.[a-z_]+)['"`]/g)].map((m) => m[1]!));
    for (const m of src.matchAll(/`(hc\.[a-z_]+_)\$\{/g))
      for (const k of Object.keys(textes)) if (k.startsWith(m[1]!)) cles.add(k);
    for (const k of cles) expect(textes, k).toHaveProperty([k]);
    // le texte coranique est rendu dans `.quran-text`, sans <Bidi>
    expect(lire('./Marquage.svelte')).toMatch(/class="verset quran-text"/);
  });
});
