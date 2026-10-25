<script lang="ts">
  import { onMount, type Component } from 'svelte';
  import { resolve } from '$app/paths';
  import { loadTexts, t } from '$lib/i18n';
  import Icon from '$lib/ui/Icon.svelte';
  import { etatEcoute, type EtatEcoute } from './etat';

  /**
   * A5 — bouton « Réciter et vérifier » (lecteur en mode Mémoriser, carnet de hifẓ). Visible seulement si la
   * fonction est ouverte pour ce profil (interrupteur « ecoute_ia », canal bêta). Le panneau (et, dans le
   * carnet, la liste « À revoir ») sont chargés à la demande, hors de la coquille de l'élève.
   */
  let {
    profileId,
    kind,
    portion,
    memoriser = false,
    carnet = false,
    retrouver = false,
  }: {
    profileId: string | null;
    kind: string;
    portion: { s: number; from: number; to: number } | null;
    memoriser?: boolean;
    /** carnet de hifẓ : montrer aussi les passages à revoir (bilans des séances) */
    carnet?: boolean;
    /** barre du lecteur : bouton « Retrouve ce verset » (interrupteur shazam_coran) au lieu de « Réciter et vérifier » */
    retrouver?: boolean;
  } = $props();

  type Composant = Component<Record<string, unknown>>;
  let etat = $state<EtatEcoute | null>(null);
  let Panneau = $state<Composant | null>(null);
  let ARevoir = $state<Composant | null>(null);
  let ouvert = $state(false);

  onMount(() => {
    if (!profileId) return;
    void etatEcoute(profileId).then(async (e) => {
      if (retrouver ? !e.shazam : !e.active) return;
      // textes de la fonction hors de la coquille : chargés seulement si elle est ouverte pour ce profil
      await loadTexts('ecoute');
      etat = e;
      if (carnet)
        ARevoir = (await import('./ARevoirEcoute.svelte').catch(() => null))
          ?.default as unknown as Composant | null;
    });
  });
  async function ouvrir() {
    Panneau ??= (await import('./PanneauEcoute.svelte')).default as unknown as Composant;
    ouvert = true;
  }
</script>

{#if retrouver}
  {#if etat?.shazam}<a class="rv" href={resolve('/coran/retrouver')} data-testid="retrouver-verset"
      ><Icon name="oreille" size={22} /><span>{t('rv.titre')}</span></a
    >{/if}
{:else if etat?.active && profileId}
  {#if portion}
    <button type="button" class="ecoute primary" onclick={ouvrir} data-testid="reciter-verifier"
      >{t('ec.bouton')}</button
    >
  {/if}
  {#if Panneau && ouvert && portion}
    <Panneau {profileId} {kind} {portion} {memoriser} {etat} bind:ouvert />
  {/if}
  {#if ARevoir}<ARevoir {profileId} />{/if}
{/if}

<style>
  /* « Retrouve ce verset » : même allure que les outils de la barre du lecteur */
  .rv {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-width: 44px;
    min-height: 44px;
    padding: 0 8px;
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--mp-green);
    text-decoration: none;
    border-radius: var(--radius-pill);
  }
  .rv:hover {
    background: var(--mp-mint);
  }
  .ecoute {
    border-radius: 999px;
    padding: 6px 14px;
    font-weight: 600;
  }
</style>
