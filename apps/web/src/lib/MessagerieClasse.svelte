<script lang="ts">
  import { onMount } from 'svelte';
  import { fmtDate, t } from '$lib/i18n';
  import {
    announce,
    cancelVisio,
    classMessages,
    classVisios,
    planVisio,
    readThread,
    replyThread,
    writeToFamily,
    type ClassVisio,
    type FilResume,
    type MessageView,
  } from '$lib/messagerie';

  /**
   * Messagerie encadrée et visio de la classe (lot 21, CDC §2.11-2.12) : annonces à toutes les familles (sans
   * réponse collective), un fil privé par élève avec sa famille, séances de visio planifiées (lien externe).
   * Aucune messagerie entre élèves.
   */
  let {
    classId,
    pupils,
  }: { classId: string; pupils: Array<{ displayName: string; profileId: string | null }> } =
    $props();
  let annonces = $state<MessageView[]>([]);
  let fils = $state<FilResume[]>([]);
  let open = $state<{ id: string; messages: MessageView[] } | null>(null);
  let texte = $state('');
  let reponse = $state('');
  let destinataire = $state('');
  let visios = $state<ClassVisio[]>([]);
  let v = $state({ titre: '', debut: '', dureeMin: 45, url: '' });
  let error = $state('');

  async function refresh() {
    const r = await classMessages(classId);
    if (r.ok && r.data) ({ annonces, fils } = r.data);
    const vv = await classVisios(classId);
    visios = vv.ok && vv.data ? vv.data.visios : [];
  }
  onMount(refresh);
  const fail = (code: string | null) => (error = t(`erreur.${code ?? 'reseau'}`));

  async function send(e: SubmitEvent) {
    e.preventDefault();
    error = '';
    // texte envoyé : ce qui a été saisi PENDANT l'envoi (message suivant) n'est jamais effacé
    const envoye = texte;
    const r = destinataire
      ? await writeToFamily(classId, destinataire, envoye)
      : await announce(classId, envoye);
    if (!r.ok) return fail(r.code);
    if (texte === envoye) texte = '';
    await refresh();
  }
  async function show(id: string) {
    const r = await readThread(id);
    if (r.ok && r.data) open = { id, messages: r.data.messages };
  }
  async function reply(e: SubmitEvent) {
    e.preventDefault();
    if (!open) return;
    const r = await replyThread(open.id, reponse);
    if (!r.ok) return fail(r.code);
    reponse = '';
    await show(open.id);
  }
  async function plan(e: SubmitEvent) {
    e.preventDefault();
    error = '';
    const r = await planVisio(classId, { ...v, debut: new Date(v.debut).toISOString() });
    if (!r.ok) return fail(r.code);
    v = { titre: '', debut: '', dureeMin: 45, url: '' };
    await refresh();
  }
</script>

{#if error}<p class="card bad" role="alert">{error}</p>{/if}
<section class="card">
  <h2>{t('msg.ecrire')}</h2>
  <form onsubmit={send}>
    <label for="dest">{t('msg.destinataire')}</label>
    <select id="dest" bind:value={destinataire} data-testid="msg-destinataire">
      <option value="">{t('msg.annonce_classe')}</option>
      {#each pupils.filter((p) => p.profileId) as p (p.profileId)}
        <option value={p.profileId}>{t('msg.famille_de', { nom: p.displayName })}</option>
      {/each}
    </select>
    <label for="texte">{t('msg.message')}</label>
    <textarea id="texte" bind:value={texte} maxlength="2000" required data-testid="msg-texte"
    ></textarea>
    <button type="submit" class="primary" data-testid="msg-envoyer">{t('msg.envoyer')}</button>
  </form>
</section>

<section class="card">
  <h2>{t('msg.annonces')}</h2>
  <ul class="list">
    {#each annonces as a (a.id)}<li>{fmtDate(a.le)} — {a.retire ? t('msg.retire') : a.texte}</li>
    {:else}<li class="muted">{t('msg.aucun')}</li>{/each}
  </ul>
  <h2>{t('msg.fils')}</h2>
  <ul class="list">
    {#each fils as f (f.id)}
      <li>
        <button type="button" onclick={() => show(f.id)} data-testid="msg-fil">
          {t('msg.famille_de', { nom: f.pseudonym })}{#if f.nonLus}<span class="badge"
              >{t('msg.non_lus', { n: f.nonLus })}</span
            >{/if}
        </button>
      </li>
    {:else}<li class="muted">{t('msg.aucun')}</li>{/each}
  </ul>
  {#if open}
    <ul class="list" data-testid="msg-fil-ouvert">
      {#each open.messages as m (m.id)}
        <li class:mine={m.deMoi}>{fmtDate(m.le)} — {m.retire ? t('msg.retire') : m.texte}</li>
      {/each}
    </ul>
    <form onsubmit={reply}>
      <label for="rep">{t('msg.repondre')}</label>
      <textarea id="rep" bind:value={reponse} maxlength="2000" required></textarea>
      <button type="submit" class="primary">{t('msg.envoyer')}</button>
    </form>
  {/if}
</section>

<section class="card">
  <h2>{t('visio.titre')}</h2>
  <form onsubmit={plan}>
    <label for="vt">{t('visio.sujet')}</label>
    <input id="vt" bind:value={v.titre} maxlength="120" required />
    <label for="vd">{t('visio.debut')}</label>
    <input id="vd" type="datetime-local" bind:value={v.debut} required />
    <label for="vm">{t('visio.duree')}</label>
    <input id="vm" type="number" min="10" max="240" bind:value={v.dureeMin} />
    <label for="vu">{t('visio.lien')}</label>
    <input id="vu" type="url" bind:value={v.url} required />
    <button type="submit" class="primary" data-testid="visio-planifier"
      >{t('visio.planifier')}</button
    >
  </form>
  <ul class="list">
    {#each visios as x (x.id)}
      <li>
        {fmtDate(x.startsAt)} — {x.title} ({t('visio.minutes', { n: x.durationMin })})
        {#if x.canceledAt}<span class="muted">{t('visio.annulee')}</span>
        {:else}<button type="button" onclick={() => cancelVisio(x.id).then(refresh)}
            >{t('visio.annuler')}</button
          >{/if}
      </li>
    {:else}<li class="muted">{t('msg.aucun')}</li>{/each}
  </ul>
</section>

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
