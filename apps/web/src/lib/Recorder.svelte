<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { fmtDate, t } from '$lib/i18n';
  import {
    deleteRecording,
    listRecordings,
    saveRecording,
    KEEP_DAYS,
    type Recording,
  } from '$lib/recordings';

  /** « Je m'enregistre » : la récitation reste sur l'appareil (jamais envoyée), effacée après 7 jours. */
  let { profileId, part }: { profileId: string; part: string } = $props();

  let recs: Array<Recording & { url: string }> = $state([]);
  let recorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  let recording = $state(false);
  let error = $state('');
  const supported = typeof window !== 'undefined' && 'MediaRecorder' in window;

  async function refresh() {
    for (const r of recs) URL.revokeObjectURL(r.url);
    recs = (await listRecordings(profileId)).map((r) => ({
      ...r,
      url: URL.createObjectURL(r.blob),
    }));
  }
  onMount(refresh);
  onDestroy(() => {
    for (const r of recs) URL.revokeObjectURL(r.url);
    recorder?.stream.getTracks().forEach((tr) => tr.stop());
  });

  async function start() {
    error = '';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunks = [];
      recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((tr) => tr.stop());
        await saveRecording(profileId, part, new Blob(chunks, { type: recorder?.mimeType }));
        await refresh();
      };
      recorder.start();
      recording = true;
    } catch {
      error = t('hifz.enreg_micro_refuse');
    }
  }
  function stop() {
    recorder?.stop();
    recording = false;
  }
  async function remove(id: string) {
    await deleteRecording(id);
    await refresh();
  }
</script>

<div class="rec" data-testid="enregistreur">
  <p class="muted small">{t('hifz.enreg_local', { jours: KEEP_DAYS })}</p>
  {#if !supported}
    <p class="muted">{t('hifz.enreg_indisponible')}</p>
  {:else if recording}
    <button type="button" class="stop" onclick={stop} data-testid="enreg-stop"
      >{t('hifz.enreg_arreter')}</button
    >
  {:else}
    <button type="button" onclick={start} data-testid="enreg-start"
      >{t('hifz.enreg_commencer')}</button
    >
  {/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#each recs as r (r.id)}
    <div class="item">
      <audio controls src={r.url}></audio>
      <span class="muted small">{fmtDate(r.createdAt)}</span>
      <button type="button" class="small" onclick={() => remove(r.id)}
        >{t('commun.supprimer')}</button
      >
    </div>
  {/each}
</div>

<style>
  .rec {
    display: grid;
    gap: 8px;
  }
  .item {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  audio {
    max-width: 100%;
  }
  .stop {
    background: #b3261e;
    color: #fff;
    border-color: #b3261e;
  }
  .small {
    font-size: 0.9rem;
  }
  .error {
    color: #b3261e;
  }
</style>
