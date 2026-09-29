<script lang="ts">
  import { onMount, setContext } from 'svelte';
  import { resolve } from '$app/paths';
  import Ar from '$lib/Ar.svelte';
  import Exercise from '$lib/Exercise.svelte';
  import ReligionLesson from '$lib/religion/ReligionLesson.svelte';
  import TutorPanel from '$lib/TutorPanel.svelte';
  import Illus from '$lib/Illus.svelte';
  import Scene from '$lib/Scene.svelte';
  import Sprite from '$lib/Sprite.svelte';
  import { arabicSize, unitLabel } from '$lib/api';
  import { fmtNumber, t } from '$lib/i18n';
  import { demoProfileFor, enqueue, flush, onProgress } from '$lib/attempts';
  import type { ItemResponse } from '@awform/grading';
  import { personaKey, type SceneSpec } from '@awform/content/scene';

  /**
   * Lecteur de leçon : ordre et règles d'affichage du moteur des livres (awform.js : lectureLesson,
   * lectureBilan, coran, dialogue, lessonCheck, ecritureLesson). La leçon reçue est la projection ÉLÈVE :
   * ni guide, ni translittération, ni texte non préparé, ni traduction des versets dans un bilan.
   */
  let { data } = $props();
  setContext('illustrations', () => data.illustrations);

  const u = $derived(data.unit);
  /** leçons des sciences islamiques (Religion Enfants re, Ados/Adultes ra) : lecteur dédié */
  const religion = $derived(/^r[ea]\d/.test(u.levelCode));
  const L = $derived(data.unit.lesson);
  const lettres = $derived(L.lettres ?? []);
  const isEval = $derived(u.kind !== 'lecon');
  const livreEx = $derived(
    (L.exercices ?? []).map((ex, i) => ({ ex, i })).filter((x) => x.ex.livre !== 'ecriture'),
  );
  const cahierEx = $derived(
    (L.exercices ?? []).map((ex, i) => ({ ex, i })).filter((x) => x.ex.livre === 'ecriture'),
  );
  type Obj = Record<string, unknown>;
  const R = $derived((L.lecture ?? {}) as Obj & NonNullable<typeof L.lecture>);
  const phrases = $derived([
    ...((R.phrases ?? []) as Array<{ ar: string; fr?: string }>),
    ...((R.paragraphes ?? []) as Array<string | { ar: string; fr?: string }>).map((p) =>
      typeof p === 'string' ? { ar: p } : p,
    ),
  ] as Array<{ ar: string; fr?: string }>);
  const E = $derived((L.ecriture ?? {}) as Obj);
  const dialogue = $derived(L.dialogue as (Obj & NonNullable<typeof L.dialogue>) | undefined);
  const Q = $derived(L.coran as (Obj & NonNullable<typeof L.coran>) | undefined);
  const fiqh = $derived(
    L.fiqh_adab as
      | { titre_ar?: string; titre_fr?: string; points?: Array<{ ar?: string; fr?: string }> }
      | undefined,
  );
  const lexique = $derived((L.lexique ?? []) as Array<{ ar: string; fr?: string }>);
  const oral = $derived((L.oral ?? []) as Array<{ fr?: string; points?: number }>);
  const checkItems = $derived(L.checklist ?? L.objectifs ?? []);

  // dialogue : côté (gauche/droite) par personnage, dans l'ordre d'apparition
  const sides = $derived.by(() => {
    const m: Record<string, number> = {};
    let n = 0;
    for (const r of dialogue?.repliques ?? []) if (r.qui && !(r.qui in m)) m[r.qui] = n++ % 2;
    return m;
  });

  // tentatives : profil actif du compte connecté (sans profil, les réponses ne sont pas enregistrées)
  let profileId: string | null = $state(null);
  let profileInfo: { id: string; kind: string; birthYear: number | null } | null = $state(null);
  /** mots de la leçon (bouton « Je ne comprends pas le mot… » du tuteur) */
  const lessonWords = $derived(
    ((L as unknown as { mots?: Array<{ ar?: string }> }).mots ?? [])
      .map((m) => (m.ar ?? '').replace(/[[\]]/g, ''))
      .filter(Boolean)
      .slice(0, 40),
  );
  let progress: { status: string; score: number | null; bestScore: number | null } | null =
    $state(null);
  onMount(() => {
    void demoProfileFor(u.levelCode).then((p) => {
      profileId = p?.id ?? null;
      profileInfo = p ? { id: p.id, kind: p.kind, birthYear: p.birthYear } : null;
      void flush();
    });
    return onProgress((unitId, p) => {
      if (unitId === u.id) progress = p;
    });
  });
  function record(i: number, itemIndex: number, response: ItemResponse) {
    const meta = u.exercises[i];
    if (!profileId || !meta) return;
    enqueue({
      profileId,
      unitId: u.id,
      eventType: 'reponse',
      exerciseId: meta.id,
      exerciseHash: meta.hash,
      itemIndex,
      response,
    });
  }
  function toggleReligion(done: number, total: number) {
    if (profileId)
      enqueue({
        profileId,
        unitId: u.id,
        eventType: 'checklist',
        response: { checked: done, total },
      });
  }
  let checked: boolean[] = $state([]);
  const nChecked = $derived(checked.filter(Boolean).length);
  function toggle(i: number, v: boolean) {
    checked[i] = v;
    if (profileId)
      enqueue({
        profileId,
        unitId: u.id,
        eventType: 'checklist',
        response: { checked: checked.filter(Boolean).length, total: checkItems.length },
      });
  }
</script>

<svelte:head><title>{t('app.nom')} — {unitLabel(u)} · {u.titleFr}</title></svelte:head>

<Sprite illustrations={data.illustrations} />

{#if religion}
  <ReligionLesson unit={u} {profileId} {progress} onChecklist={toggleReligion} />
{:else}
  <article
    class="lesson"
    class:eval={isEval}
    style="--ar-size: {arabicSize(u.levelCode)}px"
    data-unit={u.id}
  >
    <p class="nav">
      <a href={resolve('/niveaux/[code]', { code: u.levelCode })}
        >{t('lecon.retour', { level: u.levelCode })}</a
      >
    </p>
    <header class="ltitle">
      <p class="num">{unitLabel(u)} · {u.titleFr}</p>
      <h1 class="ar" lang="ar" dir="rtl">
        <Ar text={L.titre_ar} {lettres} />
        {#if lettres.length && !isEval}<span class="fam"
            >{#each lettres as x, i (i)}<span class="c{i % 4}">{x.l}</span>{/each}</span
          >{/if}
      </h1>
      {#if progress}<p class="prog" data-testid="progression">
          {t('lecon.progression', { statut: t(`statut.${progress.status}`) })}{progress.bestScore !=
          null
            ? ` · ${fmtNumber(progress.bestScore, { style: 'percent' })}`
            : ''}
        </p>{/if}
    </header>

    {#if isEval && lettres.length}
      <p class="readline big" dir="rtl">
        {#each lettres as x, i (i)}<span class="c{i % 4}">{x.l}</span>{/each}
      </p>
    {/if}

    {#if L.scene}
      <Scene spec={L.scene as SceneSpec} {lettres} />
      {#if (L.scene as SceneSpec).bulle_fr}<p class="bulle fr">
          « {(L.scene as SceneSpec).bulle_fr} »
        </p>{/if}
    {/if}

    {#if L.objectifs?.length && !isEval}
      <div class="goal">
        <svg viewBox="0 0 40 40" aria-hidden="true"
          ><circle cx="20" cy="20" r="18" fill="#E5484D" /><circle
            cx="20"
            cy="20"
            r="12"
            fill="#fff"
          /><circle cx="20" cy="20" r="6" fill="#E5484D" /></svg
        >
        <div>
          <Ar text={'هَدَفِي: ' + L.objectifs[0]!.ar} {lettres} />
          <p class="fr">{t('lecon.objectif', { texte: L.objectifs[0]!.fr })}</p>
        </div>
      </div>
    {/if}

    {#if !isEval && lettres.some((x) => x.nom_ar)}
      <section class="blk">
        <h2>
          <Ar text="أَكْتَشِفُ" />
          <span>{(L.decouvre_fr as string) ?? t('lecon.je_decouvre')}</span>
        </h2>
        {#if L.decouvre_ar}<Ar tag="p" text={L.decouvre_ar as string} />{/if}
        <div class="letters">
          {#each lettres as x, i (i)}
            <div class="fcard b{i % 4}">
              <span class="pos">{i + 1}</span>
              <span class="big c{i % 4}" lang="ar">{x.l}</span>
              {#if x.nom_ar}<span class="ar c{i % 4}" lang="ar">{x.nom_ar}</span>{/if}
              {#if x.points_ar}<span class="ar dots" lang="ar">{x.points_ar}</span>{/if}
              <span class="fr">{x.nom_fr ?? ''}{x.points_fr ? ` · ${x.points_fr}` : ''}</span>
            </div>
          {/each}
        </div>
      </section>
    {/if}

    {#if !isEval && lettres.some((x) => x.formes)}
      <section class="blk">
        <h2><Ar text="أَشْكَالُ الْحَرْفِ" /> <span>{t('lecon.formes')}</span></h2>
        <div class="tw">
          <table class="forms" dir="rtl">
            <thead
              ><tr
                ><th></th><th
                  ><Ar text="مُنْفَصِلٌ" /><br /><span class="fr">{t('lecon.forme_isolee')}</span
                  ></th
                ><th
                  ><Ar text="فِي الْأَوَّلِ" /><br /><span class="fr">{t('lecon.forme_debut')}</span
                  ></th
                ><th
                  ><Ar text="فِي الْوَسَطِ" /><br /><span class="fr">{t('lecon.forme_milieu')}</span
                  ></th
                ><th
                  ><Ar text="فِي الْآخِرِ" /><br /><span class="fr">{t('lecon.forme_fin')}</span
                  ></th
                ></tr
              ></thead
            >
            <tbody>
              {#each lettres.filter((x) => x.formes) as x, i (i)}
                <tr>
                  <td class="ar c{lettres.indexOf(x) % 4}" lang="ar">{x.l}</td>
                  {#each x.formes ?? [] as f, k (k)}<td
                      class="ar c{lettres.indexOf(x) % 4}"
                      lang="ar">{f}</td
                    >{/each}
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </section>
    {/if}

    {#if L.notion || R.syllabes || R.ligne || phrases.length || R.vedette || R.non_prepare}
      <section class="blk">
        {#if L.notion}
          {@const N = L.notion as {
            titre_ar?: string;
            titre_fr?: string;
            signe?: string;
            texte_ar?: string;
            texte_fr?: string;
          }}
          <h2>
            <Ar text={N.titre_ar ?? 'أَقْرَأُ'} /> <span>{N.titre_fr ?? t('lecon.je_lis')}</span>
          </h2>
          <div class="notion">
            {#if N.signe}<span class="mk ar" lang="ar">{N.signe}</span>{/if}
            {#if N.texte_ar}<Ar text={N.texte_ar} {lettres} />{/if}
            {#if N.texte_fr}<p class="fr">{N.texte_fr}</p>{/if}
          </div>
        {:else}
          <h2>
            <Ar text="أَقْرَأُ" /> <span>{isEval ? t('lecon.je_relis') : t('lecon.je_lis')}</span>
          </h2>
        {/if}
        {#if R.syllabes?.length}
          <div class="syl" dir="rtl">
            {#each R.syllabes as s, i (i)}<span class="sylc"><Ar text={s.ar} {lettres} /></span
              >{/each}
          </div>
        {/if}
        {#if R.ligne?.length}
          <p class="hint fr">
            {R.vedette && !R.non_prepare ? t('lecon.ligne_vedette') : t('lecon.ligne')}
          </p>
          <p class="readline" dir="rtl">
            {#each R.ligne as w, i (i)}<span><Ar text={w} {lettres} /></span>{/each}
            {#if R.vedette && !R.non_prepare}<span class="star-word"
                ><Ar text={R.vedette.ar} {lettres} /></span
              >{/if}
          </p>
        {/if}
        {#if R.non_prepare}
          <div class="np-box" data-testid="non-prepare">
            <b class="fr">{t('lecon.non_prepare')}</b>
            <Ar text="نَصٌّ يُوَزِّعُهُ الْمُعَلِّمُ يَوْمَ الِاخْتِبَارِ" />
          </div>
        {:else}
          {#if R.vedette}
            <div class="note">
              <Ar text={R.vedette.ar} {lettres} />
              {#if R.vedette.fr}<span class="fr"> — « {R.vedette.fr} »</span>{/if}
              {#if R.vedette.note_fr}<span class="fr"> {R.vedette.note_fr}</span>{/if}
            </div>
          {/if}
          {#each phrases as p, i (i)}
            <div class="phrase">
              <Ar tag="p" text={p.ar} {lettres} />
              {#if p.fr}<p class="fr">{p.fr}</p>{/if}
            </div>
          {/each}
        {/if}
      </section>
    {/if}

    {#if L.mots?.length}
      <section class="blk">
        <h2><Ar text="أَسْمَعُ وَأُرَدِّدُ" /> <span>{t('lecon.ecoute_repete')}</span></h2>
        <p class="hint fr">
          {(L.mots_fr as string) ?? t('lecon.mots_consigne')}
        </p>
        <div class="words">
          {#each L.mots as w, i (i)}
            <div class="wc">
              <Illus k={w.img} label={w.fr} />
              <Ar text={w.ar} {lettres} />
              <span class="fr">{w.fr}</span>
            </div>
          {/each}
        </div>
      </section>
    {/if}

    {#if isEval && dialogue?.repliques?.length}
      {@render dlg()}
    {/if}
    {#if isEval && Q}
      {@render coran()}
    {/if}
    {#if isEval && fiqh?.points?.length}
      {@render fiqhBlock()}
    {/if}

    {#if livreEx.length}
      <section class="blk">
        <h2>
          <Ar text={isEval ? 'حَصِيلَةٌ' : 'أَتَدَرَّبُ'} />
          <span>{isEval ? t('lecon.mes_exercices') : t('lecon.entraine')}</span>
        </h2>
        {#each livreEx as { ex, i } (i)}
          <Exercise
            {ex}
            id={u.exercises[i]?.id ?? `${u.id}.ex${i + 1}`}
            {lettres}
            onanswer={(k, r) => record(i, k, r)}
          />
        {/each}
      </section>
    {/if}

    {#if !isEval && dialogue?.repliques?.length}
      {@render dlg()}
    {/if}

    {#if lexique.length}
      <section class="blk">
        <h2><Ar text="مُعْجَمُ الدَّرْسِ" /> <span>{t('lecon.lexique')}</span></h2>
        <div class="lex">
          {#each lexique as x, i (i)}<div>
              <Ar text={x.ar} /> <span class="fr">{x.fr ?? ''}</span>
            </div>{/each}
        </div>
      </section>
    {/if}

    {#if !isEval && Q}
      {@render coran()}
    {/if}
    {#if !isEval && fiqh?.points?.length}
      {@render fiqhBlock()}
    {/if}

    {#if oral.length}
      <section class="blk">
        <h2><Ar text="الِاخْتِبَارُ الشَّفَهِيُّ" /> <span>{t('lecon.oral')}</span></h2>
        <ol>
          {#each oral as o, i (i)}<li>
              <span class="fr">{o.fr}</span>{#if o.points != null}
                <b>{t('lecon.points', { n: o.points })}</b>{/if}
            </li>{/each}
        </ol>
      </section>
    {/if}

    <section class="blk recap">
      <h2><Ar text="حَصِيلَتِي" /> <span>{t('lecon.mon_bilan')}</span></h2>
      {#if lettres.some((x) => x.points_ar)}
        <div class="memo">
          <h3><Ar text="أَتَذَكَّرُ" /> <span>{t('lecon.je_retiens')}</span></h3>
          {#each lettres as x, i (i)}
            <div class="row">
              <span class="l c{i % 4}" lang="ar">{x.l}</span>{#if x.points_ar}<Ar
                  text={x.points_ar}
                />{/if} <span class="fr">{x.points_fr ?? ''}</span>
            </div>
          {/each}
        </div>
      {:else if L.retiens?.length}
        <div class="memo">
          <h3><Ar text="أَتَذَكَّرُ" /> <span>{t('lecon.je_retiens')}</span></h3>
          {#each L.retiens as r, i (i)}<div class="row">
              <Ar text={r.ar} /> <span class="fr">{r.fr}</span>
            </div>{/each}
        </div>
      {/if}
      <div class="bravo">
        <div
          class="stars"
          aria-label={t('lecon.etoiles_aria', { n: nChecked, total: checkItems.length })}
        >
          {#each checkItems as _c, i (i)}<span class="star" class:lit={i < nChecked}>★</span>{/each}
        </div>
        <p class="fr" aria-live="polite">
          {#if nChecked === checkItems.length && checkItems.length}{t('lecon.bravo_termine')}
            <span class="ar" lang="ar">تَبَارَكَ اللَّهُ</span>{:else if nChecked}{t(
              'lecon.continue',
              {
                n: nChecked,
                total: checkItems.length,
              },
            )}{:else}{t('lecon.coche')}{/if}
        </p>
      </div>
      <div class="check">
        {#each checkItems as c, i (i)}
          <label>
            <input
              type="checkbox"
              checked={checked[i] ?? false}
              onchange={(e) => toggle(i, e.currentTarget.checked)}
            />
            <span><Ar text={'أَنَا أَسْتَطِيعُ: ' + c.ar} /> <span class="fr">{c.fr}</span></span>
          </label>
        {/each}
      </div>
    </section>

    {#if !isEval && (E.mots || E.lier || E.copie || E.production || cahierEx.length)}
      <section class="blk cahier">
        <h2><Ar text="أَكْتُبُ" /> <span>{t('lecon.cahier')}</span></h2>
        <p class="hint fr">
          {t('lecon.cahier_consigne')}
        </p>
        {#if lettres.length}
          <!-- eslint-disable svelte/no-navigation-without-resolve -- chemin résolu par resolve(), suivi d'un paramètre -->
          <p class="links">
            {#each lettres as x (x.l)}<a
                class="button"
                href={`${resolve('/ecriture')}?lettre=${encodeURIComponent(x.l)}`}
                data-testid="tracer-lettre">{t('lecon.tracer_lettre', { l: x.l })}</a
              >{/each}
          </p>
          <!-- eslint-enable svelte/no-navigation-without-resolve -->
        {/if}
        {#if Array.isArray(E.mots) && E.mots.length}
          <h3>{t('lecon.ecris_mots')}</h3>
          <p class="trace" dir="rtl">
            {#each E.mots as m, i (i)}<span><Ar text={String(m)} {lettres} /></span>{/each}
          </p>
          <!-- eslint-disable svelte/no-navigation-without-resolve -- chemin résolu par resolve(), suivi d'un paramètre -->
          <p class="links">
            {#each E.mots as m, i (i)}<a
                class="button"
                href={`${resolve('/ecriture')}?mot=${encodeURIComponent(String(m).replace(/[[\]]/g, ''))}`}
                >{t('lecon.repasser_mot', { n: i + 1 })}</a
              >{/each}
          </p>
          <!-- eslint-enable svelte/no-navigation-without-resolve -->
        {/if}
        {#if Array.isArray(E.lier) && E.lier.length}
          <h3>{t('lecon.relie_lettres')}</h3>
          <ul class="lier">
            {#each E.lier as x, i (i)}
              {@const lk = x as { lettres?: string[] }}
              <li dir="rtl"><span class="ar" lang="ar">{(lk.lettres ?? []).join(' + ')}</span></li>
            {/each}
          </ul>
        {/if}
        {#if Array.isArray(E.copie) && E.copie.length}
          <h3>{t('lecon.recopie')}</h3>
          {#each E.copie as c, i (i)}<Ar tag="p" text={String(c)} {lettres} />{/each}
        {/if}
        {#if E.production}
          {@const P = E.production as {
            consigne_fr?: string;
            fr?: string;
            modele_ar?: string;
            ar?: string;
          }}
          <h3>{t('lecon.ecris_moi')}</h3>
          <p class="fr">{P.consigne_fr ?? P.fr ?? ''}</p>
          {#if P.modele_ar ?? P.ar}<Ar tag="p" text={P.modele_ar ?? P.ar ?? ''} />{/if}
        {/if}
        <h3>{t('lecon.dictee')}</h3>
        <p class="fr">
          {t('lecon.dictee_consigne')}
        </p>
        {#each cahierEx as { ex, i } (i)}
          <Exercise
            {ex}
            id={u.exercises[i]?.id ?? `${u.id}.ex${i + 1}`}
            {lettres}
            onanswer={(k, r) => record(i, k, r)}
          />
        {/each}
      </section>
    {/if}
  </article>
  <TutorPanel unitId={u.id} profile={profileInfo} words={lessonWords} />
{/if}

{#snippet dlg()}
  <section class="blk">
    <h2>
      <Ar text={dialogue?.titre_ar ?? 'أَتَكَلَّمُ'} />
      <span>{dialogue?.titre_fr ?? t('lecon.je_parle')}</span>
    </h2>
    <p class="hint fr">
      {(dialogue?.consigne_fr as string) ?? t('lecon.dialogue_consigne')}
    </p>
    {#if dialogue?.lieu}
      <Scene
        spec={{
          lieu: dialogue.lieu as string,
          persos: Object.keys(sides)
            .map(personaKey)
            .filter((k) => data.illustrations[k]),
          props: dialogue.props as string[] | undefined,
          alt_fr: dialogue.titre_fr,
        }}
        {lettres}
      />
    {/if}
    <div class="dlg">
      {#each dialogue?.repliques ?? [] as r, i (i)}
        <div class="line" class:r={sides[r.qui ?? ''] === 1}>
          <div class="av"><Illus k={personaKey(r.qui ?? '')} cls="avatar" /></div>
          <div class="bub">
            <div class="who">
              {#if r.qui_ar}<span class="ar" lang="ar">{r.qui_ar}</span> ·
              {/if}{r.qui}
            </div>
            <Ar text={r.ar} {lettres} />
            {#if r.fr}<p class="fr">{r.fr}</p>{/if}
          </div>
        </div>
      {/each}
    </div>
    {#if dialogue?.note_ar || dialogue?.note_fr}
      <div class="note">
        <b>{t('lecon.je_retiens_deux_points')}</b>
        {#if dialogue.note_ar}<Ar text={dialogue.note_ar as string} />{/if}
        <span class="fr">{dialogue.note_fr ?? ''}</span>
      </div>
    {/if}
  </section>
{/snippet}

{#snippet coran()}
  <section class="blk quran">
    <h2>
      <Ar text={Q?.titre_ar ?? 'مِنَ الْقُرْآنِ'} /> <span>{Q?.titre_fr ?? t('lecon.coran')}</span>
    </h2>
    {#each Q?.versets ?? [] as v, i (i)}
      {#if v.non_prepare}
        <div class="np-box" data-testid="non-prepare">
          <b class="fr">{t('lecon.non_prepare')}</b>
          <Ar text="نَصٌّ يُوَزِّعُهُ الْمُعَلِّمُ يَوْمَ الِاخْتِبَارِ" />
        </div>
      {:else}
        <div class="ayah" data-ref={v.ref_fr}>
          <Ar tag="p" quran text={v.ar} {lettres} />
          {#if v.fr}<p class="fr sens">{v.fr}</p>{/if}
          <div class="cap">
            <span class="ref">{v.ref_fr ?? ''}</span>
            {#if v.consigne_fr}<span class="fr">— {v.consigne_fr}</span>{/if}
          </div>
        </div>
      {/if}
    {/each}
    {#if Q?.mots?.length}
      <div class="qwords">
        {#each Q.mots as m, i (i)}<div>
            <Ar text={m.ar} /> <span class="fr">« {m.fr} »{m.ref ? ` (${m.ref})` : ''}</span>
          </div>{/each}
      </div>
    {/if}
    {#if Q?.tajwid}
      <div class="tajwid">
        <b>{t('lecon.tajwid_titre', { titre: Q.tajwid.titre_fr ?? t('lecon.tajwid') })}</b>
        <span class="fr">{Q.tajwid.texte_fr ?? ''}</span>
        {#if Q.tajwid.exemple_ar}<Ar quran text={Q.tajwid.exemple_ar} {lettres} />{/if}
      </div>
    {/if}
  </section>
{/snippet}

{#snippet fiqhBlock()}
  <section class="blk fiqh">
    <h2>
      <Ar text={fiqh?.titre_ar ?? 'آدَابِي'} />
      <span>{fiqh?.titre_fr ?? t('lecon.adab')}</span>
    </h2>
    <ul>
      {#each fiqh?.points ?? [] as p, i (i)}<li>
          {#if p.ar}<Ar text={p.ar} /> —
          {/if}<span class="fr">{p.fr ?? ''}</span>
        </li>{/each}
    </ul>
  </section>
{/snippet}

<style>
  .nav {
    margin: 0 0 4px;
  }
  .num {
    color: var(--teal);
    font-weight: 700;
    margin: 0;
  }
  h1 {
    margin: 4px 0;
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: baseline;
  }
  .fam {
    font-family: 'Noto Naskh Arabic', serif;
    display: inline-flex;
    gap: 10px;
  }
  .prog {
    display: inline-block;
    background: var(--ok-bg);
    color: var(--good);
    border-radius: 99px;
    padding: 2px 12px;
    font-weight: 700;
    margin: 4px 0;
  }
  h2 {
    font-size: 1.1rem;
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    align-items: baseline;
    border-bottom: 2px solid var(--line);
    padding-bottom: 4px;
    margin: 28px 0 10px;
  }
  h3 {
    font-size: 1rem;
    margin: 14px 0 6px;
  }
  .fr {
    color: var(--ink2);
  }
  .hint {
    font-size: 0.92rem;
    margin: 4px 0;
  }
  .bulle {
    text-align: center;
    margin: 0;
    font-size: 0.92rem;
  }
  .goal {
    display: flex;
    gap: 12px;
    align-items: center;
    background: #fff5f5;
    border: 2px solid #f7c9ca;
    border-radius: 16px;
    padding: 8px 14px;
    margin: 12px 0;
  }
  .goal svg {
    width: 36px;
    height: 36px;
    flex: none;
  }
  .goal p {
    margin: 0;
  }
  .letters {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    direction: rtl;
  }
  .fcard {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    background: var(--card);
    border: 3px solid var(--line);
    border-radius: 18px;
    padding: 8px 18px;
    direction: ltr;
    min-width: 130px;
  }
  .b0 {
    border-color: #f7c9ca;
  }
  .b1 {
    border-color: #c9daf7;
  }
  .b2 {
    border-color: #bfe8d5;
  }
  .b3 {
    border-color: #f7e1a8;
  }
  .pos {
    position: absolute;
    top: 4px;
    left: 8px;
    font-size: 0.8rem;
    color: var(--ink2);
  }
  .big {
    font-family: 'Noto Naskh Arabic', serif;
    font-size: calc(var(--ar-size) * 2.4);
    line-height: 1.3;
    text-decoration: none;
  }
  .dots {
    font-size: calc(var(--ar-size) * 0.7);
  }
  .tw {
    overflow-x: auto;
  }
  .forms {
    border-collapse: collapse;
    width: 100%;
  }
  .forms td,
  .forms th {
    border: 1px solid var(--line);
    padding: 4px 8px;
    text-align: center;
  }
  .forms td {
    font-size: calc(var(--ar-size) + 6px);
    text-decoration: none;
  }
  .syl {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .sylc {
    border: 2px solid var(--line);
    border-radius: 12px;
    padding: 0 12px;
    background: var(--card);
  }
  .readline {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 18px;
    background: var(--card);
    border: 2px solid var(--line);
    border-radius: 14px;
    padding: 6px 14px;
  }
  .readline.big {
    font-family: 'Noto Naskh Arabic', serif;
    font-size: 44px;
  }
  .star-word {
    border: 3px solid var(--gold);
    border-radius: 10px;
    padding: 0 8px;
    background: var(--warn-bg);
  }
  .note,
  .notion {
    background: #f4f8fb;
    border-radius: 12px;
    padding: 8px 12px;
    margin: 8px 0;
  }
  .mk {
    font-size: calc(var(--ar-size) * 1.6);
    margin-inline-end: 10px;
  }
  .phrase {
    text-align: right;
    margin: 6px 0;
  }
  .phrase p {
    margin: 0;
  }
  .phrase .fr {
    text-align: left;
    font-size: 0.9rem;
  }
  .np-box {
    border: 3px dashed var(--c3);
    background: var(--warn-bg);
    border-radius: 14px;
    padding: 12px;
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .words {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 10px;
  }
  .wc {
    display: flex;
    flex-direction: column;
    align-items: center;
    background: var(--card);
    border: 2px solid var(--line);
    border-radius: 16px;
    padding: 8px;
    text-align: center;
  }
  .wc :global(.pic) {
    width: 84px;
    height: 84px;
  }
  .dlg {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .line {
    display: flex;
    gap: 10px;
    align-items: flex-start;
  }
  .line.r {
    flex-direction: row-reverse;
  }
  .av :global(.avatar) {
    width: 56px;
    height: 72px;
  }
  .bub {
    background: var(--card);
    border: 2px solid var(--line);
    border-radius: 16px;
    padding: 6px 12px;
    flex: 1;
    text-align: right;
  }
  .bub .fr {
    text-align: left;
    margin: 2px 0 0;
    font-size: 0.9rem;
  }
  .who {
    font-size: 0.85rem;
    color: var(--teal);
    font-weight: 700;
    text-align: left;
  }
  .quran {
    background: linear-gradient(#f4f8fb, #fff);
    border-radius: 18px;
    padding: 4px 12px 12px;
  }
  .ayah {
    margin: 12px 0;
    padding: 10px 16px;
    background: #fff;
    border-inline-start: 4px solid var(--navy);
    border-radius: 12px;
    text-align: right;
  }
  .ayah p {
    margin: 0;
  }
  .ayah .sens {
    text-align: left;
    font-size: 0.95rem;
  }
  .cap {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    font-size: 0.88rem;
  }
  .ref {
    font-weight: 700;
    color: var(--navy);
  }
  .qwords {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 6px;
  }
  .tajwid {
    background: #fff;
    border: 2px dashed #c9daf7;
    border-radius: 12px;
    padding: 8px 12px;
    margin-top: 8px;
  }
  .fiqh ul {
    padding-inline-start: 1.2em;
  }
  .memo .row {
    display: flex;
    gap: 10px;
    align-items: baseline;
    flex-wrap: wrap;
  }
  .memo .l {
    font-family: 'Noto Naskh Arabic', serif;
    font-size: calc(var(--ar-size) * 1.4);
    text-decoration: none;
  }
  .bravo {
    text-align: center;
  }
  .stars {
    font-size: 2rem;
    letter-spacing: 6px;
  }
  .star {
    color: #e3dccd;
  }
  .star.lit {
    color: var(--gold);
  }
  .check label {
    display: flex;
    gap: 10px;
    align-items: center;
    padding: 8px;
    border: 2px solid var(--line);
    border-radius: 12px;
    margin: 6px 0;
    background: var(--card);
  }
  .check input {
    width: 28px;
    height: 28px;
    flex: none;
  }
  .trace {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 24px;
    font-size: calc(var(--ar-size) + 8px);
  }
  .lex {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 6px;
  }
  .links {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
</style>
