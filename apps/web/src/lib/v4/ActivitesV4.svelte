<script lang="ts">
  import './v4.css';
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import Ar from '$lib/Ar.svelte';
  import Bidi from '$lib/Bidi.svelte';
  import AvisBouton from '$lib/avis/AvisBouton.svelte';
  import { demoProfileFor } from '$lib/attempts';
  import { dueWords, loadBoxes, loadDeck } from '$lib/cards';
  import { lienOuvert } from '$lib/enfant-session';
  import { localIso } from '$lib/hifz';
  import { t } from '$lib/i18n';
  import { ACTIFS, texteDuCursus } from '$lib/madjaliss/cycles';
  import { lien } from '$lib/madjaliss/liens';
  import { lireProgres, type Progres } from '$lib/madjaliss/progression';
  import EnTeteSection from './EnTeteSection.svelte';
  import Picto from './Picto.svelte';
  import { repriseMadjaliss, type RepriseMadjaliss } from './donnees';

  /**
   * Refonte 19/10 (maquette 07) — « Plus » devient « Mes activités » : Madjaliss en vedette (avec la reprise), puis
   * une grille de cartes vers les MÊMES destinations que l'ancien « Plus » ; aide, avis et liens juridiques (jamais
   * montrés à un enfant), puis le compte, rangés en bas, discrètement.
   */
  type Carte = { href: string; picto: string; titre: string; texte: string; or?: boolean };
  const CARTES: Carte[] = [
    { href: '/lectures', picto: 'lectures', titre: 'onglets.lectures', texte: 'v4.d_lectures' },
    { href: '/sciences', picto: 'sciences', titre: 'nav.sciences', texte: 'v4.d_sciences' },
    { href: '/ecriture', picto: 'plume', titre: 'trace.titre', texte: 'v4.d_ecriture' },
    {
      href: '/revisions',
      picto: 'cartes',
      titre: 'revisions.titre',
      texte: 'v4.d_revisions',
      or: true,
    },
    {
      href: '/hors-ligne',
      picto: 'hors-ligne',
      titre: 'entete.telechargements',
      texte: 'v4.d_hors_ligne',
    },
    { href: '/ma-classe', picto: 'classe', titre: 'parc.ma_classe', texte: 'v4.d_classe' },
    { href: '/suivi', picto: 'suivi', titre: 'onglets.suivi', texte: 'v4.d_suivi' },
    { href: '/suivi/rapport', picto: 'rapport', titre: 'rap.titre', texte: 'v4.d_rapport' },
  ];
  const AIDE: Array<{ href: string; titre: string; juridique?: boolean }> = [
    { href: '/garanties', titre: 'gar.titre', juridique: true },
    { href: '/legal/mentions', titre: 'pied.mentions', juridique: true },
    { href: '/legal/cgu', titre: 'pied.cgu', juridique: true },
    { href: '/legal/confidentialite', titre: 'pied.confidentialite', juridique: true },
    { href: '/legal/cookies', titre: 'pied.cookies', juridique: true },
  ];

  let due = $state(0);
  let madjlis = $state<RepriseMadjaliss | null>(null);

  onMount(async () => {
    const profile = await demoProfileFor('').catch(() => null);
    if (!profile) return;
    try {
      const deck = await loadDeck(profile);
      due = dueWords(deck.words, await loadBoxes(profile.id), localIso()).length;
    } catch {
      due = 0;
    }
    if (profile.kind !== 'enfant') {
      const p: Record<string, Progres> = {};
      for (const id of ACTIFS) p[id] = await lireProgres(profile.id, id);
      madjlis = repriseMadjaliss(p, [...ACTIFS]);
    }
  });
  const tx = $derived(madjlis ? texteDuCursus(madjlis.id) : null);
</script>

<div class="v4 act" data-testid="plus">
  <h1>{t('plus.titre')}</h1>

  <EnTeteSection titre={t('v4.activites')} />
  <div class="grille" data-testid="v4-activites">
    <a
      class="v4-carte v4-cadre carte vedette"
      href={resolve(
        '/madjaliss/[[texte]]/[[n]]',
        madjlis ? lien(madjlis.id, madjlis.seance ?? undefined) : {},
      )}
      data-plus="/madjaliss"
      ><span class="v4-picto grand"><Picto name="madjaliss" size={30} /></span><span class="txt"
        ><h3>{t('plus.madjaliss')}</h3>
        {#if madjlis && tx}<span class="mj-ar"><Ar text={tx.ar} block /></span><span class="petit"
            ><Bidi
              text={madjlis.seance !== null
                ? t('v4.mj_seance', { n: madjlis.seance })
                : t('v4.mj_faites', { n: madjlis.faites })}
            /></span
          >{:else}<span class="petit"><Bidi text={t('v4.d_madjaliss')} /></span>{/if}</span
      ><span class="chev-or"><Picto name="chevron" /></span></a
    >
    {#each CARTES.filter((c) => lienOuvert(c.href)) as c (c.href)}
      <a class="v4-carte carte" href={resolve(c.href as '/')} data-plus={c.href}
        ><span class="etoile" aria-hidden="true"><Picto name="etoile8" size={84} trait={1} /></span>
        {#if c.href === '/revisions' && due > 0}<span class="v4-badge" data-testid="v4-a-revoir"
            ><Bidi text={t('v4.a_revoir', { n: due })} /></span
          >{/if}
        <span class="v4-picto" class:or={c.or}><Picto name={c.picto} /></span>
        <span class="bas"
          ><h3><Bidi text={t(c.titre)} /></h3>
          <span class="petit doux"><Bidi text={t(c.texte)} /></span></span
        ></a
      >
    {/each}
  </div>

  <EnTeteSection titre={t('v4.aide')} discret />
  <ul class="v4-carte reglages">
    <li>
      <a href={resolve('/aide')} data-plus="/aide"
        ><Picto name="aide" /><span><Bidi text={t('aide.titre')} /></span><span class="v4-chev"
          ><Picto name="chevron" /></span
        ></a
      >
    </li>
    <AvisBouton mode="probleme" ligne /><AvisBouton ligne />
    {#each AIDE as x (x.href)}
      <li class="juridique">
        <a href={resolve(x.href as '/')} data-plus={x.href}
          ><Picto name="info" /><span><Bidi text={t(x.titre)} /></span><span class="v4-chev"
            ><Picto name="chevron" /></span
          ></a
        >
      </li>
    {/each}
  </ul>

  {#if lienOuvert('/compte')}
    <EnTeteSection titre={t('v4.compte')} discret />
    <ul class="v4-carte reglages">
      <li>
        <a href={resolve('/compte')} data-plus="/compte"
          ><Picto name="compte" /><span><Bidi text={t('entete.compte')} /></span><span
            class="v4-chev"><Picto name="chevron" /></span
          ></a
        >
      </li>
    </ul>
  {/if}
</div>

<style>
  .act h1 {
    font-size: 1.75rem;
    margin: 2px 2px 0;
  }
  .grille {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .carte {
    position: relative;
    overflow: hidden;
    min-height: 150px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 14px;
    padding: 16px;
  }
  .carte h3 {
    font-size: 1.02rem;
  }
  .bas {
    display: grid;
    gap: 2px;
  }
  .bas .petit {
    line-height: 1.35;
  }
  .etoile {
    position: absolute;
    inset-inline-end: -18px;
    top: -18px;
    color: var(--v4-or);
    opacity: 0.14;
  }
  .carte .v4-badge {
    position: absolute;
    inset-inline-end: 12px;
    top: 14px;
  }
  .vedette {
    grid-column: 1 / -1;
    min-height: 0;
    flex-direction: row;
    align-items: center;
    gap: 16px;
    border: 0;
    background: var(--v4-motif), linear-gradient(160deg, var(--v4-bandeau), var(--v4-bandeau-2));
    color: var(--v4-sur-bandeau-doux);
  }
  .vedette h3 {
    color: var(--v4-sur-bandeau);
    font-size: 1.2rem;
  }
  .vedette .txt {
    flex: 1;
    min-width: 0;
    display: grid;
    gap: 2px;
  }
  .grand {
    width: 60px;
    height: 60px;
    background: rgba(251, 247, 238, 0.12);
    color: var(--v4-or);
    border: 1.5px solid var(--v4-or);
  }
  .chev-or {
    color: var(--v4-or);
    flex: none;
  }
  :global(:root[dir='rtl']) .chev-or {
    transform: scaleX(-1);
  }
  .mj-ar :global(.ar) {
    display: block;
    font-family: var(--font-ar-titre);
    font-weight: 700;
    font-size: 1.3rem;
    line-height: 1.6;
    color: var(--v4-sur-bandeau);
  }
  .reglages {
    list-style: none;
    margin: 0;
    padding: 4px 0;
  }
  .reglages li {
    border-bottom: 1px solid var(--v4-bord);
  }
  .reglages li:last-child {
    border-bottom: 0;
  }
  .reglages a {
    display: flex;
    align-items: center;
    gap: 14px;
    min-height: 52px;
    padding: 0 16px;
    font: 700 0.95rem var(--font-ui);
    color: var(--v4-texte);
  }
  .reglages a > span:nth-child(2) {
    flex: 1;
  }
  .reglages a > :global(svg:first-child) {
    color: var(--v4-doux);
  }
  /* « Signaler un problème », « Donner mon avis » (AvisBouton) : même ligne que les liens */
  .reglages :global(li > button) {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 14px;
    width: 100%;
    min-height: 52px;
    padding: 0 16px;
    background: none;
    border: 0;
    font: 700 0.95rem var(--font-ui);
    color: var(--v4-texte);
    text-align: start;
    cursor: pointer;
  }
  .reglages :global(li > button .ic) {
    display: inline-flex;
    color: var(--v4-doux);
  }
  :global([data-public='enfant']) .juridique {
    display: none;
  }
</style>
