<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import { formText, LETTERS } from '$lib/trace/letters';
  import TraceLettre from './TraceLettre.svelte';
  import {
    FORMES,
    aConfirmer,
    formesDisponibles,
    lettresDuFichier,
    type TraitsJson,
  } from './trace-anim';
  import { tt } from './trace-textes';

  /**
   * « Voir le tracé » (31/10/2026) — la page : le tracé de la lettre et de la forme choisies, et la planche de toutes les
   * lettres avec leurs formes. Les tracés viennent de `/video/traits.json` (statique, gardé hors ligne comme les
   * tracés des vidéos) ; une forme absente du fichier n'est pas inventée : elle est simplement indisponible.
   * Chargé à la demande (groupe « vidéos vivantes »), jamais dans la coquille.
   */
  let { lettre = null, forme = null }: { lettre?: string | null; forme?: string | null } = $props();

  let traits = $state<TraitsJson | null>(null);
  let echec = $state(false);
  let choix = $state<{ l: string; f: number } | null>(null);
  let haut = $state<HTMLElement | null>(null);

  const lettres = $derived(
    traits
      ? lettresDuFichier(
          traits,
          LETTERS.map((x) => x.l),
        )
      : [],
  );
  const courant = $derived(choix && traits ? (traits[choix.l]?.[choix.f] ?? null) : null);

  onMount(() => {
    void fetch('/video/traits.json')
      .then((r) => (r.ok ? (r.json() as Promise<TraitsJson>) : Promise.reject(new Error('traits'))))
      .then((j) => {
        traits = j;
        if (lettre && Array.isArray(j[lettre])) {
          const dispo = formesDisponibles(j, lettre);
          const i = FORMES.indexOf(forme as (typeof FORMES)[number]);
          choix = { l: lettre, f: i >= 0 && dispo.includes(i) ? i : (dispo[0] ?? 0) };
        }
      })
      .catch(() => (echec = true));
  });

  function choisir(l: string, f?: number) {
    if (!traits) return;
    const dispo = formesDisponibles(traits, l);
    choix = { l, f: f !== undefined && dispo.includes(f) ? f : (dispo[0] ?? 0) };
    haut?.scrollIntoView({ block: 'start' });
  }
</script>

{#if echec}
  <p class="card" role="alert"><Bidi text={tt('indisponible')} /></p>
{:else if !traits}
  <p class="muted" aria-busy="true"><Bidi text={tt('chargement')} /></p>
{:else}
  <section class="card" bind:this={haut}>
    {#if choix}
      <div class="row" role="group" aria-label={tt('formes')}>
        {#each FORMES as nom, i (nom)}
          <button
            type="button"
            class:primary={choix.f === i}
            aria-pressed={choix.f === i}
            disabled={!traits[choix.l]?.[i]}
            onclick={() => choix && choisir(choix.l, i)}
            data-forme={nom}><Bidi text={tt(nom)} /></button
          >
        {/each}
      </div>
      {#key `${choix.l}:${choix.f}`}
        {#if courant}
          <TraceLettre l={choix.l} f={choix.f} forme={courant} />
        {:else}
          <p class="muted"><Bidi text={tt('absente')} /></p>
        {/if}
      {/key}
    {:else}
      <p class="muted"><Bidi text={tt('choisis')} /></p>
    {/if}
  </section>

  <section class="card">
    <h2><Bidi text={tt('planche')} /></h2>
    <ul class="planche" lang="ar" dir="rtl" data-testid="planche">
      {#each lettres as l (l)}
        <li>
          <button
            type="button"
            class="tuile"
            class:sel={choix?.l === l}
            aria-pressed={choix?.l === l}
            onclick={() => choisir(l)}
            data-lettre={l}
          >
            <span class="grande"><Bidi text={l} base="ar" /></span>
            <span class="formes">
              {#each FORMES as nom, i (nom)}
                {#if traits[l]?.[i]}
                  <span class="mini"
                    ><Bidi
                      text={formText(l, nom)}
                      base="ar"
                    />{#if aConfirmer(traits[l]![i]!.s)}<sup aria-hidden="true">*</sup><span
                        class="sr"
                        lang="fr"><Bidi text={tt('confirmer_marque')} /></span
                      >{/if}</span
                  >
                {/if}
              {/each}
            </span>
          </button>
        </li>
      {/each}
    </ul>
    <p class="muted small">
      <span aria-hidden="true">*</span>
      <Bidi text={tt('confirmer_marque')} />
    </p>
  </section>
{/if}

<style>
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 0 0 8px;
    justify-content: center;
  }
  .row button {
    min-height: 44px;
  }
  .planche {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
    gap: 6px;
  }
  .tuile {
    width: 100%;
    min-height: 88px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    font-family: var(--font-ar);
  }
  .tuile.sel {
    border-color: var(--teal);
    background: var(--ok-bg);
  }
  .grande {
    font-size: 1.9rem;
    line-height: 1.3;
  }
  .formes {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    justify-content: center;
    font-size: 1.15rem;
  }
  .small {
    font-size: 0.85rem;
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
