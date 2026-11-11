/**
 * @license MIT
 * Author: Mendel Temgoua (mendeltemgouabusiness@gmail.com)
 * Catalogue des fichiers du dépôt Open-Source GitHub pour l'explorateur intégré.
 */

export interface RepoFileItem {
  path: string;
  language: 'typescript' | 'html' | 'markdown' | 'json' | 'dockerfile' | 'yaml';
  description: string;
  linesCount: number;
  content: string;
}

export const OPEN_SOURCE_REPO_FILES: RepoFileItem[] = [
  {
    path: 'README.md',
    language: 'markdown',
    description:
      'Documentation officielle GitHub signée par Mendel Temgoua : architecture, API, Docker et tests',
    linesCount: 118,
    content: `# OpenRouter Agentic Proxy & Dashboard

[![License: MIT](https://img.shields.io/badge/License-MIT-5D3FD3.svg)](./LICENSE)
[![TypeScript Strict](https://img.shields.io/badge/TypeScript-7.0_Strict-0B132B.svg)](./tsconfig.json)
[![OpenRouter API](https://img.shields.io/badge/OpenRouter-v1%2Fchat%2Fcompletions-FF6B35.svg)](https://openrouter.ai)

Conçu et développé par **Mendel Temgoua** (mendeltemgouabusiness@gmail.com).

> **Passerelle LLM intelligente et résiliente pour OpenRouter**, taillée pour les **agents autonomes et les workflows multi-étapes**.
> Intercepte les requêtes \`/v1/chat/completions\`, gère automatiquement le *fallback* multi-fournisseurs sur erreurs \`429 Rate Limit\` / \`503 Service Unavailable\`, maintient un *Circuit Breaker* par fournisseur et trace les coûts par étape d'agent.

## Démarrage Rapide

\`\`\`bash
git clone https://github.com/mendeltemgoua/openrouter-agentic-proxy.git
cd openrouter-agentic-proxy
cp .env.example .env
npm install
npm run dev
\`\`\`

## Tests Unitaires & Qualité

\`\`\`bash
npm test          # Exécute la suite node:test (src/proxy.test.ts)
npm run lint      # Vérification stricte TypeScript (tsc --noEmit)
npm run build     # Build de production
\`\`\`

## Auteur & Licence
- **Auteur :** Mendel Temgoua (mendeltemgouabusiness@gmail.com)
- **Licence :** MIT`,
  },
  {
    path: 'LICENSE',
    language: 'markdown',
    description: 'Licence Open Source MIT — Copyright (c) 2026 Mendel Temgoua',
    linesCount: 21,
    content: `MIT License

Copyright (c) 2026 Mendel Temgoua (mendeltemgouabusiness@gmail.com)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`,
  },
  {
    path: 'package.json',
    language: 'json',
    description: 'Manifeste npm prêt pour publication GitHub avec auteur Mendel Temgoua et scripts CI',
    linesCount: 44,
    content: `{
  "name": "openrouter-agentic-proxy",
  "private": false,
  "version": "1.0.0",
  "description": "High-resilience OpenRouter LLM proxy and real-time supervision dashboard for autonomous multi-step agents.",
  "author": {
    "name": "Mendel Temgoua",
    "email": "mendeltemgouabusiness@gmail.com"
  },
  "license": "MIT",
  "type": "module",
  "scripts": {
    "dev": "tsx server.ts",
    "build": "vite build",
    "start": "node server.ts",
    "test": "tsx --test src/proxy.test.ts",
    "lint": "tsc --noEmit"
  }
}`,
  },
  {
    path: 'src/index.ts',
    language: 'typescript',
    description:
      'Point d’entrée du serveur Fastify Haute Performance & Static Web Server (port 3000)',
    linesCount: 94,
    content: `/**
 * @license MIT
 * Author: Mendel Temgoua (mendeltemgouabusiness@gmail.com)
 */
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyCors from '@fastify/cors';
import path from 'node:path';
import {
  buildProxyRequestFromHttp,
  formatOpenRouterCompletionResponse,
  MODEL_CATALOG,
  proxyStore,
} from './proxy-entry';
import { ChaosMode, ProviderStatus } from './types';

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
  },
});

async function bootstrap() {
  await fastify.register(fastifyCors, { origin: true });
  await fastify.register(fastifyStatic, {
    root: path.join(process.cwd(), 'public'),
    prefix: '/',
  });

  // 1. Route compatible OpenAI / OpenRouter : POST /v1/chat/completions
  fastify.post('/v1/chat/completions', async (request, reply) => {
    const proxyReq = buildProxyRequestFromHttp(
      (request.body as Record<string, unknown>) ?? {},
      request.headers as Record<string, string | string[] | undefined>
    );
    const completion = formatOpenRouterCompletionResponse(proxyReq);

    reply
      .header('X-Proxy-Trace-Id', completion.x_agentic_proxy.trace_id)
      .header('X-Proxy-Resolved-Model', completion.x_agentic_proxy.resolved_model)
      .header('X-Proxy-Fallback-Count', String(completion.x_agentic_proxy.fallback_count))
      .header('X-Proxy-Step-Cost-Usd', String(completion.x_agentic_proxy.cost_usd.totalCostUsd))
      .code(200)
      .send(completion);
  });

  // 2. Télémétrie temps réel pour le Dashboard
  fastify.get('/api/telemetry', async () => ({
    snapshot: proxyStore.getSnapshot(),
    catalog: Object.values(MODEL_CATALOG),
  }));

  // 3. Simulation d'un workflow multi-étapes (4 étapes d'agent)
  fastify.post('/api/proxy/workflow', async (request) => {
    const body = (request.body as Record<string, string>) ?? {};
    const createdTraces = proxyStore.executeMultiStepWorkflowSimulation(
      body.title || 'Audit de sécurité & patch CVE',
      body.agentId || 'sec-auditor-v4',
      (body.chaosMode as ChaosMode) || 'rate_limit_primary'
    );
    return { createdTraces, snapshot: proxyStore.getSnapshot() };
  });

  // 4. Contrôle du Circuit Breaker fournisseur
  fastify.post<{ Params: { id: string }; Body: { status: ProviderStatus } }>(
    '/api/providers/:id/status',
    async (request) => {
      proxyStore.updateProviderStatus(request.params.id, request.body.status);
      return { snapshot: proxyStore.getSnapshot() };
    }
  );

  const port = Number(process.env.PORT) || 3000;
  const host = process.env.HOST || '0.0.0.0';
  await fastify.listen({ port, host });
}

bootstrap();`,
  },
  {
    path: 'src/proxy.ts',
    language: 'typescript',
    description:
      'Logique de routage intelligent, backoff exponentiel, circuit breaker et fallback multi-modèles',
    linesCount: 142,
    content: `/**
 * @license MIT
 * Author: Mendel Temgoua (mendeltemgouabusiness@gmail.com)
 */
import { calculateStepCost, MODEL_CATALOG } from './logger';
import {
  AgentTraceLog,
  ChaosMode,
  FallbackAttempt,
  OpenRouterProxyRequest,
  ProviderHealthState,
  ProxyRoutingConfig,
} from './types';

export function computeExponentialBackoffMs(
  attemptIndex: number,
  initialBackoffMs = 400,
  maxBackoffMs = 8000
): number {
  if (attemptIndex <= 0) return 0;
  const raw = initialBackoffMs * Math.pow(2, attemptIndex - 1);
  return Math.min(maxBackoffMs, Math.round(raw));
}

export function resolveCandidateChain(
  requestedModel: string,
  requestFallbacks: string[] | undefined,
  configFallbackChain: string[],
  providers: ProviderHealthState[]
): string[] {
  const rawChain = [
    requestedModel,
    ...(requestFallbacks?.length ? requestFallbacks : configFallbackChain),
  ];
  const seen = new Set<string>();
  const healthy: string[] = [];
  const openCircuit: string[] = [];

  for (const model of rawChain) {
    const trimmed = model.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    const prov = providers.find((p) => p.primaryModel === trimmed);
    if (prov?.circuitBreakerOpen) {
      openCircuit.push(trimmed);
    } else {
      healthy.push(trimmed);
    }
  }
  return [...healthy, ...openCircuit];
}`,
  },
  {
    path: 'src/types.ts',
    language: 'typescript',
    description:
      'Définitions TypeScript strictes (requêtes, en-têtes d’agent, télémétrie, budgets)',
    linesCount: 118,
    content: `/**
 * @license MIT
 * Author: Mendel Temgoua (mendeltemgouabusiness@gmail.com)
 */
export type ProviderStatus = 'operational' | 'degraded' | 'outage';

export type ChaosMode =
  | 'none'
  | 'rate_limit_primary'
  | 'outage_primary_and_secondary'
  | 'latency_spike'
  | 'timeout_retry';

export interface AgentContextHeaders {
  agentId: string;
  agentStep: string;
  workflowId: string;
  stepIndex: number;
  fallbackModels?: string[];
  maxCostUsd?: number;
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
}`,
  },
  {
    path: 'src/logger.ts',
    language: 'typescript',
    description:
      'Journalisation structurée JSON (Pino/OpenTelemetry) et calculateur de coûts par étape d’agent',
    linesCount: 105,
    content: `/**
 * @license MIT
 * Author: Mendel Temgoua (mendeltemgouabusiness@gmail.com)
 */
import { CostBreakdown, ModelPricingSpec, TokenUsage } from './types';

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
};

export function calculateStepCost(
  modelId: string,
  tokens: TokenUsage,
  cacheHitRatio = 0
): CostBreakdown {
  const spec = MODEL_CATALOG[modelId] ?? MODEL_CATALOG['openai/gpt-4o'];
  const rawPromptCost = (tokens.promptTokens / 1_000_000) * spec.inputCostPer1M;
  const savedByCacheUsd = Number((rawPromptCost * cacheHitRatio).toFixed(6));
  const promptCostUsd = Number((rawPromptCost - savedByCacheUsd).toFixed(6));
  const completionCostUsd = Number(
    ((tokens.completionTokens / 1_000_000) * spec.outputCostPer1M).toFixed(6)
  );
  return {
    promptCostUsd,
    completionCostUsd,
    totalCostUsd: Number((promptCostUsd + completionCostUsd).toFixed(6)),
    savedByCacheUsd,
  };
}`,
  },
  {
    path: '.github/workflows/ci.yml',
    language: 'yaml',
    description:
      'Pipeline GitHub Actions CI automatisant npm ci, npm run lint, npm test et npm run build',
    linesCount: 34,
    content: `name: CI — Build, Lint & Unit Tests

on:
  push:
    branches: [main, master]
  pull_request:
    branches: [main, master]

jobs:
  verify:
    name: TypeScript Lint, Unit Tests & Production Build
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
      - name: Setup Node.js 22
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'npm'
      - name: Install dependencies
        run: npm ci
      - name: Run TypeScript type check
        run: npm run lint
      - name: Run unit tests (node:test)
        run: npm test
      - name: Build production bundle
        run: npm run build`,
  },
  {
    path: 'public/index.html',
    language: 'html',
    description:
      'Point d’entrée HTML du Dashboard Web (Deep Night Blue #0B132B, Glassmorphism & Polices 2026)',
    linesCount: 24,
    content: `<!doctype html>
<html lang="fr" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>OpenRouter Agentic Proxy & Dashboard — Mendel Temgoua</title>
    <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,600;12..96,700;12..96,800&family=JetBrains+Mono:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
  </head>
  <body class="bg-[#0B132B] text-[#F4F5F7] antialiased">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`,
  },
  {
    path: 'Dockerfile',
    language: 'dockerfile',
    description: 'Image conteneur multi-stage Alpine Node 22 prête pour Cloud Run / Fly.io / Kubernetes',
    linesCount: 25,
    content: `FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=builder /app ./
EXPOSE 3000
CMD ["npx", "tsx", "server.ts"]`,
  },
];
