<script lang="ts">
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import { suraName } from '@awform/hifz';
  import { demoProfileFor } from '$lib/attempts';
  import {
    parentAllowed,
    reciters as allReciters,
    setParentAllowed,
    setPreference,
    type Reciter,
  } from '$lib/coran-audio';
  import { fmtBytes, fmtDate, fmtNumber, t } from '$lib/i18n';
  import CoranTabs from '$lib/quran/CoranTabs.svelte';
  import { purgeReciters, removeSura, savedSuras, type SavedSura } from '$lib/quran/offline-audio';
  import { loadReciters } from '$lib/quran/reciters';
  import RiwayaBadge from '$lib/quran/RiwayaBadge.svelte';
  import { fetchMe, type Me, type ProfileInfo } from '$lib/session';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import Loading from '$lib/ui/Loading.svelte';
  import StatusMessage from '$lib/ui/StatusMessage.svelte';

  /**
   * Lot 27 — Mes récitateurs : riwāya, style, crédit et licence de chaque récitateur ; choix du récitateur
   * préféré (conseil aux débutants : Muḥammad Ayyūb, modifiable) ; sourates gardées sur l'appareil ;
   * pour le parent : liste des récitateurs permis à chaque enfant (code parent).
   */
  let profile = $state<ProfileInfo | null>(null);
  let me = $state<Me | null>(null);
  let loaded = $state(false);
  let error = $state<'erreur' | 'hors_ligne' | null>(null);
  let list = $state<Reciter[]>([]);
  let conseil = $state<string | null>(null);
  let restreint = $state(false);
  let chosen = $state<string | null>(null);
  let saved = $state<SavedSura[]>([]);
  let info = $state('');
  // contrôle parental
  let all = $state<Reciter[]>([]);
  let child = $state<string>('');
  let allowAll = $state(true);
  let allowed = $state<string[]>([]);
  let pin = $state('');
  let parentMsg = $state('');

  const children = $derived((me?.profiles ?? []).filter((p) => p.kind !== 'adulte'));

  onMount(async () => {
    profile = await demoProfileFor('').catch(() => null);
    me = await fetchMe();
    const c = await loadReciters(profile?.id ?? null, 'ecouter');
    list = c.list;
    conseil = c.conseil;
    restreint = c.restreint;
    chosen = c.initial;
    error = c.error;
    saved = await savedSuras();
    if (!error)
      await purgeReciters(
        (await allReciters()).data?.reciters.map((r) => r.id) ?? list.map((r) => r.id),
      );
    saved = await savedSuras();
    if (me?.account.kind === 'parent') {
      all = (await allReciters()).data?.reciters ?? [];
      if (children[0]) await pickChild(children[0].id);
    }
    loaded = true;
  });

  async function choose(id: string) {
    if (!profile) return;
    const r = await setPreference(profile.id, id);
    if (r.ok) {
      chosen = id;
      info = t('ca.choisi', { nom: list.find((x) => x.id === id)?.nameFr ?? id });
    }
  }
  async function drop(s: SavedSura) {
    await removeSura(s.reciter, s.sura);
    saved = await savedSuras();
  }
  async function pickChild(id: string) {
    child = id;
    parentMsg = '';
    const r = await parentAllowed(id);
    const l = r.ok ? (r.data?.parent ?? null) : null;
    allowAll = l === null;
    allowed = l ?? all.map((x) => x.id);
  }
  async function saveParent(e: SubmitEvent) {
    e.preventDefault();
    const r = await setParentAllowed(child, allowAll ? null : allowed, pin);
    parentMsg = r.ok ? t('ca.parent_enregistre') : t(`erreur.${r.code ?? 'reseau'}`);
    if (r.ok) pin = '';
  }
  const nameOf = (id: string) =>
    list.find((x) => x.id === id)?.nameFr ?? all.find((x) => x.id === id)?.nameFr ?? id;
</script>

<svelte:head><title>{t('app.nom')} — {t('ca.recitateurs_titre')}</title></svelte:head>

<h1>{t('ca.recitateurs_titre')}</h1>
<CoranTabs current="recitateurs" />

{#if !loaded}
  <Loading lines={4} />
{:else}
  {#if error}<StatusMessage kind={error} onretry={() => location.reload()} />{/if}
  {#if info}<p class="card ok" role="status">{info}</p>{/if}
  {#if restreint}<p class="warnbox" data-testid="liste-restreinte">
      {t('ca.restreint_texte')}
    </p>{/if}

  {#if !error && list.length === 0}
    <EmptyState
      icon="casque"
      title={t('ca.aucun_titre')}
      text={restreint ? t('ca.aucun_restreint') : t('ca.aucun_texte')}
    />
  {/if}

  <ul class="reciters">
    {#each list as r (r.id)}
      <li class="card rc" class:chosen={chosen === r.id} data-reciter={r.id}>
        <div class="head">
          <div>
            <h2>{r.nameFr}</h2>
            <p class="ar" lang="ar" dir="rtl">{r.nameAr}</p>
          </div>
          {#if profile}
            {#if chosen === r.id}<span class="pill" data-testid="choisi">{t('ca.mon_choix')}</span
              >{:else}<button type="button" onclick={() => choose(r.id)} data-testid="choisir"
                >{t('ca.choisir')}</button
              >{/if}
          {/if}
        </div>
        <p class="badges">
          <RiwayaBadge riwaya={r.riwaya} label={r.riwayaFr} />
          {#if r.id === conseil}<span class="pill" data-testid="conseil">{t('ca.conseil')}</span
            >{/if}
          {#if r.style}<span class="pill">{t(`ca.style_${r.style}`)}</span>{/if}
          {#if r.speed}<span class="pill">{t(`ca.vitesse_${r.speed}`)}</span>{/if}
          <span class="pill">{t('ca.versets', { n: r.verses })}</span>
        </p>
        <p class="muted small credit">{r.credit}</p>
        <details>
          <summary>{t('ca.licence_titre')}</summary>
          <p class="small">{r.license.text}</p>
          <p class="small muted">
            {t('ca.licence_archive', {
              source: r.license.source,
              date: fmtDate(r.license.archivedOn, { dateStyle: 'long' }),
            })}
            {#if r.license.url.startsWith('https://')}<a
                href={r.license.url}
                rel="noopener noreferrer external"
                target="_blank">{t('ca.licence_lien')}</a
              >{/if}
          </p>
        </details>
      </li>
    {/each}
  </ul>

  <section class="card" data-testid="sur-cet-appareil">
    <h2>{t('ca.appareil_titre')}</h2>
    {#if saved.length === 0}
      <p class="muted">{t('ca.appareil_vide')}</p>
      <a class="button" href={resolve('/coran/ecouter')}>{t('ca.onglet_ecouter')}</a>
    {:else}
      <p class="muted">
        {t('ca.appareil_total', { taille: fmtBytes(saved.reduce((s, x) => s + x.bytes, 0)) })}
      </p>
      <div class="table-wrap">
        <table aria-label={t('ca.appareil_titre')}>
          <thead
            ><tr
              ><th>{t('ca.recitateur')}</th><th>{t('lecteur.sourate')}</th><th
                >{t('horsligne.col_poids')}</th
              ><th></th></tr
            ></thead
          >
          <tbody>
            {#each saved as s (`${s.reciter}:${s.sura}`)}
              <tr data-saved={`${s.reciter}:${s.sura}`}>
                <td>{nameOf(s.reciter)}</td>
                <td>{fmtNumber(s.sura)}. {suraName(s.sura)}</td>
                <td>{fmtBytes(s.bytes)}</td>
                <td><button type="button" onclick={() => drop(s)}>{t('ca.supprimer')}</button></td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>

  {#if me?.account.kind === 'parent' && children.length && all.length}
    <section class="card" data-testid="controle-parent">
      <h2>{t('ca.parent_titre')}</h2>
      <p class="muted">{t('ca.parent_texte')}</p>
      <form onsubmit={saveParent} class="parent">
        <div class="field">
          <label for="enfant">{t('ca.parent_enfant')}</label>
          <select id="enfant" value={child} onchange={(e) => pickChild(e.currentTarget.value)}>
            {#each children as c (c.id)}<option value={c.id}>{c.pseudonym}</option>{/each}
          </select>
        </div>
        <label class="check"
          ><input type="checkbox" bind:checked={allowAll} data-testid="tous-permis" />{t(
            'ca.parent_tous',
          )}</label
        >
        {#if !allowAll}
          <fieldset>
            <legend>{t('ca.parent_liste')}</legend>
            {#each all as r (r.id)}
              <label class="check"
                ><input
                  type="checkbox"
                  value={r.id}
                  bind:group={allowed}
                  data-permis={r.id}
                />{r.nameFr} — {r.riwayaFr}</label
              >
            {/each}
          </fieldset>
        {/if}
        <div class="field">
          <label for="pin-coran">{t('profils.code_parent')}</label>
          <input
            id="pin-coran"
            type="password"
            inputmode="numeric"
            maxlength="4"
            pattern={'[0-9]{4}'}
            autocomplete="off"
            bind:value={pin}
            required
          />
        </div>
        <button type="submit" class="primary" data-testid="enregistrer-permis"
          >{t('commun.enregistrer')}</button
        >
        {#if parentMsg}<p role="status">{parentMsg}</p>{/if}
      </form>
    </section>
  {/if}
{/if}

<style>
  .reciters {
    list-style: none;
    padding: 0;
    display: grid;
    gap: var(--space-m);
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr));
  }
  .rc {
    margin: 0;
  }
  .rc.chosen {
    border: 2px solid var(--primary);
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--space-s);
  }
  .head h2 {
    margin: 0;
    font-size: 1.15rem;
  }
  .head .ar {
    margin: 0;
    font-size: 1.3rem;
    line-height: 1.6;
  }
  .badges {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .credit {
    margin: 0;
  }
  .parent {
    display: grid;
    gap: var(--space-s);
    max-width: 520px;
  }
  .field {
    display: grid;
    gap: 4px;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
  }
  .small {
    font-size: 0.9rem;
  }
</style>
