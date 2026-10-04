<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import { fmtDate, t } from '$lib/i18n';
  import { moderate, moderationQueue, type Signalement } from '$lib/messagerie';

  /**
   * File de modération de la messagerie (lot 21, CDC §2.12) : messages signalés par les familles ou les
   * enseignants. Chaque ouverture de la file est journalisée par le serveur ; « retirer » efface le texte et la
   * pièce jointe (la trace reste), « classer » garde le message.
   */
  let items = $state<Signalement[] | null>(null);
  let error = $state('');

  async function load() {
    const r = await moderationQueue();
    items = r.ok && r.data ? r.data.signalements : [];
    if (!r.ok) error = t(`erreur.${r.code ?? 'reseau'}`);
  }
  onMount(load);

  async function decide(id: string, decision: 'classe' | 'retire') {
    if (decision === 'retire' && !confirm(t('mod.retirer_confirmer'))) return;
    error = '';
    const r = await moderate(id, decision);
    if (!r.ok) error = t(`erreur.${r.code ?? 'reseau'}`);
    await load();
  }
</script>

<section class="card" data-testid="moderation">
  <h2>{t('mod.titre')}</h2>
  <p class="muted small">{t('mod.aide')}</p>
  {#if error}<p class="bad" role="alert"><Bidi text={error} /></p>{/if}
  <ul class="list">
    {#each items ?? [] as s (s.id)}
      <li data-testid="signalement">
        <p>
          <strong>{fmtDate(s.le)}</strong> — <Bidi text={t(`mod.kind_${s.message.kind}`)} /> — <Bidi
            text={t('mod.motif', {
              motif: s.motif,
            })}
          />
        </p>
        <blockquote><Bidi text={s.message.texte ?? t('mod.illisible')} /></blockquote>
        <p class="row">
          <button type="button" onclick={() => decide(s.id, 'classe')}>{t('mod.classer')}</button>
          <button type="button" class="danger" onclick={() => decide(s.id, 'retire')}
            >{t('mod.retirer')}</button
          >
        </p>
      </li>
    {:else}
      <li class="muted">{t('mod.vide')}</li>
    {/each}
  </ul>
</section>

<style>
  blockquote {
    margin: 4px 0;
    padding-inline-start: 12px;
    border-inline-start: 4px solid var(--line);
    white-space: pre-wrap;
  }
  button.danger {
    background: var(--bad-ink);
    border-color: var(--bad-ink);
    color: var(--bad-bg);
    font-weight: 700;
  }
  .row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
</style>
