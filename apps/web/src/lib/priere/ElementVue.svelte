<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n';
  import { refsAyyub, type Voix } from './audio';
  import { chargerSection, type Element } from './donnees';
  import ElementVue from './ElementVue.svelte';
  import Parole from './Parole.svelte';
  import Pastilles from './Pastilles.svelte';
  import Picto from './Picto.svelte';
  import Texte from './Texte.svelte';

  /**
   * Un élément de contenu du référent, affiché selon son type : parole, matn, texte, règle, preuve (verset ou hadith),
   * liste, tableau, groupe, renvoi. Tout le texte vient des données ; l'arabe est toujours sur sa propre ligne.
   */
  let { e, voix }: { e: Element; voix: Voix } = $props();

  /** noms des sourates d'un renvoi (liste de la section 8) */
  let noms = $state<Record<number, string>>({});
  onMount(() => {
    if (e.type !== 'renvoi') return;
    void chargerSection('S8').then((s) => {
      const liste = s?.elements?.find((x) => x.id === 'S8.liste');
      noms = Object.fromEntries((liste?.lignes ?? []).map((l) => [Number(l[0]), l[1] ?? '']));
    });
  });
  const sourates = $derived(
    e.type === 'renvoi' ? [...new Set(refsAyyub(e.audio).map((r) => r.s))] : [],
  );
  const asParole = $derived<Element>({
    ...e,
    type: 'parole',
    sens: e.sens ?? e.ar_fr ?? e.fr,
    titre: e.titre ?? e.reference,
  });
</script>

{#if e.type === 'parole'}
  <Parole p={e} {voix} />
{:else if e.type === 'matn' || (e.type === 'texte' && e.ar)}
  <Parole p={asParole} {voix} />
  {#if e.type === 'texte' && e.fr}<p class="el corps"><Texte txt={e.fr} /></p>{/if}
  {#if e.traduction}<p class="note petit"><Picto nom="info" /><span>{e.traduction}</span></p>{/if}
{:else if e.type === 'texte'}
  <div class="el" data-id={e.id}>
    {#if e.titre}<h3>{e.titre}</h3>{/if}
    <p class="corps"><Texte txt={e.fr ?? ''} /></p>
  </div>
{:else if e.type === 'regle'}
  <section class="el regle" data-id={e.id}>
    {#if e.titre}<h3>{e.titre}</h3>{/if}
    <Pastilles niveau={e.niveau} />
    <p class="corps"><Texte txt={e.fr ?? ''} /></p>
    {#each e.textes ?? [] as x, i (i)}
      {#if x.audio}
        <Parole
          p={{ id: `${e.id}#textes${i}`, type: 'parole', ar: x.ar, sens: x.fr, audio: x.audio }}
          {voix}
        />
      {:else}
        <span class="ar" lang="ar" dir="rtl">{x.ar}</span>
        {#if x.fr}<p class="sens"><Texte txt={x.fr} /></p>{/if}
      {/if}
    {/each}
    {#if e.note}<p class="note petit">
        <Picto nom="info" /><span><Texte txt={e.note} /></span>
      </p>{/if}
    {#if e.autres_ecoles}
      <details class="plus">
        <summary>{t('priere.autres_ecoles')}<Picto nom="chevron-b" /></summary>
        <p><Texte txt={e.autres_ecoles} /></p>
      </details>
    {/if}
    {#if e.sources?.length}
      <details class="plus">
        <summary>{t('priere.sources')}<Picto nom="chevron-b" /></summary>
        <ul class="sources">
          {#each e.sources as s, i (i)}<li>{s}</li>{/each}
        </ul>
      </details>
    {/if}
  </section>
{:else if e.type === 'preuve'}
  {#if e.audio && e.audio !== 'aucun'}
    <div class="preuve"><Parole p={asParole} {voix} /></div>
  {:else}
    <section class="el parole preuve" data-id={e.id} data-nature={e.nature}>
      {#if e.ar}<span class="ar" lang="ar" dir="rtl">{e.ar}</span>{/if}
      {#if e.fr}<p class="sens"><Texte txt={e.fr} /></p>{/if}
      {#if e.reference}<p class="ref">{e.reference}</p>{/if}
      {#if e.authenticite}<p class="ref">{e.authenticite}</p>{/if}
      {#if e.explication}<p class="fais"><Texte txt={e.explication} /></p>{/if}
    </section>
  {/if}
{:else if e.type === 'liste'}
  <section class="el" data-id={e.id}>
    {#if e.titre}<h3>{e.titre}</h3>{/if}
    <ul>
      {#each e.items ?? [] as x, i (i)}<li><Texte txt={x} /></li>{/each}
    </ul>
  </section>
{:else if e.type === 'tableau'}
  <section class="el" data-id={e.id}>
    {#if e.titre}<h3>{e.titre}</h3>{/if}
    <ul class="rangs">
      {#each e.lignes ?? [] as l, i (i)}
        <li>
          <dl>
            {#each l as c, j (j)}
              {#if c}<dt>{e.colonnes?.[j]}</dt>
                <dd><Texte txt={c} /></dd>{/if}
            {/each}
          </dl>
        </li>
      {/each}
    </ul>
    {#if e.note}<p class="note petit">
        <Picto nom="info" /><span><Texte txt={e.note} /></span>
      </p>{/if}
  </section>
{:else if e.type === 'groupe'}
  <section data-id={e.id}>
    {#if e.titre}<h2 class="groupe-titre">{e.titre}</h2>{/if}
    {#if e.intro}<p class="corps"><Texte txt={e.intro} /></p>{/if}
    {#each e.elements ?? [] as x (x.id)}<ElementVue e={x} {voix} />{/each}
  </section>
{:else if e.type === 'renvoi'}
  <section class="el" data-id={e.id}>
    {#if e.titre}<h3>{e.titre}</h3>{/if}
    <Pastilles niveau={e.niveau} />
    <p class="corps"><Texte txt={e.fr ?? ''} /></p>
    <!-- eslint-disable svelte/no-navigation-without-resolve -- vues de la même page (?e=sourate) -->
    <div class="puces">
      {#each sourates as s (s)}
        <a class="puce" href="?e=sourate&s={s}" data-sourate={s}>{noms[s] ?? s}</a>
      {/each}
    </div>
    <!-- eslint-enable svelte/no-navigation-without-resolve -->
  </section>
{/if}
