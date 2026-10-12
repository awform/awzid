<script lang="ts">
  import { resolve } from '$app/paths';
  import { onMount } from 'svelte';
  import Bidi from '$lib/Bidi.svelte';
  import { demoProfileFor } from '$lib/attempts';
  import { t } from '$lib/i18n';
  import type { ProfileInfo } from '$lib/session';
  import EnTete from '$lib/ui/EnTete.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { ACTIFS, CYCLES, cycleConseille } from './cycles';
  import { lien } from './liens';
  import { lireProgres, type Progres } from './progression';

  /**
   * Madjaliss (P3-1) — les textes de référence de l'école mālikite, rangés par cycle (cursus validé le 12/10/2026).
   * Le cycle conseillé suit le niveau d'arabe de l'élève et vient en premier ; les textes dont les données
   * n'existent pas encore sont annoncés « bientôt » (aucun lien). Les enfants : aperçu seulement.
   */
  let profil = $state<ProfileInfo | null>(null);
  let progres = $state<Record<string, Progres>>({});
  let pret = $state(false);

  const conseille = $derived(cycleConseille(profil));
  const enfant = $derived(profil?.kind === 'enfant');
  const cycles = $derived(
    conseille
      ? [...CYCLES].sort((a, b) => (b.n === conseille ? 1 : 0) - (a.n === conseille ? 1 : 0))
      : CYCLES,
  );

  onMount(async () => {
    profil = await demoProfileFor('').catch(() => null);
    for (const id of ACTIFS) progres[id] = await lireProgres(profil?.id ?? null, id);
    pret = true;
  });
</script>

<EnTete titre={t('mj.titre')} ar="مَجَالِسُ الْعِلْمِ" icon="" />
<p class="muted"><Bidi text={t('mj.intro')} /></p>
{#if enfant}<p class="warnbox" data-testid="mj-enfant"><Bidi text={t('mj.enfant')} /></p>{/if}

<div data-testid="madjaliss" data-pret={pret} data-conseille={conseille ?? ''}>
  {#each cycles as c (c.n)}
    <section class="cycle" data-cycle={c.n} class:conseille={c.n === conseille}>
      <h2>
        <Bidi text={`${t('mj.cycle', { n: c.n })} — ${t(`mj.cycle_${c.n}`)}`} />
        {#if c.n === conseille}<span class="pill" data-testid="cycle-conseille"
            ><Icon name="etoile" size={16} /><Bidi text={t('mj.conseille')} /></span
          >{/if}
      </h2>
      <ul class="textes">
        {#each c.textes as x (x.id)}
          {@const actif = ACTIFS.has(x.id)}
          {@const faites = progres[x.id]?.faites.length ?? 0}
          <li>
            {#if actif}
              <a
                class="couv"
                href={resolve('/madjaliss/[[texte]]/[[n]]', lien(x.id))}
                data-texte={x.id}
                data-actif="1"
              >
                <span class="bandeau b{c.n}"
                  ><span class="titre-ar" lang="ar" dir="rtl"><Bidi text={x.ar} base="ar" /></span
                  ></span
                >
                <span class="pied">
                  <span class="nom">
                    <strong><Bidi text={t(`mj.t_${x.id.replace('-', '_')}`)} /></strong>
                    <small><Bidi text={t(`mj.m_${x.matiere}`)} /></small>
                  </span>
                  <small class="etat"
                    ><Bidi
                      text={faites ? t('mj.faites_court', { n: faites }) : t('mj.ouvrir')}
                    /></small
                  >
                  <span class="chev" aria-hidden="true"><Icon name="chevron" size={20} /></span>
                </span>
              </a>
            {:else}
              <div class="couv bientot" data-texte={x.id}>
                <span class="bandeau b{c.n}"
                  ><span class="titre-ar" lang="ar" dir="rtl"><Bidi text={x.ar} base="ar" /></span
                  ></span
                >
                <span class="pied">
                  <span class="nom">
                    <strong><Bidi text={t(`mj.t_${x.id.replace('-', '_')}`)} /></strong>
                    <small><Bidi text={t(`mj.m_${x.matiere}`)} /></small>
                  </span>
                  <span class="soon"><Bidi text={t('mj.bientot')} /></span>
                </span>
              </div>
            {/if}
          </li>
        {/each}
      </ul>
    </section>
  {/each}
</div>

<style>
  .cycle h2 {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin: var(--space-m) 0 var(--space-s);
  }
  .textes {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr));
    gap: var(--space-s);
  }
  .couv {
    display: grid;
    border: 1px solid var(--line);
    border-radius: 16px;
    overflow: hidden;
    background: var(--card);
    color: var(--ink);
    text-decoration: none;
    box-shadow: var(--shadow-card);
  }
  a.couv:hover {
    border-color: var(--primary);
  }
  .bandeau {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 76px;
    padding: 6px 16px;
    color: var(--bande-texte);
    background-image: var(--motif-etoile);
    border-bottom: 2px solid var(--gold);
  }
  .b1 {
    background-color: var(--bande-1);
  }
  .b2,
  .b4 {
    background-color: var(--bande-2);
  }
  .b3 {
    background-color: var(--bande-3);
  }
  .titre-ar {
    font-family: var(--font-ar-titre);
    font-weight: 700;
    font-size: 1.7rem;
    line-height: 1.6;
  }
  .bientot .bandeau {
    filter: saturate(0.35);
  }
  .pied {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 16px;
    min-height: 56px;
  }
  .nom {
    display: grid;
    flex: 1;
    min-width: 0;
  }
  .nom small,
  .etat {
    color: var(--ink2);
  }
  .chev {
    color: var(--ink2);
  }
</style>
