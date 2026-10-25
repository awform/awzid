<script lang="ts">
  import { resolve } from '$app/paths';
  import Bidi from '$lib/Bidi.svelte';
  import { t } from '$lib/i18n';
  import Icon from '$lib/ui/Icon.svelte';

  /** Tuile « Test des jumeaux » parmi les outils du carnet de hifẓ (interrupteur `mutashabihat`), chargée à la demande. */
</script>

<li>
  <a class="tuile" href={resolve('/hifz/jumeaux')} data-testid="outil-jumeaux"
    ><Icon name="alerte" size={24} /><Bidi text={t('mt.tuile')} /></a
  >
</li>

<style>
  .tuile {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 56px;
    padding: 8px 12px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--card, transparent);
    color: var(--ink);
    text-decoration: none;
    font-weight: 600;
  }
  .tuile:focus-visible {
    outline: 3px solid var(--teal);
  }
</style>
