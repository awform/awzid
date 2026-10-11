<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import ConnexionNecessaire from '$lib/ConnexionNecessaire.svelte';
  import { chargerModule } from '$lib/charger';
  import { t } from '$lib/i18n';
  import { noter } from '$lib/usage';
  import { chargerScenario, garderScenario, type Scenario } from './scenario';

  /**
   * A26b — accroche « Je parle » sous le dialogue de la leçon (quelques octets) : l'écran et le scénario sont
   * chargés À LA DEMANDE (scénario servi par l'API avec les droits des leçons) ; le scénario est gardé sur
   * l'appareil pour ce profil dès l'ouverture de la leçon (hors ligne ensuite).
   */
  let { unitId, profileId }: { unitId: string; profileId: string } = $props();
  let Ecran = $state<typeof import('./JeParle.svelte').default | null>(null);
  let scenario = $state<Scenario | null>(null);
  let ouvert = $state(false);
  let echec = $state(false);
  let refuse = $state(false);
  let bouton: HTMLButtonElement | undefined = $state();

  $effect(() => {
    void garderScenario(profileId, unitId);
  });

  async function ouvrir() {
    echec = false;
    refuse = false;
    try {
      const [m, s] = await Promise.all([
        chargerModule(() => import('./JeParle.svelte')),
        chargerScenario(profileId, unitId),
      ]);
      if (s === 'refuse') return void (refuse = true);
      if (s === 'reseau') return void (echec = true);
      Ecran = m.default;
      scenario = s;
      ouvert = true;
      noter('conversation');
    } catch {
      echec = true;
    }
  }
  function fermer() {
    ouvert = false;
    queueMicrotask(() => bouton?.focus());
  }
</script>

{#if ouvert && Ecran && scenario}
  <Ecran {scenario} onclose={fermer} />
{/if}
<p class="jp-accroche">
  <button type="button" class="primary" bind:this={bouton} onclick={ouvrir} data-testid="jp-ouvrir"
    >{t('conv.ouvrir')}</button
  >
</p>
{#if refuse}<p class="fr muted" role="status" data-testid="jp-refuse">
    <Bidi text={t('conv.indisponible')} />
  </p>{/if}
{#if echec}<ConnexionNecessaire onretry={ouvrir} />{/if}

<style>
  .jp-accroche button {
    min-height: var(--target);
    font-size: 1.05rem;
  }
</style>
