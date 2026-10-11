/**
 * F5 — image de l'ÉCRAN pour « Donner mon avis », faite sur l'appareil, sans bibliothèque ni service tiers :
 * copie de la page visible (styles calculés recopiés), zones `data-prive` et champs de saisie masqués, fenêtre
 * de l'avis retirée (`data-avis-exclu`), puis dessin SVG → canevas → JPEG (720 px de large au plus). Les images
 * et polices de la page ne sont pas recopiées (l'image reste lisible, en polices du système). Renvoie null si le
 * navigateur refuse (l'avis part alors sans image).
 */
const MAX_W = 720;
const MAX_ELEMENTS = 6000;
const SVG_NS = 'http://www.w3.org/2000/svg';
const XHTML_NS = 'http://www.w3.org/1999/xhtml';

function copierStyles(src: Element, dst: HTMLElement) {
  const cs = getComputedStyle(src);
  let s = '';
  for (let i = 0; i < cs.length; i++) {
    const p = cs[i]!;
    // animations et transitions inutiles dans une image figée
    if (p.startsWith('transition') || p.startsWith('animation')) continue;
    s += `${p}:${cs.getPropertyValue(p)};`;
  }
  dst.setAttribute('style', s);
}

function masquer(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  el.replaceChildren();
  el.setAttribute(
    'style',
    `${el.getAttribute('style') ?? ''};background:#9aa3ab;color:transparent;width:${r.width}px;height:${r.height}px;border-radius:4px`,
  );
}

export async function captureEcran(): Promise<string | null> {
  const w = document.documentElement.clientWidth;
  const h = window.innerHeight;
  const body = document.body;
  const clone = body.cloneNode(true) as HTMLElement;
  const src = [body, ...body.querySelectorAll('*')];
  const dst = [clone, ...clone.querySelectorAll('*')] as HTMLElement[];
  if (src.length !== dst.length || src.length > MAX_ELEMENTS) return null;
  for (let i = 0; i < src.length; i++) copierStyles(src[i]!, dst[i]!);
  for (const el of clone.querySelectorAll<HTMLElement>(
    'script, noscript, iframe, video, audio, canvas, [data-avis-exclu], dialog',
  ))
    el.remove();
  for (const el of clone.querySelectorAll<HTMLElement>('[data-prive], input, textarea, select'))
    masquer(el);
  for (const img of clone.querySelectorAll('img')) img.removeAttribute('src');
  clone.style.margin = '0';
  clone.style.transform = `translate(${-window.scrollX}px, ${-window.scrollY}px)`;
  const xml = new XMLSerializer().serializeToString(clone);
  const svg =
    `<svg xmlns="${SVG_NS}" width="${w}" height="${h}"><foreignObject width="100%" height="100%">` +
    `<div xmlns="${XHTML_NS}" style="width:${w}px;height:${h}px;overflow:hidden;background:${getComputedStyle(body).backgroundColor}">` +
    `${xml}</div></foreignObject></svg>`;
  const img = new Image();
  img.decoding = 'async';
  const loaded = new Promise<void>((ok, ko) => {
    img.onload = () => ok();
    img.onerror = () => ko(new Error('image'));
  });
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  try {
    await loaded;
    const scale = Math.min(1, MAX_W / w);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const out = canvas.toDataURL('image/jpeg', 0.6);
    // ≈ 400 Ko au plus côté serveur (base64 : × 4/3)
    return out.startsWith('data:image/jpeg') && out.length < 520_000 ? out : null;
  } catch {
    return null;
  }
}
