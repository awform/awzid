<script lang="ts">
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import { fmtDate, t } from '$lib/i18n';
  import { fetchMe, type Me } from '$lib/session';
  import { myAccess, redeem, type Acces } from '$lib/activation';

  /** Saisie du code imprimé dans le livre (lot 23) : le niveau s'ouvre en entier pour la durée du code. */
  let me = $state<Me | null>(null);
  let code = $state('');
  let acces = $state<Acces[]>([]);
  let info = $state('');
  let error = $state('');

  async function load() {
    const r = await myAccess();
    acces = r.ok && r.data ? r.data.acces : [];
  }
  onMount(async () => {
    me = await fetchMe();
    if (me) await load();
  });
  async function send(e: SubmitEvent) {
    e.preventDefault();
    error = info = '';
    const r = await redeem(code);
    if (!r.ok || !r.data) {
      error = t(`erreur.${r.code ?? 'reseau'}`);
      return;
    }
    info = t('act.ok', { niveau: r.data.niveau, date: fmtDate(r.data.jusquAu) });
    code = '';
    await load();
  }
</script>

<svelte:head><title>{t('app.nom')} — {t('act.titre')}</title></svelte:head>

<h1>{t('act.titre')}</h1>
{#if !me}
  <p>
    {t('profils.connexion_requise')} <a href={resolve('/connexion')}>{t('entete.connexion')}</a>
  </p>
{:else}
  <section class="card">
    <p>{t('act.aide')}</p>
    <form onsubmit={send}>
      <label for="code">{t('act.code')}</label>
      <input
        id="code"
        bind:value={code}
        autocomplete="off"
        autocapitalize="characters"
        spellcheck="false"
        maxlength="40"
        required
        data-testid="code-activation"
      />
      <button type="submit" class="primary" data-testid="activer">{t('act.activer')}</button>
    </form>
    {#if info}<p class="ok" role="status" data-testid="activation-ok">{info}</p>{/if}
    {#if error}<p class="bad" role="alert">{error}</p>{/if}
  </section>
  <section class="card">
    <h2>{t('act.mes_acces')}</h2>
    <ul class="list">
      {#each acces as a (a.niveau + a.fin)}
        <li>{t('act.acces', { niveau: a.niveau, date: fmtDate(a.fin) })}</li>
      {:else}<li class="muted">{t('act.aucun')}</li>{/each}
    </ul>
  </section>
{/if}
