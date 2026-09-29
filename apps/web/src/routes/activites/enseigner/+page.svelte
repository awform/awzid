<script lang="ts">
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import { demoProfileFor } from '$lib/attempts';
  import { localIso } from '$lib/hifz';
  import { t } from '$lib/i18n';
  import { call, type ProfileInfo } from '$lib/session';

  /**
   * « J'enseigne la lettre à mon parent » (lot 15, inspiré de l'étude comparative : apprendre en enseignant).
   * L'enfant choisit une lettre qu'il sait déjà écrire seul, la montre, la nomme, la trace en l'air et dit un
   * mot qui la contient ; le parent coche ce qu'il a vu. AUCUNE donnée supplémentaire : rien n'est envoyé ni
   * enregistré, c'est un moment entre eux.
   */
  const ETAPES = ['montre', 'nomme', 'trace', 'mot'] as const;
  let profile = $state<ProfileInfo | null>(null);
  let lettres = $state<string[]>([]);
  let loaded = $state(false);
  let lettre = $state<string | null>(null);
  let coches = $state<Record<string, boolean>>({});
  let fini = $state(false);

  onMount(async () => {
    profile = await demoProfileFor('');
    if (profile) {
      const r = await call<{ jalons: { lettres: string[] } }>(
        'GET',
        `/today/${profile.id}?today=${localIso()}`,
      );
      lettres = r.data?.jalons.lettres ?? [];
    }
    loaded = true;
  });
  const toutes = $derived(ETAPES.every((e) => coches[e]));
  function choisir(l: string) {
    lettre = l;
    coches = {};
    fini = false;
  }
</script>

<svelte:head><title>{t('app.nom')} — {t('ensl.titre')}</title></svelte:head>

<h1>{t('ensl.titre')}</h1>
<p>{t('ensl.intro')}</p>

{#if loaded && !profile}
  <p class="card">
    {t('auj.sans_profil')} <a href={resolve('/profils')}>{t('auj.choisir_profil')}</a>
  </p>
{:else if loaded && !lettres.length}
  <p class="card">
    {t('ensl.aucune_lettre')} <a href={resolve('/ecriture')}>{t('onglets.ecriture')}</a>
  </p>
{:else if loaded}
  <section class="card">
    <h2>{t('ensl.choisir')}</h2>
    <div class="lettres">
      {#each lettres as l (l)}
        <button
          type="button"
          class="lettre"
          class:primary={lettre === l}
          dir="rtl"
          lang="ar"
          onclick={() => choisir(l)}
          data-lettre={l}>{l}</button
        >
      {/each}
    </div>
  </section>
  {#if lettre}
    <section class="card" data-testid="enseigner">
      <p class="grande" dir="rtl" lang="ar">{lettre}</p>
      <h2>{t('ensl.enfant_titre')}</h2>
      <ol>
        {#each ETAPES as e (e)}<li>{t(`ensl.enfant_${e}`)}</li>{/each}
      </ol>
      <h2>{t('ensl.parent_titre')}</h2>
      <fieldset>
        <legend class="sr">{t('ensl.parent_titre')}</legend>
        {#each ETAPES as e (e)}
          <label class="check"
            ><input type="checkbox" bind:checked={coches[e]} data-coche={e} />
            {t(`ensl.parent_${e}`)}</label
          >
        {/each}
      </fieldset>
      <button
        type="button"
        class="primary"
        disabled={!toutes}
        onclick={() => (fini = true)}
        data-testid="enseigner-fini">{t('ensl.terminer')}</button
      >
      {#if fini}<p class="okmsg" role="status" data-testid="enseigner-bravo">
          {t('ensl.bravo', { nom: profile?.pseudonym ?? '' })}
        </p>{/if}
      <p class="muted small">{t('ensl.rien_garde')}</p>
    </section>
  {/if}
{/if}

<style>
  .lettres {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .lettre {
    font-family: var(--font-ar);
    font-size: 1.8rem;
    min-width: 56px;
    min-height: 56px;
  }
  .grande {
    font-family: var(--font-ar);
    font-size: 5rem;
    text-align: center;
    margin: 0;
    color: var(--ink);
  }
  fieldset {
    border: 2px solid var(--line);
    border-radius: var(--radius-md);
    display: grid;
    gap: 8px;
  }
  .check {
    display: flex;
    gap: 8px;
    align-items: center;
    min-height: 44px;
  }
  .okmsg {
    color: var(--ok-ink);
    font-weight: 700;
  }
  .small {
    font-size: 0.9rem;
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
</style>
