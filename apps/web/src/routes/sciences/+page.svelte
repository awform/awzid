<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { resolve } from '$app/paths';
  import Ar from '$lib/Ar.svelte';
  import { isReligionLevel } from '$lib/api';
  import { t } from '$lib/i18n';

  /**
   * Sciences islamiques : livres de Religion Enfants (re) et Ados/Adultes (ra). Les livres gelés sont
   * publiés ; un livre encore en relecture n'apparaît qu'en « aperçu » (instance de démonstration).
   */
  let { data } = $props();
  const levels = $derived(data.levels.filter((l) => isReligionLevel(l.code)));
  const groups = $derived([
    {
      titre: 'sciences.re_titre',
      texte: 'sciences.re_texte',
      list: levels.filter((l) => l.code.startsWith('re')),
    },
    {
      titre: 'sciences.ra_titre',
      texte: 'sciences.ra_texte',
      list: levels.filter((l) => l.code.startsWith('ra')),
    },
  ]);
</script>

<svelte:head><title>{t('app.nom')} — {t('onglets.sciences')}</title></svelte:head>

<h1>{t('onglets.sciences')}</h1>
<p class="muted"><Bidi text={t('sciences.intro')} /></p>
{#if data.offline}<p class="card">{t('arabe.hors_ligne')}</p>{/if}

{#each groups as g (g.titre)}
  <section class="card">
    <h2><Bidi text={t(g.titre)} /></h2>
    <p class="muted small"><Bidi text={t(g.texte)} /></p>
    <ul class="levels">
      {#each g.list as l (l.code)}
        <li>
          <a
            href={resolve('/niveaux/[code]', { code: l.code })}
            data-testid="niveau-religion"
            data-level={l.code}
          >
            <strong><Bidi text={l.codeFr ?? l.code} /></strong> — <Bidi text={l.titleFr} />
            {#if l.titreAr}<Ar text={l.titreAr} />{/if}
            <small><Bidi text={t('arabe.unites', { n: l.units })} /></small>
            {#if l.apercu}<span class="soon" data-testid="apercu">{t('sciences.apercu')}</span>{/if}
          </a>
        </li>
      {:else}
        <li class="muted">{t('sciences.bientot')}</li>
      {/each}
    </ul>
  </section>
{/each}
<p class="muted">{t('sciences.fidelite')}</p>

<style>
  .levels {
    list-style: none;
    padding: 0;
  }
  .levels a {
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
  small {
    color: var(--ink2);
  }
  .small {
    font-size: 0.9rem;
  }
</style>
