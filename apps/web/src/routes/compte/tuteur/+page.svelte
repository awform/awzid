<script lang="ts">
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import { fmtDate, t } from '$lib/i18n';
  import { fetchMe, type Me } from '$lib/session';
  import TutorSegments from '$lib/TutorSegments.svelte';
  import { journal, report, setConsent } from '$lib/tutor';

  /**
   * Tuteur : supervision par le parent (lot 9, ARCHITECTURE_V2 § 1.7) — accord pour le tuteur IA (retirable ;
   * sans accord, seul le tuteur local répond), journal de tout ce que le tuteur a dit à chaque enfant,
   * signalement d'une réponse (modération humaine).
   */
  type J = NonNullable<Awaited<ReturnType<typeof journal>>['data']>;
  let me: Me | null = $state(null);
  let data: Record<string, J> = $state({});
  let msg = $state('');

  onMount(async () => {
    me = await fetchMe();
    for (const p of me?.profiles ?? []) await load(p.id);
  });
  async function load(id: string) {
    const r = await journal(id);
    if (r.ok && r.data) data[id] = r.data;
  }
  /** code parent : exigé par le serveur pour donner ou retirer l'accord (audit MIN-4 / SEC-3) */
  let pin = $state('');
  let error = $state('');
  async function toggle(id: string, actif: boolean) {
    error = '';
    const r = await setConsent(id, actif, pin);
    if (r.ok) {
      msg = actif ? t('ctut.accord_donne') : t('ctut.accord_retire');
    } else error = t(`erreur.${r.code ?? 'reseau'}`);
    await load(id);
  }
  async function signal(pid: string, id: string) {
    const r = await report(pid, id);
    if (r.ok) await load(pid);
  }
</script>

<svelte:head><title>{t('app.nom')} — {t('ctut.titre')}</title></svelte:head>

<p><a href={resolve('/compte')}>{t('ctut.retour')}</a></p>
<h1>{t('ctut.titre')}</h1>
<p class="muted">{t('ctut.intro')}</p>
{#if msg}<p class="card ok" role="status">{msg}</p>{/if}
{#if error}<p class="card error" role="alert">{error}</p>{/if}
{#if me?.account.kind === 'parent'}
  <label class="check"
    >{t('libre.code_parent')}
    <input
      id="pin-tuteur"
      type="password"
      inputmode="numeric"
      autocomplete="off"
      maxlength="8"
      bind:value={pin}
      data-testid="pin-tuteur"
    /></label
  >
{/if}

{#each me?.profiles ?? [] as p (p.id)}
  {@const d = data[p.id]}
  <section class="card" data-tuteur-profil={p.id}>
    <h2>{p.pseudonym}</h2>
    {#if me?.account.kind === 'parent' && p.kind !== 'adulte'}
      <label class="check"
        ><input
          type="checkbox"
          checked={d?.consentement ?? false}
          onchange={(e) => toggle(p.id, e.currentTarget.checked)}
          data-testid="accord-tuteur"
        />
        <span>{t('ctut.accord')}</span></label
      >
    {/if}
    <ol class="journal" data-testid="journal-tuteur">
      {#each d?.journal ?? [] as j (j.id)}
        <li>
          <p class="muted small">
            {fmtDate(j.createdAt)} · {j.unitId ?? ''} · {t(
              `ctut.action_${j.action}`,
            )}{#if j.question}
              · « {j.question} »{/if}
          </p>
          {#if j.refused}<p>{t(`tuteur.refus_${j.refused}`)}</p>{:else if j.segments}<TutorSegments
              segments={j.segments}
            />{/if}
          {#if j.reportedAt}<p class="small">{t('tuteur.signale')}</p>{:else}<button
              type="button"
              class="small"
              onclick={() => signal(p.id, j.id)}>{t('tuteur.signaler')}</button
            >{/if}
        </li>
      {:else}
        <li class="muted">{t('ctut.vide')}</li>
      {/each}
    </ol>
  </section>
{/each}

<style>
  .journal {
    list-style: none;
    padding: 0;
    display: grid;
    gap: 8px;
  }
  .journal li {
    border-bottom: 1px solid var(--line);
    padding-bottom: 6px;
  }
  .small {
    font-size: 0.85rem;
  }
  .ok {
    background: var(--ok-bg);
  }
</style>
