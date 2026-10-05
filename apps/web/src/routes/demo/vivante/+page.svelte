<script lang="ts">
  import { resolve } from '$app/paths';
  import Bidi from '$lib/Bidi.svelte';
  import { api, unitLabel, type UnitSummary } from '$lib/api';
  import { t } from '$lib/i18n';
  import { levelLabel } from '$lib/levels';
  import VivanteReglages from '$lib/vivante/VivanteReglages.svelte';

  /**
   * Chantiers A21 / A21b — démonstration des leçons vivantes : toutes les leçons des livres d'arabe (choix du
   * livre et de la leçon), et un exemple de chaque modèle, à valider à l'écran.
   */
  const REGLES = ['viv.r1', 'viv.r2', 'viv.r3', 'viv.r4', 'viv.r5'];
  const range = (p: string, n: number) => Array.from({ length: n }, (_, i) => `${p}${i + 1}`);
  const LIVRES = [...range('en', 5), ...range('ado', 4), ...range('ad', 10)];
  /** un exemple par modèle (leçons où les données du livre le permettent) */
  const EXEMPLES: Array<[string, string]> = [
    ['lettre', 'en1.l01'],
    ['structure', 'ado1.l01'],
    ['dialogue', 'ad1.l01'],
    ['racine', 'en5.l02'],
    ['conjugaison', 'ad3.l01'],
    ['nombre', 'ado1.l22'],
    ['heure', 'en4.l12'],
  ];
  let livre = $state('en1');
  let lecon = $state('');
  let units: UnitSummary[] = $state([]);
  let erreur = $state(false);
  $effect(() => {
    const code = livre;
    erreur = false;
    api<{ units: UnitSummary[] }>(fetch, `/levels/${encodeURIComponent(code)}/units`)
      .then((r) => {
        if (code !== livre) return;
        units = r.units.filter((u) => u.kind === 'lecon');
        lecon = units[0]?.id ?? '';
      })
      .catch(() => ((units = []), (erreur = true)));
  });
</script>

<svelte:head><title>{t('app.nom')} — {t('viv.demo_titre')}</title></svelte:head>

<h1>{t('viv.demo_titre')}</h1>
<p class="muted">{t('viv.demo_intro')}</p>

<section class="card choix" data-testid="vivante-choix">
  <h2>{t('viv.demo_choisir')}</h2>
  <label
    >{t('viv.demo_livre')}
    <select bind:value={livre} data-testid="vivante-livre">
      {#each LIVRES as l (l)}<option value={l}>{levelLabel(l)}</option>{/each}
    </select></label
  >
  <label
    >{t('viv.demo_lecon')}
    <select bind:value={lecon} data-testid="vivante-lecon" disabled={!units.length}>
      {#each units as u (u.id)}<option value={u.id}>{unitLabel(u)} · {u.titleFr}</option>{/each}
    </select></label
  >
  {#if erreur}<p class="muted" role="status">{t('viv.demo_hors_ligne')}</p>{/if}
  {#if lecon}<a
      class="button primary"
      href={resolve('/lecons/[id]', { id: lecon })}
      data-testid="vivante-ouvrir">{t('viv.demo_ouvrir')}</a
    >{/if}
</section>

<h2>{t('viv.demo_exemples')}</h2>
<ul class="exemples" data-testid="vivante-exemples">
  {#each EXEMPLES as [model, id], i (model)}
    <li class="p{i % 4}">
      <div>
        <strong><Bidi text={t(`viv.m_${model}`)} /></strong>
        <span class="muted"><Bidi text={levelLabel(id.split('.')[0]!)} /></span>
      </div>
      <a class="button" href={resolve('/lecons/[id]', { id })} data-exemple={model}
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
  .choix {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
  }
  .choix label {
    display: grid;
    gap: 4px;
    font-weight: 700;
  }
  .choix select {
    min-height: 44px;
    width: 100%;
    min-width: 0;
  }
  .choix a {
    text-align: center;
  }
  .exemples {
    list-style: none;
    padding: 0;
    display: grid;
    gap: 10px;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  }
  .exemples li {
    display: flex;
    gap: 10px;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
    border-radius: 18px;
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--k) 16%, var(--card)),
      color-mix(in srgb, var(--accent) 10%, var(--card))
    );
    border: 1px solid color-mix(in srgb, var(--k) 30%, var(--line));
  }
  .exemples div {
    display: flex;
    flex-direction: column;
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
  .p3 {
    --k: var(--c3);
  }
  .regles li {
    margin: 4px 0;
  }
</style>
