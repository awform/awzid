<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { t } from '$lib/i18n';

  /**
   * Codes de RÉCUPÉRATION (18/10/2026) : montrés UNE seule fois (inscription par numéro, régénération depuis le
   * compte), « à recopier sur papier » ; chacun permet une fois de choisir un nouveau mot de passe sans e-mail ni
   * message. Rien n'est gardé sur l'appareil.
   */
  let { codes, onfini }: { codes: string[]; onfini?: () => void } = $props();
  let copie = $state(false);
  let recopie = $state(false);
  async function copier() {
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      copie = true;
    } catch {
      /* copie manuelle */
    }
  }
</script>

<section class="codes" aria-labelledby="codes-titre" data-testid="codes-secours">
  <h2 id="codes-titre" tabindex="-1"><Bidi text={t('id.codes_titre')} /></h2>
  <p><Bidi text={t('id.codes_intro')} /></p>
  <ol class="liste" dir="ltr">
    {#each codes as c (c)}<li><code data-testid="code-secours"><Bidi text={c} /></code></li>{/each}
  </ol>
  <div class="actions">
    <button type="button" onclick={copier}
      ><Bidi text={copie ? t('id.codes_copies') : t('id.codes_copier')} /></button
    >
    <button type="button" onclick={() => window.print()}
      ><Bidi text={t('id.codes_imprimer')} /></button
    >
  </div>
  {#if onfini}
    <label class="coche"
      ><input type="checkbox" bind:checked={recopie} data-testid="codes-recopies" />
      <span><Bidi text={t('id.codes_recopies')} /></span></label
    >
    <button
      type="button"
      class="primary grand"
      disabled={!recopie}
      onclick={onfini}
      data-testid="codes-continuer"><Bidi text={t('id.continuer')} /></button
    >
  {/if}
</section>

<style>
  .codes {
    display: grid;
    gap: 12px;
  }
  h2 {
    margin: 0;
    font-size: 1.2rem;
    color: var(--navy);
  }
  p {
    margin: 0;
  }
  .liste {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px 16px;
    margin: 0;
    padding: 14px 14px 14px 36px;
    border-radius: 12px;
    background: var(--surface);
    border: 1px dashed var(--line);
  }
  code {
    font-size: 1.05rem;
    letter-spacing: 0.06em;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .actions button {
    min-height: 44px;
  }
  .coche {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    min-height: 44px;
    cursor: pointer;
  }
  .coche input {
    width: 24px;
    height: 24px;
    margin: 0;
    flex: none;
  }
  .grand {
    min-height: 54px;
    border-radius: 14px;
    font-family: var(--font-title);
    font-weight: 600;
  }
</style>
