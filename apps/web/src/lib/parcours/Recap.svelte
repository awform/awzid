<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { t } from '$lib/i18n';
  import { call } from '$lib/session';
  import { recapitulatif, type Recap } from './parcours';

  /**
   * A39 — garde-fou pédagogique, dans TOUS les modes : avant d'ouvrir le niveau suivant, un récapitulatif
   * bienveillant ; s'il reste des erreurs non revues sur des notions, 2-3 notions recommandées (« Revoir
   * d'abord » / « Continuer quand même ») — jamais bloquant en mode serein. Ensuite : niveau suivant ouvert
   * (mode serein) ou défi / épreuve (autres modes).
   */
  let { pid, matiere, onopen }: { pid: string; matiere: 'arabe' | 'sciences'; onopen: () => void } =
    $props();
  let r = $state<Recap | null>(null);
  let error = $state('');
  onMount(async () => {
    const x = await recapitulatif(pid, matiere);
    if (x.ok) r = x.data;
    else error = t(`erreur.${x.code ?? 'reseau'}`);
  });
  async function go() {
    if (!r) return;
    if (r.mode !== 'serein') return goto(resolve('/epreuve-passage/[matiere]', { matiere }));
    const x = await call('POST', `/profiles/${pid}/niveau-suivant/${matiere}`, {
      continuerQuandMeme: r.recommandation,
    });
    if (x.ok) onopen();
    else error = t(`erreur.${x.code ?? 'reseau'}`);
  }
</script>

{#if r}
  <div data-testid="recapitulatif" data-fragiles={r.fragiles.length}>
    <h3>{t('ser.recap_titre')}</h3>
    <p><Bidi text={t('ser.recap_lecons', { n: r.lecons.faites, total: r.lecons.total })} /></p>
    {#if r.fragiles.length}
      <p>{t('ser.recap_revoir')}</p>
      <ul>
        {#each r.fragiles as f (f.unitId)}
          <li>
            <a href={resolve('/lecons/[id]', { id: f.unitId })} data-testid="notion-fragile"
              ><Bidi text={f.titleFr} /></a
            >
          </li>
        {/each}
      </ul>
    {:else}
      <p>{t('ser.recap_tout_bon')}</p>
    {/if}
    <p>
      {#if r.fragiles[0]}
        <a
          class="button primary"
          href={resolve('/lecons/[id]', { id: r.fragiles[0].unitId })}
          data-testid="revoir-dabord">{t('ser.revoir')}</a
        >
      {/if}
      <button
        type="button"
        class:primary={!r.fragiles.length}
        onclick={go}
        data-testid="continuer-quand-meme"
        >{t(r.fragiles.length ? 'ser.continuer_qm' : 'ser.continuer')}</button
      >
    </p>
  </div>
{/if}
{#if error}<p class="error" role="alert"><Bidi text={error} /></p>{/if}
