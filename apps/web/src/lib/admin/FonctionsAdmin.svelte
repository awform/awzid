<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n';
  import { call } from '$lib/session';

  /**
   * F5 — INTERRUPTEURS DE FONCTIONS (administrateur, second facteur) : état de base de chaque fonction (ouverte,
   * coupée, canal bêta seulement) et exceptions par rôle, âge, pays, école ou canal. Effet en moins d'une minute,
   * sans redéploiement. Canal bêta : comptes (par e-mail) et écoles.
   */
  interface Regle {
    id: string;
    effet: 'on' | 'off';
    role: string | null;
    age: string | null;
    pays: string | null;
    ecoleId: string | null;
    canal: string | null;
  }
  interface Fonction {
    cle: string;
    defaut: 'on' | 'off' | 'beta';
    etat: 'on' | 'off' | 'beta' | null;
    regles: Regle[];
  }
  interface Data {
    fonctions: Fonction[];
    roles: string[];
    ages: string[];
    ecoles: Array<{ id: string; nom: string; beta: boolean }>;
    beta: { comptes: number; profils: number };
  }
  let data = $state<Data | null>(null);
  let msg = $state('');
  let err = $state('');
  let ouverte = $state('');
  let f = $state({ effet: 'off', role: '', age: '', pays: '', ecoleId: '', canal: '' });
  let email = $state('');

  async function load() {
    const r = await call<Data>('GET', '/admin/fonctions');
    data = r.ok ? r.data : null;
  }
  onMount(load);

  const fait = async (r: { ok: boolean; code: string | null }) => {
    msg = r.ok ? t('fn.enregistre') : '';
    err = r.ok ? '' : t(`erreur.${r.code ?? 'reseau'}`);
    await load();
  };
  const setEtat = async (cle: string, etat: string) =>
    fait(await call('PUT', `/admin/fonctions/${cle}`, { etat }));
  async function ajouter(e: SubmitEvent, cle: string) {
    e.preventDefault();
    await fait(await call('POST', `/admin/fonctions/${cle}/regles`, f));
    f = { effet: 'off', role: '', age: '', pays: '', ecoleId: '', canal: '' };
  }
  const retirer = async (id: string) => fait(await call('DELETE', `/admin/fonctions/regles/${id}`));
  const betaCompte = async (beta: boolean) =>
    fait(await call('PUT', '/admin/beta', { type: 'compte', email, beta }));
  const betaEcole = async (id: string, beta: boolean) =>
    fait(await call('PUT', '/admin/beta', { type: 'ecole', id, beta }));

  const ecoleNom = (id: string | null) => data?.ecoles.find((e) => e.id === id)?.nom ?? id ?? '';
  function decrire(r: Regle): string {
    const parts = [t(r.effet === 'on' ? 'fn.effet_on' : 'fn.effet_off')];
    if (r.role) parts.push(`${t('fn.critere_role')} : ${t(`fn.role.${r.role}`)}`);
    if (r.age) parts.push(`${t('fn.critere_age')} : ${t(`fn.age.${r.age}`)}`);
    if (r.pays) parts.push(`${t('fn.critere_pays')} : ${r.pays}`);
    if (r.ecoleId) parts.push(`${t('fn.critere_ecole')} : ${ecoleNom(r.ecoleId)}`);
    if (r.canal) parts.push(`${t('fn.critere_canal')} : ${t(`fn.canal.${r.canal}`)}`);
    return parts.join(' · ');
  }
</script>

<section class="card" data-testid="admin-fonctions">
  <h2 id="t-fonctions">{t('fn.admin_titre')}</h2>
  <p class="muted">{t('fn.admin_aide')}</p>
  {#if msg}<p role="status"><Bidi text={msg} /></p>{/if}
  {#if err}<p class="error" role="alert"><Bidi text={err} /></p>{/if}
  {#if data}
    <div class="table-wrap">
      <table aria-labelledby="t-fonctions">
        <thead
          ><tr><th>{t('fn.fonction')}</th><th>{t('fn.etat')}</th><th>{t('fn.regles')}</th></tr
          ></thead
        >
        <tbody>
          {#each data.fonctions as fx (fx.cle)}
            <tr data-fonction={fx.cle}>
              <th><Bidi text={t(`fn.${fx.cle}`)} /></th>
              <td>
                <select
                  aria-label={t('fn.etat_de', { nom: t(`fn.${fx.cle}`) })}
                  value={fx.etat ?? fx.defaut}
                  onchange={(e) => setEtat(fx.cle, (e.currentTarget as HTMLSelectElement).value)}
                  data-testid="fn-etat"
                >
                  {#each ['on', 'off', 'beta'] as s (s)}<option value={s}
                      >{t(`fn.etat_${s}`)}</option
                    >{/each}
                </select>
                {#if fx.etat === null}<span class="muted">{t('fn.par_defaut')}</span>{/if}
              </td>
              <td>
                <ul class="stack">
                  {#each fx.regles as r (r.id)}
                    <li>
                      <Bidi text={decrire(r)} />
                      <button type="button" class="ghost" onclick={() => retirer(r.id)}
                        >{t('fn.retirer')}</button
                      >
                    </li>
                  {/each}
                </ul>
                {#if ouverte === fx.cle}
                  <form onsubmit={(e) => ajouter(e, fx.cle)} data-testid="fn-regle-form">
                    <label
                      >{t('fn.effet')}
                      <select bind:value={f.effet} data-testid="fn-effet">
                        <option value="off">{t('fn.effet_off')}</option>
                        <option value="on">{t('fn.effet_on')}</option>
                      </select></label
                    >
                    <label
                      >{t('fn.critere_role')}
                      <select bind:value={f.role} data-testid="fn-role">
                        <option value="">{t('fn.tous')}</option>
                        {#each data.roles as r (r)}<option value={r}>{t(`fn.role.${r}`)}</option
                          >{/each}
                      </select></label
                    >
                    <label
                      >{t('fn.critere_age')}
                      <select bind:value={f.age} data-testid="fn-age">
                        <option value="">{t('fn.tous')}</option>
                        {#each data.ages as a (a)}<option value={a}>{t(`fn.age.${a}`)}</option
                          >{/each}
                      </select></label
                    >
                    <label
                      >{t('fn.critere_pays')}
                      <input bind:value={f.pays} maxlength="2" size="3" /></label
                    >
                    <label
                      >{t('fn.critere_ecole')}
                      <select bind:value={f.ecoleId}>
                        <option value="">{t('fn.tous')}</option>
                        {#each data.ecoles as e (e.id)}<option value={e.id}>{e.nom}</option>{/each}
                      </select></label
                    >
                    <label
                      >{t('fn.critere_canal')}
                      <select bind:value={f.canal}>
                        <option value="">{t('fn.tous')}</option>
                        <option value="beta">{t('fn.canal.beta')}</option>
                        <option value="production">{t('fn.canal.production')}</option>
                      </select></label
                    >
                    <button type="submit" class="primary" data-testid="fn-regle-ajouter"
                      >{t('fn.ajouter_regle')}</button
                    >
                  </form>
                {:else}
                  <button
                    type="button"
                    onclick={() => (ouverte = fx.cle)}
                    data-testid="fn-regle-ouvrir">{t('fn.nouvelle_regle')}</button
                  >
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <h3>{t('beta.titre')}</h3>
    <p class="muted">
      {t('beta.aide')}
      <Bidi text={t('beta.compte_n', { n: data.beta.comptes, p: data.beta.profils })} />
    </p>
    <form
      onsubmit={(e) => {
        e.preventDefault();
        void betaCompte(true);
      }}
    >
      <label for="beta-email">{t('beta.email')}</label>
      <input id="beta-email" type="email" bind:value={email} required data-testid="beta-email" />
      <button type="submit" class="primary" data-testid="beta-ajouter">{t('beta.ajouter')}</button>
      <button type="button" onclick={() => betaCompte(false)}>{t('beta.retirer')}</button>
    </form>
    <ul class="stack">
      {#each data.ecoles as e (e.id)}
        <li>
          <label
            ><input
              type="checkbox"
              checked={e.beta}
              onchange={(ev) => betaEcole(e.id, (ev.currentTarget as HTMLInputElement).checked)}
            />
            <Bidi text={e.nom} /></label
          >
        </li>
      {/each}
    </ul>
  {/if}
</section>
