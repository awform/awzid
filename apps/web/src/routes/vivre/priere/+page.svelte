<script lang="ts">
  import { untrack, type Component } from 'svelte';
  import { page } from '$app/state';
  import { resolve } from '$app/paths';
  import Bidi from '$lib/Bidi.svelte';
  import ConnexionNecessaire from '$lib/ConnexionNecessaire.svelte';
  import { chargerModule } from '$lib/charger';
  import { fn, fonctionsEtat } from '$lib/fonctions.svelte';
  import { t } from '$lib/i18n';
  import { noter } from '$lib/usage';

  /**
   * « La prière de A à Z » (25/10/2026) — rubrique de « Vivre l'islam » : `?e=` choisit l'écran (accueil, pas, video, ablutions,
   * sourate, entrainement, situations, apres, pourquoi, preparer, appel). Derrière l'interrupteur `parcours_priere` (coupé par
   * défaut ; « canal bêta » depuis l'administration) et celui de l'espace. Tout le parcours est chargé À LA DEMANDE
   * (`$lib/priere`, liste `/_app/priere.json`, garde de poids dédiée) : jamais préchargé.
   */
  const ouvert = $derived(fn('vivre_islam') && fn('parcours_priere'));
  let Vue = $state<Component<{ ecran: string | null; params: URLSearchParams }> | null>(null);
  let echec = $state(false);
  function charger() {
    echec = false;
    chargerModule(() => import('$lib/priere'))
      .then((m) => {
        Vue = m.Priere;
        noter('parcours_priere');
      })
      .catch(() => (echec = true));
  }
  $effect(() => {
    if (ouvert && !Vue && !untrack(() => echec)) charger();
  });
</script>

<svelte:head><title>{t('app.nom')} — {t('nav.vivre')}</title></svelte:head>

{#if ouvert && Vue}
  <Vue ecran={page.url.searchParams.get('e')} params={page.url.searchParams} />
{:else if ouvert && echec}
  <ConnexionNecessaire onretry={charger} />
{:else if !ouvert && fonctionsEtat.qui}
  <section class="card info" data-testid="priere-ferme">
    <p><Bidi text={t('fn.coupee')} /></p>
    <a href={resolve('/vivre')}>← {t('vi.toutes')}</a>
  </section>
{:else}
  <p class="muted" aria-busy="true">…</p>
{/if}

<style>
  .info {
    background: var(--info-bg);
  }
</style>
