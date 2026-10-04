<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import { fmtDate, t } from '$lib/i18n';
  import { listRecordings, type Recording } from '$lib/recordings';
  import { call } from '$lib/session';

  /**
   * Envoi d'une récitation à l'enseignant de la classe (lot 16) : CHOIX de la famille (accord une fois,
   * retirable dans « Mon compte », ce qui efface les envois) ; enfant : code parent à chaque envoi ; audio
   * chiffré sur le serveur, conservé quelques jours (réglage de la classe), supprimable ici ; jamais
   * utilisé pour entraîner une IA.
   */
  let { profileId, kind }: { profileId: string; kind: string } = $props();

  interface Sent {
    id: string;
    part: string;
    createdAt: string;
    expiresAt: string;
    listenedAt: string | null;
    grade: { note: { total: number; mention: string } } | null;
  }
  let info = $state<{
    accord: boolean;
    disponible: boolean;
    classes: Array<{ id: string; name: string }>;
    recitations: Sent[];
  } | null>(null);
  let local = $state<Recording[]>([]);
  let chosen = $state('');
  let classe = $state('');
  let pin = $state('');
  let msg = $state('');
  let error = $state('');
  const enfant = $derived(kind === 'enfant');

  async function refresh() {
    const r = await call<NonNullable<typeof info>>('GET', `/profiles/${profileId}/recitations`);
    info = r.ok ? r.data : null;
    classe ||= info?.classes[0]?.id ?? '';
    // seulement les enregistrements d'un passage précis (sourate:versets)
    local = (await listRecordings(profileId)).filter((r) =>
      /^\d{1,3}:\d{1,3}(-\d{1,3})?$/.test(r.part),
    );
    chosen ||= local[0]?.id ?? '';
  }
  onMount(refresh);
  const headers = () => (enfant && pin ? { 'x-parent-pin': pin } : undefined);

  async function accord() {
    error = '';
    const r = await fetch(`/api/v1/profiles/${profileId}/recitations/accord`, {
      method: 'POST',
      headers: { 'x-awform': '1', 'content-type': 'application/json', ...(headers() ?? {}) },
      body: '{}',
    });
    if (!r.ok) return fail(r);
    await refresh();
  }
  async function fail(r: Response) {
    const code = ((await r.json().catch(() => null)) as { error?: { code?: string } } | null)?.error
      ?.code;
    error = t(`erreur.${code ?? 'reseau'}`);
  }
  async function envoyer() {
    error = '';
    msg = '';
    const rec = local.find((x) => x.id === chosen);
    if (!rec || !classe) return;
    const r = await fetch(
      `/api/v1/profiles/${profileId}/recitations?classe=${classe}&passage=${encodeURIComponent(rec.part)}`,
      {
        method: 'POST',
        headers: {
          'x-awform': '1',
          'content-type': (rec.mime || rec.blob.type || 'audio/webm').split(';')[0]!,
          ...(headers() ?? {}),
        },
        body: rec.blob,
      },
    );
    if (!r.ok) return fail(r);
    msg = t('envoi.ok');
    pin = '';
    await refresh();
  }
  async function supprimer(id: string) {
    const r = await call('DELETE', `/profiles/${profileId}/recitations/${id}`);
    if (!r.ok) error = t(`erreur.${r.code ?? 'reseau'}`);
    await refresh();
  }
</script>

{#if info && info.disponible && info.classes.length}
  <div class="envoi card" data-testid="envoi-recitation">
    <h3>{t('envoi.titre')}</h3>
    <p class="muted small">{t('envoi.garanties')}</p>
    {#if enfant}
      <label class="pin"
        >{t('profils.code_parent')}
        <input
          type="password"
          inputmode="numeric"
          maxlength="8"
          bind:value={pin}
          autocomplete="off"
          data-testid="envoi-pin"
        /></label
      >
    {/if}
    {#if !info.accord}
      <p>{t('envoi.accord_texte')}</p>
      <button type="button" onclick={accord} data-testid="envoi-accord">{t('envoi.accord')}</button>
    {:else if local.length}
      <label
        >{t('envoi.enregistrement')}
        <select bind:value={chosen} data-testid="envoi-choix">
          {#each local as r (r.id)}<option value={r.id}>{r.part} — {fmtDate(r.createdAt)}</option
            >{/each}
        </select></label
      >
      {#if info.classes.length > 1}
        <label
          >{t('envoi.classe')}
          <select bind:value={classe}>
            {#each info.classes as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
          </select></label
        >
      {/if}
      <button type="button" class="primary" onclick={envoyer} data-testid="envoi-envoyer"
        >{t('envoi.envoyer')}</button
      >
    {:else}
      <p class="muted small">{t('envoi.aucun_local')}</p>
    {/if}
    {#if msg}<p role="status" class="ok"><Bidi text={msg} /></p>{/if}
    {#if error}<p role="alert" class="bad"><Bidi text={error} /></p>{/if}
    {#if info.recitations.length}
      <h4>{t('envoi.envoyes')}</h4>
      <ul class="plain" data-testid="envoi-liste">
        {#each info.recitations as s (s.id)}
          <li>
            <Bidi text={s.part} /> · {fmtDate(s.createdAt, { dateStyle: 'medium' })} ·
            {#if s.grade}<Bidi
                text={t('envoi.note', { n: s.grade.note.total })}
              />{:else if s.listenedAt}<Bidi text={t('envoi.ecoutee')} />{:else}{t(
                'envoi.en_attente',
              )}{/if}
            ·
            <span class="muted small"
              ><Bidi
                text={t('envoi.efface_le', { date: fmtDate(s.expiresAt, { dateStyle: 'medium' }) })}
              /></span
            >
            <button
              type="button"
              class="small"
              onclick={() => supprimer(s.id)}
              data-testid="envoi-supprimer">{t('commun.supprimer')}</button
            >
          </li>
        {/each}
      </ul>
    {/if}
  </div>
{/if}

<style>
  .envoi {
    display: grid;
    gap: 8px;
  }
  label {
    display: grid;
    gap: 4px;
  }
  select,
  input {
    font: inherit;
    min-height: 44px;
    max-width: calc(100vw - 72px);
  }
  .plain {
    list-style: none;
    padding: 0;
    display: grid;
    gap: 6px;
  }
  .ok {
    color: var(--ok-ink);
  }
  .bad {
    color: var(--bad-ink);
  }
  .small {
    font-size: 0.9rem;
  }
</style>
