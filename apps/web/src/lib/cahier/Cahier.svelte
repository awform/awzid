<script lang="ts">
  import { onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import Bidi from '$lib/Bidi.svelte';
  import { demoProfileFor } from '$lib/attempts';
  import type { LevelAudio } from '$lib/lecons-audio';
  import { t } from '$lib/i18n';
  import {
    ecrireProgres,
    idPage,
    lireProgres,
    pageDuJour,
    pageFaite,
    progresVide,
    type ProgresCahier,
  } from './progres';
  import { chargerCahier, leconAtteinte, type Cahier, type Page } from './donnees';
  import { arreterSon, audioDuCahier } from './audio';
  import PageVue from './PageVue.svelte';
  import type { OuvrirCahierOptions } from '$lib/video/lecteur-cahier';

  /**
   * Cahier de lecture (20/10/2026) — sommaire (sans `?p`) ou une page. Hors ligne d'abord : le cahier, sa progression
   * (6 cases, bilans, minutes) et l'audio téléchargé du niveau sont lus sur l'appareil.
   */
  let {
    niveau,
    pageId,
    unite = null,
    ouvrirVideo = null,
  }: {
    niveau: string;
    pageId: string | null;
    unite?: string | null;
    /** ouvre la vidéo d'une page (absent : `video_v2` coupé, pas de bouton) */
    ouvrirVideo?: ((o: OuvrirCahierOptions) => Promise<void>) | null;
  } = $props();
  let cahier = $state<Cahier | null>(null);
  let nouveau = $state<Cahier | null>(null);
  let erreur = $state(false);
  let audio = $state<LevelAudio | null>(null);
  let profil = $state<string | null>(null);
  let progres = $state<ProgresCahier>(progresVide());
  let atteinte = $state<number | null>(null);

  async function charger() {
    erreur = false;
    const n = niveau;
    const [c, p] = await Promise.all([
      chargerCahier(n, (x) => (nouveau = x)),
      demoProfileFor(n).catch(() => null),
    ]);
    if (n !== niveau) return;
    if (!c) {
      erreur = true;
      return;
    }
    cahier = c;
    profil = p?.id ?? null;
    progres = await lireProgres(n, profil);
    // 25/10/2026 : enfants et ados ont aussi l'audio de leur cahier (`cahier-lecture-en1`…), réuni à celui du livre
    void audioDuCahier(n).then((a) => {
      if (n === niveau) audio = a;
    });
    if (profil)
      void fetch(`/api/v1/progress?profile=${profil}&level=${encodeURIComponent(n)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((b: { progress: Array<{ unitId: string; status: string }> } | null) => {
          if (b && n === niveau)
            atteinte = leconAtteinte(
              Object.fromEntries(b.progress.map((x) => [x.unitId, x.status])),
            );
        })
        .catch(() => {});
  }
  $effect(() => {
    void niveau;
    void charger();
  });
  // une autre page : le son en cours s'arrête, la page commence en haut
  $effect(() => {
    void pageId;
    arreterSon();
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
  });
  onDestroy(arreterSon);

  function sauver(p: ProgresCahier) {
    progres = p;
    void ecrireProgres(niveau, profil, p);
  }
  const page = $derived(cahier?.pages.find((p) => p.id === pageId) ?? null);
  const parcours = $derived(cahier?.pages.filter((p) => !p.hors) ?? []);
  const avenir = (p: Page) => atteinte != null && p.n > Math.max(atteinte, 0) && p.n > 0;
  /** page à continuer : la première du parcours qui n'est pas faite et dont la leçon est atteinte */
  const suite = $derived(
    parcours.find((p) => !pageFaite(progres, p.id) && !avenir(p)) ?? parcours[0] ?? null,
  );
  const parties = $derived.by(() => {
    const out: Array<{ nom: string; pages: Page[] }> = [];
    for (const p of parcours) {
      const d = out[out.length - 1];
      if (d && d.nom === p.partie) d.pages.push(p);
      else out.push({ nom: p.partie, pages: [p] });
    }
    return out;
  });
  const rattrapages = $derived(cahier?.pages.filter((p) => p.hors) ?? []);
  /** `?u=` d'une leçon qui a des pages ; une leçon sans page (Bilan 1 d'Ados 1, leçon 23 d'Adultes 1) ouvre le sommaire */
  const uniteAvecPages = $derived(
    !!unite && parcours.some((p) => `${niveau}.${p.apres}` === unite),
  );
  // `?u=ad1.l05` (lien de la leçon) : la page du jour de cette leçon, la première qui n'est pas encore faite
  $effect(() => {
    if (!cahier || pageId || !unite) return;
    const nums = parcours.filter((p) => `${niveau}.${p.apres}` === unite).map((p) => p.num);
    const n = pageDuJour(nums, progres);
    /* eslint-disable svelte/no-navigation-without-resolve -- chemin résolu, suivi du paramètre de page */
    if (n)
      void goto(`${resolve('/cahier/[niveau]', { niveau })}?p=${idPage(n)}`, {
        replaceState: true,
      });
    /* eslint-enable svelte/no-navigation-without-resolve */
  });
  const base = $derived(resolve('/cahier/[niveau]', { niveau }));
  const apres = (p: Page) =>
    p.n === 0 ? t('cahier.avant') : t('cahier.apres', { lecon: p.lecon ?? '' });
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -- chemin résolu (resolve), suivi du paramètre de page -->
<div class="cahier" data-testid="cahier">
  {#if nouveau}
    <p class="maj" role="status">
      <Bidi text={t('cahier.nouvelle_version')} />
      <button
        type="button"
        onclick={() => {
          cahier = nouveau;
          nouveau = null;
        }}>{t('cahier.mettre_a_jour')}</button
      >
    </p>
  {/if}
  {#if erreur}
    <section class="carte" role="alert">
      <p><Bidi text={t('cahier.erreur')} /></p>
      <button type="button" class="bouton" onclick={charger}>{t('cahier.reessayer')}</button>
    </section>
  {:else if !cahier}
    <p class="attente" aria-busy="true"><Bidi text={t('cahier.charge')} /></p>
  {:else if pageId && page}
    {#key page.id}
      <PageVue
        {page}
        {cahier}
        {audio}
        {profil}
        {progres}
        {sauver}
        {base}
        avenir={avenir(page)}
        {atteinte}
        {ouvrirVideo}
      />
    {/key}
  {:else if uniteAvecPages && !pageId}
    <p class="attente" aria-busy="true"><Bidi text={t('cahier.charge')} /></p>
  {:else}
    <p class="nav">
      <a href={resolve('/niveaux/[code]', { code: niveau })}>{t('cahier.retour')}</a>
    </p>
    <header class="bandeau">
      <p class="sur"><Bidi text={cahier.titre} /></p>
      <h1><Bidi text={t('cahier.sommaire')} /></h1>
    </header>
    <p class="intro"><Bidi text={t('cahier.intro')} /></p>
    {#if suite}
      <a class="bouton plein suite" data-testid="cahier-suite" href={`${base}?p=${suite.id}`}
        ><Bidi text={t('cahier.reprendre', { n: suite.num })} /> · <Bidi text={suite.titre} /></a
      >
    {/if}
    {#each parties as g, gi (gi)}
      <section class="partie">
        <h2><Bidi text={g.nom} /></h2>
        <ol>
          {#each g.pages as p (p.id)}
            <li>
              <a
                href={`${base}?p=${p.id}`}
                class="ligne"
                class:faite={pageFaite(progres, p.id)}
                class:avenir={avenir(p)}
                data-page={p.id}
              >
                <span class="num"><Bidi text={p.num} /></span>
                <span class="titre"><Bidi text={p.titre} /></span>
                <span class="etat"
                  >{#if pageFaite(progres, p.id)}<Bidi
                      text={t('cahier.faite')}
                    />{:else if avenir(p)}<Bidi
                      text={t('cahier.avenir', { lecon: p.lecon ?? '' })}
                    />{:else}<Bidi text={apres(p)} />{/if}</span
                >
              </a>
            </li>
          {/each}
        </ol>
      </section>
    {/each}
    {#if rattrapages.length}
      <section class="partie">
        <h2><Bidi text={t('cahier.rattrapage_titre')} /></h2>
        <ol>
          {#each rattrapages as p (p.id)}
            <li>
              <a
                href={`${base}?p=${p.id}`}
                class="ligne"
                class:faite={pageFaite(progres, p.id)}
                data-page={p.id}
              >
                <span class="num"><Bidi text={p.num} /></span>
                <span class="titre"><Bidi text={p.titre} /></span>
                <span class="etat"><Bidi text={apres(p)} /></span>
              </a>
            </li>
          {/each}
        </ol>
      </section>
    {/if}
  {/if}
</div>

<style>
  /* charte du prototype validé (vert, ivoire, or) sur les jetons du thème : clair et sombre suivent l'application ;
     lettre étudiée en rouge (couleur des lettres du livre), lettres muettes en gris (contraste AA, texte arabe large) */
  .cahier {
    --cah-cible: var(--c0);
    --cah-muet: var(--tj-muet);
    --cah-or: var(--or-line);
    --cah-carte: var(--card);
    --cah-papier: var(--paper);
    max-width: 52rem;
    margin: 0 auto;
  }
  .nav {
    margin: 0 0 0.5rem;
  }
  .nav a {
    display: inline-flex;
    align-items: center;
    min-height: 2.75rem;
    font-weight: 700;
  }
  .bandeau {
    position: relative;
    overflow: hidden;
    background: linear-gradient(160deg, var(--bande-1), var(--bande-2));
    color: var(--bande-texte);
    border-radius: var(--radius-lg, 20px);
    padding: 1.1rem 1.25rem 1rem;
    margin-bottom: 0.75rem;
  }
  .bandeau::after {
    content: '';
    position: absolute;
    inset: 0;
    background-image: var(--motif-etoile);
    pointer-events: none;
  }
  .bandeau .sur {
    margin: 0;
    font: 600 0.75rem/1.2 var(--font-title);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    opacity: 0.9;
  }
  .bandeau h1 {
    margin: 0.35rem 0 0;
    font: 600 1.4rem/1.25 var(--font-title);
    color: inherit;
  }
  .intro {
    color: var(--ink2);
  }
  .suite {
    display: flex;
    margin: 0.5rem 0 1rem;
  }
  .bouton {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    min-height: 2.75rem;
    padding: 0.4rem 1.1rem;
    border-radius: 999px;
    border: 1.5px solid var(--primary);
    background: transparent;
    color: var(--primary);
    font-weight: 700;
    text-decoration: none;
    cursor: pointer;
  }
  .bouton.plein {
    background: var(--primary);
    color: var(--on-primary);
  }
  .partie h2 {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    font: 600 1.05rem/1.3 var(--font-title);
    color: var(--navy, var(--ink));
    margin: 1.2rem 0 0.4rem;
  }
  .partie h2::after {
    content: '';
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, var(--cah-or), transparent);
  }
  ol {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .ligne {
    display: grid;
    grid-template-columns: 2.6rem 1fr;
    gap: 0 0.6rem;
    align-items: center;
    min-height: 3rem;
    padding: 0.45rem 0.75rem;
    margin: 0.35rem 0;
    background: var(--cah-carte);
    border: 1.5px solid var(--line);
    border-radius: var(--radius-md, 14px);
    color: var(--ink);
    text-decoration: none;
  }
  .ligne .num {
    grid-row: span 2;
    display: grid;
    place-items: center;
    width: 2.3rem;
    height: 2.3rem;
    border-radius: 999px;
    border: 1.5px solid var(--cah-or);
    font: 600 0.85rem var(--font-title);
    color: var(--navy, var(--ink));
  }
  .ligne .etat {
    font-size: 0.8rem;
    color: var(--ink2);
  }
  .ligne.faite {
    border-color: var(--primary);
    background: var(--primary-soft);
  }
  .ligne.faite .etat {
    color: var(--ok-ink);
    font-weight: 700;
  }
  .ligne.avenir {
    border-style: dashed;
  }
  .maj {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
    padding: 0.5rem 0.75rem;
    border-radius: var(--radius-md, 14px);
    background: var(--info-bg);
  }
  .maj button {
    min-height: 2.75rem;
  }
  .carte {
    padding: 1rem;
    border-radius: var(--radius-md, 14px);
    background: var(--cah-carte);
    border: 1px solid var(--line);
  }
</style>
