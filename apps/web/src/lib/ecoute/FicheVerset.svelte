<script lang="ts">
  import { onDestroy } from 'svelte';
  import { suraName, type MotAttendu, type ResultatEcoute } from '@awform/hifz';
  import Bidi from '$lib/Bidi.svelte';
  import { fmtNumber, t } from '$lib/i18n';
  import Feuille from '$lib/quran/lecture/Feuille.svelte';
  import { pauseGroups } from '$lib/quran/pause';
  import { plageDuVerset, Reecoute } from './reecoute';

  /**
   * tarteel-egal-wip — FENÊTRE DE DÉTAIL D'UN VERSET (au toucher, comme chez Tarteel) : « Mots manqués » (le texte juste,
   * les mots oubliés, changés ou dans le désordre en rouge) et « Mots ajoutés » (le texte, avec un signe rouge là où un
   * mot de plus a été dit). Le texte est toujours celui de Tanzil, jamais ce que la machine a entendu.
   *  - « Écouter Ayyūb » : le verset entier par Muḥammad Ayyūb, avec le petit lecteur commun de l'application ;
   *  - « Réécouter ma récitation » : COMPTE ADULTE seulement (`reecoute`) ; l'enregistrement reste en mémoire sur
   *    l'appareil (jamais envoyé ni gardé, voir reecoute.ts) ; absent pour un enfant ou un ado.
   * Chargée à la demande avec le panneau « Réciter et vérifier ».
   */
  let {
    verset,
    att,
    resultat,
    instants = null,
    audio = null,
    reecoute = false,
    ouvert = $bindable(false),
  }: {
    verset: { s: number; a: number; text: string };
    att: readonly MotAttendu[];
    resultat: ResultatEcoute;
    instants?: ReadonlyArray<readonly [number, number] | null> | null;
    audio?: Blob | null;
    reecoute?: boolean;
    ouvert?: boolean;
  } = $props();

  const ESPACE = ' ';
  const arNum = (n: number) => new Intl.NumberFormat('ar-EG', { useGrouping: false }).format(n);
  const mots = $derived(att.filter((m) => m.s === verset.s && m.a === verset.a));
  const ws = $derived(verset.text.split(ESPACE));
  const saute = $derived(
    resultat.ecarts.some((e) => e.type === 'verset_saute' && e.s === verset.s && e.a === verset.a),
  );
  /** rangs (dans le texte du verset) des mots attendus non dits tels qu'écrits */
  const manques = $derived(
    new Set(
      mots
        .filter((m) => {
          const e = resultat.mots[m.i];
          return saute || e === 'oublie' || e === 'remplace' || e === 'ordre';
        })
        .map((m) => m.k),
    ),
  );
  /** rangs du mot APRÈS lequel un mot de plus a été dit (-1 : avant le premier) */
  const ajouts = $derived.by(() => {
    const out: Record<number, number> = {};
    for (const e of resultat.ecarts) {
      if (e.type !== 'ajoute') continue;
      const m = att[Math.max(0, e.i)];
      if (!m || m.s !== verset.s || m.a !== verset.a) continue;
      const k = e.i < 0 ? -1 : m.k;
      out[k] = (out[k] ?? 0) + 1;
    }
    return out;
  });
  const nbAjouts = $derived(Object.values(ajouts).reduce((s, n) => s + n, 0));
  const plage = $derived(
    reecoute && audio ? plageDuVerset(att, instants, verset.s, verset.a) : null,
  );

  // ---- Écouter Ayyūb : verset entier, petit lecteur commun (comme les versets jumeaux)
  let son: HTMLAudioElement | null = null;
  let joueAyyoub = $state(false);
  let indispoAyyoub = $state(false);
  async function ecouterAyyoub() {
    if (joueAyyoub) {
      son?.pause();
      joueAyyoub = false;
      return;
    }
    indispoAyyoub = false;
    reecouteur?.arreter();
    joueRecit = false;
    const m = await import('$lib/recitation/ayyub');
    const src = await m.sourceRecitation(`${verset.s}:${verset.a}`).catch(() => null);
    if (!src) return void (indispoAyyoub = true);
    son ??= new Audio();
    const a = son;
    a.onended = () => (joueAyyoub = false);
    a.onpause = () => (joueAyyoub = false);
    a.onplay = () => (joueAyyoub = true);
    a.src = src.url;
    try {
      await a.play();
      // le petit lecteur de l'application pilote la récitation (pause, ±5 s, vitesse jusqu'à 1,75×)
      void import('$lib/lecteur/ouvrir').then((o) => o.piloter(a)).catch(() => {});
    } catch {
      indispoAyyoub = true;
    }
  }

  // ---- Réécouter ma récitation (adulte) : audio en mémoire seulement
  let reecouteur: Reecoute | null = null;
  let joueRecit = $state(false);
  let indispoRecit = $state(false);
  async function reecouter() {
    if (joueRecit) {
      reecouteur?.arreter();
      joueRecit = false;
      return;
    }
    if (!plage || !audio) return;
    indispoRecit = false;
    son?.pause();
    reecouteur ??= new Reecoute(audio);
    joueRecit = true;
    const ok = await reecouteur.jouer(plage[0], plage[1], () => (joueRecit = false));
    if (!ok) {
      joueRecit = false;
      indispoRecit = true;
    }
  }

  /** ma récitation : arrêtée et libérée de la mémoire (décodage compris) */
  function libererRecit() {
    reecouteur?.fermer();
    reecouteur = null;
    joueRecit = false;
  }
  // la fenêtre se ferme : MA récitation s'arrête et son décodage est libéré ; Ayyūb continue, piloté par le petit lecteur
  // de l'application (visible une fois les fenêtres fermées), comme pour les versets jumeaux
  $effect(() => {
    if (!ouvert) libererRecit();
  });
  onDestroy(() => {
    libererRecit();
    son?.pause();
    son = null;
  });
</script>

{#snippet texte(avecAjouts: boolean)}
  <!-- le texte de Tanzil, mot à mot, dans un conteneur arabe (règle des gabarits : jamais dans <Bidi>) -->
  <p class="verset quran-text" lang="ar" dir="rtl">
    {#if avecAjouts && ajouts[-1]}<span class="plus" aria-hidden="true">+</span>{/if}
    {#each pauseGroups(ws) as gr (gr[0])}
      <span class="wg"
        >{#each gr as k, j (k)}{j > 0 ? ESPACE : ''}<span
            class="mot"
            class:faux={!avecAjouts && manques.has(k)}
            class:avant={avecAjouts && !!ajouts[k]}>{ws[k]}</span
          >{#if avecAjouts && ajouts[k]}<span class="plus" aria-hidden="true">+</span
            >{/if}{/each}</span
      >{ESPACE}
    {/each}
    <span class="num" aria-hidden="true">{arNum(verset.a)}</span>
  </p>
{/snippet}

<Feuille
  id="fiche-verset"
  title={t('rv.verset', { sourate: suraName(verset.s), n: fmtNumber(verset.a) })}
  bind:open={ouvert}
  testid="fiche-verset"
>
  <div class="fiche">
    <section aria-labelledby="fv-manques" data-testid="fiche-manques">
      <h3 id="fv-manques">{t('ec.fiche_manques')}</h3>
      {#if saute}<p class="small muted"><Bidi text={t('ec.fiche_saute')} /></p>{/if}
      {@render texte(false)}
      {#if manques.size}
        <p class="small muted"><Bidi text={t('ec.fiche_manques_aide')} /></p>
      {:else if !saute}
        <p class="small bien" data-testid="fiche-aucun-manque">
          <Bidi text={t('ec.fiche_aucun_manque')} />
        </p>
      {/if}
    </section>

    <section aria-labelledby="fv-ajoutes" data-testid="fiche-ajoutes">
      <h3 id="fv-ajoutes">{t('ec.fiche_ajoutes')}</h3>
      {@render texte(true)}
      {#if nbAjouts}
        <p class="small muted"><Bidi text={t('ec.fiche_ajoutes_aide')} /></p>
      {:else}
        <p class="small bien" data-testid="fiche-aucun-ajout">
          <Bidi text={t('ec.fiche_aucun_ajout')} />
        </p>
      {/if}
    </section>

    <div class="actions">
      <button
        type="button"
        class="primary"
        onclick={ecouterAyyoub}
        aria-pressed={joueAyyoub}
        data-testid="fiche-ecouter-ayyoub"
      >
        <Bidi text={t('ec.fiche_ayyoub')} />
      </button>
      {#if plage}
        <button
          type="button"
          onclick={reecouter}
          aria-pressed={joueRecit}
          data-testid="fiche-reecouter"
        >
          <Bidi text={t(joueRecit ? 'ec.fiche_arreter' : 'ec.fiche_reecouter')} />
        </button>
      {/if}
    </div>
    {#if indispoAyyoub}
      <p class="small bad" role="alert" data-testid="fiche-ayyoub-indispo">
        <Bidi text={t('ec.fiche_indispo')} />
      </p>
    {/if}
    {#if indispoRecit}
      <p class="small bad" role="alert"><Bidi text={t('ec.fiche_reecoute_impossible')} /></p>
    {/if}
    {#if plage}
      <p class="small muted" data-testid="fiche-garantie">
        <Bidi text={t('ec.fiche_reecoute_garantie')} />
      </p>
    {/if}
  </div>
</Feuille>

<style>
  .fiche {
    display: grid;
    gap: 14px;
  }
  h3 {
    margin: 0 0 4px;
    font-size: 1rem;
    color: var(--mp-green);
  }
  .verset {
    margin: 0;
    font-family: var(--font-quran);
    font-size: 1.6rem;
    line-height: 2.4;
    text-align: right;
  }
  .wg {
    white-space: nowrap;
  }
  .mot {
    border-radius: 6px;
    padding: 0 2px;
  }
  /* mot manqué : rouge ET souligné (pas la couleur seule : lisible aussi sans voir les couleurs) */
  .mot.faux {
    color: var(--bad-ink);
    background: var(--bad-bg);
    text-decoration: underline;
    text-decoration-thickness: 2px;
    text-underline-offset: 8px;
  }
  .mot.avant {
    text-decoration: underline dotted var(--bad-ink);
    text-underline-offset: 8px;
  }
  .plus {
    color: var(--bad-ink);
    font-family: var(--font-ui);
    font-weight: 700;
    padding: 0 3px;
  }
  .num {
    color: var(--mp-green);
    font-size: 0.7em;
    margin-inline: 4px;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .actions button {
    min-height: 44px;
    min-width: 44px;
  }
  .small {
    font-size: 0.9rem;
    margin: 0;
  }
  .bien {
    color: var(--ok-ink);
    font-weight: 600;
  }
  .bad {
    color: var(--bad-ink);
  }
</style>
