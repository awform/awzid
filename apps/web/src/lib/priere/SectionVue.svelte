<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { t } from '$lib/i18n';
  import type { Voix } from './audio';
  import { chargerSection, type Section } from './donnees';
  import ElementVue from './ElementVue.svelte';
  import Texte from './Texte.svelte';

  /**
   * Une section du livre lue de bout en bout (« Pourquoi je prie », « Se préparer », « L'appel ») : en-tête, introduction,
   * puis chaque élément dans sa forme (preuves récitées par Ayyūb, règles, tableaux, paroles de l'adhān avec leur sens).
   * La section est « vue » une fois ouverte. Tout le texte vient des données.
   */
  let { id, voix, vu }: { id: string; voix: Voix; vu: (id: string) => void } = $props();

  let section = $state<Section | null>(null);
  let absent = $state(false);
  onMount(() => {
    void chargerSection(id).then((s) => {
      section = s;
      absent = !s;
      if (s) vu(id);
    });
  });
  onDestroy(() => voix.arreter());
</script>

<div class="e-section" data-testid="priere-section" data-section={id}>
  {#if section}
    <section class="bandeau cadre intro">
      <div class="sur">{t('priere.section_n', { n: id.replace(/\D/g, '') })}</div>
      <h1>{section.titre}</h1>
      {#if section.intro}<p><Texte txt={section.intro} /></p>{/if}
    </section>
    {#each section.elements ?? [] as e (e.id)}<ElementVue {e} {voix} />{/each}
  {:else if absent}
    <p class="note" role="status">…</p>
  {:else}
    <p class="muted" aria-busy="true">…</p>
  {/if}
</div>
