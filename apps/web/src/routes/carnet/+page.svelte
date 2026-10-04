<script lang="ts">
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import Ar from '$lib/Ar.svelte';
  import { t } from '$lib/i18n';
  import { fetchMe, type Me } from '$lib/session';
  import { loadCarnetPerso, setCarnetPerso, type CarnetPersoLigne } from '$lib/pratique';

  /**
   * Carnet de pratique personnel (livres ra*, décision du 04/10/2026) : la ligne « carnet » de chaque leçon,
   * cochée par l'adulte quand c'est fait. Sans signature, jamais notée, sans compteur.
   */
  let me = $state<Me | null>(null);
  let profileId = $state('');
  let lignes = $state<CarnetPersoLigne[]>([]);
  let error = $state('');

  const adultes = $derived((me?.profiles ?? []).filter((p) => p.kind === 'adulte'));
  async function load() {
    const r = await loadCarnetPerso(profileId);
    lignes = r.ok && r.data ? r.data.lignes : [];
  }
  onMount(async () => {
    me = await fetchMe();
    profileId = adultes[0]?.id ?? '';
    if (profileId) await load();
  });
  async function toggle(l: CarnetPersoLigne, v: boolean) {
    error = '';
    const r = await setCarnetPerso(profileId, l.unitId, v);
    if (r.ok) lignes = lignes.map((x) => (x.unitId === l.unitId ? { ...x, coche: v } : x));
    else error = t(`erreur.${r.code ?? 'reseau'}`);
  }
  const niveaux = $derived([...new Set(lignes.map((l) => l.niveau))]);
</script>

<svelte:head><title>{t('app.nom')} — {t('carnetp.titre')}</title></svelte:head>

<h1>{t('carnetp.titre')}</h1>
{#if !me}
  <p>
    {t('profils.connexion_requise')} <a href={resolve('/connexion')}>{t('entete.connexion')}</a>
  </p>
{:else if !adultes.length}
  <p class="card">{t('carnetp.adulte')}</p>
{:else}
  <p class="muted">{t('carnetp.intro')}</p>
  {#if error}<p class="card bad" role="alert">{error}</p>{/if}
  {#each niveaux as n (n)}
    <section class="card" data-niveau={n}>
      <h2>{n.toUpperCase()}</h2>
      <ul class="list">
        {#each lignes.filter((l) => l.niveau === n) as l (l.unitId)}
          <li data-carnet-perso={l.unitId}>
            <label class="check"
              ><input
                type="checkbox"
                checked={l.coche}
                onchange={(e) => toggle(l, (e.currentTarget as HTMLInputElement).checked)}
              />
              <a href={resolve('/lecons/[id]', { id: l.unitId })}>{l.unitId}</a> —
              {#if l.ar}<Ar text={l.ar} /> —
              {/if}{l.fr}</label
            >
          </li>
        {/each}
      </ul>
    </section>
  {:else}
    <p class="card">{t('carnetp.vide')}</p>
  {/each}
{/if}
