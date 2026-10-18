/**
 * EXPÉDITEUR de messages WhatsApp (abstrait) — secours PAYANT seulement (éteint par défaut : AWFORM_TELEPHONE_ENVOI).
 * Le parcours normal est GRATUIT : la personne envoie elle-même le message pré-rempli (vérification « inversée »).
 *  - « simule » : aucun appel à Meta ; chaque message est écrit dans un fichier JSON (droits 600) de la boîte de
 *    démonstration (AWFORM_WHATSAPP_JOURNAL_DIR), comme les e-mails en mode « journal » — démonstration et essais ;
 *  - « memoire » : tests ;
 *  - « cloud » : WhatsApp Cloud API (Meta), message de MODÈLE (« authentication ») approuvé par Meta ; NON BRANCHÉ tant
 *    que les variables manquent (aucune clé dans le dépôt) — voir EXPLOITATION.md § « WhatsApp ».
 * Les journaux de l'API ne contiennent jamais le numéro ni le code.
 */
import { randomUUID } from 'node:crypto';
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ConfigTelephone } from './config.js';

export interface MessageTel {
  /** numéro E.164 du destinataire */
  to: string;
  /** « code » (code à 6 chiffres) ou « invitation » (lien d'inscription) */
  kind: 'code' | 'invitation';
  code?: string;
  link?: string;
  locale: string;
}

export interface Expediteur {
  mode: 'simule' | 'memoire' | 'cloud' | 'inactif';
  send(m: MessageTel): Promise<void>;
}

export const expediteurInactif: Expediteur = {
  mode: 'inactif',
  send: async () => {
    throw new Error('envoi WhatsApp inactif');
  },
};

export function expediteurMemoire(): Expediteur & { sent: MessageTel[] } {
  const sent: MessageTel[] = [];
  return { mode: 'memoire', sent, send: async (m) => void sent.push(m) };
}

export function expediteurSimule(dir: string): Expediteur {
  return {
    mode: 'simule',
    async send(m) {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      const date = new Date().toISOString();
      const file = join(dir, `${date.replace(/[:.]/g, '-')}-${randomUUID()}.json`);
      writeFileSync(file, JSON.stringify({ date, canal: 'whatsapp', ...m }, null, 2), {
        mode: 0o600,
      });
      chmodSync(file, 0o600);
    },
  };
}

/**
 * WhatsApp Cloud API : POST https://graph.facebook.com/v21.0/<PHONE_ID>/messages, modèle d'authentification
 * (`AWFORM_WHATSAPP_MODELE`, un paramètre : le code ; bouton « copier le code »). Les invitations passent par un
 * modèle « utilitaire » de même nom suivi de « _invitation » (paramètre : le lien). Non testé contre Meta (aucune clé).
 */
export function expediteurCloud(cfg: NonNullable<ConfigTelephone['cloud']>): Expediteur {
  return {
    mode: 'cloud',
    async send(m) {
      const param = m.kind === 'code' ? (m.code ?? '') : (m.link ?? '');
      const components =
        m.kind === 'code'
          ? [
              { type: 'body', parameters: [{ type: 'text', text: param }] },
              {
                type: 'button',
                sub_type: 'url',
                index: '0',
                parameters: [{ type: 'text', text: param }],
              },
            ]
          : [{ type: 'body', parameters: [{ type: 'text', text: param }] }];
      const r = await fetch(`https://graph.facebook.com/v21.0/${cfg.phoneId}/messages`, {
        method: 'POST',
        headers: { authorization: `Bearer ${cfg.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: m.to.replace(/^\+/, ''),
          type: 'template',
          template: {
            name: m.kind === 'code' ? cfg.modele : `${cfg.modele}_invitation`,
            language: { code: cfg.langue },
            components,
          },
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!r.ok) throw new Error(`WhatsApp Cloud API : ${r.status}`);
    },
  };
}

export function expediteurDepuis(cfg: ConfigTelephone): Expediteur {
  if (!cfg.envoi) return expediteurInactif;
  if (cfg.mode === 'simule')
    return expediteurSimule(cfg.journalDir ?? join(tmpdir(), 'awzid-whatsapp-demo'));
  return cfg.cloud ? expediteurCloud(cfg.cloud) : expediteurInactif;
}
