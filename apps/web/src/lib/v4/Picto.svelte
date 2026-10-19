<script lang="ts" module>
  /**
   * Refonte 19/10 : pictogrammes des maquettes (pictos.svg), en SVG inline — traits 1,8 px, 24 × 24, objets et
   * géométrie seulement (ni visage ni personnage). Décoratifs : le nom est toujours écrit à côté.
   */
  export const PICTOS: Record<string, string> = {
    arabe: 'M7 3h10a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3ZM13.5 7l-3 10',
    horloge: 'M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17ZM12 7.5V12l3 2',
    coran:
      'M12 6.5C10 5 7 4.5 3.5 5v13.5c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5zM12 6.5V20',
    madjaliss: 'M5 21l14-9.5M19 21 5 11.5M3 10c3-2 6-2 9 0 3-2 6-2 9 0',
    lectures: 'M4.5 4h4v16h-4zM10 4h4v16h-4zM15.5 5.2l3.7-1 3.3 15.4-3.7 1z',
    sciences:
      'M5 4.5h10.5A3.5 3.5 0 0 1 19 8v12H8.5A3.5 3.5 0 0 1 5 16.5zM5 16.5A3.5 3.5 0 0 1 8.5 13H19M12 6.3l.7 1.6 1.6.7-1.6.7-.7 1.6-.7-1.6-1.6-.7 1.6-.7z',
    plume: 'M4 20c1-5 3-8 7-11l7-5 2 2-5 7c-3 4-6 6-11 7zM4 20l7-7',
    cartes:
      'M5.5 7h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2ZM8 4h10.5a2 2 0 0 1 2 2v11',
    'hors-ligne': 'M7 18a4 4 0 0 1-.5-8A6 6 0 0 1 18 9a4 4 0 0 1-.5 9M12 11v8M9 16l3 3 3-3',
    classe:
      'M4.5 4h15A1.5 1.5 0 0 1 21 5.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 14.5v-9A1.5 1.5 0 0 1 4.5 4ZM8 20l4-4 4 4M7 8h6M7 11.5h9',
    suivi: 'M4 19h16M5 16l4-5 4 3 6-8',
    rapport: 'M4 5h16v11H9l-5 4z',
    lune: 'M19.5 14.5A8 8 0 1 1 9.5 4.5a6.5 6.5 0 0 0 10 10z',
    soleil:
      'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4',
    ok: 'M5 12.5l4.5 4.5L19 7.5',
    chevron: 'M9 6l6 6-6 6',
    fleche: 'M5 12h14M13 6l6 6-6 6',
    compte: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 20c1-4 4-6 8-6s7 2 8 6',
    aide: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6M12 17h.01',
    info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 11v6M12 7.5h.01',
    etoile8: 'M5 5h14v14H5zM12 2.1 21.9 12 12 21.9 2.1 12ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  };
</script>

<script lang="ts">
  let {
    name,
    size = 24,
    plein = false,
    trait = 1.8,
  }: { name: string; size?: number; plein?: boolean; trait?: number } = $props();
</script>

<svg
  class="v4-svg"
  viewBox="0 0 24 24"
  width={size}
  height={size}
  aria-hidden="true"
  focusable="false"
  fill={plein ? 'currentColor' : 'none'}
  stroke="currentColor"
  stroke-width={trait}
  stroke-linecap="round"
  stroke-linejoin="round"><path d={PICTOS[name] ?? PICTOS.info} /></svg
>

<style>
  .v4-svg {
    flex: none;
  }
</style>
