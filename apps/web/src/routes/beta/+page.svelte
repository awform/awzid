<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { resolve } from '$app/paths';
  import { t } from '$lib/i18n';
  import AvisBouton from '$lib/avis/AvisBouton.svelte';
  import LegalDoc from '$lib/legal/LegalDoc.svelte';
  import { legalPages } from '$lib/legal/pages';
  const LEGAL = legalPages();

  /**
   * Page d'information de la bêta fermée (P1-7/P1-8) : ce qu'est la bêta, ce qui est testé, limites connues,
   * comment signaler. Page PUBLIQUE ; texte dans static/i18n/legal/<langue>.json (clé `infobeta`).
   */
</script>

<svelte:head><title>{t('app.nom')} — {LEGAL.infobeta.titre}</title></svelte:head>

<LegalDoc cle="infobeta" />

<section class="card" data-testid="beta-liens">
  <ul>
    <li><a href={resolve('/aide')}>{t('aide.titre')}</a></li>
    <li><a href={resolve('/errata')}>{t('errata.titre')}</a></li>
    {#each ['beta', 'invites', 'confidentialite'] as const as k (k)}
      <li><a href={resolve('/legal/[page]', { page: k })}><Bidi text={LEGAL[k].titre} /></a></li>
    {/each}
  </ul>
  <AvisBouton mode="probleme" />
</section>
