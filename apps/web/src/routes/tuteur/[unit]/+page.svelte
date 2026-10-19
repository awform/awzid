<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { page } from '$app/state';
  import { resolve } from '$app/paths';
  import Bidi from '$lib/Bidi.svelte';
  import ConnexionNecessaire from '$lib/ConnexionNecessaire.svelte';
  import { demoProfileFor } from '$lib/attempts';
  import { chargerModule } from '$lib/charger';
  import { fn } from '$lib/fonctions.svelte';
  import { t } from '$lib/i18n';
  import { noter } from '$lib/usage';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import EnTete from '$lib/ui/EnTete.svelte';
  import Loading from '$lib/ui/Loading.svelte';

  /**
   * Tuteur IA de conversation (19/10/2026) : page RARE (en ligne seulement, hors du préchargement de l'élève) ;
   * l'écran `$lib/tuteur-ia/TuteurVue.svelte` est chargé À LA DEMANDE (scripts/groupes.mjs : module « en ligne »).
   */
  const unitId = $derived(page.params.unit ?? '');
  let profileId: string | null = $state(null);
  let pret = $state(false);
  let Vue = $state<typeof import('$lib/tuteur-ia/TuteurVue.svelte').default | null>(null);
  let echec = $state(false);

  async function charger() {
    echec = false;
    try {
      Vue = (await chargerModule(() => import('$lib/tuteur-ia/TuteurVue.svelte'))).default;
      noter('tuteur_ia');
    } catch {
      echec = true;
    }
  }
  onMount(async () => {
    const p = await demoProfileFor(unitId.split('.')[0] ?? '');
    profileId = p?.id ?? null;
    pret = true;
  });
  // l'interrupteur peut n'être connu qu'après la réponse du serveur (ouverture directe de la page) : l'écran se charge
  // dès qu'il est ouvert, une seule fois
  $effect(() => {
    if (!profileId || !fn('tuteur_ia') || untrack(() => Vue || echec)) return;
    void charger();
  });
</script>

<svelte:head><title>{t('app.nom')} — {t('tuia.titre')}</title></svelte:head>

<EnTete titre={t('tuia.titre')} ar="أَتَحَدَّثُ بِالْعَرَبِيَّةِ" icon="message" teinte={1} />

{#if !pret}
  <Loading />
{:else if !fn('tuteur_ia')}
  <EmptyState icon="horsligne" title={t('fn.coupee')} />
{:else if !profileId}
  <EmptyState icon="personne" title={t('tuia.sans_profil')} />
{:else if Vue}
  <Vue {unitId} {profileId} />
{:else if echec}
  <ConnexionNecessaire onretry={charger} />
{:else}
  <Loading />
{/if}
<p class="retour">
  <a href={resolve('/lecons/[id]', { id: unitId })}><Bidi text={t('tuia.retour')} /></a>
</p>

<style>
  .retour {
    text-align: center;
    margin: var(--space-m) 0 96px;
  }
</style>
