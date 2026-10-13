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

/** Modules partagés entre un espace et d'autres pages : gardés dans leur propre morceau (voir `codeSplitting`). */
const A_PART: Record<string, string> = {
  BoutonEcoute: 'BoutonEcoute',
  Recorder: 'lib/Recorder',
  RecitationEnvoi: 'RecitationEnvoi',
  VerseText: 'VerseText',
  Pastille: 'Pastille',
  MotsVerset: 'MotsVerset',
  translation: 'quran/translation',
  'partage-taille': 'partage-taille',
  'sura-names-ar': 'sura-names-ar',
  Lieu: 'quotidien/Lieu',
  priere: 'quotidien/priere',
  Arbre: 'ui/Arbre',
  milestones: 'milestones',
  ArFr: 'ArFr',
  'svelte-index': 'svelte/src/index-client',
  'svelte-reactivity': 'svelte/src/(reactivity|events)/[a-z-]+',
  ReligionExercise:
    'lib/(religion/ReligionExercise|CarnetPratique|FreeAnswerSend|freeAnswers|religion/check)',
  Exercise: '(lib/Exercise|grading/dist/[a-z]+|i18n/content-text)',
  'lecons-audio-offline': 'lecons-audio-offline',
  scene: '(content/dist/scene|lib/Scene)',
  'hifz-outils': 'hifz-outils/(outils|liste|donnees|mutashabihat)',
};
/**
 * Modules `A_PART` gardés à part MÊME s'ils servent à 3 pages ou plus (priorité au-dessus de « commun ») : le
 * moteur PUR des outils du hifẓ (sans dépendance), réutilisé par la mémorisation des Madjaliss, ne doit pas
 * peser sur toutes les pages (accueil, lecteur…).
 */
const A_PART_PRIORITAIRE: Record<string, string> = {
  'hifz-moteur': 'hifz-outils/outils',
};
const pages = (dir: string) => new RegExp(`src/routes/${dir}/(.+/)?\\+page\\.svelte`);
/** Un morceau par espace de l'élève : ses pages et les modules qu'elles sont seules à utiliser. */
const ESPACES: Record<string, RegExp> = {
  quotidien:
    /src\/routes\/quotidien\/(.+\/)?\+page\.svelte|src\/lib\/quotidien\/(hijri|adhkar|Compteur|QiblaCarte|qibla)\./,
  // l'écran enfant (`Enfant.svelte`, réseau nécessaire) reste à la demande, hors du morceau
  hifz: /src\/routes\/hifz\/(\[outil\]\/)?\+page\.svelte|src\/lib\/hifz-outils\/(Fraicheur|mutashabihat|PointsFaibles|Priere|TestHasard)\./,
  ecriture: pages('ecriture'),
  suivi: pages('suivi'),
  // pas le lecteur (page la plus lourde au premier chargement) ni les récitateurs (page rare)
  coran: /src\/routes\/coran\/((ecouter|memoriser|mushaf)\/)?\+page\.svelte/,
  lectures: pages('lectures'),
  activites: pages('activites'),
  famille: pages('famille'),
  profils: pages('profils'),
  messages: pages('messages'),
  connexion: pages('(connexion|ma-classe)'),
  aide: pages('(plus|aide|legal)'),
  // Madjaliss (P3-1) : UNE page (trois écrans) et ses modules, gardés au premier usage, jamais préchargés
  // (`PREMIER_USAGE_ROUTES` de scripts/groupes.mjs). Une seule page : aucun module partagé par 3 pages, donc rien
  // ne part dans le morceau commun préchargé.
  madjaliss: /src\/(routes\/madjaliss\/(.+\/)?\+(page|layout)\.(svelte|ts)|lib\/madjaliss\/)/,
};

export default defineConfig({
  plugins: [sveltekit(), vivanteALaDemande()],
  build: {
    rolldownOptions: {
      output: {
        // F5 : les modules partagés par au moins 3 pages vont dans UN morceau commun (au lieu de dizaines de
        // petits morceaux) : 11 fichiers au lieu de 51 pour ouvrir l'accueil (chaque fichier coûte un aller-retour
        // en 3G), et l'appareil d'un élève garde 21 Ko de moins (un gros fichier se compresse mieux)
        // Allègement (12/10/2026) : chaque fichier est compressé À PART (Brotli), et chaque petit fichier coûte un
        // dictionnaire de plus ; les pages d'un même ESPACE de l'élève vont donc dans UN morceau par espace
        // (`ESPACES`). Les modules qu'un espace partage avec d'autres pages restent dans LEUR morceau (`A_PART`,
        // priorité plus haute), sinon le morceau de l'espace les entraînerait (avec ses dépendances) et deviendrait
        // un import des autres pages (lecteur, leçons, révisions…). Contrôle : `pnpm budget` (pages les plus
        // lourdes) et reports/budget-web.md.
        codeSplitting: {
          groups: [
            ...Object.entries(A_PART_PRIORITAIRE).map(([name, m]) => ({
              name,
              test: new RegExp(`${m}\\.(svelte|ts|js)(\\?.*)?$`),
              priority: 35,
            })),
            { name: 'commun', minShareCount: 3, priority: 30 },
            ...Object.entries(A_PART).map(([name, m]) => ({
              name,
              // le module ET sa feuille de style (`…svelte?svelte&type=style&lang.css`)
              test: new RegExp(`${m}\\.(svelte|ts|js)(\\?.*)?$`),
              priority: 20,
            })),
            ...Object.entries(ESPACES).map(([name, test]) => ({ name, test, priority: 10 })),
          ],
        },
      },
    },
  },
  // accessible depuis le réseau local de développement (ufw : 192.168.50.0/24 seulement)
  server: { host: '0.0.0.0', port: 5173, strictPort: true },
  preview: { host: '0.0.0.0', port: 4173, strictPort: true },
});
