<script lang="ts">
  import type { Component, ComponentProps } from 'svelte';
  import { chargerModule } from '$lib/charger';

  type Corps = typeof import('./BoutonEcouteCorps.svelte').default;

  /**
   * A5 — bouton « Réciter et vérifier » (lecteur en mode Mémoriser, carnet de hifẓ). Cette ENVELOPPE est tout ce que la coquille
   * de l'élève garde : le bouton lui-même (`BoutonEcouteCorps.svelte`) ne sert que si le service d'écoute est ouvert pour ce
   * profil (canal bêta) et ne marche qu'EN LIGNE ; il est donc chargé à la demande (liste `EN_LIGNE_MODULES` de
   * scripts/groupes.mjs), jamais préchargé (allègement du 25/10/2026 : −1 Ko sur l'appareil de l'élève).
   */
  let props: ComponentProps<Corps> = $props();
  let Vue = $state<Component<ComponentProps<Corps>> | null>(null);
  $effect(() => {
    if (props.profileId && !Vue)
      void chargerModule(() => import('./BoutonEcouteCorps.svelte')).then(
        (m) => (Vue = m.default),
        () => undefined,
      );
  });
</script>

{#if Vue}<Vue {...props} />{/if}
