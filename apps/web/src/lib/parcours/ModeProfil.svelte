<script lang="ts">
  import Bidi from '$lib/Bidi.svelte';
  import { onMount } from 'svelte';
  import { t } from '$lib/i18n';
  import { call } from '$lib/session';
  import { setModeLocal, type Mode } from './mode';

  /**
   * A39 — « Ma façon d'avancer » : l'adulte choisit pour lui-même (compte) ; le PARENT choisit pour son enfant
   * ou son ado (code parent) et valide ou refuse la préférence de l'ado ; l'ado, depuis son espace, exprime une
   * préférence. En classe, l'enseignant décide (le choix de la famille vaut hors classe).
   */
  let {
    pid,
    nom = '',
    ctx = 'famille',
  }: { pid: string; nom?: string; ctx?: 'famille' | 'eleve' } = $props();
  interface Info {
    mode: Mode;
    famille: Mode | null;
    classe: { name: string } | null;
    kind: string;
    choix: Mode[];
    moi: 'soi' | 'parent';
    souhait: { mode: Mode } | null;
  }
  let d = $state<Info | null>(null);
  let v = $state<Mode>('douce');
  let pin = $state('');
  let msg = $state('');
  const load = async () => {
    const r = await call<Info>('GET', `/profiles/${pid}/mode-evaluation`);
    if (r.ok && r.data) {
      d = r.data;
      v = r.data.famille ?? r.data.mode;
    }
  };
  onMount(load);
  const parentPin = $derived(d?.moi === 'parent' && pin ? { 'x-parent-pin': pin } : undefined);
  const wish = $derived(ctx === 'eleve');
  async function send(method: 'PUT' | 'POST' | 'DELETE', mode?: Mode) {
    msg = '';
    const r = await call(
      method,
      `/profiles/${pid}/mode-evaluation${method === 'PUT' ? '' : '/souhait'}`,
      mode ? { mode } : undefined,
      method === 'POST' ? undefined : parentPin,
    );
    msg = r.ok ? t(wish ? 'ser.souhait_envoye' : 'ser.ok') : t(`erreur.${r.code ?? 'reseau'}`);
    if (r.ok && method === 'PUT') setModeLocal(pid, mode);
    if (r.ok) await load();
  }
</script>

{#if d && (!wish || (d.kind === 'ado' && d.moi === 'parent'))}
  <fieldset class="stack" data-testid="mode-profil" data-mode={d.mode}>
    <legend><Bidi text={nom ? t('ser.titre_de', { nom }) : t('ser.titre')} /></legend>
    {#if d.classe}<p class="muted" data-testid="mode-par-classe">
        <Bidi text={t('ser.par_classe', { classe: d.classe.name, mode: t(`ser.m_${d.mode}`) })} />
      </p>{/if}
    {#each d.choix as m (m)}
      <label
        ><input type="radio" name="mode-{pid}" value={m} bind:group={v} data-mode-choix={m} />
        <strong><Bidi text={t(`ser.m_${m}`)} /></strong> — <Bidi text={t(`ser.a_${m}`)} /></label
      >
    {/each}
    {#if !wish && d.souhait}
      <p data-testid="mode-souhait">
        <Bidi text={t('ser.souhait', { nom, mode: t(`ser.m_${d.souhait.mode}`) })} />
        <button type="button" onclick={() => send('PUT', d!.souhait!.mode)}
          >{t('commun.valider')}</button
        >
        <button type="button" onclick={() => send('DELETE')}>{t('fam.refuser')}</button>
      </p>
    {/if}
    {#if !wish && d.moi === 'parent'}
      <label
        >{t('libre.code_parent')}
        <input type="password" inputmode="numeric" maxlength="8" bind:value={pin} /></label
      >
    {/if}
    <button
      type="button"
      class="primary"
      onclick={() => send(wish ? 'POST' : 'PUT', v)}
      data-testid="mode-enregistrer"
      ><Bidi text={t(wish ? 'ser.envoyer' : 'commun.enregistrer')} /></button
    >
    {#if msg}<p class="muted" role="status"><Bidi text={msg} /></p>{/if}
  </fieldset>
{/if}
