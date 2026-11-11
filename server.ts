/**
 * @license MIT
 * Serveur Full-Stack OpenRouter Agentic Proxy & Dashboard (server.ts)
 * Monte les routes proxy `/v1/chat/completions` et `/api/*` ainsi que le middleware Vite sur le port 3000.
 */

import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import {
  buildProxyRequestFromHttp,
  formatOpenRouterCompletionResponse,
  MODEL_CATALOG,
  proxyStore,
} from './src/index';
import { ChaosMode, ProviderStatus } from './src/types';

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '2mb' }));

  // 1. Endpoint standard OpenRouter / OpenAI compatible : POST /v1/chat/completions
  app.post('/v1/chat/completions', (req, res) => {
    const proxyReq = buildProxyRequestFromHttp(
      req.body ?? {},
      req.headers as Record<string, string | string[] | undefined>
    );
    const completion = formatOpenRouterCompletionResponse(proxyReq);

    res.setHeader('X-Proxy-Trace-Id', completion.x_agentic_proxy.trace_id);
    res.setHeader(
      'X-Proxy-Resolved-Model',
      completion.x_agentic_proxy.resolved_model
    );
    res.setHeader(
      'X-Proxy-Fallback-Count',
      String(completion.x_agentic_proxy.fallback_count)
    );
    res.setHeader(
      'X-Proxy-Step-Cost-Usd',
      String(completion.x_agentic_proxy.cost_usd.totalCostUsd)
    );

    res.status(200).json(completion);
  });

  // 2. Snapshot complet de télémétrie pour le Dashboard Temps Réel
  app.get('/api/telemetry', (_req, res) => {
    res.json({
      snapshot: proxyStore.getSnapshot(),
      catalog: Object.values(MODEL_CATALOG),
    });
  });

  // 3. Exécution d'une requête simulée ou personnalisée depuis le Dashboard
  app.post('/api/proxy/dispatch', (req, res) => {
    const body = req.body ?? {};
    if (!body.model || typeof body.model !== 'string') {
      res.status(400).json({ error: 'Le modèle primaire est requis.' });
      return;
    }
    const proxyReq = buildProxyRequestFromHttp(
      body,
      req.headers as Record<string, string | string[] | undefined>
    );
    const completion = formatOpenRouterCompletionResponse(proxyReq);
    res.json({
      completion,
      snapshot: proxyStore.getSnapshot(),
    });
  });

  // 4. Simulation d'un workflow multi-étapes complet (4 étapes d'agent)
  app.post('/api/proxy/workflow', (req, res) => {
    const { title, agentId, chaosMode } = req.body ?? {};
    const safeTitle =
      typeof title === 'string' && title.trim()
        ? title.trim()
        : 'Audit de résilience & synthèse multi-sources';
    const safeAgentId =
      typeof agentId === 'string' && agentId.trim()
        ? agentId.trim()
        : 'autonomous-orchestrator-v2';
    const safeChaos: ChaosMode = chaosMode ?? 'rate_limit_primary';

    const createdTraces = proxyStore.executeMultiStepWorkflowSimulation(
      safeTitle,
      safeAgentId,
      safeChaos
    );

    res.json({
      createdTraces,
      snapshot: proxyStore.getSnapshot(),
    });
  });

  // 5. Bascule manuelle de l'état d'un fournisseur (Chaos Engineering / Circuit Breaker)
  app.post('/api/providers/:id/status', (req, res) => {
    const { id } = req.params;
    const { status } = req.body as { status?: ProviderStatus };
    if (!status || !['operational', 'degraded', 'outage'].includes(status)) {
      res.status(400).json({ error: 'Statut de fournisseur invalide.' });
      return;
    }
    proxyStore.updateProviderStatus(id, status);
    res.json({ snapshot: proxyStore.getSnapshot() });
  });

  // 6. Mise à jour de la configuration de routage et du budget d'agent
  app.put('/api/config', (req, res) => {
    const partial = req.body ?? {};
    proxyStore.updateConfig(partial);
    res.json({ snapshot: proxyStore.getSnapshot() });
  });

  // 7. Réinitialisation ou vidage des traces (pour tester l'état vide ou restaurer la démo)
  app.post('/api/reset', (req, res) => {
    const empty = Boolean(req.body?.empty);
    const snapshot = proxyStore.resetTelemetry(empty);
    res.json({ snapshot });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(
      `[OpenRouter Agentic Proxy] Server listening on http://0.0.0.0:${PORT}`
    );
  });
}

startServer();
