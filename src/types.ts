/**
 * @license MIT
 * OpenRouter Agentic Proxy & Dashboard — Définitions TypeScript strictes (src/types.ts)
 */

export type ProviderStatus = 'operational' | 'degraded' | 'outage';

export type ChaosMode =
  | 'none'
  | 'rate_limit_primary'
  | 'outage_primary_and_secondary'
  | 'latency_spike'
  | 'timeout_retry';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
}

export interface AgentContextHeaders {
  agentId: string;
  agentStep: string;
  workflowId: string;
  stepIndex: number;
  fallbackModels?: string[];
  maxCostUsd?: number;
}

export interface OpenRouterProxyRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  fallback_models?: string[];
  agent_context?: Partial<AgentContextHeaders>;
  chaos_mode?: ChaosMode;
}

export interface FallbackAttempt {
  attemptNumber: number;
  model: string;
  provider: string;
  statusCode: number;
  latencyMs: number;
  outcome: 'success' | 'rate_limited_429' | 'upstream_503' | 'timeout_504';
  errorReason?: string;
  backoffAppliedMs: number;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface CostBreakdown {
  promptCostUsd: number;
  completionCostUsd: number;
  totalCostUsd: number;
  savedByCacheUsd: number;
}

export interface AgentTraceLog {
  id: string;
  timestamp: string;
  workflowId: string;
  agentId: string;
  agentStep: string;
  stepIndex: number;
  requestedModel: string;
  resolvedModel: string;
  resolvedProvider: string;
  statusCode: number;
  fallbackTriggered: boolean;
  fallbackCount: number;
  attempts: FallbackAttempt[];
  totalLatencyMs: number;
  tokens: TokenUsage;
  cost: CostBreakdown;
  promptPreview: string;
  responsePreview: string;
}

export interface ModelPricingSpec {
  model: string;
  provider: string;
  displayName: string;
  inputCostPer1M: number; // USD per 1M input tokens
  outputCostPer1M: number; // USD per 1M output tokens
  contextWindow: number;
  defaultLatencyMs: number;
}

export interface ProviderHealthState {
  id: string;
  name: string;
  primaryModel: string;
  status: ProviderStatus;
  successRatePercent: number;
  p95LatencyMs: number;
  activeRequests: number;
  rateLimitRemaining: number;
  consecutiveFailures: number;
  circuitBreakerOpen: boolean;
  lastCheckedAt: string;
  requestsLastHour: number;
  fallbacksAbsorbed: number;
}

export interface ProxyRoutingConfig {
  defaultPrimaryModel: string;
  fallbackChain: string[];
  maxRetries: number;
  initialBackoffMs: number;
  timeoutMs: number;
  circuitBreakerThreshold: number;
  workflowBudgetUsd: number;
  autoFallbackOn429: boolean;
  autoFallbackOn5xx: boolean;
  semanticCacheEnabled: boolean;
}

export interface TimeSeriesPoint {
  timeLabel: string;
  requests: number;
  fallbacks: number;
  tokensK: number;
  costUsd: number;
  p95LatencyMs: number;
}

export interface AgentWorkflowSummary {
  workflowId: string;
  agentId: string;
  title: string;
  startedAt: string;
  status: 'completed' | 'running' | 'budget_warning' | 'degraded_recovered';
  totalSteps: number;
  completedSteps: number;
  totalTokens: number;
  totalCostUsd: number;
  budgetLimitUsd: number;
  totalLatencyMs: number;
  fallbacksUsed: number;
  steps: AgentTraceLog[];
}

export interface TelemetrySnapshot {
  metrics: {
    totalRequests: number;
    successfulRequests: number;
    fallbackRecoveredCount: number;
    fallbackRecoveryRatePercent: number;
    totalTokensProcessed: number;
    totalPromptTokens: number;
    totalCompletionTokens: number;
    totalCostUsd: number;
    estimatedSavingsUsd: number;
    meanLatencyMs: number;
    p95LatencyMs: number;
    activeWorkflowsCount: number;
  };
  providers: ProviderHealthState[];
  traces: AgentTraceLog[];
  workflows: AgentWorkflowSummary[];
  timeSeries: TimeSeriesPoint[];
  config: ProxyRoutingConfig;
}
