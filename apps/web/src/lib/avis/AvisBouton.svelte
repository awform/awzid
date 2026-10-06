<script lang="ts">
  import type { Component } from 'svelte';
  import { t } from '$lib/i18n';
  import { fn } from '$lib/fonctions.svelte';

  /**
   * F5 — « Donner mon avis » (élève, parent, enseignant) : petit lien discret ; la fenêtre (et sa capture
   * d'écran) n'est chargée qu'à l'ouverture, en ligne (jamais préchargée sur l'appareil de l'élève).
   */
  let Dialog = $state<Component<{ onclose: () => void }> | null>(null);
  let open = $state(false);
  let horsLigne = $state(false);

  async function ouvrir() {
    horsLigne = false;
    try {
      Dialog ??= (await import('./AvisDialog.svelte')).default;
      open = true;
    } catch {
      horsLigne = true;
    }
  }
</script>

{#if fn('avis')}
  <p>
    <button type="button" class="ghost" data-testid="avis-ouvrir" onclick={ouvrir}
      >{t('avis.bouton')}</button
    >
    {#if horsLigne}<span class="muted" role="status">{t('avis.hors_ligne')}</span>{/if}
  </p>
  {#if Dialog && open}<Dialog onclose={() => (open = false)} />{/if}
{/if}
