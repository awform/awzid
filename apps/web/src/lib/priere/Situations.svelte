<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { t } from '$lib/i18n';
  import type { Voix } from './audio';
  import { chargerSection, type Element, type Plan, type Section } from './donnees';
  import ElementVue from './ElementVue.svelte';
  import { vibrer } from './mouvement';
  import Picto from './Picto.svelte';
  import SilhouetteVue from './SilhouetteVue.svelte';
  import Texte from './Texte.svelte';
  import type { NomPose } from './silhouette';

  /**
   * Écran 7 — « Situations réelles » : « Que faire si… ? ». Un filtre par thème, une carte par situation du livre (S7)
   * avec une petite silhouette de la position concernée ; la carte ouverte (`aria-expanded`) donne la réponse du
   * référent : règles, exemples, hadiths, sources, chacun dans sa forme. Tout le texte vient des données.
   */
  let {
    plan,
    voix,
    depart,
    vu,
  }: { plan: Plan; voix: Voix; depart?: string; vu: (id: string) => void } = $props();

  let section = $state<Section | null>(null);
  let filtre = $state('tout');
  let ouvert = $state<string | null>(null);
  onMount(() => {
    void chargerSection('S7').then((s) => {
      section = s;
      ouvert = depart && s?.sous_sections?.some((x) => x.id === depart) ? depart : null;
      if (ouvert) vu(ouvert);
    });
  });
  onDestroy(() => voix.arreter());

  const S = $derived(plan.animation.situations);
  const themes = $derived([...new Set(Object.values(S).map((x) => x.theme))]);
  const cartes = $derived<Element[]>(
    (section?.sous_sections ?? []).filter((x) => filtre === 'tout' || S[x.id]?.theme === filtre),
  );
  function basculer(id: string) {
    ouvert = ouvert === id ? null : id;
    vibrer(8);
    if (ouvert) vu(id);
  }
</script>

<div class="e-situations" data-testid="priere-situations">
  <section class="bandeau cadre intro">
    <div class="sur">{t('priere.que_faire')}</div>
    <h1>{section?.titre ?? ''}</h1>
    {#if section?.intro}<p><Texte txt={section.intro} /></p>{/if}
  </section>

  <div class="filtres" role="group" aria-label={t('priere.filtrer')}>
    {#each ['tout', ...themes] as x (x)}
      <button
        type="button"
        class="puce"
        aria-pressed={filtre === x}
        data-theme={x}
        onclick={() => (filtre = x)}>{t(`priere.theme_${x}`)}</button
      >
    {/each}
  </div>

  <div class="cartes">
    {#each cartes as c (c.id)}
      {@const a = S[c.id]}
      <article class="sit" class:ouvert={ouvert === c.id} data-id={c.id} data-theme={a?.theme}>
        <button
          type="button"
          aria-expanded={ouvert === c.id}
          aria-controls="rep-{c.id}"
          onclick={() => basculer(c.id)}
        >
          <span class="vignette"
            ><SilhouetteVue
              pose={(a?.pose ?? 'debout') as NomPose}
              genre={a?.genre ?? 'homme'}
              camera="figure"
              decor={false}
              viewBox="22 30 196 196"
              statique
              aria={false}
            /></span
          >
          <span class="q"
            ><small>{a ? t(`priere.theme_${a.theme}`) : ''}</small><b>{c.titre}</b></span
          >
          <Picto nom="chevron-b" classe="chev" />
        </button>
        {#if ouvert === c.id}
          <div class="rep" id="rep-{c.id}" data-testid="priere-situation">
            {#if c.intro}<p class="corps"><Texte txt={c.intro} /></p>{/if}
            {#each c.elements ?? [] as e (e.id)}<ElementVue {e} {voix} />{/each}
          </div>
        {/if}
      </article>
    {/each}
  </div>
</div>
