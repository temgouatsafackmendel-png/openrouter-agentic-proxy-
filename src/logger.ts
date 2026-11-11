/**
 * @license MIT
 * OpenRouter Agentic Proxy & Dashboard — Journalisation structurée & Calculateur de coûts (src/logger.ts)
 */

import {
  AgentTraceLog,
  AgentWorkflowSummary,
  CostBreakdown,
  ModelPricingSpec,
  TimeSeriesPoint,
  TokenUsage,
} from './types';

export const MODEL_CATALOG: Record<string, ModelPricingSpec> = {
  'anthropic/claude-3.7-sonnet': {
    model: 'anthropic/claude-3.7-sonnet',
    provider: 'Anthropic',
    displayName: 'Claude 3.7 Sonnet',
    inputCostPer1M: 3.0,
    outputCostPer1M: 15.0,
    contextWindow: 200000,
    defaultLatencyMs: 680,
  },
  'openai/gpt-4o': {
    model: 'openai/gpt-4o',
    provider: 'OpenAI',
    displayName: 'GPT-4o Omni',
    inputCostPer1M: 2.5,
    outputCostPer1M: 10.0,
    contextWindow: 128000,
    defaultLatencyMs: 540,
  },
  'deepseek/deepseek-r1': {
    model: 'deepseek/deepseek-r1',
    provider: 'DeepSeek',
    displayName: 'DeepSeek R1 Reasoning',
    inputCostPer1M: 0.55,
    outputCostPer1M: 2.19,
    contextWindow: 128000,
    defaultLatencyMs: 890,
  },
  'google/gemini-2.5-pro': {
    model: 'google/gemini-2.5-pro',
    provider: 'Google Vertex',
    displayName: 'Gemini 2.5 Pro',
    inputCostPer1M: 1.25,
    outputCostPer1M: 5.0,
    contextWindow: 1000000,
    defaultLatencyMs: 490,
  },
  'meta-llama/llama-3.3-70b-instruct': {
    model: 'meta-llama/llama-3.3-70b-instruct',
    provider: 'Together / Fireworks',
    displayName: 'Llama 3.3 70B Instruct',
    inputCostPer1M: 0.4,
    outputCostPer1M: 0.6,
    contextWindow: 131072,
    defaultLatencyMs: 360,
  },
  'qwen/qwen-2.5-coder-32b-instruct': {
    model: 'qwen/qwen-2.5-coder-32b-instruct',
    provider: 'Alibaba Cloud',
    displayName: 'Qwen 2.5 Coder 32B',
    inputCostPer1M: 0.2,
    outputCostPer1M: 0.4,
    contextWindow: 131072,
    defaultLatencyMs: 320,
  },
};

/**
 * Calcule avec précision le coût en USD d'une étape d'agent selon le modèle résolu et les tokens consommés.
 */
export function calculateStepCost(
  modelId: string,
  tokens: TokenUsage,
  cacheHitRatio = 0
): CostBreakdown {
  const spec = MODEL_CATALOG[modelId] ?? {
    model: modelId,
    provider: 'OpenRouter Generic',
    displayName: modelId,
    inputCostPer1M: 1.5,
    outputCostPer1M: 6.0,
    contextWindow: 128000,
    defaultLatencyMs: 600,
  };

  const clampedCacheRatio = Math.max(0, Math.min(0.9, cacheHitRatio));
  const rawPromptCost = (tokens.promptTokens / 1_000_000) * spec.inputCostPer1M;
  const savedByCacheUsd = Number((rawPromptCost * clampedCacheRatio).toFixed(6));
  const promptCostUsd = Number((rawPromptCost - savedByCacheUsd).toFixed(6));
  const completionCostUsd = Number(
    ((tokens.completionTokens / 1_000_000) * spec.outputCostPer1M).toFixed(6)
  );
  const totalCostUsd = Number((promptCostUsd + completionCostUsd).toFixed(6));

  return {
    promptCostUsd,
    completionCostUsd,
    totalCostUsd,
    savedByCacheUsd,
  };
}

/**
 * Formate une entrée de log structurée JSON prête pour Pino / Fastify / OpenTelemetry.
 */
export function formatStructuredLogEntry(trace: AgentTraceLog): string {
  const payload = {
    level: trace.fallbackTriggered ? 'warn' : 'info',
    time: trace.timestamp,
    service: 'openrouter-agentic-proxy',
    traceId: trace.id,
    workflowId: trace.workflowId,
    agent: {
      id: trace.agentId,
      step: trace.agentStep,
      stepIndex: trace.stepIndex,
    },
    routing: {
      requestedModel: trace.requestedModel,
      resolvedModel: trace.resolvedModel,
      resolvedProvider: trace.resolvedProvider,
      fallbackTriggered: trace.fallbackTriggered,
      fallbackCount: trace.fallbackCount,
      statusCode: trace.statusCode,
      totalLatencyMs: trace.totalLatencyMs,
    },
    tokens: trace.tokens,
    costUsd: trace.cost.totalCostUsd,
  };
  return JSON.stringify(payload);
}

/**
 * Agrège les traces individuelles en workflows multi-étapes avec calcul des budgets.
 */
export function buildWorkflowSummaries(
  traces: AgentTraceLog[],
  budgetLimitUsd = 2.5
): AgentWorkflowSummary[] {
  const grouped = new Map<string, AgentTraceLog[]>();

  for (const trace of traces) {
    const existing = grouped.get(trace.workflowId) ?? [];
    existing.push(trace);
    grouped.set(trace.workflowId, existing);
  }

  const WORKFLOW_TITLES: Record<string, string> = {
    'wf-sec-audit-01': 'Audit de sécurité & patch CVE automatisé',
    'wf-rag-synth-02': 'Pipeline de synthèse RAG multi-sources juridiques',
    'wf-code-mig-03': 'Refactoring autonome Fastify v5 & validation AST',
    'wf-fin-quant-04': 'Extraction de signaux macroéconomiques & backtest',
  };

  const summaries: AgentWorkflowSummary[] = [];

  for (const [workflowId, wfTraces] of grouped.entries()) {
    const sortedSteps = [...wfTraces].sort((a, b) => a.stepIndex - b.stepIndex);
    const first = sortedSteps[0];
    const totalTokens = sortedSteps.reduce((acc, s) => acc + s.tokens.totalTokens, 0);
    const totalCostUsd = Number(
      sortedSteps.reduce((acc, s) => acc + s.cost.totalCostUsd, 0).toFixed(6)
    );
    const totalLatencyMs = sortedSteps.reduce((acc, s) => acc + s.totalLatencyMs, 0);
    const fallbacksUsed = sortedSteps.reduce((acc, s) => acc + s.fallbackCount, 0);

    let status: AgentWorkflowSummary['status'] = 'completed';
    if (totalCostUsd >= budgetLimitUsd * 0.85) {
      status = 'budget_warning';
    } else if (fallbacksUsed > 0) {
      status = 'degraded_recovered';
    }

    summaries.push({
      workflowId,
      agentId: first?.agentId ?? 'agent-orchestrator',
      title:
        WORKFLOW_TITLES[workflowId] ??
        `Exécution autonome ${first?.agentId ?? 'Agent'} (${workflowId})`,
      startedAt: first?.timestamp ?? new Date().toISOString(),
      status,
      totalSteps: Math.max(sortedSteps.length, 4),
      completedSteps: sortedSteps.length,
      totalTokens,
      totalCostUsd,
      budgetLimitUsd,
      totalLatencyMs,
      fallbacksUsed,
      steps: sortedSteps,
    });
  }

  return summaries.sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  );
}

/**
 * Génère l'historique temporel pour les graphiques de supervision du dashboard.
 */
export function buildInitialTimeSeries(): TimeSeriesPoint[] {
  return [
    { timeLabel: '10:00', requests: 142, fallbacks: 4, tokensK: 310, costUsd: 1.42, p95LatencyMs: 610 },
    { timeLabel: '10:05', requests: 168, fallbacks: 6, tokensK: 385, costUsd: 1.79, p95LatencyMs: 640 },
    { timeLabel: '10:10', requests: 215, fallbacks: 19, tokensK: 520, costUsd: 2.38, p95LatencyMs: 890 },
    { timeLabel: '10:15', requests: 194, fallbacks: 14, tokensK: 470, costUsd: 1.95, p95LatencyMs: 760 },
    { timeLabel: '10:20', requests: 230, fallbacks: 8, tokensK: 590, costUsd: 2.64, p95LatencyMs: 580 },
    { timeLabel: '10:25', requests: 264, fallbacks: 27, tokensK: 680, costUsd: 2.89, p95LatencyMs: 920 },
    { timeLabel: '10:30', requests: 248, fallbacks: 11, tokensK: 615, costUsd: 2.51, p95LatencyMs: 550 },
    { timeLabel: '10:35', requests: 289, fallbacks: 9, tokensK: 742, costUsd: 3.12, p95LatencyMs: 530 },
  ];
}
