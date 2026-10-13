<script lang="ts">
  import { resolve } from '$app/paths';
  import { onMount } from 'svelte';
  import Bidi from '$lib/Bidi.svelte';
  import { demoProfileFor } from '$lib/attempts';
  import { fmtDate, t } from '$lib/i18n';
  import type { ProfileInfo } from '$lib/session';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import EnTete from '$lib/ui/EnTete.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Loading from '$lib/ui/Loading.svelte';
  import { ACTIFS, texteDuCursus } from './cycles';
  import { chargerMatn, matnPour, type Matn } from './donnees';
  import { lien } from './liens';
  import {
    fusionnerServeur,
    lireProgres,
    seanceEnCours,
    toutFait,
    type Progres,
  } from './progression';

  /**
   * Madjaliss — sommaire d'un texte : ses séances (titre, durée), la progression (✓ faite, séance en cours) et
   * l'action principale « Reprendre ». Quand toutes les séances sont faites : l'ATTESTATION D'ÉTUDE (jamais une
   * ijāza), avec la mention « contenu en cours de relecture savante ».
   */
  let { id }: { id: string } = $props();
  const cursus = $derived(texteDuCursus(id));
  let matn = $state<Matn | null>(null);
  let profil = $state<ProfileInfo | null>(null);
  let progres = $state<Progres>({ faites: [], ouverte: null });
  let etat = $state<'charge' | 'pret' | 'absent'>('charge');

  // le texte tel que le voit ce profil : ni règles et lochies aux enfants, ni passages « adulte » aux enfants et ados
  const vue = $derived(matn ? matnPour(matn, profil?.kind ?? null) : null);
  const seances = $derived(vue?.seances ?? []);
  const numeros = $derived(seances.map((s) => s.n));
  const enCours = $derived(seanceEnCours(progres, numeros));
  // les séances facultatives ne comptent pas pour l'attestation d'étude
  const fini = $derived(
    toutFait(
      progres,
      seances.filter((s) => !s.facultatif).map((s) => s.n),
    ),
  );
  const faites = $derived(new Set(progres.faites));
  const nomTexte = $derived(cursus ? t(`mj.t_${cursus.id.replace('-', '_')}`) : id);

  onMount(async () => {
    if (!ACTIFS.has(id)) {
      etat = 'absent';
      return;
    }
    profil = await demoProfileFor('').catch(() => null);
    const pid = profil?.id ?? null;
    progres = await lireProgres(pid, id);
    matn = await chargerMatn(id);
    etat = matn ? 'pret' : 'absent';
    progres = await fusionnerServeur(pid, id).catch(() => progres);
  });
</script>

{#if cursus}<EnTete titre={nomTexte} ar={cursus.ar} teinte={2} />{/if}
<p>
  <a href={resolve('/madjaliss/[[texte]]/[[n]]', lien())}><Bidi text={t('mj.retour_liste')} /></a>
</p>

{#if etat === 'charge'}
  <Loading />
{:else if etat === 'absent'}
  <EmptyState title={t(ACTIFS.has(id) ? 'mj.horsligne' : 'mj.introuvable')} />
{:else if matn}
  <section class="carte-reprendre" data-testid="mj-progres">
    <p class="compte">
      <Bidi
        text={t('mj.progres', {
          faites: progres.faites.filter((n) => numeros.includes(n)).length,
          total: numeros.length,
        })}
      />
    </p>
    <!-- barre propre à la rubrique (le composant Progress partagé partirait dans le morceau commun préchargé) -->
    <progress
      class="barre"
      value={progres.faites.filter((n) => numeros.includes(n)).length}
      max={numeros.length}
      aria-label={t('mj.progres_label')}
    ></progress>
    {#if enCours !== null}
      <a
        class="button dore"
        data-testid="mj-reprendre"
        href={resolve('/madjaliss/[[texte]]/[[n]]', lien(id, enCours))}
        ><Icon name="lecture" /><Bidi
          text={progres.faites.length || progres.ouverte
            ? t('mj.reprendre', { n: enCours })
            : t('mj.commencer', { n: enCours })}
        /></a
      >
    {/if}
  </section>

  {#if fini}
    <section class="attestation" data-testid="mj-attestation" aria-labelledby="att-titre">
      <p class="titre-ar" lang="ar" dir="rtl">
        <Bidi text={cursus?.ar ?? matn.oeuvre} base="ar" />
      </p>
      <h2 id="att-titre"><Bidi text={t('mj.attestation')} /></h2>
      <p>
        <Bidi
          text={t('mj.attestation_texte', {
            nom: profil?.pseudonym ?? t('mj.attestation_eleve'),
            n: numeros.length,
            texte: nomTexte,
          })}
        />
      </p>
      {#if progres.fini}<p>
          <Bidi
            text={t('mj.attestation_date', { date: fmtDate(progres.fini, { dateStyle: 'long' }) })}
          />
        </p>{/if}
      <p class="relu"><strong><Bidi text={t('mj.attestation_relecture')} /></strong></p>
      <p class="muted"><Bidi text={t('mj.attestation_note')} /></p>
    </section>
  {/if}

  {#if vue?.code}
    <details class="code-visuel" data-testid="mj-code-visuel">
      <summary><Bidi text={t('mj.code_visuel')} /></summary>
      <p class="muted"><Bidi text={t('mj.code_visuel_aide')} /></p>
      <ul class="etats">
        {#each vue.code.etats as e (e.cas)}
          <li data-style={e.style}>
            <span class="ex ar s-{e.style}" lang="ar" dir="rtl"><Bidi text={e.ar} base="ar" /></span
            >
            <span class="signe" aria-hidden="true">{e.signe}</span>
            <span class="gloss"><strong><Bidi text={e.cas} /></strong> <Bidi text={e.aide} /></span>
          </li>
        {/each}
      </ul>
      <ul class="regles">
        {#each vue.code.regles as r, i (i)}<li class="gloss"><Bidi text={r} /></li>{/each}
      </ul>
    </details>
  {/if}

  <h2><Bidi text={t('mj.sommaire', { n: numeros.length })} /></h2>
  <ol class="seances" data-testid="mj-sommaire">
    {#each seances as s (s.n)}
      {@const fait = faites.has(s.n)}
      <li data-seance={s.n} data-faite={fait} data-en-cours={s.n === enCours}>
        <a href={resolve('/madjaliss/[[texte]]/[[n]]', lien(id, s.n))}>
          <span class="etat" class:fait class:courante={s.n === enCours} aria-hidden="true"
            >{#if fait}<Icon name="coche" size={18} />{:else}<Bidi text={s.n} />{/if}</span
          >
          <span class="nom">
            <strong
              ><Bidi text={t('mj.seance', { n: s.n })} />{#if s.facultatif}
                — <Bidi text={t('mj.facultatif')} />{/if}</strong
            >
            <Bidi text={s.titre} />
          </span>
          <small class="info">
            {#if fait}<Bidi text={t('mj.faite')} />{:else if s.n === enCours}<Bidi
                text={t('mj.en_cours')}
              />{:else}<Bidi text={t('mj.duree', { n: s.duree })} />{/if}
          </small>
        </a>
      </li>
    {/each}
  </ol>
  <p class="statut" data-testid="mj-statut"><Bidi text={t('mj.statut')} /></p>
{/if}

<style>
  .statut {
    margin: var(--space-m) 0 0;
    color: var(--ink2);
    font-size: 0.9rem;
  }
  .code-visuel {
    margin: 0 0 var(--space-m);
    padding: var(--space-s) var(--space-m);
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    background: var(--card);
  }
  .code-visuel summary {
    cursor: pointer;
    min-height: 44px;
    display: flex;
    align-items: center;
    font-weight: 600;
  }
  .etats,
  .regles {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: var(--space-s);
  }
  .etats li {
    display: grid;
    grid-template-columns: 8em 1.5em 1fr;
    align-items: center;
    gap: var(--space-s);
  }
  .regles {
    margin-top: var(--space-s);
    font-size: 0.88rem;
    color: var(--ink2);
  }
  .ex {
    text-align: center;
    font-size: var(--ar-size);
    text-decoration-thickness: 2px;
    text-underline-offset: 0.35em;
    text-decoration-color: currentcolor;
  }
  .s-plein {
    text-decoration-line: underline;
    text-decoration-style: solid;
  }
  .s-double {
    text-decoration-line: underline;
    text-decoration-style: double;
  }
  .s-ondule {
    text-decoration-line: underline;
    text-decoration-style: wavy;
  }
  .s-tirete {
    text-decoration-line: underline;
    text-decoration-style: dashed;
  }
  .signe {
    text-align: center;
    font-weight: 700;
  }
  .carte-reprendre {
    margin-bottom: var(--space-m);
  }
  .compte {
    margin: 0;
    font-weight: 600;
  }
  .barre {
    appearance: none;
    width: 100%;
    block-size: 10px;
    border: 0;
    border-radius: var(--radius-pill);
    background: var(--surface);
    overflow: hidden;
  }
  .barre::-webkit-progress-bar {
    background: var(--surface);
    border-radius: var(--radius-pill);
  }
  .barre::-webkit-progress-value {
    background: var(--primary);
    border-radius: var(--radius-pill);
  }
  .barre::-moz-progress-bar {
    background: var(--primary);
    border-radius: var(--radius-pill);
  }
  .seances {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 6px;
  }
  .seances a {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 56px;
    padding: 8px 12px;
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    background: var(--card);
    color: var(--ink);
    text-decoration: none;
  }
  .seances a:hover {
    border-color: var(--primary);
  }
  .etat {
    display: grid;
    place-items: center;
    flex: none;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    border: 2px solid var(--line);
    font-weight: 700;
    font-size: 0.9rem;
  }
  .etat.fait {
    background: var(--primary);
    border-color: var(--primary);
    color: var(--on-primary);
  }
  .etat.courante {
    border-color: var(--gold);
    border-width: 3px;
  }
  .nom {
    display: grid;
    flex: 1;
    min-width: 0;
  }
  .info {
    color: var(--ink2);
    white-space: nowrap;
  }
  .attestation {
    margin: var(--space-m) 0;
    padding: var(--space-m);
    border: 2px solid var(--gold);
    border-radius: 16px;
    background: var(--card);
    text-align: center;
    box-shadow: var(--shadow-card);
  }
  .attestation h2 {
    margin: 0 0 var(--space-s);
  }
  .attestation .titre-ar {
    margin: 0;
    font-family: var(--font-ar-titre);
    font-weight: 700;
    font-size: 1.8rem;
  }
</style>
