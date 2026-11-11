/**
 * @license MIT
 * OpenRouter Agentic Proxy & Dashboard — Point d'entrée API & Handlers (src/index.ts)
 *
 * Ce module expose les gestionnaires HTTP compatibles à la fois avec Fastify et Express,
 * permettant d'intercepter `/v1/chat/completions` et de servir la télémétrie temps réel.
 */

import { formatStructuredLogEntry, MODEL_CATALOG } from './logger';
import { proxyStore } from './proxy';
import { ChaosMode, OpenRouterProxyRequest, ProviderStatus } from './types';

export { proxyStore, MODEL_CATALOG, formatStructuredLogEntry };

/**
 * Normalise une requête HTTP entrante (avec en-têtes X-Agent-*) en OpenRouterProxyRequest.
 */
export function buildProxyRequestFromHttp(
  body: Partial<OpenRouterProxyRequest> & Record<string, unknown>,
  headers: Record<string, string | string[] | undefined>
): OpenRouterProxyRequest {
  const getHeader = (name: string): string | undefined => {
    const val = headers[name.toLowerCase()];
    if (Array.isArray(val)) return val[0];
    return val;
  };

  const headerFallbacks = getHeader('x-fallback-models')
    ?.split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const chaosHeader = getHeader('x-chaos-mode') as ChaosMode | undefined;

  return {
    model:
      typeof body.model === 'string' && body.model.trim()
        ? body.model.trim()
        : 'anthropic/claude-3.7-sonnet',
    messages: Array.isArray(body.messages)
      ? body.messages
      : [
          {
            role: 'user',
            content:
              'Exécution d’une étape d’agent autonome via OpenRouter Proxy.',
          },
        ],
    temperature: typeof body.temperature === 'number' ? body.temperature : 0.2,
    max_tokens: typeof body.max_tokens === 'number' ? body.max_tokens : 1024,
    fallback_models: body.fallback_models ?? headerFallbacks,
    chaos_mode: body.chaos_mode ?? chaosHeader ?? 'none',
    agent_context: {
      workflowId:
        body.agent_context?.workflowId ??
        getHeader('x-workflow-id') ??
        'wf-live-session',
      agentId:
        body.agent_context?.agentId ??
        getHeader('x-agent-id') ??
        'agent-autonomous-01',
      agentStep:
        body.agent_context?.agentStep ??
        getHeader('x-agent-step') ??
        'Step 1 · Exécution directe',
      stepIndex:
        body.agent_context?.stepIndex ??
        Number(getHeader('x-agent-step-index') || 1),
      fallbackModels: headerFallbacks,
    },
  };
}

/**
 * Formate la réponse standard compatible OpenAI / OpenRouter `/v1/chat/completions`
 * enrichie des métadonnées de télémétrie `x_agentic_proxy`.
 */
export function formatOpenRouterCompletionResponse(
  req: OpenRouterProxyRequest
) {
  const trace = proxyStore.dispatchProxyRequest(req);
  const structuredLog = formatStructuredLogEntry(trace);

  return {
    id: `gen-${trace.id}`,
    object: 'chat.completion',
    created: Math.floor(new Date(trace.timestamp).getTime() / 1000),
    model: trace.resolvedModel,
    provider: trace.resolvedProvider,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: trace.responsePreview,
        },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: trace.tokens.promptTokens,
      completion_tokens: trace.tokens.completionTokens,
      total_tokens: trace.tokens.totalTokens,
    },
    x_agentic_proxy: {
      trace_id: trace.id,
      workflow_id: trace.workflowId,
      agent_id: trace.agentId,
      agent_step: trace.agentStep,
      requested_model: trace.requestedModel,
      resolved_model: trace.resolvedModel,
      resolved_provider: trace.resolvedProvider,
      fallback_triggered: trace.fallbackTriggered,
      fallback_count: trace.fallbackCount,
      total_latency_ms: trace.totalLatencyMs,
      cost_usd: trace.cost,
      attempts: trace.attempts,
      structured_log: JSON.parse(structuredLog),
    },
  };
}

export type { ProviderStatus, ChaosMode, OpenRouterProxyRequest };
