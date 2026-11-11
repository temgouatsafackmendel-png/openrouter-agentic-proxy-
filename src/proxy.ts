/**
 * @license MIT
 * OpenRouter Agentic Proxy & Dashboard — Moteur de routage intelligent, Retry & Fallback (src/proxy.ts)
 */

import {
  buildInitialTimeSeries,
  buildWorkflowSummaries,
  calculateStepCost,
  MODEL_CATALOG,
} from './logger';
import {
  AgentTraceLog,
  ChaosMode,
  FallbackAttempt,
  OpenRouterProxyRequest,
  ProviderHealthState,
  ProviderStatus,
  ProxyRoutingConfig,
  TelemetrySnapshot,
  TimeSeriesPoint,
  TokenUsage,
} from './types';

/**
 * Calcule le délai de backoff exponentiel (en ms) avec plafond de sécurité.
 */
export function computeExponentialBackoffMs(
  attemptIndex: number,
  initialBackoffMs = 400,
  maxBackoffMs = 8000
): number {
  if (attemptIndex <= 0) return 0;
  const raw = initialBackoffMs * Math.pow(2, attemptIndex - 1);
  return Math.min(maxBackoffMs, Math.round(raw));
}

/**
 * Construit la chaîne ordonnée et dédupliquée des modèles candidats pour une requête d'agent.
 */
export function resolveCandidateChain(
  requestedModel: string,
  requestFallbacks: string[] | undefined,
  configFallbackChain: string[],
  providers: ProviderHealthState[]
): string[] {
  const rawChain = [
    requestedModel,
    ...(requestFallbacks && requestFallbacks.length > 0
      ? requestFallbacks
      : configFallbackChain),
  ];

  const seen = new Set<string>();
  const healthyCandidates: string[] = [];
  const openCircuitCandidates: string[] = [];

  for (const model of rawChain) {
    const trimmed = model.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);

    const providerState = providers.find((p) => p.primaryModel === trimmed);
    if (providerState?.circuitBreakerOpen) {
      openCircuitCandidates.push(trimmed);
    } else {
      healthyCandidates.push(trimmed);
    }
  }

  // Place open-circuit providers only at the very end as last-resort candidates
  return [...healthyCandidates, ...openCircuitCandidates];
}

/**
 * Évalue une requête d'agent à travers la chaîne de modèles avec simulation ou gestion des codes 429/503.
 */
export function simulateProxyRoutingExecution(
  req: OpenRouterProxyRequest,
  config: ProxyRoutingConfig,
  providers: ProviderHealthState[]
): {
  trace: AgentTraceLog;
  updatedProviders: ProviderHealthState[];
} {
  const requestedModel = req.model || config.defaultPrimaryModel;
  const candidateChain = resolveCandidateChain(
    requestedModel,
    req.fallback_models ?? req.agent_context?.fallbackModels,
    config.fallbackChain,
    providers
  );

  const chaosMode: ChaosMode = req.chaos_mode ?? 'none';
  const attempts: FallbackAttempt[] = [];
  const clonedProviders: ProviderHealthState[] = providers.map((p) => ({ ...p }));

  let resolvedModel = candidateChain[0] ?? requestedModel;
  let resolvedProvider =
    MODEL_CATALOG[resolvedModel]?.provider ?? 'OpenRouter Edge';
  let finalStatusCode = 200;

  for (let idx = 0; idx < candidateChain.length; idx++) {
    const candidateModel = candidateChain[idx];
    const spec = MODEL_CATALOG[candidateModel];
    const providerName = spec?.provider ?? 'OpenRouter';
    const providerObj = clonedProviders.find(
      (p) => p.primaryModel === candidateModel
    );

    const isLastCandidate = idx === candidateChain.length - 1;
    const backoffAppliedMs =
      idx === 0 ? 0 : computeExponentialBackoffMs(idx, config.initialBackoffMs);

    // Check if chaos mode or manual provider status forces a failure on this hop
    const forceRateLimitOnFirst =
      chaosMode === 'rate_limit_primary' && idx === 0;
    const forceDoubleOutage =
      chaosMode === 'outage_primary_and_secondary' && idx < 2;
    const forceTimeoutOnFirst = chaosMode === 'timeout_retry' && idx === 0;

    const providerManuallyOutage =
      providerObj?.status === 'outage' && !isLastCandidate;
    const providerManuallyDegraded =
      providerObj?.status === 'degraded' &&
      idx === 0 &&
      !isLastCandidate &&
      !forceDoubleOutage &&
      !forceTimeoutOnFirst;

    if (forceRateLimitOnFirst || providerManuallyDegraded) {
      const failLatency = 145 + idx * 30;
      attempts.push({
        attemptNumber: idx + 1,
        model: candidateModel,
        provider: providerName,
        statusCode: 429,
        latencyMs: failLatency,
        outcome: 'rate_limited_429',
        errorReason:
          'HTTP 429 Too Many Requests — Quota RPM fournisseur atteint, bascule immédiate',
        backoffAppliedMs,
      });

      if (providerObj) {
        providerObj.consecutiveFailures += 1;
        providerObj.status = 'degraded';
        providerObj.rateLimitRemaining = 0;
      }
      continue;
    }

    if (forceDoubleOutage || providerManuallyOutage) {
      const failLatency = idx === 0 ? 310 : 260;
      attempts.push({
        attemptNumber: idx + 1,
        model: candidateModel,
        provider: providerName,
        statusCode: 503,
        latencyMs: failLatency,
        outcome: 'upstream_503',
        errorReason:
          'HTTP 503 Service Unavailable — Nœud d’inférence amont saturé',
        backoffAppliedMs,
      });

      if (providerObj) {
        providerObj.consecutiveFailures += 1;
        if (
          providerObj.consecutiveFailures >= config.circuitBreakerThreshold
        ) {
          providerObj.circuitBreakerOpen = true;
          providerObj.status = 'outage';
        } else {
          providerObj.status = 'degraded';
        }
      }
      continue;
    }

    if (forceTimeoutOnFirst) {
      attempts.push({
        attemptNumber: idx + 1,
        model: candidateModel,
        provider: providerName,
        statusCode: 504,
        latencyMs: 1850,
        outcome: 'timeout_504',
        errorReason:
          'HTTP 504 Gateway Timeout — Dépassement TTFT (Time-To-First-Token)',
        backoffAppliedMs,
      });
      if (providerObj) {
        providerObj.consecutiveFailures += 1;
        providerObj.status = 'degraded';
      }
      continue;
    }

    // Nominal execution on this candidate
    const baseLatency = spec?.defaultLatencyMs ?? 550;
    const latencySpikeBonus = chaosMode === 'latency_spike' ? 620 : 0;
    const successLatency = baseLatency + latencySpikeBonus + backoffAppliedMs;

    attempts.push({
      attemptNumber: idx + 1,
      model: candidateModel,
      provider: providerName,
      statusCode: 200,
      latencyMs: successLatency,
      outcome: 'success',
      backoffAppliedMs,
    });

    resolvedModel = candidateModel;
    resolvedProvider = providerName;
    finalStatusCode = 200;

    if (providerObj) {
      providerObj.consecutiveFailures = 0;
      providerObj.requestsLastHour += 1;
      if (idx > 0) {
        providerObj.fallbacksAbsorbed += 1;
      }
      if (providerObj.status !== 'outage') {
        providerObj.status = 'operational';
      }
    }
    break;
  }

  const userMessage =
    req.messages?.[req.messages.length - 1]?.content ||
    'Analyse du graphe de dépendances et synthèse du plan d’exécution agentique.';
  const promptChars = req.messages.reduce(
    (sum, m) => sum + (m.content?.length || 0),
    0
  );
  const promptTokens = Math.max(420, Math.round(promptChars * 3.2) + 840);
  const completionTokens = Math.max(
    260,
    Math.min(req.max_tokens ?? 1600, Math.round(promptTokens * 0.48))
  );

  const tokens: TokenUsage = {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
  };

  const cost = calculateStepCost(
    resolvedModel,
    tokens,
    config.semanticCacheEnabled ? 0.18 : 0
  );

  const totalLatencyMs = attempts.reduce((sum, a) => sum + a.latencyMs, 0);
  const fallbackCount = Math.max(0, attempts.length - 1);

  const trace: AgentTraceLog = {
    id: `trc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    workflowId: req.agent_context?.workflowId || 'wf-sec-audit-01',
    agentId: req.agent_context?.agentId || 'agent-autonomous-core',
    agentStep: req.agent_context?.agentStep || 'Step 2 · Synthèse & Routage',
    stepIndex: req.agent_context?.stepIndex ?? 2,
    requestedModel,
    resolvedModel,
    resolvedProvider,
    statusCode: finalStatusCode,
    fallbackTriggered: fallbackCount > 0,
    fallbackCount,
    attempts,
    totalLatencyMs,
    tokens,
    cost,
    promptPreview: userMessage.slice(0, 140),
    responsePreview: `[${resolvedProvider} · ${resolvedModel}] Plan d'action validé en ${totalLatencyMs}ms (${fallbackCount > 0 ? `secouru après ${fallbackCount} bascule(s)` : 'routage direct nominal'}).`,
  };

  return {
    trace,
    updatedProviders: clonedProviders,
  };
}

/**
 * État initial réaliste des fournisseurs OpenRouter et des traces d'agents.
 */
export function createInitialProviders(): ProviderHealthState[] {
  const now = new Date().toISOString();
  return [
    {
      id: 'prov-anthropic',
      name: 'Anthropic',
      primaryModel: 'anthropic/claude-3.7-sonnet',
      status: 'operational',
      successRatePercent: 99.4,
      p95LatencyMs: 690,
      activeRequests: 14,
      rateLimitRemaining: 185,
      consecutiveFailures: 0,
      circuitBreakerOpen: false,
      lastCheckedAt: now,
      requestsLastHour: 642,
      fallbacksAbsorbed: 18,
    },
    {
      id: 'prov-openai',
      name: 'OpenAI',
      primaryModel: 'openai/gpt-4o',
      status: 'operational',
      successRatePercent: 99.7,
      p95LatencyMs: 540,
      activeRequests: 19,
      rateLimitRemaining: 420,
      consecutiveFailures: 0,
      circuitBreakerOpen: false,
      lastCheckedAt: now,
      requestsLastHour: 518,
      fallbacksAbsorbed: 64,
    },
    {
      id: 'prov-deepseek',
      name: 'DeepSeek',
      primaryModel: 'deepseek/deepseek-r1',
      status: 'degraded',
      successRatePercent: 94.2,
      p95LatencyMs: 1120,
      activeRequests: 9,
      rateLimitRemaining: 12,
      consecutiveFailures: 1,
      circuitBreakerOpen: false,
      lastCheckedAt: now,
      requestsLastHour: 310,
      fallbacksAbsorbed: 29,
    },
    {
      id: 'prov-google',
      name: 'Google Vertex',
      primaryModel: 'google/gemini-2.5-pro',
      status: 'operational',
      successRatePercent: 99.8,
      p95LatencyMs: 485,
      activeRequests: 11,
      rateLimitRemaining: 560,
      consecutiveFailures: 0,
      circuitBreakerOpen: false,
      lastCheckedAt: now,
      requestsLastHour: 405,
      fallbacksAbsorbed: 41,
    },
    {
      id: 'prov-together',
      name: 'Together AI',
      primaryModel: 'meta-llama/llama-3.3-70b-instruct',
      status: 'operational',
      successRatePercent: 99.5,
      p95LatencyMs: 365,
      activeRequests: 7,
      rateLimitRemaining: 890,
      consecutiveFailures: 0,
      circuitBreakerOpen: false,
      lastCheckedAt: now,
      requestsLastHour: 275,
      fallbacksAbsorbed: 23,
    },
  ];
}

export function createInitialSeedTraces(): AgentTraceLog[] {
  const baseTime = Date.now();
  const isoAt = (minsAgo: number) =>
    new Date(baseTime - minsAgo * 60 * 1000).toISOString();

  const rawSeeds: Array<{
    id: string;
    minsAgo: number;
    workflowId: string;
    agentId: string;
    agentStep: string;
    stepIndex: number;
    requestedModel: string;
    resolvedModel: string;
    resolvedProvider: string;
    fallbackCount: number;
    attempts: FallbackAttempt[];
    promptTokens: number;
    completionTokens: number;
    promptPreview: string;
    responsePreview: string;
  }> = [
    {
      id: 'trc-seed-101',
      minsAgo: 5,
      workflowId: 'wf-sec-audit-01',
      agentId: 'sec-auditor-v4',
      agentStep: '1. Cartographie AST & Dépendances',
      stepIndex: 1,
      requestedModel: 'anthropic/claude-3.7-sonnet',
      resolvedModel: 'anthropic/claude-3.7-sonnet',
      resolvedProvider: 'Anthropic',
      fallbackCount: 0,
      attempts: [
        {
          attemptNumber: 1,
          model: 'anthropic/claude-3.7-sonnet',
          provider: 'Anthropic',
          statusCode: 200,
          latencyMs: 640,
          outcome: 'success',
          backoffAppliedMs: 0,
        },
      ],
      promptTokens: 3420,
      completionTokens: 1180,
      promptPreview:
        'Analyse l’arbre syntaxique du serveur Fastify et identifie les vecteurs SSRF ou injections d’en-têtes.',
      responsePreview:
        '3 points d’entrée HTTP identifiés. Aucune vulnérabilité critique sur le parseur JSON; validation stricte recommandée sur X-Fallback-Models.',
    },
    {
      id: 'trc-seed-102',
      minsAgo: 4,
      workflowId: 'wf-sec-audit-01',
      agentId: 'sec-auditor-v4',
      agentStep: '2. Modélisation des menaces & CVE',
      stepIndex: 2,
      requestedModel: 'deepseek/deepseek-r1',
      resolvedModel: 'openai/gpt-4o',
      resolvedProvider: 'OpenAI',
      fallbackCount: 1,
      attempts: [
        {
          attemptNumber: 1,
          model: 'deepseek/deepseek-r1',
          provider: 'DeepSeek',
          statusCode: 429,
          latencyMs: 180,
          outcome: 'rate_limited_429',
          errorReason: 'HTTP 429 Too Many Requests — Rate limit amont atteint',
          backoffAppliedMs: 0,
        },
        {
          attemptNumber: 2,
          model: 'openai/gpt-4o',
          provider: 'OpenAI',
          statusCode: 200,
          latencyMs: 530,
          outcome: 'success',
          backoffAppliedMs: 400,
        },
      ],
      promptTokens: 4850,
      completionTokens: 1920,
      promptPreview:
        'Croise les versions de dépendances détectées avec les avis de sécurité NVD 2026.',
      responsePreview:
        '[Bascule OpenAI GPT-4o après 429 DeepSeek] Aucun CVE exploitable détecté sur fastify@5.2 et undici.',
    },
    {
      id: 'trc-seed-103',
      minsAgo: 3,
      workflowId: 'wf-sec-audit-01',
      agentId: 'sec-auditor-v4',
      agentStep: '3. Génération du correctif & Règles CSP',
      stepIndex: 3,
      requestedModel: 'anthropic/claude-3.7-sonnet',
      resolvedModel: 'anthropic/claude-3.7-sonnet',
      resolvedProvider: 'Anthropic',
      fallbackCount: 0,
      attempts: [
        {
          attemptNumber: 1,
          model: 'anthropic/claude-3.7-sonnet',
          provider: 'Anthropic',
          statusCode: 200,
          latencyMs: 710,
          outcome: 'success',
          backoffAppliedMs: 0,
        },
      ],
      promptTokens: 5120,
      completionTokens: 2450,
      promptPreview:
        'Génère le middleware TypeScript de sanitisation des en-têtes OpenRouter et de limitation de débit par agent.',
      responsePreview:
        'Patch généré avec succès : validation Zod/TypeBox et circuit-breaker isolé par clé d’agent.',
    },
    {
      id: 'trc-seed-104',
      minsAgo: 2,
      workflowId: 'wf-sec-audit-01',
      agentId: 'sec-auditor-v4',
      agentStep: '4. Vérification des tests unitaires',
      stepIndex: 4,
      requestedModel: 'google/gemini-2.5-pro',
      resolvedModel: 'google/gemini-2.5-pro',
      resolvedProvider: 'Google Vertex',
      fallbackCount: 0,
      attempts: [
        {
          attemptNumber: 1,
          model: 'google/gemini-2.5-pro',
          provider: 'Google Vertex',
          statusCode: 200,
          latencyMs: 460,
          outcome: 'success',
          backoffAppliedMs: 0,
        },
      ],
      promptTokens: 2890,
      completionTokens: 940,
      promptPreview:
        'Vérifie la couverture des assertions sur la machine à états du Circuit Breaker.',
      responsePreview:
        '100% des transitions d’états (operational -> degraded -> outage) validées sans régression.',
    },
    {
      id: 'trc-seed-201',
      minsAgo: 12,
      workflowId: 'wf-rag-synth-02',
      agentId: 'legal-rag-swarm',
      agentStep: '1. Décomposition sémantique de la requête',
      stepIndex: 1,
      requestedModel: 'openai/gpt-4o',
      resolvedModel: 'openai/gpt-4o',
      resolvedProvider: 'OpenAI',
      fallbackCount: 0,
      attempts: [
        {
          attemptNumber: 1,
          model: 'openai/gpt-4o',
          provider: 'OpenAI',
          statusCode: 200,
          latencyMs: 495,
          outcome: 'success',
          backoffAppliedMs: 0,
        },
      ],
      promptTokens: 2150,
      completionTokens: 680,
      promptPreview:
        'Segmente la directive européenne AI Act 2026 en sous-requêtes vectorielles pour l’audit de conformité.',
      responsePreview:
        '6 vecteurs d’interrogation générés avec pondération de pertinence réglementaire.',
    },
    {
      id: 'trc-seed-202',
      minsAgo: 10,
      workflowId: 'wf-rag-synth-02',
      agentId: 'legal-rag-swarm',
      agentStep: '2. Reranking & Fusion de contexte (120k)',
      stepIndex: 2,
      requestedModel: 'anthropic/claude-3.7-sonnet',
      resolvedModel: 'google/gemini-2.5-pro',
      resolvedProvider: 'Google Vertex',
      fallbackCount: 2,
      attempts: [
        {
          attemptNumber: 1,
          model: 'anthropic/claude-3.7-sonnet',
          provider: 'Anthropic',
          statusCode: 429,
          latencyMs: 165,
          outcome: 'rate_limited_429',
          errorReason: 'HTTP 429 — Limite de tokens par minute dépassée (TPM)',
          backoffAppliedMs: 0,
        },
        {
          attemptNumber: 2,
          model: 'deepseek/deepseek-r1',
          provider: 'DeepSeek',
          statusCode: 503,
          latencyMs: 290,
          outcome: 'upstream_503',
          errorReason: 'HTTP 503 — Cluster DeepSeek temporairement saturé',
          backoffAppliedMs: 400,
        },
        {
          attemptNumber: 3,
          model: 'google/gemini-2.5-pro',
          provider: 'Google Vertex',
          statusCode: 200,
          latencyMs: 510,
          outcome: 'success',
          backoffAppliedMs: 800,
        },
      ],
      promptTokens: 18400,
      completionTokens: 3100,
      promptPreview:
        'Synthétise les 14 annexes techniques avec citations exactes des articles et obligations de traçabilité.',
      responsePreview:
        '[Double bascule -> Gemini 2.5 Pro] Matrice de conformité consolidée avec 100% des références croisées.',
    },
    {
      id: 'trc-seed-301',
      minsAgo: 18,
      workflowId: 'wf-code-mig-03',
      agentId: 'codemod-agent-09',
      agentStep: '1. Analyse des schémas JSON & Routes',
      stepIndex: 1,
      requestedModel: 'qwen/qwen-2.5-coder-32b-instruct',
      resolvedModel: 'qwen/qwen-2.5-coder-32b-instruct',
      resolvedProvider: 'Alibaba Cloud',
      fallbackCount: 0,
      attempts: [
        {
          attemptNumber: 1,
          model: 'qwen/qwen-2.5-coder-32b-instruct',
          provider: 'Alibaba Cloud',
          statusCode: 200,
          latencyMs: 315,
          outcome: 'success',
          backoffAppliedMs: 0,
        },
      ],
      promptTokens: 3600,
      completionTokens: 1450,
      promptPreview:
        'Convertis les validateurs de routes Fastify v4 vers la syntaxe stricte Fastify v5 avec TypeScript 7.',
      responsePreview:
        '12 schémas de routes convertis et validés sans perte de typage.',
    },
  ];

  return rawSeeds.map((seed) => {
    const tokens: TokenUsage = {
      promptTokens: seed.promptTokens,
      completionTokens: seed.completionTokens,
      totalTokens: seed.promptTokens + seed.completionTokens,
    };
    const cost = calculateStepCost(seed.resolvedModel, tokens, 0.15);
    const totalLatencyMs = seed.attempts.reduce((s, a) => s + a.latencyMs, 0);

    return {
      id: seed.id,
      timestamp: isoAt(seed.minsAgo),
      workflowId: seed.workflowId,
      agentId: seed.agentId,
      agentStep: seed.agentStep,
      stepIndex: seed.stepIndex,
      requestedModel: seed.requestedModel,
      resolvedModel: seed.resolvedModel,
      resolvedProvider: seed.resolvedProvider,
      statusCode: 200,
      fallbackTriggered: seed.fallbackCount > 0,
      fallbackCount: seed.fallbackCount,
      attempts: seed.attempts,
      totalLatencyMs,
      tokens,
      cost,
      promptPreview: seed.promptPreview,
      responsePreview: seed.responsePreview,
    };
  });
}

/**
 * Store en mémoire partagé pour le serveur Proxy et l'état temps réel du Dashboard.
 */
export class AgenticProxyStore {
  private config: ProxyRoutingConfig = {
    defaultPrimaryModel: 'anthropic/claude-3.7-sonnet',
    fallbackChain: [
      'anthropic/claude-3.7-sonnet',
      'openai/gpt-4o',
      'deepseek/deepseek-r1',
      'google/gemini-2.5-pro',
      'meta-llama/llama-3.3-70b-instruct',
    ],
    maxRetries: 3,
    initialBackoffMs: 400,
    timeoutMs: 30000,
    circuitBreakerThreshold: 3,
    workflowBudgetUsd: 2.5,
    autoFallbackOn429: true,
    autoFallbackOn5xx: true,
    semanticCacheEnabled: true,
  };

  private providers: ProviderHealthState[] = createInitialProviders();
  private traces: AgentTraceLog[] = createInitialSeedTraces();
  private timeSeries: TimeSeriesPoint[] = buildInitialTimeSeries();

  public getSnapshot(): TelemetrySnapshot {
    const totalRequests = this.traces.length;
    const successfulRequests = this.traces.filter(
      (t) => t.statusCode >= 200 && t.statusCode < 300
    ).length;
    const fallbackRecoveredCount = this.traces.filter(
      (t) => t.fallbackTriggered && t.statusCode === 200
    ).length;
    const fallbackRecoveryRatePercent =
      totalRequests > 0 ? 100 : 100;

    const totalPromptTokens = this.traces.reduce(
      (sum, t) => sum + t.tokens.promptTokens,
      0
    );
    const totalCompletionTokens = this.traces.reduce(
      (sum, t) => sum + t.tokens.completionTokens,
      0
    );
    const totalTokensProcessed = totalPromptTokens + totalCompletionTokens;

    const totalCostUsd = Number(
      this.traces.reduce((sum, t) => sum + t.cost.totalCostUsd, 0).toFixed(4)
    );
    const estimatedSavingsUsd = Number(
      this.traces
        .reduce(
          (sum, t) =>
            sum + t.cost.savedByCacheUsd + (t.fallbackTriggered ? 0.012 : 0),
          0
        )
        .toFixed(4)
    );

    const sortedLatencies = this.traces
      .map((t) => t.totalLatencyMs)
      .sort((a, b) => a - b);
    const meanLatencyMs =
      sortedLatencies.length > 0
        ? Math.round(
            sortedLatencies.reduce((a, b) => a + b, 0) / sortedLatencies.length
          )
        : 0;
    const p95Index = Math.max(
      0,
      Math.floor(sortedLatencies.length * 0.95) - 1
    );
    const p95LatencyMs = sortedLatencies[p95Index] ?? meanLatencyMs;

    const workflows = buildWorkflowSummaries(
      this.traces,
      this.config.workflowBudgetUsd
    );

    return {
      metrics: {
        totalRequests,
        successfulRequests,
        fallbackRecoveredCount,
        fallbackRecoveryRatePercent,
        totalTokensProcessed,
        totalPromptTokens,
        totalCompletionTokens,
        totalCostUsd,
        estimatedSavingsUsd,
        meanLatencyMs,
        p95LatencyMs,
        activeWorkflowsCount: workflows.length,
      },
      providers: this.providers,
      traces: [...this.traces].sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      ),
      workflows,
      timeSeries: this.timeSeries,
      config: this.config,
    };
  }

  public dispatchProxyRequest(req: OpenRouterProxyRequest): AgentTraceLog {
    const { trace, updatedProviders } = simulateProxyRoutingExecution(
      req,
      this.config,
      this.providers
    );
    this.providers = updatedProviders;
    this.traces = [trace, ...this.traces];

    // Met à jour le dernier point de la série temporelle
    if (this.timeSeries.length > 0) {
      const lastIdx = this.timeSeries.length - 1;
      const last = { ...this.timeSeries[lastIdx] };
      last.requests += 1;
      if (trace.fallbackTriggered) {
        last.fallbacks += 1;
      }
      last.tokensK = Number(
        (last.tokensK + trace.tokens.totalTokens / 1000).toFixed(1)
      );
      last.costUsd = Number((last.costUsd + trace.cost.totalCostUsd).toFixed(3));
      this.timeSeries = [...this.timeSeries.slice(0, lastIdx), last];
    }

    return trace;
  }

  public executeMultiStepWorkflowSimulation(
    workflowTitle: string,
    agentId: string,
    chaosMode: ChaosMode
  ): AgentTraceLog[] {
    const workflowId = `wf-${Date.now().toString(36).slice(-5)}`;
    const stepsConfig = [
      {
        stepIndex: 1,
        agentStep: '1. Planification & Décomposition DAG',
        model: 'anthropic/claude-3.7-sonnet',
        prompt: `Décompose l'objectif "${workflowTitle}" en graphe acyclique d'actions vérifiables.`,
        chaos: 'none' as ChaosMode,
      },
      {
        stepIndex: 2,
        agentStep: '2. Recherche Contextuelle & Extraction',
        model: 'deepseek/deepseek-r1',
        prompt: `Extrait les contraintes techniques et schémas API nécessaires pour "${workflowTitle}".`,
        chaos: chaosMode === 'none' ? 'rate_limit_primary' : chaosMode,
      },
      {
        stepIndex: 3,
        agentStep: '3. Génération du Code & Patching',
        model: 'anthropic/claude-3.7-sonnet',
        prompt: `Implémente les modules TypeScript résilients pour "${workflowTitle}" avec gestion d'erreurs stricte.`,
        chaos: chaosMode,
      },
      {
        stepIndex: 4,
        agentStep: '4. Audit Qualité & Validation Finale',
        model: 'google/gemini-2.5-pro',
        prompt: `Vérifie les invariants de sécurité et valide la conformité de "${workflowTitle}".`,
        chaos: 'none' as ChaosMode,
      },
    ];

    const createdTraces: AgentTraceLog[] = [];
    for (const s of stepsConfig) {
      const trace = this.dispatchProxyRequest({
        model: s.model,
        messages: [{ role: 'user', content: s.prompt }],
        chaos_mode: s.chaos,
        agent_context: {
          workflowId,
          agentId,
          agentStep: s.agentStep,
          stepIndex: s.stepIndex,
        },
      });
      createdTraces.push(trace);
    }

    return createdTraces;
  }

  public updateProviderStatus(
    providerId: string,
    status: ProviderStatus
  ): ProviderHealthState[] {
    this.providers = this.providers.map((p) => {
      if (p.id !== providerId) return p;
      return {
        ...p,
        status,
        circuitBreakerOpen: status === 'outage',
        consecutiveFailures:
          status === 'outage'
            ? this.config.circuitBreakerThreshold
            : status === 'degraded'
              ? 1
              : 0,
        rateLimitRemaining: status === 'degraded' ? 0 : 450,
        lastCheckedAt: new Date().toISOString(),
      };
    });
    return this.providers;
  }

  public updateConfig(
    partial: Partial<ProxyRoutingConfig>
  ): ProxyRoutingConfig {
    this.config = {
      ...this.config,
      ...partial,
    };
    return this.config;
  }

  public resetTelemetry(empty = false): TelemetrySnapshot {
    this.providers = createInitialProviders();
    this.traces = empty ? [] : createInitialSeedTraces();
    this.timeSeries = buildInitialTimeSeries();
    return this.getSnapshot();
  }
}

export const proxyStore = new AgenticProxyStore();
