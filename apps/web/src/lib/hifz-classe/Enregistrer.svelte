<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { suraName } from '@awform/hifz';
  import Bidi from '$lib/Bidi.svelte';
  import { fmtDate, t } from '$lib/i18n';
  import { accord, etatEleve, supprimerEnregistrement, type EleveEtat } from './donnees';
  import { envoyerEnregistrement } from './envoi';

  /**
   * « M'enregistrer pour mon maître » — mode ENREGISTREMENT du hifẓ en classe, réservé aux ADULTES qui y consentent : l'adulte
   * s'enregistre, le maître écoute et annote plus tard. Rien n'est gardé sur l'appareil ; l'enregistrement est chiffré sur le
   * serveur, conservé au plus 30 jours (durée de la classe) puis SUPPRIMÉ AUTOMATIQUEMENT ; il se supprime à tout moment ; jamais
   * utilisé pour entraîner une IA. Le micro ne s'ouvre qu'au toucher du bouton.
   */
  let { profileId }: { profileId: string } = $props();
  const MAX_S = 300;
  let etat = $state<EleveEtat | null>(null);
  let classe = $state('');
  let sura = $state(112);
  let de = $state(1);
  let a = $state(4);
  let enCours = $state(false);
  let blob = $state<Blob | null>(null);
  let url = $state('');
  let secondes = $state(0);
  let message = $state('');
  let erreur = $state('');
  let recorder: MediaRecorder | null = null;
  let morceaux: Blob[] = [];
  let minuterie: ReturnType<typeof setInterval> | undefined;
  const supporte = typeof window !== 'undefined' && 'MediaRecorder' in window;

  async function recharger() {
    const r = await etatEleve(profileId);
    if (r.ok && r.data) {
      etat = r.data;
      classe ||= r.data.classes[0]?.id ?? '';
    }
  }
  onMount(recharger);
  onDestroy(() => {
    clearInterval(minuterie);
    recorder?.stream.getTracks().forEach((x) => x.stop());
    if (url) URL.revokeObjectURL(url);
  });

  const passage = $derived(de === a ? `${sura}:${de}` : `${sura}:${de}-${a}`);
  const jours = $derived(etat?.classes.find((c) => c.id === classe)?.jours ?? 14);

  async function consentir() {
    erreur = '';
    const r = await accord(profileId);
    if (r.ok) await recharger();
    else erreur = t('hc.erreur');
  }
  async function commencer() {
    erreur = '';
    message = '';
    try {
      const flux = await navigator.mediaDevices.getUserMedia({ audio: true });
      morceaux = [];
      recorder = new MediaRecorder(flux);
      recorder.ondataavailable = (e) => morceaux.push(e.data);
      recorder.onstop = () => {
        flux.getTracks().forEach((x) => x.stop());
        blob = new Blob(morceaux, { type: recorder?.mimeType });
        if (url) URL.revokeObjectURL(url);
        url = URL.createObjectURL(blob);
      };
      recorder.start();
      secondes = 0;
      enCours = true;
      minuterie = setInterval(() => {
        secondes++;
        if (secondes >= MAX_S) arreter();
      }, 1000);
    } catch {
      erreur = t('hc.micro_refuse');
    }
  }
  function arreter() {
    clearInterval(minuterie);
    recorder?.stop();
    enCours = false;
  }
  function jeter() {
    blob = null;
    if (url) URL.revokeObjectURL(url);
    url = '';
  }
  async function envoyer() {
    if (!blob || !classe) return;
    erreur = '';
    const r = await envoyerEnregistrement(profileId, classe, passage, blob, Math.max(1, secondes));
    if (!r.ok) {
      erreur = t(r.code === 'quota_stockage' ? 'hc.quota' : 'hc.erreur');
      return;
    }
    message = t('hc.envoye', { jours: r.jours ?? jours });
    jeter();
    await recharger();
  }
  async function supprimer(id: string) {
    const r = await supprimerEnregistrement(profileId, id);
    if (!r.ok) erreur = t('hc.erreur');
    await recharger();
  }
</script>

{#if etat && etat.adulte && etat.disponible && etat.classes.length}
  <section class="card" aria-labelledby="hc-enreg" data-testid="hc-eleve">
    <h2 id="hc-enreg">{t('hc.eleve_titre')}</h2>
    <p class="muted petit">
      <Bidi text={t('hc.eleve_garanties', { jours: etat.conservationMaxJours })} />
    </p>
    {#if !etat.accord}
      <p><Bidi text={t('hc.accord_texte')} /></p>
      <button type="button" class="primary" onclick={consentir} data-testid="hc-accord"
        >{t('hc.accord')}</button
      >
    {:else if !supporte}
      <p class="muted">{t('hc.indisponible')}</p>
    {:else}
      {#if etat.classes.length > 1}
        <label
          >{t('hc.classe')}
          <select bind:value={classe}>
            {#each etat.classes as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
          </select></label
        >
      {/if}
      <label
        >{t('hc.sourate')}
        <select bind:value={sura} data-testid="hc-e-sourate">
          {#each Array.from({ length: 114 }, (_, i) => i + 1) as s (s)}<option value={s}
              >{s} · {suraName(s)}</option
            >{/each}
        </select></label
      >
      <div class="ligne">
        <label>{t('hc.du_verset')} <input type="number" min="1" max="286" bind:value={de} /></label>
        <label>{t('hc.au_verset')} <input type="number" min="1" max="286" bind:value={a} /></label>
      </div>
      <div class="actions">
        {#if enCours}
          <button type="button" class="stop" onclick={arreter} data-testid="hc-stop"
            >{t('hc.arreter')} (<Bidi text={secondes} /> s)</button
          >
        {:else}
          <button type="button" onclick={commencer} data-testid="hc-start"
            >{t('hc.commencer_enreg')}</button
          >
        {/if}
      </div>
      {#if blob && url}
        <audio controls src={url} data-testid="hc-apercu"></audio>
        <p class="muted petit"><Bidi text={t('hc.sera_efface', { jours })} /></p>
        <div class="actions">
          <button type="button" class="primary" onclick={envoyer} data-testid="hc-envoyer"
            >{t('hc.envoyer')}</button
          >
          <button type="button" onclick={jeter}>{t('hc.recommencer')}</button>
        </div>
      {/if}
    {/if}
    {#if message}<p class="ok" role="status" data-testid="hc-envoye">
        <Bidi text={message} />
      </p>{/if}
    {#if erreur}<p class="bad" role="alert"><Bidi text={erreur} /></p>{/if}
    {#if etat.enregistrements.length}
      <h3>{t('hc.mes_enreg')}</h3>
      <ul class="liste" data-testid="hc-mes-enreg">
        {#each etat.enregistrements as r (r.id)}
          <li>
            <span><Bidi text={r.part} /> · {fmtDate(r.createdAt, { dateStyle: 'medium' })}</span>
            <small class="muted"
              ><Bidi
                text={t('hc.efface_le', { date: fmtDate(r.expiresAt, { dateStyle: 'medium' }) })}
              /></small
            >
            <button type="button" onclick={() => supprimer(r.id)} data-testid="hc-supprimer"
              >{t('hc.supprimer')}</button
            >
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{/if}

<style>
  section {
    display: grid;
    gap: 8px;
  }
  h2,
  h3 {
    margin: 0;
    font-size: 1.05rem;
  }
  label {
    display: grid;
    gap: 4px;
  }
  select,
  input {
    font: inherit;
    min-height: 44px;
  }
  .ligne,
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
  }
  button {
    min-height: 48px;
  }
  .stop {
    background: var(--bad-ink);
    color: var(--bad-bg);
    border-color: var(--bad-ink);
  }
  audio {
    width: 100%;
  }
  .liste {
    display: grid;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .petit {
    margin: 0;
    font-size: 0.9rem;
  }
  .ok {
    color: var(--ok-ink);
  }
  .bad {
    color: var(--bad-ink);
  }
</style>
