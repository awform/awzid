<script lang="ts" module>
  /**
   * Lot 26 — jeu d'icônes de l'application : traits seuls, coins arrondis, 24 × 24, couleur du texte.
   * Aucune figuration (ni visage ni personnage) : formes géométriques et objets simples.
   */
  export const ICONS: Record<string, string> = {
    maison: 'M4 11 12 4l8 7M6 10v9h4v-5h4v5h4v-9',
    alif: 'M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM12.5 7l-1 10',
    mushaf: 'M4 6c3-1 5-1 8 1 3-2 5-2 8-1v12c-3-1-5-1-8 1-3-2-5-2-8-1zM12 7v12',
    livres: 'M4 5h5v14H4zM10 5h5v14h-5zM16 6l3-1 2 13-3 1z',
    plume: 'M5 19l3-1 10-10-2-2L6 16l-1 3ZM14 6l2 2',
    grille: 'M5 5h5v5H5zM14 5h5v5h-5zM5 14h5v5H5zM14 14h5v5h-5z',
    famille:
      'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM17 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM3 20c0-3 2-5 5-5s5 2 5 5M13 20c0-2.5 1.6-4.5 4-4.5s4 2 4 4.5',
    courbe: 'M4 19h16M5 16l4-5 4 3 6-8',
    message: 'M4 5h16v11H9l-5 4z',
    personne: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 20c1-4 4-6 8-6s7 2 8 6',
    classe: 'M3 5h18v11H3zM8 20h8M12 16v4',
    ecole: 'M3 10 12 5l9 5M5 10v9h14v-9M10 19v-5h4v5',
    question:
      'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6M12 17h.01',
    bouclier: 'M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6z',
    cle: 'M15 9a4 4 0 1 1-1.2 2.8L4 21H2v-2l1-1h2v-2h2l1.8-1.8',
    telecharger: 'M12 4v11m-5-5 5 5 5-5M5 20h14',
    soleil:
      'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
    lune: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z',
    auto: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 3v18',
    etoile: 'm12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
    horsligne:
      'M3 3l18 18M8.5 8.6A6 6 0 0 0 6 13a4 4 0 0 0 1 7.9h10.5M12 6a6 6 0 0 1 6 6 3.5 3.5 0 0 1 2.7 5',
    rafraichir: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
    fleche: 'M5 12h14m-6-6 6 6-6 6',
    // Muṣḥaf vert (04/10/2026) : tajwid (goutte d'encre), traduction (deux écritures), menu « Plus », chevron
    tajwid: 'M12 3s6 6.4 6 11a6 6 0 0 1-12 0c0-4.6 6-11 6-11ZM9.5 14.5a2.5 2.5 0 0 0 2.5 2.5',
    traduction:
      'M3 5h9M7.5 3v2M5 5c.5 3.5 2.6 6 6 7.5M10 5c-.8 3.7-3 6.4-6.5 8M13 21l4-9 4 9M14.4 18h5.2',
    points: 'M5 12h.01M12 12h.01M19 12h.01',
    chevron: 'm9 6 6 6-6 6',
    // A12 « Au quotidien » : boussole (qibla), chapelet (adhkār), partager, lever du jour, cloche, lieu, ±
    boussole: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM15.5 8.5l-2 5-5 2 2-5z',
    chapelet:
      'M12 2.6a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8ZM16.95 4.65a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8ZM19 9.6a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8ZM16.95 14.55a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8ZM12 16.6a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8ZM7.05 14.55a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8ZM5 9.6a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8ZM7.05 4.65a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8ZM12 19.4V22',
    partager: 'M12 3v12M8 7l4-4 4 4M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7',
    quotidien:
      'M3 19h18M7 19a5 5 0 0 1 10 0M12 6v3M5.6 11.6l1.6 1.4M18.4 11.6l-1.6 1.4M2 15h2M20 15h2',
    cloche: 'M6 16v-5a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0',
    lieu: 'M12 21s7-6.2 7-11.5a7 7 0 0 0-14 0C5 14.8 12 21 12 21ZM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
    moins: 'M5 12h14',
    ajouter: 'M12 5v14M5 12h14',
    casque: 'M4 15v-3a8 8 0 0 1 16 0v3M4 15h3v5H4zM17 15h3v5h-3z',
    coche: 'M5 12l5 5 9-10',
    lecture: 'M8 5v14l11-7z',
    pause: 'M7 5h4v14H7zM13 5h4v14h-4z',
    minuterie: 'M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM12 9v4l2 2M10 2h4',
    repeter: 'M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4',
    masque:
      'M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.4 5.2A9.7 9.7 0 0 1 12 5c5 0 9 5 9 7a10 10 0 0 1-2.2 3M6.3 6.3C4 7.8 3 10.2 3 12c0 2 4 7 9 7a9.6 9.6 0 0 0 4-.9',
    info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 11v6M12 7.5h.01',
    alerte: 'M12 4 2.5 20h19zM12 10v4M12 17h.01',
    vide: 'M4 7h16v12H4zM4 7l2-3h12l2 3M9 12h6',
    lire: 'M4 6c3-1 5-1 8 1 3-2 5-2 8-1v12c-3-1-5-1-8 1-3-2-5-2-8-1z',
    oreille: 'M7 9a5 5 0 0 1 10 0c0 3-3 4-3 7a3 3 0 0 1-6 0M10 9a2 2 0 0 1 4 0',
    revisions: 'M4 7h12v12H4zM8 3h12v12',
  };
</script>

<script lang="ts">
  let {
    name,
    size = 24,
    label = '',
    filled = false,
  }: { name: string; size?: number; label?: string; filled?: boolean } = $props();
</script>

<svg
  class="icon"
  class:filled
  viewBox="0 0 24 24"
  width={size}
  height={size}
  role={label ? 'img' : undefined}
  aria-label={label || undefined}
  aria-hidden={label ? undefined : 'true'}
  focusable="false"><path d={ICONS[name] ?? ICONS.info} /></svg
>

<style>
  .icon {
    flex: none;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .filled {
    fill: currentColor;
  }
</style>
