<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import { t } from '$lib/i18n';
  import { levelLabel } from '$lib/levels';
  import { pistesDeNiveaux } from '$lib/explorer';
  import { CAHIER_NIVEAUX } from '$lib/cahier-pages';
  import { PARLER_NIVEAUX } from '$lib/cahier-parler-niveaux';
  import { cachedMe, fetchMe } from '$lib/session';
  let { data } = $props();

  /**
   * « Tout voir » (administrateur avec second facteur validé) : tous les niveaux et livres de toutes les pistes, sans
   * verrou de progression, de positionnement, d'épreuve ni d'âge, et les autres espaces. Aucun profil n'est utilisé :
   * rien n'est enregistré (ni progression, ni tentative, ni statistique). Seul du CONTENU est montré, jamais une donnée
   * d'utilisateur. Le drapeau `toutVoir` ne fait qu'afficher la page : le contenu gardé reste refusé par le serveur.
   */
  let autorise = $state<boolean | null>(null);
  onMount(async () => {
    const me = (await fetchMe().catch(() => null)) ?? (await cachedMe().catch(() => null));
    autorise = me?.toutVoir === true;
  });
  const pistes = $derived(pistesDeNiveaux(data.levels));
</script>

<svelte:head><title>{t('app.nom')} — {t('tv.titre')}</title></svelte:head>

<h1>{t('tv.titre')}</h1>
{#if autorise === false}
  <p class="card" data-testid="tv-reserve">{t('tv.reserve')}</p>
{:else if autorise}
  <p class="muted">{t('tv.intro')}</p>
  <div data-testid="tv-page">
    <section class="card">
      <h2>{t('tv.autres')}</h2>
      <ul class="liens">
        <li><a href={resolve('/coran')} data-testid="tv-lien-coran">{t('tv.coran')}</a></li>
        <li>
          <a href={resolve('/sciences')} data-testid="tv-lien-sciences">{t('nav.sciences')}</a>
        </li>
        <li>
          <a href={resolve('/madjaliss')} data-testid="tv-lien-madjaliss">{t('tv.madjaliss')}</a>
        </li>
        <li>
          <a href={resolve('/ecriture')} data-testid="tv-lien-ecriture">{t('tv.ecriture')}</a>
        </li>
        <li>
          <a href={resolve('/lectures')} data-testid="tv-lien-lectures">{t('onglets.lectures')}</a>
        </li>
      </ul>
    </section>
    <h2>{t('tv.niveaux')}</h2>
    {#each pistes as p (p.id)}
      <section class="card" data-testid="tv-piste" data-piste={p.id}>
        <h3>
          <Bidi text={p.filiere ? t(`niveau.filiere_${p.filiere}`) : t('tv.autres_pistes')} /> ·
          <Bidi text={t('tv.livres', { n: p.niveaux.length })} />
        </h3>
        <ul class="liens">
          {#each p.niveaux as l (l.code)}
            <li>
              <a
                href={resolve('/niveaux/[code]', { code: l.code })}
                data-testid="tv-niveau"
                data-niveau={l.code}
                ><Bidi text={levelLabel(l.code)} /> · <Bidi text={t('tv.lecons', { n: l.units })} />
                {#if l.apercu}<small class="muted">({t('tv.apercu')})</small>{/if}</a
              >
            </li>
          {/each}
        </ul>
      </section>
    {/each}
    <section class="card" data-testid="tv-cahiers">
      <h3>{t('tv.cahiers')}</h3>
      <ul class="liens">
        {#each CAHIER_NIVEAUX as c (c)}
          <li>
            <a href={resolve('/cahier/[niveau]', { niveau: c })}><Bidi text={levelLabel(c)} /></a>
          </li>
        {/each}
        {#each PARLER_NIVEAUX as c (c)}
          <li>
            <a href={resolve('/cahier-parler/[niveau]', { niveau: c })}
              ><Bidi text={levelLabel(c)} /> · <Bidi text={t('tv.parler')} /></a
            >
          </li>
        {/each}
      </ul>
    </section>
  </div>
{/if}

<style>
  .liens {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 220px), 1fr));
    gap: var(--space-s, 8px);
  }
  .liens a {
    display: block;
    padding: var(--space-s, 8px) var(--space-m, 12px);
    border: 1px solid var(--line);
    border-radius: var(--radius-lg, 12px);
  }
</style>
