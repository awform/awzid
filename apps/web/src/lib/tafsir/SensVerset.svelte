<script lang="ts">
  import Ar from '$lib/Ar.svelte';
  import Bidi from '$lib/Bidi.svelte';
  import { suraName } from '@awform/hifz';
  import { localeInfo, t } from '$lib/i18n';
  import Feuille from '$lib/quran/lecture/Feuille.svelte';
  import {
    chargerSourate,
    type EtatSourate,
    type PointTafsir,
    type SourateTafsir,
  } from './donnees';

  /**
   * « Sens et explication » d'un verset (interrupteur `tafsir_sens`) : feuille du lecteur du Coran, ouverte par le petit menu du
   * verset. Montre, dans l'ordre : le verset (Tanzil, tel quel), son sens, le MOT À MOT (l'arabe du mot, puis son sens français),
   * une remarque éventuelle, le tafsīr abrégé qui couvre ce verset, puis la présentation de la sourate (repliée). Tout vient du
   * fichier de la sourate, chargée à la demande et DÉJÀ filtrée par le serveur : aucun segment réservé n'arrive jusqu'ici, et un
   * segment « niveau adulte » n'arrive qu'avec sa note de contexte, à un profil adulte. Le contenu est en FRANÇAIS (`lang="fr"`,
   * `dir="ltr"`, texte arabe isolé par `<Bidi>`), les titres suivent la langue de l'interface ; jamais de translittération ni de
   * synthèse vocale.
   */
  let {
    at = $bindable(null),
    profil,
  }: { at: { s: number; a: number } | null; profil?: string | null } = $props();

  let etat = $state<EtatSourate | 'charge'>('charge');
  let data = $state<SourateTafsir | null>(null);
  let jeton = 0;

  $effect(() => {
    const x = at;
    if (!x) return;
    const mien = ++jeton;
    etat = 'charge';
    data = null;
    void chargerSourate(x.s, profil).then((r) => {
      if (mien !== jeton) return;
      data = r.data;
      etat = r.etat;
    });
  });

  const numero = $derived(at?.a ?? 0);
  const verset = $derived(data ? (data.versets.find((v) => v.a === numero) ?? null) : null);
  const points = $derived(
    verset && data
      ? verset.p.flatMap((id) => data!.points.filter((p) => p.id === id))
      : ([] as PointTafsir[]),
  );
  const generaux = $derived(data ? data.points.filter((p) => p.plage.length === 0) : []);
  const titre = $derived(at ? t('tf.titre', { sourate: suraName(at.s), a: at.a }) : '');
  const nomSourate = $derived(at ? suraName(at.s) : '');
  const message = $derived(
    etat === 'hors_ligne'
      ? t('tf.hors_ligne')
      : etat === 'ferme'
        ? t('tf.ferme')
        : etat === 'indisponible' || (etat === 'ok' && !verset)
          ? t('tf.indisponible')
          : '',
  );
  const ui = $derived({ lang: localeInfo().code, dir: localeInfo().dir });
</script>

<Feuille
  id="sens"
  title={titre}
  bind:open={
    () => !!at,
    (v) => {
      if (!v) at = null;
    }
  }
  testid="sens-verset"
>
  <div class="sens">
    {#if etat === 'charge'}
      <p class="muet" data-testid="sens-charge">…</p>
    {:else if message}
      <p class="muet" role="status" lang={ui.lang} dir={ui.dir} data-testid="sens-message">
        <Bidi text={message} />
      </p>
    {:else if verset && data}
      <p class="ar" lang="ar" dir="rtl" data-testid="sens-texte"><Ar text={verset.ar} quran /></p>
      <section aria-labelledby="sens-h-sens">
        <h3 id="sens-h-sens">{t('tf.sens')}</h3>
        <p class="fr" lang="fr" dir="ltr" data-testid="sens-sens">
          <Bidi text={verset.sens} base="fr" />
        </p>
      </section>
      <section aria-labelledby="sens-h-mots">
        <h3 id="sens-h-mots">{t('tf.mot_a_mot')}</h3>
        <ul class="mots" dir="rtl" data-testid="sens-mots">
          {#each verset.mots as m, i (i)}
            <li data-testid="sens-mot">
              <span class="mot-ar" lang="ar" dir="rtl"><Ar text={m[0]} quran /></span>
              <span class="mot-fr" lang="fr" dir="ltr"><Bidi text={m[1]} base="fr" /></span>
            </li>
          {/each}
        </ul>
      </section>
      {#if verset.note}
        <section aria-labelledby="sens-h-note">
          <h3 id="sens-h-note">{t('tf.note')}</h3>
          <p class="fr" lang="fr" dir="ltr" data-testid="sens-note">
            <Bidi text={verset.note} base="fr" />
          </p>
        </section>
      {/if}
      {#if points.length}
        <section aria-labelledby="sens-h-tafsir" data-testid="sens-tafsir">
          <h3 id="sens-h-tafsir">{t('tf.explication')}</h3>
          {#each points as p (p.id)}
            {@render point(p)}
          {/each}
        </section>
      {/if}
      <details class="sourate" data-testid="sens-sourate">
        <summary><Bidi text={t('tf.sourate', { sourate: nomSourate })} /></summary>
        {#if data.sens_general}
          <p class="fr" lang="fr" dir="ltr"><Bidi text={data.sens_general} base="fr" /></p>
        {/if}
        {#if data.contexte}
          <p class="fr" lang="fr" dir="ltr"><Bidi text={data.contexte} base="fr" /></p>
        {/if}
        {#each generaux as p (p.id)}
          {@render point(p)}
        {/each}
        {#if data.traduction}
          <p class="fr credit" lang="fr" dir="ltr"><Bidi text={data.traduction} base="fr" /></p>
        {/if}
      </details>
      <p class="prudence" lang={ui.lang} dir={ui.dir} data-testid="sens-prudence">
        {t('tf.prudence')}
      </p>
    {/if}
  </div>
</Feuille>

{#snippet point(p: PointTafsir)}
  <article class="point" data-testid="sens-point">
    <h4 lang="fr" dir="ltr"><Bidi text={p.titre} base="fr" /></h4>
    <p class="fr" lang="fr" dir="ltr"><Bidi text={p.texte} base="fr" /></p>
    {#if p.note_contexte}
      <div class="contexte" data-testid="sens-contexte">
        <strong lang={ui.lang} dir={ui.dir}>{t('tf.contexte')}</strong>
        <p class="fr" lang="fr" dir="ltr"><Bidi text={p.note_contexte} base="fr" /></p>
      </div>
    {/if}
    {#if p.sources.length}
      <p class="sources" lang="fr" dir="ltr">
        <Bidi text={t('tf.sources', { liste: p.sources.join(' ; ') })} base="fr" />
      </p>
    {/if}
  </article>
{/snippet}

<style>
  .sens {
    display: grid;
    gap: 12px;
    padding-bottom: 8px;
  }
  .sens :global(p),
  .sens :global(h3),
  .sens :global(h4) {
    margin: 0;
  }
  h3 {
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--mp-green);
  }
  h4 {
    font-size: 0.95rem;
    color: var(--navy);
  }
  .ar {
    font: var(--ar-size) / 2 var(--font-quran);
    text-align: center;
  }
  .muet,
  .sources,
  .credit,
  .prudence {
    font-size: 0.85rem;
    color: var(--ink2);
  }
  .mots {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 6px 0 0;
    padding: 0;
    list-style: none;
  }
  .mots li {
    display: grid;
    gap: 2px;
    min-width: 64px;
    padding: 6px 10px;
    text-align: center;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 10px;
  }
  .mot-ar {
    font: var(--ar-size) / 1.6 var(--font-quran);
  }
  .mot-fr {
    font-size: 0.85rem;
    color: var(--ink2);
  }
  .fr {
    white-space: pre-line;
    line-height: 1.55;
  }
  .point {
    display: grid;
    gap: 6px;
    margin-top: 8px;
    padding: 8px 12px;
    border-inline-start: 4px solid var(--teal);
    background: var(--surface);
    border-radius: 10px;
  }
  .contexte {
    display: grid;
    gap: 2px;
    padding: 6px 10px;
    font-size: 0.9rem;
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 8px;
  }
  summary {
    display: flex;
    align-items: center;
    min-height: 44px;
    font-weight: 700;
    color: var(--navy);
    cursor: pointer;
  }
  details[open] {
    display: grid;
    gap: 8px;
  }
</style>
