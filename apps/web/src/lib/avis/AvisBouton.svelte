<script lang="ts">
  import type { Component } from 'svelte';
  import { t } from '$lib/i18n';
  import { fn } from '$lib/fonctions.svelte';
  import { chargerModule } from '$lib/charger';
  import ConnexionNecessaire from '$lib/ConnexionNecessaire.svelte';

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
      // F5 : nouvelles tentatives automatiques (réseau faible), puis « Connexion nécessaire »
      Dialog ??= (await chargerModule(() => import('./AvisDialog.svelte'))).default;
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
  </p>
  {#if horsLigne}<ConnexionNecessaire onretry={ouvrir} />{/if}
  {#if Dialog && open}<Dialog onclose={() => (open = false)} />{/if}
{/if}
