<script lang="ts">
  import { getContext } from 'svelte';
  import { AUDIO_CTX, type LevelAudio } from '$lib/lecons-audio';
  import { vivanteActive } from './reglage';
  import { fn } from '$lib/fonctions.svelte';
  import { noter } from '$lib/usage';

  /**
   * Chantiers A21 / A21b — point d'accroche des « leçons vivantes » dans la page de leçon. Quelques octets ici :
   * générateurs et lecteur sont chargés à la demande, seulement si la leçon est vivante (toutes les leçons des
   * livres d'arabe par défaut, sauf niveau désactivé ou interrupteur général), puis gardés par le service
   * worker (hors ligne).
   */
  let { unit }: { unit: { id: string; levelCode: string; kind: string; lesson: unknown } } =
    $props();
  const illus = getContext<(() => Record<string, { viewBox: string }>) | undefined>(
    'illustrations',
  );
  const audio = getContext<(() => LevelAudio | null) | undefined>(AUDIO_CTX);
  let mark: HTMLElement | undefined = $state();

  $effect(() => {
    const u = unit;
    const article = mark?.closest('article');
    // F5 : interrupteur « animations » (rôle, âge, pays, école, canal)
    if (!article || u.kind !== 'lecon' || !fn('animations') || !vivanteActive(u.levelCode)) return;
    noter('animations');
    let dead = false;
    let stop: (() => void) | undefined;
    void import('./installer')
      .then((m) => m.installer(article, u, illus, audio))
      .then((s) => (dead ? s() : (stop = s)));
    return () => {
      dead = true;
      stop?.();
    };
  });
</script>

<span bind:this={mark} hidden data-vivante-accroche></span>
