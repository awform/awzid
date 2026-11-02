<script lang="ts">
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import { suraName } from '@awform/hifz';
  import {
    proposerTafsir,
    souratesProposees,
    type ProposeTafsir,
  } from '@awform/content/tafsir-niveaux';
  import Bidi from '$lib/Bidi.svelte';
  import { demoProfileFor } from '$lib/attempts';
  import { fn } from '$lib/fonctions.svelte';
  import { t } from '$lib/i18n';
  import Icon from '$lib/ui/Icon.svelte';
  import { basculerLue, lireLues } from './lues';

  /**
   * « Tafsīr du niveau » : les sourates de la portion du niveau de l'élève, dans l'ordre (à rebours), avec sa progression (sourates
   * marquées comme lues, gardées sur l'appareil). RECOMMANDÉ, JAMAIS BLOQUANT : la portion du niveau est proposée en premier, les autres
   * portions restent ouvrables ; l'enfant n'a que celle du juzʾ ʿAmma. Chaque sourate s'ouvre dans le lecteur du Coran, où « Sens et
   * explication » est libre pour tout verset (page `/coran/lecteur`, petit menu du verset). La table niveau → sourates est dans
   * `packages/content/src/tafsir-niveaux.ts` (fichier de configuration unique).
   */
  let profil = $state<{ id: string; kind: string; levelCode: string | null } | null>(null);
  let pret = $state(false);
  let lues = $state<number[]>([]);

  onMount(async () => {
    profil = await demoProfileFor('arabe').catch(() => null);
    lues = await lireLues(profil?.id);
    pret = true;
  });

  const propose = $derived<ProposeTafsir>(
    proposerTafsir({ kind: profil?.kind ?? 'adulte', levelCode: profil?.levelCode ?? null }),
  );
  const enfant = $derived(profil?.kind === 'enfant');
  const proposees = (n: number) => souratesProposees(profil?.kind ?? 'adulte', n);
  const faites = (n: number) => proposees(n).filter((s) => lues.includes(s)).length;
  const bilan = (n: number) => t('tf.lues', { x: faites(n), y: proposees(n).length });
  const lecteur = resolve('/coran/lecteur');

  async function basculer(s: number) {
    lues = await basculerLue(profil?.id, s);
  }
</script>

{#if !fn('tafsir_sens')}
  <section class="card" data-testid="tf-ferme"><p><Bidi text={t('fn.coupee')} /></p></section>
{:else if !pret}
  <p class="muted" aria-busy="true">…</p>
{:else}
  <header class="tete">
    <h1><Bidi text={t('tf.parcours_titre')} /></h1>
    <p class="muted" data-testid="tf-libre"><Bidi text={t('tf.libre')} /></p>
    {#if enfant}<p class="muted" data-testid="tf-enfant"><Bidi text={t('tf.enfant')} /></p>{/if}
  </header>

  {#snippet portion(n: number)}
    {@const liste = proposees(n)}
    <ol class="sourates" data-testid="tf-liste-{n}">
      {#each liste as s (s)}
        <li data-sourate={s} class:lue={lues.includes(s)}>
          <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- chemin résolu, suivi d'un paramètre -->
          <a href={`${lecteur}?s=${s}`} data-testid="tf-ouvrir"
            ><span class="num"><Bidi text={s} /></span><span><Bidi text={suraName(s)} /></span></a
          >
          <button
            type="button"
            aria-pressed={lues.includes(s)}
            onclick={() => basculer(s)}
            data-testid="tf-lue"
            ><Icon name="coche" size={18} /><span
              ><Bidi text={lues.includes(s) ? t('tf.lue') : t('tf.marquer')} /></span
            ></button
          >
        </li>
      {/each}
    </ol>
  {/snippet}

  <section
    class="reco"
    aria-labelledby="tf-reco"
    data-testid="tf-reco"
    data-niveau={propose.recommande}
  >
    <h2 id="tf-reco">
      <Bidi text={`${t('tf.reco')} · ${t('tf.niveau', { n: propose.recommande })}`} />
    </h2>
    <p class="progres" data-testid="tf-progres">
      <progress
        max={proposees(propose.recommande).length}
        value={faites(propose.recommande)}
        aria-label={bilan(propose.recommande)}
      ></progress>
      <span><Bidi text={bilan(propose.recommande)} /></span>
    </p>
    {@render portion(propose.recommande)}
  </section>

  {#if propose.niveaux.length > 1}
    <section class="autres" aria-labelledby="tf-autres" data-testid="tf-autres">
      <h2 id="tf-autres"><Bidi text={t('tf.autres')} /></h2>
      {#each propose.niveaux.slice(1) as n (n)}
        <details data-niveau={n}>
          <summary
            ><span><Bidi text={t('tf.niveau', { n })} /></span><small
              ><Bidi text={bilan(n)} /></small
            ></summary
          >
          {@render portion(n)}
        </details>
      {/each}
    </section>
  {/if}
{/if}

<style>
  .tete {
    display: grid;
    gap: 6px;
    margin-bottom: 12px;
  }
  h1,
  h2,
  .tete p {
    margin: 0;
  }
  h2 {
    font-size: 1.05rem;
    color: var(--mp-green);
  }
  .reco,
  details {
    display: grid;
    gap: 8px;
    margin-bottom: 12px;
    padding: 10px 12px;
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
  }
  .progres {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0;
    font-size: 0.9rem;
  }
  progress {
    flex: 1;
    height: 10px;
    accent-color: var(--teal);
  }
  summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-height: 44px;
    font-weight: 700;
    color: var(--navy);
    cursor: pointer;
  }
  summary small {
    font-weight: 400;
    color: var(--ink2);
  }
  .sourates {
    display: grid;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .sourates li {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .sourates a {
    display: flex;
    flex: 1;
    align-items: center;
    gap: 10px;
    min-height: 44px;
    padding: 0 10px;
    color: var(--ink);
    background: var(--surface);
    border-radius: 10px;
    text-decoration: none;
  }
  .num {
    min-width: 2ch;
    font-weight: 700;
    color: var(--navy);
  }
  button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 44px;
    padding: 0 10px;
    color: var(--ink);
    background: transparent;
    border: 1px solid var(--line);
    border-radius: 10px;
  }
  button[aria-pressed='true'] {
    color: var(--navy);
    border-color: var(--teal);
    background: color-mix(in srgb, var(--teal) 12%, transparent);
  }
  li.lue .num {
    color: var(--teal);
  }
</style>
