<script lang="ts">
  import type { Component } from 'svelte';
  import Bidi from '$lib/Bidi.svelte';
  import { t } from '$lib/i18n';
  import { fn } from '$lib/fonctions.svelte';
  import { chargerModule } from '$lib/charger';
  import ConnexionNecessaire from '$lib/ConnexionNecessaire.svelte';
  import Icon from '$lib/ui/Icon.svelte';

  /**
   * F5 — « Donner mon avis » (élève, parent, enseignant) : petit lien discret ; la fenêtre (et sa capture
   * d'écran) n'est chargée qu'à l'ouverture, en ligne (jamais préchargée sur l'appareil de l'élève).
   * Bêta-support — `mode="probleme"` : « Signaler un problème » (même fenêtre, autres catégories, autre file).
   */
  // D2 : `ligne` — entrée d'une liste de navigation (« Plus » : icône + nom écrit)
  let { mode = 'avis', ligne = false }: { mode?: 'avis' | 'probleme'; ligne?: boolean } = $props();
  let Dialog = $state<Component<{ onclose: () => void; mode?: 'avis' | 'probleme' }> | null>(null);
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

{#if fn(mode === 'probleme' ? 'signaler' : 'avis') && ligne}
  <li>
    <button type="button" data-testid="{mode}-ouvrir" onclick={ouvrir}
      ><span class="ic"><Icon name={mode === 'probleme' ? 'alerte' : 'message'} /></span><span
        class="nom"><Bidi text={t(`${mode}.bouton`)} /></span
      ></button
    >
    {#if horsLigne}<ConnexionNecessaire onretry={ouvrir} />{/if}
    {#if Dialog && open}<Dialog {mode} onclose={() => (open = false)} />{/if}
  </li>
{:else if fn(mode === 'probleme' ? 'signaler' : 'avis')}
  <p>
    <button type="button" class="ghost" data-testid="{mode}-ouvrir" onclick={ouvrir}
      >{#if mode === 'probleme'}<Icon name="question" size={20} />
      {/if}<Bidi text={t(`${mode}.bouton`)} /></button
    >
  </p>
  {#if horsLigne}<ConnexionNecessaire onretry={ouvrir} />{/if}
  {#if Dialog && open}<Dialog {mode} onclose={() => (open = false)} />{/if}
{/if}
