/**
 * Adaptateur Claude (API Anthropic, SDK officiel) — PRÊT À BRANCHER, jamais activé sans :
 * (1) une clé fournie par l'environnement (ANTHROPIC_API_KEY, jamais versionnée ; le SDK la lit seul),
 * (2) une batterie de tests adverses passée avec CE fournisseur et les mêmes rôles (voir gate.ts).
 * Modèles décidés par l'architecture (§ 1.2, 1.9) : Claude Haiku 4.5 pour les enfants (reformulation
 * courte), Claude Sonnet 5 pour les ados et adultes ; surchargeables par AWFORM_TUTEUR_MODELE_ENFANT /
 * AWFORM_TUTEUR_MODELE_ADULTE. Sortie structurée (schéma JSON) ; invite système mise en cache.
 */
import Anthropic from '@anthropic-ai/sdk';
import { DRAFT_SCHEMA } from '../filter.js';
import {
  userMessage,
  type ProviderInput,
  type ProviderOutput,
  type TutorProvider,
} from './types.js';

const ZERO = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };

export class ClaudeProvider implements TutorProvider {
  readonly name = 'claude';
  readonly real = true;
  private readonly client: Anthropic;

  constructor(opts: { timeoutMs?: number } = {}) {
    // la clé vient de l'environnement (ANTHROPIC_API_KEY) : jamais écrite dans le dépôt ni dans un journal
    this.client = new Anthropic({ timeout: opts.timeoutMs ?? 20_000, maxRetries: 1 });
  }

  async respond(input: ProviderInput): Promise<ProviderOutput> {
    const isHaiku = input.model.startsWith('claude-haiku');
    try {
      const res = await this.client.messages.create({
        model: input.model,
        max_tokens: input.role.maxTokens,
        system: [{ type: 'text', text: input.role.system, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: userMessage(input) }],
        output_config: {
          format: {
            type: 'json_schema',
            schema: DRAFT_SCHEMA as unknown as Record<string, unknown>,
          },
          // réponses courtes et encadrées : effort bas (Haiku 4.5 ne prend pas ce réglage)
          ...(isHaiku ? {} : { effort: 'low' as const }),
        },
      });
      const usage = {
        inputTokens: res.usage.input_tokens + (res.usage.cache_creation_input_tokens ?? 0),
        outputTokens: res.usage.output_tokens,
        cacheReadTokens: res.usage.cache_read_input_tokens ?? 0,
      };
      if (res.stop_reason === 'refusal') return { draft: null, status: 'refus', usage };
      if (res.stop_reason === 'max_tokens')
        return { draft: null, status: 'erreur', usage, detail: 'max_tokens' };
      const text = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');
      let draft: unknown = null;
      try {
        draft = JSON.parse(text);
      } catch {
        draft = null;
      }
      return { draft, status: 'ok', usage };
    } catch (e) {
      const detail =
        e instanceof Anthropic.RateLimitError
          ? 'limite_de_debit'
          : e instanceof Anthropic.AuthenticationError
            ? 'cle_invalide'
            : e instanceof Anthropic.APIError
              ? `api_${e.status ?? 'reseau'}`
              : 'reseau';
      return { draft: null, status: 'erreur', usage: ZERO, detail };
    }
  }
}
