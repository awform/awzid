<script lang="ts">
  import AvisBouton from '$lib/avis/AvisBouton.svelte';
  import Bidi from '$lib/Bidi.svelte';
  import { resolve } from '$app/paths';
  import { t } from '$lib/i18n';
  import { LEGAL_PAGES } from '$lib/legal/content';
  import { faq, legalLang, legalPages } from '$lib/legal/pages';
  const LEGAL = legalPages();
  const FAQ = faq();

  /** Aide (lot 14, bêta fermée) : questions fréquentes, signalements, documents ; textes dans static/i18n/legal. */
</script>

<svelte:head><title>{t('app.nom')} — {t('aide.titre')}</title></svelte:head>

<h1>{t('aide.titre')}</h1>
<p>{t('aide.intro')}</p>

{#each FAQ as bloc (bloc.titre)}
  <section class="card" lang={legalLang()}>
    <h2><Bidi text={bloc.titre} /></h2>
    {#each bloc.items as it (it.q)}
      <details data-testid="faq">
        <summary><Bidi text={it.q} /></summary>
        <p><Bidi text={it.r} /></p>
      </details>
    {/each}
  </section>
{/each}

<!-- bêta-support : « Signaler un problème » et « Signaler une erreur dans un texte religieux » (en ligne) -->
<section class="card" data-testid="aide-signaler">
  <AvisBouton mode="probleme" />
  <AvisBouton mode="probleme" categorie="religieux" libelle="aide.erreur_religieuse" />
</section>

<section class="card">
  <h2>{t('aide.documents')}</h2>
  <ul>
    <li><a href={resolve('/beta')}><Bidi text={t('aide.beta')} /></a></li>
    {#each LEGAL_PAGES as k (k)}
      {#if k !== 'infobeta'}
        <li><a href={resolve('/legal/[page]', { page: k })}><Bidi text={LEGAL[k].titre} /></a></li>
      {/if}
    {/each}
    <li><a href={resolve('/garanties')}>{t('aide.garanties')}</a></li>
    <li><a href={resolve('/errata')}>{t('errata.titre')}</a></li>
    <li>
      <a href={resolve('/legal/[page]', { page: 'mentions' })} data-testid="aide-contact"
        ><Bidi text={t('aide.contact')} /></a
      >
    </li>
  </ul>
</section>

<style>
  details {
    border-bottom: 1px solid var(--line);
    padding: 8px 0;
  }
  summary {
    cursor: pointer;
    font-weight: 600;
    min-height: 44px;
    display: flex;
    align-items: center;
  }
</style>
