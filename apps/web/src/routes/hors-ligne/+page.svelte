<script lang="ts">
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import { flush, onQueue, pendingCount } from '$lib/attempts';
  import {
    downloadPack,
    fetchManifest,
    formatBytes,
    getSettings,
    LARGE_DOWNLOAD,
    localPacks,
    monthBytes,
    removePack,
    requestPersistence,
    saveSettings,
    storageInfo,
    updatePack,
    type PackManifestEntry,
    type Settings,
    type StoredPack,
  } from '$lib/offline';

  /**
   * « Mes téléchargements » : niveaux disponibles sans réseau, poids affiché AVANT tout téléchargement,
   * mise à jour différentielle, « libérer de la place », données du mois, mode « données économes ».
   */
  let manifest: PackManifestEntry[] = $state([]);
  let local: StoredPack[] = $state([]);
  let settings: Settings | null = $state(null);
  let month = $state(0);
  let storage = $state({ usage: 0, quota: 0, persisted: false });
  let pending = $state(0);
  let busy: string | null = $state(null);
  let message = $state('');
  let offline = $state(false);
  let confirmLevel: PackManifestEntry | null = $state(null);

  async function reload() {
    local = await localPacks();
    settings = await getSettings();
    month = await monthBytes();
    storage = await storageInfo();
    pending = await pendingCount();
    try {
      manifest = await fetchManifest();
      month = await monthBytes();
      offline = false;
    } catch {
      offline = true;
    }
  }

  onMount(() => {
    void reload();
    return onQueue((n) => (pending = n));
  });

  const rows = $derived.by(() => {
    const levels = new Set([...manifest.map((m) => m.level), ...local.map((l) => l.level)]);
    return [...levels].sort().map((level) => {
      const m = manifest.find((x) => x.level === level);
      const l = local.find((x) => x.level === level);
      const state = !l ? 'absent' : !m ? 'local' : l.hash === m.hash ? 'a_jour' : 'maj';
      const changed =
        l && m
          ? m.units.filter((u) => l.units.find((x) => x.id === u.id)?.sha256 !== u.sha256)
          : [];
      const updateBytes = changed.reduce((s, u) => s + u.brotliBytes, 0);
      return { level, m, l, state, changed: changed.length, updateBytes };
    });
  });

  async function download(m: PackManifestEntry, confirmed = false) {
    if (!confirmed && settings?.econome && m.bytes > LARGE_DOWNLOAD) {
      confirmLevel = m;
      return;
    }
    confirmLevel = null;
    busy = m.level;
    message = '';
    try {
      await requestPersistence();
      await downloadPack(m.level, fetch, m.bytes);
      message = `${m.codeFr ?? m.level} est disponible sans réseau.`;
    } catch (e) {
      message = `Téléchargement impossible : ${(e as Error).message}`;
    }
    busy = null;
    await reload();
  }
  async function update(level: string) {
    busy = level;
    try {
      const r = await updatePack(level);
      message =
        r.mode === 'a_jour'
          ? 'Déjà à jour.'
          : r.mode === 'partiel'
            ? `${r.changed.length} leçon(s) mise(s) à jour.`
            : 'Niveau retéléchargé.';
    } catch (e) {
      message = `Mise à jour impossible : ${(e as Error).message}`;
    }
    busy = null;
    await reload();
  }
  async function remove(level: string) {
    busy = level;
    await removePack(level);
    message = 'Place libérée. Les progrès sont gardés.';
    busy = null;
    await reload();
  }
  async function toggleEconome(v: boolean) {
    settings = await saveSettings({ econome: v });
    message = v ? 'Données économes activées.' : 'Données économes désactivées.';
  }
  async function sendNow() {
    await flush();
    pending = await pendingCount();
  }
</script>

<svelte:head><title>AWFORM — Téléchargements</title></svelte:head>

<h1>Mes téléchargements</h1>
<p class="muted">
  Un niveau téléchargé fonctionne sans réseau : leçons, images et exercices. Les réponses sont
  gardées sur le téléphone et envoyées au retour du réseau.
</p>

{#if offline}<p class="card warn">Pas de réseau : voici ce qui est déjà sur l'appareil.</p>{/if}
{#if message}<p class="card ok" role="status">{message}</p>{/if}

<section class="card">
  <h2>Niveaux</h2>
  <table class="levels">
    <thead><tr><th>Niveau</th><th>Poids</th><th>État</th><th></th></tr></thead>
    <tbody>
      {#each rows as r (r.level)}
        <tr data-level={r.level}>
          <td
            ><strong>{r.m?.codeFr ?? r.l?.codeFr ?? r.level}</strong><br /><span class="muted"
              >{r.m?.units.length ?? r.l?.units.length} leçons</span
            ></td
          >
          <td data-testid="poids">{formatBytes(r.m?.bytes ?? r.l?.bytes ?? 0)}</td>
          <td data-testid="etat">
            {#if r.state === 'absent'}non téléchargé
            {:else if r.state === 'a_jour'}✓ sur l'appareil
            {:else if r.state === 'maj'}mise à jour : {r.changed} leçon(s), {formatBytes(
                r.updateBytes,
              )}
            {:else}sur l'appareil{/if}
          </td>
          <td class="act">
            {#if r.state === 'absent' && r.m}
              <button
                type="button"
                class="primary"
                disabled={busy !== null}
                onclick={() => r.m && download(r.m)}>Télécharger</button
              >
            {/if}
            {#if r.state === 'maj'}
              <button
                type="button"
                class="primary"
                disabled={busy !== null}
                onclick={() => update(r.level)}>Mettre à jour</button
              >
            {/if}
            {#if r.l}
              <button type="button" disabled={busy !== null} onclick={() => remove(r.level)}
                >Libérer la place</button
              >
            {/if}
            {#if busy === r.level}<span class="muted">…</span>{/if}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
  {#if confirmLevel}
    <div class="confirm" role="alertdialog" aria-label="Confirmer le téléchargement">
      <p>
        Données économes : ce téléchargement pèse <strong>{formatBytes(confirmLevel.bytes)}</strong
        >. Continuer ?
      </p>
      <button
        type="button"
        class="primary"
        onclick={() => confirmLevel && download(confirmLevel, true)}>Oui, télécharger</button
      >
      <button type="button" onclick={() => (confirmLevel = null)}>Plus tard</button>
    </div>
  {/if}
</section>

<section class="card">
  <h2>Données et stockage</h2>
  <p>Téléchargé ce mois-ci : <strong data-testid="donnees-mois">{formatBytes(month)}</strong></p>
  <p>
    Place utilisée sur l'appareil : {formatBytes(storage.usage)}{storage.persisted
      ? ' (protégée)'
      : ''}
  </p>
  <p>
    Réponses en attente d'envoi : <strong data-testid="attente">{pending}</strong>
    {#if pending > 0}<button type="button" onclick={sendNow}>Envoyer maintenant</button>{/if}
  </p>
  <label class="switch">
    <input
      type="checkbox"
      checked={settings?.econome ?? false}
      disabled={!settings}
      onchange={(e) => toggleEconome(e.currentTarget.checked)}
      data-testid="econome"
    />
    <span
      ><strong>Données économes</strong> — aucun téléchargement sans mon accord, demande de confirmation
      au-delà de 200 Ko, pas de préchargement des pages.</span
    >
  </label>
</section>

<p><a href={resolve('/ecole')}>Mode école (tablette partagée)</a></p>

<style>
  .levels {
    width: 100%;
    border-collapse: collapse;
  }
  .levels td,
  .levels th {
    padding: 8px 6px;
    border-bottom: 1px solid var(--line);
    text-align: left;
    vertical-align: middle;
  }
  .act {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .warn {
    background: #fff8e1;
  }
  .ok {
    background: #eaf7f1;
  }
  .confirm {
    margin-top: 10px;
    padding: 10px;
    border: 2px dashed #f2b233;
    border-radius: 12px;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  .confirm p {
    flex-basis: 100%;
    margin: 0;
  }
  .switch {
    display: flex;
    gap: 10px;
    align-items: flex-start;
  }
  .switch input {
    width: 28px;
    height: 28px;
    flex: none;
  }
</style>
