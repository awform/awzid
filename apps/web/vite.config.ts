import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, type Plugin } from 'vite';

/**
 * A21b — code des leçons vivantes (générateurs, lecteur, modèles) HORS de la coquille : chargé à la demande,
 * jamais préchargé par le service worker ; gardé pour le hors ligne au premier usage ou au téléchargement d'un
 * niveau d'arabe. Ce module écrit la liste de ses fichiers (morceaux JS chargés seulement par import dynamique
 * depuis `$lib/vivante`, et leurs CSS) dans `/_app/vivante.json`, lue par le service worker et par le budget.
 */
const VIVANTE =
  /[\\/](lib[\\/]vivante[\\/](installer\.ts|Motion\.svelte|ModelesPlus\.svelte)|content[\\/](dist|src)[\\/]vivante(-garde)?\.[jt]s)/;
/**
 * A5 — panneau « Réciter et vérifier » (IA, EN LIGNE seulement : le service d'écoute est sur le serveur) : même
 * principe, jamais préchargé par le service worker ; liste dans `/_app/ecoute.json`.
 */
const ECOUTE =
  /[\\/]lib[\\/]ecoute[\\/](PanneauEcoute\.svelte|ARevoirEcoute\.svelte|ecoute\.ts|bilans\.ts)/;
function vivanteALaDemande(VIV = VIVANTE, nom = 'vivante'): Plugin {
  return {
    name: `awzid-${nom}-a-la-demande`,
    apply: 'build',
    generateBundle(options, bundle) {
      if (!/[\\/]client$/.test(options.dir ?? '')) return;
      const chunks = Object.values(bundle).flatMap((c) => (c.type === 'chunk' ? [c] : []));
      const viv = new Set(
        chunks
          .filter((c) => !c.isEntry && c.moduleIds.some((id) => VIV.test(id)))
          .map((c) => c.fileName),
      );
      // jamais un morceau importé statiquement par un autre (il serait nécessaire à la coquille)
      for (const c of chunks) if (!viv.has(c.fileName)) for (const i of c.imports) viv.delete(i);
      const files = chunks
        .filter((c) => viv.has(c.fileName))
        .flatMap((c) => [
          c.fileName,
          ...((c as { viteMetadata?: { importedCss?: Set<string> } }).viteMetadata?.importedCss ??
            []),
        ]);
      this.emitFile({
        type: 'asset',
        fileName: `_app/${nom}.json`,
        source: JSON.stringify(files.map((f) => `/${f}`)),
      });
    },
  };
}

export default defineConfig({
  plugins: [sveltekit(), vivanteALaDemande(), vivanteALaDemande(ECOUTE, 'ecoute')],
  // accessible depuis le réseau local de développement (ufw : 192.168.50.0/24 seulement)
  server: { host: '0.0.0.0', port: 5173, strictPort: true },
  preview: { host: '0.0.0.0', port: 4173, strictPort: true },
});
