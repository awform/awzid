<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n';
  import type { Genre, NomPose, Silhouette } from './silhouette';

  /**
   * Silhouette de la prière (SANS VISAGE) : moteur chargé à la demande. `pose` change la position (interpolation des
   * angles, 1,2 s ; aucune en mouvement réduit) ; `parle` allume le halo doré de la parole. `aller()` rend la main quand
   * la position est atteinte (vidéo vivante).
   */
  let {
    pose,
    genre = 'homme',
    camera = 'tapis',
    decor = true,
    viewBox,
    statique = false,
    parle = false,
    duree = 0,
    aria = true,
  }: {
    pose: NomPose;
    genre?: Genre;
    camera?: 'tapis' | 'figure';
    decor?: boolean;
    viewBox?: string;
    statique?: boolean;
    parle?: boolean;
    duree?: number;
    aria?: boolean;
  } = $props();

  let svg: SVGSVGElement;
  let s = $state.raw<Silhouette | null>(null);

  onMount(() => {
    let mort = false;
    let moteur: Silhouette | null = null;
    void import('./silhouette').then((m) => {
      if (mort) return;
      moteur = new m.Silhouette(svg, { genre, pose, camera, decor, viewBox, statique });
      s = moteur;
    });
    return () => {
      mort = true;
      moteur?.detruire();
    };
  });
  $effect(() => {
    const p = pose;
    const d = duree;
    if (s && s.nom !== p) void s.aller(p, d);
  });
  $effect(() => {
    if (s && s.genre !== genre) s.changerGenre(genre);
  });
  $effect(() => {
    s?.parle(parle);
  });
  /** Va à une position ; la promesse se résout à l'arrivée (tout de suite en mouvement réduit). */
  export function aller(p: NomPose, ms: number): Promise<void> {
    return s ? s.aller(p, ms) : Promise.resolve();
  }
</script>

<svg
  bind:this={svg}
  class="sil"
  role={aria ? 'img' : undefined}
  aria-hidden={aria ? undefined : 'true'}
  aria-label={aria ? t(genre === 'femme' ? 'priere.sil_femme' : 'priere.sil_homme') : undefined}
></svg>
