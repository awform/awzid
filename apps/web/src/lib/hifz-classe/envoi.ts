/**
 * Hifẓ en classe — ENVOI de l'enregistrement d'un ADULTE consentant (corps audio brut) : utilisé seulement par « M'enregistrer pour
 * mon maître » ; le côté maître (donnees.ts) ne manipule jamais d'audio.
 */
/** Envoi d'un enregistrement (corps audio brut) : seulement un adulte consentant ; renvoie la durée de conservation. */
export async function envoyerEnregistrement(
  profileId: string,
  classeId: string,
  passage: string,
  blob: Blob,
  duree?: number,
): Promise<{ ok: boolean; jours?: number; expiresAt?: string; code?: string }> {
  try {
    const r = await fetch(
      `/api/v1/profiles/${profileId}/hifz-classe/enregistrements?classe=${classeId}&passage=${encodeURIComponent(passage)}${duree ? `&duree=${duree}` : ''}`,
      {
        method: 'POST',
        headers: {
          'x-awform': '1',
          'content-type': (blob.type || 'audio/webm').split(';')[0]!,
        },
        body: blob,
        credentials: 'same-origin',
      },
    );
    const j = (await r.json().catch(() => null)) as {
      error?: { code?: string };
      jours?: number;
      recitation?: { expiresAt: string };
    } | null;
    return r.ok
      ? { ok: true, jours: j?.jours, expiresAt: j?.recitation?.expiresAt }
      : { ok: false, code: j?.error?.code ?? 'erreur' };
  } catch {
    return { ok: false, code: 'reseau' };
  }
}
