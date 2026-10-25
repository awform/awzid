<script lang="ts">
  import { onMount, type Component } from 'svelte';
  import { loadTexts, t } from '$lib/i18n';
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
  }: {
    profileId: string | null;
    kind: string;
    portion: { s: number; from: number; to: number } | null;
    memoriser?: boolean;
    /** carnet de hifẓ : montrer aussi les passages à revoir (bilans des séances) */
    carnet?: boolean;
  } = $props();

  type Composant = Component<Record<string, unknown>>;
  let etat = $state<EtatEcoute | null>(null);
  let Panneau = $state<Composant | null>(null);
  let ARevoir = $state<Composant | null>(null);
  let ouvert = $state(false);

  onMount(() => {
    if (!profileId) return;
    void etatEcoute(profileId).then(async (e) => {
      if (!e.active) return;
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

{#if etat?.active && profileId}
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
  .ecoute {
    border-radius: 999px;
    padding: 6px 14px;
    font-weight: 600;
  }
</style>
