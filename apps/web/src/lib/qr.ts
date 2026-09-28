/**
 * Rendu HTML de la page publique du QR code (sans JavaScript, < 100 Ko, jamais d'exercice ni de corrigé).
 */
import { letterColorIndex, splitMarked } from '@awform/content/text';
import { t } from './i18n';

export interface PublicUnit {
  unitId: string;
  levelCode: string | null;
  kind?: string;
  numLecon?: number | null;
  titleAr?: string;
  titleFr?: string;
  lesson: {
    titre_ar?: string;
    titre_fr?: string;
    lettres: Array<{ l: string }>;
    objectifs: Array<{ ar?: string; fr?: string }>;
    mots: Array<{ ar?: string; fr?: string; img?: string }>;
  } | null;
  illustrations: Record<string, { viewBox: string; svg: string }>;
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function renderPublic(u: PublicUnit): string {
  const L = u.lesson;
  const lettres = L?.lettres ?? [];
  // lettres étudiées colorées comme dans le livre (balisage [..]), texte jamais transformé
  const ar = (s: unknown) =>
    splitMarked(String(s ?? ''))
      .map((seg) =>
        seg.marked
          ? `<span class="c${letterColorIndex(seg.text, lettres)}">${esc(seg.text)}</span>`
          : esc(seg.text),
      )
      .join('');
  const title = L?.titre_fr ?? u.titleFr ?? u.unitId;
  const symbols = Object.entries(u.illustrations)
    .map(([k, v]) => `<symbol id="i-${esc(k)}" viewBox="${esc(v.viewBox)}">${v.svg}</symbol>`)
    .join('');
  const words = (L?.mots ?? [])
    .map(
      (m) =>
        `<li>${m.img && u.illustrations[m.img] ? `<svg class="pic" aria-hidden="true"><use href="#i-${esc(m.img)}"/></svg>` : ''}<span class="ar" lang="ar" dir="rtl">${ar(m.ar)}</span><span class="fr">${esc(m.fr)}</span></li>`,
    )
    .join('');
  const goals = (L?.objectifs ?? [])
    .map(
      (o) =>
        `<li>${o.ar ? `<span class="ar" lang="ar" dir="rtl">${ar(o.ar)}</span> ` : ''}${ar(o.fr)}</li>`,
    )
    .join('');
  const letters = (L?.lettres ?? [])
    .map((x) => `<span class="ar big" lang="ar" dir="rtl">${esc(x.l)}</span>`)
    .join(' ');
  const num = u.kind === 'lecon' && u.numLecon ? t('unite.lecon', { n: u.numLecon }) : '';
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(t('app.nom'))} — ${esc(title)}</title>
<meta name="description" content="${esc(t('qr.description'))}">
<meta name="robots" content="noindex">
<style>
body{margin:0;font:16px/1.5 system-ui,sans-serif;background:#fffdf7;color:#1c1b19}
main{max-width:720px;margin:0 auto;padding:16px}
header{background:#17344f;color:#fff;padding:12px 16px;font-weight:700;letter-spacing:.08em}
.ar{font-family:'Noto Naskh Arabic','Geeza Pro','Traditional Arabic',serif;font-size:1.5em}
.big{font-size:2.4em}.c0{color:#e5484d}.c1{color:#2f6fdb}.c2{color:#1f9d6b}.c3{color:#c98a0b}
h1{margin:.2em 0}.muted{color:#5b5a55}
ul.words{list-style:none;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px}
ul.words li{border:2px solid #e8dfcd;border-radius:14px;padding:8px;display:grid;justify-items:center;gap:2px;background:#fff}
.pic{width:88px;height:88px}.fr{color:#5b5a55}
a.go{display:inline-block;margin:16px 0;padding:12px 18px;border-radius:12px;background:#1f7a8c;color:#fff;font-weight:700;text-decoration:none}
</style></head>
<body><header>${esc(t('app.nom'))}</header><main>
<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${symbols}</defs></svg>
<p class="muted">${esc(num)}</p>
<h1><span class="ar" lang="ar" dir="rtl">${ar(L?.titre_ar ?? u.titleAr ?? '')}</span><br>${ar(title)}</h1>
${letters ? `<p>${letters}</p>` : ''}
${goals ? `<h2>${esc(t('qr.objectifs'))}</h2><ul>${goals}</ul>` : ''}
${words ? `<h2>${esc(t('qr.mots'))}</h2><ul class="words">${words}</ul>` : ''}
<a class="go" href="/lecons/${esc(u.unitId)}">${esc(t('qr.continuer'))}</a>
<p class="muted">${esc(t('qr.note'))}</p>
</main></body></html>`;
}
