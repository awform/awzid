<script lang="ts">
  import { t } from '$lib/i18n';
  import { greatCircle, KAABA } from './qibla';

  /**
   * A12 — petite carte SCHÉMATIQUE (aucun fond de carte téléchargé) : quadrillage en projection équirectangulaire
   * centrée sur le trajet, chemin du grand cercle depuis le lieu jusqu'à la Kaʿba, nord en haut.
   */
  let { lat, lng, label }: { lat: number; lng: number; label: string } = $props();

  const W = 320;
  const H = 200;
  const path = $derived(greatCircle(lat, lng, 48));
  const box = $derived.by(() => {
    const lats = path.map((p) => p.lat);
    const lngs = path.map((p) => p.lng);
    let minLat = Math.min(...lats);
    let maxLat = Math.max(...lats);
    let minLng = Math.min(...lngs);
    let maxLng = Math.max(...lngs);
    const padLat = Math.max(4, (maxLat - minLat) * 0.18);
    const padLng = Math.max(6, (maxLng - minLng) * 0.12);
    minLat -= padLat;
    maxLat += padLat;
    minLng -= padLng;
    maxLng += padLng;
    // même échelle sur les deux axes (proportions conservées)
    const sx = W / (maxLng - minLng);
    const sy = H / (maxLat - minLat);
    const s = Math.min(sx, sy);
    const cx = (minLng + maxLng) / 2;
    const cy = (minLat + maxLat) / 2;
    return { s, cx, cy };
  });
  const X = (g: number) => W / 2 + (g - box.cx) * box.s;
  const Y = (l: number) => H / 2 - (l - box.cy) * box.s;
  const d = $derived(
    path.map((p, i) => `${i ? 'L' : 'M'}${X(p.lng).toFixed(1)} ${Y(p.lat).toFixed(1)}`).join(' '),
  );
  const step = $derived(box.s > 8 ? 5 : box.s > 3 ? 10 : 30);
  const gridLng = $derived.by(() => {
    const out = [];
    for (let g = Math.ceil((box.cx - W / 2 / box.s) / step) * step; X(g) <= W; g += step)
      out.push(g);
    return out;
  });
  const gridLat = $derived.by(() => {
    const out = [];
    for (let l = Math.ceil((box.cy - H / 2 / box.s) / step) * step; Y(l) >= 0; l += step)
      out.push(l);
    return out;
  });
</script>

<svg
  viewBox={`0 0 ${W} ${H}`}
  class="carte"
  role="img"
  aria-label={t('qt.carte_aria')}
  data-testid="qt-carte"
>
  <rect width={W} height={H} class="fond" rx="12" />
  {#each gridLng as g (g)}<line x1={X(g)} x2={X(g)} y1="0" y2={H} class="grille" />{/each}
  {#each gridLat as l (l)}<line
      y1={Y(l)}
      y2={Y(l)}
      x1="0"
      x2={W}
      class="grille"
      class:eq={l === 0}
    />{/each}
  <path {d} class="trajet" />
  <circle cx={X(lng)} cy={Y(lat)} r="6" class="moi" />
  <path d={`M${X(KAABA.lng)} ${Y(KAABA.lat) - 8} l8 8 -8 8 -8 -8 Z`} class="kaaba" />
  <text x="10" y="20" class="nord">{t('qt.c_n')} ↑</text>
  <text
    x={X(lng) + (X(lng) < W / 2 ? 10 : -10)}
    y={Math.max(16, Y(lat) - 10)}
    class="etiquette"
    text-anchor={X(lng) < W / 2 ? 'start' : 'end'}>{label}</text
  >
  <text
    x={X(KAABA.lng) + (X(KAABA.lng) < W / 2 ? 12 : -12)}
    y={Math.min(H - 8, Y(KAABA.lat) + 24)}
    class="etiquette"
    text-anchor={X(KAABA.lng) < W / 2 ? 'start' : 'end'}>{t('qt.carte_mecque')}</text
  >
</svg>

<style>
  .carte {
    width: 100%;
    height: auto;
    display: block;
  }
  .fond {
    fill: var(--surface);
  }
  .grille {
    stroke: var(--line);
    stroke-width: 1;
  }
  .grille.eq {
    stroke: var(--ink2);
    stroke-dasharray: 4 4;
  }
  .trajet {
    fill: none;
    stroke: var(--primary);
    stroke-width: 3;
    stroke-linecap: round;
    stroke-dasharray: 2 6;
  }
  .moi {
    fill: var(--accent);
    stroke: var(--card);
    stroke-width: 2;
  }
  .kaaba {
    fill: var(--primary);
    stroke: var(--card);
    stroke-width: 2;
  }
  .etiquette {
    font: 700 12px var(--font-ui);
    fill: var(--ink);
    paint-order: stroke;
    stroke: var(--surface);
    stroke-width: 3px;
  }
  .nord {
    font: 700 13px var(--font-ui);
    fill: var(--ink2);
  }
</style>
