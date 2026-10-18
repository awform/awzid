import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { consigneAppli } from './consigne';
import { devoirConvient, libelleDevoir } from './devoirs';
import { t } from './i18n';
import { compareNiveaux } from './levels';
import { nomRecitateur } from './quran/reciters';

/**
 * Défauts repérés pendant le tournage du 18/10/2026 (BUGS_APPLI_18-10) : un test par point corrigé.
 */
const RACINE = new URL('../../', import.meta.url).pathname;
const SRC = join(RACINE, 'src');
const STATIC = join(RACINE, 'static');

function fichiers(dir: string, ext: RegExp, out: string[] = []): string[] {
  for (const nom of readdirSync(dir)) {
    const p = join(dir, nom);
    if (statSync(p).isDirectory()) {
      if (nom !== 'node_modules') fichiers(p, ext, out);
    } else if (ext.test(nom)) out.push(p);
  }
  return out;
}

describe('point 2 : aucune mention « voix de synthèse (provisoire) » à l’écran', () => {
  it('clés retirées de tous les catalogues, et plus aucun appel dans le code', () => {
    const catalogues = [
      join(SRC, 'lib/i18n/messages/fr.json'),
      ...fichiers(join(STATIC, 'i18n'), /\.json$/),
    ];
    for (const f of catalogues) {
      const m = JSON.parse(readFileSync(f, 'utf8')) as Record<string, unknown>;
      expect(m['audio.mention'], f).toBeUndefined();
      expect(m['do.voix_provisoire'], f).toBeUndefined();
    }
    for (const f of fichiers(SRC, /\.(svelte|ts)$/)) {
      if (f.endsWith('.test.ts')) continue;
      const s = readFileSync(f, 'utf8');
      expect(s, f).not.toMatch(/audio\.mention|do\.voix_provisoire/);
    }
  });
});

describe('point 3 : libellés du parcours de hifẓ', () => {
  it('durée du parcours (pas un âge), pluriel juste, sans tutoiement ni « 1 passages »', () => {
    expect(t('hifz.rythme_actuel', { n: 7 })).toBe('Parcours de hifẓ : 7 ans');
    expect(t('hifz.rythme_actuel', { n: 1 })).toBe('Parcours de hifẓ : 1 an');
    expect(t('hifz.acquis_carnet', { n: 1, total: 30 })).toBe('1 passage commencé sur 30');
    expect(t('hifz.acquis_carnet', { n: 5, total: 30 })).toBe('5 passages commencés sur 30');
    expect(t('hifz.rythme_actuel', { n: 7 })).not.toMatch(/\bTon\b|\bton\b|\bVotre\b/);
  });
});

describe('point 4 : titres humains des devoirs, filtre selon le profil', () => {
  it('jamais un identifiant brut', () => {
    const lecon = { kind: 'lecon', target: 'en1.l03', label: 'en1.l03' };
    expect(libelleDevoir({ ...lecon, titleFr: 'Les lettres du jour' })).toBe(
      'Leçon : Les lettres du jour',
    );
    expect(libelleDevoir(lecon)).not.toMatch(/en1|l03/);
    const livret = { kind: 'lecture', target: 'ad1-01', label: 'ad1-01' };
    expect(libelleDevoir({ ...livret, titleFr: 'Le marché' })).toBe('Petit livre : Le marché');
    expect(libelleDevoir(livret)).not.toMatch(/ad1-01/);
    expect(libelleDevoir({ kind: 'hifz', target: '112:1-4', label: 'Al-Ikhlāṣ 1-4' })).toBe(
      'Hifẓ : Al-Ikhlāṣ 1-4',
    );
  });
  it('un compte adulte ne voit pas les leçons des filières enfants, ados ou religion des enfants', () => {
    const d = (target: string) => ({ kind: 'lecon', target, label: target });
    expect(devoirConvient('adulte', d('en1.l03'))).toBe(false);
    expect(devoirConvient('adulte', d('ado2.l05'))).toBe(false);
    expect(devoirConvient('adulte', d('re1.l23'))).toBe(false);
    expect(devoirConvient('adulte', d('ad3.l01'))).toBe(true);
    expect(devoirConvient('adulte', d('ra1.l04'))).toBe(true);
    expect(devoirConvient('enfant', d('en1.l03'))).toBe(true);
    expect(devoirConvient('enfant', d('ad3.l01'))).toBe(false);
    expect(devoirConvient('adulte', { kind: 'hifz', target: '112:1-4', label: '' })).toBe(true);
  });
});

describe('point 5 : publication différée cohérente avec la bêta', () => {
  it('le libellé ne dit plus « masquée » pour un contenu que le lecteur voit', () => {
    const m = JSON.parse(readFileSync(join(STATIC, 'i18n/fr-madjaliss.json'), 'utf8')) as Record<
      string,
      string
    >;
    expect(m['mj.differe']).toBe('Publication différée : visible pendant la bêta');
    expect(m['mj.differe']).not.toMatch(/masqu/);
  });
});

describe('point 6 : consignes du livre adaptées à l’appli', () => {
  it('« L’enseignant(e) dit… » devient « L’audio dit… », le reste est inchangé', () => {
    expect(
      consigneAppli("L'enseignant(e) dit chaque élément deux fois. Je coche ce que j'entends."),
    ).toBe("L'audio dit chaque élément deux fois. Je coche ce que j'entends.");
    expect(consigneAppli('Mon enseignant dit un mot deux fois. Je choisis.')).toBe(
      "L'audio dit un mot deux fois. Je choisis.",
    );
    expect(consigneAppli("L'enseignant (ou l'audio) dit une syllabe.")).toBe(
      "L'audio dit une syllabe.",
    );
    expect(consigneAppli("L'enseignant lit une phrase du texte.")).toBe(
      "L'audio lit une phrase du texte.",
    );
    expect(consigneAppli('Je lis la liste que le professeur écrit.')).toBe(
      'Je lis la liste que le professeur écrit.',
    );
  });
  it('plus de « Pour l’adulte » dans l’exercice d’écoute', () => {
    expect(t('exo.lire_texte')).toBe('Lire le texte');
    expect(t('exo.pour_adulte')).toMatch(/⟦/);
  });
});

describe('point 7 : récitateurs homonymes', () => {
  const liste = [
    { id: 'huthify-hafs', nameFr: 'ʿAlī al-Ḥudhayfī', riwayaFr: 'Ḥafṣ' },
    { id: 'huthify-shuba', nameFr: 'ʿAlī al-Ḥudhayfī', riwayaFr: 'Shuʿba' },
    { id: 'ayyoub-hafs', nameFr: 'Muḥammad Ayyūb', riwayaFr: 'Ḥafṣ' },
  ];
  it('la riwāya distingue les homonymes ; un nom unique reste tel quel', () => {
    expect(nomRecitateur(liste[0]!, liste)).toBe('ʿAlī al-Ḥudhayfī — Ḥafṣ');
    expect(nomRecitateur(liste[1]!, liste)).toBe('ʿAlī al-Ḥudhayfī — Shuʿba');
    expect(nomRecitateur(liste[2]!, liste)).toBe('Muḥammad Ayyūb');
  });
});

describe('point 8 : tri naturel des niveaux', () => {
  it('N1, N2… N10 (et non N1, N10, N2)', () => {
    const l = ['ad10', 'ad2', 'ad1', 'ado1', 'en5', 'ad3'].sort(compareNiveaux);
    expect(l).toEqual(['ad1', 'ad2', 'ad3', 'ad10', 'ado1', 'en5']);
  });
});

describe('point 10 : aucune translittération (champ tr) dans les données servies à l’élève', () => {
  const MOTIF = /^(tr|tr_.*|.*_tr|translit.*|phon.*)$/;
  function cles(o: unknown, chemin: string, trouvees: string[]) {
    if (Array.isArray(o)) o.slice(0, 200).forEach((x) => cles(x, `${chemin}[]`, trouvees));
    else if (o && typeof o === 'object')
      for (const [k, v] of Object.entries(o)) {
        if (MOTIF.test(k)) trouvees.push(`${chemin}.${k}`);
        cles(v, `${chemin}.${k}`, trouvees);
      }
  }
  it('fichiers JSON publics (static) et données embarquées (hors catalogues de textes)', () => {
    const dossiers = [STATIC, join(SRC, 'lib/server')].filter(existsSync);
    const trouvees: string[] = [];
    for (const d of dossiers)
      for (const f of fichiers(d, /\.json$/)) {
        if (f.includes(join(STATIC, 'i18n'))) continue;
        cles(JSON.parse(readFileSync(f, 'utf8')), f.replace(RACINE, ''), trouvees);
      }
    expect(trouvees).toEqual([]);
  });
});
