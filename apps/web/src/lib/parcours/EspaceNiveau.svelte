<script lang="ts">
  import { fonctionsEtat } from '$lib/fonctions.svelte';
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import Ar from '$lib/Ar.svelte';
  import { arabicSize, unitLabel } from '$lib/api';
  import { t } from '$lib/i18n';
  import { levelLabel } from '$lib/levels';
  import type { ProfileInfo } from '$lib/session';
  import Icon from '$lib/ui/Icon.svelte';
  import Loading from '$lib/ui/Loading.svelte';
  import Progress from '$lib/ui/Progress.svelte';
  import StatusMessage from '$lib/ui/StatusMessage.svelte';
  import EcritureNiveau from './EcritureNiveau.svelte';
  import LivretsNiveau from './LivretsNiveau.svelte';
  import MotsCoran from './MotsCoran.svelte';
  import ModeProfil from './ModeProfil.svelte';
  import Recap from './Recap.svelte';
  import UniteCouverture from './UniteCouverture.svelte';
  import { grouperUnites, type EtatUnite } from './unites';
  import { call } from '$lib/session';
  import { commencer, espace, tabsFor, type Espace, type Matiere, type Onglet } from './parcours';

  /**
   * A27 — espace du niveau : l'élève ne voit QUE son niveau courant (onglets qui ont du contenu à ce niveau),
   * ses anciens livres en révision et le niveau suivant en aperçu (titres seuls, « Passer l'épreuve »).
   * Sans niveau : commencer au niveau proposé ou passer le test de positionnement.
   */
  let { profile, matiere }: { profile: ProfileInfo; matiere: Matiere } = $props();

  let e = $state<Espace | null>(null);
  let failed = $state<'erreur' | 'hors_ligne' | null>(null);
  let local = $state(false);
  let busy = $state(false);
  // sciences, Coran : leçons du livre seulement (écriture, lectures et mots du Coran relèvent du livre d'arabe)
  const tabs = $derived<Onglet[]>(
    !e ? [] : matiere === 'arabe' ? tabsFor(e, profile.kind) : e.unites.length ? ['lecons'] : [],
  );
  const asked = $derived(page.url.searchParams.get('onglet') as Onglet | null);
  const tab = $derived(asked && tabs.includes(asked) ? asked : (tabs[0] ?? 'lecons'));
  const next = $derived(e?.unites.find((u) => u.id === (e?.enCours ?? e?.prochaine)) ?? null);
  const enCoursIci = $derived(!!e?.enCours && e.enCours === next?.id);
  // D1 : unités (entre deux bilans) ; l'unité en cours dépliée, les autres fermées
  const groupes = $derived(e ? grouperUnites(e.unites, (n) => t('parc.unite_lecons', n)) : []);
  let choisis = $state<number[] | null>(null);
  const ouverts = $derived(
    choisis ??
      (() => {
        const i = groupes.findIndex((g) => g.lecons.some((u) => u.id === next?.id));
        return [i >= 0 ? i : 0];
      })(),
  );
  function basculer(i: number) {
    const o = ouverts;
    choisis = o.includes(i) ? o.filter((x) => x !== i) : [...o, i];
  }
  function etatDe(u: { id: string; kind: string; statut: string | null }): EtatUnite {
    if (u.statut === 'terminee' || u.statut === 'maitrisee') return 'fait';
    if (u.kind === 'examen') return 'examen';
    if (u.kind === 'bilan') return 'bilan';
    if (u.id === next?.id) return 'en-cours';
    return 'numero';
  }

  async function load() {
    failed = null;
    const r = await espace(profile.id, matiere);
    if (r.ok && r.data) {
      e = r.data;
      local = !!(r as { local?: boolean }).local;
    } else failed = r.status === 0 ? 'hors_ligne' : 'erreur';
  }
  onMount(load);

  function show(o: Onglet) {
    const u = new URL(page.url);
    u.searchParams.set('onglet', o);
    // eslint-disable-next-line svelte/no-navigation-without-resolve -- même page, paramètre d'onglet seulement
    void goto(`${u.pathname}${u.search}`, { replaceState: true, noScroll: true, keepFocus: true });
  }
  async function start() {
    busy = true;
    const r = await commencer(profile.id, matiere);
    busy = false;
    if (r.ok) await load();
  }
  // A39 : mode d'évaluation ; récapitulatif bienveillant avant le niveau suivant (tous les modes)
  const mode = $derived(e?.mode?.mode ?? 'verification');
  let recap = $state(false);
  let choix = $state('');
  async function choose() {
    const r = await call('POST', `/profiles/${profile.id}/choisir-niveau/${matiere}`, {
      niveau: choix,
    });
    if (r.ok) await load();
  }
  async function opened() {
    recap = false;
    await load();
  }
  const ICON: Record<Onglet, string> = {
    lecons: 'alif',
    lectures: 'lire',
    ecriture: 'plume',
    pratique: 'revisions',
    mots: 'mushaf',
  };
  const origine = (o: string) =>
    ['positionnement', 'epreuve', 'enseignant', 'passage', 'lecons', 'choix'].includes(o)
      ? t(`parc.origine_${o}`)
      : '';
</script>

{#if failed}
  <StatusMessage kind={failed} onretry={load} />
{:else if !e}
  <Loading lines={4} />
{:else if !e.courant}
  <section class="card start" data-testid="commencer">
    <span class="start-ic"><Icon name="etoile" size={32} /></span>
    <h2>{t('parc.commencer_titre')}</h2>
    <p class="muted"><Bidi text={t('parc.commencer_texte')} /></p>
    <div class="row">
      {#if e.proposition}
        <button
          type="button"
          class="primary"
          disabled={busy}
          onclick={start}
          data-testid="commencer-niveau"
          ><Bidi text={t('parc.commencer_au', { niveau: levelLabel(e.proposition) })} /></button
        >
      {/if}
      {#if matiere !== 'coran'}
        <a
          class="button"
          href={resolve('/positionnement/[matiere]', { matiere })}
          data-testid="lien-positionnement">{t('parc.test_positionnement')}</a
        >
      {/if}
    </div>
    {#if mode === 'serein' && matiere !== 'coran' && !fonctionsEtat.restreint}
      <!-- A39 : le test est facultatif, l'élève peut choisir son niveau lui-même -->
      <div class="row" data-testid="choisir-niveau">
        <select bind:value={choix} aria-label={t('ser.choisir')}>
          {#each e.niveaux as n (n)}<option value={n}>{levelLabel(n)}</option>{/each}
        </select>
        <button type="button" disabled={!choix} onclick={choose}>{t('ser.choisir')}</button>
      </div>
    {/if}
    <p class="muted small">{t('parc.livre_papier')}</p>
  </section>
{:else}
  {@const c = e.courant}
  <!-- D1 : carte « Reprendre » (titre arabe calligraphié, bouton doré), avancement du niveau -->
  <header
    class="carte-reprendre"
    data-testid="mon-niveau"
    data-niveau={c.code}
    data-piste={e.piste}
  >
    <div class="rp-tete">
      <span class="code"><Bidi text={levelLabel(c.code)} /></span>
      {#if origine(c.origine)}<span class="chip" data-testid="origine"
          ><Bidi text={origine(c.origine)} /></span
        >{/if}
    </div>
    {#if next}
      <p class="rp-quoi">
        <Bidi text={t(enCoursIci ? 'parc.reprendre' : 'parc.a_suivre')} /> · <Bidi
          text={`${unitLabel(next)} — ${next.titleFr}`}
        />
      </p>
      <!-- D1 : marques [..] du livre RENDUES (lettres mises en valeur), jamais affichées en crochets -->
      <div class="rp-ar"><Ar text={next.titleAr} block /></div>
      <a class="button dore" href={resolve('/lecons/[id]', { id: next.id })} data-testid="continuer"
        ><Icon name="fleche" size={20} /><span
          ><Bidi text={t(enCoursIci ? 'parc.continuer_lecon' : 'parc.commencer_lecon')} /></span
        ></a
      >
    {:else}
      {#if c.titreAr}<div class="rp-ar"><Ar text={c.titreAr} block /></div>{/if}
      {#if c.titre}<p class="rp-quoi"><Bidi text={c.titre} /></p>{/if}
    {/if}
    <Progress
      value={e.progression.faites}
      max={e.progression.total}
      label={t('parc.progression', { n: e.progression.faites, total: e.progression.total })}
    />
    <p class="muted small" data-testid="progression">
      <Bidi text={t('parc.progression', { n: e.progression.faites, total: e.progression.total })} />
      {#if local}· {t('parc.copie_locale')}{/if}
    </p>
    {#if mode !== 'verification' && e.semaine != null}
      <!-- A39 : seulement des encouragements (aucune note, aucune série imposée) -->
      <p class="bravo" data-testid="encouragement" data-mode={mode}>
        <Icon name="etoile" size={18} /><Bidi text={t('ser.semaine', { n: e.semaine })} />
      </p>
    {/if}
  </header>

  {#if tabs.length > 1}
    <div class="tabs" role="tablist" aria-label={t('parc.onglets')} data-testid="onglets-niveau">
      {#each tabs as o (o)}
        <button
          type="button"
          role="tab"
          aria-selected={tab === o}
          class:on={tab === o}
          onclick={() => show(o)}
          data-onglet={o}
          ><Icon name={ICON[o]} size={18} /><span><Bidi text={t(`parc.onglet_${o}`)} /></span
          ></button
        >
      {/each}
    </div>
  {/if}

  <section role="tabpanel" data-panel={tab}>
    {#if e.unites.length === 0}
      <!-- niveau choisi mais sans leçon importée : message clair, jamais une page vide muette -->
      <div class="card info" data-testid="niveau-bientot">
        <h2>{t('niveau.bientot')}</h2>
        <p class="muted">{t('niveau.bientot_texte')}</p>
      </div>
    {:else if tab === 'lecons'}
      <!-- D1 : leçons groupées par unité (entre deux bilans) ; seule l'unité en cours est dépliée -->
      <ol class="unites" style="--ar-size: {arabicSize(c.code)}px" data-testid="lecons-niveau">
        {#each groupes as g, gi (gi)}
          <li class="unite-bloc">
            <UniteCouverture
              index={gi}
              lecons={g.libelle}
              faites={t('parc.unite_faites', { n: g.faites, total: g.lecons.length })}
              premiere={g.lecons.find((x) => x.kind === 'lecon')?.id ?? null}
              ouvert={ouverts.includes(gi)}
              ontoggle={() => basculer(gi)}
              controle="unite-{gi}"
            />
            {#if ouverts.includes(gi)}
              <ol class="units" id="unite-{gi}">
                {#each g.lecons as u (u.id)}
                  {@const etat = etatDe(u)}
                  <li class={u.kind} class:next={u.id === next?.id} data-etat={etat}>
                    <a href={resolve('/lecons/[id]', { id: u.id })} data-testid="unit">
                      <span class="pastille {etat}" aria-hidden="true"
                        >{#if etat === 'fait'}<Icon
                            name="coche"
                            size={18}
                          />{:else if etat === 'bilan'}★{:else if etat === 'examen'}<svg
                            viewBox="0 0 24 24"
                            width="22"
                            height="22"
                            ><path
                              d="M12 2l2.4 2.6 3.4-.6.9 3.4 3.2 1.4-1.2 3.2 1.2 3.2-3.2 1.4-.9 3.4-3.4-.6L12 22l-2.4-2.6-3.4.6-.9-3.4-3.2-1.4L3.3 12 2.1 8.8l3.2-1.4.9-3.4 3.4.6z"
                              fill="currentColor"
                            /><path
                              d="m8.5 12 2.4 2.4 4.6-4.8"
                              fill="none"
                              stroke="var(--card)"
                              stroke-width="2"
                            /></svg
                          >{:else if etat === 'en-cours'}<span class="cercle"></span>{:else}<Bidi
                            text={u.numLecon ?? u.n}
                          />{/if}</span
                      >
                      <span class="txt">
                        <span class="label"><Bidi text={unitLabel(u)} /></span>
                        <span class="fr"><Bidi text={u.titleFr} /></span>
                      </span>
                      <span class="sr"
                        ><Bidi text={t(`parc.etat_${etat.replace('-', '_')}`)} /></span
                      >
                      {#if u.statut && u.statut !== 'ouverte'}<span
                          class="st {u.statut}"
                          data-testid="statut"><Bidi text={t(`statut.${u.statut}`)} /></span
                        >{/if}
                      <Ar text={u.titleAr} />
                    </a>
                  </li>
                {/each}
              </ol>
            {/if}
          </li>
        {/each}
      </ol>
    {:else if tab === 'lectures'}
      <LivretsNiveau niveau={c.code} unites={e.unites} />
    {:else if tab === 'ecriture'}
      <EcritureNiveau {profile} />
    {:else if tab === 'pratique'}
      <ul class="tiles" data-testid="pratique">
        <li>
          <a class="tile" href={resolve('/revisions')} data-testid="lien-revisions"
            ><span class="tile-ic"><Icon name="revisions" /></span><strong
              >{t('revisions.titre')}</strong
            ><small>{t('parc.pratique_revisions')}</small></a
          >
        </li>
        {#each e.unites.filter((u) => u.kind === 'bilan') as b (b.id)}
          <li>
            <a class="tile" href={resolve('/lecons/[id]', { id: b.id })}
              ><span class="tile-ic"><Icon name="coche" /></span><strong
                ><Bidi text={unitLabel(b)} /></strong
              ><small><Bidi text={b.titleFr} /></small></a
            >
          </li>
        {/each}
        {#if /^ad([2-9]|10)$/.test(c.code)}
          <li>
            <a class="tile" href={resolve('/activites/racines')}
              ><span class="tile-ic"><Icon name="grille" /></span><strong>{t('act.racines')}</strong
              ></a
            >
          </li>
        {/if}
      </ul>
    {:else if tab === 'mots'}
      <MotsCoran {profile} />
    {/if}
  </section>

  {#if e.anciens.length}
    <section class="card" data-testid="anciens-livres">
      <h2>{t('parc.anciens')}</h2>
      <p class="muted small">{t('parc.anciens_texte')}</p>
      <ul class="chips">
        {#each e.anciens as a (a.code)}
          <li>
            <a
              class="button"
              href={resolve('/niveaux/[code]', { code: a.code })}
              data-ancien={a.code}
              ><Icon name="revisions" size={18} /><Bidi text={levelLabel(a.code)} /></a
            >
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if e.suivant}
    {@const s = e.suivant}
    <section class="card suivant" data-testid="apercu-suivant" data-niveau={s.code}>
      <h2><Bidi text={t('parc.suivant', { niveau: levelLabel(s.code) })} /></h2>
      {#if s.titre}<p><Bidi text={s.titre} /></p>{/if}
      <details>
        <summary><Bidi text={t('parc.apercu_lecons', { n: s.lecons.length })} /></summary>
        <ol class="apercu">
          {#each s.lecons as l (l.n)}
            <li><Bidi text={unitLabel(l)} /> — <Bidi text={l.titleFr} /></li>
          {/each}
        </ol>
      </details>
      <p class="muted small">
        <Bidi text={t(mode === 'serein' ? 'ser.lecons_a_faire' : 'parc.apercu_regle')} />
      </p>
      {#if matiere === 'coran'}
        <!-- pas d'épreuve de passage pour les livrets du Coran -->
      {:else if recap}
        <Recap pid={profile.id} {matiere} onopen={opened} />
      {:else}
        <div class="row" data-mode={mode}>
          {#if mode === 'serein'}
            {#if e.progression.total && e.progression.faites >= e.progression.total}
              <button
                type="button"
                class="primary"
                onclick={() => (recap = true)}
                data-testid="ouvrir-suivant">{t('ser.ouvrir')}</button
              >
            {/if}
            <!-- épreuve facultative : seulement pour un certificat -->
            <a
              class="button"
              href={resolve('/epreuve-passage/[matiere]', { matiere })}
              data-testid="epreuve-facultative">{t('ser.epreuve_facultative')}</a
            >
          {:else if e.epreuve?.attendre}
            <p class="muted" data-testid="epreuve-attendre">{t('parc.epreuve_demain')}</p>
          {:else}
            <button
              type="button"
              class="primary"
              onclick={() => (recap = true)}
              data-testid="passer-epreuve"
              ><Bidi text={t(mode === 'douce' ? 'ser.defi' : 'parc.passer_epreuve')} /></button
            >
          {/if}
          <a class="button" href={resolve('/positionnement/[matiere]', { matiere })}
            >{t('parc.test_positionnement')}</a
          >
        </div>
      {/if}
    </section>
  {/if}
  {#if profile.kind === 'ado'}
    <details class="card">
      <summary>{t('ser.titre')}</summary>
      <ModeProfil pid={profile.id} ctx="eleve" />
    </details>
  {/if}
{/if}

<style>
  /* D1 : carte « Reprendre » (.carte-reprendre, app.css) — titre arabe calligraphié (Amiri), bouton doré */
  .rp-tete {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    justify-content: space-between;
  }
  .rp-quoi {
    margin: 0;
    font-weight: 600;
  }
  .rp-ar :global(.ar) {
    margin: 0;
    font-family: var(--font-ar-titre);
    font-weight: 700;
    font-size: 2rem;
    line-height: 1.7;
    text-align: right;
    color: var(--ink);
  }
  .code {
    font-weight: 800;
    letter-spacing: 0.03em;
    color: var(--ink2);
    text-transform: uppercase;
    font-size: 0.85rem;
  }
  .chip {
    font-size: 0.8rem;
    padding: 2px 10px;
    border-radius: var(--radius-pill);
    background: var(--primary-soft);
    color: var(--primary);
    font-weight: 700;
  }
  .tabs {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    padding: 4px 0 8px;
    margin: var(--space-m) 0 var(--space-s);
    scrollbar-width: none;
  }
  .tabs button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex: 0 0 auto;
    min-height: var(--target);
    border-radius: var(--radius-pill);
    border: 1px solid var(--line);
    background: var(--card);
    color: var(--ink);
    font-weight: 700;
    padding: 0 14px;
  }
  .tabs button.on {
    background: var(--primary);
    border-color: var(--primary);
    color: var(--on-primary);
  }
  .unites {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: var(--space-m);
  }
  .units {
    list-style: none;
    padding: 0;
    margin: 4px 0 0;
  }
  .units a {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 2px 12px;
    align-items: center;
    padding: 10px 14px;
    margin: 8px 0;
    min-height: 56px;
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 12px;
    text-decoration: none;
    color: var(--ink);
  }
  .units li.next a {
    border: 2px solid var(--primary);
    box-shadow: var(--shadow-card);
  }
  .units :global(.ar) {
    grid-column: 1 / -1;
    text-align: right;
  }
  .txt {
    display: grid;
    min-width: 0;
  }
  /* états : ✓ fait, cercle en cours, numéro, ★ bilan, sceau examen */
  .pastille {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: 2px solid var(--line);
    font-weight: 700;
    color: var(--ink2);
  }
  .pastille.fait {
    background: var(--primary);
    border-color: var(--primary);
    color: var(--on-primary);
  }
  .pastille.en-cours {
    border-color: var(--primary);
  }
  .cercle {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--primary);
  }
  .pastille.bilan {
    border-color: var(--gold);
    color: var(--gold);
    font-size: 1.2rem;
  }
  .pastille.examen {
    border: 0;
    color: var(--gold);
  }
  .label {
    font-weight: 700;
    color: var(--teal);
  }
  .bilan .label,
  .examen .label {
    color: var(--soon-ink);
  }
  .st {
    font-size: 0.8rem;
    border-radius: var(--radius-pill);
    padding: 1px 10px;
    background: var(--warn-bg);
    color: var(--soon-ink);
    font-weight: 700;
  }
  .st.terminee,
  .st.maitrisee {
    background: var(--ok-bg);
    color: var(--ok-ink);
  }
  .chips {
    list-style: none;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .chips .button {
    display: inline-flex;
    gap: 6px;
    align-items: center;
  }
  .suivant {
    border: 2px dashed var(--line);
    background: var(--surface);
  }
  .apercu {
    color: var(--ink2);
    padding-inline-start: 1.4em;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  .start {
    display: grid;
    justify-items: start;
    gap: 6px;
  }
  .start-ic {
    display: grid;
    place-items: center;
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: var(--primary-soft);
    color: var(--primary);
  }
  .small {
    font-size: 0.9rem;
  }
  .bravo {
    display: flex;
    gap: 6px;
    align-items: center;
    margin: 0;
    color: var(--ok-ink);
    font-weight: 700;
  }
</style>
