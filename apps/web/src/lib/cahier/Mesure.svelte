<script lang="ts">
  import { onDestroy } from 'svelte';
  import Bidi from '$lib/Bidi.svelte';
  import { fmtDate, t } from '$lib/i18n';
  import type { MinuteResultat } from './progres';
  import { parMinute } from './outils';

  /**
   * Cahier de lecture (20/10/2026) — mesure de la fluidité, gardée sur l'appareil :
   *  - « minute » : minute de lecture chronométrée (60 s), puis l'élève dit combien d'éléments il a lus justes ;
   *  - « chrono » : lecture chronométrée d'un texte (6e lecture), puis le nombre de mots mal lus → mots justes / minute ;
   *  - « lecture » : minute de texte (renvoi au dernier texte suivi) : les lectures chronométrées des textes.
   * Repères provisoires du cahier (minimum, objectif), à recalibrer sur la bêta.
   */
  let {
    mode,
    total,
    seuil,
    historique,
    onenregistrer,
  }: {
    mode: 'minute' | 'chrono' | 'lecture';
    total: number;
    seuil: { unite: string; minimum: number; objectif: number } | null;
    historique: MinuteResultat[];
    onenregistrer: (r: MinuteResultat) => void;
  } = $props();

  let etat = $state<'pret' | 'en_cours' | 'saisie'>('pret');
  let debut = 0;
  let ecoule = $state(0);
  let valeur = $state(0);
  let minuteur: ReturnType<typeof setInterval> | null = null;
  const reste = $derived(Math.max(0, 60 - ecoule));

  function demarrer() {
    debut = Date.now();
    ecoule = 0;
    etat = 'en_cours';
    minuteur = setInterval(() => {
      ecoule = Math.floor((Date.now() - debut) / 1000);
      if (mode === 'minute' && ecoule >= 60) finir();
    }, 250);
  }
  function finir() {
    if (minuteur) clearInterval(minuteur);
    minuteur = null;
    ecoule = mode === 'minute' ? 60 : Math.max(1, Math.round((Date.now() - debut) / 1000));
    valeur = 0;
    etat = 'saisie';
  }
  function enregistrer() {
    const justes = mode === 'chrono' ? Math.max(0, total - valeur) : valeur;
    onenregistrer({ date: new Date().toISOString(), justes, secondes: ecoule });
    etat = 'pret';
  }
  onDestroy(() => minuteur && clearInterval(minuteur));
  const score = (r: MinuteResultat) => parMinute(r.justes, r.secondes);
  const max = $derived(Math.max(total, 1));
  const derniers = $derived(historique.slice(-6));
  const echelle = $derived(Math.max(seuil?.objectif ?? 0, ...derniers.map(score), 1));
</script>

<div class="mesure" data-testid="mesure" data-mode={mode}>
  {#if mode !== 'lecture'}
    {#if etat === 'pret'}
      <button type="button" class="bouton plein" data-testid="mesure-demarrer" onclick={demarrer}
        >{mode === 'minute' ? t('cahier.minute_demarrer') : t('cahier.chrono_demarrer')}</button
      >
    {:else if etat === 'en_cours'}
      <p class="chrono" role="timer" aria-live="off">
        <Bidi
          text={mode === 'minute'
            ? t('cahier.minute_reste', { s: reste })
            : t('cahier.chrono_en_cours', { s: ecoule })}
        />
      </p>
      <button type="button" class="bouton plein" data-testid="mesure-finir" onclick={finir}
        >{t('cahier.chrono_arreter')}</button
      >
    {:else}
      <p role="status">
        <Bidi text={mode === 'minute' ? t('cahier.minute_fin') : t('cahier.chrono_erreurs')} />
      </p>
      <div class="pas">
        <button
          type="button"
          class="bouton"
          aria-label={t('cahier.moins')}
          onclick={() => (valeur = Math.max(0, valeur - 1))}>−</button
        >
        <input
          type="number"
          inputmode="numeric"
          min="0"
          {max}
          bind:value={valeur}
          aria-label={mode === 'minute' ? t('cahier.minute_fin') : t('cahier.chrono_erreurs')}
          data-testid="mesure-valeur"
        />
        <button
          type="button"
          class="bouton"
          aria-label={t('cahier.plus')}
          onclick={() => (valeur = Math.min(max, valeur + 1))}>+</button
        >
      </div>
      <button
        type="button"
        class="bouton plein"
        data-testid="mesure-enregistrer"
        onclick={enregistrer}>{t('cahier.enregistrer')}</button
      >
    {/if}
  {/if}
  {#if seuil}
    <p class="note">
      <Bidi
        text={t('cahier.reperes', { unite: seuil.unite, min: seuil.minimum, obj: seuil.objectif })}
      />
    </p>
  {/if}
  {#if derniers.length}
    <h3><Bidi text={t('cahier.historique')} /></h3>
    <ol class="historique" data-testid="mesure-historique">
      {#each derniers as r, i (i)}
        <li>
          <span class="barre" style:width={`${Math.round((score(r) / echelle) * 100)}%`}></span>
          <Bidi
            text={t('cahier.score', {
              n: mode === 'minute' ? `${r.justes}` : t('cahier.chrono_resultat', { mpm: score(r) }),
              date: fmtDate(r.date, { dateStyle: 'medium' }),
            })}
          />
        </li>
      {/each}
    </ol>
  {/if}
</div>

<style>
  .mesure {
    margin-top: 0.8rem;
    padding: 0.8rem 1rem;
    border: 1.5px dashed var(--cah-or, var(--line));
    border-radius: var(--radius-md, 14px);
    background: var(--cah-carte, var(--card));
  }
  .bouton {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 2.75rem;
    min-width: 2.75rem;
    padding: 0.4rem 1.1rem;
    border-radius: 999px;
    border: 1.5px solid var(--primary);
    background: transparent;
    color: var(--primary);
    font-weight: 700;
    cursor: pointer;
  }
  .bouton.plein {
    background: var(--primary);
    color: var(--on-primary, #fff);
  }
  .chrono {
    font: 700 1.6rem var(--font-title);
    color: var(--navy, var(--ink));
    margin: 0 0 0.5rem;
  }
  .pas {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0.4rem 0 0.6rem;
  }
  .pas input {
    width: 5rem;
    min-height: 2.75rem;
    font-size: 1.2rem;
    text-align: center;
    border: 1.5px solid var(--line);
    border-radius: 10px;
    background: var(--card);
    color: var(--ink);
  }
  .note {
    font-size: 0.85rem;
    color: var(--ink2);
  }
  h3 {
    font: 600 0.95rem var(--font-title);
    margin: 0.6rem 0 0.3rem;
  }
  .historique {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }
  .historique li {
    position: relative;
    padding: 0.25rem 0.5rem;
    font-size: 0.85rem;
    color: var(--ink);
  }
  .barre {
    position: absolute;
    inset: 0 auto 0 0;
    background: var(--primary-soft);
    border-radius: 6px;
    z-index: 0;
  }
  .historique li :global(*) {
    position: relative;
    z-index: 1;
  }
</style>
