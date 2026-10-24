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
  const d = $derived(P[nom] ?? P.etoile);
</script>

<svg
  class="picto"
  viewBox="0 0 48 48"
  width={taille}
  height={taille}
  aria-hidden="true"
  focusable="false"
  ><path
    {d}
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  /></svg
>
