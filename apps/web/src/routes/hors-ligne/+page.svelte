<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import Loading from '$lib/ui/Loading.svelte';
  import { resolve } from '$app/paths';
  import { flush, onQueue, pendingCount } from '$lib/attempts';
  import { fmtBytes, t } from '$lib/i18n';
  import {
    downloadPack,
    fetchManifest,
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
  /** lot 26 : liste encore en chargement (le serveur prépare les paquets) */
  let ready = $state(false);
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
    ready = true;
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
      message = t('horsligne.disponible', { niveau: m.codeFr ?? m.level });
    } catch (e) {
      message = t('horsligne.echec', { raison: (e as Error).message });
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
          ? t('horsligne.deja_a_jour')
          : r.mode === 'partiel'
            ? t('horsligne.maj_partielle', { n: r.changed.length })
            : t('horsligne.maj_complete');
    } catch (e) {
      message = t('horsligne.maj_impossible', { raison: (e as Error).message });
    }
    busy = null;
    await reload();
  }
  async function remove(level: string) {
    busy = level;
    await removePack(level);
    message = t('horsligne.place_liberee');
    busy = null;
    await reload();
  }
  async function toggleEconome(v: boolean) {
    settings = await saveSettings({ econome: v });
    message = v ? t('horsligne.econome_on') : t('horsligne.econome_off');
  }
  async function sendNow() {
    await flush();
    pending = await pendingCount();
  }
</script>

<svelte:head><title>{t('app.nom')} — {t('horsligne.titre')}</title></svelte:head>

<h1>{t('horsligne.titre')}</h1>
<p class="muted">{t('horsligne.intro')}</p>

{#if offline}<p class="card warn">{t('horsligne.pas_de_reseau')}</p>{/if}
{#if message}<p class="card ok" role="status"><Bidi text={message} /></p>{/if}

<section class="card">
  <h2 id="titre-niveaux">{t('horsligne.niveaux')}</h2>
  {#if !ready}<Loading lines={3} />{/if}
  <table class="levels" aria-labelledby="titre-niveaux">
    <thead
      ><tr
        ><th>{t('horsligne.col_niveau')}</th><th>{t('horsligne.col_poids')}</th><th
          >{t('horsligne.col_etat')}</th
        ><th></th></tr
      ></thead
    >
    <tbody>
      {#each rows as r (r.level)}
        <tr data-level={r.level}>
          <td
            ><strong><Bidi text={r.m?.codeFr ?? r.l?.codeFr ?? r.level} /></strong><br /><span
              class="muted"
              ><Bidi
                text={t('horsligne.lecons', { n: r.m?.units.length ?? r.l?.units.length ?? 0 })}
              /></span
            ></td
          >
          <td data-testid="poids">{fmtBytes(r.m?.bytes ?? r.l?.bytes ?? 0)}</td>
          <td data-testid="etat">
            {#if r.state === 'absent'}{t('horsligne.etat_absent')}
            {:else if r.state === 'a_jour'}{t('horsligne.etat_a_jour')}
            {:else if r.state === 'maj'}<Bidi
                text={t('horsligne.etat_maj', {
                  n: r.changed,
                  poids: fmtBytes(r.updateBytes),
                })}
              />
            {:else}{t('horsligne.etat_local')}{/if}
          </td>
          <td class="act">
            {#if r.state === 'absent' && r.m}
              <button
                type="button"
                class="primary"
                disabled={busy !== null}
                onclick={() => r.m && download(r.m)}>{t('horsligne.telecharger')}</button
              >
            {/if}
            {#if r.state === 'maj'}
              <button
                type="button"
                class="primary"
                disabled={busy !== null}
                onclick={() => update(r.level)}>{t('horsligne.mettre_a_jour')}</button
              >
            {/if}
            {#if r.l}
              <button type="button" disabled={busy !== null} onclick={() => remove(r.level)}
                >{t('horsligne.liberer')}</button
              >
            {/if}
            {#if busy === r.level}<span class="muted">…</span>{/if}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
  {#if confirmLevel}
    <div class="confirm" role="alertdialog" aria-label={t('horsligne.confirmer_aria')}>
      <p><Bidi text={t('horsligne.confirmer', { poids: fmtBytes(confirmLevel.bytes) })} /></p>
      <button
        type="button"
        class="primary"
        onclick={() => confirmLevel && download(confirmLevel, true)}>{t('horsligne.oui')}</button
      >
      <button type="button" onclick={() => (confirmLevel = null)}>{t('horsligne.plus_tard')}</button
      >
    </div>
  {/if}
</section>

<section class="card">
  <h2>{t('horsligne.donnees_titre')}</h2>
  <p>{t('horsligne.mois')} <strong data-testid="donnees-mois">{fmtBytes(month)}</strong></p>
  <p>
    <Bidi text={t('horsligne.place', { poids: fmtBytes(storage.usage) })} /><Bidi
      text={storage.persisted ? t('horsligne.protegee') : ''}
    />
  </p>
  <p>
    {t('horsligne.attente')} <strong data-testid="attente"><Bidi text={pending} /></strong>
    {#if pending > 0}<button type="button" onclick={sendNow}>{t('horsligne.envoyer')}</button>{/if}
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
      ><strong>{t('horsligne.econome')}</strong> — <Bidi
        text={t('horsligne.econome_explication')}
      /></span
    >
  </label>
</section>

<p><a href={resolve('/ecole')}>{t('horsligne.lien_ecole')}</a></p>

<style>
  .levels {
    width: 100%;
    border-collapse: collapse;
  }
  .levels td,
  .levels th {
    padding: 8px 6px;
    border-bottom: 1px solid var(--line);
    text-align: start;
    vertical-align: middle;
  }
  .act {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .warn {
    background: var(--warn-bg);
  }
  .ok {
    background: var(--ok-bg);
  }
  .confirm {
    margin-top: 10px;
    padding: 10px;
    border: 2px dashed var(--gold);
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
