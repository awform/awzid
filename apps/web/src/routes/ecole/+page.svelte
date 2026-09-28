<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import {
    devProfiles,
    flush,
    pendingCount,
    setActiveProfile,
    type DevProfile,
  } from '$lib/attempts';
  import { kvGet, kvSet } from '$lib/idb';
  import { getSettings, saveSettings, type Settings } from '$lib/offline';
  import Sym from '$lib/Sym.svelte';
  import { hashCode, SYMBOLS } from '$lib/symbols';

  /**
   * Mode école (ARCHITECTURE_V2 §3.4) : une tablette, plusieurs élèves. Grille des profils (avatars sans
   * visage), entrée par CODE IMAGE de 4 symboles, retour automatique à la grille après inactivité, aucune
   * donnée sensible visible sans code. Les codes sont gardés sous forme d'empreinte, jamais en clair.
   * Avant les comptes (lot 4), les profils sont les profils FICTIFS de démonstration.
   */
  let settings: Settings | null = $state(null);
  let profiles: DevProfile[] = $state([]);
  let codes: Record<string, string> = $state({});
  let chosen: DevProfile | null = $state(null);
  let entry: string[] = $state([]);
  let error = $state('');
  let setup: DevProfile | null = $state(null);
  let setupCode: string[] = $state([]);
  let info = $state('');

  const AVATARS = ['etoile', 'lune', 'soleil', 'feuille', 'goutte', 'livre'];

  onMount(async () => {
    settings = await getSettings();
    profiles = await devProfiles();
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
      error = 'Ce n’est pas le bon code. Essaie encore.';
      entry = [];
    }
  }

  async function saveCode() {
    if (!setup || setupCode.length !== 4) return;
    codes = { ...codes, [setup.id]: await hashCode(setup.id, setupCode) };
    await kvSet('schoolCodes', codes);
    info = `Code image enregistré pour ${setup.pseudonym}.`;
    setup = null;
    setupCode = [];
  }

  /** Efface de la tablette ce qui concerne l'élève (après envoi de ses réponses en attente). */
  async function forget(p: DevProfile) {
    await flush();
    if ((await pendingCount()) > 0) {
      info = 'Des réponses attendent encore le réseau : on les envoie avant d’effacer.';
      return;
    }
    const next = { ...codes };
    delete next[p.id];
    codes = next;
    await kvSet('schoolCodes', codes);
    info = `Données de ${p.pseudonym} effacées de cette tablette.`;
  }
</script>

<svelte:head><title>AWFORM — Mode école</title></svelte:head>

<h1>Mode école</h1>

{#if !settings?.ecole}
  <section class="card">
    <p>
      Une tablette pour toute la classe : chaque élève touche son avatar et entre son code image.
      Après
      {settings?.idleMinutes ?? 10} minutes sans activité, la tablette revient à la grille.
    </p>
    <button type="button" class="primary" onclick={() => enable(true)} data-testid="activer-ecole"
      >Activer le mode école sur cette tablette</button
    >
  </section>
{:else}
  {#if !chosen}
    <p class="muted">Touche ton image.</p>
    <div class="grid" data-testid="grille">
      {#each profiles as p, i (p.id)}
        <button
          type="button"
          class="kid"
          onclick={() => pick(p)}
          data-profile={p.id}
          disabled={!codes[p.id]}
        >
          <Sym id={AVATARS[i % AVATARS.length] ?? 'etoile'} size={56} />
          <span>{p.pseudonym}</span>
          {#if !codes[p.id]}<small class="muted">code à définir</small>{/if}
        </button>
      {/each}
    </div>
  {:else}
    <section class="card code">
      <h2>{chosen.pseudonym}</h2>
      <p>Mon code image :</p>
      <div class="dots" aria-live="polite">
        {#each [0, 1, 2, 3] as k (k)}<span class:on={entry.length > k}></span>{/each}
      </div>
      <div class="keys">
        {#each SYMBOLS as s (s.id)}
          <button type="button" aria-label={s.label} data-sym={s.id} onclick={() => press(s.id)}
            ><Sym id={s.id} size={44} /></button
          >
        {/each}
      </div>
      {#if error}<p class="retry" role="alert">{error}</p>{/if}
      <button type="button" onclick={() => (chosen = null)}>Retour</button>
    </section>
  {/if}

  <details class="card teacher">
    <summary>Réglages de l'enseignant</summary>
    {#if info}<p role="status">{info}</p>{/if}
    <h3>Codes image</h3>
    {#each profiles as p (p.id)}
      <div class="row">
        <span>{p.pseudonym}</span>
        <button type="button" onclick={() => ((setup = p), (setupCode = []))} data-setup={p.id}
          >Définir le code</button
        >
        <button type="button" onclick={() => forget(p)}>Effacer ses données de la tablette</button>
      </div>
    {/each}
    {#if setup}
      <div class="setup">
        <p>Code de {setup.pseudonym} : {setupCode.length} / 4</p>
        <div class="keys">
          {#each SYMBOLS as s (s.id)}
            <button
              type="button"
              aria-label={s.label}
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
          data-testid="enregistrer-code">Enregistrer</button
        >
      </div>
    {/if}
    <h3>Retour automatique à la grille</h3>
    <div class="row">
      {#each [1, 5, 10, 20] as m (m)}
        <button type="button" class:primary={settings?.idleMinutes === m} onclick={() => setIdle(m)}
          >{m} min</button
        >
      {/each}
    </div>
    <p><button type="button" onclick={() => enable(false)}>Quitter le mode école</button></p>
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
    color: #9a6700;
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
