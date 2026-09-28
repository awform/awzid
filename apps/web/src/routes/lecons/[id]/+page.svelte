<script lang="ts">
  import { resolve } from '$app/paths';
  import Ar from '$lib/Ar.svelte';
  import Exercise from '$lib/Exercise.svelte';
  import { arabicSize, unitLabel } from '$lib/api';

  let { data } = $props();
  const u = $derived(data.unit);
  const L = $derived(data.unit.lesson);
  const lettres = $derived(L.lettres ?? []);
  const isEval = $derived(u.kind !== 'lecon');
</script>

<svelte:head><title>AWFORM — {unitLabel(u)} · {u.titleFr}</title></svelte:head>

<article class="lesson" style="--ar-size: {arabicSize(u.levelCode)}px" data-unit={u.id}>
  <p><a href={resolve('/niveaux/[code]', { code: u.levelCode })}>← Leçons {u.levelCode}</a></p>
  <p class="num">{unitLabel(u)} · {u.titleFr}</p>
  <Ar tag="h1" text={L.titre_ar} {lettres} />

  {#if L.objectifs?.length}
    <section>
      <h2>Mon objectif</h2>
      <ul>
        {#each L.objectifs as o, i (i)}<li>
            <Ar text={o.ar} {lettres} /> <span class="fr">{o.fr}</span>
          </li>{/each}
      </ul>
    </section>
  {/if}

  {#if lettres.length}
    <section>
      <h2>Je découvre</h2>
      <div class="letters">
        {#each lettres as x, i (i)}
          <div class="letter">
            <span class="ar big c{i % 4}" lang="ar" dir="rtl">{x.l}</span>
            {#if x.nom_ar}<Ar text={x.nom_ar} />{/if}
            {#if x.points_fr}<span class="fr">{x.points_fr}</span>{/if}
            {#if x.formes?.length}
              <span class="ar forms" lang="ar" dir="rtl">{x.formes.join('  ')}</span>
            {/if}
          </div>
        {/each}
      </div>
    </section>
  {/if}

  {#if L.lecture}
    <section>
      <h2>Je lis</h2>
      {#if L.lecture.syllabes?.length}
        <p class="line syllabes" dir="rtl">
          {#each L.lecture.syllabes as s, i (i)}<Ar text={s.ar} {lettres} />{/each}
        </p>
      {/if}
      {#each L.lecture.ligne ?? [] as g, i (i)}<Ar tag="p" text={g} {lettres} />{/each}
      {#if L.lecture.vedette}
        <div class="vedette">
          <Ar tag="p" text={L.lecture.vedette.ar} {lettres} />
          {#if L.lecture.vedette.fr && !isEval}<p class="fr">{L.lecture.vedette.fr}</p>{/if}
        </div>
      {/if}
      {#each L.lecture.phrases ?? [] as p, i (i)}
        <div class="phrase">
          <Ar tag="p" text={p.ar} {lettres} />
          {#if !isEval}<p class="fr">{p.fr}</p>{/if}
        </div>
      {/each}
    </section>
  {/if}

  {#if L.mots?.length}
    <section>
      <h2>Mes mots</h2>
      <ul class="mots">
        {#each L.mots as m, i (i)}<li>
            <Ar text={m.ar} {lettres} /> <span class="fr">{m.fr}</span>
          </li>{/each}
      </ul>
    </section>
  {/if}

  {#if L.exercices?.length}
    <section>
      <h2>Je m'entraîne</h2>
      {#each L.exercices as ex, i (i)}
        <Exercise {ex} id={u.exercises[i]?.id ?? `${u.id}.ex${i + 1}`} {lettres} />
      {/each}
    </section>
  {/if}

  {#if L.dialogue?.repliques?.length}
    <section>
      <h2>Je parle</h2>
      {#if L.dialogue.titre_ar}<Ar tag="p" text={L.dialogue.titre_ar} />{/if}
      <ol class="dialogue">
        {#each L.dialogue.repliques as r, i (i)}
          <li>
            {#if r.qui_ar}<Ar text={r.qui_ar} /> :{/if}
            <Ar text={r.ar} {lettres} />
            {#if r.fr}<p class="fr">{r.fr}</p>{/if}
          </li>
        {/each}
      </ol>
    </section>
  {/if}

  {#if L.coran?.versets?.length}
    <section class="coran">
      <h2>{L.coran.titre_fr ?? 'Coran'}</h2>
      {#if L.coran.titre_ar}<Ar tag="p" text={L.coran.titre_ar} />{/if}
      {#each L.coran.versets as v, i (i)}
        <div class="ayah" data-ref={v.ref_fr}>
          <Ar tag="p" quran text={v.ar} {lettres} />
          <div class="cap">
            <span class="ref">{v.ref_fr}</span>
            {#if v.consigne_fr}<span class="fr">{v.consigne_fr}</span>{/if}
          </div>
          {#if v.fr && !isEval}
            <details>
              <summary>Traduction du sens (AWFORM)</summary>
              <p class="fr">{v.fr}</p>
            </details>
          {/if}
        </div>
      {/each}
    </section>
  {/if}

  {#if L.checklist?.length}
    <section>
      <h2>Mon bilan</h2>
      <ul>
        {#each L.checklist as c, i (i)}<li>
            <Ar text={c.ar} /> <span class="fr">{c.fr}</span>
          </li>{/each}
      </ul>
    </section>
  {/if}
</article>

<style>
  .num {
    color: var(--teal);
    font-weight: 700;
    margin: 0;
  }
  h2 {
    font-size: 1.1rem;
    border-bottom: 2px solid var(--line);
    padding-bottom: 4px;
    margin-top: 28px;
  }
  .fr {
    color: var(--ink2);
  }
  .letters {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    direction: rtl;
  }
  .letter {
    display: flex;
    flex-direction: column;
    align-items: center;
    background: var(--card);
    border: 2px solid var(--line);
    border-radius: 16px;
    padding: 8px 16px;
    direction: ltr;
  }
  .big {
    font-size: calc(var(--ar-size) * 2.2);
    line-height: 1.4;
    text-decoration: none;
  }
  .forms {
    letter-spacing: 0.1em;
  }
  .syllabes {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 18px;
  }
  .line,
  .phrase,
  .vedette {
    text-align: right;
  }
  .ayah {
    margin: 12px 0;
    padding: 12px 16px;
    background: #f4f8fb;
    border-inline-start: 4px solid var(--navy);
    border-radius: 12px;
    text-align: right;
  }
  .ayah .cap {
    text-align: left;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    font-size: 0.9rem;
  }
  .ref {
    font-weight: 700;
    color: var(--navy);
  }
  .mots li,
  .dialogue li {
    margin: 6px 0;
  }
</style>
