/**
 * @license MIT
 * Simulateur Interactif `/v1/chat/completions` & Configuration du Routage (src/components/PlaygroundSimulatorView.tsx)
 */

import React, { useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Copy,
  Send,
  Sliders,
  Terminal,
  Zap,
} from 'lucide-react';
import {
  AgentTraceLog,
  ChaosMode,
  ModelPricingSpec,
  ProxyRoutingConfig,
} from '../types';

interface PlaygroundSimulatorViewProps {
  config: ProxyRoutingConfig;
  catalog: ModelPricingSpec[];
  onDispatchRequest: (payload: {
    model: string;
    prompt: string;
    agentId: string;
    agentStep: string;
    workflowId: string;
    chaosMode: ChaosMode;
    fallbackModels: string[];
  }) => Promise<AgentTraceLog | null>;
  onUpdateConfig: (partial: Partial<ProxyRoutingConfig>) => Promise<void>;
  latestTrace: AgentTraceLog | null;
}

export const PlaygroundSimulatorView: React.FC<PlaygroundSimulatorViewProps> = ({
  config,
  catalog,
  onDispatchRequest,
  onUpdateConfig,
  latestTrace,
}) => {
  const [model, setModel] = useState(config.defaultPrimaryModel);
  const [fallbackInput, setFallbackInput] = useState(
    'openai/gpt-4o, deepseek/deepseek-r1, google/gemini-2.5-pro'
  );
  const [agentId, setAgentId] = useState('code-architect-agent');
  const [agentStep, setAgentStep] = useState('3. Synthèse & Patch AST');
  const [workflowId, setWorkflowId] = useState('wf-live-playground');
  const [chaosMode, setChaosMode] = useState<ChaosMode>('rate_limit_primary');
  const [prompt, setPrompt] = useState(
    'Génère une politique de retry exponentiel avec jitter pour un client HTTP OpenRouter et vérifie les limites de budget par étape.'
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [copiedCurl, setCopiedCurl] = useState(false);

  // Config form state
  const [backoffMs, setBackoffMs] = useState(config.initialBackoffMs);
  const [cbThreshold, setCbThreshold] = useState(
    config.circuitBreakerThreshold
  );
  const [budgetUsd, setBudgetUsd] = useState(config.workflowBudgetUsd);
  const [cacheEnabled, setCacheEnabled] = useState(config.semanticCacheEnabled);
  const [configSaved, setConfigSaved] = useState(false);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) {
      setErrorMsg(
        'Le message de prompt ne peut pas être vide pour exécuter une requête LLM.'
      );
      return;
    }
    if (!agentId.trim()) {
      setErrorMsg('L’identifiant X-Agent-Id est requis.');
      return;
    }
    setErrorMsg(null);
    setIsSending(true);
    try {
      const fallbackModels = fallbackInput
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean);
      await onDispatchRequest({
        model,
        prompt: prompt.trim(),
        agentId: agentId.trim(),
        agentStep: agentStep.trim() || 'Step 1 · Exécution',
        workflowId: workflowId.trim() || 'wf-live-playground',
        chaosMode,
        fallbackModels,
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    await onUpdateConfig({
      initialBackoffMs: Math.max(50, Number(backoffMs) || 400),
      circuitBreakerThreshold: Math.max(1, Number(cbThreshold) || 3),
      workflowBudgetUsd: Math.max(0.5, Number(budgetUsd) || 2.5),
      semanticCacheEnabled: cacheEnabled,
    });
    setConfigSaved(true);
    setTimeout(() => setConfigSaved(false), 2500);
  };

  const curlSnippet = `curl -X POST http://localhost:3000/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "X-Workflow-Id: ${workflowId}" \\
  -H "X-Agent-Id: ${agentId}" \\
  -H "X-Agent-Step: ${agentStep}" \\
  -H "X-Fallback-Models: ${fallbackInput}" \\
  -H "X-Chaos-Mode: ${chaosMode}" \\
  -d '${JSON.stringify(
    {
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
    },
    null,
    2
  )}'`;

  const handleCopyCurl = () => {
    navigator.clipboard?.writeText(curlSnippet);
    setCopiedCurl(true);
    setTimeout(() => setCopiedCurl(false), 2000);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start animate-view-enter">
      {/* Left Column: Proxy Request Simulator */}
      <div className="lg:col-span-7 space-y-6">
        <section className="rounded-2xl glass-panel p-6">
          <div className="flex items-center justify-between gap-4 mb-5">
            <div>
              <h2 className="font-display text-xl font-bold text-[#F4F5F7] tracking-tight">
                Simulateur d’Interception POST /v1/chat/completions
              </h2>
              <p className="text-[13px] text-slate-300/85 mt-0.5">
                Injectez des pannes amont (429 Rate Limit, 503 Outage, 504 Timeout) pour éprouver en direct le moteur de bascule multi-modèles.
              </p>
            </div>
          </div>

          <form onSubmit={handleSend} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="sim-primary-model"
                  className="block text-xs font-semibold text-slate-200 mb-1.5"
                >
                  Modèle Primaire Demandé
                </label>
                <select
                  id="sim-primary-model"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm font-mono rounded-xl bg-[#0B132B]/90 border border-white/15 text-[#F4F5F7] focus:outline-none focus:border-[#5D3FD3] transition-colors"
                >
                  {catalog.map((spec) => (
                    <option key={spec.model} value={spec.model}>
                      {spec.model} · ${spec.inputCostPer1M}/${spec.outputCostPer1M}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="sim-chaos-mode"
                  className="block text-xs font-semibold text-slate-200 mb-1.5"
                >
                  Injection d’Incident Amont (Chaos Mode)
                </label>
                <select
                  id="sim-chaos-mode"
                  value={chaosMode}
                  onChange={(e) => setChaosMode(e.target.value as ChaosMode)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-[#0B132B]/90 border border-white/15 text-[#F4F5F7] focus:outline-none focus:border-[#5D3FD3] transition-colors"
                >
                  <option value="rate_limit_primary">
                    429 Rate Limit (#1) → Bascule Modèle #2
                  </option>
                  <option value="outage_primary_and_secondary">
                    503 Double Panne (#1 & #2) → Bascule #3
                  </option>
                  <option value="timeout_retry">
                    504 Timeout TTFT → Retry + Bascule
                  </option>
                  <option value="none">
                    200 OK Flux Nominal (Sans panne)
                  </option>
                </select>
              </div>
            </div>

            <div>
              <label
                htmlFor="sim-fallback-chain"
                className="block text-xs font-semibold text-slate-200 mb-1.5"
              >
                Chaîne de Fallback Prioritaire (En-tête X-Fallback-Models)
              </label>
              <input
                id="sim-fallback-chain"
                type="text"
                value={fallbackInput}
                onChange={(e) => setFallbackInput(e.target.value)}
                className="w-full px-3.5 py-2.5 text-xs font-mono rounded-xl bg-[#0B132B]/90 border border-white/15 text-[#F4F5F7] focus:outline-none focus:border-[#5D3FD3] transition-colors"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label
                  htmlFor="sim-workflow-id"
                  className="block text-xs font-semibold text-slate-200 mb-1.5"
                >
                  X-Workflow-Id
                </label>
                <input
                  id="sim-workflow-id"
                  type="text"
                  value={workflowId}
                  onChange={(e) => setWorkflowId(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs font-mono rounded-xl bg-[#0B132B]/90 border border-white/15 text-[#F4F5F7] focus:outline-none focus:border-[#5D3FD3] transition-colors"
                />
              </div>

              <div>
                <label
                  htmlFor="sim-agent-id"
                  className="block text-xs font-semibold text-slate-200 mb-1.5"
                >
                  X-Agent-Id
                </label>
                <input
                  id="sim-agent-id"
                  type="text"
                  value={agentId}
                  onChange={(e) => setAgentId(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs font-mono rounded-xl bg-[#0B132B]/90 border border-white/15 text-[#F4F5F7] focus:outline-none focus:border-[#5D3FD3] transition-colors"
                />
              </div>

              <div>
                <label
                  htmlFor="sim-agent-step"
                  className="block text-xs font-semibold text-slate-200 mb-1.5"
                >
                  X-Agent-Step
                </label>
                <input
                  id="sim-agent-step"
                  type="text"
                  value={agentStep}
                  onChange={(e) => setAgentStep(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs rounded-xl bg-[#0B132B]/90 border border-white/15 text-[#F4F5F7] focus:outline-none focus:border-[#5D3FD3] transition-colors"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="sim-prompt-textarea"
                className="block text-xs font-semibold text-slate-200 mb-1.5"
              >
                Charge Utile du Message (Prompt Agent)
              </label>
              <textarea
                id="sim-prompt-textarea"
                rows={3}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-[#0B132B]/90 border border-white/15 text-[#F4F5F7] focus:outline-none focus:border-[#5D3FD3] transition-colors leading-relaxed"
              />
            </div>

            {errorMsg && (
              <p role="alert" className="text-xs font-medium text-[#FF6B35]">
                {errorMsg}
              </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <span className="text-xs text-slate-300">
                Point d’entrée cible :{' '}
                <code className="font-mono text-white font-medium">
                  POST /v1/chat/completions
                </code>
              </span>
              <button
                type="submit"
                disabled={isSending}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl bg-[#5D3FD3] hover:bg-[#6d4fe3] text-white transition-all cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <Send className="w-4 h-4" />
                <span>
                  {isSending
                    ? 'Routage en cours...'
                    : 'Envoyer la Requête au Proxy'}
                </span>
              </button>
            </div>
          </form>
        </section>

        {/* cURL Generator Box */}
        <section className="rounded-2xl glass-panel p-6">
          <div className="flex items-center justify-between gap-4 mb-3">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-[#5D3FD3]" />
              <h3 className="font-display text-base font-bold text-white">
                Commande cURL Équivalente (CLI & Agent SDK)
              </h3>
            </div>
            <button
              type="button"
              onClick={handleCopyCurl}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#0B132B] border border-white/15 text-slate-200 hover:text-white transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>{copiedCurl ? 'Copié' : 'Copier cURL'}</span>
            </button>
          </div>
          <pre className="p-4 rounded-xl glass-subpanel text-xs font-mono text-slate-200 overflow-x-auto leading-relaxed">
            {curlSnippet}
          </pre>
        </section>
      </div>

      {/* Right Column: Live Execution Result + Global Routing Parameters */}
      <div className="lg:col-span-5 space-y-6">
        {/* Latest Trace Hop Inspector */}
        <section className="rounded-2xl glass-panel p-6">
          <div className="flex items-center justify-between gap-2 mb-4">
            <h3 className="font-display text-lg font-bold text-white flex items-center gap-2">
              <Zap className="w-4 h-4 text-[#FF6B35]" />
              <span>Résultat de l’Interception Proxy</span>
            </h3>
            {latestTrace && (
              <span className="font-mono text-xs text-slate-300">
                {latestTrace.id}
              </span>
            )}
          </div>

          {latestTrace ? (
            <div
              key={latestTrace.id}
              className="space-y-4 animate-view-enter"
            >
              <div className="p-4 rounded-xl glass-subpanel space-y-2.5 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-300">X-Proxy-Resolved-Model:</span>
                  <span className="text-emerald-400 font-bold">
                    {latestTrace.resolvedModel}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-300">X-Proxy-Fallback-Count:</span>
                  <span
                    className={
                      latestTrace.fallbackCount > 0
                        ? 'text-[#FF6B35] font-bold'
                        : 'text-slate-200'
                    }
                  >
                    {latestTrace.fallbackCount} bascule(s)
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-300">X-Proxy-Step-Cost-Usd:</span>
                  <span className="text-white font-bold">
                    ${latestTrace.cost.totalCostUsd.toFixed(6)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-300">Latence Totale :</span>
                  <span className="text-white font-semibold">
                    {latestTrace.totalLatencyMs} ms
                  </span>
                </div>
              </div>

              {/* Hop-by-hop timeline */}
              <div className="space-y-2">
                <div className="text-xs font-semibold text-slate-200">
                  Cascade de Tentatives ({latestTrace.attempts.length})
                </div>
                {latestTrace.attempts.map((att) => (
                  <div
                    key={att.attemptNumber}
                    className="p-3.5 rounded-xl glass-subpanel text-xs flex items-center justify-between gap-2"
                  >
                    <div>
                      <div className="font-mono font-semibold text-white flex items-center gap-1.5">
                        <span>Essai #{att.attemptNumber}</span>
                        <ArrowRight className="w-3 h-3 text-slate-400" />
                        <span>{att.model}</span>
                      </div>
                      {att.errorReason && (
                        <div className="text-[#FF6B35] mt-0.5">
                          {att.errorReason}
                        </div>
                      )}
                    </div>
                    <div className="text-right font-mono tabular-nums shrink-0">
                      <div
                        className={
                          att.statusCode === 200
                            ? 'text-emerald-400 font-bold'
                            : 'text-[#FF6B35] font-bold'
                        }
                      >
                        HTTP {att.statusCode}
                      </div>
                      <div className="text-slate-300">{att.latencyMs} ms</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-300">
              Exécutez une requête pour inspecter les sauts de bascule et les en-têtes retournés.
            </p>
          )}
        </section>

        {/* Global Proxy Configuration Form */}
        <section className="rounded-2xl glass-panel p-6">
          <div className="flex items-center gap-2 mb-4">
            <Sliders className="w-4 h-4 text-[#5D3FD3]" />
            <h3 className="font-display text-lg font-bold text-white">
              Politique de Résilience & Circuit Breaker
            </h3>
          </div>

          <form onSubmit={handleSaveConfig} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="cfg-backoff"
                  className="block text-xs font-semibold text-slate-200 mb-1"
                >
                  Backoff Initial (ms)
                </label>
                <input
                  id="cfg-backoff"
                  type="number"
                  min={50}
                  max={5000}
                  value={backoffMs}
                  onChange={(e) => setBackoffMs(Number(e.target.value))}
                  className="w-full px-3.5 py-2 text-sm font-mono rounded-xl bg-[#0B132B]/90 border border-white/15 text-white"
                />
              </div>

              <div>
                <label
                  htmlFor="cfg-cb-threshold"
                  className="block text-xs font-semibold text-slate-200 mb-1"
                >
                  Seuil Circuit Breaker (Échecs)
                </label>
                <input
                  id="cfg-cb-threshold"
                  type="number"
                  min={1}
                  max={10}
                  value={cbThreshold}
                  onChange={(e) => setCbThreshold(Number(e.target.value))}
                  className="w-full px-3.5 py-2 text-sm font-mono rounded-xl bg-[#0B132B]/90 border border-white/15 text-white"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="cfg-budget"
                className="block text-xs font-semibold text-slate-200 mb-1"
              >
                Plafond Budgétaire par Workflow (USD)
              </label>
              <input
                id="cfg-budget"
                type="number"
                step="0.25"
                min={0.5}
                max={50}
                value={budgetUsd}
                onChange={(e) => setBudgetUsd(Number(e.target.value))}
                className="w-full px-3.5 py-2 text-sm font-mono rounded-xl bg-[#0B132B]/90 border border-white/15 text-white"
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <label
                htmlFor="cfg-semantic-cache"
                className="text-xs font-medium text-slate-200 cursor-pointer"
              >
                Activer le Cache Sémantique des Prompts (-18% coût)
              </label>
              <input
                id="cfg-semantic-cache"
                type="checkbox"
                checked={cacheEnabled}
                onChange={(e) => setCacheEnabled(e.target.checked)}
                className="w-4 h-4 accent-[#5D3FD3] rounded cursor-pointer"
              />
            </div>

            <div className="pt-2 flex items-center justify-between gap-3">
              {configSaved ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Paramètres appliqués au moteur</span>
                </span>
              ) : (
                <span className="text-xs text-slate-300">
                  Synchronisé à chaud sans redémarrage
                </span>
              )}

              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-white/10 hover:bg-white/15 text-white border border-white/15 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                Enregistrer la Politique
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
};
