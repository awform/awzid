<script lang="ts">
  import { resolve } from '$app/paths';
  import Bidi from '$lib/Bidi.svelte';
  import { SURA_NAMES } from '@awform/hifz';
  import { fmtNumber, t } from '$lib/i18n';
  import Icon from '$lib/ui/Icon.svelte';
  import { MADANI, SURA_AYAS, SURA_NAMES_AR } from './sura-names-ar';

  /**
   * D2 — liste des 114 sourates de l'accueil Coran : numéro dans l'étoile à 8 branches, nom arabe (Amiri, nom de la
   * source Tanzil), nom français (translittération), nombre de versets et, discret, mecquoise ou médinoise (Tanzil).
   * Recherche par nom (sans signes diacritiques) ou par numéro. Un toucher ouvre la sourate dans le lecteur.
   */
  let q = $state('');
  /** forme de comparaison d'un nom LATIN (jamais du texte coranique) : sans signes, apostrophes ni tirets */
  const DE = 'āáàâīîūûéèêḥṣḍṭẓḏṯ';
  const EN = 'aaaaiiuueeehsdtzdt';
  const plain = (x: string) =>
    [...x.toLowerCase()]
      .map((c) => EN[DE.indexOf(c)] ?? c)
      .join('')
      .replace(/[^a-z0-9]/g, '');
  const ALL = SURA_NAMES.map((nom, i) => ({ n: i + 1, nom, cle: plain(nom) }));
  const shown = $derived.by(() => {
    const k = plain(q);
    if (!k) return ALL;
    return ALL.filter((s) => (/^\d+$/.test(k) ? String(s.n).startsWith(k) : s.cle.includes(k)));
  });
  const lecteur = resolve('/coran/lecteur');
  const detail = (n: number) =>
    `${t('ca.versets', { n: SURA_AYAS[n - 1] ?? 0 })} · ${t(MADANI.has(n) ? 'cl.medinoise' : 'cl.mecquoise')}`;
</script>

<section class="sourates" aria-labelledby="sourates-titre" data-testid="liste-sourates">
  <h2 id="sourates-titre">{t('cl.sourates')}</h2>
  <label class="cherche">
    <Icon name="loupe" size={20} />
    <span class="sr">{t('cl.chercher_sourate')}</span>
    <input
      type="search"
      bind:value={q}
      placeholder={t('cl.chercher_sourate')}
      autocomplete="off"
      data-testid="chercher-sourate"
    />
  </label>
  <ol>
    {#each shown as s (s.n)}
      <li>
        <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- chemin résolu, suivi d'un paramètre -->
        <a href={`${lecteur}?s=${s.n}`} data-sourate={s.n}>
          <span class="num" aria-hidden="true"><span>{fmtNumber(s.n)}</span></span>
          <span class="txt">
            <strong><Bidi text={s.nom} /></strong>
            <small><Bidi text={detail(s.n)} /></small>
          </span>
          <span class="ar" lang="ar" dir="rtl"
            ><Bidi text={SURA_NAMES_AR[s.n - 1] ?? ''} base="ar" /></span
          >
        </a>
      </li>
    {:else}
      <li class="vide">{t('cl.aucune_sourate')}</li>
    {/each}
  </ol>
</section>

<style>
  .sourates h2 {
    font-size: 1.15rem;
    margin: var(--space-l, 24px) 0 8px;
  }
  .cherche {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 52px;
    padding: 0 14px;
    border: 2px solid var(--line);
    border-radius: 12px;
    background: var(--card);
    color: var(--ink2);
  }
  .cherche:focus-within {
    border-color: var(--primary);
  }
  .cherche input {
    flex: 1;
    min-width: 0;
    min-height: 48px;
    border: 0;
    background: transparent;
    color: var(--ink);
    font: inherit;
    outline: none;
  }
  ol {
    list-style: none;
    margin: 8px 0 0;
    padding: 0;
    border: 1px solid var(--line);
    border-radius: 16px;
    background: var(--card);
    overflow: hidden;
  }
  li + li {
    border-top: 1px solid var(--line);
  }
  a {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 64px;
    padding: 8px 14px;
    color: var(--ink);
    text-decoration: none;
  }
  a:hover {
    background: var(--primary-soft);
  }
  /* numéro dans l'étoile à 8 branches (deux carrés croisés, filet doré) */
  .num {
    position: relative;
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    flex: none;
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--teal);
  }
  .num::before,
  .num::after {
    content: '';
    position: absolute;
    inset: 6px;
    border: 1.5px solid var(--gold);
    border-radius: 3px;
  }
  .num::after {
    transform: rotate(45deg);
  }
  .num span {
    position: relative;
  }
  .txt {
    display: grid;
    flex: 1;
    min-width: 0;
  }
  .txt small {
    color: var(--ink2);
    font-size: 0.85rem;
  }
  .ar {
    font-family: var(--font-ar-titre);
    font-weight: 700;
    font-size: 1.45rem;
    line-height: 1.5;
    color: var(--primary);
  }
  .vide {
    padding: 16px;
    color: var(--ink2);
  }
</style>
