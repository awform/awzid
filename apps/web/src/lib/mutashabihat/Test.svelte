<script lang="ts">
  import { onMount } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { tanwinDisplay } from '@awform/content/text';
  import { suraName } from '@awform/hifz';
  import Bidi from '$lib/Bidi.svelte';
  import { loadMeta, loadVerses } from '$lib/hifz';
  import { chargerCarnet, libelle, poserMarques } from '$lib/hifz-outils/donnees';
  import { t } from '$lib/i18n';
  import CarteJumeau from './CarteJumeau.svelte';
  import { pairesMemorisees, questionHasard, type Question } from './exercices';
  import MotsJumeau from './MotsJumeau.svelte';
  import { jumeauxDe, type Jumeau } from './paires';

  /**
   * Test au hasard qui MÉLANGE LES JUMEAUX (25/10/2026) : trois exercices (la bonne suite entre deux formes, le mot masqué entre
   * ses variantes, la sourate du verset), seulement sur des jumeaux DÉJÀ MÉMORISÉS (les deux versets). Une mauvaise réponse
   * marque le mot dans la carte des erreurs : le verset revient dans la révision espacée ; une bonne réponse « juste ». Aucune note.
   */
  let { profileId }: { profileId: string; kind?: string } = $props();
  type Verse = { s: number; a: number; text: string };
  let candidats = $state<Jumeau[]>([]);
  let charge = $state(false);
  let basmala = $state('');
  let q = $state<Question | null>(null);
  let j = $state<Jumeau | null>(null);
  let moi = $state<Verse | null>(null);
  let rep = $state<number | null>(null);
  let juste = $state<boolean | null>(null);
  const deja = new SvelteSet<string>();

  onMount(async () => {
    basmala = (await loadMeta().catch(() => null))?.basmala ?? '';
    const c = await chargerCarnet(profileId).catch(() => null);
    candidats = pairesMemorisees(c ? c.passages.flatMap((p) => p.ref) : []);
    charge = true;
    await suivant();
  });

  async function suivant() {
    q = null;
    rep = null;
    juste = null;
    for (let essai = 0; essai < 10 && candidats.length; essai++) {
      const libres = candidats.filter((c) => !deja.has(c.id));
      const pool = libres.length ? libres : candidats;
      const base = pool[Math.floor(Math.random() * pool.length)]!;
      // l'un ou l'autre des deux versets est interrogé
      const x =
        Math.random() < 0.5
          ? base
          : (jumeauxDe(base.autre.s, base.autre.a).find((l) => l.id === base.id) ?? base);
      const [vm] = await loadVerses(x.moi.s, x.moi.a, x.moi.a);
      const [va] = await loadVerses(x.autre.s, x.autre.a, x.autre.a);
      if (!vm || !va) continue;
      deja.add(base.id);
      const question = questionHasard(x, vm.text, va.text);
      if (!question) continue;
      j = x;
      moi = vm;
      q = question;
      return;
    }
  }

  async function repondre(i: number) {
    if (!q || rep !== null) return;
    rep = i;
    const ok = q.choix[i]!.juste;
    juste = ok;
    await poserMarques(
      profileId,
      [{ s: q.moi.s, a: q.moi.a, k: ok ? -1 : q.rang, t: ok ? 'juste' : 'erreur' }],
      'test',
    );
  }
  const ref = (r: { s: number; a: number }) => libelle({ s: r.s, from: r.a, to: r.a });
</script>

<section class="card test" data-testid="test-jumeaux">
  <p class="muted"><Bidi text={t('mt.test_intro')} /></p>
  {#if charge && !candidats.length}
    <p data-testid="test-jumeaux-vide"><Bidi text={t('mt.test_vide')} /></p>
  {:else if q && j && moi}
    <div data-testid="jumeaux-question" data-type={q.type} data-verset={`${q.moi.s}:${q.moi.a}`}>
      {#if q.type === 'suite'}
        <h2><Bidi text={t('mt.q_suite', { ref: ref(q.moi) })} /></h2>
        <MotsJumeau v={moi} {basmala} jusqua={q.debut.length} />
      {:else if q.type === 'mot'}
        <h2><Bidi text={t('mt.q_mot', { ref: ref(q.moi) })} /></h2>
        <MotsJumeau v={moi} {basmala} trou={q.trou} />
      {:else}
        <h2><Bidi text={t('mt.q_sourate')} /></h2>
        <MotsJumeau v={moi} {basmala} />
      {/if}
      <div class="choix" role="group">
        {#each q.choix as c, i (i)}
          <button
            type="button"
            class:ok={rep !== null && c.juste}
            class:ko={rep === i && !c.juste}
            disabled={rep !== null}
            onclick={() => repondre(i)}
            data-testid="jumeaux-choix"
            data-juste={c.juste}
          >
            {#if 'mots' in c}<span class="quran-text" lang="ar" dir="rtl"
                >{c.mots.map(tanwinDisplay).join(' ')}</span
              >{:else if 'mot' in c}<span class="quran-text" lang="ar" dir="rtl"
                >{tanwinDisplay(c.mot)}</span
              >{:else}<Bidi text={suraName(c.s)} />{/if}
          </button>
        {/each}
      </div>
      {#if rep !== null}
        <p class={juste ? 'ok' : 'warn'} role="status" data-testid="jumeaux-resultat">
          <Bidi text={juste ? t('mt.juste') : t('mt.faux')} />
        </p>
        <CarteJumeau {moi} {j} {basmala} />
        <button type="button" class="primary" onclick={suivant} data-testid="jumeaux-suivant"
          >{t('mt.suivant')}</button
        >
      {/if}
    </div>
  {/if}
</section>

<style>
  .test {
    display: grid;
    gap: 8px;
  }
  h2 {
    font-size: 1.05rem;
    margin: 0;
  }
  .choix {
    display: grid;
    gap: 8px;
    margin: 8px 0;
  }
  .choix button {
    min-height: 56px;
    font-size: 1.5rem;
    font-family: var(--font-quran);
  }
  .choix button.ok {
    background: var(--ok-bg);
    border-color: var(--ok-ink);
  }
  .choix button.ko {
    background: var(--bad-bg);
    border-color: var(--bad-ink);
  }
  .ok {
    color: var(--ok-ink);
  }
  .warn {
    color: var(--warn-ink);
  }
</style>
