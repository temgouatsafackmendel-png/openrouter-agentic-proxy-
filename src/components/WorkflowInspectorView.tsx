/**
 * @license MIT
 * Inspecteur de Workflows Multi-Étapes & Coûts par Nœud d'Agent (src/components/WorkflowInspectorView.tsx)
 */

import React, { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Play,
  ShieldCheck,
} from 'lucide-react';
import { AgentWorkflowSummary, ChaosMode } from '../types';

interface WorkflowInspectorViewProps {
  workflows: AgentWorkflowSummary[];
  onRunWorkflowSimulation: (
    title: string,
    agentId: string,
    chaosMode: ChaosMode
  ) => Promise<void>;
  isSimulating: boolean;
}

export const WorkflowInspectorView: React.FC<WorkflowInspectorViewProps> = ({
  workflows,
  onRunWorkflowSimulation,
  isSimulating,
}) => {
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>(
    () =>
      workflows.find((w) => w.workflowId === 'wf-sec-audit-01')?.workflowId ??
      workflows[0]?.workflowId ??
      ''
  );
  const [titleInput, setTitleInput] = useState(
    'Migration de schéma SQL & génération de tests de régression'
  );
  const [agentIdInput, setAgentIdInput] = useState('dev-swarm-orchestrator');
  const [chaosMode, setChaosMode] = useState<ChaosMode>('rate_limit_primary');
  const [validationError, setValidationError] = useState<string | null>(null);

  const activeWorkflow =
    workflows.find((w) => w.workflowId === selectedWorkflowId) ?? workflows[0];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titleInput.trim() || !agentIdInput.trim()) {
      setValidationError(
        'Veuillez renseigner un objectif de workflow et un identifiant d’agent valides.'
      );
      return;
    }
    setValidationError(null);
    await onRunWorkflowSimulation(
      titleInput.trim(),
      agentIdInput.trim(),
      chaosMode
    );
    setSelectedWorkflowId('');
  };

  return (
    <div className="space-y-8 animate-view-enter">
      {/* Workflow Launcher Form */}
      <section className="rounded-2xl glass-panel p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
          <div>
            <h2 className="font-display text-xl font-bold text-[#F4F5F7] tracking-tight">
              Orchestrateur de Workflows d’Agents Multi-Étapes (4 Nœuds)
            </h2>
            <p className="text-[13px] text-slate-300/85 mt-0.5">
              Déclenchez une chaîne d’exécution autonome complète (Planification · Extraction RAG · Synthèse de Code · Audit) avec traçabilité budgétaire par nœud.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
          <div className="md:col-span-4">
            <label
              htmlFor="wf-title-input"
              className="block text-xs font-semibold text-slate-200 mb-1.5"
            >
              Mission de l’Agent Autonome
            </label>
            <input
              id="wf-title-input"
              type="text"
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              placeholder="Ex: Audit de sécurité OAuth2 & génération de patch"
              className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-[#0B132B]/90 border border-white/15 text-[#F4F5F7] placeholder-slate-500 focus:outline-none focus:border-[#5D3FD3] transition-colors"
            />
          </div>

          <div className="md:col-span-3">
            <label
              htmlFor="wf-agent-id"
              className="block text-xs font-semibold text-slate-200 mb-1.5"
            >
              En-tête X-Agent-Id
            </label>
            <input
              id="wf-agent-id"
              type="text"
              value={agentIdInput}
              onChange={(e) => setAgentIdInput(e.target.value)}
              placeholder="sec-auditor-v4"
              className="w-full px-3.5 py-2.5 text-sm font-mono rounded-xl bg-[#0B132B]/90 border border-white/15 text-[#F4F5F7] placeholder-slate-500 focus:outline-none focus:border-[#5D3FD3] transition-colors"
            />
          </div>

          <div className="md:col-span-3">
            <label
              htmlFor="wf-chaos-select"
              className="block text-xs font-semibold text-slate-200 mb-1.5"
            >
              Scénario de Résilience
            </label>
            <select
              id="wf-chaos-select"
              value={chaosMode}
              onChange={(e) => setChaosMode(e.target.value as ChaosMode)}
              className="w-full px-3 py-2.5 text-sm rounded-xl bg-[#0B132B]/90 border border-white/15 text-[#F4F5F7] focus:outline-none focus:border-[#5D3FD3] transition-colors"
            >
              <option value="rate_limit_primary">429 Quota → Bascule Auto</option>
              <option value="outage_primary_and_secondary">503 Double Panne Amont</option>
              <option value="timeout_retry">504 Timeout & Retry</option>
              <option value="none">200 OK Flux Nominal</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={isSimulating}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl bg-[#5D3FD3] hover:bg-[#6d4fe3] text-white transition-all cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Play className="w-4 h-4" />
              <span>{isSimulating ? 'Exécution...' : 'Lancer 4 Étapes'}</span>
            </button>
          </div>
        </form>

        {validationError && (
          <p role="alert" className="mt-3 text-xs font-medium text-[#FF6B35]">
            {validationError}
          </p>
        )}
      </section>

      {/* Workflows Split View */}
      {workflows.length === 0 ? (
        <div className="rounded-2xl glass-panel p-12 text-center">
          <p className="font-display text-lg font-bold text-white">
            Aucun workflow d’agent enregistré dans la session active
          </p>
          <p className="text-sm text-slate-300/80 mt-1 max-w-md mx-auto">
            Lancez une exécution multi-étapes ci-dessus pour inspecter la cascade de coûts et les bascules de modèles par étape.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left List of Workflows */}
          <div className="lg:col-span-4 space-y-3">
            <h3 className="font-display text-sm font-bold text-slate-200 px-1 tracking-tight">
              Graphes d’Exécution Traqués ({workflows.length})
            </h3>
            {workflows.map((wf) => {
              const isSelected = activeWorkflow?.workflowId === wf.workflowId;
              const budgetPct = Math.min(
                100,
                Math.round((wf.totalCostUsd / wf.budgetLimitUsd) * 100)
              );

              return (
                <button
                  key={wf.workflowId}
                  type="button"
                  onClick={() => setSelectedWorkflowId(wf.workflowId)}
                  className={`w-full text-left p-4 rounded-xl border transition-all cursor-pointer glass-interactive ${
                    isSelected
                      ? 'bg-[#5D3FD3]/22 border-[#5D3FD3] shadow-lg'
                      : 'bg-[#111A3A]/75 border-white/10 hover:border-white/25'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-display text-sm font-bold text-[#F4F5F7] line-clamp-1">
                      {wf.title}
                    </span>
                    <span className="font-mono tabular-nums text-xs font-bold text-[#FF6B35] shrink-0">
                      ${wf.totalCostUsd.toFixed(4)}
                    </span>
                  </div>

                  <div className="mt-1.5 flex items-center gap-2 text-xs text-slate-400 font-mono">
                    <span>{wf.workflowId}</span>
                    <span aria-hidden="true">·</span>
                    <span>{wf.agentId}</span>
                  </div>

                  <div className="mt-3 flex items-center justify-between text-xs text-slate-200">
                    <span>
                      {wf.completedSteps} étapes ·{' '}
                      {wf.totalTokens.toLocaleString('fr-FR')} tok
                    </span>
                    <span className={wf.fallbacksUsed > 0 ? 'text-[#FF6B35] font-medium' : 'text-emerald-400'}>
                      {wf.fallbacksUsed > 0
                        ? `${wf.fallbacksUsed} bascule(s) 429/503`
                        : 'Flux nominal'}
                    </span>
                  </div>

                  {/* Budget bar */}
                  <div className="mt-2.5 w-full h-1.5 rounded-full bg-[#0B132B] overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        budgetPct > 80 ? 'bg-[#FF6B35]' : 'bg-[#5D3FD3]'
                      }`}
                      style={{ width: `${Math.max(8, budgetPct)}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>

          {/* Right Detailed Step Waterfall */}
          {activeWorkflow && (
            <div
              key={activeWorkflow.workflowId}
              className="lg:col-span-8 rounded-2xl glass-panel p-6 animate-view-enter"
            >
              <div className="flex flex-wrap items-start justify-between gap-4 pb-5 border-b border-white/10">
                <div>
                  <div className="flex items-center gap-2 text-xs text-slate-300/80 font-mono">
                    <span>Workflow {activeWorkflow.workflowId}</span>
                    <span aria-hidden="true">·</span>
                    <span>Agent {activeWorkflow.agentId}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {activeWorkflow.fallbacksUsed > 0
                        ? `Secouru (${activeWorkflow.fallbacksUsed} bascule auto)`
                        : 'Exécution directe'}
                    </span>
                  </div>
                  <h3 className="font-display text-2xl font-bold text-white mt-1 tracking-tight">
                    {activeWorkflow.title}
                  </h3>
                </div>

                <div className="text-right font-mono tabular-nums">
                  <div className="text-xs text-slate-300/80">Coût Cumulé du Graphe</div>
                  <div className="font-display text-2xl font-bold text-[#FF6B35]">
                    ${activeWorkflow.totalCostUsd.toFixed(4)}{' '}
                    <span className="text-xs text-slate-400 font-normal">
                      / ${activeWorkflow.budgetLimitUsd.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Steps Breakdown */}
              <div className="mt-6 space-y-4">
                {activeWorkflow.steps.map((step) => (
                  <div
                    key={step.id}
                    className="rounded-xl glass-subpanel glass-interactive p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        {step.fallbackTriggered ? (
                          <AlertTriangle className="w-4 h-4 text-[#FF6B35] shrink-0" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        )}
                        <span className="font-display text-base font-bold text-white">
                          {step.agentStep}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-xs font-mono tabular-nums text-slate-200">
                        <span>{step.tokens.totalTokens.toLocaleString('fr-FR')} tok</span>
                        <span aria-hidden="true">·</span>
                        <span>{step.totalLatencyMs} ms</span>
                        <span aria-hidden="true">·</span>
                        <span className="text-white font-bold">
                          ${step.cost.totalCostUsd.toFixed(5)}
                        </span>
                      </div>
                    </div>

                    <p className="text-[13px] text-slate-200/90 mt-2 leading-relaxed">
                      {step.promptPreview}
                    </p>

                    {/* Provider Routing Chain for this Step */}
                    <div className="mt-3 pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div className="flex flex-wrap items-center gap-2 font-mono">
                        {step.attempts.map((att, idx) => (
                          <React.Fragment key={att.attemptNumber}>
                            {idx > 0 && (
                              <ArrowRight className="w-3.5 h-3.5 text-[#FF6B35]" />
                            )}
                            <span
                              className={
                                att.statusCode === 200
                                  ? 'text-emerald-300 font-medium'
                                  : 'text-[#FF6B35] line-through'
                              }
                            >
                              #{att.attemptNumber} {att.model} ({att.statusCode} ·{' '}
                              {att.latencyMs}ms)
                            </span>
                          </React.Fragment>
                        ))}
                      </div>

                      <span className="text-slate-300 font-mono">
                        Fournisseur résolu :{' '}
                        <strong className="text-white">{step.resolvedProvider}</strong>
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-300">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>
                    Continuité de session garantie : aucune perte d’état d’agent malgré les erreurs amont 429/503.
                  </span>
                </div>
                <div className="flex items-center gap-2 font-mono tabular-nums text-white font-medium">
                  <Activity className="w-3.5 h-3.5 text-[#5D3FD3]" />
                  <span>Latence totale du graphe : {activeWorkflow.totalLatencyMs} ms</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
