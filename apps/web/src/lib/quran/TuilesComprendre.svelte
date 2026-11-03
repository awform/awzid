<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { resolve } from '$app/paths';
  import { fn } from '$lib/fonctions.svelte';
  import { t } from '$lib/i18n';
  import Icon from '$lib/ui/Icon.svelte';

  /**
   * Accueil du Coran, 2e rangée de tuiles (3/11/2026), sous « Lire · Écouter · Mémoriser » et dans le même style :
   *  - « Comprendre » → `/coran/tafsir` (interrupteur `tafsir_sens`) ;
   *  - « Mots du Coran » → l'espace `/coran/mots` (interrupteur `coran_mots`).
   * Une tuile seule prend toute la largeur (jamais de case vide). Module CHARGÉ À LA DEMANDE par l'accueil, seulement si l'un
   * des deux interrupteurs est ouvert : rien dans la coquille de l'élève (`PREMIER_USAGE_MODULES` de scripts/groupes.mjs).
   */
  const TUILES = [
    { id: 'comprendre', f: 'tafsir_sens', href: '/coran/tafsir', icon: 'traduction' },
    { id: 'mots', f: 'coran_mots', href: '/coran/mots', icon: 'alif' },
  ] as const;
  const visibles = $derived(TUILES.filter((x) => fn(x.f)));
</script>

{#if visibles.length}
  <ul class="tuiles" data-testid="modes-2">
    {#each visibles as x (x.id)}
      <li>
        <a href={resolve(x.href)} data-testid={`mode-${x.id}`}
          ><span class="ic"><Icon name={x.icon} size={26} /></span><span
            ><Bidi text={t(`cl.mode_${x.id}`)} /></span
          ></a
        >
      </li>
    {/each}
  </ul>
{/if}

<style>
  /* même allure que la 1re rangée (.modes de l'accueil), 8 px dessous (marges fusionnées) */
  .tuiles {
    display: flex;
    gap: 8px;
    list-style: none;
    margin: calc(8px - var(--space-m)) 0 var(--space-m);
    padding: 0;
  }
  li {
    flex: 1 1 0;
    min-width: 0;
  }
  a {
    display: grid;
    justify-items: center;
    gap: 6px;
    min-height: 88px;
    padding: 12px 4px;
    border: 1px solid var(--line);
    border-radius: 16px;
    background: var(--card);
    color: var(--ink);
    font-weight: 700;
    text-align: center;
    text-decoration: none;
  }
  a:hover {
    border-color: var(--primary);
  }
  .ic {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: var(--primary-soft);
    color: var(--primary);
  }
</style>
