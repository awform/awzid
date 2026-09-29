import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Emballage Android de la PWA (lot 16). L'application ouvre le site AWFORM (AWFORM_ANDROID_URL, par défaut
 * la démonstration du réseau local) : le code, les mises à jour et le hors ligne (service worker) sont ceux
 * de la PWA. Identifiant provisoire « org.awform.app » : à confirmer avant toute publication (il ne
 * change plus ensuite). Aucune clé ni aucun compte dans ce fichier.
 */
const url = process.env.AWFORM_ANDROID_URL ?? 'https://192.168.50.10';

const config: CapacitorConfig = {
  appId: 'org.awform.app',
  appName: 'AWFORM',
  webDir: 'www',
  server: {
    url,
    // http seulement pour une démonstration sur le réseau local ; la production est en https
    cleartext: url.startsWith('http://'),
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: false,
    webContentsDebuggingEnabled: process.env.AWFORM_ANDROID_DEBUG === '1',
  },
};

export default config;
