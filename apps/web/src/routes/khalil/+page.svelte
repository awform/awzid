<script lang="ts">
  import { untrack, type Component } from 'svelte';
  import Bidi from '$lib/Bidi.svelte';
  import ConnexionNecessaire from '$lib/ConnexionNecessaire.svelte';
  import { chargerModule } from '$lib/charger';
  import { fn, fonctionsEtat } from '$lib/fonctions.svelte';
  import { t } from '$lib/i18n';

  /** Mukhtaṣar Khalīl (interrupteur `khalil`, canal bêta) : module importé À LA DEMANDE, jamais dans la coquille préchargée. */
  const ouvert = $derived(fn('khalil'));
  let Vue = $state<Component | null>(null);
  let echec = $state(false);
  function charger() {
    echec = false;
    chargerModule(() => import('$lib/lectures'))
      .then((m) => (Vue = m.Khalil))
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
  <section class="card" data-testid="kh-ferme">
    <p><Bidi text={t('fn.coupee')} /></p>
  </section>
{:else}
  <p class="muted" aria-busy="true">…</p>
{/if}
