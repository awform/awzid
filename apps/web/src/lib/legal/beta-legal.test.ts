import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { LegalTexts } from './content';
import { LEGAL_PAGES } from './content';

/**
 * Bêta fermée (13/10/2026) : garde-fous sur les textes juridiques et l'aide — pas de promesse périmée, pas de
 * formule interdite, pas d'article de loi non lu à la source, FAQ complète, champs du client toujours marqués.
 */
const read = (lang: string) =>
  JSON.parse(
    readFileSync(new URL(`../../../static/i18n/legal/${lang}.json`, import.meta.url), 'utf8'),
  ) as LegalTexts;
const fr = read('fr');
const en = read('en');
const tout = (d: LegalTexts) => JSON.stringify(d);

describe('textes juridiques de la bêta fermée', () => {
  it('les sept pages existent en français et en anglais', () => {
    expect([...LEGAL_PAGES]).toEqual([
      'mentions',
      'cgu',
      'confidentialite',
      'cookies',
      'beta',
      'invites',
      'infobeta',
    ]);
    for (const d of [fr, en])
      for (const k of LEGAL_PAGES) expect(d.legal[k].sections.length).toBeGreaterThan(0);
  });

  it('chaque page juridique est datée et marquée provisoire / en attente d’une seconde lecture', () => {
    for (const k of LEGAL_PAGES.filter((p) => p !== 'infobeta')) {
      expect(fr.legal[k].maj, k).toMatch(/13 octobre 2026/);
      expect(fr.legal[k].maj, k).toMatch(/provisoire/);
      expect(fr.legal[k].maj, k).toMatch(/seconde lecture juridique/);
      expect(en.legal[k].maj, k).toMatch(/13 October 2026/);
    }
  });

  it('la formule « validation humaine » n’apparaît nulle part', () => {
    expect(tout(fr).toLowerCase()).not.toContain('validation humaine');
    expect(tout(en).toLowerCase()).not.toContain('human validation');
  });

  it('aucune promesse périmée : fournisseur d’IA, analyse de la voix, réinitialisation du mot de passe', () => {
    const f = tout(fr);
    expect(f).not.toContain('Anthropic');
    expect(f).not.toMatch(/Aucune analyse automatique de la voix/);
    expect(f).not.toMatch(/disponible à l'ouverture publique/);
    expect(f).toContain('Gemini');
    expect(f).toContain('Vertex AI');
    expect(f).toContain('europe-west9');
  });

  it('la politique de confidentialité couvre mineurs, article 9, durées, droits, violation, sous-traitants', () => {
    const titres = fr.legal.confidentialite.sections.map((s) => s.titre).join(' | ');
    for (const mot of [
      /Enfants/,
      /article 9/,
      /Durées de conservation/,
      /Vos droits/,
      /violation/,
      /sous-traitants/,
      /Voix/,
    ])
      expect(titres).toMatch(mot);
    const c = JSON.stringify(fr.legal.confidentialite);
    expect(c).toContain('Quran Foundation');
    expect(c).toContain('72 heures');
    expect(c).toContain('consentement explicite');
    expect(c).toContain('30 jours');
  });

  it('seuls les articles de loi lus à la source sont cités', () => {
    // RGPD : 8, 9, 33 ; loi 2008-12 : 4, 40, 41, 49, 58 à 69 ; loi Informatique et Libertés : 82
    const permis = new Set([
      '8',
      '9',
      '33',
      '4',
      '40',
      '41',
      '49',
      '58',
      '69',
      '82',
      '40 et 41',
      '58 à 69',
    ]);
    const textes = tout(fr);
    const trouves = [...textes.matchAll(/[Aa]rticles? (\d+(?: (?:à|et) \d+)?)/g)].map((m) => m[1]!);
    for (const a of trouves) expect(permis.has(a), `article ${a}`).toBe(true);
    expect(trouves.length).toBeGreaterThan(5);
  });

  it('les champs que seul le client peut remplir sont marqués entre crochets', () => {
    const m = JSON.stringify(fr.legal.mentions);
    expect(m).toMatch(/\[raison sociale[^\]]*à compléter par le client\]/);
    expect(m).toMatch(/\[adresse électronique de contact : à créer par le client\]/);
    expect(JSON.stringify(fr.faq)).toMatch(/\[adresse de contact : à créer par le client\]/);
  });

  it('mineurs : France 15 ans, Sénégal 18 ans par prudence, consentement parental, US < 13 fermé', () => {
    const c = JSON.stringify(fr.legal.cgu);
    expect(c).toMatch(/15 ans en France/);
    expect(c).toMatch(/Sénégal/);
    expect(c).toMatch(/18 ans/);
    expect(c).toMatch(/moins de 13 ans/);
  });

  it('conditions des invités : invitation personnelle, usage, suspension, sortie', () => {
    const titres = fr.legal.invites.sections.map((s) => s.titre).join(' | ');
    for (const mot of [/invitation/, /attendons de vous/, /Suspension/, /Responsabilité/])
      expect(titres).toMatch(mot);
  });

  it('page d’information de la bêta : ce que c’est, ce qui est testé, limites, comment signaler', () => {
    expect(fr.legal.infobeta.sections.map((s) => s.titre)).toEqual([
      "Ce qu'est la bêta",
      'Ce que nous testons',
      'Limites connues',
      'Comment signaler',
    ]);
  });

  it('l’aide a au moins 20 questions réelles, sans doublon, en français comme en anglais', () => {
    const q = fr.faq.flatMap((b) => b.items.map((i) => i.q));
    expect(q.length).toBeGreaterThanOrEqual(20);
    expect(new Set(q).size).toBe(q.length);
    for (const sujet of [
      /mot de passe/i,
      /mettre l'application à jour|Mettre à jour/i,
      /mode avion/i,
      /âge/i,
      /erreur dans un texte religieux/i,
      /supprimer/i,
      /Errata/,
    ])
      expect(q.join('\n') + tout({ legal: fr.legal, faq: fr.faq }), String(sujet)).toMatch(sujet);
    expect(en.faq.reduce((a, b) => a + b.items.length, 0)).toBe(q.length);
  });
});
