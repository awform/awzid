<script lang="ts">
  import { getContext } from 'svelte';
  import Bidi from '$lib/Bidi.svelte';
  import ConnexionNecessaire from '$lib/ConnexionNecessaire.svelte';
  import { AUDIO_CTX, levelAudio, type LevelAudio } from '$lib/lecons-audio';
  import { fn } from '$lib/fonctions.svelte';
  import { chargerModule } from '$lib/charger';
  import { t } from '$lib/i18n';
  import { noter } from '$lib/usage';
  import { VIDEO_NIVEAUX } from '@awform/content/video-niveaux';

  /**
   * Vidéos vivantes (19/10/2026) — bouton « Voir en vidéo » en haut d'une unité d'Adultes 1, derrière l'interrupteur
   * `video_vivante` (coupé en production et en bêta, allumé sur la démonstration). Quelques octets ici : le lecteur
   * plein écran et le générateur sont chargés au premier appui (`$lib/video/lecteur`), puis gardés pour le hors
   * ligne ; l'élève choisit le mode (par lettre, courte, longue, quiz, révision) dans le lecteur.
   */
  let {
    unit,
    profileId = null,
  }: {
    unit: { id: string; levelCode: string; kind: string; lesson: unknown };
    profileId?: string | null;
  } = $props();
  const illus = getContext<(() => Record<string, { viewBox: string }>) | undefined>(
    'illustrations',
  );
  const audio = getContext<(() => LevelAudio | null) | undefined>(AUDIO_CTX);
  const voir = $derived(fn('video_vivante') && VIDEO_NIVEAUX.includes(unit.levelCode));
  let charge = $state(false);
  let echec = $state(false);

  async function ouvrir() {
    charge = true;
    echec = false;
    try {
      const [m, la] = await Promise.all([
        chargerModule(() => import('$lib/video/lecteur')),
        audio?.() ?? levelAudio(unit.levelCode).catch(() => null),
      ]);
      noter('video_vivante');
      await m.ouvrir({ unit, illus: illus?.() ?? {}, audio: la, profileId });
    } catch {
      echec = true;
    } finally {
      charge = false;
    }
  }
</script>

{#if voir}
  <button
    type="button"
    class="vv-voir"
    data-testid="voir-video"
    aria-busy={charge}
    disabled={charge}
    onclick={ouvrir}
    ><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg><Bidi
      text={t('vv.voir')}
    /></button
  >
  {#if echec}<ConnexionNecessaire onretry={ouvrir} />{/if}
{/if}

<style>
  .vv-voir {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    min-height: 2.75rem;
    margin-top: 0.4rem;
    padding: 0 1rem;
    border-radius: 999px;
    border: 1.5px solid var(--or-line, var(--gold));
    background: var(--card);
    color: var(--primary);
    font-weight: 700;
    cursor: pointer;
  }
  .vv-voir svg {
    width: 1.1rem;
    height: 1.1rem;
    fill: currentColor;
  }
</style>
