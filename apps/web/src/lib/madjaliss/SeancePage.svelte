<script lang="ts">
  import { resolve } from '$app/paths';
  import { onMount } from 'svelte';
  import Bidi from '$lib/Bidi.svelte';
  import { demoProfileFor } from '$lib/attempts';
  import { t } from '$lib/i18n';
  import { cachedMe, isStaff, type ProfileInfo } from '$lib/session';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import Loading from '$lib/ui/Loading.svelte';
  import { ACTIFS } from './cycles';
  import { chargerMatn, seancesPour, type Matn } from './donnees';
  import { lien } from './liens';
  import { lireProgres, type Progres } from './progression';
  import Seance from './Seance.svelte';

  /** Madjaliss — une séance d'un texte (parcours par étapes, voir Seance.svelte). */
  let { id, n }: { id: string; n: number } = $props();
  let matn = $state<Matn | null>(null);
  let profil = $state<ProfileInfo | null>(null);
  let progres = $state<Progres | null>(null);
  let staff = $state(false);
  let etat = $state<'charge' | 'pret' | 'absent'>('charge');

  const seances = $derived(matn ? seancesPour(matn, profil?.kind === 'enfant') : []);
  const seance = $derived(seances.find((s) => s.n === n) ?? null);
  const suivante = $derived(seances.find((s) => s.n > n)?.n ?? null);

  onMount(async () => {
    if (!ACTIFS.has(id)) {
      etat = 'absent';
      return;
    }
    profil = await demoProfileFor('').catch(() => null);
    staff = isStaff(await cachedMe().catch(() => null));
    progres = await lireProgres(profil?.id ?? null, id);
    matn = await chargerMatn(id);
    etat = matn ? 'pret' : 'absent';
  });
</script>

<p>
  <a href={resolve('/madjaliss/[[texte]]/[[n]]', lien(id))}
    ><Bidi text={t('mj.retour_sommaire')} /></a
  >
</p>
{#if etat === 'charge'}
  <Loading />
{:else if etat === 'absent'}
  <EmptyState title={t(ACTIFS.has(id) ? 'mj.horsligne' : 'mj.introuvable')} />
{:else if matn && seance && progres}
  <Seance {matn} {seance} pid={profil?.id ?? null} enseignant={staff} {suivante} {progres} />
{:else}
  <EmptyState title={t('mj.introuvable')} />
{/if}
