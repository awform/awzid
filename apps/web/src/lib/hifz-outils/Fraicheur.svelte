<script lang="ts">
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import Bidi from '$lib/Bidi.svelte';
  import { suraName } from '@awform/hifz';
  import { localIso } from '$lib/hifz';
  import { fmtDate, t } from '$lib/i18n';
  import { chargerCarnet } from './donnees';
  import { fraicheur, parSourate, SEUILS, type FraicheurSourate } from './outils';
  import Pastille from './Pastille.svelte';

  /**
   * Hifẓ complet — FRAÎCHEUR de chaque passage mémorisé : pour chaque sourate (et chacun de ses passages), la
   * date de la dernière révision réussie et un indicateur écrit en toutes lettres (frais, à revoir, urgent ;
   * jamais la couleur seule). Action principale : la séance du jour, qui fait passer l'urgent d'abord.
   */
  let { profileId }: { profileId: string } = $props();
  let sourates = $state<FraicheurSourate[]>([]);
  let charge = $state(false);

  onMount(async () => {
    const c = await chargerCarnet(profileId);
    sourates = c ? parSourate(fraicheur(c.passages, c.events, localIso())) : [];
    charge = true;
  });
  const urgents = $derived(sourates.filter((s) => s.niveau === 'urgent').length);
</script>

{#if charge && !sourates.length}
  <p class="card muted" data-testid="fraicheur-vide">{t('hz.fraicheur_vide')}</p>
{:else if sourates.length}
  <p class="muted small">
    <Bidi text={t('hz.fraicheur_aide', { a: SEUILS.aRevoir, u: SEUILS.urgent })} />
  </p>
  {#if urgents}<p class="warn" data-testid="urgents">
      <Bidi text={t('hz.urgents', { n: urgents })} />
    </p>{/if}
  <a class="button primary" href={resolve('/hifz')} data-testid="seance-du-jour"
    >{t('hz.seance_du_jour')}</a
  >
  <ul class="liste" data-testid="fraicheur">
    {#each sourates as s (s.s)}
      <li class="card" data-sourate={s.s} data-niveau={s.niveau}>
        <div class="tete">
          <h2><Bidi text={`${suraName(s.s)} (${s.s})`} /></h2>
          <Pastille niveau={s.niveau} />
        </div>
        <p class="small">
          {#if s.dernier}<Bidi
              text={t('hz.derniere_revision', {
                d: fmtDate(s.dernier, { dateStyle: 'medium' }),
                n: s.jours ?? 0,
              })}
            />{:else}{t('hz.jamais_revise')}{/if}
        </p>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .liste {
    list-style: none;
    padding: 0;
    display: grid;
    gap: 8px;
  }
  .tete {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: 6px;
  }
  .tete h2 {
    font-size: 1.05rem;
    margin: 0;
  }
  .small {
    font-size: 0.9rem;
  }
  .warn {
    color: var(--warn-ink);
    font-weight: 700;
  }
  .button {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding: 0 16px;
    border-radius: 999px;
    text-decoration: none;
    font-weight: 700;
    margin: 6px 0 10px;
  }
</style>
