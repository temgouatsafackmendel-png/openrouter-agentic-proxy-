/**
 * @license MIT
 * Tests unitaires déterministes (node:test) pour le moteur de routage OpenRouter Agentic Proxy
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateStepCost, formatStructuredLogEntry } from './logger';
import {
  computeExponentialBackoffMs,
  createInitialProviders,
  resolveCandidateChain,
  simulateProxyRoutingExecution,
  AgenticProxyStore,
} from './proxy';

test('computeExponentialBackoffMs applique une croissance exponentielle plafonnée', () => {
  assert.equal(computeExponentialBackoffMs(0, 400), 0);
  assert.equal(computeExponentialBackoffMs(1, 400), 400);
  assert.equal(computeExponentialBackoffMs(2, 400), 800);
  assert.equal(computeExponentialBackoffMs(3, 400), 1600);
  assert.equal(computeExponentialBackoffMs(10, 400, 5000), 5000);
});

test('calculateStepCost calcule avec exactitude les coûts prompt/completion et les économies de cache', () => {
  const cost = calculateStepCost(
    'anthropic/claude-3.7-sonnet',
    { promptTokens: 100_000, completionTokens: 20_000, totalTokens: 120_000 },
    0.2 // 20% cache hit
  );

  // 100k tokens @ $3/1M = $0.30 brut -> $0.06 économisé -> $0.24 net prompt
  // 20k tokens @ $15/1M = $0.30 completion
  assert.equal(cost.savedByCacheUsd, 0.06);
  assert.equal(cost.promptCostUsd, 0.24);
  assert.equal(cost.completionCostUsd, 0.3);
  assert.equal(cost.totalCostUsd, 0.54);
});

test('resolveCandidateChain déduplique les modèles et relègue les fournisseurs en Circuit Breaker ouvert', () => {
  const providers = createInitialProviders();
  // Ouvrir le circuit breaker sur OpenAI
  const openai = providers.find((p) => p.primaryModel === 'openai/gpt-4o')!;
  openai.circuitBreakerOpen = true;

  const chain = resolveCandidateChain(
    'anthropic/claude-3.7-sonnet',
    ['openai/gpt-4o', 'deepseek/deepseek-r1', 'anthropic/claude-3.7-sonnet'],
    ['google/gemini-2.5-pro'],
    providers
  );

  assert.deepEqual(chain, [
    'anthropic/claude-3.7-sonnet',
    'deepseek/deepseek-r1',
    'openai/gpt-4o',
  ]);
});

test('simulateProxyRoutingExecution bascule automatiquement sur le modèle secondaire en cas de 429 Rate Limit', () => {
  const store = new AgenticProxyStore();
  const snapshotBefore = store.getSnapshot();

  const { trace } = simulateProxyRoutingExecution(
    {
      model: 'anthropic/claude-3.7-sonnet',
      messages: [{ role: 'user', content: 'Exécute l’étape de planification agentique.' }],
      chaos_mode: 'rate_limit_primary',
      agent_context: {
        workflowId: 'wf-test-429',
        agentId: 'planner-agent',
        agentStep: 'Step 1 · Plan',
        stepIndex: 1,
      },
    },
    snapshotBefore.config,
    snapshotBefore.providers
  );

  assert.equal(trace.fallbackTriggered, true);
  assert.equal(trace.fallbackCount, 1);
  assert.equal(trace.requestedModel, 'anthropic/claude-3.7-sonnet');
  assert.equal(trace.resolvedModel, 'openai/gpt-4o');
  assert.equal(trace.attempts.length, 2);
  assert.equal(trace.attempts[0].statusCode, 429);
  assert.equal(trace.attempts[1].statusCode, 200);

  const structuredJson = JSON.parse(formatStructuredLogEntry(trace));
  assert.equal(structuredJson.level, 'warn');
  assert.equal(structuredJson.routing.fallbackCount, 1);
});

test('simulateProxyRoutingExecution gère une double panne (503) et résout sur le 3e fournisseur', () => {
  const store = new AgenticProxyStore();
  const snapshot = store.getSnapshot();

  const { trace } = simulateProxyRoutingExecution(
    {
      model: 'anthropic/claude-3.7-sonnet',
      messages: [{ role: 'user', content: 'Test double panne amont 503.' }],
      chaos_mode: 'outage_primary_and_secondary',
    },
    snapshot.config,
    snapshot.providers
  );

  assert.equal(trace.fallbackTriggered, true);
  assert.equal(trace.fallbackCount, 2);
  assert.equal(trace.attempts[0].statusCode, 503);
  assert.equal(trace.attempts[1].statusCode, 503);
  assert.equal(trace.attempts[2].statusCode, 200);
  assert.equal(trace.resolvedModel, 'deepseek/deepseek-r1');
});
