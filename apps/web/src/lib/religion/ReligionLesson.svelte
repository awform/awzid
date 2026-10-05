<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { resolve } from '$app/paths';
  import type { SceneSpec } from '@awform/content/scene';
  import { tanwinDisplay } from '@awform/content/text';
  import Ar from '$lib/Ar.svelte';
  import Ecouter from '$lib/Ecouter.svelte';
  import Illus from '$lib/Illus.svelte';
  import Scene from '$lib/Scene.svelte';
  import { unitLabel, type UnitDetail } from '$lib/api';
  import { fmtNumber, t } from '$lib/i18n';
  import ReligionExercise from './ReligionExercise.svelte';
  import CasReponse from '$lib/CasReponse.svelte';
  import CarnetPersoCase from '$lib/CarnetPersoCase.svelte';
  import { casRef } from '$lib/pratique';

  /**
   * Lecteur des leçons des sciences islamiques (Religion Enfants « re », Ados/Adultes « ra ») : blocs du
   * livre de l'élève dans leur ordre (accroche, objectifs, scène, rubriques : textes, points, hadiths,
   * invocations, extraits des textes de l'école, tableaux, divergences, cas, repères, cartes, « le
   * saviez-vous »), Coran, mots, dialogue, exercices, retiens, bilan. Projection ÉLÈVE : ni guide ni
   * sources de l'enseignant ; numéros de hadiths seulement s'ils sont vérifiés au registre.
   */
  type Obj = Record<string, unknown>;
  let {
    unit,
    profileId,
    profileKind = null,
    progress,
    onChecklist,
  }: {
    unit: UnitDetail;
    profileId: string | null;
    profileKind?: string | null;
    progress: { status: string; bestScore: number | null } | null;
    onChecklist: (done: number, total: number) => void;
  } = $props();

  const L = $derived(unit.lesson as unknown as Obj);
  const profile = $derived(profileId && profileKind ? { id: profileId, kind: profileKind } : null);
  /** identifiant de l'exercice d'indice i (l'importeur numérote les positions à partir de 1) */
  const exId = (i: number) => unit.exercises.find((e) => e.position === i + 1)?.id ?? '';
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const arr = (v: unknown) => (Array.isArray(v) ? (v as Obj[]) : []);
  const rubriques = $derived(arr(L.rubriques));
  const exercices = $derived(arr(L.exercices));
  const livre = $derived(
    exercices.map((ex, i) => ({ ex, i })).filter((x) => x.ex.livre !== 'ecriture'),
  );
  const cahier = $derived(
    exercices.map((ex, i) => ({ ex, i })).filter((x) => x.ex.livre === 'ecriture'),
  );
  const coran = $derived((L.coran ?? null) as Obj | null);
  const dialogue = $derived((L.dialogue ?? null) as Obj | null);
  const accroche = $derived((L.accroche ?? null) as Obj | null);
  const checklist = $derived(arr(L.checklist));
  let checked: boolean[] = $state([]);
  function toggle(i: number, v: boolean) {
    checked[i] = v;
    onChecklist(checked.filter(Boolean).length, checklist.length);
  }
  const ECOLES = ['commun', 'malikite', 'hanafite', 'shafiite', 'hanbalite'] as const;
</script>

<article class="rel" data-unit={unit.id} data-testid="lecon-religion">
  <p class="nav">
    <a href={resolve('/niveaux/[code]', { code: unit.levelCode })}
      ><Bidi text={t('lecon.retour', { level: unit.levelCode })} /></a
    >
  </p>
  <header>
    <p class="num"><Bidi text={unitLabel(unit)} /> · <Bidi text={unit.titleFr} /></p>
    <h1><Ar text={str(L.titre_ar)} /></h1>
    <p class="sub"><Bidi text={str(L.titre_fr)} /></p>
    {#if progress}<p class="prog" data-testid="progression">
        <Bidi text={t('lecon.progression', { statut: t(`statut.${progress.status}`) })} /><Bidi
          text={progress.bestScore != null
            ? ` · ${fmtNumber(progress.bestScore, { style: 'percent' })}`
            : ''}
        />
      </p>{/if}
  </header>

  {#if accroche}
    <section class="card accroche">
      {#if accroche.img}<Illus k={str(accroche.img)} cls="pic" />{/if}
      <p><Bidi text={str(accroche.situation_fr)} /></p>
      <p class="q"><Bidi text={str(accroche.question_fr)} /></p>
    </section>
  {/if}

  {#if arr(L.objectifs).length}
    <section class="card">
      <h2>{t('rel.objectifs')}</h2>
      <ul>
        {#each arr(L.objectifs) as o, i (i)}<li>
            {#if str(o.ar)}<Ar text={str(o.ar)} /> —
            {/if}<Bidi text={str(o.fr)} />
          </li>{/each}
      </ul>
    </section>
  {/if}

  {#if L.scene}
    <Scene spec={L.scene as SceneSpec} lettres={[]} />
    {#if str((L.scene as Obj).bulle_fr)}<p class="bulle">
        <Bidi text={str((L.scene as Obj).bulle_fr)} />
      </p>{/if}
  {/if}

  {#each rubriques as r, ri (ri)}
    <section class="card rub" data-code={str(r.code)}>
      <h2>
        {#if str(r.titre_ar)}<Ar text={str(r.titre_ar)} />{/if}
        <span><Bidi text={str(r.titre_fr)} /></span>
      </h2>
      {#if str(r.intro_fr)}<p class="intro"><Bidi text={str(r.intro_fr)} /></p>{/if}
      {#if r.etape}{@const e = r.etape as Obj}
        <p class="etape">
          <Bidi text={str(e.periode_fr)} /> · <Bidi text={str(e.annee_fr)} /> · {#if str(e.lieu_ar)}<Ar
              text={str(e.lieu_ar)}
            />
          {/if}<Bidi text={str(e.lieu_fr)} />
        </p>{/if}
      {#each arr(r.texte) as p, i (i)}
        <div class="para">
          {#if str(p.ar)}<Ar text={str(p.ar)} tag="p" />{/if}
          <p><Bidi text={str(p.fr)} /></p>
        </div>
      {/each}
      {#if arr(r.points).length}
        <ul class="points">
          {#each arr(r.points) as p, i (i)}<li>
              {#if p.img}<Illus k={str(p.img)} cls="mini" />{/if}
              {#if str(p.ar)}<Ar text={str(p.ar)} />{/if}
              <span><Bidi text={str(p.fr)} /></span>
            </li>{/each}
        </ul>
      {/if}
      {#if arr(r.noms).length}
        <dl class="noms">
          {#each arr(r.noms) as nm, i (i)}
            <dt><Ar text={str(nm.ar)} /> — <Bidi text={str(nm.fr)} /></dt>
            <dd>
              <Bidi text={str(nm.explication_fr)} />
              <Bidi text={str(nm.exemple_fr)} />
              <span class="ref"><Bidi text={str(nm.ref_fr)} /></span>
            </dd>
          {/each}
        </dl>
      {/if}
      {#if r.bulles}{@const b = r.bulles as Obj}
        <div class="bulles">
          <p class="centre">
            {#if str((b.centre as Obj)?.ar)}<Ar text={str((b.centre as Obj).ar)} />
            {/if}<Bidi text={str((b.centre as Obj)?.fr)} />
          </p>
          <ul>
            {#each arr(b.autour) as a, i (i)}<li>
                {#if str(a.ar)}<Ar text={str(a.ar)} /> —
                {/if}<Bidi text={str(a.fr)} />
              </li>{/each}
          </ul>
        </div>
      {/if}
      {#if arr(r.situations).length}
        <ul class="situations">
          {#each arr(r.situations) as s, i (i)}<li
              class:bien={s.bien === true}
              class:mal={s.bien === false}
            >
              {#if s.img}<Illus k={str(s.img)} cls="mini" />{/if}
              <span
                >{#if str(s.ar)}<Ar text={str(s.ar)} /> —
                {/if}<Bidi text={str(s.fr)} /></span
              >
              <span class="pourquoi"
                ><Bidi text={s.bien ? t('rel.bien') : t('rel.pas_bien')} />
                <Bidi text={str(s.pourquoi_fr)} /></span
              >
            </li>{/each}
        </ul>
      {/if}
      {#each arr(r.hadiths) as h, i (i)}
        <blockquote class="hadith">
          {#if str(h.ar)}<Ar text={str(h.ar)} tag="p" /><Ecouter text={str(h.ar)} />{/if}
          <p>« <Bidi text={str(h.fr)} /> »</p>
          <p class="ref">
            {#if str(h.rawi_fr)}<Bidi text={t('rel.rapporte_par', { rawi: str(h.rawi_fr) })} /> ·
            {/if}<Bidi text={str(h.source_fr)} />
            {#if str(h.grade) === 'sahih'}
              · {t('rel.sahih')}{:else if str(h.grade) === 'hasan'}
              · {t('rel.hasan')}{/if}
          </p>
          {#if str(h.lecon_fr)}<p class="lecon"><Bidi text={str(h.lecon_fr)} /></p>{/if}
        </blockquote>
      {/each}
      {#each arr(r.duas) as d, i (i)}
        <div class="dua">
          <p class="moment">
            {#if str(d.moment_ar)}<Ar text={str(d.moment_ar)} /> —
            {/if}<Bidi text={str(d.moment_fr)} />
          </p>
          <Ar text={str(d.ar)} tag="p" /><Ecouter text={str(d.ar)} />
          <p><Bidi text={str(d.fr)} /></p>
          {#if str(d.source_fr)}<p class="ref"><Bidi text={str(d.source_fr)} /></p>{/if}
        </div>
      {/each}
      {#each arr(r.extraits) as x, i (i)}
        <figure class="extrait">
          {#if str(x.ar)}<Ar text={str(x.ar)} tag="p" />{/if}
          {#each arr(x.vers) as v, k (k)}<p class="vers" lang="ar" dir="rtl">
              {#each arr(v as unknown) as h, j (j)}<span
                  ><Bidi text={tanwinDisplay(String(h))} base="ar" /></span
                >{/each}
            </p>{/each}
          <p><Bidi text={str(x.fr)} /></p>
          {#if str(x.explication_fr)}<p class="expl"><Bidi text={str(x.explication_fr)} /></p>{/if}
          <figcaption>
            <Bidi text={str(x.ouvrage_fr)} /> — <Bidi
              text={str(x.auteur_fr)}
            />{#if str(x.localisation_fr)}, <Bidi text={str(x.localisation_fr)} />{/if}
          </figcaption>
        </figure>
      {/each}
      {#if r.tableau}{@const tb = r.tableau as Obj}
        <div class="tw">
          <table>
            <thead
              ><tr
                >{#each arr(tb.colonnes) as c, k (k)}<th><Bidi text={str(c.fr)} /></th>{/each}</tr
              ></thead
            >
            <tbody>
              {#each arr(tb.lignes) as row, k (k)}<tr>
                  {#each arr(row as unknown) as cell, j (j)}<td>
                      {#if cell && typeof cell === 'object'}{#if str((cell as Obj).ar)}<Ar
                            text={str((cell as Obj).ar)}
                          /><br />{/if}<Bidi text={str((cell as Obj).fr)} />{:else}<Bidi
                          text={String(cell ?? '')}
                        />{/if}
                    </td>{/each}
                </tr>{/each}
            </tbody>
          </table>
        </div>
      {/if}
      {#if arr(r.divergences).length}
        <div class="tw">
          <table class="div">
            <thead
              ><tr
                ><th>{t('rel.sujet')}</th>{#each ECOLES as e (e)}<th
                    ><Bidi text={t(`rel.ecole_${e}`)} /></th
                  >{/each}</tr
              ></thead
            >
            <tbody>
              {#each arr(r.divergences) as d, k (k)}<tr>
                  <td><Bidi text={str(d.sujet_fr)} /></td>{#each ECOLES as e (e)}<td
                      ><Bidi text={str(d[`${e}_fr`])} /></td
                    >{/each}
                </tr>{/each}
            </tbody>
          </table>
        </div>
      {/if}
      {#if r.carte}{@const c = r.carte as Obj}
        <figure class="carte">
          {#if c.img}<Illus k={str(c.img)} cls="map" />{/if}
          <ul>
            {#each arr(c.lieux) as l, k (k)}<li>
                {#if str(l.ar)}<Ar text={str(l.ar)} /> —
                {/if}<Bidi text={str(l.fr)} />
              </li>{/each}
          </ul>
          <figcaption><Bidi text={str(c.legende_fr)} /></figcaption>
        </figure>
      {/if}
      {#each arr(r.saviez) as s, i (i)}
        <aside class="saviez">
          <b>{t('rel.saviez')}</b> <b><Bidi text={str(s.titre_fr)} /></b>
          <Bidi text={str(s.fr)} />
        </aside>
      {/each}
      {#each arr(r.cas) as cs, i (i)}
        <div class="cas" data-cas={i}>
          <h3><Bidi text={str(cs.titre_fr)} /></h3>
          <p class="situation"><Bidi text={str(cs.situation_fr)} /></p>
          <p class="q"><Bidi text={str(cs.question_fr)} /></p>
          {#if arr(cs.etapes_fr).length}
            <details>
              <summary>{t('rel.raisonnement')}</summary>
              <ol>
                {#each arr(cs.etapes_fr) as e, k (k)}<li><Bidi text={String(e)} /></li>{/each}
              </ol>
            </details>
          {/if}
          {#if cs.resolu === false && profile?.kind === 'adulte' && unit.id.startsWith('ra')}
            <!-- adulte autonome : réponse proposée après sa propre réponse (règle vérifiée par le serveur) -->
            <CasReponse profileId={profile.id} unitId={unit.id} casRef={casRef(ri, i)} />
          {/if}
        </div>
      {/each}
      {#if arr(r.lecons).length}
        <ul class="lecons">
          {#each arr(r.lecons) as l, i (i)}<li><Bidi text={str(l.fr)} /></li>{/each}
        </ul>
      {/if}
      {#if arr(r.versets_ref).length}
        <ul class="versets-ref">
          {#each arr(r.versets_ref) as v, i (i)}<li>
              <span class="ref"><Bidi text={str(v.ref_fr)} /></span>
              <Bidi text={str(v.sens_fr)} />
            </li>{/each}
        </ul>
      {/if}
      {#if arr(r.retiens).length}
        <div class="retiens">
          {#each arr(r.retiens) as x, i (i)}<p>
              {#if str(x.ar)}<Ar text={str(x.ar)} /> —
              {/if}<Bidi text={str(x.fr)} />
            </p>{/each}
        </div>
      {/if}
    </section>
  {/each}

  {#if coran}
    <section class="card coran" data-testid="coran-rel">
      <h2>
        {#if str(coran.titre_ar)}<Ar text={str(coran.titre_ar)} />{/if}
        <span><Bidi text={str(coran.titre_fr)} /></span>
      </h2>
      {#each arr(coran.versets) as v, i (i)}
        <div class="verset">
          <Ar text={str(v.ar)} tag="p" quran />
          <p><Bidi text={str(v.fr)} /> <span class="ref"><Bidi text={str(v.ref_fr)} /></span></p>
          {#if str(v.consigne_fr)}<p class="consigne"><Bidi text={str(v.consigne_fr)} /></p>{/if}
        </div>
      {/each}
      {#if (coran.sourate as Obj)?.num}
        <p>
          <!-- eslint-disable svelte/no-navigation-without-resolve -- chemin résolu, suivi d'un paramètre -->
          <a
            class="button"
            href={`${resolve('/coran/lecteur')}?s=${Number((coran.sourate as Obj).num)}`}
            >{t('rel.ouvrir_lecteur')}</a
          >
          <!-- eslint-enable svelte/no-navigation-without-resolve -->
        </p>
      {/if}
      {#if arr(coran.lecons).length}<ul>
          {#each arr(coran.lecons) as l, i (i)}<li><Bidi text={str(l.fr)} /></li>{/each}
        </ul>{/if}
      {#if str(coran.tafsir_fr)}<p class="expl"><Bidi text={str(coran.tafsir_fr)} /></p>{/if}
    </section>
  {/if}

  {#if arr(L.mots).length}
    <section class="card">
      <h2>{t('rel.mots')}</h2>
      <ul class="mots">
        {#each arr(L.mots) as m, i (i)}<li>
            {#if m.img}<Illus k={str(m.img)} cls="mini" />{/if}<Ar text={str(m.ar)} /><span
              ><Bidi text={str(m.fr)} /></span
            >
          </li>{/each}
      </ul>
    </section>
  {/if}

  {#if dialogue}
    <section class="card dialogue">
      <h2>
        {#if str(dialogue.titre_ar)}<Ar text={str(dialogue.titre_ar)} />{/if}
        <span><Bidi text={str(dialogue.titre_fr)} /></span>
      </h2>
      {#if str(dialogue.consigne_fr)}<p class="consigne">
          <Bidi text={str(dialogue.consigne_fr)} />
        </p>{/if}
      {#each arr(dialogue.repliques) as rp, i (i)}
        <p class="rep">
          <b><Bidi text={str(rp.qui)} /></b>
          <Ar text={str(rp.ar)} /> <span class="fr"><Bidi text={str(rp.fr)} /></span>
        </p>
      {/each}
    </section>
  {/if}

  {#if livre.length}
    <section class="card">
      <h2>{t('rel.exercices')}</h2>
      {#each livre as x, k (x.i)}<ReligionExercise
          ex={x.ex}
          n={k + 1}
          {profile}
          exerciseId={exId(x.i)}
        />{/each}
    </section>
  {/if}
  {#if cahier.length}
    <section class="card">
      <h2>{t('rel.cahier')}</h2>
      {#each cahier as x, k (x.i)}<ReligionExercise
          ex={x.ex}
          n={k + 1}
          {profile}
          exerciseId={exId(x.i)}
        />{/each}
    </section>
  {/if}

  {#if arr(L.retiens).length}
    <section class="card retiens">
      <h2>{t('lecon.je_retiens')}</h2>
      {#each arr(L.retiens) as x, i (i)}<p>
          {#if str(x.ar)}<Ar text={str(x.ar)} /> —
          {/if}<Bidi text={str(x.fr)} />
        </p>{/each}
    </section>
  {/if}

  {#if L.carnet}{@const cn = L.carnet as Obj}
    <section class="card">
      <h2>{t('rel.carnet')}</h2>
      <p>
        {#if str(cn.ar)}<Ar text={str(cn.ar)} /> —
        {/if}<Bidi text={str(cn.fr)} />
      </p>
      {#if profile?.kind === 'adulte' && unit.id.startsWith('ra')}
        <!-- adulte : liste personnelle à cocher, sans signature -->
        <CarnetPersoCase profileId={profile.id} unitId={unit.id} />
      {/if}
    </section>
  {/if}

  {#if checklist.length}
    <section class="card recap">
      <h2>{t('lecon.mon_bilan')}</h2>
      {#each checklist as c, i (i)}
        <label class="check"
          ><input
            type="checkbox"
            checked={checked[i] ?? false}
            onchange={(e) => toggle(i, e.currentTarget.checked)}
          />
          <span
            >{#if str(c.ar)}<Ar text={str(c.ar)} /> —
            {/if}<Bidi text={str(c.fr)} /></span
          ></label
        >
      {/each}
    </section>
  {/if}
  <p class="muted small"><Bidi text={t('rel.fidelite')} /></p>
</article>

<style>
  .rel {
    display: grid;
    gap: 12px;
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
  .rub h2,
  .coran h2,
  .dialogue h2 {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: baseline;
  }
  .intro {
    font-style: italic;
  }
  .points,
  .mots,
  .situations {
    list-style: none;
    padding: 0;
    display: grid;
    gap: 6px;
  }
  .points li,
  .mots li,
  .situations li {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  .situations .bien {
    border-inline-start: 4px solid var(--ok-ink);
    padding-inline-start: 6px;
  }
  .situations .mal {
    border-inline-start: 4px solid var(--bad-ink);
    padding-inline-start: 6px;
  }
  .pourquoi {
    color: var(--ink2);
    font-size: 0.92rem;
  }
  .hadith,
  .extrait,
  .dua {
    margin: 8px 0;
    padding: 8px 12px;
    background: var(--sand);
    border-radius: 10px;
  }
  .vers {
    display: flex;
    justify-content: space-between;
    gap: 16px;
  }
  .lecon,
  .expl {
    font-style: italic;
  }
  .saviez {
    background: var(--info-bg);
    border-radius: 10px;
    padding: 8px 10px;
  }
  .cas .situation {
    background: var(--warn-bg);
    border-radius: 8px;
    padding: 6px 8px;
  }
  .q {
    font-weight: 700;
  }
  .retiens {
    background: var(--ok-bg);
  }
  .tw {
    overflow-x: auto;
  }
  table {
    border-collapse: collapse;
    width: 100%;
  }
  th,
  td {
    border: 1px solid var(--line);
    padding: 4px 6px;
    text-align: start;
    vertical-align: top;
  }
  .bulle {
    font-style: italic;
  }
  .check {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .consigne {
    font-style: italic;
  }
  :global(.rel .mini) {
    width: 56px;
    height: 56px;
  }
  :global(.rel .pic) {
    width: 120px;
    height: 120px;
  }
  :global(.rel .map) {
    width: 100%;
    max-width: 480px;
  }
  .small {
    font-size: 0.9rem;
  }
</style>
