/**
 * « Famille de mots » (3/11/2026, interrupteur `racines_coran`) : fabrique les fichiers COMPACTS servis à la demande par l'API
 * (`packages/content/racines/index.json` + un fichier par famille `NNN.json`) depuis les deux fichiers du référent
 * (`familles_racines.json`, rangs 1-1000 ; `familles_racines_2000.json`, rangs 1001-2000). Usage :
 *   node packages/content/scripts/racines-compact.mjs <dossier des deux fichiers> [dossier de sortie]
 * Les chaînes arabes sont recopiées OCTET POUR OCTET (aucune normalisation) ; seuls les mots `affiche: true` sont gardés.
 * Familles : 1-212 = parcours des rangs 1-1000 (ordre `rang`) ; 213… = 72 nouvelles familles des rangs 1001-2000 (A11 puis A12) ;
 * les « cousins » des rangs 1001-2000 dont la famille existe sont AJOUTÉS à cette famille (niveau A11/A12 : signalés à l'écran).
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const src = resolve(process.argv[2] ?? '.');
const out = resolve(process.argv[3] ?? join(import.meta.dirname, '..', 'racines'));
const lire = (f) => JSON.parse(readFileSync(join(src, f), 'utf8'));
const a = lire('familles_racines.json');
const b = lire('familles_racines_2000.json');
const niv = (x) => Number(/^A(\d+)$/.exec(x)?.[1] ?? 0);

/** Aucune translittération côté élève : on retire les parenthèses qui en portent (« prière rituelle (ṣalât) » → « prière rituelle »). */
const LATIN = /[ʿʾāīūḥṣḍṭẓġḵ]/i;
let nettoyes = 0;
const net = (x) => {
  const y = x
    .replaceAll('ẓihār', 'ظِهَار')
    .replace(/\s*\([^()]*[ʿʾāīūḥṣḍṭẓġḵ][^()]*\)/gi, '')
    .trim();
  if (y !== x) nettoyes++;
  return y;
};
const mot = (m) => {
  const e = m.exemple_prefere ?? m.exemple;
  return {
    n: m.n,
    f: m.forme,
    e: net(m.etiquette_eleve),
    v: m.forme_verbale || undefined,
    m: m.moule,
    ml: m.moule_lettres.map((l) => [l.index, l.fin]),
    me: net(m.moule_explication),
    s: net(m.sens),
    fr: m.frequence,
    na: niv(m.niveau_adultes),
    ne: m.niveau_enfants || undefined,
    rl: m.racine_lettres.map((l) => [l.index, l.fin, l.statut]),
    ln: m.lettres_notes.map(net),
    x: {
      t: e.texte,
      r: e.reference,
      i: e.mot_index,
      l: e.mot.length,
      ...(e.type === 'extrait' ? { x: 1 } : {}),
    },
    h: m.homographes.length ? m.homographes : undefined,
    d: m.drapeaux.filter((d) => d === 'DISC' || d === 'LOIN').length
      ? m.drapeaux.filter((d) => d === 'DISC' || d === 'LOIN')
      : undefined,
  };
};

const fams = [];
for (const f of a.familles.filter((x) => x.rang))
  fams.push({ src: f, mots: f.mots.filter((m) => m.affiche), ordre: [...f.ordre_cousins] });
const parRacine = new Map(fams.map((f) => [f.src.racine, f]));
let ajoutes = 0;
let sansFamille = 0;
for (const c of b.cousins) {
  const f = parRacine.get(c.racine);
  if (!f) {
    sansFamille++;
    continue;
  }
  for (const m of c.mots.filter((x) => x.affiche)) {
    f.mots.push(m);
    f.ordre.push(m.n);
    ajoutes++;
  }
}
for (const f of b.nouvelles_familles)
  fams.push({ src: f, mots: f.mots.filter((m) => m.affiche), ordre: [...f.ordre_cousins] });
fams.forEach((f, i) => {
  f.id = i + 1;
});
const idDe = new Map(fams.map((f) => [f.src.racine, f.id]));

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const index = { total: a.meta.total_mots_coran, f: [] };
for (const f of fams) {
  const s = f.src;
  const mots = f.mots.map(mot);
  const par = new Map(mots.map((m) => [m.n, m]));
  const ordre = f.ordre.filter((n) => par.has(n));
  const niveau = s.rang ? niv(s.niveau_intro) : niv(s.niveau_intro);
  const accroche = par.get(s.accroche) ?? par.get(ordre[0]);
  const fam = {
    i: f.id,
    r: s.racine,
    w: s.racine_faible ? 1 : undefined,
    s: s.sens_racine,
    n: niveau,
    a: accroche.n,
    o: ordre,
    k: s.enfants?.length ? s.enfants.filter((n) => par.has(n)) : undefined,
    u: idDe.get(s.suivante) || undefined,
    l: s.lien_suivante?.length ? s.lien_suivante : undefined,
    mots,
  };
  writeFileSync(join(out, `${String(f.id).padStart(3, '0')}.json`), JSON.stringify(fam));
  index.f.push({
    i: f.id,
    r: s.racine,
    s: s.sens_racine,
    n: niveau,
    e: fam.k ? 1 : 0,
    a: { f: accroche.f, s: accroche.s },
    w: mots.map((m) => [m.n, m.fr]),
  });
}
writeFileSync(join(out, 'index.json'), JSON.stringify(index));
console.log(
  JSON.stringify({
    nettoyes,
    restes: fams
      .flatMap((f) =>
        f.mots.flatMap((m) => [m.etiquette_eleve, m.sens, m.moule_explication, ...m.lettres_notes]),
      )
      .map((x) => net(x))
      .filter((x) => LATIN.test(x))
      .slice(0, 8),
    familles: fams.length,
    cousinsAjoutes: ajoutes,
    cousinsSansFamille: sansFamille,
    enfants: index.f.filter((x) => x.e).length,
  }),
);
