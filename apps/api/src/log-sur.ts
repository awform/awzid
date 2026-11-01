/**
 * Journal d'erreurs SANS donnée personnelle ni secret. Une erreur de requête SQL (drizzle) porte les paramètres de la
 * requête (empreinte de mot de passe, prénom, année, identifiant) dans son message, sa cause et son détail PostgreSQL :
 * on n'en garde que le genre d'erreur, le code, le nom de la contrainte et la pile d'appels.
 */
export interface ErreurSure {
  nom: string;
  message: string;
  code?: string;
  contrainte?: string;
  table?: string;
  pile: string[];
}

export function erreurSure(e: unknown): ErreurSure {
  const x = (e ?? {}) as {
    name?: string;
    message?: string;
    code?: string;
    stack?: string;
    cause?: { code?: string; constraint?: string; table?: string };
  };
  // « Failed query: <SQL>\nparams: a,b,c » : seule la partie avant les paramètres est gardée
  const message = String(x.message ?? '')
    .split(/\r?\nparams:/)[0]!
    .slice(0, 300);
  return {
    nom: String(x.name ?? 'Error'),
    message: x.cause ? message.split('\n')[0]!.slice(0, 120) : message,
    ...((x.cause?.code ?? x.code) ? { code: x.cause?.code ?? x.code } : {}),
    ...(x.cause?.constraint ? { contrainte: x.cause.constraint } : {}),
    ...(x.cause?.table ? { table: x.cause.table } : {}),
    pile: String(x.stack ?? '')
      .split('\n')
      .filter((l) => l.trim().startsWith('at '))
      .slice(0, 12),
  };
}
