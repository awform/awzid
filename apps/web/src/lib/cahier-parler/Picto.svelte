<script lang="ts">
  /**
   * Cahier « Je parle » — pictogrammes d'OBJETS en trait (jamais un être animé, aucun visage) : un par thème
   * (packages/content/data/cahier-parler/themes.json). Décoratifs : le titre de l'étape dit la même chose.
   */
  let { nom, taille = 40 }: { nom: string; taille?: number } = $props();
  const P: Record<string, string> = {
    porte: 'M14 42V8h20v34M10 42h28M28 26h2M14 8l4-2h12l4 2',
    carte: 'M6 13h36v24H6zM12 21h10M12 27h14M12 31h8M30 20h7v9h-7z',
    sacoche: 'M8 17h32v22H8zM18 17v-5h12v5M8 26h32M22 26v4h4v-4',
    panneau: 'M24 44V6M24 10h14l4 4-4 4H24M24 22H10l-4 4 4 4h14',
    lanterne: 'M24 4v4M18 8h12l-2 6h-8zM16 14h16v20H16zM24 18v12M20 34l-2 6h12l-2-6',
    cle: 'M17 14a8 8 0 1 0 0 .1M23 18l19 0M36 18v6M41 18v5',
    stylo: 'M32 6l10 10-24 24H8V30zM28 10l10 10M8 40l6-6',
    valise: 'M8 16h32v24H8zM18 16v-6h12v6M16 16v24M32 16v24M12 44h4M32 44h4',
    trousse: 'M6 16h36v24H6zM18 16v-5h12v5M24 21v14M17 28h14',
    maison: 'M6 22L24 7l18 15M11 19v23h26V19M20 42V30h8v12',
    livre: 'M24 12c-5-4-12-4-18-2v28c6-2 13-2 18 2 5-4 12-4 18-2V10c-6-2-13-2-18 2zM24 12v28',
    panier: 'M6 20h36l-4 20H10zM14 20l6-12M34 20l-6-12M16 26v8M24 26v8M32 26v8',
    document: 'M12 4h18l8 8v32H12zM30 4v8h8M18 22h14M18 28h14M18 34h9',
    horloge: 'M24 6a18 18 0 1 0 0.1 0M24 13v11l7 5',
    ballon:
      'M24 6a18 18 0 1 0 0.1 0M24 17l7 5-3 8h-8l-3-8zM24 6v11M31 22l10-3M28 30l5 9M20 30l-5 9M17 22l-10-3',
    telephone: 'M15 4h18v40H15zM15 10h18M15 36h18M22 40h4',
    tasse:
      'M8 18h26v10a10 10 0 0 1-10 10h-6A10 10 0 0 1 8 28zM34 21h3a5 5 0 0 1 0 10h-3M6 43h32M16 6v6M22 4v8M28 6v6',
    plat: 'M4 32h40M8 32a16 16 0 0 1 32 0M24 16v-4M20 12h8M6 37h36',
    fleur: 'M24 44V24M24 32c-6 0-10-4-10-8 6 0 10 4 10 8zM24 24a6 6 0 1 0 0.1 0M24 12v6M18 18h12',
    lune: 'M30 6a18 18 0 1 0 12 26A14 14 0 0 1 30 6zM38 8l1 3 3 1-3 1-1 3-1-3-3-1 3-1z',
    soleil:
      'M24 15a9 9 0 1 0 0.1 0M24 4v5M24 39v5M4 24h5M39 24h5M10 10l3.5 3.5M34.5 34.5L38 38M10 38l3.5-3.5M34.5 13.5L38 10',
    tableau: 'M6 8h36v26H6zM24 34v8M16 42h16M12 16h12M12 22h18M12 28h8',
    colis: 'M6 16l18-9 18 9v18l-18 9-18-9zM6 16l18 9 18-9M24 25v18M15 11.5l18 9',
    etoile: 'M24 5l5.6 11.8 13 1.6-9.6 9 2.5 12.8L24 34l-11.5 6.2 2.5-12.8-9.6-9 13-1.6z',
  };
  /** pictogrammes des cahiers du niveau 3 et suivants : balisage sur une grille de 24 (redimensionné sur 48) */
  const Q: Record<string, string> = {
    cadeau:
      '<rect x="4" y="10" width="16" height="10"/><rect x="3" y="7" width="18" height="3"/><path d="M12 7v13M12 7C10 3 6 4 8 7M12 7c2-4 6-3 4 0"/>',
    mosquee:
      '<path d="M5 21V12h14v9M2 21h20M7 12a5 5 0 0 1 10 0M12 7V4M10 21v-4a2 2 0 0 1 4 0v4M21 21V9M20 9h2"/>',
    calendrier:
      '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M7 14h2M11 14h2M15 14h2M7 17h2M11 17h2"/>',
    balance: '<path d="M12 3v17M7 21h10M4 7h16M4 7l-3 7h6zM20 7l-3 7h6z"/>',
    thermometre: '<path d="M10 5a2 2 0 0 1 4 0v9.5a4 4 0 1 1-4 0z"/><path d="M12 9v8"/>',
    lettre: '<rect x="3" y="6" width="18" height="12" rx="1"/><path d="M3 7l9 6 9-6"/>',
    enveloppe:
      '<rect x="3" y="6" width="18" height="12" rx="1"/><path d="M3 7l9 6 9-6M3 18l7-6M21 18l-7-6"/>',
    the: '<path d="M4 10h12v4a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM16 11h2a2 2 0 0 1 0 4h-2M8 3c0 2 2 2 2 4M12 3c0 2 2 2 2 4M3 21h14"/>',
    sac: '<path d="M5 8h14l-1 13H6zM9 8V6a3 3 0 0 1 6 0v2"/>',
    flacon: '<path d="M10 3h4v4l3 3v11H7V10l3-3zM7 14h10"/>',
    berceau:
      '<path d="M4 11h16v4a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4zM4 11a8 8 0 0 1 8-7v7M7 19l-2 2M17 19l2 2"/>',
    arbre: '<circle cx="12" cy="9" r="6"/><path d="M12 21v-6M9 21h6M12 12l-2-2M12 13l2-2"/>',
    micro:
      '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6"/>',
    billet:
      '<rect x="2" y="6" width="20" height="12" rx="1"/><circle cx="12" cy="12" r="3"/><path d="M5 9v6M19 9v6"/>',
    bouteille: '<path d="M10 2h4v4l2 3v12a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V9l2-3zM8 12h8M8 17h8"/>',
    dossier: '<path d="M3 6h6l2 2h10v11H3zM3 10h18"/>',
    loupe: '<circle cx="10" cy="10" r="6"/><path d="M15 15l6 6"/>',
    calculatrice:
      '<rect x="5" y="2" width="14" height="20" rx="2"/><rect x="8" y="5" width="8" height="4"/><path d="M8 13h2M14 13h2M8 17h2M14 17h2"/>',
    affiche:
      '<rect x="5" y="4" width="14" height="17"/><circle cx="12" cy="4" r="1"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    bague: '<circle cx="12" cy="15" r="6"/><path d="M10 9l-1-3 3-3 3 3-1 3"/>',
    journal:
      '<rect x="3" y="4" width="18" height="16"/><path d="M6 8h6v5H6zM14 8h4M14 11h4M6 16h12"/>',
    pupitre: '<path d="M4 10h16l-2-4H6zM6 10v10M18 10v10M6 15h12"/>',
    lampe: '<path d="M9 3h6l3 8H6zM12 11v8M8 21h8"/>',
    dictionnaire:
      '<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M9 3v18M12 8h4M12 11h4"/>',
    radio:
      '<rect x="3" y="8" width="18" height="12" rx="2"/><circle cx="8" cy="14" r="3"/><path d="M14 12h4M14 16h4M6 8l12-5"/>',
    ordinateur:
      '<rect x="4" y="4" width="16" height="11" rx="1"/><path d="M2 19h20M5 15l-1 4M19 15l1 4"/>',
    parchemin:
      '<path d="M6 4h12v13a3 3 0 0 1-3 3H5a2 2 0 0 1 0-4h10M6 4a2 2 0 0 0-2 2v1h2M9 8h6M9 12h6"/>',
    carnet:
      '<rect x="6" y="3" width="13" height="18" rx="1"/><path d="M6 7H4M6 11H4M6 15H4M10 8h6M10 12h6"/>',
    lunettes:
      '<circle cx="7" cy="14" r="4"/><circle cx="17" cy="14" r="4"/><path d="M11 14h2M3 14l1-6M21 14l-1-6"/>',
    television: '<rect x="3" y="7" width="18" height="12" rx="2"/><path d="M8 3l4 4 4-4"/>',
    casque:
      '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4" height="6" rx="1"/><rect x="17" y="14" width="4" height="6" rx="1"/>',
    diplome:
      '<rect x="3" y="5" width="18" height="12"/><circle cx="16" cy="13" r="2.5"/><path d="M6 9h8M6 12h5M15 15.5l-1 5 2-1 2 1-1-5"/>',
    stethoscope:
      '<path d="M6 3v6a4 4 0 0 0 8 0V3M10 13v3a4 4 0 0 0 8 0v-2"/><circle cx="18" cy="12" r="2"/>',
    drapeau: '<path d="M5 21V4M5 4h12l-2 4 2 4H5"/>',
    boussole: '<circle cx="12" cy="12" r="9"/><path d="M15 9l-2 5-4 1 2-5z"/>',
    plume: '<path d="M20 4C11 4 6 10 6 18l-2 2M6 18c6 0 11-4 12-10M9 15h5M11 11h5"/>',
    cartable:
      '<rect x="4" y="8" width="16" height="12" rx="2"/><path d="M9 8V5h6v3M4 13h16M11 13v2h2v-2"/>',
    tapis:
      '<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M8 9a4 4 0 0 1 8 0v4H8zM8 17h8M5 6h14"/>',
    pomme:
      '<path d="M12 8c-3-2-8-1-8 5 0 5 3 8 5 8 1 0 2-1 3-1s2 1 3 1c2 0 5-3 5-8 0-6-5-7-8-5zM12 8c0-3 1-4 3-5"/>',
    cube: '<path d="M12 3l8 4v10l-8 4-8-4V7zM4 7l8 4 8-4M12 11v10"/>',
    verre: '<path d="M6 3h12l-2 18H8zM7 9h10"/>',
    sifflet: '<circle cx="9" cy="14" r="5"/><path d="M12 10l9-3v4l-7 2M7 14h4"/>',
    manette:
      '<path d="M7 8h10a5 5 0 0 1 4.5 7l-1 2a2 2 0 0 1-3.5.5L15 15H9l-2 2.5a2 2 0 0 1-3.5-.5l-1-2A5 5 0 0 1 7 8zM8 10v4M6 12h4M16 11h.01M18 13h.01"/>',
    cle_usb:
      '<rect x="8" y="9" width="8" height="12" rx="1"/><path d="M9 9V3h6v6M11 5h.01M13 5h.01"/>',
  };
  const d = $derived(P[nom] ?? (Q[nom] ? '' : P.etoile));
  const q = $derived(Q[nom] ?? '');
</script>

<svg
  class="picto"
  viewBox="0 0 48 48"
  width={taille}
  height={taille}
  aria-hidden="true"
  focusable="false"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
>
  {#if d}
    <path {d} />
  {:else}
    <g transform="scale(2)" stroke-width="1">
      <!-- eslint-disable-next-line svelte/no-at-html-tags -- balisage constant, écrit dans ce fichier -->
      {@html q}
    </g>
  {/if}
</svg>
