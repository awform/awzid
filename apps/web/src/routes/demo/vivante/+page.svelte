<script lang="ts">
  import { resolve } from '$app/paths';
  import Bidi from '$lib/Bidi.svelte';
  import { t } from '$lib/i18n';
  import { levelLabel } from '$lib/levels';
  import { PILOTES } from '$lib/vivante/reglage';
  import VivanteReglages from '$lib/vivante/VivanteReglages.svelte';

  /** Chantier A21 — démonstration des leçons vivantes : les trois leçons pilotes, à valider à l'écran. */
  const REGLES = ['viv.r1', 'viv.r2', 'viv.r3', 'viv.r4', 'viv.r5'];
</script>

<svelte:head><title>{t('app.nom')} — {t('viv.demo_titre')}</title></svelte:head>

<h1>{t('viv.demo_titre')}</h1>
<p class="muted">{t('viv.demo_intro')}</p>

<ul class="pilotes" data-testid="vivante-pilotes">
  {#each PILOTES as id, i (id)}
    <li class="p{i}">
      <span class="lettre" aria-hidden="true"
        ><svg viewBox="0 0 120 120"><text x="60" y="84" text-anchor="middle">ب</text></svg></span
      >
      <div>
        <strong><Bidi text={levelLabel(id.split('.')[0]!)} /></strong>
        <span class="muted">{t('viv.lecon1')}</span>
      </div>
      <a class="button primary" href={resolve('/lecons/[id]', { id })} data-pilote={id}
        >{t('viv.demo_ouvrir')}</a
      >
    </li>
  {/each}
</ul>

<section class="card">
  <h2>{t('viv.demo_regles')}</h2>
  <ul class="regles">
    {#each REGLES as k (k)}<li><Bidi text={t(k)} /></li>{/each}
  </ul>
</section>

<VivanteReglages />

<style>
  .pilotes {
    list-style: none;
    padding: 0;
    display: grid;
    gap: 12px;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  }
  .pilotes li {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 8px 14px;
    align-items: center;
    padding: 14px;
    border-radius: 20px;
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--k) 16%, var(--card)),
      color-mix(in srgb, var(--accent) 10%, var(--card))
    );
    border: 1px solid color-mix(in srgb, var(--k) 30%, var(--line));
    box-shadow: var(--shadow-card);
  }
  .p0 {
    --k: var(--c0);
  }
  .p1 {
    --k: var(--c1);
  }
  .p2 {
    --k: var(--c2);
  }
  .pilotes div {
    display: flex;
    flex-direction: column;
  }
  .pilotes a {
    grid-column: 1 / -1;
    text-align: center;
  }
  .lettre svg {
    width: 64px;
    height: 64px;
  }
  .lettre text {
    font-family: var(--font-ar);
    font-size: 96px;
    fill: var(--k);
    fill-opacity: 0;
    stroke: var(--k);
    stroke-width: 1.5;
    stroke-dasharray: 600;
    stroke-dashoffset: 600;
    animation:
      trace 1.6s ease-out forwards,
      fill 0.6s 1.3s forwards;
  }
  .regles li {
    margin: 4px 0;
  }
  @keyframes trace {
    to {
      stroke-dashoffset: 0;
    }
  }
  @keyframes fill {
    to {
      fill-opacity: 1;
    }
  }
</style>
