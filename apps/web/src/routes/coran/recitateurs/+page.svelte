<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
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
  import { purgeReciters, removeSura, savedSuras, type SavedSura } from '$lib/quran/offline-audio';
  import { loadReciters, nomRecitateur } from '$lib/quran/reciters';
  import RiwayaBadge from '$lib/quran/RiwayaBadge.svelte';
  import { fetchMe, type Me, type ProfileInfo } from '$lib/session';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { ecoutable, montre, reseau } from '$lib/reseau.svelte';
  import Loading from '$lib/ui/Loading.svelte';
  import StatusMessage from '$lib/ui/StatusMessage.svelte';

  /**
   * Lot 27 — Mes récitateurs : riwāya, style, crédit et licence de chaque récitateur ; choix du récitateur
   * préféré (conseil aux débutants : Muḥammad Ayyūb, modifiable) ; sourates gardées sur l'appareil ;
   * pour le parent : liste des récitateurs permis à chaque enfant (code parent).
   * A2 : récitateurs EN LIGNE (Quran Foundation) étiquetés « En ligne », désactivés hors connexion.
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
      const choisi = list.find((x) => x.id === id);
      info = t('ca.choisi', { nom: choisi ? nomRecitateur(choisi, list) : id });
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
  /** D2 : « Mes récitateurs » (mon choix, sourates gardées sur l'appareil) puis « Ajouter un récitateur » */
  const groupes = $derived.by(() => {
    const miens = new Set([chosen, ...saved.map((s) => s.reciter)]);
    const vus = list.filter(montre);
    return [
      { id: 'miens', titre: 'ca.recitateurs_titre', list: vus.filter((r) => miens.has(r.id)) },
      { id: 'ajouter', titre: 'ca.ajouter_recitateur', list: vus.filter((r) => !miens.has(r.id)) },
    ];
  });
  const nameOf = (id: string) =>
    list.find((x) => x.id === id)?.nameFr ?? all.find((x) => x.id === id)?.nameFr ?? id;
</script>

<svelte:head><title>{t('app.nom')} — {t('ca.recitateurs_titre')}</title></svelte:head>

<p class="retour">
  <a href={resolve('/coran/lecteur')} data-testid="retour-lecture">{t('cl.retour_lecture')}</a>
</p>
<h1>{t('ca.onglet_recitateurs')}</h1>

{#if !loaded}
  <Loading lines={4} />
{:else}
  {#if error}<StatusMessage kind={error} onretry={() => location.reload()} />{/if}
  {#if info}<p class="card ok" role="status"><Bidi text={info} /></p>{/if}
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

  {#each groupes as g (g.id)}{#if g.list.length}
      <h2 class="groupe" data-groupe={g.id}><Bidi text={t(g.titre)} /></h2>
      <ul class="reciters">
        {#each g.list as r (r.id)}{@render carte(r)}{/each}
      </ul>
    {/if}{/each}

  {#snippet carte(r: Reciter)}
    <li
      class="card rc"
      class:chosen={chosen === r.id}
      class:indispo={!ecoutable(r)}
      data-reciter={r.id}
      data-en-ligne={r.enLigne ? '1' : undefined}
    >
      <div class="head">
        <div>
          <h3><Bidi text={nomRecitateur(r, list)} /></h3>
          <p class="ar" lang="ar" dir="rtl"><Bidi text={r.nameAr} base="ar" /></p>
        </div>
        {#if profile}
          {#if chosen === r.id}<span class="pill" data-testid="choisi">{t('ca.mon_choix')}</span
            >{:else}<button
              type="button"
              onclick={() => choose(r.id)}
              disabled={!ecoutable(r)}
              data-testid="choisir">{t('ca.choisir')}</button
            >{/if}
        {/if}
      </div>
      <p class="badges">
        {#if r.enLigne}<span class="pill net" data-testid="en-ligne" title={t('ca.en_ligne_aide')}
            ><Icon name="reseau" size={16} /><Bidi text={t('ca.en_ligne')} /></span
          >{/if}
        <RiwayaBadge riwaya={r.riwaya} label={r.riwayaFr} />
        {#if r.id === conseil}<span class="pill" data-testid="conseil">{t('ca.conseil')}</span>{/if}
        {#if r.style}<span class="pill"><Bidi text={t(`ca.style_${r.style}`)} /></span>{/if}
        {#if r.speed}<span class="pill"><Bidi text={t(`ca.vitesse_${r.speed}`)} /></span>{/if}
        <span class="pill"><Bidi text={t('ca.versets', { n: r.verses })} /></span>
      </p>
      {#if r.enLigne}<p
          class="small credit"
          class:warn={!reseau.enLigne}
          data-testid={reseau.enLigne ? 'en-ligne-aide' : 'dispo-internet'}
        >
          <Bidi text={reseau.enLigne ? t('ca.en_ligne_aide') : t('ca.dispo_internet')} />
        </p>{/if}
      <!-- D2 : crédits, note d'usage et licence derrière ⓘ (nom écrit) -->
      <details class="credits">
        <summary><Icon name="info" size={18} />{t('ca.licence_titre')}</summary>
        <p class="muted small credit" data-testid="credit-recitateur"><Bidi text={r.credit} /></p>
        {#if r.creditAr}<p class="muted small credit" lang="ar" dir="rtl">
            <Bidi text={r.creditAr} base="ar" />
          </p>{/if}
        {#if r.usageNote}<p class="muted small credit" data-testid="usage-note">
            <Bidi text={r.usageNote} />
          </p>{/if}
        <p class="small"><Bidi text={r.license.text} /></p>
        <p class="small muted">
          <Bidi
            text={t('ca.licence_archive', {
              source: r.license.source,
              date: fmtDate(r.license.archivedOn, { dateStyle: 'long' }),
            })}
          />
          {#if r.license.url.startsWith('https://')}<a
              href={r.license.url}
              rel="noopener noreferrer external"
              target="_blank"><Bidi text={t(r.enLigne ? 'ca.site_qf' : 'ca.site_complexe')} /></a
            >{/if}
        </p>
      </details>
    </li>
  {/snippet}

  <section class="card" data-testid="sur-cet-appareil">
    <h2>{t('ca.appareil_titre')}</h2>
    {#if saved.length === 0}
      <p class="muted">{t('ca.appareil_vide')}</p>
      <a class="button" href={resolve('/coran/lecteur')}>{t('ca.onglet_ecouter')}</a>
    {:else}
      <p class="muted">
        <Bidi
          text={t('ca.appareil_total', {
            taille: fmtBytes(saved.reduce((s, x) => s + x.bytes, 0)),
          })}
        />
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
                <td><Bidi text={nameOf(s.reciter)} /></td>
                <td>{fmtNumber(s.sura)}. <Bidi text={suraName(s.sura)} /></td>
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
            {#each all.filter(montre) as r (r.id)}
              <label class="check"
                ><input type="checkbox" value={r.id} bind:group={allowed} data-permis={r.id} /><Bidi
                  text={r.enLigne ? t('ca.en_ligne_option', { nom: r.nameFr }) : r.nameFr}
                /> — <Bidi text={r.riwayaFr} /></label
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
        {#if parentMsg}<p role="status"><Bidi text={parentMsg} /></p>{/if}
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
  .net {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .warn {
    font-weight: 600;
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--space-s);
  }
  .head h3 {
    margin: 0;
    font-size: 1.15rem;
  }
  .groupe {
    margin: var(--space-l) 0 0;
    font-size: 1.15rem;
  }
  .rc {
    border-radius: 16px;
  }
  .rc.chosen {
    border-top: 3px solid var(--gold);
  }
  .credits summary {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--primary);
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
