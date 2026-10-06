<script lang="ts">
  import { onMount, type Component } from 'svelte';
  import { loadTexts, t } from '$lib/i18n';
  import { etatEcoute, type EtatEcoute } from './etat';

  /**
   * A5 — bouton « Réciter et vérifier » (lecteur en mode Mémoriser, carnet de hifẓ). Visible seulement si la
   * fonction est ouverte pour ce profil (interrupteur « ecoute_ia », canal bêta). Le panneau est chargé au
   * premier appui (hors de la coquille de l'élève).
   */
  let {
    profileId,
    kind,
    portion,
    memoriser = false,
  }: {
    profileId: string | null;
    kind: string;
    portion: { s: number; from: number; to: number } | null;
    memoriser?: boolean;
  } = $props();

  let etat = $state<EtatEcoute | null>(null);
  let Panneau = $state<Component<Record<string, unknown>> | null>(null);
  let ouvert = $state(false);

  onMount(() => {
    if (!profileId) return;
    void etatEcoute(profileId).then(async (e) => {
      // textes de la fonction hors de la coquille : chargés seulement si elle est ouverte pour ce profil
      if (e.active) await loadTexts('ecoute');
      etat = e;
    });
  });
  async function ouvrir() {
    Panneau ??= (await import('./PanneauEcoute.svelte')).default as unknown as Component<
      Record<string, unknown>
    >;
    ouvert = true;
  }
</script>

{#if etat?.active && portion && profileId}
  <button type="button" class="ecoute" onclick={ouvrir} data-testid="reciter-verifier"
    >{t('ec.bouton')}</button
  >
  {#if Panneau && ouvert}
    <Panneau {profileId} {kind} {portion} {memoriser} {etat} bind:ouvert />
  {/if}
{/if}

<style>
  .ecoute {
    border-radius: 999px;
    padding: 6px 14px;
    font-weight: 600;
    background: var(--accent);
    color: var(--accent-ink, #fff);
    border-color: var(--accent);
  }
</style>
