import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, type Plugin } from 'vite';

/**
 * A21b — code des leçons vivantes (générateurs, lecteur, modèles) HORS de la coquille : chargé à la demande,
 * jamais préchargé par le service worker ; gardé pour le hors ligne au premier usage ou au téléchargement d'un
 * niveau d'arabe. Ce module écrit la liste de ses fichiers (morceaux JS chargés seulement par import dynamique
 * depuis `$lib/vivante`, et leurs CSS) dans `/_app/vivante.json`, lue par le service worker et par le budget.
 */
function vivanteALaDemande(): Plugin {
  const VIV =
    /[\\/](lib[\\/]vivante[\\/](installer\.ts|Motion\.svelte|ModelesPlus\.svelte)|content[\\/](dist|src)[\\/]vivante(-garde)?\.[jt]s)/;
  return {
    name: 'awzid-vivante-a-la-demande',
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
        fileName: '_app/vivante.json',
        source: JSON.stringify(files.map((f) => `/${f}`)),
      });
    },
  };
}

export default defineConfig({
  plugins: [sveltekit(), vivanteALaDemande()],
  build: {
    rolldownOptions: {
      output: {
        // F5 : les modules partagés par au moins 3 pages vont dans UN morceau commun (au lieu de dizaines de
        // petits morceaux) : 11 fichiers au lieu de 51 pour ouvrir l'accueil (chaque fichier coûte un aller-retour
        // en 3G), et l'appareil d'un élève garde 21 Ko de moins (un gros fichier se compresse mieux)
        codeSplitting: { groups: [{ name: 'commun', minShareCount: 3 }] },
      },
    },
  },
  // accessible depuis le réseau local de développement (ufw : 192.168.50.0/24 seulement)
  server: { host: '0.0.0.0', port: 5173, strictPort: true },
  preview: { host: '0.0.0.0', port: 4173, strictPort: true },
});
