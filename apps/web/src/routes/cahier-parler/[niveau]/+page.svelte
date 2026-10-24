<script lang="ts">
  import { untrack, type Component } from 'svelte';
  import { page } from '$app/state';
  import { resolve } from '$app/paths';
  import Bidi from '$lib/Bidi.svelte';
  import ConnexionNecessaire from '$lib/ConnexionNecessaire.svelte';
  import { PARLER_NIVEAUX } from '$lib/cahier-parler-niveaux';
  import { chargerModule } from '$lib/charger';
  import { fn, fonctionsEtat } from '$lib/fonctions.svelte';
  import { t } from '$lib/i18n';
  import { noter } from '$lib/usage';

  /**
   * Cahier « Je parle » (24/10/2026) — carnet d'un niveau (`?e=e02` : une étape ; `&p=P019` : une page). Derrière
   * l'interrupteur `cahier_parler` (coupé par défaut ; « canal bêta » depuis l'administration). Tout le cahier est
   * chargé À LA DEMANDE (`$lib/cahier-parler`, liste `/_app/parler.json`, garde de poids dédiée) : jamais préchargé.
   */
  const niveau = $derived(page.params.niveau ?? '');
  const ouvert = $derived(fn('cahier_parler') && PARLER_NIVEAUX.includes(niveau));
  let Vue = $state<Component<{
    niveau: string;
    etapeId: string | null;
    pageId: string | null;
  }> | null>(null);
  let echec = $state(false);
  function charger() {
    echec = false;
    chargerModule(() => import('$lib/cahier-parler'))
      .then((m) => {
        Vue = m.Parler;
        noter('cahier_parler');
      })
      .catch(() => (echec = true));
  }
  $effect(() => {
    if (ouvert && !Vue && !untrack(() => echec)) charger();
  });
</script>

<svelte:head><title>{t('app.nom')} — {t('parler.titre')}</title></svelte:head>

{#if ouvert && Vue}
  <Vue {niveau} etapeId={page.url.searchParams.get('e')} pageId={page.url.searchParams.get('p')} />
{:else if ouvert && echec}
  <ConnexionNecessaire onretry={charger} />
{:else if !ouvert && fonctionsEtat.qui}
  <section class="card info" data-testid="parler-ferme">
    <p><Bidi text={t('fn.coupee')} /></p>
    <a href={resolve('/')}>{t('niveau.retour')}</a>
  </section>
{:else}
  <p class="muted" aria-busy="true">…</p>
{/if}

<style>
  .info {
    background: var(--info-bg);
  }
</style>
