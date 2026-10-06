<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n';
  import { call } from '$lib/session';

  /**
   * A39 — l'ENSEIGNANT décide de la façon d'avancer de sa classe (mineurs de la classe ; hors classe, le choix
   * des familles) ; il voit discrètement les notions fragiles de ses élèves (erreurs non revues).
   */
  let { classId }: { classId: string } = $props();
  let mode = $state('');
  let msg = $state('');
  let eleves = $state<
    Array<{ pupilId: string; nom: string; fragiles: Array<{ unitId: string; titleFr: string }> }>
  >([]);
  onMount(async () => {
    const r = await call<{ mode: string | null }>(
      'GET',
      `/ecole/classes/${classId}/mode-evaluation`,
    );
    mode = r.data?.mode ?? '';
    const f = await call<{ eleves: typeof eleves }>(
      'GET',
      `/ecole/classes/${classId}/notions-fragiles`,
    );
    eleves = f.data?.eleves ?? [];
  });
  async function save() {
    const r = await call('PUT', `/ecole/classes/${classId}/mode-evaluation`, {
      mode: mode || null,
    });
    msg = r.ok ? t('ser.ok') : t(`erreur.${r.code ?? 'reseau'}`);
  }
</script>

<section class="card" data-testid="mode-classe">
  <h2>{t('ser.classe_titre')}</h2>
  <p>
    <select bind:value={mode} aria-label={t('ser.classe_titre')} data-testid="mode-classe-choix">
      <option value="">{t('ser.classe_libre')}</option>
      {#each ['douce', 'verification', 'serein'] as m (m)}<option value={m}
          >{t(`ser.m_${m}`)}</option
        >{/each}
    </select>
    <button type="button" class="primary" onclick={save} data-testid="mode-classe-enregistrer"
      >{t('commun.enregistrer')}</button
    >
    {#if msg}<span role="status">{msg}</span>{/if}
  </p>
  {#if eleves.length}
    <details data-testid="fragiles-classe">
      <summary>{t('ser.fragiles_titre')} ({eleves.length})</summary>
      <p class="muted">{t('ser.fragiles_aide')}</p>
      <ul>
        {#each eleves as e (e.pupilId)}
          <li>
            <strong><Bidi text={e.nom} /></strong> —
            <Bidi text={e.fragiles.map((f) => f.titleFr).join(' · ')} />
          </li>
        {/each}
      </ul>
    </details>
  {/if}
</section>
