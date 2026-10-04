<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n';
  import { loadCas, sendCas, type CasVu } from '$lib/pratique';

  /**
   * Cas pratique non résolu (ra*) pour un ADULTE qui apprend seul : il écrit d'abord sa réponse, puis voit la
   * réponse proposée par le livre. Élève d'une classe : l'enseignant la donne (le serveur refuse).
   */
  let { profileId, unitId, casRef }: { profileId: string; unitId: string; casRef: string } =
    $props();
  let vu = $state<CasVu | null>(null);
  let texte = $state('');
  let ferme = $state(false);
  let error = $state('');
  const MIN = 10;

  onMount(async () => {
    const r = await loadCas(profileId, unitId, casRef);
    if (r.ok && r.data) vu = r.data;
    else if (r.code === 'reponse_par_enseignant' || r.code === 'introuvable') ferme = true;
  });

  async function voir(e: SubmitEvent) {
    e.preventDefault();
    error = '';
    const r = await sendCas(profileId, unitId, casRef, texte);
    if (r.ok && r.data) vu = r.data;
    else if (r.code === 'reponse_par_enseignant') ferme = true;
    else error = t(`erreur.${r.code ?? 'reseau'}`);
  }
</script>

{#if vu}
  <div class="cas-vu" data-testid="cas-reponse">
    <p><b>{t('cas.ma_reponse')}</b> <Bidi text={vu.texte} /></p>
    <p><b>{t('cas.proposee')}</b> <Bidi text={vu.reponse} /></p>
  </div>
{:else if ferme}
  <p class="muted small" data-testid="cas-enseignant">{t('cas.par_enseignant')}</p>
{:else}
  <form onsubmit={voir} data-testid="cas-form">
    <label for={`cas-${casRef}`}>{t('cas.ma_reponse')}</label>
    <textarea id={`cas-${casRef}`} bind:value={texte} maxlength="2000" data-testid="cas-texte"
    ></textarea>
    <button
      type="submit"
      class="primary"
      disabled={texte.trim().length < MIN}
      data-testid="cas-voir">{t('cas.voir')}</button
    >
    <p class="muted small">{t('cas.ecrire_dabord')}</p>
    {#if error}<p class="bad" role="alert"><Bidi text={error} /></p>{/if}
  </form>
{/if}

<style>
  textarea {
    width: 100%;
    min-height: 5rem;
  }
  .small {
    font-size: 0.9rem;
  }
</style>
