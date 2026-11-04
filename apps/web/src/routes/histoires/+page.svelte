<script lang="ts">
  import { untrack, type Component } from 'svelte';
  import Bidi from '$lib/Bidi.svelte';
  import ConnexionNecessaire from '$lib/ConnexionNecessaire.svelte';
  import { chargerModule } from '$lib/charger';
  import { fn, fonctionsEtat } from '$lib/fonctions.svelte';
  import { t } from '$lib/i18n';

  /** « Histoire, de la création à nos jours » (interrupteur `histoires`, canal bêta) : module importé À LA DEMANDE. */
  const ouvert = $derived(fn('histoires'));
  let Vue = $state<Component | null>(null);
  let echec = $state(false);
  function charger() {
    echec = false;
    chargerModule(() => import('$lib/lectures'))
      .then((m) => (Vue = m.Histoires))
      .catch(() => (echec = true));
  }
  $effect(() => {
    if (ouvert && !Vue && !untrack(() => echec)) charger();
  });
</script>

<svelte:head><title>{t('app.nom')}</title></svelte:head>

{#if ouvert && Vue}
  <Vue />
{:else if ouvert && echec}
  <ConnexionNecessaire onretry={charger} />
{:else if !ouvert && fonctionsEtat.qui}
  <section class="card" data-testid="hx-ferme">
    <p><Bidi text={t('fn.coupee')} /></p>
  </section>
{:else}
  <p class="muted" aria-busy="true">…</p>
{/if}
