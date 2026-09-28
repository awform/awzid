/** Clé serveur (32 octets, 64 caractères hexadécimaux) lue dans l'environnement, jamais dans le dépôt. */
export function secretKeyFromEnv(env: NodeJS.ProcessEnv = process.env): Buffer | null {
  const hex = env.AWFORM_SECRET_KEY ?? '';
  return /^[0-9a-f]{64}$/i.test(hex) ? Buffer.from(hex, 'hex') : null;
}
