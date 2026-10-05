<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import { demoProfileFor } from '$lib/attempts';
  import EpreuvesCarte from '$lib/EpreuvesCarte.svelte';
  import { fmtDate, t } from '$lib/i18n';
  import { levelLabel } from '$lib/levels';
  import { accueil, type Accueil } from '$lib/parcours/parcours';
  import { call, cachedMe, type ProfileInfo } from '$lib/session';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Loading from '$lib/ui/Loading.svelte';

  /**
   * A27 — « Ma classe » : reprend l'existant (devoirs de l'enseignant, épreuves, cercle de Coran, messages de
   * la famille) pour l'élève inscrit dans une classe. Jamais de « retard » affiché à l'élève.
   */
  interface Devoir {
    id: string;
    classe: string;
    kind: string;
    target: string;
    label: string;
    dueDay: string;
    note: string | null;
    done: boolean;
  }
  let profile = $state<ProfileInfo | null>(null);
  let a = $state<Accueil | null>(null);
  let devoirs = $state<Devoir[]>([]);
  let family = $state(false);
  let loaded = $state(false);
  onMount(async () => {
    profile = await demoProfileFor('');
    if (profile) {
      const r = await accueil(profile.id);
      if (r.ok) a = r.data;
      const d = await call<{ devoirs: Devoir[] }>('GET', `/profiles/${profile.id}/devoirs`);
      devoirs = d.ok ? (d.data?.devoirs ?? []) : [];
      const me = await cachedMe();
      family =
        me?.account.kind === 'parent' ||
        (me?.account.kind === 'adulte' && profile.kind === 'adulte');
    }
    loaded = true;
  });
  const classes = $derived((a?.classes ?? []).filter((c) => c.kind !== 'cercle'));
  const cercles = $derived(a?.coran.cercles ?? []);
</script>

<svelte:head><title>{t('app.nom')} — {t('parc.ma_classe')}</title></svelte:head>

<h1>{t('parc.ma_classe')}</h1>
{#if !loaded}
  <Loading lines={3} />
{:else if !profile || (!classes.length && !cercles.length)}
  <EmptyState icon="classe" title={t('parc.ma_classe')} text={t('parc.sans_classe')} />
{:else}
  <ul class="tiles" data-testid="mes-classes">
    {#each classes as c (c.id)}
      <li class="tile">
        <span class="tile-ic"><Icon name="classe" /></span>
        <strong><Bidi text={c.name} /></strong>
        {#if c.levelCode}<small><Bidi text={levelLabel(c.levelCode)} /></small>{/if}
      </li>
    {/each}
    {#each cercles as c (c.id)}
      <li class="tile">
        <span class="tile-ic"><Icon name="mushaf" /></span>
        <strong><Bidi text={c.name} /></strong>
        <small
          ><Bidi
            text={c.portion ? t('parc.cercle_portion', { portion: c.portion }) : t('parc.cercle')}
          /></small
        >
      </li>
    {/each}
  </ul>

  <section class="card" data-testid="devoirs-classe">
    <h2>{t('auj.devoirs')}</h2>
    <ul class="devoirs">
      {#each devoirs as d (d.id)}
        <li data-fait={d.done}>
          {#if d.kind === 'lecon'}<a href={resolve('/lecons/[id]', { id: d.target })}
              ><Bidi text={t('auj.devoir_lecon', { id: d.target })} /></a
            >{:else if d.kind === 'lecture'}<a
              href={resolve('/lectures/[code]', { code: d.target })}
              ><Bidi text={t('auj.devoir_lecture', { code: d.target })} /></a
            >{:else}<a href={resolve('/hifz')}
              ><Bidi text={t('auj.devoir_hifz', { passage: d.label })} /></a
            >{/if}
          <span class="muted small"
            >· <Bidi
              text={t('auj.pour_le', { date: fmtDate(d.dueDay, { dateStyle: 'medium' }) })}
            /> ·
            <Bidi text={d.classe} />{#if d.done}
              · {t('parc.devoir_fait')}{/if}</span
          >
          {#if d.note}<p class="small"><Bidi text={d.note} /></p>{/if}
        </li>
      {:else}
        <li class="muted">{t('parc.aucun_devoir')}</li>
      {/each}
    </ul>
  </section>

  <EpreuvesCarte profileId={profile.id} />

  {#if cercles.length}
    <p>
      <a class="button" href={resolve('/hifz')}
        ><Icon name="mushaf" size={18} />{t('parc.ouvrir_hifz')}</a
      >
    </p>
  {/if}
  {#if family}
    <p>
      <a class="button" href={resolve('/messages')}
        ><Icon name="message" size={18} />{t('parc.messages_famille')}</a
      >
    </p>
  {/if}
{/if}

<style>
  .devoirs {
    display: grid;
    gap: 8px;
    padding-inline-start: 1.2em;
  }
  .small {
    font-size: 0.9rem;
  }
</style>
