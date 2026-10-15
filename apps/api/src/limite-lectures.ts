/**
 * Lot 9 (rapport de charge et de sécurité du 14/10, R5) : LIMITE GLOBALE DES LECTURES de l'API (GET/HEAD), contre le
 * moissonnage et le déni de service applicatif (avant : 360 req/s acceptées d'une seule adresse sans un seul 429).
 *
 * Seau à jetons en mémoire (une instance d'API par serveur) :
 *  - débit SOUTENU de `debit` requêtes par seconde, RAFALE de `rafale` requêtes (seau plein au départ) ;
 *  - au-delà : 429 `trop_de_requetes` avec `Retry-After` (secondes entières, au moins 1) ;
 *  - CLÉ du seau : le COMPTE pour une requête authentifiée (`req.auth.accountId`), l'ADRESSE sinon. Une classe
 *    derrière une seule adresse (école, relais) n'est donc jamais limitée collectivement : chaque élève connecté a son
 *    propre seau ; seuls les visiteurs ANONYMES partagent le seau de leur adresse (pages d'accueil, statut, connexion :
 *    quelques requêtes chacun, couvertes par la rafale). Exemption documentée : aucune autre (un compte d'école a la
 *    même limite qu'un élève, largement au-dessus d'un usage humain) ;
 *  - IPv6 : l'adresse est ramenée à son préfixe /64 (une machine en a souvent des milliers) ;
 *  - ne compte pas : la santé (`/api/v1/health`), les écritures (POST, PUT, PATCH, DELETE : limites propres à chaque
 *    route : connexion, inscription, écoute…), ni ce qui n'est pas sous `/api/` ;
 *  - mémoire bornée : au plus `maxCles` seaux ; les seaux pleins (inactifs) sont retirés toutes les 60 s, et si la table
 *    déborde malgré tout, la plus ancienne clé part (une adresse qui en change sans cesse ne fait pas grossir la mémoire).
 *
 * Réglage : `AWFORM_LIMITE_LECTURES` = « <débit>/<rafale> » (défaut « 60/300 » : 60 req/s soutenues, rafale de 300),
 * « off » pour la couper (retour arrière sans redéploiement de l'image : variable d'environnement + redémarrage).
 */
import type { FastifyInstance } from 'fastify';
import { err } from './guards.js';

export interface LimiteLectures {
  debit: number;
  rafale: number;
}

export const LIMITE_DEFAUT: LimiteLectures = { debit: 60, rafale: 300 };

/** Lit « 60/300 », « 60 » (rafale = 5 × débit) ou « off » ; une valeur illisible garde le défaut (jamais coupée par erreur). */
export function limiteDepuis(v: string | undefined): LimiteLectures | null {
  const s = (v ?? '').trim().toLowerCase();
  if (s === 'off' || s === '0') return null;
  const m = /^(\d{1,6})(?:\/(\d{1,7}))?$/.exec(s);
  if (!m) return LIMITE_DEFAUT;
  const debit = Number(m[1]);
  const rafale = m[2] ? Number(m[2]) : debit * 5;
  return debit > 0 && rafale >= 1 ? { debit, rafale } : LIMITE_DEFAUT;
}

/** Adresse ramenée à son préfixe /64 pour l'IPv6 (les quatre premiers groupes), telle quelle pour l'IPv4. */
export function cleAdresse(ip: string): string {
  if (!ip.includes(':') || /^::ffff:\d+\.\d+\.\d+\.\d+$/i.test(ip))
    return ip.replace(/^::ffff:/i, '');
  const [tete = '', queue = ''] = ip.toLowerCase().split('::');
  const a = tete ? tete.split(':') : [];
  const b = queue ? queue.split(':') : [];
  const groupes = ip.includes('::')
    ? [...a, ...Array(Math.max(0, 8 - a.length - b.length)).fill('0'), ...b]
    : a;
  return `${groupes.slice(0, 4).join(':')}::/64`;
}

interface Seau {
  jetons: number;
  vu: number;
}

/** Seaux à jetons (horloge injectable pour les tests). */
export class Seaux {
  private readonly seaux = new Map<string, Seau>();
  constructor(
    private readonly limite: LimiteLectures,
    private readonly maintenant: () => number = Date.now,
    private readonly maxCles = 100_000,
  ) {}

  /** Prend un jeton ; renvoie 0 si la requête passe, sinon le délai d'attente en millisecondes. */
  prendre(cle: string): number {
    const t = this.maintenant();
    let s = this.seaux.get(cle);
    if (!s) {
      if (this.seaux.size >= this.maxCles) {
        const plusAncienne = this.seaux.keys().next().value;
        if (plusAncienne !== undefined) this.seaux.delete(plusAncienne);
      }
      s = { jetons: this.limite.rafale, vu: t };
      this.seaux.set(cle, s);
    } else {
      s.jetons = Math.min(this.limite.rafale, s.jetons + ((t - s.vu) / 1000) * this.limite.debit);
      s.vu = t;
    }
    if (s.jetons >= 1) {
      s.jetons -= 1;
      return 0;
    }
    return Math.ceil(((1 - s.jetons) / this.limite.debit) * 1000);
  }

  /** Retire les seaux redevenus pleins (inactifs) : rien n'est oublié qui limiterait encore. */
  nettoyer(): void {
    const t = this.maintenant();
    for (const [k, s] of this.seaux)
      if (s.jetons + ((t - s.vu) / 1000) * this.limite.debit >= this.limite.rafale)
        this.seaux.delete(k);
  }

  get taille(): number {
    return this.seaux.size;
  }
}

const NON_COMPTE = /^\/api\/v1\/health(\/|\?|$)/;

/**
 * Pose la limite (après la lecture de la session : `req.auth` est connu).
 * `mandataire` (production : TRUST_PROXY ≥ 1, Caddy en bordure) : une requête SANS `X-Forwarded-For` ne vient pas
 * d'un visiteur (Caddy ajoute toujours cet en-tête ; l'API n'est joignable que par le réseau interne) mais du serveur
 * web lui-même (statut du site gardé 5 s, page publique d'un QR code, droits des fichiers gardés) : elle n'est pas
 * comptée, sinon tous les visiteurs anonymes partageraient le seau de l'adresse du serveur web.
 */
export function registerLimiteLectures(
  app: FastifyInstance,
  {
    limite = limiteDepuis(process.env.AWFORM_LIMITE_LECTURES),
    maintenant = Date.now,
    mandataire = false,
  }: {
    limite?: LimiteLectures | null;
    maintenant?: () => number;
    mandataire?: boolean;
  } = {},
): Seaux | null {
  if (!limite) return null;
  const seaux = new Seaux(limite, maintenant);
  const minuterie = setInterval(() => seaux.nettoyer(), 60_000);
  minuterie.unref();
  app.addHook('onClose', async () => clearInterval(minuterie));
  app.addHook('onRequest', async (req, reply) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return;
    if (!req.url.startsWith('/api/') || NON_COMPTE.test(req.url)) return;
    if (mandataire && req.headers['x-forwarded-for'] === undefined) return;
    const cle = req.auth ? `c:${req.auth.accountId}` : `a:${cleAdresse(req.ip)}`;
    const attente = seaux.prendre(cle);
    if (attente === 0) return;
    void reply.header('Retry-After', String(Math.max(1, Math.ceil(attente / 1000))));
    return err(reply, 429, 'trop_de_requetes');
  });
  return seaux;
}
