<script lang="ts">
  import { resolve } from '$app/paths';
  import Ar from '$lib/Ar.svelte';
  import { isQuranReadingLevel } from '$lib/api';
  import { t } from '$lib/i18n';
  import Icon from '$lib/ui/Icon.svelte';

  /** Lot 27 — espace Coran : Lire, Écouter, Mémoriser, Mes récitateurs ; carnet de hifẓ. */
  const SPACES = [
    { href: '/coran/lecteur', icon: 'lire', id: 'lire', testid: 'ouvrir-lecteur' },
    { href: '/coran/ecouter', icon: 'casque', id: 'ecouter', testid: 'ouvrir-ecouter' },
    { href: '/coran/memoriser', icon: 'repeter', id: 'memoriser', testid: 'ouvrir-memoriser' },
    {
      href: '/coran/recitateurs',
      icon: 'personne',
      id: 'recitateurs',
      testid: 'ouvrir-recitateurs',
    },
  ] as const;
  let { data } = $props();
  /** lot 28 : livrets « Lecture du Coran » publiés (qc1 à qc3) */
  const livrets = $derived(data.levels.filter((l) => isQuranReadingLevel(l.code)));
</script>

<svelte:head><title>{t('app.nom')} — {t('onglets.coran')}</title></svelte:head>

<h1>{t('onglets.coran')}</h1>
<p class="muted">{t('coran.intro')}</p>

<ul class="tiles spaces">
  {#each SPACES as s (s.id)}
    <li>
      <a class="tile" href={resolve(s.href)} data-testid={s.testid}>
        <span class="tile-ic"><Icon name={s.icon} size={26} /></span>
        <strong>{t(`ca.onglet_${s.id}`)}</strong>
        <small>{t(`ca.hub_${s.id}`)}</small>
      </a>
    </li>
  {/each}
</ul>

<section class="card hifz">
  <h2>{t('coran.hifz_titre')}</h2>
  <p>{t('coran.hifz_texte')}</p>
  <p>
    <a class="button primary" href={resolve('/hifz')} data-testid="ouvrir-hifz"
      >{t('coran.ouvrir_carnet')}</a
    >
  </p>
</section>

<section class="card">
  <h2>{t('ca.adab_titre')}</h2>
  <ul class="adab">
    <li>{t('ca.adab_1')}</li>
    <li>{t('ca.adab_2')}</li>
    <li>{t('ca.adab_3')}</li>
  </ul>
  <p class="muted small">{t('coran.lecteur_licence')}</p>
</section>

<section class="card" data-testid="lecture-coran">
  <h2>{t('coran.qaida_titre')}</h2>
  <p>{t('coran.qaida_texte')}</p>
  {#if data.offline}<p class="muted">{t('arabe.hors_ligne')}</p>{/if}
  <ul class="livrets">
    {#each livrets as l (l.code)}
      <li>
        <a
          href={resolve('/niveaux/[code]', { code: l.code })}
          data-testid="niveau-qc"
          data-level={l.code}
        >
          <strong>{l.codeFr ?? l.code}</strong> — {l.titleFr}
          {#if l.titreAr}<Ar text={l.titreAr} />{/if}
          <small>{t('arabe.unites', { n: l.units })}</small>
        </a>
      </li>
    {:else}
      <li class="muted">{t('sciences.bientot')}</li>
    {/each}
  </ul>
</section>

<style>
  .spaces {
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 200px), 1fr));
  }
  .hifz {
    border-inline-start: 4px solid var(--accent);
  }
  .adab {
    margin: 0;
    padding-inline-start: 1.2em;
  }
  .small {
    font-size: 0.9rem;
  }
  .livrets {
    list-style: none;
    padding: 0;
  }
  .livrets a {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 8px 12px;
    padding: 12px 14px;
    margin: 8px 0;
    border: 2px solid var(--line);
    border-radius: 14px;
    text-decoration: none;
    color: var(--ink);
  }
  .livrets small {
    color: var(--ink2);
  }
</style>
