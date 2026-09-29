<script lang="ts">
  import { onMount } from 'svelte';
  import Ar from '$lib/Ar.svelte';
  import { fmtDate, fmtNumber, t } from '$lib/i18n';
  import { call } from '$lib/session';

  /**
   * Épreuves notées de la classe (lot 19), pour l'enseignant : ouvrir un bilan (/20) ou l'examen (/100) du
   * niveau, entre maintenant et une date ; textes NON PRÉPARÉS et mots à dire (écoute), jamais montrés à
   * l'élève ; copies corrigées par le serveur ; partie hors application (lecture, dictée…) ; remédiation
   * signalée sous 8/20 ; fermeture (la note devient visible pour les familles).
   */
  type Obj = Record<string, unknown>;
  let {
    classId,
    units,
  }: { classId: string; units: Array<{ id: string; kind: string; titleFr: string }> } = $props();
  interface Session {
    id: string;
    unitId: string;
    bareme: number;
    opensAt: string;
    closesAt: string;
    copies: number;
  }
  interface Copy {
    id: string;
    pseudonym: string | null;
    autoPoints: number;
    autoMax: number;
    teacherPoints: number | null;
    teacherMax: number | null;
    score: number | null;
    remediation: boolean;
  }
  interface Detail {
    epreuve: Session & { titleFr: string | null };
    textesNonPrepares: {
      lecture: { vedette: Obj | null; phrases: Obj[]; paragraphes: unknown[] } | null;
      versets: Obj[];
      dictee: unknown[];
    } | null;
    aDire: Array<{ exerciseId: string; mots: string[] }>;
    copies: Copy[];
  }
  const evals = $derived(units.filter((u) => u.kind === 'bilan' || u.kind === 'examen'));
  let sessions = $state<Session[]>([]);
  let unitId = $state('');
  let days = $state(7);
  let detail = $state<Detail | null>(null);
  let parts = $state<Record<string, { points: string; max: string }>>({});
  let error = $state('');
  const str = (v: unknown) => (typeof v === 'string' ? v : '');

  async function refresh() {
    const r = await call<{ epreuves: Session[] }>('GET', `/ecole/classes/${classId}/epreuves`);
    sessions = r.ok ? r.data!.epreuves : [];
  }
  onMount(refresh);
  const fail = (code: string | null) => (error = t(`erreur.${code ?? 'reseau'}`));

  async function ouvrir(e: SubmitEvent) {
    e.preventDefault();
    error = '';
    const closesAt = new Date(Date.now() + days * 86_400_000).toISOString();
    const r = await call('POST', `/ecole/classes/${classId}/epreuves`, { unitId, closesAt });
    if (!r.ok) return fail(r.code);
    await refresh();
  }
  async function voir(id: string) {
    const r = await call<Detail>('GET', `/ecole/epreuves/${id}`);
    if (!r.ok) return fail(r.code);
    detail = r.data;
    parts = Object.fromEntries(
      r.data!.copies.map((c) => [
        c.id,
        { points: c.teacherPoints?.toString() ?? '', max: c.teacherMax?.toString() ?? '' },
      ]),
    );
  }
  async function noter(c: Copy) {
    const p = parts[c.id]!;
    const body =
      p.points === '' && p.max === ''
        ? { points: null, max: null }
        : { points: Number(p.points), max: Number(p.max) };
    const r = await call('PUT', `/ecole/epreuves/${detail!.epreuve.id}/copies/${c.id}`, body);
    if (!r.ok) return fail(r.code);
    await voir(detail!.epreuve.id);
  }
  async function fermer() {
    if (!detail || !confirm(t('epreuve.fermer_confirmer'))) return;
    const r = await call('POST', `/ecole/epreuves/${detail.epreuve.id}/fermer`, {});
    if (!r.ok) return fail(r.code);
    await voir(detail.epreuve.id);
    await refresh();
  }
  const title = (id: string) => units.find((u) => u.id === id)?.titleFr ?? id;
</script>

<section class="card" data-testid="epreuves-classe">
  <h2>{t('epreuve.titre_enseignant')}</h2>
  <p class="muted small">{t('epreuve.aide_enseignant')}</p>
  {#if evals.length}
    <form class="row" onsubmit={ouvrir}>
      <label
        >{t('epreuve.choisir')}
        <select bind:value={unitId} required>
          {#each evals as u (u.id)}<option value={u.id}>{u.titleFr}</option>{/each}
        </select></label
      >
      <label
        >{t('epreuve.duree_jours')}
        <input type="number" min="1" max="30" bind:value={days} /></label
      >
      <button type="submit">{t('epreuve.ouvrir')}</button>
    </form>
  {:else}
    <p class="warnbox small">{t('classe.niveau_requis')}</p>
  {/if}
  <ul>
    {#each sessions as s (s.id)}
      <li>
        <button type="button" class="link" onclick={() => voir(s.id)}>{title(s.unitId)}</button>
        <span class="muted small"
          >/{s.bareme} · {fmtDate(s.opensAt)} → {fmtDate(s.closesAt)} · {t('epreuve.copies', {
            n: s.copies,
          })}</span
        >
      </li>
    {/each}
  </ul>
</section>

{#if detail}
  {@const tn = detail.textesNonPrepares}
  <section class="card" data-testid="epreuve-detail">
    <h2>{detail.epreuve.titleFr} (/{detail.epreuve.bareme})</h2>
    {#if new Date(detail.epreuve.closesAt) > new Date()}
      <button type="button" onclick={fermer}>{t('epreuve.fermer')}</button>
    {:else}
      <p class="muted small">
        {t('epreuve.fermee_le', { date: fmtDate(detail.epreuve.closesAt) })}
      </p>
    {/if}
    {#if tn && (tn.lecture || tn.versets.length || tn.dictee.length)}
      <h3>{t('epreuve.non_prepares')}</h3>
      <p class="muted small">{t('epreuve.non_prepares_aide')}</p>
      {#if tn.lecture?.vedette}<Ar tag="p" text={str(tn.lecture.vedette.ar)} />{/if}
      {#each tn.lecture?.phrases ?? [] as ph, k (k)}<Ar tag="p" text={str(ph.ar)} />{/each}
      {#each tn.versets as v, k (k)}<Ar tag="p" text={str(v.ar)} quran />{/each}
      {#each tn.dictee as d, k (k)}<p>{typeof d === 'string' ? d : JSON.stringify(d)}</p>{/each}
    {/if}
    {#if detail.aDire.length}
      <h3>{t('epreuve.a_dire')}</h3>
      {#each detail.aDire as a, k (a.exerciseId)}
        <p>
          {k + 1}. {#each a.mots as m, j (j)}<Ar text={m} />{#if j < a.mots.length - 1}
              ·
            {/if}{/each}
        </p>
      {/each}
    {/if}
    <h3>{t('epreuve.copies_titre')}</h3>
    <table>
      <thead
        ><tr
          ><th>{t('classe.eleve')}</th><th>{t('epreuve.auto')}</th><th>{t('epreuve.hors_app')}</th
          ><th>{t('epreuve.note_titre')}</th></tr
        ></thead
      >
      <tbody>
        {#each detail.copies as c (c.id)}
          <tr class:remed={c.remediation}>
            <td>{c.pseudonym ?? '?'}</td>
            <td>{c.autoPoints}/{c.autoMax}</td>
            <td class="part">
              <input
                aria-label={t('epreuve.points')}
                inputmode="decimal"
                bind:value={parts[c.id]!.points}
              />
              /
              <input
                aria-label={t('epreuve.max')}
                inputmode="decimal"
                bind:value={parts[c.id]!.max}
              />
              <button type="button" onclick={() => noter(c)}>{t('epreuve.enregistrer')}</button>
            </td>
            <td
              >{c.score === null ? '—' : `${fmtNumber(c.score)}/${detail.epreuve.bareme}`}
              {#if c.remediation}<strong> · {t('epreuve.remediation')}</strong>{/if}</td
            >
          </tr>
        {/each}
      </tbody>
    </table>
  </section>
{/if}
{#if error}<p class="error" role="alert">{error}</p>{/if}

<style>
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: end;
  }
  .part input {
    width: 4em;
  }
  .remed {
    background: var(--warn-bg);
  }
  table {
    border-collapse: collapse;
    width: 100%;
    display: block;
    overflow-x: auto;
  }
  td,
  th {
    border-bottom: 1px solid var(--line);
    padding: 4px 6px;
    text-align: start;
  }
  .link {
    background: none;
    border: none;
    color: var(--primary);
    text-decoration: underline;
    padding: 0;
  }
  .error {
    color: var(--bad-ink);
  }
  .small {
    font-size: 0.9rem;
  }
</style>
