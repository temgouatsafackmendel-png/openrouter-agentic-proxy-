/**
 * @license MIT
 * OpenRouter Agentic Proxy & Dashboard — Interface Principale (src/App.tsx)
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { PlaygroundSimulatorView } from './components/PlaygroundSimulatorView';
import { RepoExplorerView } from './components/RepoExplorerView';
import { TelemetryCharts } from './components/TelemetryCharts';
import { WorkflowInspectorView } from './components/WorkflowInspectorView';
import { formatStructuredLogEntry, MODEL_CATALOG } from './logger';
import { proxyStore } from './proxy';
import {
  AgentTraceLog,
  ChaosMode,
  ModelPricingSpec,
  ProviderStatus,
  ProxyRoutingConfig,
  TelemetrySnapshot,
} from './types';

type ActiveTab = 'supervision' | 'workflows' | 'simulator' | 'repository';

export default function App() {
  // Zero-latency initial state hydrated from shared deterministic store
  const [snapshot, setSnapshot] = useState<TelemetrySnapshot>(() =>
    proxyStore.getSnapshot()
  );
  const [catalog, setCatalog] = useState<ModelPricingSpec[]>(() =>
    Object.values(MODEL_CATALOG)
  );
  const [activeTab, setActiveTab] = useState<ActiveTab>('supervision');

  // Filtering and selection states for the Trace Ledger
  const [searchQuery, setSearchQuery] = useState('');
  const [traceFilter, setTraceFilter] = useState<
    'all' | 'fallback_only' | 'direct_only'
  >('all');
  const [selectedTrace, setSelectedTrace] = useState<AgentTraceLog | null>(
    null
  );
  const [isBusy, setIsBusy] = useState(false);
  const [bannerNotice, setBannerNotice] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    fetch('/api/telemetry')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (mounted && data?.snapshot) {
          setSnapshot(data.snapshot);
          if (Array.isArray(data.catalog)) {
            setCatalog(data.catalog);
          }
        }
      })
      .catch(() => {
        // Fallback to local store if offline
      });
    return () => {
      mounted = false;
    };
  }, []);

  const showNotice = (msg: string) => {
    setBannerNotice(msg);
    setTimeout(() => {
      setBannerNotice((prev) => (prev === msg ? null : prev));
    }, 4500);
  };

  // Trigger an instant 429 Rate Limit Fallback simulation from Top Bar CTA or Overview
  const handleQuickSimulateFallback = async () => {
    setIsBusy(true);
    try {
      const payload = {
        model: 'anthropic/claude-3.7-sonnet',
        messages: [
          {
            role: 'user' as const,
            content:
              'Exécute l’étape critique de synthèse d’agent avec bascule automatique sur quota 429.',
          },
        ],
        chaos_mode: 'rate_limit_primary' as ChaosMode,
        agent_context: {
          workflowId: 'wf-sec-audit-01',
          agentId: 'sec-auditor-v4',
          agentStep: 'Étape Critique · Bascule Auto 429',
          stepIndex: snapshot.traces.length + 1,
        },
      };

      const res = await fetch('/api/proxy/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        setSnapshot(data.snapshot);
        const newTrace = data.snapshot.traces[0] as AgentTraceLog | undefined;
        if (newTrace) {
          setSelectedTrace(newTrace);
          showNotice(
            `Bascule automatique validée : ${newTrace.requestedModel} (429) → ${newTrace.resolvedModel} (200 OK en ${newTrace.totalLatencyMs}ms · $${newTrace.cost.totalCostUsd.toFixed(5)})`
          );
        }
      } else {
        const trace = proxyStore.dispatchProxyRequest(payload);
        setSnapshot(proxyStore.getSnapshot());
        setSelectedTrace(trace);
      }
    } catch {
      const trace = proxyStore.dispatchProxyRequest({
        model: 'anthropic/claude-3.7-sonnet',
        messages: [
          {
            role: 'user',
            content: 'Bascule locale sur erreur 429 Rate Limit.',
          },
        ],
        chaos_mode: 'rate_limit_primary',
      });
      setSnapshot(proxyStore.getSnapshot());
      setSelectedTrace(trace);
    } finally {
      setIsBusy(false);
    }
  };

  const handleDispatchCustomRequest = async (params: {
    model: string;
    prompt: string;
    agentId: string;
    agentStep: string;
    workflowId: string;
    chaosMode: ChaosMode;
    fallbackModels: string[];
  }): Promise<AgentTraceLog | null> => {
    setIsBusy(true);
    try {
      const payload = {
        model: params.model,
        messages: [{ role: 'user' as const, content: params.prompt }],
        fallback_models: params.fallbackModels,
        chaos_mode: params.chaosMode,
        agent_context: {
          workflowId: params.workflowId,
          agentId: params.agentId,
          agentStep: params.agentStep,
          stepIndex: snapshot.traces.length + 1,
          fallbackModels: params.fallbackModels,
        },
      };

      const res = await fetch('/api/proxy/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        setSnapshot(data.snapshot);
        const latest = data.snapshot.traces[0] ?? null;
        if (latest) {
          setSelectedTrace(latest);
          showNotice(
            `Requête servie par ${latest.resolvedModel} (${latest.fallbackCount} bascule · $${latest.cost.totalCostUsd.toFixed(5)})`
          );
        }
        return latest;
      }
      const fallbackTrace = proxyStore.dispatchProxyRequest(payload);
      setSnapshot(proxyStore.getSnapshot());
      setSelectedTrace(fallbackTrace);
      return fallbackTrace;
    } catch {
      const fallbackTrace = proxyStore.dispatchProxyRequest({
        model: params.model,
        messages: [{ role: 'user', content: params.prompt }],
        chaos_mode: params.chaosMode,
      });
      setSnapshot(proxyStore.getSnapshot());
      setSelectedTrace(fallbackTrace);
      return fallbackTrace;
    } finally {
      setIsBusy(false);
    }
  };

  const handleRunWorkflowSimulation = async (
    title: string,
    agentId: string,
    chaosMode: ChaosMode
  ) => {
    setIsBusy(true);
    try {
      const res = await fetch('/api/proxy/workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, agentId, chaosMode }),
      });
      if (res.ok) {
        const data = await res.json();
        setSnapshot(data.snapshot);
        showNotice(
          `Workflow "${title}" (4 nœuds) exécuté avec résilience multi-modèles.`
        );
      } else {
        proxyStore.executeMultiStepWorkflowSimulation(title, agentId, chaosMode);
        setSnapshot(proxyStore.getSnapshot());
      }
    } catch {
      proxyStore.executeMultiStepWorkflowSimulation(title, agentId, chaosMode);
      setSnapshot(proxyStore.getSnapshot());
    } finally {
      setIsBusy(false);
    }
  };

  const handleUpdateProviderStatus = async (
    providerId: string,
    status: ProviderStatus
  ) => {
    try {
      const res = await fetch(`/api/providers/${providerId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        const data = await res.json();
        setSnapshot(data.snapshot);
      } else {
        proxyStore.updateProviderStatus(providerId, status);
        setSnapshot(proxyStore.getSnapshot());
      }
    } catch {
      proxyStore.updateProviderStatus(providerId, status);
      setSnapshot(proxyStore.getSnapshot());
    }
  };

  const handleUpdateConfig = async (partial: Partial<ProxyRoutingConfig>) => {
    try {
      const res = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(partial),
      });
      if (res.ok) {
        const data = await res.json();
        setSnapshot(data.snapshot);
      } else {
        proxyStore.updateConfig(partial);
        setSnapshot(proxyStore.getSnapshot());
      }
    } catch {
      proxyStore.updateConfig(partial);
      setSnapshot(proxyStore.getSnapshot());
    }
  };

  const handleResetTraces = async (empty: boolean) => {
    try {
      const res = await fetch('/api/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empty }),
      });
      if (res.ok) {
        const data = await res.json();
        setSnapshot(data.snapshot);
        setSelectedTrace(null);
      } else {
        setSnapshot(proxyStore.resetTelemetry(empty));
        setSelectedTrace(null);
      }
    } catch {
      setSnapshot(proxyStore.resetTelemetry(empty));
      setSelectedTrace(null);
    }
  };

  const filteredTraces = useMemo(() => {
    return snapshot.traces.filter((t) => {
      if (traceFilter === 'fallback_only' && !t.fallbackTriggered) return false;
      if (traceFilter === 'direct_only' && t.fallbackTriggered) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        t.agentId.toLowerCase().includes(q) ||
        t.workflowId.toLowerCase().includes(q) ||
        t.agentStep.toLowerCase().includes(q) ||
        t.requestedModel.toLowerCase().includes(q) ||
        t.resolvedModel.toLowerCase().includes(q)
      );
    });
  }, [snapshot.traces, traceFilter, searchQuery]);

  const navItems: Array<{ id: ActiveTab; label: string }> = [
    { id: 'supervision', label: 'Supervision' },
    { id: 'workflows', label: 'Workflows' },
    { id: 'simulator', label: 'Simulateur API' },
    { id: 'repository', label: 'Code & Docs' },
  ];

  return (
    <div className="min-h-screen bg-[#0B132B] bg-architectural-grid text-[#F4F5F7] flex flex-col relative">
      {/* Ambient Background Lighting */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 overflow-hidden z-0"
      >
        <div className="absolute -top-44 left-1/4 w-[580px] h-[580px] rounded-full bg-[#5D3FD3]/18 blur-[140px]" />
        <div className="absolute top-1/3 -right-32 w-[460px] h-[460px] rounded-full bg-[#FF6B35]/12 blur-[140px]" />
      </div>

      {/* Strict 3-Zone Top Navigation Bar */}
      <header className="sticky top-0 z-30 bg-[#0B132B]/85 backdrop-blur-2xl border-b border-white/10">
        <div className="max-w-[1440px] mx-auto flex items-center justify-between gap-8 px-6 py-4">
          {/* Zone 1: Single text element wordmark */}
          <a
            href="#supervision"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('supervision');
            }}
            className="font-display text-xl font-extrabold tracking-tight text-[#F4F5F7] whitespace-nowrap shrink-0"
          >
            OpenRouter Agentic Proxy
          </a>

          {/* Zone 2: 4 concise single-line text navigation links */}
          <nav
            aria-label="Navigation principale"
            className="flex items-center gap-7 text-sm font-semibold text-slate-300 overflow-x-auto"
          >
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`py-1.5 transition-all duration-150 whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
                    isActive
                      ? 'text-white border-[#5D3FD3]'
                      : 'text-slate-300/80 border-transparent hover:text-white'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: 1 primary action */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={handleQuickSimulateFallback}
              disabled={isBusy}
              className="px-4 py-2 text-xs font-semibold text-white bg-[#5D3FD3] hover:bg-[#6d4fe3] rounded-xl transition-all cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0 shadow-md shadow-[#5D3FD3]/25"
            >
              {isBusy ? 'Bascule en cours...' : 'Simuler Fallback 429'}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="relative z-10 flex-1 max-w-[1440px] w-full mx-auto px-6 py-8 space-y-8">
        {/* Live Notification Banner when a Fallback or Simulation fires */}
        {bannerNotice && (
          <div
            role="status"
            className="rounded-xl bg-[#5D3FD3]/25 border border-[#5D3FD3]/70 px-4 py-3 flex items-center justify-between gap-4 text-xs text-white animate-view-enter"
          >
            <div className="flex items-center gap-2.5">
              <Zap className="w-4 h-4 text-[#FF6B35] shrink-0" />
              <span className="font-mono font-medium">{bannerNotice}</span>
            </div>
            <button
              type="button"
              onClick={() => setBannerNotice(null)}
              aria-label="Fermer la notification"
              className="text-slate-300 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Executive Context & Full-Width KPI Strip */}
        <section className="space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-medium text-slate-300/85">
                <span>Passerelle LLM Haute Résilience</span>
                <span aria-hidden="true">·</span>
                <span>Interception POST /v1/chat/completions</span>
                <span aria-hidden="true">·</span>
                <span>Open Source sous Licence MIT</span>
              </div>
              <h1 className="font-display text-3xl sm:text-4xl font-extrabold text-[#F4F5F7] tracking-tight mt-1.5">
                Supervision du Routage Agentique & Coûts Multi-Modèles
              </h1>
            </div>

            <div className="flex items-center gap-3 text-xs text-slate-300 font-mono">
              <span>
                Chaîne prioritaire :{' '}
                <strong className="text-white font-semibold">
                  Claude 3.7 → GPT-4o → DeepSeek R1 → Gemini 2.5
                </strong>
              </span>
            </div>
          </div>

          {/* 4-Column Full-Width KPI Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <div className="rounded-2xl glass-panel glass-interactive p-5 animate-stagger-1">
              <div className="text-xs font-medium text-slate-300">
                Requêtes d’Agents Interceptées
              </div>
              <div className="mt-2.5 flex items-baseline justify-between gap-2">
                <span
                  data-testid="kpi-total-requests"
                  className="font-display text-3xl font-extrabold font-mono tabular-nums text-white"
                >
                  {snapshot.metrics.totalRequests}
                </span>
                <span className="text-xs font-semibold text-emerald-400 font-mono tabular-nums">
                  100% délivrées
                </span>
              </div>
              <div className="mt-2 text-xs text-slate-300/80">
                {snapshot.metrics.activeWorkflowsCount} workflows autonomes suivis
              </div>
            </div>

            <div className="rounded-2xl glass-panel glass-interactive p-5 animate-stagger-2">
              <div className="text-xs font-medium text-slate-300">
                Bascules Automatiques (429 / 503)
              </div>
              <div className="mt-2.5 flex items-baseline justify-between gap-2">
                <span
                  data-testid="kpi-fallback-count"
                  className="font-display text-3xl font-extrabold font-mono tabular-nums text-[#FF6B35]"
                >
                  {snapshot.metrics.fallbackRecoveredCount}
                </span>
                <span className="text-xs font-semibold text-slate-200 font-mono tabular-nums">
                  0 échec fatal
                </span>
              </div>
              <div className="mt-2 text-xs text-slate-300/80">
                Récupération transparente par backoff exponentiel
              </div>
            </div>

            <div className="rounded-2xl glass-panel glass-interactive p-5 animate-stagger-3">
              <div className="text-xs font-medium text-slate-300">
                Coût Total Traqué par Étape
              </div>
              <div className="mt-2.5 flex items-baseline justify-between gap-2">
                <span
                  data-testid="kpi-total-cost"
                  className="font-display text-3xl font-extrabold font-mono tabular-nums text-white"
                >
                  ${snapshot.metrics.totalCostUsd.toFixed(4)}
                </span>
                <span className="text-xs font-semibold text-emerald-400 font-mono tabular-nums">
                  -${snapshot.metrics.estimatedSavingsUsd.toFixed(4)} cache
                </span>
              </div>
              <div className="mt-2 text-xs text-slate-300/80 font-mono tabular-nums">
                {snapshot.metrics.totalTokensProcessed.toLocaleString('fr-FR')}{' '}
                tokens traités
              </div>
            </div>

            <div className="rounded-2xl glass-panel glass-interactive p-5 animate-stagger-4">
              <div className="text-xs font-medium text-slate-300">
                Latence Moyenne & P95
              </div>
              <div className="mt-2.5 flex items-baseline justify-between gap-2">
                <span className="font-display text-3xl font-extrabold font-mono tabular-nums text-white">
                  {snapshot.metrics.meanLatencyMs} ms
                </span>
                <span className="text-xs font-semibold text-slate-200 font-mono tabular-nums">
                  P95 : {snapshot.metrics.p95LatencyMs} ms
                </span>
              </div>
              <div className="mt-2 text-xs text-slate-300/80">
                Seuil Circuit Breaker : {snapshot.config.circuitBreakerThreshold}{' '}
                échecs
              </div>
            </div>
          </div>
        </section>

        {/* Tab 1: Supervision Temps Réel */}
        {activeTab === 'supervision' && (
          <div className="space-y-8 animate-view-enter">
            {/* Interactive Charts */}
            <TelemetryCharts
              timeSeries={snapshot.timeSeries}
              totalPromptTokens={snapshot.metrics.totalPromptTokens}
              totalCompletionTokens={snapshot.metrics.totalCompletionTokens}
              totalCostUsd={snapshot.metrics.totalCostUsd}
              estimatedSavingsUsd={snapshot.metrics.estimatedSavingsUsd}
            />

            {/* Provider Health & Live Circuit Breaker Control Matrix */}
            <section className="rounded-2xl glass-panel p-6 animate-stagger-3">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
                <div>
                  <h2 className="font-display text-xl font-bold text-[#F4F5F7] tracking-tight">
                    État des Fournisseurs Amont & Disjoncteurs (Circuit Breakers)
                  </h2>
                  <p className="text-[13px] text-slate-300/85 mt-0.5">
                    Simulez un incident sur n’importe quel fournisseur pour observer la réallocation immédiate du trafic d’agents.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
                {snapshot.providers.map((prov) => {
                  const statusLabel =
                    prov.status === 'operational'
                      ? 'Opérationnel'
                      : prov.status === 'degraded'
                        ? 'Limité (429)'
                        : 'Panne (503)';

                  return (
                    <div
                      key={prov.id}
                      className="rounded-xl glass-subpanel glass-interactive p-4 flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-display text-base font-bold text-white truncate">
                            {prov.name}
                          </span>
                          {/* Live telemetry status indicator paired with explicit text label */}
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold shrink-0">
                            <span
                              className={`w-2 h-2 rounded-full ${
                                prov.status === 'operational'
                                  ? 'bg-emerald-400'
                                  : prov.status === 'degraded'
                                    ? 'bg-[#FF6B35]'
                                    : 'bg-rose-500'
                              }`}
                            />
                            <span
                              className={
                                prov.status === 'operational'
                                  ? 'text-emerald-400'
                                  : prov.status === 'degraded'
                                    ? 'text-[#FF6B35]'
                                    : 'text-rose-400'
                              }
                            >
                              {statusLabel}
                            </span>
                          </span>
                        </div>

                        <div className="mt-1 font-mono text-xs text-slate-300/90 truncate">
                          {prov.primaryModel}
                        </div>

                        <div className="mt-4 pt-3 border-t border-white/10 grid grid-cols-2 gap-2 text-xs font-mono tabular-nums">
                          <div>
                            <div className="text-slate-400">Latence P95</div>
                            <div className="text-white font-semibold mt-0.5">
                              {prov.p95LatencyMs} ms
                            </div>
                          </div>
                          <div>
                            <div className="text-slate-400">Bascules reçues</div>
                            <div className="text-white font-semibold mt-0.5">
                              {prov.fallbacksAbsorbed}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Interactive Status Segmented Control for Chaos Testing */}
                      <div
                        className="mt-4 pt-3 border-t border-white/10 flex items-center gap-1"
                        role="group"
                        aria-label={`Contrôle d'état pour ${prov.name}`}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateProviderStatus(prov.id, 'operational')
                          }
                          className={`flex-1 py-1.5 text-[11px] font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                            prov.status === 'operational'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : 'text-slate-400 hover:text-white bg-white/5'
                          }`}
                        >
                          200 OK
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateProviderStatus(prov.id, 'degraded')
                          }
                          className={`flex-1 py-1.5 text-[11px] font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                            prov.status === 'degraded'
                              ? 'bg-[#FF6B35]/25 text-[#FF6B35] border border-[#FF6B35]/50'
                              : 'text-slate-400 hover:text-white bg-white/5'
                          }`}
                        >
                          429 Quota
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateProviderStatus(prov.id, 'outage')
                          }
                          className={`flex-1 py-1.5 text-[11px] font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                            prov.status === 'outage'
                              ? 'bg-rose-500/25 text-rose-300 border border-rose-500/50'
                              : 'text-slate-400 hover:text-white bg-white/5'
                          }`}
                        >
                          503 Panne
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Live Agent Trace Table */}
            <section className="rounded-2xl glass-panel p-6 animate-stagger-4">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
                <div>
                  <h2 className="font-display text-xl font-bold text-[#F4F5F7] tracking-tight">
                    Journal Structuré des Étapes d’Agents & Imputation des Coûts
                  </h2>
                  <p className="text-[13px] text-slate-300/85 mt-0.5">
                    Sélectionnez une entrée pour inspecter la cascade de tentatives HTTP et le log JSON OpenTelemetry.
                  </p>
                </div>

                {/* Filter Controls & Search */}
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="search"
                      aria-label="Rechercher par agent, workflow ou modèle"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Filtrer agent, étape, modèle..."
                      className="pl-8 pr-3 py-1.5 text-xs rounded-xl bg-[#0B132B]/90 border border-white/15 text-white placeholder-slate-500 focus:outline-none focus:border-[#5D3FD3]"
                    />
                  </div>

                  <div
                    className="flex items-center gap-1 p-1 rounded-xl bg-[#0B132B]/90 border border-white/10"
                    role="group"
                    aria-label="Filtre de statut de bascule"
                  >
                    <button
                      type="button"
                      onClick={() => setTraceFilter('all')}
                      className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                        traceFilter === 'all'
                          ? 'bg-[#5D3FD3] text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Toutes ({snapshot.traces.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setTraceFilter('fallback_only')}
                      className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                        traceFilter === 'fallback_only'
                          ? 'bg-[#FF6B35] text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Bascules 429/503
                    </button>
                    <button
                      type="button"
                      onClick={() => setTraceFilter('direct_only')}
                      className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                        traceFilter === 'direct_only'
                          ? 'bg-[#5D3FD3] text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Direct 200 OK
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleResetTraces(true)}
                    aria-label="Vider le journal des traces"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-[#0B132B]/90 hover:bg-white/10 text-slate-300 border border-white/10 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Vider</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleResetTraces(false)}
                    aria-label="Restaurer les données de démonstration"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-[#0B132B]/90 hover:bg-white/10 text-slate-300 border border-white/10 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Restaurer Démo</span>
                  </button>
                </div>
              </div>

              {/* Empty State vs Populated High-Density Data Grid */}
              {filteredTraces.length === 0 ? (
                <div className="rounded-xl glass-subpanel p-10 text-center space-y-3">
                  <p className="font-display text-base font-bold text-white">
                    Aucune trace d’agent ne correspond aux critères actuels
                  </p>
                  <p className="text-xs text-slate-300/80 max-w-md mx-auto">
                    Simulez une requête avec bascule 429 ou restaurez le jeu de données initial pour inspecter les métriques par étape.
                  </p>
                  <div className="pt-2 flex items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={handleQuickSimulateFallback}
                      className="px-4 py-2 text-xs font-semibold rounded-xl bg-[#5D3FD3] text-white hover:bg-[#6d4fe3] transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    >
                      Générer une Trace 429 → Fallback
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setTraceFilter('all');
                        handleResetTraces(false);
                      }}
                      className="px-4 py-2 text-xs font-semibold rounded-xl bg-white/10 text-white hover:bg-white/15 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    >
                      Recharger les Traces de Référence
                    </button>
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-white/10 text-xs font-semibold text-slate-300">
                        <th className="py-3.5 px-3">Agent & Étape</th>
                        <th className="py-3.5 px-3">Routage Modèle (Demandé → Résolu)</th>
                        <th className="py-3.5 px-3">Statut & Résilience</th>
                        <th className="py-3.5 px-3 text-right">Tokens</th>
                        <th className="py-3.5 px-3 text-right">Latence</th>
                        <th className="py-3.5 px-3 text-right">Coût Étape</th>
                        <th className="py-3.5 px-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10 text-xs">
                      {filteredTraces.map((trace) => (
                        <tr
                          key={trace.id}
                          onClick={() => setSelectedTrace(trace)}
                          className="hover:bg-white/[0.05] transition-colors cursor-pointer"
                        >
                          <td className="py-3.5 px-3">
                            <div className="font-display font-bold text-sm text-white">
                              {trace.agentStep}
                            </div>
                            <div className="text-slate-300/80 font-mono text-[11px] mt-0.5">
                              {trace.agentId} · {trace.workflowId}
                            </div>
                          </td>

                          <td className="py-3.5 px-3 font-mono">
                            {trace.fallbackTriggered ? (
                              <div className="space-y-0.5">
                                <div className="text-slate-400 line-through text-[11px]">
                                  {trace.requestedModel}
                                </div>
                                <div className="text-white font-semibold flex items-center gap-1.5">
                                  <ArrowRight className="w-3 h-3 text-[#FF6B35] shrink-0" />
                                  <span>{trace.resolvedModel}</span>
                                </div>
                              </div>
                            ) : (
                              <div className="text-slate-200 font-medium">
                                {trace.resolvedModel}
                              </div>
                            )}
                          </td>

                          <td className="py-3.5 px-3">
                            {trace.fallbackTriggered ? (
                              <span className="inline-flex items-center gap-1.5 text-[#FF6B35] font-semibold">
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                <span>
                                  Secouru ({trace.fallbackCount} bascule
                                  {trace.fallbackCount > 1 ? 's' : ''})
                                </span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 text-emerald-400 font-semibold">
                                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                <span>200 OK Direct</span>
                              </span>
                            )}
                          </td>

                          <td className="py-3.5 px-3 text-right font-mono tabular-nums text-slate-200">
                            {trace.tokens.totalTokens.toLocaleString('fr-FR')}
                          </td>

                          <td className="py-3.5 px-3 text-right font-mono tabular-nums text-slate-200">
                            {trace.totalLatencyMs} ms
                          </td>

                          <td className="py-3.5 px-3 text-right font-mono tabular-nums font-bold text-white">
                            ${trace.cost.totalCostUsd.toFixed(5)}
                          </td>

                          <td className="py-3.5 px-3 text-right">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedTrace(trace);
                              }}
                              className="px-3 py-1 text-[11px] font-semibold rounded-lg bg-white/10 hover:bg-[#5D3FD3] text-white transition-colors cursor-pointer whitespace-nowrap shrink-0"
                            >
                              Inspecter
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}

        {/* Tab 2: Workflows Multi-Étapes */}
        {activeTab === 'workflows' && (
          <WorkflowInspectorView
            workflows={snapshot.workflows}
            onRunWorkflowSimulation={handleRunWorkflowSimulation}
            isSimulating={isBusy}
          />
        )}

        {/* Tab 3: Simulateur API & Routage */}
        {activeTab === 'simulator' && (
          <PlaygroundSimulatorView
            config={snapshot.config}
            catalog={catalog}
            onDispatchRequest={handleDispatchCustomRequest}
            onUpdateConfig={handleUpdateConfig}
            latestTrace={selectedTrace ?? snapshot.traces[0] ?? null}
          />
        )}

        {/* Tab 4: Code Source & Documentation GitHub */}
        {activeTab === 'repository' && <RepoExplorerView />}
      </main>

      {/* Trace Inspection Modal / Drawer */}
      {selectedTrace && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="trace-modal-title"
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setSelectedTrace(null)}
        >
          <div
            className="w-full max-w-2xl rounded-2xl glass-panel p-6 space-y-5 shadow-2xl max-h-[88vh] overflow-y-auto animate-modal-enter"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
              <div>
                <div className="text-xs font-mono text-slate-300">
                  Trace ID : {selectedTrace.id} · Workflow :{' '}
                  {selectedTrace.workflowId}
                </div>
                <h3
                  id="trace-modal-title"
                  className="font-display text-xl font-bold text-white mt-1"
                >
                  {selectedTrace.agentStep} ({selectedTrace.agentId})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTrace(null)}
                aria-label="Fermer l'inspecteur de trace"
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-slate-300 hover:text-white cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Summary Metrics */}
            <div className="grid grid-cols-3 gap-3 text-xs font-mono tabular-nums">
              <div className="p-3.5 rounded-xl glass-subpanel">
                <div className="text-slate-300">Modèle Résolu</div>
                <div className="text-emerald-400 font-bold mt-1 truncate">
                  {selectedTrace.resolvedModel}
                </div>
              </div>
              <div className="p-3.5 rounded-xl glass-subpanel">
                <div className="text-slate-300">Tokens (In / Out)</div>
                <div className="text-white font-bold mt-1">
                  {selectedTrace.tokens.promptTokens} /{' '}
                  {selectedTrace.tokens.completionTokens}
                </div>
              </div>
              <div className="p-3.5 rounded-xl glass-subpanel">
                <div className="text-slate-300">Coût Net Étape</div>
                <div className="text-[#FF6B35] font-bold mt-1">
                  ${selectedTrace.cost.totalCostUsd.toFixed(6)}
                </div>
              </div>
            </div>

            {/* Attempts Cascade */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-200">
                Historique des Tentatives & Backoff Exponentiel
              </div>
              {selectedTrace.attempts.map((att) => (
                <div
                  key={att.attemptNumber}
                  className="p-3.5 rounded-xl glass-subpanel flex items-center justify-between gap-3 text-xs font-mono"
                >
                  <div>
                    <div className="text-white font-semibold">
                      Tentative #{att.attemptNumber} · {att.model} ({att.provider})
                    </div>
                    {att.errorReason && (
                      <div className="text-[#FF6B35] mt-0.5">
                        {att.errorReason}
                      </div>
                    )}
                    {att.backoffAppliedMs > 0 && (
                      <div className="text-slate-300 mt-0.5 flex items-center gap-1">
                        <RefreshCw className="w-3 h-3" />
                        <span>Backoff appliqué : {att.backoffAppliedMs} ms</span>
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
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

            {/* Structured Pino / Fastify Log */}
            <div>
              <div className="text-xs font-semibold text-slate-200 mb-1.5">
                Entrée de Journal Structurée JSON (src/logger.ts)
              </div>
              <pre className="p-4 rounded-xl bg-[#080E21] border border-white/10 text-[11px] font-mono text-slate-200 overflow-x-auto leading-relaxed">
                {JSON.stringify(
                  JSON.parse(formatStructuredLogEntry(selectedTrace)),
                  null,
                  2
                )}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* Clean Footer */}
      <footer className="relative z-10 border-t border-white/10 py-5 px-6 text-xs text-slate-300/80">
        <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-4">
          <span>
            OpenRouter Agentic Proxy & Dashboard · Créé par{' '}
            <strong className="text-white font-semibold">Mendel Temgoua</strong> · Licence Open Source MIT
          </span>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setActiveTab('repository')}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Publier sur GitHub & Licence MIT
            </button>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => setActiveTab('simulator')}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Simulateur POST /v1/chat/completions
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
