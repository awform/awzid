<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import {
    accountProfiles,
    flush,
    pendingCount,
    setActiveProfile,
    type DevProfile,
  } from '$lib/attempts';
  import { t } from '$lib/i18n';
  import { kvGet, kvSet } from '$lib/idb';
  import { getSettings, saveSettings, type Settings } from '$lib/offline';
  import { cachedMe, call, fetchMe, type Me } from '$lib/session';
  import Sym from '$lib/Sym.svelte';
  import { hashCode, SYMBOLS } from '$lib/symbols';

  /**
   * Mode école / appareil familial partagé (ARCHITECTURE_V2 §3.4) : grille des profils du compte
   * (avatars sans visage), entrée par CODE IMAGE de 4 symboles, retour automatique à la grille après
   * inactivité, aucune donnée sensible visible sans code. Les codes sont gardés sous forme d'empreinte.
   */
  let settings: Settings | null = $state(null);
  let profiles: DevProfile[] = $state([]);
  let connected = $state(true);
  let codes: Record<string, string> = $state({});
  let chosen: DevProfile | null = $state(null);
  let entry: string[] = $state([]);
  let error = $state('');
  let setup: DevProfile | null = $state(null);
  let setupCode: string[] = $state([]);
  let info = $state('');
  /** réglages protégés par le code de l'adulte (parent ou enseignant) : déverrouillés jusqu'à fermeture */
  let me = $state<Me | null>(null);
  let unlocked = $state(false);
  let adultPin = $state('');
  let pinError = $state('');
  async function unlock(e: SubmitEvent) {
    e.preventDefault();
    const r = await call('POST', '/account/pin/verify', { pin: adultPin });
    adultPin = '';
    if (r.ok) {
      unlocked = true;
      pinError = '';
    } else pinError = t(`erreur.${r.code ?? 'reseau'}`);
  }

  onMount(async () => {
    settings = await getSettings();
    profiles = await accountProfiles();
    me = (await cachedMe()) ?? (await fetchMe());
    connected = !!me;
    codes = (await kvGet<Record<string, string>>('schoolCodes')) ?? {};
    await setActiveProfile(null);
  });

  async function enable(v: boolean) {
    settings = await saveSettings({ ecole: v });
  }
  async function setIdle(m: number) {
    settings = await saveSettings({ idleMinutes: m });
  }

  function pick(p: DevProfile) {
    chosen = p;
    entry = [];
    error = '';
  }
  async function press(sym: string) {
    if (!chosen) return;
    entry = [...entry, sym];
    if (entry.length < 4) return;
    const ok = codes[chosen.id] && (await hashCode(chosen.id, entry)) === codes[chosen.id];
    if (ok) {
      await setActiveProfile(chosen);
      await goto(resolve('/'));
    } else {
      error = t('ecole.mauvais_code');
      entry = [];
    }
  }

  async function saveCode() {
    if (!setup || setupCode.length !== 4) return;
    codes = { ...codes, [setup.id]: await hashCode(setup.id, setupCode) };
    await kvSet('schoolCodes', codes);
    info = t('ecole.code_enregistre', { nom: setup.pseudonym });
    setup = null;
    setupCode = [];
  }

  /** Efface de la tablette ce qui concerne l'élève (après envoi de ses réponses en attente). */
  async function forget(p: DevProfile) {
    await flush();
    if ((await pendingCount()) > 0) {
      info = t('ecole.attente_reseau');
      return;
    }
    const next = { ...codes };
    delete next[p.id];
    codes = next;
    await kvSet('schoolCodes', codes);
    info = t('ecole.efface', { nom: p.pseudonym });
  }
</script>

<svelte:head><title>{t('app.nom')} — {t('ecole.titre')}</title></svelte:head>

<h1>{t('ecole.titre')}</h1>

{#if !connected}
  <p class="card">
    {t('ecole.connexion_requise')} <a href={resolve('/connexion')}>{t('entete.connexion')}</a>
  </p>
{:else if !settings?.ecole}
  <section class="card">
    <p>{t('ecole.intro', { minutes: settings?.idleMinutes ?? 10 })}</p>
    <button type="button" class="primary" onclick={() => enable(true)} data-testid="activer-ecole"
      >{t('ecole.activer')}</button
    >
  </section>
{:else}
  {#if !chosen}
    <p class="muted">{t('ecole.touche_image')}</p>
    <div class="grid" data-testid="grille">
      {#each profiles as p (p.id)}
        <button
          type="button"
          class="kid"
          onclick={() => pick(p)}
          data-profile={p.id}
          disabled={!codes[p.id]}
        >
          <Sym id={p.avatar ?? 'etoile'} size={56} />
          <span>{p.pseudonym}</span>
          {#if !codes[p.id]}<small class="muted">{t('ecole.code_a_definir')}</small>{/if}
        </button>
      {/each}
    </div>
  {:else}
    <section class="card code">
      <h2>{chosen.pseudonym}</h2>
      <p>{t('ecole.mon_code')}</p>
      <div class="dots" aria-live="polite">
        {#each [0, 1, 2, 3] as k (k)}<span class:on={entry.length > k}></span>{/each}
      </div>
      <div class="keys">
        {#each SYMBOLS as s (s.id)}
          <button
            type="button"
            aria-label={t(`symbole.${s.id}`)}
            data-sym={s.id}
            onclick={() => press(s.id)}><Sym id={s.id} size={44} /></button
          >
        {/each}
      </div>
      {#if error}<p class="retry" role="alert">{error}</p>{/if}
      <button type="button" onclick={() => (chosen = null)}>{t('commun.retour')}</button>
    </section>
  {/if}

  <details
    class="card teacher"
    ontoggle={(e) => {
      if (!e.currentTarget.open) unlocked = false;
    }}
  >
    <summary>{t('ecole.reglages')}</summary>
    {#if !unlocked}
      {#if me?.account.hasPin}
        <form class="pin" onsubmit={unlock} data-testid="ecole-pin">
          <label for="apin">{t('ecole.code_adulte')}</label>
          <input
            id="apin"
            inputmode="numeric"
            maxlength="4"
            autocomplete="off"
            bind:value={adultPin}
          />
          {#if pinError}<p class="retry" role="alert">{pinError}</p>{/if}
          <button type="submit" class="primary">{t('commun.valider')}</button>
        </form>
      {:else}
        <p data-testid="ecole-sans-code">
          {t('ecole.definir_code_adulte')} <a href={resolve('/compte')}>{t('entete.compte')}</a>
        </p>
      {/if}
    {:else}
      {#if info}<p role="status">{info}</p>{/if}
      <h3>{t('ecole.codes')}</h3>
      {#each profiles as p (p.id)}
        <div class="row">
          <span>{p.pseudonym}</span>
          <button type="button" onclick={() => ((setup = p), (setupCode = []))} data-setup={p.id}
            >{t('ecole.definir')}</button
          >
          <button type="button" onclick={() => forget(p)}>{t('ecole.effacer')}</button>
        </div>
      {/each}
      {#if setup}
        <div class="setup">
          <p>{t('ecole.code_de', { nom: setup.pseudonym, n: setupCode.length })}</p>
          <div class="keys">
            {#each SYMBOLS as s (s.id)}
              <button
                type="button"
                aria-label={t(`symbole.${s.id}`)}
                data-setsym={s.id}
                onclick={() => setupCode.length < 4 && (setupCode = [...setupCode, s.id])}
                ><Sym id={s.id} size={36} /></button
              >
            {/each}
          </div>
          <button
            type="button"
            class="primary"
            disabled={setupCode.length !== 4}
            onclick={saveCode}
            data-testid="enregistrer-code">{t('commun.enregistrer')}</button
          >
        </div>
      {/if}
      <h3>{t('ecole.retour_auto')}</h3>
      <div class="row">
        {#each [1, 5, 10, 20] as m (m)}
          <button
            type="button"
            class:primary={settings?.idleMinutes === m}
            onclick={() => setIdle(m)}>{t('ecole.minutes', { n: m })}</button
          >
        {/each}
      </div>
      <p><button type="button" onclick={() => enable(false)}>{t('ecole.quitter')}</button></p>
    {/if}
  </details>
{/if}

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 12px;
  }
  .kid {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 14px;
    min-height: 120px;
  }
  .code {
    text-align: center;
  }
  .dots {
    display: flex;
    gap: 10px;
    justify-content: center;
    margin: 8px 0;
  }
  .dots span {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: 2px solid var(--teal);
  }
  .dots span.on {
    background: var(--teal);
  }
  .keys {
    display: grid;
    grid-template-columns: repeat(3, 72px);
    gap: 10px;
    justify-content: center;
    margin: 10px 0;
  }
  .keys button {
    min-height: 64px;
  }
  .retry {
    color: var(--soon-ink);
    font-weight: 700;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    margin: 6px 0;
  }
  .teacher summary {
    cursor: pointer;
    font-weight: 700;
  }
</style>
