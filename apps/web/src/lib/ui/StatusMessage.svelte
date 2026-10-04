<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { t } from '$lib/i18n';
  import Icon from './Icon.svelte';

  /**
   * Lot 26 — erreur explicite : réseau, hors ligne ou autre, avec ce que l'on peut faire (réessayer).
   * Jamais de détail technique. `kind` : « hors_ligne » si l'appareil n'a pas de réseau.
   */
  let {
    kind = 'erreur',
    message = '',
    onretry,
  }: { kind?: 'erreur' | 'hors_ligne'; message?: string; onretry?: () => void } = $props();
  const off = $derived(kind === 'hors_ligne');
</script>

<div class="status" class:off role="alert" data-testid="etat-erreur" data-kind={kind}>
  <Icon name={off ? 'horsligne' : 'alerte'} size={28} />
  <div>
    <strong><Bidi text={off ? t('etat.hors_ligne_titre') : t('etat.erreur_titre')} /></strong>
    <p><Bidi text={message || (off ? t('etat.hors_ligne_texte') : t('etat.erreur_texte'))} /></p>
    {#if onretry}
      <button type="button" class="button" onclick={onretry} data-testid="reessayer">
        <Icon name="rafraichir" size={20} />{t('etat.reessayer')}
      </button>
    {/if}
  </div>
</div>

<style>
  .status {
    display: flex;
    gap: var(--space-m);
    align-items: flex-start;
    padding: var(--space-m);
    margin: var(--space-m) 0;
    border-radius: var(--radius-lg);
    background: var(--bad-bg);
    color: var(--bad-ink);
  }
  .status.off {
    background: var(--warn-bg);
    color: var(--warn-ink);
  }
  p {
    margin: 4px 0 var(--space-s);
    color: var(--ink);
  }
  button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
</style>
