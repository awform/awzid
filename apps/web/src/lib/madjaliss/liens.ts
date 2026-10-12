/**
 * Paramètres des adresses de la rubrique (une seule page `/madjaliss/[[texte]]/[[n]]` : /madjaliss,
 * /madjaliss/<texte>, /madjaliss/<texte>/<séance>), à passer à `resolve('/madjaliss/[[texte]]/[[n]]', …)`.
 */
export function lien(texte?: string, n?: number): { texte?: string; n?: string } {
  return {
    ...(texte ? { texte } : {}),
    ...(texte && n !== undefined ? { n: String(n) } : {}),
  };
}
