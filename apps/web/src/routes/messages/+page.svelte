<script lang="ts">
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import { fmtDate, t } from '$lib/i18n';
  import { fetchMe, type Me } from '$lib/session';
  import {
    familyMessages,
    profileVisios,
    readThread,
    replyThread,
    report,
    type FilResume,
    type MessageView,
    type Visio,
  } from '$lib/messagerie';

  /**
   * Messages de l'école pour le parent ou l'adulte (lot 21, CDC §2.12) : annonces de classe, un fil par enfant et
   * par classe avec l'enseignant, signalement avec le numéro d'aide du pays, séances de visio. Les comptes des
   * adolescents n'y ont pas accès (le fil passe par le parent).
   */
  let me = $state<Me | null>(null);
  let annonces = $state<MessageView[]>([]);
  let fils = $state<FilResume[]>([]);
  let aide = $state('');
  let visios = $state<Visio[]>([]);
  let open = $state<{ id: string; messages: MessageView[] } | null>(null);
  let reponse = $state('');
  let info = $state('');
  let error = $state('');

  onMount(async () => {
    me = await fetchMe();
    if (!me) return;
    const r = await familyMessages();
    if (!r.ok) {
      error = t(`erreur.${r.code ?? 'reseau'}`);
      return;
    }
    if (r.data) ({ annonces, fils, aide } = r.data);
    for (const p of me.profiles) {
      const v = await profileVisios(p.id);
      if (v.ok && v.data) visios = [...visios, ...v.data.visios];
    }
  });

  async function show(id: string) {
    const r = await readThread(id);
    if (r.ok && r.data) open = { id, messages: r.data.messages };
  }
  async function reply(e: SubmitEvent) {
    e.preventDefault();
    if (!open) return;
    // seul le texte envoyé est effacé (une suite tapée pendant l'envoi est gardée)
    const envoye = reponse;
    const r = await replyThread(open.id, envoye);
    if (!r.ok) {
      error = t(`erreur.${r.code ?? 'reseau'}`);
      return;
    }
    if (reponse === envoye) reponse = '';
    await show(open.id);
  }
  async function signal(id: string) {
    const r = await report(id, 'famille');
    if (r.ok && r.data) info = t('msg.signale', { aide: r.data.aide });
  }
</script>

<svelte:head><title>{t('app.nom')} — {t('msg.titre')}</title></svelte:head>

<h1>{t('msg.titre')}</h1>
{#if !me}
  <p>
    {t('profils.connexion_requise')} <a href={resolve('/connexion')}>{t('entete.connexion')}</a>
  </p>
{:else}
  {#if error}<p class="card bad" role="alert" data-testid="msg-erreur">{error}</p>{/if}
  {#if info}<p class="card" role="status" data-testid="msg-info">{info}</p>{/if}
  <p class="muted small">{t('msg.cadre', { aide: aide || '—' })}</p>

  <section class="card">
    <h2>{t('visio.titre')}</h2>
    <ul class="list">
      {#each visios as v (v.id)}
        <li data-testid="visio">
          {fmtDate(v.debut)} — {v.classe} : {v.titre} ({t('visio.minutes', { n: v.dureeMin })})
          {#if v.url}<a href={v.url} target="_blank" rel="noopener noreferrer external"
              >{t('visio.rejoindre')}</a
            >
          {:else}<span class="muted">{t('visio.bientot')}</span>{/if}
        </li>
      {:else}<li class="muted">{t('msg.aucun')}</li>{/each}
    </ul>
  </section>

  <section class="card">
    <h2>{t('msg.annonces')}</h2>
    <ul class="list">
      {#each annonces as a (a.id)}
        <li data-testid="annonce">
          {fmtDate(a.le)} — {a.retire ? t('msg.retire') : a.texte}
          {#if !a.retire}<button type="button" class="small" onclick={() => signal(a.id)}
              >{t('msg.signaler')}</button
            >{/if}
        </li>
      {:else}<li class="muted">{t('msg.aucun')}</li>{/each}
    </ul>
  </section>

  <section class="card">
    <h2>{t('msg.fils')}</h2>
    <ul class="list">
      {#each fils as f (f.id)}
        <li>
          <button type="button" onclick={() => show(f.id)} data-testid="msg-fil">
            {f.pseudonym} — {f.classe}{#if f.nonLus}<span class="badge"
                >{t('msg.non_lus', { n: f.nonLus })}</span
              >{/if}
          </button>
        </li>
      {:else}<li class="muted">{t('msg.aucun')}</li>{/each}
    </ul>
    {#if open}
      <ul class="list" data-testid="msg-fil-ouvert">
        {#each open.messages as m (m.id)}
          <li class:mine={m.deMoi}>
            {fmtDate(m.le)} — {m.retire ? t('msg.retire') : m.texte}
            {#if m.piece && !m.retire}
              <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- fichier servi par l'API, pas une page -->
              <a href={`/api/v1/messages/${m.id}/piece`} download={m.piece.nom}>{m.piece.nom}</a
              >{/if}
            {#if !m.deMoi && !m.retire}<button
                type="button"
                class="small"
                onclick={() => signal(m.id)}>{t('msg.signaler')}</button
              >{/if}
          </li>
        {/each}
      </ul>
      <form onsubmit={reply}>
        <label for="rep">{t('msg.repondre')}</label>
        <textarea id="rep" bind:value={reponse} maxlength="2000" required></textarea>
        <button type="submit" class="primary">{t('msg.envoyer')}</button>
      </form>
    {/if}
  </section>
{/if}

<style>
  textarea {
    width: 100%;
    min-height: 88px;
  }
  .badge {
    margin-inline-start: 0.5em;
    font-weight: 600;
  }
  .mine {
    font-weight: 600;
  }
</style>
