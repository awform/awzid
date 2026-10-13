<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { page } from '$app/state';
  import { resolve } from '$app/paths';
  import { t } from '$lib/i18n';
  import LegalDoc from '$lib/legal/LegalDoc.svelte';
  import { LEGAL_PAGES, type LegalKey } from '$lib/legal/content';
  import { legalPages } from '$lib/legal/pages';
  const LEGAL = legalPages();

  /**
   * Pages légales (lot 14, bêta fermée 13/10/2026) : textes PROVISOIRES, en attente d'une seconde lecture
   * juridique ; contenu dans static/i18n/legal/<langue>.json.
   */
  const key = $derived(page.params.page as LegalKey);
</script>

<svelte:head><title>{t('app.nom')} — {LEGAL[key]?.titre ?? t('legal.titre')}</title></svelte:head>

<nav class="legalnav" aria-label={t('legal.titre')}>
  {#each LEGAL_PAGES as k (k)}
    <a href={resolve('/legal/[page]', { page: k })} aria-current={k === key ? 'page' : undefined}
      ><Bidi text={LEGAL[k].titre} /></a
    >
  {/each}
  <a href={resolve('/errata')}>{t('errata.titre')}</a>
  <a href={resolve('/aide')}>{t('aide.titre')}</a>
</nav>

<LegalDoc cle={key} />

<style>
  .legalnav {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 16px;
    margin: 8px 0;
  }
  .legalnav a[aria-current='page'] {
    font-weight: 700;
  }
</style>
