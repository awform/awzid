<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { t } from '$lib/i18n';
  import { LEGAL_PAGES, type LegalKey } from '$lib/legal/content';
  import { legalLang, legalPages } from '$lib/legal/pages';

  /**
   * Un texte de `static/i18n/legal/<langue>.json` (pages légales, conditions de la bêta, page d'information de la
   * bêta). `infobeta` n'est pas un texte juridique : pas de bandeau « provisoire ».
   */
  let { cle }: { cle: string } = $props();
  const LEGAL = legalPages();
  const doc = $derived(LEGAL_PAGES.includes(cle as LegalKey) ? LEGAL[cle as LegalKey] : null);
</script>

{#if doc}
  <article class="card" data-testid="page-legale" data-page={cle} lang={legalLang()}>
    {#if cle !== 'infobeta'}
      <p class="brouillon" role="note" data-testid="legal-provisoire">{t('legal.brouillon')}</p>
    {/if}
    <h1><Bidi text={doc.titre} /></h1>
    {#if doc.maj}<p class="muted small"><Bidi text={t('legal.maj', { date: doc.maj })} /></p>{/if}
    {#each doc.sections as s (s.titre)}
      <section>
        <h2><Bidi text={s.titre} /></h2>
        {#each s.paras as p, i (i)}<p><Bidi text={p} /></p>{/each}
      </section>
    {/each}
  </article>
{:else}
  <p class="card">{t('legal.introuvable')}</p>
{/if}

<style>
  .brouillon {
    background: var(--warn-bg);
    color: var(--ink);
    padding: 8px 12px;
    border-radius: var(--radius-sm);
    font-weight: 600;
  }
  h2 {
    font-size: 1.1rem;
    margin-top: 16px;
  }
  .small {
    font-size: 0.9rem;
  }
</style>
