/**
 * Fournisseurs SIMULÉS du tuteur de conversation (tests, démonstration) : déterministes, sans réseau, sans clé.
 *  - conversation : répond par la réplique SUIVANTE du dialogue de la leçon (texte des livres) ; corrige si
 *    l'élève a dit une réplique du dialogue avec une petite différence ;
 *  - voix : un court son WAV (aucun appel).
 * Crochet de test : un « audio » dont le contenu commence par « SIMULE: » est pris pour la transcription.
 */
import { bareWords } from '../arabic.js';
import { BORNES } from './budget.js';
import { comparerReplique, motsEcrits } from './guidee.js';
import type { ConvEntree, ConvFournisseur, ConvSortieFournisseur, Synthese } from './types.js';

export class ConversationSimulee implements ConvFournisseur {
  readonly name = 'simule';
  readonly real = false;
  constructor(readonly modele = 'gemini-3.8-flash') {}

  async repondre(systeme: string, e: ConvEntree): Promise<ConvSortieFournisseur> {
    const d = e.contexte.dialogue;
    let dit = e.texte ?? '';
    if (e.audio) {
      const brut = e.audio.data.toString('utf8');
      dit = brut.startsWith('SIMULE:') ? brut.slice(7) : (d[1]?.ar ?? d[0]?.ar ?? '');
    }
    // réplique du dialogue la plus proche de ce qu'a dit l'élève
    let best = -1;
    let score = 0;
    d.forEach((r, i) => {
      const c = comparerReplique(r.ar, motsEcrits(dit));
      const s = c.total ? c.justes / c.total : 0;
      if (s > score) {
        score = s;
        best = i;
      }
    });
    const suite = d[(best + 1) % Math.max(d.length, 1)] ?? {
      ar: 'مَا هٰذَا؟',
      fr: 'Qu’est-ce que c’est ?',
    };
    const proche = best >= 0 && score >= 0.5 && score < 1 ? d[best]! : null;
    const brouillon = {
      transcription_ar: e.audio ? dit : '',
      sujet: 'langue',
      correction: proche
        ? {
            dit,
            correct: proche.ar,
            explication_fr:
              e.adresse === 'vous'
                ? 'Presque ! Comparez avec la phrase du livre et redites-la.'
                : 'Presque ! Compare avec la phrase du livre et redis-la.',
          }
        : null,
      reponse_ar: suite.ar,
      reponse_fr: suite.fr ?? '',
    };
    // usage PLAUSIBLE (le compteur de dépense et les plafonds se testent en mode simulé)
    const usage = {
      texte: Math.min(BORNES.texteMax, Math.ceil(systeme.length / 3) + 40 * e.historique.length),
      audio: e.audio ? Math.ceil(e.audio.secondes * 32) : 0,
      sortie: 120 + 4 * bareWords(suite.ar).length,
    };
    return { status: 'ok', brouillon, usage };
  }
}

/** WAV mono 16 kHz, 0,3 s, son doux (aucun appel de synthèse). */
function wavCourt(): Buffer {
  const n = 4800;
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + n * 2, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(16000, 24);
  b.writeUInt32LE(32000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++)
    b.writeInt16LE(
      Math.round(1200 * Math.sin((2 * Math.PI * 440 * i) / 16000) * Math.sin((Math.PI * i) / n)),
      44 + i * 2,
    );
  return b;
}

export class SyntheseSimulee implements Synthese {
  readonly name = 'simule';
  readonly real = false;
  async lire(texteAr: string) {
    return { mime: 'audio/wav', data: wavCourt(), caracteres: [...texteAr].length };
  }
}
