<script lang="ts">
  import { t } from '$lib/i18n';

  /**
   * D1 (« Grandir ») — l'arbre de l'élève : il NAÎT du symbole de la marque (une pousse sort du livre ouvert,
   * deux premières feuilles comme sur le logo) et grandit par paliers, une feuille par leçon terminée :
   * pousse (1-3), jeune plant (4-10), arbuste (11-24), arbre (25 et plus). Ni chiffre, ni points, ni
   * classement (mode serein) ; jamais de fruits, de visages ni d'animaux. `pousse` fait apparaître la dernière
   * feuille (désactivé si prefers-reduced-motion) ; `etoile` : petite étoile d'or pour un bilan réussi.
   */
  let {
    feuilles = 0,
    pousse = false,
    etoile = false,
    taille = 120,
  }: { feuilles?: number; pousse?: boolean; etoile?: boolean; taille?: number } = $props();

  type P = { x: number; y: number };
  type Feuille = { x: number; y: number; rot: number; s: number };
  const SOL = 100; // le haut du livre ouvert : la pousse en sort
  const PALIERS = [
    // hauteur, épaisseur du tronc, branches (hauteur relative), feuilles par branche, échelle des feuilles
    { h: 26, w: 2.6, br: [] as number[], k: 0, s: 1.5 },
    { h: 44, w: 3.4, br: [0.45, 0.7], k: 4, s: 1.25 },
    { h: 62, w: 4.4, br: [0.38, 0.52, 0.66, 0.8], k: 6, s: 1.05 },
    { h: 78, w: 5.6, br: [0.3, 0.42, 0.54, 0.66, 0.77, 0.87], k: 8, s: 0.95 },
  ];
  const palier = $derived(feuilles >= 25 ? 3 : feuilles >= 11 ? 2 : feuilles >= 4 ? 1 : 0);

  const bez = (a: P, c: P, b: P, u: number): P => ({
    x: (1 - u) ** 2 * a.x + 2 * (1 - u) * u * c.x + u ** 2 * b.x,
    y: (1 - u) ** 2 * a.y + 2 * (1 - u) * u * c.y + u ** 2 * b.y,
  });
  const angle = (a: P, c: P, b: P, u: number) => {
    const dx = 2 * (1 - u) * (c.x - a.x) + 2 * u * (b.x - c.x);
    const dy = 2 * (1 - u) * (c.y - a.y) + 2 * u * (b.y - c.y);
    return (Math.atan2(dy, dx) * 180) / Math.PI;
  };

  const dessin = $derived.by(() => {
    const p = PALIERS[palier]!;
    const top = SOL - p.h;
    // tige au tracé souple (légère courbe en S), du livre jusqu'au sommet
    const tige = `M60 ${SOL} C57 ${SOL - p.h * 0.35} 63 ${SOL - p.h * 0.7} 60 ${top}`;
    const branches = p.br.map((f, i) => {
      const dir = i % 2 ? 1 : -1;
      const y0 = SOL - p.h * f;
      const L = p.h * (0.5 - 0.28 * f) + 10;
      const a = { x: 60, y: y0 };
      const c = { x: 60 + dir * L * 0.55, y: y0 - L * 0.05 };
      const b = { x: 60 + dir * L, y: y0 - L * 0.5 };
      return { a, c, b, d: `M${a.x} ${a.y} Q${c.x} ${c.y} ${b.x} ${b.y}` };
    });
    // les deux feuilles du logo, au sommet : celles de la pousse elle-même (toujours là)
    const logo: Feuille[] = [
      { x: 60, y: top + 1, rot: -140, s: p.s },
      { x: 60, y: top + 1, rot: -40, s: p.s },
    ];
    // une feuille par leçon, toujours dans le même ordre : le long de la tige, au sommet, puis le long des
    // branches (du bas vers le haut)
    const places: Feuille[] = [];
    // croissance régulière : chaque branche reçoit d'abord sa feuille de bout, puis les feuilles se répartissent
    // à tour de rôle sur toutes les branches (jamais une branche nue pendant qu'une autre se remplit)
    for (let j = 0; j < p.k; j++)
      branches.forEach((br, i) => {
        const u = 1 - (0.65 * j) / p.k;
        const q = bez(br.a, br.c, br.b, u);
        const side = (j + i) % 2 ? 1 : -1;
        const rot = angle(br.a, br.c, br.b, u) + (j === 0 ? 0 : side * 45);
        places.push({ x: q.x, y: q.y, rot, s: p.s * 0.9 });
      });
    for (let j = 0; j < 2; j++)
      places.unshift({
        x: 60,
        y: SOL - p.h * (0.25 + 0.15 * j),
        rot: j % 2 ? -25 : -155,
        s: p.s * 0.85,
      });
    places.splice(2, 0, { x: 60, y: top - 1, rot: -90, s: p.s * 0.8 });
    return { tige, top, w: p.w, branches, logo, places };
  });
  const vues = $derived(dessin.places.slice(0, Math.max(0, feuilles)));
  const nouvelle = $derived(vues.length - 1);
  // feuille : amande pointue, de l'attache (0,0) vers la pointe
  const FEUILLE = 'M0 0C3-4.2 8.5-4.6 12 0C8.5 4.6 3 4.2 0 0Z';
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
  data-palier={palier}
>
  <!-- tige et branches : brun chaud, jamais gris -->
  <path d={dessin.tige} class="tronc" stroke-width={dessin.w} />
  {#each dessin.branches as b, i (i)}<path
      d={b.d}
      class="tronc"
      stroke-width={Math.max(1.6, dessin.w * 0.55)}
    />{/each}
  {#each dessin.logo as f, i (i)}
    <g transform="translate({f.x} {f.y}) rotate({f.rot}) scale({f.s})"
      ><g class="f logo"><path d={FEUILLE} /><path d="M1 0H10" class="nervure" /></g></g
    >
  {/each}
  {#each vues as f, i (i)}
    <g transform="translate({f.x} {f.y}) rotate({f.rot}) scale({f.s})"
      ><g class="f" class:nouvelle={pousse && i === nouvelle} class:claire={i % 3 === 1}
        ><path d={FEUILLE} /><path d="M1 0H10" class="nervure" /></g
      ></g
    >
  {/each}
  {#if etoile}
    <path
      class="etoile"
      d="M60 {dessin.top - 16}l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5-3.6-3.5 5-.7z"
    />
  {/if}
  <!-- le livre ouvert du symbole : deux pages émeraude et leur filet d'or -->
  <path d="M60 103C50 97 37 96 24 99V108C37 105 50 106 60 112Z" class="livre" />
  <path d="M60 103C70 97 83 96 96 99V108C83 105 70 106 60 112Z" class="livre" />
  <path d="M21 111C36 107 50 108 60 115C70 108 84 107 99 111" class="or" />
</svg>

<style>
  .arbre {
    display: block;
    flex: none;
    overflow: visible;
  }
  .tronc {
    fill: none;
    stroke: var(--arbre-tronc);
    stroke-linecap: round;
  }
  .f path:first-child {
    fill: var(--arbre-feuille);
  }
  .f.claire path:first-child,
  .f.logo path:first-child {
    fill: var(--arbre-feuille-2);
  }
  .nervure {
    fill: none;
    stroke: var(--arbre-nervure);
    stroke-width: 0.7;
    stroke-linecap: round;
  }
  .livre {
    fill: var(--arbre-livre);
  }
  .or {
    fill: none;
    stroke: var(--arbre-or);
    stroke-width: 2.4;
    stroke-linecap: round;
  }
  .etoile {
    fill: var(--arbre-or);
  }
  /* la feuille de la leçon apparaît depuis son attache */
  .nouvelle {
    transform-box: fill-box;
    transform-origin: 0% 50%;
    animation: pousse 650ms cubic-bezier(0.2, 0.8, 0.3, 1.25) 350ms both;
  }
  @keyframes pousse {
    from {
      transform: scale(0) rotate(-20deg);
      opacity: 0;
    }
    to {
      transform: scale(1) rotate(0);
      opacity: 1;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .nouvelle {
      animation: none;
    }
  }
</style>
