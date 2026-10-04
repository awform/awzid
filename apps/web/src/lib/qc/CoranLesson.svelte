<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { resolve } from '$app/paths';
  import { unitLabel, type UnitDetail } from '$lib/api';
  import { fmtNumber, t } from '$lib/i18n';
  import QcExercise from './QcExercise.svelte';
  import QcText from './QcText.svelte';

  /**
   * Lecteur des livrets « Lecture du Coran » (qc1 à qc3, lot 28), dans l'ordre des quatre pages du livret :
   * j'écoute et j'observe (lettres, signes, notion, geste), je lis sur l'échelle (de bas en haut ; barreaux
   * du Coran en graphie du Muṣḥaf, les autres en écriture courante), je distingue et je m'entraîne
   * (exercices), je lis dans le Muṣḥaf ; puis « je sais », avec un adulte, pour aller plus loin. Projection
   * ÉLÈVE : ni guide de l'enseignant, ni extrait non préparé hors session, ni sens des versets en épreuve.
   */
  type Obj = Record<string, unknown>;
  let {
    unit,
    progress,
    onChecklist,
  }: {
    unit: UnitDetail;
    progress: { status: string; bestScore: number | null } | null;
    onChecklist: (done: number, total: number) => void;
  } = $props();

  const L = $derived(unit.lesson as unknown as Obj);
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const arr = (v: unknown) => (Array.isArray(v) ? (v as Obj[]) : []);
  const lettres = $derived(arr(L.lettres) as Array<Obj & { l: string }>);
  const evaluation = $derived(unit.kind !== 'lecon');
  /** échelle : on lit de bas en haut → le barreau 1 en bas */
  const echelle = $derived([...arr(L.echelle)].reverse());
  const observe = $derived((L.observe ?? null) as Obj | null);
  const notion = $derived((L.notion ?? null) as Obj | null);
  const geste = $derived((L.geste ?? null) as Obj | null);
  const notes = $derived((L.notes ?? null) as Obj | null);
  const jeSais = $derived(arr(L.je_sais));
  let checked: boolean[] = $state([]);
  function toggle(i: number, v: boolean) {
    checked[i] = v;
    onChecklist(checked.filter(Boolean).length, jeSais.length);
  }
</script>

<article class="qc" data-unit={unit.id} data-testid="lecon-coran">
  <p class="nav">
    <a href={resolve('/niveaux/[code]', { code: unit.levelCode })}
      ><Bidi text={t('lecon.retour', { level: unit.levelCode })} /></a
    >
  </p>
  <header>
    <p class="num"><Bidi text={unitLabel(unit)} /> · <Bidi text={unit.titleFr} /></p>
    <h1><QcText text={str(L.titre_ar)} {lettres} /></h1>
    <p class="sub"><Bidi text={str(L.titre_fr)} /></p>
    {#if progress}<p class="prog" data-testid="progression">
        <Bidi text={t('lecon.progression', { statut: t(`statut.${progress.status}`) })} /><Bidi
          text={progress.bestScore != null
            ? ` · ${fmtNumber(progress.bestScore, { style: 'percent' })}`
            : ''}
        />
      </p>{/if}
  </header>

  {#if str(L.consigne_fr)}<p class="card"><Bidi text={str(L.consigne_fr)} /></p>{/if}
  {#if notes}
    <p class="muted" data-testid="qc-bareme">
      <Bidi
        text={t('qc.notes', {
          lecture: Number(notes.lecture ?? 0),
          ecrit: Number(notes.ecrit ?? 0),
        })}
      />
    </p>
  {/if}

  {#if arr(L.objectifs).length}
    <section class="card">
      <h2>{t('qc.objectifs')}</h2>
      <ul>
        {#each arr(L.objectifs) as o, i (i)}<li>
            {#if str(o.ar)}<QcText text={str(o.ar)} {lettres} /> —
            {/if}<Bidi text={str(o.fr)} />
          </li>{/each}
      </ul>
    </section>
  {/if}

  {#if lettres.length || observe || arr(L.signes).length}
    <section class="card" data-testid="qc-observe">
      <h2>{t('qc.observe')}</h2>
      {#if observe}
        <p><Bidi text={str(observe.texte_fr)} /></p>
        {#if arr(observe.points).length}
          <ul>
            {#each arr(observe.points) as p, i (i)}<li><Bidi text={str(p.fr)} /></li>{/each}
          </ul>
        {/if}
      {/if}
      {#if lettres.length}
        <ul class="lettres">
          {#each lettres as x, i (i)}
            <li>
              <span class="grande"><QcText text={`[${x.l}]`} {lettres} /></span>
              {#if str(x.nom_ar)}<QcText text={str(x.nom_ar)} />{/if}
              <small><Bidi text={str(x.points_fr)} /></small>
              {#if Array.isArray(x.formes)}<span class="formes" dir="rtl"
                  >{#each x.formes as f, k (k)}<QcText text={String(f)} />{/each}</span
                >{/if}
            </li>
          {/each}
        </ul>
      {/if}
      {#if arr(L.signes).length}
        <h3>{t('qc.signes')}</h3>
        <ul class="signes">
          {#each arr(L.signes) as s, i (i)}
            <li>
              <span class="grande"><QcText text={str(s.sg)} /></span>
              {#if str(s.nom_ar)}<QcText text={str(s.nom_ar)} />{/if}
              <span><Bidi text={str(s.fr)} /></span>
            </li>
          {/each}
        </ul>
      {/if}
      {#if notion}
        <p class="notion">
          {#if str(notion.texte_ar)}<QcText text={str(notion.texte_ar)} {lettres} /> —
          {/if}<Bidi text={str(notion.texte_fr)} />
        </p>
      {/if}
      {#if geste}
        <p class="geste">
          {#if str(geste.ar)}<QcText text={str(geste.ar)} /> —
          {/if}<Bidi text={str(geste.fr)} />
        </p>
      {/if}
    </section>
  {/if}

  {#if echelle.length}
    <section class="card" data-testid="qc-echelle">
      <h2>{t('qc.echelle')}</h2>
      {#if str(L.echelle_fr)}<p class="muted"><Bidi text={str(L.echelle_fr)} /></p>{/if}
      <ol class="echelle">
        {#each echelle as r (Number(r.n))}
          <li data-barreau={Number(r.n)}>
            <span class="barreau"><Bidi text={t('qc.barreau', { n: Number(r.n) })} /></span>
            {#if str(r.titre_fr)}<span class="muted"
                >{#if str(r.titre_ar)}<QcText text={str(r.titre_ar)} /> —
                {/if}<Bidi text={str(r.titre_fr)} /></span
              >{/if}
            <span class="ligne" dir="rtl">
              {#each Array.isArray(r.items) ? (r.items as unknown[]) : [] as it, k (k)}
                {#if typeof it === 'string'}<QcText text={it} {lettres} />
                {:else if it && typeof it === 'object'}
                  {@const o = it as Obj}
                  <span class="mot-coran"
                    ><QcText text={str(o.ar)} quran={str(o.src).startsWith('Q:')} {lettres} />
                    {#if str(o.ref_fr)}<small dir="ltr"
                        ><Bidi text={str(o.ref_fr)} base="ar" /></small
                      >{/if}</span
                  >
                {/if}
              {/each}
            </span>
          </li>
        {/each}
      </ol>
    </section>
  {/if}

  {#if arr(L.exercices).length}
    <section class="card" data-testid="qc-exercices">
      <h2>{t('qc.exercices')}</h2>
      {#each arr(L.exercices) as ex, i (i)}
        <QcExercise {ex} n={i + 1} {lettres} {evaluation} />
      {/each}
    </section>
  {/if}

  {#if arr(L.mushaf).length}
    <section class="card mushaf" data-testid="qc-mushaf">
      <h2>{t('qc.mushaf')}</h2>
      {#if str(L.mushaf_fr)}<p class="muted"><Bidi text={str(L.mushaf_fr)} /></p>{/if}
      {#each arr(L.mushaf) as m, i (i)}
        <div class="verset">
          {#if m.non_prepare && !str(m.ar)}
            <p class="muted" data-testid="qc-non-prepare">{t('qc.non_prepare')}</p>
          {:else}
            {#if str(m.consigne_fr)}<p class="consigne"><Bidi text={str(m.consigne_fr)} /></p>{/if}
            <p class="texte"><QcText text={str(m.ar)} quran {lettres} /></p>
            <p class="ref"><Bidi text={str(m.ref_fr)} /></p>
            {#if str(m.sens_fr)}<p class="sens">
                {t('qc.sens')}
                <Bidi text={str(m.sens_fr)} />
              </p>{/if}
          {/if}
        </div>
      {/each}
    </section>
  {/if}

  {#if arr(L.oral).length}
    <section class="card">
      <h2>{t('qc.oral')}</h2>
      <ul>
        {#each arr(L.oral) as o, i (i)}<li>
            <Bidi text={str(o.fr)} />
            {#if o.points}<small><Bidi text={t('qc.oral_points', { n: Number(o.points) })} /></small
              >{/if}
          </li>{/each}
      </ul>
    </section>
  {/if}

  {#if jeSais.length}
    <section class="card recap">
      <h2>{t('lecon.mon_bilan')}</h2>
      {#each jeSais as c, i (i)}
        <label class="check"
          ><input
            type="checkbox"
            checked={checked[i] ?? false}
            onchange={(e) => toggle(i, e.currentTarget.checked)}
          />
          <span
            >{#if str(c.ar)}<QcText text={str(c.ar)} {lettres} /> —
            {/if}<Bidi text={str(c.fr)} /></span
          ></label
        >
      {/each}
    </section>
  {/if}

  {#if str(L.avec_adulte)}
    <section class="card">
      <h2>{t('qc.avec_adulte')}</h2>
      <p><Bidi text={str(L.avec_adulte)} /></p>
    </section>
  {/if}
  {#if str(L.plus_loin)}
    <section class="card">
      <h2>{t('qc.plus_loin')}</h2>
      <p><Bidi text={str(L.plus_loin)} /></p>
    </section>
  {/if}
  {#if str(L.carnet_fr)}
    <p class="card"><strong>{t('qc.carnet')}</strong> <Bidi text={str(L.carnet_fr)} /></p>
  {/if}
  <p class="muted small"><Bidi text={t('qc.fidelite')} /></p>
</article>

<style>
  .qc {
    display: grid;
    gap: 12px;
    --ar-size: 26px;
  }
  header h1 {
    margin: 0;
    font-size: 2rem;
  }
  .sub {
    margin: 0;
    font-weight: 700;
  }
  .num,
  .ref {
    color: var(--ink2);
    font-size: 0.9rem;
  }
  .lettres,
  .signes {
    list-style: none;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 160px), 1fr));
    gap: 8px;
  }
  .lettres li,
  .signes li {
    display: grid;
    gap: 4px;
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 8px;
    text-align: center;
  }
  .grande {
    font-size: 2.2rem;
  }
  .formes {
    display: flex;
    gap: 8px;
    justify-content: center;
  }
  .echelle {
    list-style: none;
    padding: 0;
    display: grid;
    gap: 8px;
  }
  .echelle li {
    display: grid;
    gap: 4px;
    border-inline-start: 4px solid var(--accent);
    padding-inline-start: 10px;
  }
  .barreau {
    font-weight: 700;
    font-size: 0.9rem;
  }
  .ligne {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 16px;
  }
  .mot-coran {
    display: inline-grid;
    justify-items: center;
  }
  .verset {
    border-top: 1px solid var(--line);
    padding-top: 8px;
  }
  .texte {
    margin: 4px 0;
    text-align: right;
  }
  .consigne,
  .sens {
    font-style: italic;
  }
  .check {
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 4px 0;
  }
  .small {
    font-size: 0.9rem;
  }
</style>
