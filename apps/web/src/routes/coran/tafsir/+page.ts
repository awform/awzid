// « Tafsīr du niveau » (interrupteur `tafsir_sens`) : textes français de la page, chargés avec elle seulement (route gardée au premier usage).
import textes from '$lib/tafsir/textes-fr.json';
import { ajouterTextes } from '$lib/i18n';

ajouterTextes(textes);
