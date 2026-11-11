/**
 * @license MIT
 * Graphiques interactifs de consommation de tokens, coûts USD et résilience (src/components/TelemetryCharts.tsx)
 */

import React, { useState } from 'react';
import { TimeSeriesPoint } from '../types';

interface TelemetryChartsProps {
  timeSeries: TimeSeriesPoint[];
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalCostUsd: number;
  estimatedSavingsUsd: number;
}

export const TelemetryCharts: React.FC<TelemetryChartsProps> = ({
  timeSeries,
  totalPromptTokens,
  totalCompletionTokens,
  totalCostUsd,
  estimatedSavingsUsd,
}) => {
  const [chartMode, setChartMode] = useState<'tokens_cost' | 'requests_fallbacks'>('tokens_cost');
  const [activeIndex, setActiveIndex] = useState<number>(
    Math.max(0, timeSeries.length - 1)
  );

  const safeSeries =
    timeSeries.length > 0
      ? timeSeries
      : [
          {
            timeLabel: '10:00',
            requests: 120,
            fallbacks: 4,
            tokensK: 280,
            costUsd: 1.2,
            p95LatencyMs: 580,
          },
        ];

  const maxTokensK = Math.max(...safeSeries.map((d) => d.tokensK), 100);
  const maxCost = Math.max(...safeSeries.map((d) => d.costUsd), 1);
  const maxRequests = Math.max(...safeSeries.map((d) => d.requests), 50);

  const activePoint = safeSeries[activeIndex] ?? safeSeries[safeSeries.length - 1];

  const totalTokens = Math.max(1, totalPromptTokens + totalCompletionTokens);
  const promptPct = Math.round((totalPromptTokens / totalTokens) * 100);
  const completionPct = 100 - promptPct;

  // Build SVG polyline coordinates (viewBox 640 x 210)
  const width = 640;
  const height = 210;
  const padX = 32;
  const padY = 24;
  const usableW = width - padX * 2;
  const usableH = height - padY * 2;

  const pointsPrimary = safeSeries.map((pt, idx) => {
    const x =
      safeSeries.length === 1
        ? width / 2
        : padX + (idx / (safeSeries.length - 1)) * usableW;
    const val = chartMode === 'tokens_cost' ? pt.tokensK : pt.requests;
    const maxV = chartMode === 'tokens_cost' ? maxTokensK : maxRequests;
    const y = padY + usableH - (val / maxV) * usableH;
    return { x, y, pt, idx };
  });

  const pointsSecondary = safeSeries.map((pt, idx) => {
    const x =
      safeSeries.length === 1
        ? width / 2
        : padX + (idx / (safeSeries.length - 1)) * usableW;
    const val = chartMode === 'tokens_cost' ? pt.costUsd : pt.fallbacks * 5;
    const maxV = chartMode === 'tokens_cost' ? maxCost : maxRequests;
    const y = padY + usableH - Math.min(1, val / maxV) * usableH;
    return { x, y };
  });

  const primaryPath = pointsPrimary
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');

  const areaPath =
    pointsPrimary.length > 1
      ? `${primaryPath} L ${pointsPrimary[pointsPrimary.length - 1].x.toFixed(1)} ${(padY + usableH).toFixed(1)} L ${pointsPrimary[0].x.toFixed(1)} ${(padY + usableH).toFixed(1)} Z`
      : '';

  const secondaryPath = pointsSecondary
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');

  const selectedCoord =
    pointsPrimary[activeIndex] ?? pointsPrimary[pointsPrimary.length - 1];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
      {/* Main Time-Series Chart */}
      <div className="lg:col-span-8 rounded-2xl glass-panel p-6 flex flex-col justify-between animate-stagger-1">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
          <div>
            <h2 className="font-display text-xl font-bold text-[#F4F5F7] tracking-tight">
              Dynamique Temporelle des Tokens & Coûts d’Inférence
            </h2>
            <p className="text-[13px] text-slate-300/85 mt-0.5">
              Fenêtre glissante de 40 minutes · Échantillonnage haute précision toutes les 5 min
            </p>
            <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-slate-300 font-mono">
              <span className="inline-flex items-center gap-2">
                <span className="w-4 h-0.5 bg-[#5D3FD3] rounded-full inline-block" />
                <span>
                  {chartMode === 'tokens_cost'
                    ? 'Courbe pleine : Volume Tokens (k)'
                    : 'Courbe pleine : Requêtes traitées'}
                </span>
              </span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-2">
                <span className="w-4 h-0.5 border-t-2 border-dashed border-[#FF6B35] inline-block" />
                <span>
                  {chartMode === 'tokens_cost'
                    ? 'Pointillés : Coût USD ($)'
                    : 'Pointillés : Bascules 429/503 (×5)'}
                </span>
              </span>
            </div>
          </div>

          <div
            className="flex items-center gap-1 p-1 rounded-xl bg-[#0B132B]/90 border border-white/10"
            role="group"
            aria-label="Sélecteur de métrique graphique"
          >
            <button
              type="button"
              onClick={() => setChartMode('tokens_cost')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all duration-150 whitespace-nowrap shrink-0 cursor-pointer ${
                chartMode === 'tokens_cost'
                  ? 'bg-[#5D3FD3] text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Tokens & Coûts USD
            </button>
            <button
              type="button"
              onClick={() => setChartMode('requests_fallbacks')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all duration-150 whitespace-nowrap shrink-0 cursor-pointer ${
                chartMode === 'requests_fallbacks'
                  ? 'bg-[#5D3FD3] text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Trafic & Bascules 429/503
            </button>
          </div>
        </div>

        {/* SVG Interactive Chart */}
        <div className="relative">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-56 overflow-visible"
            role="img"
            aria-label="Graphique d'évolution du trafic et des coûts OpenRouter"
          >
            <defs>
              <linearGradient id="violetAreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#5D3FD3" stopOpacity="0.48" />
                <stop offset="65%" stopColor="#5D3FD3" stopOpacity="0.14" />
                <stop offset="100%" stopColor="#5D3FD3" stopOpacity="0.0" />
              </linearGradient>
              <filter id="glowLine" x="-10%" y="-10%" width="120%" height="120%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {/* Horizontal reference lines */}
            {[0, 0.5, 1].map((ratio, idx) => {
              const y = padY + ratio * usableH;
              return (
                <line
                  key={idx}
                  x1={padX}
                  y1={y}
                  x2={width - padX}
                  y2={y}
                  stroke="rgba(255,255,255,0.07)"
                  strokeDasharray="4 4"
                />
              );
            })}

            {/* Active vertical crosshair guide */}
            {selectedCoord && (
              <line
                x1={selectedCoord.x}
                y1={padY}
                x2={selectedCoord.x}
                y2={padY + usableH}
                stroke="rgba(255, 107, 53, 0.35)"
                strokeWidth="1.5"
                strokeDasharray="3 3"
              />
            )}

            {areaPath && (
              <path
                key={`area-${chartMode}`}
                d={areaPath}
                fill="url(#violetAreaGrad)"
                className="transition-opacity duration-300"
              />
            )}

            <path
              key={`primary-${chartMode}`}
              d={primaryPath}
              fill="none"
              stroke="#5D3FD3"
              strokeWidth="3"
              filter="url(#glowLine)"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="animate-svg-curve"
            />

            <path
              key={`secondary-${chartMode}`}
              d={secondaryPath}
              fill="none"
              stroke="#FF6B35"
              strokeWidth="2.25"
              strokeDasharray="5 4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {pointsPrimary.map((p) => {
              const isSelected = p.idx === activeIndex;
              return (
                <g
                  key={p.pt.timeLabel}
                  className="cursor-pointer"
                  onClick={() => setActiveIndex(p.idx)}
                  onMouseEnter={() => setActiveIndex(p.idx)}
                >
                  {isSelected && (
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={11}
                      fill="rgba(255, 107, 53, 0.22)"
                    />
                  )}
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={isSelected ? 6 : 4.2}
                    fill={isSelected ? '#FF6B35' : '#5D3FD3'}
                    stroke="#0B132B"
                    strokeWidth="2"
                  />
                  <text
                    x={p.x}
                    y={height - 2}
                    textAnchor="middle"
                    className={`text-[11px] font-mono transition-colors ${
                      isSelected ? 'fill-white font-semibold' : 'fill-slate-400'
                    }`}
                  >
                    {p.pt.timeLabel}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Selected Point Inspection Bar */}
        <div className="mt-4 pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex flex-wrap items-center gap-3 text-slate-300">
            <span className="font-mono text-white font-semibold">
              Fenêtre {activePoint.timeLabel}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Débit :{' '}
              <strong className="font-mono tabular-nums text-white">
                {activePoint.tokensK}k tokens
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Facturation :{' '}
              <strong className="font-mono tabular-nums text-[#FF6B35]">
                ${activePoint.costUsd.toFixed(2)}
              </strong>
            </span>
          </div>
          <div className="flex items-center gap-3 text-slate-300 font-mono tabular-nums">
            <span>{activePoint.requests} appels</span>
            <span aria-hidden="true">·</span>
            <span className="text-[#FF6B35] font-medium">
              {activePoint.fallbacks} bascules auto
            </span>
            <span aria-hidden="true">·</span>
            <span>P95 {activePoint.p95LatencyMs} ms</span>
          </div>
        </div>
      </div>

      {/* Right Column: Cost & Token Split Breakdown */}
      <div className="lg:col-span-4 rounded-2xl glass-panel p-6 flex flex-col justify-between animate-stagger-2">
        <div>
          <h2 className="font-display text-xl font-bold text-[#F4F5F7] tracking-tight">
            Structure de Consommation
          </h2>
          <p className="text-[13px] text-slate-300/85 mt-0.5">
            Équilibre Contexte d’Entrée vs Raisonnement Agentique
          </p>

          <div className="mt-6 space-y-5">
            <div>
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="text-slate-200 font-medium">
                  Tokens de Prompt (Contexte & Outils)
                </span>
                <span className="font-mono tabular-nums text-white font-semibold">
                  {totalPromptTokens.toLocaleString('fr-FR')} ({promptPct}%)
                </span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-[#0B132B] border border-white/5 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#5D3FD3] to-[#7c62eb] rounded-full transition-all duration-300"
                  style={{ width: `${promptPct}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="text-slate-200 font-medium">
                  Tokens de Complétion (Synthèse & Code)
                </span>
                <span className="font-mono tabular-nums text-white font-semibold">
                  {totalCompletionTokens.toLocaleString('fr-FR')} ({completionPct}%)
                </span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-[#0B132B] border border-white/5 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#FF6B35] to-[#ff8c61] rounded-full transition-all duration-300"
                  style={{ width: `${completionPct}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 pt-5 border-t border-white/10 space-y-3">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-medium text-slate-300">
              Engagement financier cumulé
            </span>
            <span className="font-display font-mono tabular-nums text-2xl font-bold text-white">
              ${totalCostUsd.toFixed(4)}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-300/80">
              Gain net (Cache sémantique & bascule tarifaire)
            </span>
            <span className="font-mono tabular-nums text-emerald-400 font-semibold">
              +${estimatedSavingsUsd.toFixed(4)}
            </span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed pt-1">
            Imputation analytique temps réel indexée sur les barèmes par million de tokens d’OpenRouter.
          </p>
        </div>
      </div>
    </div>
  );
};
