<script lang="ts">
  import { onMount, type Component } from 'svelte';
  import { SvelteMap, SvelteSet } from 'svelte/reactivity';
  import { page } from '$app/state';
  import { resolve } from '$app/paths';
  import Bidi from '$lib/Bidi.svelte';
  import { splitBasmala } from '@awform/hifz';
  import { loadVerses } from '$lib/hifz';
  import { loadTexts, t } from '$lib/i18n';
  import { call } from '$lib/session';
  import { bilansEcoute, chargerCarnet, libelle, marquesDe, poserMarques } from './donnees';
  import MotsVerset from './MotsVerset.svelte';
  import { prochesDe } from './mutashabihat';
  import {
    amorce,
    AUTO_EVALS,
    carteErreurs,
    tirageImpose,
    tirer,
    type AutoEval,
    type Marque,
    type Plage,
    type PointFaible,
    type Tirage,
  } from './outils';

  /**
   * Hifẓ complet — TEST QUI DÉMARRE AU HASARD dans les passages déjà mémorisés, comme un cheikh qui interroge :
   * le début d'un verset tiré au hasard s'affiche, l'élève récite la suite. Avec l'IA d'écoute (A5, si elle est
   * ouverte et acceptée), elle vérifie les mots ; sinon (hors ligne, refusée) l'élève s'auto-évalue : « juste »,
   * « hésitant », « oublié ». Il peut marquer les mots où il a buté : ils vont dans la carte des erreurs.
   */
  let { profileId, kind }: { profileId: string; kind: string } = $props();

  type Verse = { s: number; a: number; text: string };
  let plages = $state<Plage[]>([]);
  let basmala = $state('');
  let charge = $state(false);
  let q = $state<Tirage | null>(null);
  let versets = $state<Verse[]>([]);
  let vu = $state(false);
  let ia = $state(false);
  let depuis = '';
  const choix = new SvelteMap<string, 'erreur' | 'hesitation'>();
  let carte = $state<Map<string, PointFaible>>(new Map());
  let iaMots = $state<Map<string, 'erreur'>>(new Map());
  let fait = $state<AutoEval | null>(null);
  const deja = new SvelteSet<string>();

  /**
   * IA d'écoute (A5) : état décidé par le serveur (interrupteur « ecoute_ia », accord) ; son panneau est chargé à
   * la demande (module « en ligne »), comme le fait le bouton « Réciter et vérifier » du carnet.
   */
  let etatIa = $state<Record<string, unknown> | null>(null);
  let Panneau = $state<Component<Record<string, unknown>> | null>(null);
  let ouvert = $state(false);
  async function ouvrirIa() {
    Panneau ??= (await import('$lib/ecoute/PanneauEcoute.svelte')).default as unknown as Component<
      Record<string, unknown>
    >;
    ouvert = true;
  }

  onMount(async () => {
    const c = await chargerCarnet(profileId);
    basmala = c?.basmala ?? '';
    plages = c ? c.passages.flatMap((p) => p.ref) : [];
    const e = await call<{ active: boolean }>('GET', `/profiles/${profileId}/ecoute`).catch(
      () => null,
    );
    ia = !!(e?.ok && e.data?.active);
    if (ia) {
      await loadTexts('ecoute');
      etatIa = e!.data as unknown as Record<string, unknown>;
    }
    carte = carteErreurs(await marquesDe(profileId));
    charge = true;
    await suivant(page.url.searchParams.get('verset'));
    // texte de TOUS les passages mémorisés gardé sur l'appareil : le test marche ensuite hors ligne
    if (navigator.onLine) for (const r of plages) await loadVerses(r.s, r.from, r.to);
  });

  async function suivant(impose: string | null = null) {
    vu = false;
    fait = null;
    choix.clear();
    iaMots = new Map();
    versets = [];
    // hors ligne, un verset dont le texte n'est pas encore sur l'appareil est sauté (quelques essais)
    for (let essai = 0; essai < 8 && !versets.length; essai++) {
      q = (essai ? null : tirageImpose(plages, impose)) ?? tirer(plages, Math.random, deja);
      if (!q) return;
      deja.add(`${q.s}:${q.a}`);
      depuis = new Date().toISOString();
      versets = await loadVerses(q.s, q.a, q.to);
    }
  }

  async function voir() {
    vu = true;
    // bilan de l'IA d'écoute fait pendant CE test (même passage) : ses mots à revoir sont montrés
    const b = (await bilansEcoute(profileId)).find(
      (x) => x.date >= depuis && x.s === q?.s && x.from === q?.a && x.to === q?.to,
    );
    if (b) iaMots = new Map(b.mots.map(([s, a, k]) => [`${s}:${a}:${k}`, 'erreur' as const]));
  }

  function marquer(a: number, k: number) {
    const c = `${a}:${k}`;
    const v = choix.get(c);
    if (!v) choix.set(c, 'erreur');
    else if (v === 'erreur') choix.set(c, 'hesitation');
    else choix.delete(c);
  }

  async function evaluer(e: AutoEval) {
    if (!q) return;
    const m: Array<Pick<Marque, 's' | 'a' | 'k' | 't'>> = [];
    for (const [c, tp] of choix) {
      const [a, k] = c.split(':').map(Number);
      m.push({ s: q.s, a: a!, k: k!, t: tp });
    }
    const marques = new Set(m.map((x) => x.a));
    for (const v of versets)
      if (!marques.has(v.a)) {
        if (e === 'juste') m.push({ s: v.s, a: v.a, k: -1, t: 'juste' });
        else if (v.a === q.a)
          m.push({ s: v.s, a: v.a, k: -1, t: e === 'oublie' ? 'oubli' : 'hesitation' });
      }
    await poserMarques(profileId, m);
    fait = e;
    carte = carteErreurs(await marquesDe(profileId));
  }

  /** mots marqués d'un verset : carte des erreurs, puis bilan de l'IA, puis marques de ce test (la dernière gagne) */
  const motsDe = (v: Verse) => {
    const out: Array<[number, 'erreur' | 'hesitation']> = [
      ...(carte.get(`${v.s}:${v.a}`)?.mots ?? []),
    ];
    for (const c of iaMots.keys()) {
      const [s, a, k] = c.split(':').map(Number);
      if (s === v.s && a === v.a) out.push([k!, 'erreur']);
    }
    for (const [c, tp] of choix) {
      const [a, k] = c.split(':').map(Number);
      if (a === v.a) out.push([k!, tp]);
    }
    return new Map(out);
  };
  const premier = $derived(versets[0] ?? null);
  /** amorce : la basmala d'en-tête du verset 1 (Tanzil) est montrée en plus, l'amorce porte sur le verset lui-même */
  const visibles = $derived.by(() => {
    if (!premier) return 0;
    const p = splitBasmala(premier.s, premier.a, premier.text, basmala);
    const avant = p.basmala ? p.basmala.split(' ').length : 0;
    return avant + amorce(p.rest.split(' ').length);
  });
  const proches = $derived(q ? prochesDe(q.s, q.a) : []);
</script>

{#if charge && !plages.length}
  <p class="card muted" data-testid="test-vide">{t('hz.test_vide')}</p>
  <p><a href={resolve('/hifz')}>{t('hz.retour_carnet')}</a></p>
{:else if q && premier}
  <section class="card test" data-testid="test-hasard" data-verset={`${q.s}:${q.a}`}>
    <h2><Bidi text={t('hz.test_question', { ref: libelle({ s: q.s, from: q.a, to: q.a }) })} /></h2>
    {#if !vu}
      <p class="muted">{t('hz.test_consigne')}</p>
      <MotsVerset v={premier} {visibles} {basmala} />
      <div class="row">
        {#if ia}<button
            type="button"
            class="primary"
            onclick={ouvrirIa}
            data-testid="reciter-verifier">{t('ec.bouton')}</button
          >{/if}
        <button type="button" class:primary={!ia} onclick={voir} data-testid="voir-suite"
          >{t('hz.voir_suite')}</button
        >
      </div>
      {#if Panneau && ouvert && etatIa}
        <Panneau
          {profileId}
          {kind}
          portion={{ s: q.s, from: q.a, to: q.to }}
          memoriser
          etat={etatIa}
          bind:ouvert
        />
      {/if}
    {:else}
      <p class="muted small">{t('hz.marquer_mots')}</p>
      {#each versets as v (v.a)}
        <MotsVerset
          {v}
          {basmala}
          mots={motsDe(v)}
          onmot={fait ? undefined : (k) => marquer(v.a, k)}
        />
      {/each}
      {#each proches as p (`${p.s}:${p.a}`)}
        <p class="alerte" role="note" data-testid="mutashabih">
          <Bidi text={t('hz.proche_de', { ref: libelle({ s: p.s, from: p.a, to: p.a }) })} />
        </p>
      {/each}
      {#if fait}
        <p class="ok card" role="status" data-testid="test-note">
          <Bidi text={t(`hz.note_${fait}`)} />
        </p>
        <button type="button" class="primary" onclick={() => suivant()} data-testid="test-suivant"
          >{t('hz.autre_verset')}</button
        >
      {:else}
        <div class="row" role="group" aria-label={t('hz.comment')}>
          {#each AUTO_EVALS as e (e)}
            <button type="button" onclick={() => evaluer(e)} data-eval={e}
              ><Bidi text={t(`hz.eval_${e}`)} /></button
            >
          {/each}
        </div>
      {/if}
    {/if}
  </section>
{/if}

<style>
  .test {
    display: grid;
    gap: 8px;
  }
  .test h2 {
    font-size: 1.1rem;
    margin: 0;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .row button {
    min-height: 44px;
  }
  .alerte {
    background: var(--warn-bg);
    color: var(--warn-ink);
    border-radius: 8px;
    padding: 6px 10px;
  }
  .ok {
    background: var(--ok-bg);
  }
  .small {
    font-size: 0.9rem;
  }
</style>
