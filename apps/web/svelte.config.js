import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter(),
    // chemins absolus : la coquille mise en cache (« / ») doit fonctionner sous n'importe quelle URL hors ligne
    paths: { relative: false },
    serviceWorker: { register: true },
    // politique de sécurité du contenu : aucune ressource tierce (polices servies par nos soins). Scripts :
    // fichiers du site + empreinte ou nonce du seul script de démarrage (mode auto). Feuilles de style :
    // fichiers du site seulement, AUCUN <style> injecté ; seuls les attributs style (variables CSS
    // calculées, ex. taille de l'arabe) restent permis (style-src-attr). Audio des récitations : blob: ; A2 :
    // récitateurs EN LIGNE lus directement sur le réseau de diffusion de Quran Foundation (mêmes hôtes que
    // QF_AUDIO_HOSTS dans apps/api/src/coran-qf.ts, contrôlé par csp.test.ts).
    // Contrôlé par src/lib/csp.test.ts et e2e/securite.spec.ts.
    csp: {
      mode: 'auto',
      directives: {
        'default-src': ['self'],
        'script-src': ['self'],
        'style-src': ['self'],
        'style-src-attr': ['unsafe-inline'],
        'font-src': ['self'],
        'img-src': ['self', 'data:'],
        'media-src': [
          'self',
          'blob:',
          'https://verses.quran.foundation',
          'https://verses.quran.com',
          'https://audio.qurancdn.com',
          'https://mirrors.quranicaudio.com',
          'https://download.quranicaudio.com',
        ],
        'connect-src': ['self'],
        'worker-src': ['self'],
        'manifest-src': ['self'],
        'object-src': ['none'],
        'base-uri': ['self'],
        'form-action': ['self'],
        'frame-ancestors': ['none'],
      },
    },
  },
};

export default config;
