<script lang="ts">
  import { onMount } from 'svelte';
  import Bidi from '$lib/Bidi.svelte';
  import { t } from '$lib/i18n';
  import { confier, suivi, type Suivi } from './donnees';
  import { juzDePart } from './plan';

  /**
   * Les parts d'une khatma de groupe, pour son RESPONSABLE (parent, enseignant) : une ligne par part, dans l'ordre du Muṣḥaf
   * (jamais un classement) ; « lue » ou « en cours » seulement en mode serein ; une part peut être confiée à un autre
   * profil du groupe qui n'en a pas.
   */
  let { planId, change }: { planId: string; change?: () => void } = $props();
  let liste = $state<Suivi | null>(null);
  let vers = $state<Record<string, string>>({});
  let message = $state('');
  let erreur = $state('');

  async function charger() {
    const r = await suivi(planId);
    if (r.ok && r.data) liste = r.data;
    else erreur = t('kh.erreur');
  }
  onMount(charger);

  async function transferer(de: string) {
    const v = vers[de];
    if (!v) return;
    message = '';
    erreur = '';
    const r = await confier(planId, de, v);
    if (r.ok) {
      message = t('kh.confier_ok');
      await charger();
      change?.();
    } else erreur = t('kh.erreur');
  }
  const partDe = (a: number, b: number) => {
    const j = juzDePart(a, b);
    return j
      ? j[0] === j[1]
        ? t('kh.part_juz', { a: j[0] })
        : t('kh.part_juz_plage', { a: j[0], b: j[1] })
      : t('kh.part_pages', { a, b });
  };
</script>

<section class="suivi" aria-labelledby={`kh-suivi-${planId}`} data-testid="khatma-suivi">
  <h3 id={`kh-suivi-${planId}`}>{t('kh.suivi_titre')}</h3>
  {#if liste}
    {#if liste.serein}<p class="petit muted">{t('kh.suivi_serein')}</p>{/if}
    <p class="petit">
      <Bidi
        text={t('kh.groupe', { terminees: liste.groupe.terminees, parts: liste.groupe.parts })}
      />
    </p>
    <ul>
      {#each liste.membres as m (m.profileId)}
        <li data-testid="khatma-part">
          <span><Bidi text={m.pseudonym} /> · <Bidi text={partDe(m.firstPage, m.lastPage)} /></span>
          <span class="muted">
            <Bidi
              text={m.terminee
                ? t('kh.suivi_terminee')
                : liste.serein || m.done === undefined
                  ? t('kh.suivi_en_cours')
                  : t('kh.lues', { n: m.done, total: m.lastPage - m.firstPage + 1 })}
            />
          </span>
          {#if !m.terminee && liste.disponibles.length}
            <select
              aria-label={t('kh.confier')}
              bind:value={vers[m.profileId]}
              onchange={() => transferer(m.profileId)}
              data-testid="khatma-confier"
            >
              <option value="">{t('kh.confier')}</option>
              {#each liste.disponibles as p (p.profileId)}
                <option value={p.profileId}>{p.pseudonym}</option>
              {/each}
            </select>
          {/if}
        </li>
      {/each}
    </ul>
    {#if !liste.disponibles.length}<p class="petit muted">{t('kh.confier_aucun')}</p>{/if}
  {/if}
  {#if message}<p class="ok petit" role="status"><Bidi text={message} /></p>{/if}
  {#if erreur}<p class="bad petit" role="alert"><Bidi text={erreur} /></p>{/if}
</section>

<style>
  .suivi {
    display: grid;
    gap: 6px;
  }
  h3 {
    margin: 0;
    font-size: 1rem;
  }
  ul {
    display: grid;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  li {
    display: grid;
    gap: 4px;
    padding: 6px 0;
    border-top: 1px solid var(--line);
  }
  select {
    font: inherit;
    min-height: 44px;
    width: 100%;
  }
  .petit {
    margin: 0;
    font-size: 0.9rem;
  }
  .ok {
    color: var(--ok-ink);
  }
  .bad {
    color: var(--bad-ink);
  }
</style>
