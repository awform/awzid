// BANC DU SUIVI DE LA RÉCITATION : analyse des lectures de banc.py avec le code de l'appli (@awform/hifz).
//   node banc.mjs <tanzil.tsv> <banc-dir> <methode:fichier> [<methode:fichier> ...]
//   ex. node banc.mjs tanzil-uthmani.tsv ~/tarteel2-banc base:lect-base.json fen:lect-fen.json
// Rejoue la séance en TEMPS RÉEL : l'audio arrive à la vitesse de la parole, le client envoie ce qu'il a dès que la
// requête précédente est revenue (plus de 1 s pour « base », 0,5 s pour « fen »), le service met le temps de calcul
// MESURÉ (python), le réseau coûte RTT (aller-retour, 0,15 s par défaut). À chaque réponse on calcule ce qui serait
// MONTRÉ à l'élève (mots dévoilés, écarts signalés) avec le code de production, et on note quand.
// Mesures :
//   - délai d'un mot : de la FIN du mot (instants de la lecture de toute la séance) à son dévoilement ;
//   - mots suivis : part des mots récités (retrouvés dans la lecture complète) dévoilés à la fin ;
//   - fausses alertes : tout écart montré qui ne correspond pas à l'erreur simulée (séances normales : tout écart) ;
//   - erreurs vues et délai : de l'instant de l'erreur au premier écart montré sur le mot visé (± 1 mot).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

// HIFZ=<dossier dist> : comparer avec un autre état du code (ex. le comparateur d'AVANT le chantier)
const HIFZ = resolve(
  process.env.HIFZ ?? new URL('../../../packages/hifz/dist', import.meta.url).pathname,
);
const { FenetreSuivi, REGLAGES_FENETRE, etatSuivi, instantsDesMots, motsAttendus } = await import(
  pathToFileURL(join(HIFZ, 'index.js')).href
);

const [TSV, DIR, ...METHODES] = process.argv.slice(2);
const REGL = process.env.REGLAGES
  ? { ...REGLAGES_FENETRE, ...JSON.parse(process.env.REGLAGES) }
  : REGLAGES_FENETRE;
const RTT = Number(process.env.RTT ?? 0.15);
const GRAIN = 0.128; // ScriptProcessor 4096 échantillons : l'audio arrive par paquets de 0,256 s
const T = new Map();
for (const l of readFileSync(TSV, 'utf8').split('\n')) {
  const x = l.replace(/\r$/, '').replace(/\uFEFF/g, '');
  const t = x.indexOf('\t');
  if (t > 0) T.set(x.slice(0, t).trim(), x.slice(t + 1));
}
const SESS = JSON.parse(readFileSync(join(DIR, 'sessions.json'), 'utf8'));
const parId = new Map(SESS.map((s) => [s.id, s]));
/** EXPORT=<fichier> : mots attendus (texte Tanzil) et instants de référence par séance, pour gop.py */
const EXPORTE = {};
const q = (a, p) =>
  a.length ? [...a].sort((x, y) => x - y)[Math.floor((a.length - 1) * p)] : null;
const r2 = (x) => (x === null || x === undefined ? null : Math.round(x * 100) / 100);
const NORMAL = new Set(['juste', 'bruit', 'telephone', 'pause', 'repete', 'reprise', 'retour']);
const SUIVIS = new Set(['juste', 'bruit', 'telephone', 'pause']);

/** Réponses du service, avec l'heure (secondes de la séance) à laquelle l'appareil les reçoit. */
function planifier(methode, reads) {
  const out = [];
  if (methode === 'base') {
    let fini = 0;
    for (const r of reads) {
      const envoi = Math.max(r.t + GRAIN, fini);
      fini = envoi + r.calcul + RTT;
      out.push({ recu: fini, r });
    }
    return out;
  }
  // fenêtre : lectures sur une grille de `hop` s ; le client envoie dès que la requête précédente est revenue et qu'il a
  // HOP_CLIENT s d'audio de plus ; le service lit la fenêtre qui finit au dernier point de la grille disponible
  const hop = reads.length > 1 ? reads[1].t - reads[0].t : 0.5;
  const parT = new Map(reads.map((r) => [Math.round(r.t / hop), r]));
  const dernier = Math.round(reads[reads.length - 1].t / hop);
  const min = Number(process.env.HOP_CLIENT ?? hop);
  let a = 0;
  let fini = 0;
  while (a < dernier) {
    const envoi = Math.max(fini, a * hop + min + GRAIN);
    let g = Math.min(dernier, Math.floor((envoi - GRAIN) / hop + 1e-9));
    if (g <= a) g = a + 1;
    const r = parT.get(g);
    if (!r) break;
    fini = envoi + r.calcul + RTT;
    out.push({ recu: fini, r });
    a = g;
  }
  return out;
}

function analyser(methode, lect) {
  const res = {
    seances: 0,
    types: {},
    delais: [],
    suivis: 0,
    attendus: 0,
    calculs: [],
    fausses: [],
    delaisErr: [],
  };
  for (const L of lect) {
    const se = parId.get(L.id);
    const att = motsAttendus(
      se.versets.map(([s, a]) => ({ s, a, text: T.get(`${s}:${a}`) })),
      T.get('1:1'),
    );
    const inst = instantsDesMots(att, se.ref, false);
    if (process.env.EXPORT)
      EXPORTE[se.id] = { mots: att.map((m) => m.texte), inst, verite: se.verite, type: se.type };
    const plan = planifier(methode, L.reads);
    const premierOk = new Map();
    const vues = new Map(); // écart -> première heure
    const v = se.verite;
    let vu = null;
    let dernier = null;
    const fen = methode === 'fen' ? new FenetreSuivi(REGL) : null;
    const base = { stables: [], stablesCtc: [], provisoires: [], partiel: [], voix: [] };
    for (const { recu, r } of plan) {
      res.calculs.push(r.calcul);
      let e;
      if (fen) {
        fen.ajouter({ t: r.t, mots: r.mots, motsCtc: r.mots_ctc, voix: r.voix });
        e = fen.entree();
      } else {
        base.stables.push(...r.stables);
        base.stablesCtc.push(...r.stables_ctc);
        if (r.provisoires) base.provisoires = r.provisoires;
        base.voix.push(...r.voix);
        base.partiel = r.partiel ?? [];
        e = base;
      }
      const { resultat } = etatSuivi(att, e);
      dernier = { resultat, e };
      resultat.mots.forEach((m, i) => {
        if (m === 'ok' && !premierOk.has(i)) premierOk.set(i, recu);
      });
      for (const x of resultat.ecarts) {
        const juste = v && x.fin >= v.i - 1 && x.i <= v.fin + 1;
        if (juste) {
          if (vu === null) vu = recu;
          continue;
        }
        const k = `${x.type}:${x.i}`;
        if (!vues.has(k)) {
          vues.set(k, recu);
          if (process.env.DIAG)
            console.error(
              `[${methode}] ${se.id} ${se.type} ${se.rid} t=${r.t} recu=${r2(recu)} ${x.type} i=${x.i}-${x.fin} attendu « ${att
                .slice(Math.max(0, x.i - 2), x.fin + 3)
                .map((z) => z.cle)
                .join(' ')} » entendu « ${e.stables
                .filter((w) => (w.t0 ?? 0) > recu - 14)
                .map((w) => w.w)
                .join(' ')} »`,
            );
        }
      }
    }
    if (process.env.DIAGMISS && v && vu === null && dernier) {
      const { resultat, e } = dernier;
      const a = Math.max(0, v.i - 3);
      const b = v.fin + 4;
      console.error(
        `[MISS ${methode}] ${se.id} ${se.type} ${se.rid} t=${v.t} i=${v.i}-${v.fin}\n  attendu : ${att
          .slice(a, b)
          .map((z, k) => `${z.cle}(${resultat.mots[a + k]})`)
          .join(' ')}\n  entendu : ${e.stables
          .filter((w) => (w.t0 ?? 0) > v.t - 5 && (w.t0 ?? 0) < v.t + 7)
          .map((w) => `${w.w}[${w.conf}]`)
          .join(
            ' ',
          )}\n  écarts finaux : ${JSON.stringify(resultat.ecarts.map((z) => `${z.type}:${z.i}-${z.fin}`))} doutes=${resultat.doutes} statut=${resultat.statut}`,
      );
    }
    const T_ = (res.types[se.type] ??= {
      n: 0,
      fausses: 0,
      seancesFausses: 0,
      vues: 0,
      delais: [],
    });
    T_.n++;
    res.seances++;
    T_.fausses += vues.size;
    if (vues.size) T_.seancesFausses++;
    if (v) {
      if (vu !== null) {
        T_.vues++;
        T_.delais.push(vu - v.t);
        res.delaisErr.push(vu - v.t);
      }
    }
    if (SUIVIS.has(se.type)) {
      inst.forEach((z, i) => {
        if (!z) return;
        res.attendus++;
        const o = premierOk.get(i);
        if (o !== undefined) {
          res.suivis++;
          res.delais.push(Math.max(0, o - z[1]));
        }
      });
    }
  }
  const norm = Object.entries(res.types).filter(([k]) => NORMAL.has(k));
  return {
    seances: res.seances,
    delai_mot_s: {
      mediane: r2(q(res.delais, 0.5)),
      p90: r2(q(res.delais, 0.9)),
      moins_de_1_5s: r2(res.delais.filter((d) => d <= 1.5).length / (res.delais.length || 1)),
      moins_de_3s: r2(res.delais.filter((d) => d <= 3).length / (res.delais.length || 1)),
    },
    mots_suivis: `${res.suivis}/${res.attendus} (${r2((100 * res.suivis) / (res.attendus || 1))} %)`,
    fausses_alertes_normales: {
      total: norm.reduce((s, [, t]) => s + t.fausses, 0),
      seances: `${norm.reduce((s, [, t]) => s + t.seancesFausses, 0)}/${norm.reduce((s, [, t]) => s + t.n, 0)}`,
      par_type: Object.fromEntries(
        norm.map(([k, t]) => [k, `${t.seancesFausses}/${t.n} séances, ${t.fausses} alertes`]),
      ),
    },
    erreurs_vues: Object.fromEntries(
      Object.entries(res.types)
        .filter(([k]) => !NORMAL.has(k))
        .map(([k, t]) => [
          k,
          `${t.vues}/${t.n}, ${t.fausses} autres alertes, délai médian ${r2(q(t.delais, 0.5))} s`,
        ]),
    ),
    delai_erreur_s: { mediane: r2(q(res.delaisErr, 0.5)), p90: r2(q(res.delaisErr, 0.9)) },
    calcul_par_lecture_s: {
      mediane: r2(q(res.calculs, 0.5)),
      p90: r2(q(res.calculs, 0.9)),
      max: r2(q(res.calculs, 1)),
    },
  };
}

const sortie = {};
for (const m of METHODES) {
  const [nom, f] = m.split(':');
  const lect = JSON.parse(readFileSync(join(DIR, f), 'utf8'));
  sortie[`${nom}:${f}`] = analyser(nom, lect);
}
if (process.env.EXPORT) writeFileSync(process.env.EXPORT, JSON.stringify(EXPORTE));
console.log(JSON.stringify({ rtt_s: RTT, sessions: SESS.length, resultat: sortie }, null, 1));
