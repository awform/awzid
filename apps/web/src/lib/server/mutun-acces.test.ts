import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SORTIE_PROTEGEE } from '../../../scripts/madjaliss.mjs';
import { voitDiffere as voitDiffereClient } from '../madjaliss/donnees';
import { isStaff, type Me } from '../session';
import { decider, droitExige, estPersonnel, voitDiffere, type CompteMutun } from './mutun-acces';

/** Lot 5 : accès aux fichiers gardés de /mutun (écart n° 3 du contrôle pré-bêta). */
const invite: CompteMutun = { account: { kind: 'parent', email: 'famille@exemple.org' } };
const adulte: CompteMutun = { account: { kind: 'adulte', email: 'adulte@exemple.org' } };
const demo: CompteMutun = { account: { kind: 'adulte', email: 'adulte-x7k@demo.awform.test' } };
const demoParent: CompteMutun = {
  account: { kind: 'parent', email: 'parent-x7k@demo.awform.test' },
};
const enseignant: CompteMutun = { account: { kind: 'enseignant', email: 'prof@ecole.sn' } };
const admin: CompteMutun = { account: { kind: 'admin', email: 'admin@awzid.org' } };
const direction: CompteMutun = {
  account: { kind: 'parent', email: 'directrice@ecole.sn' },
  roles: ['direction'],
};
const mfaEnAttente: CompteMutun = { ...enseignant, mfaRequired: true, mfaVerified: false };
const mfaValide: CompteMutun = { ...enseignant, mfaRequired: true, mfaVerified: true };

describe('droit exigé par fichier gardé', () => {
  it('notes de l’enseignant : personnel ; séances différées et parties de la Risāla : personnel et démonstration', () => {
    expect(droitExige('ibn-ashir-enseignant.json')).toBe('personnel');
    expect(droitExige('risala-enseignant.json')).toBe('personnel');
    expect(droitExige('ibn-ashir-differe.json')).toBe('differe');
    expect(droitExige('risala-p3.json')).toBe('differe');
    expect(droitExige('risala-p12.json')).toBe('differe');
  });

  it('tout autre nom est refusé : pas de chemin, pas de fichier public, pas de remontée', () => {
    for (const nom of [
      'risala.json',
      'ibn-ashir.json',
      '../risala-p1.json',
      '..%2frisala-p1.json',
      'risala-p1.json/../x',
      'risala-p1.JSON',
      'RISALA-P1.json',
      'risala-p.json',
      '-enseignant.json',
      'risala-p1.json.map',
      '',
    ])
      expect(droitExige(nom), nom).toBeNull();
  });
});

describe('décision : 401 sans session, 403 sans le droit, 200 sinon', () => {
  const gardes = ['ibn-ashir-differe.json', 'risala-p1.json', 'risala-p12.json'];

  it('visiteur sans session : 401 partout, même pour un fichier qui n’existe pas', () => {
    for (const f of [...gardes, 'ibn-ashir-enseignant.json', 'inconnu-differe.json'])
      expect(decider(f, null), f).toBe(401);
    expect(decider('ibn-ashir-differe.json', {})).toBe(401);
  });

  it('invité de la bêta (parent, adulte ordinaire) : 403 sur tous les fichiers gardés', () => {
    for (const me of [invite, adulte])
      for (const f of [...gardes, 'ibn-ashir-enseignant.json', 'risala-enseignant.json'])
        expect(decider(f, me), f).toBe(403);
  });

  it('compte de démonstration : séances différées et Risāla (200), pas les notes de l’enseignant (403)', () => {
    for (const me of [demo, demoParent]) {
      for (const f of gardes) expect(decider(f, me), f).toBe(200);
      expect(decider('ibn-ashir-enseignant.json', me)).toBe(403);
    }
  });

  it('personnel (enseignant, administrateur, rôle de direction) : tout (200)', () => {
    for (const me of [enseignant, admin, direction])
      for (const f of [...gardes, 'ibn-ashir-enseignant.json']) expect(decider(f, me), f).toBe(200);
  });

  it('second facteur exigé et pas encore validé : aucun droit ; validé : droit', () => {
    expect(estPersonnel(mfaEnAttente)).toBe(false);
    expect(decider('ibn-ashir-differe.json', mfaEnAttente)).toBe(403);
    expect(estPersonnel(mfaValide)).toBe(true);
  });

  it('adresse de démonstration imitée : refusée', () => {
    for (const email of [
      'x@demo.awform.test.evil.org',
      'x@evil-demo.awform.test.org',
      'demo.awform.test',
      'x@demo.awform.tests',
      null,
    ])
      expect(voitDiffere({ account: { kind: 'adulte', email } }), String(email)).toBe(false);
  });

  it('même décision que l’interface (isStaff de session.ts, voitDiffere de donnees.ts)', () => {
    const comptes = [invite, adulte, demo, demoParent, enseignant, admin, direction];
    for (const c of comptes) {
      const me = { ...c, profiles: [], mfaRequired: false, mfaVerified: true } as unknown as Me;
      expect(estPersonnel(c), c.account!.email!).toBe(isStaff(me));
      expect(voitDiffere(c), c.account!.email!).toBe(voitDiffereClient(me, isStaff(me)));
    }
  });
});

describe('fichiers du dossier gardé', () => {
  it('chacun est reconnu par la route avec un droit (aucun fichier gardé servi sans contrôle)', () => {
    const fichiers = readdirSync(SORTIE_PROTEGEE).filter((f) => f.endsWith('.json'));
    expect(fichiers.length).toBeGreaterThan(20);
    for (const f of fichiers) {
      expect(droitExige(f), f).not.toBeNull();
      expect(decider(f, null), f).toBe(401);
      expect(decider(f, invite), f).toBe(403);
    }
    expect(join(SORTIE_PROTEGEE)).toContain(join('src', 'lib', 'server', 'mutun'));
  });
});
