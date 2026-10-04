<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import { kvGet, kvSet } from '$lib/idb';
  import { t } from '$lib/i18n';
  import type { Audience } from './audience';
  import Icon from './Icon.svelte';

  /**
   * Lot 26 — premier lancement : trois consignes courtes PAR PUBLIC, montrées une fois sur l'appareil
   * (dans la page, jamais en fenêtre bloquante). Enfant non lecteur : grandes icônes et une ligne pour
   * l'adulte qui lit les consignes à voix haute.
   */
  let { audience }: { audience: Audience } = $props();
  const STEPS: Record<string, string[]> = {
    enfant: ['maison', 'alif', 'etoile'],
    ado: ['maison', 'grille', 'courbe'],
    adulte: ['maison', 'grille', 'courbe'],
    parent: ['famille', 'personne', 'bouclier'],
    enseignant: ['classe', 'plume', 'ecole'],
  };
  const steps = $derived(STEPS[audience] ?? []);
  let show = $state(false);
  const key = $derived(`bienvenue:${audience}`);

  onMount(async () => {
    if (!STEPS[audience]) return;
    show = !(await kvGet<boolean>(key).catch(() => true));
  });
  async function done() {
    // enregistré AVANT de masquer : un rechargement immédiat ne remontre pas l'accueil
    // (cause d'un e2e intermittent du lot 26 : rechargement avant la fin de l'écriture IndexedDB)
    await kvSet(key, true).catch(() => {});
    show = false;
  }
</script>

{#if show}
  <section
    class="welcome"
    data-testid="bienvenue"
    data-public={audience}
    aria-labelledby="bienvenue-titre"
  >
    <h2 id="bienvenue-titre"><Bidi text={t(`bienvenue.${audience}.titre`)} /></h2>
    <ol>
      {#each steps as icon, i (icon)}
        <li>
          <span class="ic"><Icon name={icon} size={audience === 'enfant' ? 36 : 26} /></span>
          <span><Bidi text={t(`bienvenue.${audience}.${i + 1}`)} /></span>
        </li>
      {/each}
    </ol>
    {#if audience === 'enfant'}<p class="adulte">{t('bienvenue.pour_adulte')}</p>{/if}
    <button type="button" class="primary" onclick={done} data-testid="bienvenue-ok"
      >{t('bienvenue.ok')}</button
    >
  </section>
{/if}

<style>
  .welcome {
    margin: var(--space-m) 0;
    padding: var(--space-l) var(--space-m);
    border-radius: var(--radius-lg);
    background: var(--primary-soft);
    color: var(--ink);
  }
  h2 {
    margin: 0 0 var(--space-s);
  }
  ol {
    list-style: none;
    padding: 0;
    margin: 0 0 var(--space-m);
    display: grid;
    gap: var(--space-s);
  }
  li {
    display: flex;
    align-items: center;
    gap: var(--space-m);
  }
  .ic {
    display: grid;
    place-items: center;
    flex: none;
    width: calc(var(--target) - 4px);
    height: calc(var(--target) - 4px);
    border-radius: var(--radius-md);
    background: var(--card);
    color: var(--primary);
  }
  .adulte {
    font-size: 0.95rem;
    color: var(--ink2);
  }
</style>
