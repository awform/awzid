/**
 * V2-4 : ouverture de la bascule Moi / enfants, chargée au premier toucher sur le prénom du profil actif (module
 * à la demande : rien n'est ajouté à la coquille de l'élève). La feuille est montée sur la page et se démonte à sa
 * fermeture ; le focus revient au bouton qui l'a ouverte.
 */
import { mount, unmount } from 'svelte';
import type { DevProfile } from './attempts';
import { loadTexts } from './i18n';
import type { Me } from './session';
import BasculeProfils from './BasculeProfils.svelte';

export async function ouvrir(me: Me, actif: DevProfile | null): Promise<void> {
  const declencheur = document.activeElement as HTMLElement | null;
  await loadTexts('rares');
  const feuille = mount(BasculeProfils, {
    target: document.body,
    props: {
      me,
      actif,
      onferme: () => {
        void unmount(feuille);
        declencheur?.focus();
      },
    },
  });
}
