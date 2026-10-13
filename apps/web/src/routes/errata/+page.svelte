<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import AvisBouton from '$lib/avis/AvisBouton.svelte';
  import { fmtDate, t } from '$lib/i18n';
  import { call } from '$lib/session';

  /**
   * Errata (lot F1, revue M1 ; CDC §5.8 ; bêta fermée 13/10/2026) : corrections faites à la suite d'un
   * signalement, validées par le référent. PUBLIC, sans compte ; chaque correction est DATÉE et porte sa source
   * (référence) et l'édition qui la porte. Ni l'auteur du signalement ni son commentaire ne sont montrés.
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
<p class="muted" data-testid="errata-comment">{t('errata.comment')}</p>
<ul class="list" data-testid="errata">
  {#each list ?? [] as e (e.id)}
    <li class="card" data-testid="erratum">
      <p class="small">
        {#if e.date}<time datetime={e.date}>{fmtDate(e.date, { dateStyle: 'medium' })}</time> ·{/if}
        <Bidi text={t(`contenu.k_${e.targetKind}`)} />
        {#if e.unitId}· <a href={resolve('/lecons/[id]', { id: e.unitId })}
            ><Bidi text={e.unitId} /></a
          >{/if}
      </p>
      <p><Bidi text={e.erratum ?? ''} /></p>
      <p class="small muted">
        {#if e.ref}{t('errata.source')} : <Bidi text={e.ref} />{/if}
        {#if e.ref && e.fixedInEdition}·{/if}
        {#if e.fixedInEdition}{t('errata.edition')} : <Bidi text={e.fixedInEdition} />{/if}
      </p>
    </li>
  {:else}
    {#if list}<li class="muted">{t('errata.vide')}</li>{/if}
  {/each}
</ul>

<section class="card">
  <AvisBouton mode="probleme" categorie="religieux" libelle="aide.erreur_religieuse" />
</section>

<style>
  .list {
    list-style: none;
    padding: 0;
    display: grid;
    gap: 8px;
  }
  .small {
    font-size: 0.9rem;
  }
</style>
