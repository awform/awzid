<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import { fmtDate, t } from '$lib/i18n';
  import { call } from '$lib/session';

  /**
   * Errata (lot F1, revue M1 ; CDC §5.8) : corrections faites à la suite d'un signalement, validées par le
   * référent. Publics ; ni l'auteur du signalement ni son commentaire ne sont montrés.
   */
  interface Erratum {
    id: string;
    targetKind: string;
    unitId: string | null;
    ref: string | null;
    erratum: string | null;
    fixedInEdition: string | null;
    date: string | null;
  }
  let list = $state<Erratum[] | null>(null);
  onMount(async () => {
    const r = await call<{ errata: Erratum[] }>('GET', '/contenu/errata');
    list = r.ok && r.data ? r.data.errata : [];
  });
</script>

<svelte:head><title>{t('app.nom')} — {t('errata.titre')}</title></svelte:head>

<h1>{t('errata.titre')}</h1>
<p>{t('errata.intro')}</p>
<ul class="list" data-testid="errata">
  {#each list ?? [] as e (e.id)}
    <li class="card">
      <p class="small">
        {#if e.date}{fmtDate(e.date, { dateStyle: 'medium' })} ·{/if}
        <Bidi text={t(`contenu.k_${e.targetKind}`)} />
        {#if e.unitId}· <a href={resolve('/lecons/[id]', { id: e.unitId })}
            ><Bidi text={e.unitId} /></a
          >{/if}
        <Bidi text={[e.ref, e.fixedInEdition].filter(Boolean).join(' · ')} />
      </p>
      <p><Bidi text={e.erratum ?? ''} /></p>
    </li>
  {:else}
    {#if list}<li class="muted">{t('errata.vide')}</li>{/if}
  {/each}
</ul>

<style>
  .list {
    list-style: none;
    padding: 0;
    display: grid;
    gap: 8px;
  }
</style>
