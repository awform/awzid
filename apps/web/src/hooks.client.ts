/**
 * Crochets du navigateur — exécutés au démarrage de l'application, avant tout chargement de textes :
 *  - les catalogues de textes sont demandés sous l'adresse de LA version de l'application (jamais l'ancien catalogue
 *    d'une version précédente, gardé par un ancien service worker) ;
 *  - en production, une clé manquante n'affiche jamais une clé brute (texte français par défaut, voir `t`).
 */
import { dev, version } from '$app/environment';
import { setCatalogVersion, setStrictKeys } from '$lib/i18n';

setCatalogVersion(dev ? null : version);
setStrictKeys(dev);
