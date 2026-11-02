import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SORTIE_PROTEGEE } from '../../../scripts/madjaliss.mjs';
import { voitDiffere as voitDiffereClient } from '../madjaliss/donnees';
import { isStaff, type Me } from '../session';
import { COMPTE_TOUT_VOIR } from '@awform/school/tout-voir';
import {
  decider,
  deciderAudio,
  droitExige,
  estMembreBeta,
  estPersonnel,
  estToutVoir,
  ROLE_BETA,
  voitDiffere,
  type CompteMutun,
} from './mutun-acces';

/** Lot 5 : accès aux fichiers gardés de /mutun (écart n° 3 du contrôle pré-bêta). */
const invite: CompteMutun = { account: { kind: 'parent', email: 'famille@exemple.org' } };
const adulte: CompteMutun = { account: { kind: 'adulte', email: 'adulte@exemple.org' } };
const demo: CompteMutun = { account: { kind: 'adulte', email: 'adulte-x7k@demo.awform.test' } };
const demoParent: CompteMutun = {
  account: { kind: 'parent', email: 'parent-x7k@demo.awform.test' },
};
const enseignant: CompteMutun = { account: { kind: 'enseignant', email: 'prof@ecole.sn' } };
// l'API annonce toujours l'exigence du second facteur d'un administrateur (requiresMfa)
// le compte du CLIENT : seul à recevoir `toutVoir` (identifiant partagé avec l'API, `@awform/school/tout-voir`)
const admin: CompteMutun = {
  account: { id: COMPTE_TOUT_VOIR, kind: 'admin', email: 'admin@awzid.org', totpEnabled: true },
  mfaRequired: true,
  mfaVerified: true,
  toutVoir: true,
};
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

describe('lot 6 : groupe « bêta fermée » (interrupteur beta_contenu_differe_visible)', () => {
  const gardes = [
    'ibn-ashir-differe.json',
    'lamiyya-differe.json',
    'risala-p1.json',
    'risala-p11.json',
  ];
  const membre: CompteMutun = {
    account: { kind: 'adulte', email: 'ami@exemple.org' },
    roles: [ROLE_BETA, 'eleve_adulte'],
    betaDiffere: true,
    mfaRequired: false,
    mfaVerified: true,
  };

  it('membre du groupe avec le droit : séances différées, Risāla, vers non confirmés (200) ; notes du référent (403)', () => {
    expect(estMembreBeta(membre)).toBe(true);
    for (const f of gardes) expect(decider(f, membre), f).toBe(200);
    for (const f of [
      'ibn-ashir-enseignant.json',
      'risala-enseignant.json',
      'lamiyya-enseignant.json',
    ])
      expect(decider(f, membre), f).toBe(403);
  });

  it('compte ordinaire non membre : 403 ; visiteur sans session : 401 (mêmes réponses qu’au lot 5)', () => {
    for (const f of gardes) {
      expect(decider(f, invite), f).toBe(403);
      expect(decider(f, adulte), f).toBe(403);
      expect(decider(f, null), f).toBe(401);
    }
  });

  it('interrupteur éteint (betaDiffere faux) : le rôle seul ne donne rien, retour au comportement du lot 5', () => {
    const eteint: CompteMutun = { ...membre, betaDiffere: false };
    const sansIndication: CompteMutun = { ...membre, betaDiffere: undefined };
    for (const me of [eteint, sansIndication]) {
      expect(estMembreBeta(me)).toBe(false);
      for (const f of gardes) expect(decider(f, me), f).toBe(403);
    }
  });

  it('retrait du groupe (plus de rôle) : droit perdu aussitôt, même si l’indication traîne', () => {
    const retire: CompteMutun = { ...membre, roles: ['eleve_adulte'] };
    expect(estMembreBeta(retire)).toBe(false);
    for (const f of gardes) expect(decider(f, retire), f).toBe(403);
  });

  it('second facteur exigé et non validé : aucun droit, même membre', () => {
    const enAttente: CompteMutun = { ...membre, mfaRequired: true, mfaVerified: false };
    expect(estMembreBeta(enAttente)).toBe(false);
    for (const f of gardes) expect(decider(f, enAttente), f).toBe(403);
  });

  it('le droit est contrôlé avant l’existence du fichier : même réponse pour un fichier absent', () => {
    expect(decider('inconnu-differe.json', invite)).toBe(403);
    expect(decider('inconnu-differe.json', null)).toBe(401);
    expect(decider('inconnu-differe.json', membre)).toBe(200); // l'existence est vérifiée ensuite (404 par la route)
    expect(decider('risala.json', membre)).toBe(404); // ce n'est pas un fichier gardé
  });

  it('même décision que l’interface (voitDiffere de donnees.ts)', () => {
    for (const c of [membre, { ...membre, betaDiffere: false }, { ...membre, roles: [] }, invite]) {
      const me = { ...c, profiles: [] } as unknown as Me;
      expect(voitDiffere(c)).toBe(voitDiffereClient(me, isStaff(me)));
    }
  });
});

describe('mode « tout voir » (2/11/2026) : administrateur avec second facteur validé, rien d’autre', () => {
  const adminSans2: CompteMutun = { ...admin, mfaVerified: false };
  const adminSansIndication: CompteMutun = { account: { kind: 'admin', email: 'a@awzid.org' } };
  const beta: CompteMutun = {
    account: { kind: 'adulte', email: 'ami@exemple.org' },
    roles: [ROLE_BETA],
    betaDiffere: true,
    mfaRequired: false,
    mfaVerified: true,
  };
  // les séances sensibles (chapitre du jihād) et les séances différées : risala-p2, risala-p3, <texte>-differe, risala-tout
  const differes = [
    'risala-p2.json',
    'risala-p3.json',
    'ibn-ashir-differe.json',
    'lamiyya-differe.json',
  ];

  it('un AUTRE administrateur avec second facteur validé n’a PAS « tout voir » (même avec un drapeau forgé) ; le différé ordinaire, oui', () => {
    const autre: CompteMutun = {
      ...admin,
      account: { ...admin.account, id: '00000000-0000-7000-8000-000000000001' },
      toutVoir: false,
    };
    const forge: CompteMutun = { ...autre, toutVoir: true };
    for (const me of [autre, forge]) {
      expect(estToutVoir(me)).toBe(false);
      expect(decider('risala-tout.json', me)).toBe(403);
      expect(deciderAudio('tout', me)).toBe(403);
      expect(decider('risala-p3.json', me)).toBe(200); // personnel : inchangé
    }
  });

  it('administrateur DE DÉMONSTRATION (session de démo : second facteur validé d’office) : jamais « tout voir »', () => {
    const demoAdmin: CompteMutun = {
      ...admin,
      account: { ...admin.account, email: 'admin-x7k@demo.awform.test' },
    };
    const demoAutreId: CompteMutun = {
      ...demoAdmin,
      account: { ...demoAdmin.account, id: '00000000-0000-7000-8000-0000000000d1' },
    };
    for (const me of [demoAdmin, demoAutreId]) {
      expect(estToutVoir(me)).toBe(false);
      expect(decider('risala-tout.json', me)).toBe(403);
      expect(deciderAudio('tout', me)).toBe(403);
    }
  });

  it('les deux contrôles doivent s’accorder : sans toutVoir de l’API, sans second facteur activé, en tablette ou session d’enfant : non', () => {
    for (const me of [
      { ...admin, toutVoir: undefined },
      { ...admin, toutVoir: false },
      { ...admin, account: { ...admin.account, totpEnabled: false } },
      { ...admin, account: { ...admin.account, totpEnabled: undefined } },
      { ...admin, tablette: { classId: 'c' } },
      { ...admin, enfantSession: true },
      { ...admin, account: { ...admin.account, id: undefined } },
    ] as CompteMutun[]) {
      expect(estToutVoir(me), JSON.stringify(me)).toBe(false);
      expect(decider('risala-tout.json', me)).toBe(403);
    }
    expect(estToutVoir(admin)).toBe(true);
  });

  it('estToutVoir : le compte du client, avec second facteur validé (strictement vrai), jamais un autre compte', () => {
    expect(estToutVoir(admin)).toBe(true);
    expect(estToutVoir(adminSans2)).toBe(false);
    expect(estToutVoir(adminSansIndication)).toBe(false);
    for (const me of [null, invite, adulte, demo, enseignant, direction, beta, mfaValide])
      expect(estToutVoir(me), String(me?.account?.email)).toBe(false);
    // un enseignant ou un parent dont le second facteur est validé n'est pas « tout voir » pour autant
    expect(estToutVoir({ ...enseignant, mfaRequired: true, mfaVerified: true })).toBe(false);
    expect(estToutVoir({ account: { kind: 'parent' }, mfaVerified: true })).toBe(false);
  });

  it('séances différées : 403 pour la bêta fermée (interrupteur éteint), un parent, un adulte ; 200 pour l’administrateur', () => {
    const betaEteinte: CompteMutun = { ...beta, betaDiffere: false };
    for (const f of differes) {
      for (const me of [betaEteinte, invite, adulte]) expect(decider(f, me), f).toBe(403);
      expect(decider(f, admin), f).toBe(200);
      expect(decider(f, adminSans2), f).toBe(403);
      expect(decider(f, adminSansIndication), f).toBe(403);
      expect(decider(f, null), f).toBe(401);
    }
  });

  it('séances sensibles (risala-tout.json) : 200 pour le SEUL administrateur avec second facteur', () => {
    expect(droitExige('risala-tout.json')).toBe('tout');
    expect(decider('risala-tout.json', admin)).toBe(200);
    for (const me of [
      invite,
      adulte,
      demo,
      demoParent,
      beta,
      enseignant,
      mfaValide,
      direction,
      adminSans2,
      adminSansIndication,
    ])
      expect(decider('risala-tout.json', me), String(me.account?.email)).toBe(403);
    expect(decider('risala-tout.json', null)).toBe(401);
    expect(decider('risala-tout.json', {})).toBe(401);
  });

  it('notes du référent (personnel) : l’administrateur avec second facteur y a droit, pas sans', () => {
    expect(decider('risala-enseignant.json', admin)).toBe(200);
    expect(decider('risala-enseignant.json', adminSans2)).toBe(403);
    expect(decider('risala-enseignant.json', beta)).toBe(403);
  });

  it('audio : le droit « tout » est réservé à l’administrateur avec second facteur ; une session à moitié ouverte : 401', () => {
    expect(deciderAudio('tout', admin)).toBe(200);
    for (const me of [invite, adulte, demo, beta, enseignant, mfaValide, adminSans2])
      expect(deciderAudio('tout', me)).not.toBe(200);
    expect(deciderAudio('tout', adminSans2)).toBe(401);
    expect(deciderAudio('tout', null)).toBe(401);
    // aucun droit inventé : un droit inconnu reste refusé, même pour l'administrateur
    expect(deciderAudio('autre', admin)).toBe(403);
  });

  it('le drapeau `toutVoir` envoyé par le navigateur n’ouvre rien : seule la session (type + second facteur) compte', () => {
    const faux = { ...invite, toutVoir: true } as unknown as CompteMutun;
    const fauxBeta = { ...adulte, toutVoir: true, mfaVerified: true } as unknown as CompteMutun;
    for (const me of [faux, fauxBeta]) {
      expect(estToutVoir(me)).toBe(false);
      expect(decider('risala-tout.json', me)).toBe(403);
      expect(decider('risala-p3.json', me)).toBe(403);
    }
  });

  it('le dossier gardé porte les fichiers du mode : chacun est refusé sans le droit (401 / 403)', () => {
    const fichiers = readdirSync(SORTIE_PROTEGEE).filter((f) => /-tout\.json$/.test(f));
    expect(fichiers).toContain('risala-tout.json');
    for (const f of fichiers) {
      expect(decider(f, null), f).toBe(401);
      expect(decider(f, enseignant), f).toBe(403);
      expect(decider(f, beta), f).toBe(403);
    }
  });
});
