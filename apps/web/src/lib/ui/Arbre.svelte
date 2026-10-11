<script lang="ts">
  import { t } from '$lib/i18n';

  /**
   * D1 (« Grandir ») — l'arbre de l'élève : une feuille par leçon terminée. Ni points ni classement (mode
   * serein) : seulement la croissance. `pousse` fait apparaître la dernière feuille (désactivé si
   * prefers-reduced-motion).
   */
  let {
    feuilles = 0,
    pousse = false,
    taille = 120,
  }: { feuilles?: number; pousse?: boolean; taille?: number } = $props();
  const MAX = 48;
  // emplacements fixes dans la couronne (spirale de Fermat) : le même arbre d'une visite à l'autre
  const PLACES = Array.from({ length: MAX }, (_, i) => {
    const a = i * 2.39996;
    const r = 6 + 3.6 * Math.sqrt(i + 1);
    return {
      x: 60 + r * Math.cos(a) * 1.25,
      y: 46 + r * Math.sin(a) * 0.95,
      rot: Math.round(((a * 180) / Math.PI) % 360),
    };
  });
  const vues = $derived(PLACES.slice(0, Math.min(feuilles, MAX)));
</script>

<svg
  class="arbre"
  class:pousse
  viewBox="0 0 120 120"
  width={taille}
  height={taille}
  role="img"
  aria-label={t('fin.arbre', { n: feuilles })}
  data-testid="arbre"
  data-feuilles={feuilles}
>
  <ellipse cx="60" cy="112" rx="34" ry="5" class="sol" />
  <path d="M57 112 C57 92 56 80 52 66 M63 112 C63 92 64 80 68 66" class="tronc" />
  <path
    d="M60 86 C50 76 42 70 34 62 M60 80 C70 70 78 64 86 58 M60 74 C60 62 60 52 60 40"
    class="branche"
  />
  {#each vues as p, i (i)}
    <g transform="rotate({p.rot} {p.x} {p.y})"
      ><ellipse
        cx={p.x}
        cy={p.y}
        rx="5"
        ry="2.6"
        class="feuille"
        class:nouvelle={pousse && i === vues.length - 1}
      /></g
    >
  {/each}
  <!-- l'étoile de la marque, discrète, au sommet -->
  <path d="M60 8 l2 4.5 4.8.5-3.6 3.2 1 4.8-4.2-2.5-4.2 2.5 1-4.8-3.6-3.2 4.8-.5z" class="etoile" />
</svg>

<style>
  .arbre {
    display: block;
    flex: none;
  }
  .sol {
    fill: var(--line);
  }
  .tronc,
  .branche {
    fill: none;
    stroke: var(--ink2);
    stroke-width: 3;
    stroke-linecap: round;
  }
  .branche {
    stroke-width: 2;
  }
  .feuille {
    fill: var(--primary);
    opacity: 0.9;
  }
  .etoile {
    fill: var(--gold);
  }
  .nouvelle {
    transform-box: fill-box;
    transform-origin: center;
    animation: pousse 600ms cubic-bezier(0.2, 0.8, 0.3, 1.2) 300ms both;
  }
  @keyframes pousse {
    from {
      transform: scale(0);
      opacity: 0;
    }
    to {
      transform: scale(1);
      opacity: 0.9;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .nouvelle {
      animation: none;
    }
  }
</style>
