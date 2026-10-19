/**
 * Lecteur audio : commandes de l'écran verrouillé et des écouteurs (Media Session API) — lecture, pause, phrase
 * précédente et suivante, reculer et avancer de 5 secondes, avec le titre de la leçon ou de la séance.
 * Aucune lecture automatique : ces commandes sont des gestes de l'utilisateur.
 */
import { SAUT_S, type Moteur, type Piste } from './moteur.svelte';

type Action = 'play' | 'pause' | 'previoustrack' | 'nexttrack' | 'seekbackward' | 'seekforward';
const ACTIONS: Action[] = [
  'play',
  'pause',
  'previoustrack',
  'nexttrack',
  'seekbackward',
  'seekforward',
];

/** Titre de la leçon ou de la séance : le titre de la page (h1), à défaut celui du document. */
export function titrePage(doc: Pick<Document, 'title' | 'querySelector'> = document): string {
  const h = doc.querySelector('h1')?.textContent?.trim();
  return (h || doc.title || 'Awzid').replace(/\s+/g, ' ').slice(0, 120);
}

/**
 * Branche la session média sur le moteur ; renvoie la fonction qui la débranche (fermeture du lecteur).
 * `nav` est injectable pour les tests.
 */
export function brancherSession<P extends Piste>(
  m: Moteur<P>,
  titre: string,
  nav: Partial<Navigator> | undefined = typeof navigator === 'undefined' ? undefined : navigator,
  album = 'Awzid',
): () => void {
  const ms = nav?.mediaSession;
  if (!ms) return () => undefined;
  const poser = (a: Action, f: (() => void) | null) => {
    try {
      ms.setActionHandler(a, f);
    } catch {
      /* action non prise en charge par ce navigateur */
    }
  };
  poser('play', () => void m.basculer());
  poser('pause', () => void m.basculer());
  poser('previoustrack', () => void m.precedente());
  poser('nexttrack', () => void m.suivante());
  poser('seekbackward', () => m.decaler(-SAUT_S));
  poser('seekforward', () => m.decaler(SAUT_S));
  try {
    ms.metadata = new MediaMetadata({ title: titre, artist: album, album: titre });
  } catch {
    /* MediaMetadata indisponible */
  }
  return () => {
    for (const a of ACTIONS) poser(a, null);
    try {
      ms.metadata = null;
      ms.playbackState = 'none';
    } catch {
      /* rien à défaire */
    }
  };
}

/** Garde l'état « lecture / pause » de l'écran verrouillé à jour. */
export function etatSession(lecture: boolean, nav: Partial<Navigator> | undefined = navigator) {
  try {
    if (nav?.mediaSession) nav.mediaSession.playbackState = lecture ? 'playing' : 'paused';
  } catch {
    /* ignoré */
  }
}
