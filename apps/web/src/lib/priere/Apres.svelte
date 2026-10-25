<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onDestroy, onMount } from 'svelte';
  import { t } from '$lib/i18n';
  import { sourceAudio, type Voix } from './audio';
  import {
    aller as allerA,
    annuler as annulerA,
    etatInitial,
    suivante,
    totalFait,
    toucher,
    type EtatCompteur,
  } from './compteur';
  import {
    chargerSection,
    repetitions,
    trouver,
    type Element,
    type Plan,
    type Section,
  } from './donnees';
  import ElementVue from './ElementVue.svelte';
  import { reduit, vibrer } from './mouvement';
  import Picto from './Picto.svelte';
  import Texte from './Texte.svelte';

  /**
   * Écran 8 — « Après la prière » : la frise des invocations, puis le grand disque à toucher entouré de ses perles (33 · 33 ·
   * 33, plus la phrase qui fait cent). Une onde dorée à chaque toucher, une vibration courte (12 ms) si l'appareil le permet,
   * une vibration longue et la rosette à la fin d'une série, passage automatique à la suivante. Annuler, Écouter,
   * Recommencer ; total sur cent. L'ordre, les formules, les nombres (« 33 fois ») et le sens viennent du livre (S6).
   */
  let { plan, voix, vu }: { plan: Plan; voix: Voix; vu: (id: string) => void } = $props();

  let section = $state<Section | null>(null);
  let c = $state<EtatCompteur>(etatInitial(0));
  let onde = $state(false);
  let fini = $state(false);
  let ecoute = $state(false);
  let pret = $state(false);

  onMount(() => {
    void chargerSection('S6').then((s) => {
      section = s;
      c = etatInitial(plan.animation.apres.compteur.length);
    });
    void voix.preparer().then(() => (pret = true));
  });
  onDestroy(() => voix.arreter());

  const items = $derived(
    plan.animation.apres.compteur
      .map((id) => trouver(section, id))
      .filter((x): x is Element => !!x),
  );
  const nombres = $derived(items.map((e) => repetitions(e)));
  const x = $derived(items[c.et]);
  const fois = $derived(nombres[c.et] ?? 1);
  const dansCentaine = $derived(items.map((e) => plan.animation.apres.centaine.includes(e.id)));
  const totalCent = $derived(nombres.reduce((a, n, k) => a + (dansCentaine[k] ? n : 0), 0));
  const faitCent = $derived(totalFait(c, dansCentaine));
  const intro = $derived(trouver(section, 'S6.tasbih')?.intro);
  const src = $derived(x && pret ? sourceAudio(x, voix.la) : null);
  const R = 150;
  const perles = $derived(
    Array.from({ length: fois }, (_, i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / fois;
      return { i, cx: 165 + R * Math.cos(a), cy: 165 + R * Math.sin(a) };
    }),
  );
  const rayon = $derived(fois >= 33 ? 6.6 : 11);
  const reste = $derived(
    (section?.elements ?? []).filter(
      (e) =>
        e.id !== 'S6.statut' &&
        e.id !== 'S6.tasbih' &&
        !plan.animation.apres.compteur.includes(e.id),
    ),
  );

  function compter() {
    if (!x) return;
    const r = toucher(c, nombres);
    if (r.etat === c) return;
    c = r.etat;
    onde = false;
    requestAnimationFrame(() => (onde = true));
    if (!r.fin) return vibrer(12);
    vibrer([30, 60, 30]);
    fini = true;
    vu(x.id);
    const k = c.et;
    setTimeout(
      () => {
        fini = false;
        if (k === c.et) c = suivante(c, nombres);
      },
      reduit() ? 400 : 1100,
    );
  }
  const annuler = () => (c = annulerA(c));
  function zero() {
    voix.arreter();
    c = etatInitial(items.length);
  }
  const aller = (k: number) => (c = allerA(c, k, nombres));
  async function ecouter() {
    if (ecoute) return voix.arreter();
    if (!x?.ar || src?.type !== 'tts' || !src.id) return;
    ecoute = true;
    try {
      await voix.dire(x.ar, src.id);
    } finally {
      ecoute = false;
    }
  }
  const sens = $derived((x?.sens ?? '').replace(/\.$/, ''));
</script>

<div class="e-apres" data-testid="priere-apres">
  {#each (section?.elements ?? []).filter((e) => e.id === 'S6.statut') as e (e.id)}<ElementVue
      {e}
      {voix}
    />{/each}

  <nav class="frise-dhikr" id="frise" aria-label={t('priere.frise')}>
    {#each items as it, k (it.id)}
      {@const n = nombres[k] ?? 1}
      <button
        type="button"
        class:fait={(c.faits[k] ?? 0) >= n && k !== c.et}
        aria-current={k === c.et ? 'step' : undefined}
        aria-label={it.titre}
        data-i={k}
        onclick={() => aller(k)}><i><Bidi text={n === 33 ? '33' : `×${n}`} /></i></button
      >
    {/each}
  </nav>
  <p class="moment-dhikr" data-testid="priere-moment"><Bidi text={x?.titre ?? ''} /></p>

  <div class="compteur-zone">
    <svg class="perles" viewBox="0 0 330 330" aria-hidden="true" data-testid="priere-perles">
      {#each perles as p (p.i)}
        <circle
          class="perle"
          class:on={p.i < c.n}
          class:derniere={p.i === c.n - 1}
          cx={p.cx}
          cy={p.cy}
          r={rayon}
        ></circle>
      {/each}
      <path d="M165 6l5 8-5 8-5-8z" style="fill:var(--or)"></path>
    </svg>
    <span class="onde" class:go={onde}></span>
    <button
      type="button"
      class="disque"
      data-testid="priere-disque"
      aria-live="polite"
      aria-label={t('priere.disque', { sens: x?.sens ?? '', n: c.n, total: fois })}
      onclick={compter}
    >
      <span class="ar quran-text" class:long={(x?.ar ?? '').length > 40} lang="ar" dir="rtl"
        >{x?.ar ?? ''}</span
      >
      <span class="fr"><Bidi text={sens} /></span>
      <span class="nb" data-testid="priere-nb"
        ><Bidi text={c.n} /><small> / <Bidi text={fois} /></small></span
      >
    </button>
    <div class="fini" class:on={fini}><svg aria-hidden="true"><use href="#pr-rosette" /></svg></div>
  </div>

  <div class="commandes">
    <button type="button" class="btn clair" data-testid="priere-annuler" onclick={annuler}
      ><Picto nom="annuler" />{t('priere.annuler')}</button
    >
    <button
      type="button"
      class="btn clair"
      data-testid="priere-ecouter-dhikr"
      disabled={!(src?.type === 'tts' && src.id)}
      aria-pressed={ecoute}
      onclick={ecouter}><Picto nom="ecouter" />{t('priere.ecouter')}</button
    >
    <button type="button" class="btn clair" data-testid="priere-zero" onclick={zero}
      ><Picto nom="repeter" />{t('priere.recommencer')}</button
    >
  </div>
  <div class="total">
    <span class="barre" aria-hidden="true"
      ><i style:width="{totalCent ? (faitCent / totalCent) * 100 : 0}%"></i></span
    >
    <b data-testid="priere-total"
      ><Bidi
        text={c.et < 2 && faitCent === 0
          ? t('priere.avant_centaine')
          : `${faitCent} / ${totalCent}`}
      /></b
    >
  </div>
  {#if intro}<p class="doigts"><Picto nom="main" /><span><Texte txt={intro} /></span></p>{/if}
  <p class="retour-tactile"><Picto nom="info" /><span>{t('priere.retour_tactile')}</span></p>

  {#each reste as e (e.id)}<ElementVue {e} {voix} />{/each}
</div>
