<script lang="ts">
  import Ar from '$lib/Ar.svelte';
  import { t } from '$lib/i18n';

  /**
   * Lettres de la leçon (QUA-3 : repris du lecteur de leçon sans changement de comportement) : « je découvre »
   * (nom et points de chaque lettre, couleurs du moteur des livres) et tableau des formes de la lettre.
   */
  interface Lettre {
    l: string;
    nom_ar?: string;
    nom_fr?: string;
    points_ar?: string;
    points_fr?: string;
    formes?: string[];
  }
  let {
    lettres,
    decouvreAr,
    decouvreFr,
  }: { lettres: Lettre[]; decouvreAr?: string; decouvreFr?: string } = $props();
</script>

{#if lettres.some((x) => x.nom_ar)}
  <section class="blk">
    <h2>
      <Ar text="أَكْتَشِفُ" />
      <span>{decouvreFr ?? t('lecon.je_decouvre')}</span>
    </h2>
    {#if decouvreAr}<Ar tag="p" text={decouvreAr} />{/if}
    <div class="letters">
      {#each lettres as x, i (i)}
        <div class="fcard b{i % 4}">
          <span class="pos">{i + 1}</span>
          <span class="big c{i % 4}" lang="ar">{x.l}</span>
          {#if x.nom_ar}<span class="ar c{i % 4}" lang="ar">{x.nom_ar}</span>{/if}
          {#if x.points_ar}<span class="ar dots" lang="ar">{x.points_ar}</span>{/if}
          <span class="fr">{x.nom_fr ?? ''}{x.points_fr ? ` · ${x.points_fr}` : ''}</span>
        </div>
      {/each}
    </div>
  </section>
{/if}

{#if lettres.some((x) => x.formes)}
  <section class="blk">
    <h2 id="titre-formes">
      <Ar text="أَشْكَالُ الْحَرْفِ" /> <span>{t('lecon.formes')}</span>
    </h2>
    <div class="tw">
      <table class="forms" dir="rtl" aria-labelledby="titre-formes">
        <thead
          ><tr
            ><th></th><th
              ><Ar text="مُنْفَصِلٌ" /><br /><span class="fr">{t('lecon.forme_isolee')}</span></th
            ><th
              ><Ar text="فِي الْأَوَّلِ" /><br /><span class="fr">{t('lecon.forme_debut')}</span
              ></th
            ><th
              ><Ar text="فِي الْوَسَطِ" /><br /><span class="fr">{t('lecon.forme_milieu')}</span
              ></th
            ><th><Ar text="فِي الْآخِرِ" /><br /><span class="fr">{t('lecon.forme_fin')}</span></th
            ></tr
          ></thead
        >
        <tbody>
          {#each lettres.filter((x) => x.formes) as x, i (i)}
            <tr>
              <td class="ar c{lettres.indexOf(x) % 4}" lang="ar">{x.l}</td>
              {#each x.formes ?? [] as f, k (k)}<td class="ar c{lettres.indexOf(x) % 4}" lang="ar"
                  >{f}</td
                >{/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>
{/if}

<style>
  h2 {
    font-size: 1.1rem;
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    align-items: baseline;
    border-bottom: 2px solid var(--line);
    padding-bottom: 4px;
    margin: 28px 0 10px;
  }
  .fr {
    color: var(--ink2);
  }
  .letters {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    direction: rtl;
  }
  .fcard {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    background: var(--card);
    border: 3px solid var(--line);
    border-radius: 18px;
    padding: 8px 18px;
    direction: ltr;
    min-width: 130px;
  }
  .b0 {
    border-color: #f7c9ca;
  }
  .b1 {
    border-color: #c9daf7;
  }
  .b2 {
    border-color: #bfe8d5;
  }
  .b3 {
    border-color: #f7e1a8;
  }
  .pos {
    position: absolute;
    top: 4px;
    inset-inline-start: 8px;
    font-size: 0.8rem;
    color: var(--ink2);
  }
  .big {
    font-family: 'Noto Naskh Arabic', serif;
    font-size: calc(var(--ar-size) * 2.4);
    line-height: 1.3;
    text-decoration: none;
  }
  .dots {
    font-size: calc(var(--ar-size) * 0.7);
  }
  .tw {
    overflow-x: auto;
  }
  .forms {
    border-collapse: collapse;
    width: 100%;
  }
  .forms td,
  .forms th {
    border: 1px solid var(--line);
    padding: 4px 8px;
    text-align: center;
  }
  .forms td {
    font-size: calc(var(--ar-size) + 6px);
    text-decoration: none;
  }
</style>
