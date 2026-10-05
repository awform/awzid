<script lang="ts" module>
  /** Contexte posé par le lecteur de leçon : leçon et édition du contenu affiché. */
  export const SIGNAL_CTX = 'signaler';
  export type SignalCtx = () => { unitId: string; edition?: string };
</script>

<script lang="ts">
  import { getContext } from 'svelte';
  import Bidi from '$lib/Bidi.svelte';
  import { blockFingerprint } from '@awform/content/suspension';
  import { t } from '$lib/i18n';
  import { sendReport, type ReportBody } from '$lib/signaler';

  /**
   * « Signaler une erreur » (lot F1, revue M1) : petit bouton sous un verset, un hadith, une règle de fiqh,
   * un exercice ou la leçon ; formulaire court (motif + commentaire facultatif, sans donnée personnelle).
   */
  let {
    kind,
    path = '',
    block = undefined,
    excerpt = '',
    ref = '',
  }: {
    kind: ReportBody['targetKind'];
    path?: string;
    /** bloc affiché (empreinte : la suspension visera exactement ce bloc) */
    block?: unknown;
    excerpt?: string;
    ref?: string;
  } = $props();
  const ctx = getContext<SignalCtx | undefined>(SIGNAL_CTX);
  const REASONS: Record<ReportBody['targetKind'], string[]> = {
    verset: ['texte_arabe', 'sens', 'reference', 'autre'],
    hadith: ['texte_arabe', 'sens', 'reference', 'autre'],
    fiqh: ['regle', 'reference', 'orthographe', 'autre'],
    lecon: ['orthographe', 'sens', 'autre'],
    exercice: ['corrige', 'orthographe', 'autre'],
  };
  let open = $state(false);
  let reason = $state('');
  let comment = $state('');
  let msg = $state('');

  async function send(e: SubmitEvent) {
    e.preventDefault();
    const c = ctx?.();
    if (!c || !reason) return;
    const r = await sendReport({
      targetKind: kind,
      unitId: c.unitId,
      path,
      reason,
      ...(c.edition ? { edition: c.edition } : {}),
      ...(excerpt ? { excerpt: excerpt.slice(0, 300) } : {}),
      ...(ref ? { ref: ref.slice(0, 120) } : {}),
      ...(block !== undefined ? { fp: blockFingerprint(block) } : {}),
      ...(comment.trim() ? { comment: comment.trim() } : {}),
    });
    msg = t(
      ['ok', 'attente', 'deja_signale', 'trop_de_signalements', 'non_connecte'].includes(r)
        ? `signal.r_${r}`
        : 'signal.r_erreur',
    );
    if (r === 'ok' || r === 'attente' || r === 'deja_signale') open = false;
  }
</script>

{#if ctx}
  <span class="sig">
    <button type="button" class="link" aria-expanded={open} onclick={() => (open = !open)}
      >{t('signal.bouton')}</button
    >
    {#if open}
      <form onsubmit={send} data-testid="signaler-form">
        <label
          >{t('signal.motif')}
          <select bind:value={reason} required>
            <option value="" disabled>—</option>
            {#each REASONS[kind] as r (r)}<option value={r}>{t(`signal.m_${r}`)}</option>{/each}
          </select></label
        >
        <label
          >{t('signal.commentaire')}
          <textarea bind:value={comment} maxlength="300" rows="2"></textarea></label
        >
        <small>{t('signal.sans_donnees')}</small>
        <button type="submit">{t('signal.envoyer')}</button>
      </form>
    {/if}
    {#if msg}<small role="status"><Bidi text={msg} /></small>{/if}
  </span>
{/if}

<style>
  .sig {
    display: inline-grid;
    gap: 4px;
    font-size: 0.85rem;
  }
  /* discret mais cible tactile de 44 px (A11Y-1) */
  .link {
    background: none;
    border: 0;
    padding: 0 4px;
    color: var(--ink2);
    text-decoration: underline;
    font-size: inherit;
    justify-self: start;
  }
  form {
    display: grid;
    gap: 6px;
    padding: 8px;
    border: 1px solid var(--line);
    border-radius: 8px;
  }
  label {
    display: grid;
    gap: 2px;
  }
</style>
