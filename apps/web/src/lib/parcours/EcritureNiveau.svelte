<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import { t } from '$lib/i18n';
  import type { ProfileInfo } from '$lib/session';
  import Icon from '$lib/ui/Icon.svelte';
  import { tanwinDisplay } from '@awform/content/text';
  import { ecriture, ecritureFaite, numero, type Ecriture } from './parcours';

  /**
   * A27 — onglet Écriture : « Mon cahier » (activités d'écriture des leçons atteintes de SON niveau : tracé,
   * fiche à imprimer, « j'ai fait l'écriture ») et « J'écris le Coran », visible SEULEMENT à partir de la leçon
   * où le livre fait recopier le premier verset dans l'orthographe du Muṣḥaf.
   */
  let { profile }: { profile: ProfileInfo } = $props();
  let w = $state<Ecriture | null>(null);
  let done = $state<string[]>([]);
  onMount(async () => {
    const r = await ecriture(profile.id);
    if (r.ok) w = r.data;
  });
  async function mark(id: string) {
    await ecritureFaite(profile.id, id);
    done = [...done, id];
  }
  const recent = $derived([...(w?.lecons ?? [])].reverse());
  const stepsOf = (ref: string) =>
    [1, 2, 3].filter((s) => w?.coran.faits.includes(`${ref}:${s}`)).length;
</script>

{#if w}
  <section class="card" data-testid="mon-cahier">
    <h2><Icon name="plume" /> {t('parc.mon_cahier')}</h2>
    <p class="muted small">{t('parc.cahier_texte')}</p>
    <ul class="lecons">
      {#each recent as l (l.id)}
        {@const ok = l.faite || done.includes(l.id)}
        <li data-cahier={l.id} data-faite={ok}>
          <div class="l-head">
            <strong><Bidi text={t('unite.lecon', { n: numero(l) })} /></strong>
            <span class="fr"><Bidi text={l.titleFr} /></span>
            {#if ok}<span class="done"
                ><Icon name="coche" size={16} />{t('parc.ecriture_faite')}</span
              >{/if}
          </div>
          <div class="actions">
            <a class="button small" href={resolve('/lecons/[id]', { id: l.id })}
              >{t('parc.ouvrir_cahier')}</a
            >
            <!-- eslint-disable svelte/no-navigation-without-resolve -- chemin résolu, suivi d'un paramètre -->
            <a
              class="button small"
              href={`${resolve('/ecriture/fiche')}?lecon=${l.id}`}
              data-testid="fiche"><Icon name="telecharger" size={16} />{t('parc.fiche')}</a
            >
            <!-- eslint-enable svelte/no-navigation-without-resolve -->
            {#if !ok}<button
                type="button"
                class="small"
                onclick={() => mark(l.id)}
                data-testid="ecriture-faite">{t('parc.j_ai_ecrit')}</button
              >{/if}
          </div>
        </li>
      {:else}
        <li class="muted">{t('parc.cahier_vide')}</li>
      {/each}
    </ul>
    <p>
      <a href={resolve('/ecriture')}>{t('parc.tracer_lettres')}</a>
    </p>
  </section>

  {#if w.coran.visible}
    <section class="card coran" data-testid="ecris-coran">
      <h2><Icon name="mushaf" /> {t('parc.ecris_coran')}</h2>
      <p class="small"><Bidi text={t('parc.rasm_texte')} /></p>
      <ul class="versets">
        {#each w.coran.versets as v (v.ref)}
          <li>
            <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- chemin résolu, suivi d'un paramètre -->
            <a href={`${resolve('/ecriture/coran')}?ref=${v.ref}`} data-verset={v.ref}>
              {#if v.texte}<span class="q quran-text" lang="ar" dir="rtl"
                  >{tanwinDisplay(v.texte)}</span
                >{/if}
              <span class="ref"
                ><Bidi text={t('parc.verset_ref', { ref: v.ref })} /> · <Bidi
                  text={t('parc.etapes_faites', { n: stepsOf(v.ref) })}
                /></span
              >
            </a>
          </li>
        {/each}
      </ul>
    </section>
  {/if}
{/if}

<style>
  .lecons,
  .versets {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 8px;
  }
  .lecons li {
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    padding: 10px 12px;
    display: grid;
    gap: 6px;
  }
  .l-head {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 10px;
    align-items: baseline;
  }
  .done {
    display: inline-flex;
    gap: 4px;
    align-items: center;
    color: var(--ok-ink);
    font-weight: 700;
    font-size: 0.85rem;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .actions .button {
    display: inline-flex;
    gap: 4px;
    align-items: center;
  }
  .coran {
    border-inline-start: 6px solid var(--gold);
  }
  .versets a {
    display: grid;
    gap: 4px;
    padding: 10px 12px;
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    text-decoration: none;
    color: var(--ink);
  }
  .q {
    font-family: var(--font-quran);
    font-size: 1.5rem;
    line-height: 2;
    text-align: right;
  }
  .ref {
    font-size: 0.85rem;
    color: var(--ink2);
  }
  .small {
    font-size: 0.9rem;
  }
  h2 {
    display: flex;
    gap: 8px;
    align-items: center;
  }
</style>
