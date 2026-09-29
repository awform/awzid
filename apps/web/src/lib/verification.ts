/**
 * Page PUBLIQUE de vérification d'un certificat (lot 20) : rendue sur le serveur, SANS JavaScript, sans
 * ressource externe ; ne montre que le registre (numéro, titulaire, niveau ou passage, mention, date), l'état
 * et le contrôle de la signature. Rien sans le bon code du QR.
 */
import { fmtDate, t } from './i18n';

export interface Verification {
  numero: string;
  type: 'niveau' | 'hifz';
  sujet: string;
  sujetTitre: string | null;
  titulaire: string | null;
  mention: string | null;
  delivreLe: string;
  statut: 'valide' | 'annule';
  annulation: { le: string; motif: string | null } | null;
  signature: 'valide' | 'invalide' | 'absente';
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function renderVerification(v: Verification | null, numero: string): string {
  const ok = !!v && v.statut === 'valide' && v.signature === 'valide';
  const rows = v
    ? [
        [t('verif.numero'), v.numero],
        [t('verif.titulaire'), v.titulaire ?? '—'],
        [t(`verif.type.${v.type}`), v.sujetTitre ? `${v.sujetTitre} (${v.sujet})` : v.sujet],
        [t('verif.mention'), v.mention ?? '—'],
        [t('verif.delivre_le'), fmtDate(v.delivreLe, { dateStyle: 'long' })],
        [t('verif.signature'), t(`verif.signature_${v.signature}`)],
      ]
    : [];
  const status = !v
    ? t('verif.introuvable', { numero })
    : v.statut === 'annule'
      ? t('verif.annule', {
          date: fmtDate(v.annulation!.le, { dateStyle: 'long' }),
          motif: v.annulation!.motif ?? '',
        })
      : v.signature === 'valide'
        ? t('verif.valide')
        : t('verif.a_verifier');
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${esc(t('verif.titre'))}</title>
<style>body{font:17px/1.5 system-ui,sans-serif;max-width:640px;margin:24px auto;padding:0 16px;color:#1b1b1b;background:#fffdf8}
.s{padding:12px 16px;border-radius:12px;font-weight:700}.ok{background:#eaf7f1;color:#1b7f4b}.ko{background:#fdecea;color:#b3261e}
th{text-align:left;padding:6px 12px 6px 0;vertical-align:top}td{padding:6px 0;overflow-wrap:anywhere}p.m{color:#4a5566;font-size:15px}</style></head><body>
<h1>${esc(t('verif.titre'))}</h1>
<p class="s ${ok ? 'ok' : 'ko'}" role="status">${esc(status)}</p>
${rows.length ? `<table>${rows.map(([k, x]) => `<tr><th>${esc(k)}</th><td>${esc(x)}</td></tr>`).join('')}</table>` : ''}
<p class="m">${esc(t('verif.explication'))}</p>
</body></html>`;
}
