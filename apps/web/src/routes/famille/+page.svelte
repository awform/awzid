<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import { fmtDate, t } from '$lib/i18n';
  import { call, fetchMe, type Me, type ProfileInfo } from '$lib/session';
  import ModeProfil from '$lib/parcours/ModeProfil.svelte';

  /**
   * Lot F2 (revue E3, E4) — responsables d'un profil : parents (titulaire, second parent) et école ; invitation
   * du second parent, rattachement d'un enfant inscrit par son école (code remis par l'école), reprise du profil
   * par le jeune devenu grand (émancipation : tout son historique passe dans son propre compte).
   */
  interface Responsable {
    id: string;
    nature: 'parent' | 'ecole' | 'emancipation';
    status: 'invite' | 'actif';
    accountId: string | null;
    schoolName: string | null;
    email: string | null;
    moi: boolean;
    codeExpiresAt: string | null;
  }

  let me = $state<Me | null>(null);
  let loaded = $state(false);
  let resp: Record<string, { titulaire: boolean; responsables: Responsable[] }> = $state({});
  let msg = $state('');
  let error = $state('');
  let code = $state('');
  let password = $state('');
  let shown = $state<{ profileId: string; code: string; expire: string; kind: string } | null>(
    null,
  );
  let acting = $state<{ profileId: string; kind: 'second' | 'emancipation' } | null>(null);
  let actPassword = $state('');
  let reprise = $state('');

  const profiles = $derived<ProfileInfo[]>(me?.profiles ?? []);

  async function load() {
    me = await fetchMe();
    const out: typeof resp = {};
    for (const p of me?.profiles ?? []) {
      const r = await call<{ titulaire: boolean; responsables: Responsable[] }>(
        'GET',
        `/profiles/${p.id}/responsables`,
      );
      if (r.ok && r.data) out[p.id] = r.data;
    }
    resp = out;
    const d = await call<Demandes>('GET', '/famille/demandes');
    demandes = d.ok ? d.data : null;
    loaded = true;
  }

  // A27 (décisions D-F2 2 et 5) : demande d'autonomie du jeune, proposition de réinscription
  interface Demandes {
    emancipations: Array<{ profileId: string; pseudonyme: string; le: string }>;
    reinscriptions: Array<{ id: string; profileId: string; pseudonyme: string; className: string }>;
  }
  let demandes = $state<Demandes | null>(null);
  async function ask(profileId: string) {
    error = msg = '';
    const r = await call<{ deDroit: boolean; code?: string; expire?: string }>(
      'POST',
      `/profiles/${profileId}/emancipation/demande`,
      {},
    );
    if (!r.ok) return fail(r.code);
    if (r.data?.deDroit && r.data.code)
      shown = { profileId, code: r.data.code, expire: r.data.expire ?? '', kind: 'emancipation' };
    else msg = t('fam.demande_envoyee');
    await load();
  }
  async function refuse(profileId: string) {
    error = msg = '';
    const r = await call('DELETE', `/profiles/${profileId}/emancipation/demande`);
    if (!r.ok) return fail(r.code);
    await load();
  }
  async function reinscrire(id: string, accepter: boolean) {
    error = msg = '';
    const r = await call('POST', `/famille/reinscriptions/${id}`, { accepter });
    if (!r.ok) return fail(r.code);
    msg = t(accepter ? 'fam.reinscription_ok' : 'fam.reinscription_non');
    await load();
  }
  onMount(load);

  const fail = (c: string | null) => (error = t(`erreur.${c ?? 'reseau'}`));

  async function attach(e: SubmitEvent) {
    e.preventDefault();
    error = msg = '';
    const r = await call<{ profileId: string; titulaire: boolean }>('POST', '/profiles/rattacher', {
      code,
      password,
    });
    password = '';
    if (!r.ok) return fail(r.code);
    code = '';
    msg = t(r.data!.titulaire ? 'fam.rattache_titulaire' : 'fam.rattache_parent');
    await load();
  }

  async function act(e: SubmitEvent) {
    e.preventDefault();
    if (!acting) return;
    error = msg = '';
    const path =
      acting.kind === 'second'
        ? `/profiles/${acting.profileId}/second-parent`
        : `/profiles/${acting.profileId}/emancipation`;
    const r = await call<{ code: string; expire: string }>('POST', path, { password: actPassword });
    actPassword = '';
    if (!r.ok) return fail(r.code);
    shown = { profileId: acting.profileId, ...r.data!, kind: acting.kind };
    acting = null;
    await load();
  }

  async function end(profileId: string, accountId: string) {
    error = msg = '';
    const r = await call('DELETE', `/profiles/${profileId}/responsables/${accountId}`);
    if (!r.ok) return fail(r.code);
    msg = t('fam.fin_ok');
    await load();
  }

  async function claim(e: SubmitEvent) {
    e.preventDefault();
    error = msg = '';
    const r = await call<{ profileId: string }>('POST', '/account/reprendre-profil', {
      code: reprise,
    });
    if (!r.ok) return fail(r.code);
    reprise = '';
    msg = t('fam.reprise_ok');
    await load();
  }
</script>

<svelte:head><title>{t('app.nom')} — {t('fam.titre')}</title></svelte:head>

<h1>{t('fam.titre')}</h1>
{#if msg}<p class="card ok" role="status" data-testid="fam-message"><Bidi text={msg} /></p>{/if}
{#if error}<p class="card bad" role="alert" data-testid="fam-erreur"><Bidi text={error} /></p>{/if}

{#if loaded && !me}
  <p class="card">
    {t('ecole.connexion_requise')} <a href={resolve('/connexion')}>{t('entete.connexion')}</a>
  </p>
{:else if loaded && me}
  {#if shown}
    <section class="card code" data-testid="fam-code">
      <p>
        <Bidi text={t(shown.kind === 'second' ? 'fam.code_second' : 'fam.code_emancipation')} />
      </p>
      <p class="big"><strong><Bidi text={shown.code} /></strong></p>
      <p class="muted small">
        <Bidi text={t('fam.code_expire', { date: fmtDate(shown.expire, { dateStyle: 'long' }) })} />
      </p>
    </section>
  {/if}

  {#if demandes && (demandes.emancipations.length || demandes.reinscriptions.length)}
    <section class="card demandes" data-testid="fam-demandes">
      <h2>{t('fam.demandes')}</h2>
      <ul class="list">
        {#each demandes.reinscriptions as o (o.id)}
          <li data-reinscription={o.id}>
            <Bidi text={t('fam.reinscription', { eleve: o.pseudonyme, classe: o.className })} />
            <div class="row">
              <button
                type="button"
                class="primary"
                onclick={() => reinscrire(o.id, true)}
                data-testid="fam-reinscrire">{t('fam.reinscription_oui')}</button
              >
              <button type="button" onclick={() => reinscrire(o.id, false)}
                >{t('fam.reinscription_refus')}</button
              >
            </div>
          </li>
        {/each}
        {#each demandes.emancipations as d (d.profileId)}
          <li data-emancipation={d.profileId}>
            <Bidi text={t('fam.demande_jeune', { eleve: d.pseudonyme })} />
            <div class="row">
              <button
                type="button"
                class="primary"
                onclick={() => (acting = { profileId: d.profileId, kind: 'emancipation' })}
                data-testid="fam-valider-demande">{t('fam.valider')}</button
              >
              <button type="button" onclick={() => refuse(d.profileId)}>{t('fam.refuser')}</button>
            </div>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if me.account.kind === 'parent'}
    <section class="card">
      <h2>{t('fam.rattacher')}</h2>
      <p class="muted small">{t('fam.rattacher_aide')}</p>
      <form class="form" onsubmit={attach}>
        <label for="fcode">{t('fam.code')}</label>
        <input id="fcode" required maxlength="14" autocomplete="off" bind:value={code} dir="ltr" />
        <label for="fpw">{t('champ.mot_de_passe')}</label>
        <input
          id="fpw"
          type="password"
          required
          autocomplete="current-password"
          bind:value={password}
        />
        <button type="submit" class="primary" data-testid="fam-rattacher">{t('fam.valider')}</button
        >
      </form>
    </section>
  {/if}

  {#each profiles as p (p.id)}
    {@const r = resp[p.id]}
    <section class="card" data-testid="fam-profil-{p.pseudonym}">
      <h2><Bidi text={p.pseudonym} /></h2>
      {#if r}
        <ul class="list">
          {#each r.responsables.filter((x) => x.status === 'actif') as x (x.id)}
            <li>
              {#if x.nature === 'ecole'}
                <Bidi text={t('fam.resp_ecole', { ecole: x.schoolName ?? '' })} />
              {:else}
                <Bidi
                  text={x.moi ? t('fam.resp_moi') : t('fam.resp_parent', { email: x.email ?? '' })}
                />
                {#if x.accountId && ((r.titulaire && !x.moi) || (!r.titulaire && x.moi))}
                  <button
                    type="button"
                    class="small"
                    onclick={() => end(p.id, x.accountId!)}
                    data-testid="fam-fin-{p.pseudonym}"
                    ><Bidi text={x.moi ? t('fam.me_retirer') : t('fam.retirer')} /></button
                  >
                {/if}
              {/if}
            </li>
          {/each}
        </ul>
        {#if p.kind !== 'adulte' && me.account.kind === 'parent'}
          <!-- A39 : le parent choisit la façon d'avancer de son enfant (préférence de l'ado à valider) -->
          <ModeProfil pid={p.id} nom={p.pseudonym} />
        {/if}
        {#if r.titulaire && me.account.kind === 'parent'}
          <div class="row">
            {#if p.kind !== 'adulte'}
              <button
                type="button"
                onclick={() => (acting = { profileId: p.id, kind: 'second' })}
                data-testid="fam-second-{p.pseudonym}">{t('fam.inviter_second')}</button
              >
            {/if}
            {#if p.kind !== 'enfant'}
              <button
                type="button"
                onclick={() => (acting = { profileId: p.id, kind: 'emancipation' })}
                data-testid="fam-emancipation-{p.pseudonym}">{t('fam.emancipation')}</button
              >
            {/if}
          </div>
        {/if}
        {#if p.kind === 'ado' && me.account.kind === 'parent'}
          <!-- A27 (D-F2 2) : le jeune demande lui-même (validation du parent ; de droit à 18 ans) -->
          <p class="muted small">{t('fam.demande_aide')}</p>
          <button type="button" onclick={() => ask(p.id)} data-testid="fam-demande-{p.pseudonym}"
            >{t('fam.demander')}</button
          >
        {/if}
        {#if acting?.profileId === p.id}
          <form class="form" onsubmit={act}>
            <p class="muted small">
              <Bidi
                text={t(acting.kind === 'second' ? 'fam.second_aide' : 'fam.emancipation_aide')}
              />
            </p>
            <label for="apw-{p.id}">{t('champ.mot_de_passe')}</label>
            <input
              id="apw-{p.id}"
              type="password"
              required
              autocomplete="current-password"
              bind:value={actPassword}
            />
            <div class="row">
              <button type="submit" class="primary" data-testid="fam-confirmer"
                >{t('fam.valider')}</button
              >
              <button type="button" onclick={() => (acting = null)}>{t('commun.annuler')}</button>
            </div>
          </form>
        {/if}
      {/if}
    </section>
  {/each}

  {#if me.account.kind === 'adulte'}
    <section class="card">
      <h2>{t('fam.reprendre')}</h2>
      <p class="muted small">{t('fam.reprendre_aide')}</p>
      <form class="form" onsubmit={claim}>
        <label for="rcode">{t('fam.code')}</label>
        <input
          id="rcode"
          required
          maxlength="14"
          autocomplete="off"
          bind:value={reprise}
          dir="ltr"
        />
        <button type="submit" class="primary" data-testid="fam-reprendre">{t('fam.valider')}</button
        >
      </form>
    </section>
  {/if}
{/if}

<style>
  .form {
    display: grid;
    gap: 8px;
    max-width: 480px;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-block: 8px;
  }
  .list {
    list-style: none;
    padding: 0;
    display: grid;
    gap: 6px;
  }
  .list li {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  input {
    font: inherit;
    min-height: 44px;
    padding: 4px 8px;
    border: 2px solid var(--line);
    border-radius: 10px;
  }
  .big {
    font-size: 1.6rem;
    letter-spacing: 0.08em;
  }
  .ok {
    background: var(--ok-bg);
  }
  .bad {
    background: var(--bad-bg);
    color: var(--bad-ink);
  }
  .small {
    font-size: 0.9rem;
  }
</style>
