<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import { fmtDate, t } from '$lib/i18n';
  import { call } from '$lib/session';

  /**
   * File des signalements du CONTENU (lot F1, revue M1) pour le référent religieux et l'administrateur :
   * reçu → en examen → corrigé (erratum public) ou rejeté (motif) ; l'administrateur peut suspendre d'urgence
   * le passage signalé (masqué partout) et lever une suspension. L'auteur d'un signalement n'est jamais montré.
   */
  interface Item {
    id: string;
    createdAt: string;
    targetKind: string;
    unitId: string | null;
    path: string;
    ref: string | null;
    excerpt: string | null;
    reason: string;
    comment: string | null;
    status: string;
  }
  interface Susp {
    id: string;
    unitId: string;
    path: string;
    reason: string;
    createdAt: string;
  }
  let role = $state<string | null>(null);
  let items = $state<Item[]>([]);
  let susp = $state<Susp[]>([]);
  let note = $state<Record<string, string>>({});
  let error = $state('');

  async function load() {
    const r = await call<{ role: string; signalements: Item[]; suspensions: Susp[] }>(
      'GET',
      '/admin/signalements',
    );
    if (!r.ok || !r.data) return;
    role = r.data.role;
    items = r.data.signalements;
    susp = r.data.suspensions;
  }
  onMount(load);

  async function act(p: Promise<{ ok: boolean; code: string | null }>) {
    const r = await p;
    error = r.ok ? '' : t(`erreur.${r.code ?? 'reseau'}`);
    await load();
  }
  const decide = (s: Item, status: string) =>
    act(
      call('PATCH', `/admin/signalements/${s.id}`, {
        status,
        ...(note[s.id]?.trim()
          ? status === 'corrige'
            ? { erratum: note[s.id] }
            : { decisionNote: note[s.id] }
          : {}),
      }),
    );
  const suspend = (s: Item) =>
    act(
      call('POST', '/admin/suspensions', {
        unitId: s.unitId,
        path: s.path,
        reason: note[s.id]?.trim() || t(`signal.m_${s.reason}`),
        reportId: s.id,
      }),
    );
</script>

{#if role}
  <section class="card" data-testid="signalements-contenu">
    <h2>{t('contenu.titre')}</h2>
    <p class="muted small">{t('contenu.aide')}</p>
    {#if error}<p class="bad" role="alert"><Bidi text={error} /></p>{/if}
    <ul class="list">
      {#each items as s (s.id)}
        <li data-testid="signalement-contenu">
          <p>
            <strong>{fmtDate(s.createdAt)}</strong> · <Bidi text={t(`contenu.k_${s.targetKind}`)} /> ·
            <Bidi text={t(`signal.m_${s.reason}`)} /> · <Bidi text={t(`contenu.s_${s.status}`)} />
          </p>
          <p class="small">
            {#if s.unitId}<a href={resolve('/lecons/[id]', { id: s.unitId })}
                ><Bidi text={s.unitId} /></a
              >{/if}
            <Bidi text={[s.path, s.ref].filter(Boolean).join(' · ')} />
          </p>
          {#if s.excerpt}<blockquote><Bidi text={s.excerpt} /></blockquote>{/if}
          {#if s.comment}<p><Bidi text={s.comment} /></p>{/if}
          <label
            >{t('contenu.note')}
            <textarea bind:value={note[s.id]} maxlength="600" rows="2"></textarea></label
          >
          <p class="row">
            {#if s.status === 'recu'}<button type="button" onclick={() => decide(s, 'en_examen')}
                >{t('contenu.examiner')}</button
              >{/if}
            <button type="button" onclick={() => decide(s, 'corrige')}
              >{t('contenu.corrige')}</button
            >
            <button type="button" onclick={() => decide(s, 'rejete')}>{t('contenu.rejeter')}</button
            >
            {#if role === 'admin' && s.unitId}<button
                type="button"
                class="danger"
                onclick={() => suspend(s)}>{t('contenu.suspendre')}</button
              >{/if}
          </p>
        </li>
      {:else}
        <li class="muted">{t('contenu.vide')}</li>
      {/each}
    </ul>
    {#if susp.length}
      <h3>{t('contenu.suspensions')}</h3>
      <ul class="list">
        {#each susp as x (x.id)}
          <li data-testid="suspension">
            {fmtDate(x.createdAt)} · <Bidi
              text={[x.unitId, x.path, x.reason].filter(Boolean).join(' · ')}
            />
            {#if role === 'admin'}<button
                type="button"
                onclick={() => act(call('POST', `/admin/suspensions/${x.id}/lever`, {}))}
                >{t('contenu.lever')}</button
              >{/if}
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{/if}

<style>
  blockquote {
    margin: 4px 0;
    padding-inline-start: 12px;
    border-inline-start: 4px solid var(--line);
  }
  label {
    display: grid;
    gap: 2px;
  }
  .row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  button.danger {
    background: var(--bad-ink);
    border-color: var(--bad-ink);
    color: var(--bad-bg);
    font-weight: 700;
  }
</style>
