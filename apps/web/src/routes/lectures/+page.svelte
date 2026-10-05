<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import Ar from '$lib/Ar.svelte';
  import { demoProfileFor } from '$lib/attempts';
  import {
    keepBooklet,
    keptBooklets,
    listBooklets,
    readBooklets,
    removeBooklet,
    type BookletSummary,
  } from '$lib/booklets';
  import { fmtBytes, t } from '$lib/i18n';
  import { getSettings } from '$lib/offline';
  import { accessFor, espace } from '$lib/parcours/parcours';
  import {
    audioSummary,
    downloadLevelAudio,
    hasLevelAudio,
    onWifi,
    removeLevelAudio,
    type AudioSummary,
  } from '$lib/lecons-audio-offline';

  /**
   * Bibliothèque des livrets gradués : un livret est proposé après la leçon où l'élève a vu ses mots
   * (« place »). Lecture à l'écran, livrets gardés sur l'appareil pour la lecture sans réseau.
   */
  let list: BookletSummary[] = $state([]);
  let offline = $state(false);
  let kept: string[] = $state([]);
  let read: string[] = $state([]);
  let level = $state('');
  let busy = $state('');
  let msg = $state('');
  let ready = $state(false);
  /** A27 : niveau courant d'arabe de l'élève — seuls ses livrets et ceux de ses anciens livres sont proposés */
  let current = $state<string | null>(null);
  const levels = $derived(
    [...new Set(list.map((b) => b.level))].filter((l) =>
      ['courant', 'revision', 'libre'].includes(accessFor(current, l)),
    ),
  );
  const shown = $derived(list.filter((b) => !level || b.level === level));
  /** audio des lectures (A3) : taille par livret, livrets gardés AVEC l'audio */
  let audioSum: AudioSummary[] = $state([]);
  let withAudio: string[] = $state([]);
  const audioOf = (code: string) => audioSum.find((a) => a.niveau === `lect-${code}`);
  async function refreshAudio(l: readonly BookletSummary[]) {
    const out: string[] = [];
    for (const b of l) if (await hasLevelAudio(`lect-${b.code}`)) out.push(b.code);
    withAudio = out;
  }
  async function toggleAudio(code: string) {
    busy = code;
    if (withAudio.includes(code)) await removeLevelAudio(`lect-${code}`);
    else if ((await getSettings()).audioWifi && onWifi() === false) msg = t('audio.pas_wifi');
    else
      await downloadLevelAudio(`lect-${code}`).catch(
        (e: Error) => (msg = t('horsligne.echec', { raison: e.message })),
      );
    await refreshAudio(list);
    busy = '';
  }

  onMount(async () => {
    const r = await listBooklets();
    const p = await demoProfileFor('');
    if (p) {
      const sp = await espace(p.id, 'arabe').catch(() => null);
      current = sp?.ok ? (sp.data?.courant?.code ?? null) : null;
    }
    const lv = current ?? p?.levelCode ?? (p?.kind === 'adulte' ? 'ad1' : 'en1');
    const codes = r.list.map((b) => b.level);
    kept = [...(await keptBooklets(r.list))];
    read = [...(await readBooklets())];
    level = codes.includes(lv) ? lv : (codes[0] ?? '');
    list = r.list;
    offline = r.offline;
    ready = true;
    await refreshAudio(r.list);
    if (!offline) audioSum = await audioSummary();
  });

  async function keepLevel() {
    busy = level;
    let n = 0;
    for (const b of shown) if (!kept.includes(b.code) && (await keepBooklet(b.code))) n++;
    kept = [...(await keptBooklets(list))];
    busy = '';
    msg = t('bib.gardes', { n });
  }
  async function toggleKeep(code: string) {
    busy = code;
    if (kept.includes(code)) {
      await removeBooklet(code);
      await removeLevelAudio(`lect-${code}`);
      await refreshAudio(list);
    } else await keepBooklet(code);
    kept = [...(await keptBooklets(list))];
    busy = '';
  }
</script>

<svelte:head><title>{t('app.nom')} — {t('onglets.lectures')}</title></svelte:head>

<h1>{t('lectures.titre')}</h1>
<p class="muted">{t('lectures.texte')}</p>
{#if offline}<p class="card">{t('bib.hors_ligne')}</p>{/if}
{#if msg}<p class="card ok" role="status"><Bidi text={msg} /></p>{/if}

<div class="row" role="group" aria-label={t('bib.niveau')}>
  {#each levels as l (l)}
    <button type="button" class:primary={level === l} onclick={() => (level = l)} data-niveau={l}
      ><Bidi text={t('bib.niveau_n', { code: l })} /></button
    >
  {/each}
</div>
{#if shown.length && !offline}
  <p>
    <button type="button" onclick={keepLevel} disabled={!!busy} data-testid="garder-niveau"
      >{t('bib.garder_niveau')}</button
    >
  </p>
{/if}

<ul class="books" data-testid="livrets" data-ready={ready}>
  {#each shown as b (b.code)}
    <li class="card book" data-livret={b.code}>
      <a href={resolve('/lectures/[code]', { code: b.code })}>
        <Ar text={b.titreAr ?? ''} tag="p" />
        <strong><Bidi text={b.titreFr} /></strong>
      </a>
      <p class="muted small"><Bidi text={b.resumeFr} /></p>
      <p class="small">
        <Bidi text={t('bib.pages', { n: b.pages ?? 0 })} />{#if b.placeFr}
          · <Bidi text={b.placeFr} />{/if}
        {#if read.includes(b.code)}
          · <span class="lu">{t('bib.lu')}</span>{/if}
        {#if kept.includes(b.code)}
          · <span class="kept" data-testid="garde">{t('bib.sur_appareil')}</span>{/if}
      </p>
      {#if !offline}
        <button type="button" class="small" disabled={!!busy} onclick={() => toggleKeep(b.code)}
          ><Bidi text={kept.includes(b.code) ? t('bib.retirer') : t('bib.garder')} /></button
        >
        {#if kept.includes(b.code) && audioOf(b.code)}
          <button
            type="button"
            class="small"
            data-testid="livret-audio"
            disabled={!!busy}
            onclick={() => toggleAudio(b.code)}
            ><Bidi
              text={withAudio.includes(b.code)
                ? `${t('audio.inclus')} · ${t('audio.retirer')}`
                : t('audio.ajouter', { poids: fmtBytes(audioOf(b.code)?.octets ?? 0) })}
            /></button
          >
        {/if}
      {/if}
    </li>
  {:else}
    <li class="muted">{t('bib.aucun')}</li>
  {/each}
</ul>

<style>
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .books {
    list-style: none;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 10px;
  }
  .book a {
    text-decoration: none;
    color: var(--ink);
    display: grid;
    gap: 2px;
  }
  .book :global(p.ar) {
    font-size: 1.5rem;
    margin: 0;
  }
  .lu {
    color: var(--ok-ink);
    font-weight: 700;
  }
  .kept {
    color: var(--teal);
  }
  .small {
    font-size: 0.9rem;
  }
  .ok {
    background: var(--ok-bg);
  }
</style>
