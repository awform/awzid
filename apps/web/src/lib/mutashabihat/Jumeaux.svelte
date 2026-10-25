<script lang="ts">
  import { onMount } from 'svelte';
  import { suraName } from '@awform/hifz';
  import Bidi from '$lib/Bidi.svelte';
  import { chargerCarnet, libelle } from '$lib/hifz-outils/donnees';
  import { dansMemorise, type Plage } from '$lib/hifz-outils/outils';
  import { t } from '$lib/i18n';
  import { kvGet, kvSet } from '$lib/idb';
  import Icon from '$lib/ui/Icon.svelte';
  import CarteJumeau from './CarteJumeau.svelte';
  import { cle, jumeauxDe, type Jumeau } from './paires';

  /**
   * « Attention, verset jumeau » (25/10/2026, interrupteur `mutashabihat`) : sous les versets qu'on apprend ou qu'on récite,
   * un pictogramme discret pour chaque verset qui a un jumeau reconnu par la source. La PREMIÈRE fois, une phrase l'explique ;
   * ensuite l'alerte reste discrète. Si l'élève connaît déjà le jumeau (passage mémorisé), l'alerte est mise en avant :
   * c'est là que l'erreur arrive. Un toucher ouvre la carte du jumeau (les deux versets, la différence surlignée).
   */
  let {
    verses,
    basmala = '',
    profileId = null,
  }: {
    verses: ReadonlyArray<{ s: number; a: number; text: string }>;
    basmala?: string;
    profileId?: string | null;
  } = $props();
  const VU = 'mutashabihat.alerte-vue';
  const MAX = 3;
  let plages = $state<Plage[]>([]);
  let vu = $state(true);
  let ouvert = $state<string | null>(null);
  const avec = $derived(
    verses.map((v) => ({ v, l: jumeauxDe(v.s, v.a) })).filter((x) => x.l.length > 0),
  );

  onMount(async () => {
    vu = (await kvGet<boolean>(VU).catch(() => undefined)) === true;
    if (profileId) {
      const c = await chargerCarnet(profileId).catch(() => null);
      plages = c ? c.passages.flatMap((p) => p.ref) : [];
    }
  });
  const connu = (j: Jumeau) =>
    dansMemorise({ s: j.autre.s, from: j.autre.a, to: j.autre.a }, plages);
  function basculer(k: string) {
    ouvert = ouvert === k ? null : k;
    if (!vu) {
      vu = true;
      void kvSet(VU, true).catch(() => {});
    }
  }
  const ref = (j: Jumeau) => libelle({ s: j.autre.s, from: j.autre.a, to: j.autre.a });
</script>

{#each avec as { v, l } (cle(v))}
  {@const k = cle(v)}
  {@const j = l[0]!}
  <div class="jumeau" data-testid="jumeau-alerte" data-verset={k}>
    <button
      type="button"
      class="alerte"
      class:avant={connu(j)}
      aria-expanded={ouvert === k}
      onclick={() => basculer(k)}
      data-testid="jumeau-bouton"
    >
      <Icon name="alerte" size={18} /><Bidi text={t('mt.alerte', { ref: ref(j) })} />
      {#if l.length > 1}<small><Bidi text={t('mt.alerte_plus', { n: l.length - 1 })} /></small>{/if}
    </button>
    {#if !vu}
      <p class="note" role="note" data-testid="jumeau-premiere">
        <Bidi text={t('mt.premiere', { sourate: suraName(j.autre.s) })} />
      </p>
    {/if}
    {#if connu(j)}
      <p class="note" role="note" data-testid="jumeau-connu"><Bidi text={t('mt.connu')} /></p>
    {/if}
    {#if ouvert === k}
      <div class="cartes">
        {#each l.slice(0, MAX) as jj (jj.id)}
          <CarteJumeau moi={v} j={jj} {basmala} />
        {/each}
      </div>
    {/if}
  </div>
{/each}

<style>
  .jumeau {
    display: grid;
    gap: 6px;
    margin: 6px 0;
  }
  .alerte {
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    justify-self: start;
    min-height: 44px;
    padding: 0 12px;
    color: var(--or-ink);
    background: var(--or-soft);
    border: 1px solid var(--or-line);
    border-radius: var(--radius-pill);
    font-size: 0.9rem;
  }
  /* le jumeau est déjà mémorisé : l'alerte est mise en avant (c'est là que l'erreur arrive) */
  .alerte.avant {
    color: var(--warn-ink);
    background: var(--warn-bg);
    border-color: var(--warn-ink);
    font-weight: 700;
  }
  .note {
    margin: 0;
    font-size: 0.9rem;
  }
  .cartes {
    display: grid;
    gap: 8px;
  }
</style>
