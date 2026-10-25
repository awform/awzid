<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { suraName } from '@awform/hifz';
  import Bidi from '$lib/Bidi.svelte';
  import { loadMeta, loadVerses } from '$lib/hifz';
  import { t } from '$lib/i18n';
  import { enregistrerErreurs, seance, terminer, total, type Compte, type Erreur } from './donnees';
  import Marquage from './Marquage.svelte';

  /**
   * Une séance de hifẓ en classe : le texte de la portion, le maître coche les erreurs mot par mot (enregistrées au fil de l'eau),
   * puis valide la portion ou la remet à reprendre (remarque facultative, lue par les parents). En mode « enregistrement » (adulte
   * consentant), le maître écoute d'abord la récitation envoyée ; en mode « direct », RIEN n'est enregistré : l'élève récite devant lui.
   */
  let { sid, fini }: { sid: string; fini: () => void } = $props();
  type Verse = { s: number; a: number; text: string };
  let verses = $state<Verse[]>([]);
  let basmala = $state('');
  let erreurs = $state<Erreur[]>([]);
  let mode = $state<'direct' | 'enregistrement'>('direct');
  let sura = $state(0);
  let de = $state(0);
  let a = $state(0);
  let rid = $state<string | null>(null);
  let statut = $state<'en_cours' | 'terminee'>('en_cours');
  let remarque = $state('');
  let etat = $state<'' | 'sauve' | 'erreur'>('');
  let bilan = $state<{ q: number; erreurs: Compte } | null>(null);
  let erreur = $state('');
  let minuterie: ReturnType<typeof setTimeout> | undefined;

  onMount(async () => {
    const r = await seance(sid);
    if (!r.ok || !r.data) return void (erreur = t('hc.erreur'));
    const s = r.data.seance;
    mode = s.mode;
    sura = s.sura;
    de = s.from;
    a = s.to;
    rid = s.recitationId;
    statut = s.status;
    erreurs = r.data.erreurs;
    remarque = s.remark ?? '';
    basmala = (await loadMeta().catch(() => null))?.basmala ?? '';
    verses = await loadVerses(s.sura, s.from, s.to);
  });
  onDestroy(() => clearTimeout(minuterie));

  /** enregistrement au fil de l'eau (la liste entière, après une courte pause) */
  function changer() {
    etat = '';
    clearTimeout(minuterie);
    minuterie = setTimeout(async () => {
      const r = await enregistrerErreurs(sid, erreurs);
      etat = r.ok ? 'sauve' : 'erreur';
    }, 500);
  }

  async function valider(issue: 'validee' | 'a_reprendre') {
    clearTimeout(minuterie);
    erreur = '';
    const e = await enregistrerErreurs(sid, erreurs);
    if (!e.ok) return void (erreur = t('hc.erreur'));
    const r = await terminer(sid, issue, remarque);
    if (!r.ok || !r.data) return void (erreur = t('hc.erreur'));
    bilan = { q: r.data.q, erreurs: r.data.erreurs };
    statut = 'terminee';
  }
  const portion = $derived(
    de === a ? `${suraName(sura)} ${sura}:${de}` : `${suraName(sura)} ${sura}:${de}-${a}`,
  );
</script>

<section class="card seance" data-testid="seance" data-mode={mode} data-statut={statut}>
  <h3><Bidi text={portion} /></h3>
  {#if mode === 'direct'}
    <p class="muted petit" data-testid="mode-direct"><Bidi text={t('hc.direct_aide')} /></p>
  {:else if rid}
    <p class="petit"><Bidi text={t('hc.ecouter_aide')} /></p>
    <audio
      controls
      preload="none"
      src={`/api/v1/ecole/recitations/${rid}/audio`}
      data-testid="audio-eleve"
    ></audio>
  {:else}
    <p class="muted petit"><Bidi text={t('hc.audio_efface')} /></p>
  {/if}

  <Marquage {verses} {basmala} bind:erreurs figee={statut === 'terminee'} onchange={changer} />

  {#if statut === 'en_cours'}
    <p class="petit muted" role="status" data-testid="etat-sauvegarde">
      <Bidi
        text={etat === 'sauve' ? t('hc.sauve') : etat === 'erreur' ? t('hc.sauve_erreur') : ''}
      />
    </p>
    <label
      >{t('hc.remarque')}
      <input maxlength="300" bind:value={remarque} data-testid="remarque" /></label
    >
    <div class="actions">
      <button type="button" class="primary" onclick={() => valider('validee')} data-testid="valider"
        >{t('hc.valider')}</button
      >
      <button type="button" onclick={() => valider('a_reprendre')} data-testid="a-reprendre"
        >{t('hc.a_reprendre')}</button
      >
    </div>
  {:else}
    <p class="ok" role="status" data-testid="seance-terminee">
      <Bidi text={bilan ? t('hc.bilan', { n: total(bilan.erreurs) }) : t('hc.deja_terminee')} />
    </p>
    <button type="button" class="primary" onclick={fini} data-testid="seance-fermer"
      >{t('hc.retour')}</button
    >
  {/if}
  {#if erreur}<p class="bad" role="alert"><Bidi text={erreur} /></p>{/if}
</section>

<style>
  .seance {
    display: grid;
    gap: 8px;
  }
  h3 {
    margin: 0;
    font-size: 1.05rem;
  }
  .petit {
    margin: 0;
    font-size: 0.9rem;
  }
  audio {
    width: 100%;
  }
  label {
    display: grid;
    gap: 4px;
  }
  input {
    font: inherit;
    min-height: 44px;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .actions button,
  .seance > button {
    min-height: 48px;
  }
  .ok {
    margin: 0;
    padding: 6px 10px;
    border-radius: 8px;
    background: var(--ok-bg);
    color: var(--ok-ink);
  }
  .bad {
    margin: 0;
    color: var(--bad-ink);
  }
</style>
