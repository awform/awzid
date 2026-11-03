<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onDestroy, onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import { fn } from '$lib/fonctions.svelte';
  import { fmtNumber, localeInfo, t } from '$lib/i18n';
  import Feuille from '$lib/quran/lecture/Feuille.svelte';
  import { mesurer, niveauDe, numeroDe, pourcent, prochaineEtape } from './calcul';
  import { activer, demander, etat, initialiser, reglage } from './etat.svelte';

  /**
   * Fonction signature « Je reconnais X % des mots de cette sourate » dans le lecteur du Coran (interrupteur `coran_mots`).
   * Le pourcentage est calculé ICI, à partir des mots de la sourate et de ce que l'élève a réellement appris (ses leçons
   * faites) ; la « prochaine étape » propose les mots, enseignés par les livres, qui feraient gagner le plus.
   * Aucune retouche du texte coranique : la bande donne seulement au lecteur la liste des mots à souligner (réglage).
   * Rien ne s'affiche si la fonction n'est pas disponible pour cet élève (autre filière, aucun niveau, hors ligne sans copie).
   * `compact` (lecteur simple, interrupteur `lecteur_simple`) : seulement une petite pastille « 34 % des mots connus ›, qui ouvre le
   * détail dans un panneau ; RIEN à 0 % (décourageant) ; le réglage « Souligner » est alors dans le panneau « Outils » du lecteur.
   */
  let {
    sura,
    compact = false,
    detail = $bindable(false),
  }: { sura: number; compact?: boolean; detail?: boolean } = $props();

  let disponible = $state(false);
  let ouvert = $state(false);
  /** la fonction est ouverte pour cette personne et ses données sont prêtes */
  const visible = $derived(disponible && fn('coran_mots'));

  onMount(async () => {
    disponible = await initialiser();
  });
  onDestroy(() => activer(false));

  $effect(() => {
    if (visible) demander(sura);
  });
  // le lecteur ne souligne que si l'élève le veut ; le choix est gardé sur l'appareil
  $effect(() => activer(visible && reglage.on));

  const mots = $derived(etat.suras[sura]);
  const mesure = $derived(mots && etat.connus ? mesurer(mots, etat.connus) : null);
  const pct = $derived(mesure ? pourcent(mesure.compris, mesure.mots) : 0);
  const pctPleins = $derived(mesure ? pourcent(mesure.pleinsCompris, mesure.pleins) : 0);
  const etape = $derived(
    mots && etat.connus && etat.rangs ? prochaineEtape(mots, etat.connus, etat.rangs) : null,
  );
  const apres = $derived(etape && etape.rangs.length ? etape.apres : null);
  const pctApres = $derived(apres ? pourcent(apres.compris, apres.mots) : 0);
  /** entier ; une décimale seulement si l'entier ne montrerait pas le gain */
  const fin = $derived(apres ? Math.round(pctApres) === Math.round(pct) : false);
  const nombre = (x: number) =>
    fmtNumber(x, { maximumFractionDigits: fin ? 1 : 0, minimumFractionDigits: fin ? 1 : 0 });
  const lecons = $derived(
    (etape?.rangs ?? []).map((r) => ({
      rang: r,
      ar: etat.rangs?.[r]?.[0] ?? '',
      unite: etat.rangs?.[r]?.[1] ?? null,
    })),
  );
  const phrase = $derived(t('cm.reconnais', { pct: nombre(pct) }));
  /** pastille : le pourcentage entier ; rien tant qu'il vaut 0 */
  const entier = $derived(Math.round(pct));
</script>

{#snippet tete()}
  <p class="cm-titre" data-testid="cm-titre" lang={localeInfo().code} dir={localeInfo().dir}>
    <Bidi text={phrase} />
  </p>
  <div
    class="cm-barre"
    role="progressbar"
    aria-label={phrase}
    aria-valuemin="0"
    aria-valuemax="100"
    aria-valuenow={Math.round(pct)}
  >
    <span style:inline-size={`${Math.round(pct)}%`}></span>
  </div>
  {#if mesure && mesure.pleins > 0}
    <p class="cm-petit" data-testid="cm-pleins" lang={localeInfo().code} dir={localeInfo().dir}>
      <Bidi text={t('cm.pleins', { pct: fmtNumber(Math.round(pctPleins)) })} />
    </p>
  {/if}
{/snippet}

{#snippet suite()}
  {#if apres}
    <p class="cm-suite" data-testid="cm-suite">
      <Bidi
        text={etape!.rangs.length === 1
          ? t('cm.suite_un', { pct: nombre(pctApres) })
          : t('cm.suite_n', { n: etape!.rangs.length, pct: nombre(pctApres) })}
      />
    </p>
    <button
      type="button"
      class="cm-lien"
      aria-expanded={ouvert}
      aria-controls="cm-mots"
      onclick={() => (ouvert = !ouvert)}
      data-testid="cm-voir-mots"
    >
      <Bidi text={ouvert ? t('cm.cacher_mots') : t('cm.voir_mots')} />
    </button>
    {#if ouvert}
      <ul id="cm-mots" class="cm-mots" aria-label={t('cm.mots_liste')} data-testid="cm-mots">
        {#each lecons as l (l.rang)}
          {@const niv = l.unite ? niveauDe(l.unite) : 0}
          <li data-rang={l.rang}>
            <span class="ar" lang="ar" dir="rtl"><Bidi text={l.ar} base="ar" /></span>
            {#if l.unite}
              {#if niv === etat.niveau}
                <!-- eslint-disable svelte/no-navigation-without-resolve -- chemin résolu -->
                <a href={resolve('/lecons/[id]', { id: l.unite })}
                  ><Bidi text={t('cm.lecon_faite', { niveau: niv, n: numeroDe(l.unite) })} /></a
                >
                <!-- eslint-enable svelte/no-navigation-without-resolve -->
              {:else}
                <span class="cm-petit"
                  ><Bidi
                    text={t('cm.lecon_plus_tard', { niveau: niv, n: numeroDe(l.unite) })}
                  /></span
                >
              {/if}
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  {:else if pct >= 100}
    <p class="cm-petit">{t('cm.tout')}</p>
  {:else}
    <p class="cm-petit">{t('cm.reste')}</p>
  {/if}
{/snippet}

{#if visible && mesure && mesure.mots > 0}
  {#if compact}
    {#if entier > 0}
      <button
        type="button"
        class="cm-pastille"
        onclick={() => (detail = true)}
        aria-haspopup="dialog"
        aria-label={t('cm.pastille_aria', { pct: fmtNumber(entier) })}
        data-testid="cm-pastille"
      >
        <span><Bidi text={t('cm.pastille', { pct: fmtNumber(entier) })} /> ›</span>
      </button>
      <Feuille id="cm-detail" title={t('cm.detail_titre')} bind:open={detail} testid="cm-detail">
        <section class="cm cm-feuille" data-testid="cm-bande" aria-label={t('cm.aria')}>
          {@render tete()}
          <div lang={localeInfo().code} dir={localeInfo().dir}>
            {@render suite()}
            <p class="cm-petit">{t('cm.note')}</p>
            {#if fn('racines_coran')}
              <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- chemin résolu -->
              <a class="cm-lien" href={resolve('/coran/familles')} data-testid="cm-familles"
                >{t('cm.familles')}</a
              >
            {/if}
          </div>
        </section>
      </Feuille>
    {/if}
  {:else}
    <section class="cm" data-testid="cm-bande" aria-label={t('cm.aria')}>
      {@render tete()}
      <div lang={localeInfo().code} dir={localeInfo().dir}>
        {@render suite()}
        <label class="cm-souligner">
          <input
            type="checkbox"
            role="switch"
            checked={reglage.on}
            onchange={(e) => reglage.regler(e.currentTarget.checked)}
            data-testid="cm-souligner"
          />
          <span>{t('cm.souligner')}</span>
        </label>
        <p class="cm-petit">{t('cm.note')}</p>
        <p class="cm-liens">
          <!-- eslint-disable svelte/no-navigation-without-resolve -- chemin résolu -->
          <a href={resolve('/coran/mots')} data-testid="cm-chercher">{t('cm.chercher')}</a>
          {#if fn('racines_coran')}<a href={resolve('/coran/familles')} data-testid="cm-familles"
              >{t('cm.familles')}</a
            >{/if}
          <a href={`${resolve('/coran/mots')}#sources`} data-testid="cm-sources"
            >{t('cm.sources')}</a
          >
          <!-- eslint-enable svelte/no-navigation-without-resolve -->
        </p>
      </div>
    </section>
  {/if}
{/if}

<style>
  .cm {
    display: grid;
    gap: 6px;
    margin: 6px auto;
    padding: 10px 14px;
    max-inline-size: 42rem;
    color: var(--ink);
    background: var(--card);
    border: 1px solid var(--line);
    border-inline-start: 4px solid var(--or-line);
    border-radius: var(--radius-md);
  }
  /* dans le panneau du lecteur simple : pas de second cadre */
  .cm-feuille {
    margin: 0;
    padding: 0 0 4px;
    border: 0;
    border-radius: 0;
    background: transparent;
  }
  /* pastille discrète : cible de 44 px, apparence d'une petite pilule */
  .cm-pastille {
    display: inline-flex;
    align-items: center;
    min-block-size: 44px;
    margin-block: -6px;
    padding: 0;
    font: inherit;
    background: transparent;
    border: 0;
    cursor: pointer;
  }
  .cm-pastille span {
    padding: 3px 12px;
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--or-ink);
    background: var(--or-soft);
    border: 1px solid var(--or-line);
    border-radius: var(--radius-pill);
  }
  p {
    margin: 0;
  }
  .cm-titre {
    font-weight: 800;
    font-size: 1.05rem;
  }
  .cm-barre {
    block-size: 10px;
    overflow: hidden;
    background: var(--surface);
    border-radius: var(--radius-pill);
  }
  .cm-barre span {
    display: block;
    block-size: 100%;
    background: var(--primary);
    border-radius: inherit;
    transition: inline-size var(--motion) ease-out;
  }
  .cm-petit,
  .cm-suite {
    font-size: 0.92rem;
    color: var(--ink2);
  }
  .cm-suite {
    color: var(--ink);
  }
  .cm-lien {
    justify-self: start;
    min-block-size: var(--target);
    padding-inline: 4px;
    background: transparent;
    border: 0;
    color: var(--primary);
    font: inherit;
    text-decoration: underline;
    cursor: pointer;
  }
  .cm-mots {
    display: grid;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .cm-mots li {
    display: grid;
    gap: 2px;
    padding: 6px 10px;
    background: var(--surface);
    border-radius: var(--radius-md);
  }
  .ar {
    font-family: var(--font-quran);
    font-size: 1.5rem;
    line-height: 1.8;
    text-align: end;
  }
  .cm-souligner {
    display: flex;
    gap: 10px;
    align-items: center;
    min-block-size: var(--target);
    font-size: 0.95rem;
  }
  .cm-souligner input {
    inline-size: 1.4rem;
    block-size: 1.4rem;
    margin: 0;
    accent-color: var(--primary);
  }
  .cm-liens {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 18px;
    font-size: 0.92rem;
  }
  .cm-liens a,
  .cm-mots a {
    display: inline-flex;
    align-items: center;
    min-block-size: var(--target);
    color: var(--primary);
  }
</style>
