<script lang="ts" module>
  /** Contexte posé par le lecteur de leçon : leçon et édition du contenu affiché. */
  export const SIGNAL_CTX = 'signaler';
  export type SignalCtx = () => { unitId: string; edition?: string };
</script>

<script lang="ts">
  import type { Component, ComponentProps } from 'svelte';
  import { chargerModule } from '$lib/charger';

  type Corps = typeof import('./SignalerCorps.svelte').default;

  /**
   * « Signaler une erreur » : cette ENVELOPPE est tout ce que la coquille de l'élève garde. Le bouton et son formulaire
   * (`SignalerCorps.svelte`) envoient au serveur : ils ne servent qu'EN LIGNE ; chargés à la demande (liste
   * `EN_LIGNE_MODULES` de scripts/groupes.mjs), jamais préchargés (allègement du 31/10/2026, marge de l'appareil).
   */
  let props: ComponentProps<Corps> = $props();
  let Vue = $state<Component<ComponentProps<Corps>> | null>(null);
  $effect(() => {
    if (!Vue)
      void chargerModule(() => import('./SignalerCorps.svelte')).then(
        (m) => (Vue = m.default),
        () => undefined,
      );
  });
</script>

{#if Vue}<Vue {...props} />{/if}
