/**
 * Lecteur audio des phrases — point d'entrée CHARGÉ À LA DEMANDE (import dynamique au premier appui sur
 * « Écouter » : leçons, lectures, Madjaliss, douas). Le lecteur n'existe pas avant ; il apparaît après cet appui,
 * se fixe au-dessus de la barre de navigation et se ferme. Mêmes sources audio que l'existant (le résolveur de
 * chaque famille : copie de l'appareil d'abord, puis le réseau) ; jamais de lecture automatique.
 */
import { mount, unmount } from 'svelte';
import { loadTexts } from '$lib/i18n';
import { stopLessonAudio } from '$lib/lecons-audio';
import Lecteur from './Lecteur.svelte';
import { Moteur, type Source } from './moteur.svelte';
import { CLASSE_ACTIVE, lirePistes, montrer, type PisteDom } from './pistes';
import { titrePage } from './session';

export type Resolveur = (ref: string) => Promise<Source | null>;

export interface Ouverture {
  declencheur: HTMLElement;
  /** famille des boutons (`data-lecteur`) : l = leçons et lectures, m = Madjaliss, d = douas */
  type: string;
  resoudre: Resolveur;
  /** vitesse imposée (bouton « lent ») */
  vitesse?: number;
}

interface Ouvert {
  type: string;
  moteur: Moteur<PisteDom>;
  fermer: () => void;
}
let ouvert: Ouvert | null = null;

function surPiste(p: PisteDom | null) {
  for (const e of document.querySelectorAll(`.${CLASSE_ACTIVE}`)) e.classList.remove(CLASSE_ACTIVE);
  if (!p) return;
  p.cible.classList.add(CLASSE_ACTIVE);
  montrer(p.cible);
}

/** Ouvre le lecteur (ou le réutilise) et joue la phrase du bouton pressé. */
export async function ouvrir(o: Ouverture): Promise<void> {
  await loadTexts('lecteur');
  if (ouvert && ouvert.type === o.type) {
    const m = ouvert.moteur;
    m.maj(lirePistes(o.type), o.declencheur);
    const i = m.pistes.findIndex((p) => p.cle === o.declencheur);
    if (i < 0) return;
    if (o.vitesse) m.regler(o.vitesse);
    // un second appui sur la phrase qui joue la met en pause ; sur une phrase en pause, il la rejoue
    if (i === m.index && m.lecture && !o.vitesse) return void (await m.basculer());
    return void (await m.jouer(i));
  }
  ouvert?.fermer();
  const pistes = lirePistes(o.type);
  const i = pistes.findIndex((p) => p.cle === o.declencheur);
  if (i < 0) return;
  const audio = new Audio();
  // un seul son à la fois : les animations des leçons se taisent quand le lecteur joue, et inversement
  audio.addEventListener('play', stopLessonAudio);
  const autreSon = () => audio.pause();
  document.addEventListener('awzid-son', autreSon);
  const moteur = new Moteur<PisteDom>(audio, {
    resoudre: (p) => o.resoudre(p.ref),
    surPiste,
    relire: () => lirePistes(o.type),
    vitesse: o.vitesse,
  });
  moteur.maj(pistes);
  const fermer = () => {
    if (ouvert?.moteur !== moteur) return;
    ouvert = null;
    document.removeEventListener('awzid-son', autreSon);
    audio.removeEventListener('play', stopLessonAudio);
    moteur.fermer();
    void unmount(app);
  };
  const app = mount(Lecteur, {
    target: document.body,
    props: { moteur, titre: titrePage(), onfermer: fermer },
  });
  ouvert = { type: o.type, moteur, fermer };
  await moteur.jouer(i);
}
