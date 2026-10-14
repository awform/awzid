// Madjaliss lot 4 : assemble la Risāla d'Ibn Abī Zayd al-Qayrawānī (26 fichiers du référent par chapitre) en trois
// fichiers de même forme que les autres textes (texte_ar.json, traduction_fr.json, seances.json) dans
// packages/content/madjaliss-source/risala/ — que lisent le convertisseur `madjaliss.mjs` et ses tests.
//  - AUCUNE phrase n'est modifiée : chaque objet de phrase est repris tel quel (JSON relu puis réécrit, chaînes
//    inchangées, jamais de normalisation Unicode) ; les phrases sont rangées dans l'ordre du livre (`ordre_livre`) ;
//    l'assemblage échoue si une phrase arabe n'a pas sa traduction (ou l'inverse), si un identifiant ou un ordre est
//    en double, si un statut n'est pas EN_ATTENTE_SECONDE_LECTURE.
//  - Les SÉANCES n'existent pas côté référent (RAPPORT_PURIFICATION : « le découpage en séances viendra après la
//    relecture ») : découpage MÉCANIQUE, chapitre par chapitre, 12 phrases au plus par séance (jamais terminée par un
//    titre), à remplacer par le découpage du référent. Cycle 3 pour toutes (la Risāla est au cycle 3 du plan
//    directeur) : toutes en publication différée.
//  - Renvois : séances des autres textes qui traitent du même sujet (alignement du référent), quand la phrase cible
//    appartient à une séance.
//  - LOT 6 (14/10/2026) : le découpage PÉDAGOGIQUE du référent (264 séances, `seances.json` livré par le référent avec
//    `cycle`, `niveau_min`, `differe`, `raison_differe` par séance) remplace le découpage mécanique : il est copié tel
//    quel (SHA-256 contrôlé) et cet assembleur ne réécrit PLUS `seances.json` (sauf avec `--decoupage-mecanique`, pour
//    retrouver l'ancien découpage de 164 séances). Il écrit seulement `texte_ar.json`, `traduction_fr.json` et les
//    empreintes ; il vérifie en plus que le découpage du référent range chaque phrase dans exactement une séance.
// Usage : node scripts/risala-assembler.mjs <dossier des 78 fichiers bruts du référent> [--decoupage-mecanique]
// Empreintes des fichiers bruts : packages/content/madjaliss-source/risala/SOURCES_BRUTES.sha256
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SOURCES = join(repo, 'packages', 'content', 'madjaliss-source');
const SORTIE = join(SOURCES, 'risala');
const STATUT = 'EN_ATTENTE_SECONDE_LECTURE';
export const MAX_PAR_SEANCE = 12;

const lire = (p) => JSON.parse(readFileSync(p, 'utf8'));
const ecrire = (p, o) => writeFileSync(p, `${JSON.stringify(o)}\n`);

/** Taille des morceaux : égaux à une unité près, jamais plus de MAX_PAR_SEANCE. */
export function decouper(phrases, max = MAX_PAR_SEANCE) {
  const n = phrases.length;
  const k = Math.ceil(n / max);
  const bornes = [];
  for (let i = 1; i < k; i++) bornes.push(Math.round((i * n) / k));
  // un morceau ne se termine pas sur un titre : la coupure recule d'un cran
  for (let i = 0; i < bornes.length; i++) {
    const debut = i ? bornes[i - 1] : 0;
    if (phrases[bornes[i] - 1].type === 'titre' && bornes[i] - 1 > debut) bornes[i] -= 1;
  }
  const out = [];
  let d = 0;
  for (const b of [...bornes, n]) {
    out.push(phrases.slice(d, b));
    d = b;
  }
  return out;
}

export function assembler(brut) {
  const noms = readdirSync(brut);
  const ars = noms.filter((f) => /^texte_ar.*\.json$/.test(f));
  const frs = noms.filter((f) => /^traduction_fr.*\.json$/.test(f));
  if (ars.length !== 26 || frs.length !== 26)
    throw new Error('26 fichiers arabes et 26 traductions attendus');
  const ar = new Map();
  const fr = new Map();
  const variantes = new Map();
  let base;
  for (const f of ars) {
    const j = lire(join(brut, f));
    if (j.statut !== STATUT) throw new Error(`${f} : statut ${j.statut}`);
    if (f === 'texte_ar.json') base = j;
    for (const p of j.phrases) {
      if (ar.has(p.id)) throw new Error(`doublon ${p.id}`);
      ar.set(p.id, p);
    }
    for (const v of j.variantes ?? []) if (v?.id && !variantes.has(v.id)) variantes.set(v.id, v);
  }
  for (const f of frs) {
    const j = lire(join(brut, f));
    if (j.statut_global !== STATUT) throw new Error(`${f} : statut ${j.statut_global}`);
    for (const p of j.phrases) {
      if (fr.has(p.id)) throw new Error(`doublon fr ${p.id}`);
      fr.set(p.id, p);
    }
  }
  if (ar.size !== fr.size) throw new Error(`${ar.size} phrases arabes, ${fr.size} traductions`);
  const ordres = new Set();
  for (const [id, p] of ar) {
    const f = fr.get(id);
    if (!f) throw new Error(`traduction manquante ${id}`);
    if (f.ordre_livre !== p.ordre_livre) throw new Error(`ordre différent ${id}`);
    if (ordres.has(p.ordre_livre)) throw new Error(`ordre en double ${p.ordre_livre}`);
    ordres.add(p.ordre_livre);
  }
  const phrasesAr = [...ar.values()].sort((a, b) => a.ordre_livre - b.ordre_livre);
  const phrasesFr = phrasesAr.map((p) => fr.get(p.id));

  // séances : par chapitre, dans l'ordre du livre
  const chapitres = [];
  for (const p of phrasesAr) {
    if (!chapitres.length || chapitres[chapitres.length - 1].nom !== p.chapitre)
      chapitres.push({ nom: p.chapitre, phrases: [] });
    chapitres[chapitres.length - 1].phrases.push(p);
  }
  const noms2 = new Set(chapitres.map((c) => c.nom));
  if (noms2.size !== chapitres.length)
    throw new Error('un chapitre est coupé en deux dans l’ordre du livre');
  const titreDe = (c) => {
    if (c.nom === 'Intro') return 'Introduction de l’auteur';
    const t = c.phrases.find((p) => p.type === 'titre');
    const f = t ? fr.get(t.id).fr : `Chapitre ${c.nom}`;
    return `${c.nom}. ${f.replace(/\.$/, '')}`;
  };
  const seances = [];
  for (const c of chapitres) {
    const morceaux = decouper(c.phrases);
    const titre = titreDe(c);
    morceaux.forEach((m, i) => {
      seances.push({
        id: `RIS-S${String(seances.length + 1).padStart(3, '0')}`,
        titre: morceaux.length > 1 ? `${titre} (${i + 1}/${morceaux.length})` : titre,
        chapitre: c.nom,
        cycle: 3,
        niveau_min: 'cycle 3',
        phrases: m.map((p) => p.id),
        duree_min: Math.max(4, Math.round(2 + 0.7 * m.length)),
        mots_difficiles: [],
      });
    });
  }
  const seanceDe = new Map(seances.flatMap((s) => s.phrases.map((id) => [id, s.id])));

  // renvois vers les séances des autres textes (alignement du référent)
  const CIBLES = {
    akhdari: 'akhdari',
    ashmawiyya: 'ashmawiyya',
    ibn_ashir: 'ibn-ashir',
    izziyya: 'izziyya',
  };
  const seanceAutre = {};
  for (const [cle, dossier] of Object.entries(CIBLES)) {
    const m = new Map();
    for (const s of lire(join(SOURCES, dossier, 'seances.json')).seances)
      for (const id of s.phrases ?? s.vers ?? s.hadith ?? []) if (!m.has(id)) m.set(id, s.id);
    seanceAutre[cle] = m;
  }
  const renvois = new Map();
  for (const f of noms.filter((x) => /^alignement_.*\.json$/.test(x))) {
    for (const r of lire(join(brut, f)).regles ?? []) {
      const miennes = new Set((r.risala ?? []).map((id) => seanceDe.get(id)).filter(Boolean));
      const autres = [];
      for (const cle of Object.keys(CIBLES))
        for (const id of r[cle] ?? []) {
          const s = seanceAutre[cle].get(id);
          if (s && !autres.includes(s)) autres.push(s);
        }
      for (const s of miennes) {
        const l = renvois.get(s) ?? [];
        for (const a of autres) if (!l.includes(a)) l.push(a);
        renvois.set(s, l);
      }
    }
  }
  for (const s of seances) {
    const r = (renvois.get(s.id) ?? []).slice(0, 8);
    if (r.length) s.renvois = r;
  }

  const texteAr = {
    oeuvre: base.oeuvre,
    auteur: base.auteur,
    statut: STATUT,
    assemble_de: `${ars.length} fichiers du référent (empreintes : SOURCES_BRUTES.sha256), phrases dans l'ordre du livre`,
    temoins: base.temoins,
    variantes: [...variantes.values()],
    phrases: phrasesAr,
  };
  const trad = lire(join(brut, 'traduction_fr.json'));
  const traduction = {
    oeuvre: trad.oeuvre.replace(/\s+—.*$/, ''),
    langue: 'fr',
    traduction: trad.traduction,
    statut_global: STATUT,
    phrases: phrasesFr,
  };
  const duree = seances.reduce((t, s) => t + s.duree_min, 0);
  const sea = {
    titre: 'Découpage en séances (majālis) — ar-Risāla',
    statut: STATUT,
    cycle: 3,
    niveau_min: 'cycle 3',
    principe:
      'Découpage MÉCANIQUE (pas celui du référent, qui n’en a pas fourni) : chapitre par chapitre, 12 phrases au plus par séance. Durée estimée = 2 min + 0,7 min par phrase ; à recaler sur l’enregistrement réel du lecteur.',
    a_confirmer:
      'Découpage mécanique proposé par Claude le 13/10/2026 (aucun découpage du référent n’existait : « le découpage en séances viendra après la relecture »). À remplacer par un découpage pédagogique : le texte de chaque séance ne change pas, seules les coupures et les titres changent.',
    point_referent:
      'Publication différée de toute la Risāla (cycle 3 du plan directeur, 13/10/2026) : ses séances sont masquées aux invités de la bêta (hors personnel et démonstration) tant que le référent n’a pas fixé le découpage et les séances ouvertes à chaque cycle.',
    nombre_de_seances: seances.length,
    duree_totale_min: duree,
    seances,
  };
  return { texteAr, traduction, sea };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const brut = process.argv[2];
  if (!brut)
    throw new Error('usage : node scripts/risala-assembler.mjs <dossier des fichiers bruts>');
  const { texteAr, traduction, sea } = assembler(brut);
  ecrire(join(SORTIE, 'texte_ar.json'), texteAr);
  ecrire(join(SORTIE, 'traduction_fr.json'), traduction);
  if (process.argv.includes('--decoupage-mecanique')) ecrire(join(SORTIE, 'seances.json'), sea);
  else {
    // découpage du référent (lot 6) : conservé tel quel ; chaque phrase doit être dans exactement une séance, dans l'ordre
    const ref = lire(join(SORTIE, 'seances.json'));
    const vues = ref.seances.flatMap((s) => s.phrases);
    const ordre = texteAr.phrases.map((p) => p.id);
    if (JSON.stringify(vues) !== JSON.stringify(ordre))
      throw new Error('le découpage du référent ne range pas chaque phrase une fois, dans l’ordre');
  }
  const sha = readdirSync(brut)
    .filter((f) => /\.json$/.test(f))
    .sort()
    .map(
      (f) =>
        `${createHash('sha256')
          .update(readFileSync(join(brut, f)))
          .digest('hex')}  ${f}`,
    );
  writeFileSync(join(SORTIE, 'SOURCES_BRUTES.sha256'), `${sha.join('\n')}\n`);
  console.log(
    `${texteAr.phrases.length} phrases (découpage mécanique : ${sea.seances.length} séances)`,
  );
}
