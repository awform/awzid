<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n';
  import { ecrireConversation, lireConversation, type ConvReglage } from './reglage';

  /**
   * A26b — voix du partenaire de conversation (préparée pour l'oral, phase 3 : sans effet aujourd'hui). Le parent
   * peut fixer le choix pour un enfant.
   */
  let r: ConvReglage = $state({ voix: 'f', fixe: false });
  onMount(() => (r = lireConversation()));
  const save = () => ecrireConversation(r);
</script>

<section class="card conv-reglages" data-testid="conversation-reglages">
  <h2>{t('conv.reglage_titre')}</h2>
  <p class="muted">{t('conv.voix_note')}</p>
  <fieldset disabled={r.fixe} aria-label={t('conv.reglage_titre')}>
    <label class="check"
      ><input type="radio" name="conv-voix" value="f" bind:group={r.voix} onchange={save} /><span
        >{t('conv.voix_f')}</span
      ></label
    >
    <label class="check"
      ><input type="radio" name="conv-voix" value="m" bind:group={r.voix} onchange={save} /><span
        >{t('conv.voix_m')}</span
      ></label
    >
  </fieldset>
  <label class="check"
    ><input
      type="checkbox"
      bind:checked={r.fixe}
      onchange={save}
      data-testid="conversation-voix-fixe"
    /><span>{t('conv.voix_fixe')}</span></label
  >
</section>

<style>
  fieldset {
    border: 0;
    padding: 0;
    margin: 0 0 8px;
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
  }
  .check {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: var(--target);
  }
</style>
