<script lang="ts">
  import { resolve } from '$app/paths';
  import { onMount } from 'svelte';
  import Bidi from '$lib/Bidi.svelte';
  import { demoProfileFor } from '$lib/attempts';
  import { t } from '$lib/i18n';
  import { isStaff, type ProfileInfo } from '$lib/session';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import Loading from '$lib/ui/Loading.svelte';
  import { ACTIFS } from './cycles';
  import BandeauRelecture from './BandeauRelecture.svelte';
  import {
    chargerMatn,
    chargerPartie,
    compteActuel,
    matnPour,
    membreBeta,
    oublierDiffere,
    voitDiffere,
    type Matn,
  } from './donnees';
  import { lien } from './liens';
  import { lireProgres, type Progres } from './progression';
  import Seance from './Seance.svelte';

  /** Madjaliss — une séance d'un texte (parcours par étapes, voir Seance.svelte). */
  let { id, n }: { id: string; n: number } = $props();
  let matn = $state<Matn | null>(null);
  let profil = $state<ProfileInfo | null>(null);
  let progres = $state<Progres | null>(null);
  let staff = $state(false);
  // personnel et démonstration : voient aussi les séances en publication différée (jamais les invités de la bêta)
  let differe = $state(false);
  // groupe "bêta fermée" : bandeau "Contenu en relecture : ne pas diffuser"
  let groupe = $state(false);
  let etat = $state<'charge' | 'pret' | 'absent'>('charge');

  // le texte tel que le voit ce profil : ni règles et lochies aux enfants, ni passages « adulte » aux enfants et ados
  const vue = $derived(matn ? matnPour(matn, profil?.kind ?? null, differe) : null);
  const seances = $derived(vue?.seances ?? []);
  const seance = $derived(seances.find((s) => s.n === n) ?? null);
  const suivante = $derived(seances.find((s) => s.n > n)?.n ?? null);

  onMount(async () => {
    if (!ACTIFS.has(id)) {
      etat = 'absent';
      return;
    }
    profil = await demoProfileFor('').catch(() => null);
    const me = await compteActuel();
    staff = isStaff(me);
    differe = voitDiffere(me, staff);
    groupe = membreBeta(me);
    if (!differe) void oublierDiffere();
    progres = await lireProgres(profil?.id ?? null, id);
    matn = await chargerMatn(id, undefined, differe);
    // grand texte (ar-Risāla) : seules les phrases de la partie de cette séance sont chargées
    // (seulement si la séance est visible pour ce profil : un invité de la bêta ne télécharge rien)
    if (matn && matnPour(matn, profil?.kind ?? null, differe).seances.some((s) => s.n === n))
      matn = await chargerPartie(matn, n);
    etat = matn ? 'pret' : 'absent';
  });
</script>

<p>
  <a href={resolve('/madjaliss/[[texte]]/[[n]]', lien(id))}
    ><Bidi text={t('mj.retour_sommaire')} /></a
  >
</p>
{#if groupe}<BandeauRelecture />{/if}
{#if etat === 'charge'}
  <Loading />
{:else if etat === 'absent'}
  <EmptyState title={t(ACTIFS.has(id) ? 'mj.horsligne' : 'mj.introuvable')} />
{:else if vue && seance && progres}
  <Seance
    matn={vue}
    {seance}
    pid={profil?.id ?? null}
    enseignant={staff}
    {suivante}
    {progres}
    kind={profil?.kind ?? null}
  />
  <p class="statut" data-testid="mj-statut"><Bidi text={t('mj.statut')} /></p>
{:else}
  <EmptyState title={t('mj.introuvable')} />
{/if}

<style>
  .statut {
    margin: var(--space-m) 0 0;
    color: var(--ink2);
    font-size: 0.9rem;
  }
</style>
