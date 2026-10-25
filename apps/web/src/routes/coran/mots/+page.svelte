<script lang="ts">
  import { untrack, type Component } from 'svelte';
  import Bidi from '$lib/Bidi.svelte';
  import ConnexionNecessaire from '$lib/ConnexionNecessaire.svelte';
  import { chargerModule } from '$lib/charger';
  import { fn, fonctionsEtat } from '$lib/fonctions.svelte';
  import { t } from '$lib/i18n';

  /**
   * « Mots du Coran » : recherche par mot et par racine, fiche racine, sources. Derrière l'interrupteur `coran_mots` (coupé par
   * défaut ; « canal bêta » depuis l'administration). Le module est importé À LA DEMANDE (comme par le lecteur du Coran) : jamais
   * dans la coquille préchargée de l'élève ; l'échec du chargement (réseau faible) est dit, jamais un écran figé.
   */
  const ouvert = $derived(fn('coran_mots'));
  let Vue = $state<Component | null>(null);
  let echec = $state(false);
  function charger() {
    echec = false;
    chargerModule(() => import('$lib/coran-mots'))
      .then((m) => (Vue = m.Recherche))
      .catch(() => (echec = true));
  }
  $effect(() => {
    if (ouvert && !Vue && !untrack(() => echec)) charger();
  });
</script>

<svelte:head><title>{t('app.nom')} — {t('nav.coran')}</title></svelte:head>

{#if ouvert && Vue}
  <Vue />
{:else if ouvert && echec}
  <ConnexionNecessaire onretry={charger} />
{:else if !ouvert && fonctionsEtat.qui}
  <section class="card" data-testid="cm-ferme">
    <p><Bidi text={t('fn.coupee')} /></p>
  </section>
{:else}
  <p class="muted" aria-busy="true">…</p>
{/if}
