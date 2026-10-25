<script lang="ts">
  import { onDestroy, onMount, untrack, type Component } from 'svelte';
  import { resolve } from '$app/paths';
  import { activeProfile } from '$lib/attempts';
  import { t } from '$lib/i18n';
  import { Voix } from './audio';
  import {
    chargerPlan,
    ecrireProgres,
    lireProgres,
    marquerVu,
    progresVide,
    type Plan,
    type Progres,
  } from './donnees';
  import Picto from './Picto.svelte';
  import type { Genre } from './silhouette';
  import Sprite from './Sprite.svelte';

  /**
   * « La prière de A à Z » — coquille du parcours (rubrique de « Vivre l'islam », interrupteur `parcours_priere`).
   * Huit écrans, chargés chacun À LA DEMANDE : accueil (le chemin), pas à pas, vidéo vivante, ablutions, sourate mot à mot,
   * entraînement, situations, après la prière ; et trois sections lues de bout en bout (pourquoi, se préparer, l'appel).
   * Hors ligne d'abord : données et progression sont lues sur l'appareil. Chaque écran affiche le statut du référent.
   */
  let { ecran, params }: { ecran: string | null; params: URLSearchParams } = $props();

  let plan = $state<Plan | null>(null);
  let progres = $state<Progres>(progresVide());
  let profil = $state<string | null>(null);
  let erreur = $state(false);
  const voix = new Voix(null);

  async function charger() {
    erreur = false;
    const [p, prof] = await Promise.all([chargerPlan(), activeProfile().catch(() => null)]);
    profil = prof?.id ?? null;
    voix.profil = profil;
    if (!p) {
      erreur = true;
      return;
    }
    progres = await lireProgres(profil);
    plan = p;
  }
  onMount(() => void charger());
  onDestroy(() => voix.arreter());

  /** modifie la progression et la garde sur l'appareil */
  function maj(f: (p: Progres) => Progres) {
    const n = f(progres);
    if (n === progres) return;
    progres = n;
    void ecrireProgres(profil, n);
  }
  const vu = (id: string) => untrack(() => maj((p) => marquerVu(p, id)));
  const changerGenre = (g: Genre) => maj((p) => ({ ...p, genre: g }));
  const basculerTrad = () => maj((p) => ({ ...p, trad: !p.trad }));
  const enregistrer = (id: string, niveau: number, revision: string) =>
    maj((p) => ({ ...p, entr: { ...p.entr, [id]: { niveau, revision } } }));

  type Ecran = Component<Record<string, unknown>>;
  type Chargeur = () => Promise<{ default: Ecran }>;
  const ch = (f: () => Promise<unknown>) => f as unknown as Chargeur;
  const ECRANS: Record<string, Chargeur> = {
    accueil: ch(() => import('./Accueil.svelte')),
    pas: ch(() => import('./PasAPas.svelte')),
    video: ch(() => import('./Video.svelte')),
    ablutions: ch(() => import('./Ablutions.svelte')),
    sourate: ch(() => import('./Sourate.svelte')),
    entrainement: ch(() => import('./Entrainement.svelte')),
    situations: ch(() => import('./Situations.svelte')),
    apres: ch(() => import('./Apres.svelte')),
    pourquoi: ch(() => import('./SectionVue.svelte')),
    preparer: ch(() => import('./SectionVue.svelte')),
    appel: ch(() => import('./SectionVue.svelte')),
  };
  /** sections lues de bout en bout */
  const SECTIONS: Record<string, string> = { pourquoi: 'S1', preparer: 'S3', appel: 'S4' };
  const cle = $derived(ecran && ecran in ECRANS ? ecran : 'accueil');
  /** section du livre que montre l'écran (titre et statut) */
  const idSection = $derived(
    SECTIONS[cle] ??
      Object.entries(plan?.animation.accueil.ecrans ?? {}).find(([, e]) => e === cle)?.[0],
  );
  const titre = $derived(
    !plan
      ? ''
      : cle === 'video'
        ? t('priere.video')
        : cle === 'entrainement'
          ? t('priere.entrainement')
          : (plan.sections.find((s) => s.id === idSection)?.titre ?? plan.meta.titre),
  );
  const statut = $derived(
    (idSection && plan?.sections.find((s) => s.id === idSection)?.statut) ||
      plan?.meta.statut ||
      '',
  );
  const propsEcran = $derived({
    plan,
    progres,
    voix,
    vu,
    changerGenre,
    basculerTrad,
    enregistrer,
    id: SECTIONS[cle],
    auto: params.has('lecture'),
    depart:
      cle === 'sourate'
        ? Number(params.get('s') ?? 1)
        : cle === 'entrainement'
          ? (params.get('t') ?? undefined)
          : cle === 'situations'
            ? (params.get('o') ?? undefined)
            : Number(params.get('i') ?? 0),
  });
</script>

<svelte:head><title>{t('app.nom')} — {plan?.meta.titre ?? t('nav.vivre')}</title></svelte:head>

<div class="priere" class:cache-trad={!progres.trad} data-testid="priere" data-ecran={cle}>
  <Sprite />
  <header class="haut">
    <!-- eslint-disable svelte/no-navigation-without-resolve -- retour à l'accueil du parcours (même page) -->
    <a
      class="ibtn"
      href={cle === 'accueil' ? resolve('/vivre') : '?'}
      aria-label={t('priere.retour')}
      data-testid="priere-retour"><Picto nom="retour" /></a
    >
    <!-- eslint-enable svelte/no-navigation-without-resolve -->
    <h1>{titre || t('priere.carte_titre')}</h1>
  </header>

  {#if erreur}
    <section class="carte" role="alert">
      <p>{t('priere.erreur')}</p>
      <button type="button" class="btn" onclick={charger}>{t('priere.reessayer')}</button>
    </section>
  {:else if !plan}
    <p class="doux" aria-busy="true">{t('priere.charge')}</p>
  {:else}
    {#key cle}
      {#await ECRANS[cle]!() then m}
        <m.default {...propsEcran} />
      {:catch}
        <section class="carte" role="alert">
          <p>{t('priere.erreur')}</p>
          <button type="button" class="btn" onclick={() => location.reload()}
            >{t('priere.reessayer')}</button
          >
        </section>
      {/await}
    {/key}
    <p class="statut" data-testid="priere-statut">{statut}</p>
  {/if}
</div>
