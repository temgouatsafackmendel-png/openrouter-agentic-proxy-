/**
 * @license MIT
 * Author: Mendel Temgoua (mendeltemgouabusiness@gmail.com)
 * Explorateur du Dépôt Open-Source GitHub, Commandes Git & Licence MIT (src/components/RepoExplorerView.tsx)
 */

import React, { useState } from 'react';
import {
  Check,
  Copy,
  Download,
  FileCode,
  GitBranch,
  Shield,
  Terminal,
} from 'lucide-react';
import { OPEN_SOURCE_REPO_FILES, RepoFileItem } from '../data/repoFiles';

export const RepoExplorerView: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<RepoFileItem>(
    OPEN_SOURCE_REPO_FILES[0]
  );
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const [githubUsername, setGithubUsername] = useState('mendeltemgoua');
  const [repoName, setRepoName] = useState('openrouter-agentic-proxy');
  const [copiedGitCmd, setCopiedGitCmd] = useState(false);

  const handleCopyFile = (file: RepoFileItem) => {
    navigator.clipboard?.writeText(file.content);
    setCopiedPath(file.path);
    setTimeout(() => setCopiedPath(null), 2000);
  };

  const gitPushScript = `# Initialisation et publication GitHub — Auteur : Mendel Temgoua
git init
git config user.name "Mendel Temgoua"
git config user.email "mendeltemgouabusiness@gmail.com"
git add .
git commit -m "feat: initial release of OpenRouter Agentic Proxy & Dashboard"
git branch -M main
git remote add origin https://github.com/${githubUsername.trim() || 'mendeltemgoua'}/${repoName.trim() || 'openrouter-agentic-proxy'}.git
git push -u origin main`;

  const handleCopyGitScript = () => {
    navigator.clipboard?.writeText(gitPushScript);
    setCopiedGitCmd(true);
    setTimeout(() => setCopiedGitCmd(false), 2200);
  };

  const handleDownloadBundleJson = () => {
    const payload = {
      project: repoName.trim() || 'openrouter-agentic-proxy',
      version: '1.0.0',
      license: 'MIT',
      author: {
        name: 'Mendel Temgoua',
        email: 'mendeltemgouabusiness@gmail.com',
      },
      exportedAt: new Date().toISOString(),
      files: OPEN_SOURCE_REPO_FILES,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${repoName.trim() || 'openrouter-agentic-proxy'}-github-bundle.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 animate-view-enter">
      {/* Top Banner: Author & GitHub Release Assistant */}
      <section className="rounded-2xl glass-panel p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300 font-medium">
              <span>Auteur : Mendel Temgoua</span>
              <span aria-hidden="true">·</span>
              <span>Licence Open Source MIT</span>
              <span aria-hidden="true">·</span>
              <span>Pipeline GitHub Actions CI inclus</span>
            </div>
            <h2 className="font-display text-2xl font-bold text-white mt-1 tracking-tight">
              Prêt à Publier sur votre GitHub ({githubUsername}/{repoName})
            </h2>
            <p className="text-[13px] text-slate-200/90 mt-1 max-w-2xl leading-relaxed">
              Tous les fichiers du dépôt (`LICENSE`, `README.md`, `package.json`, `.github/workflows/ci.yml`, `Dockerfile` et `src/*`) sont signés à votre nom (**Mendel Temgoua**) et prêts pour un `git push`.
            </p>
          </div>

          <button
            type="button"
            onClick={handleDownloadBundleJson}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-xl bg-[#5D3FD3] hover:bg-[#6d4fe3] text-white transition-all cursor-pointer whitespace-nowrap shrink-0 shadow-md shadow-[#5D3FD3]/25"
          >
            <Download className="w-4 h-4" />
            <span>Exporter l’Archive JSON du Dépôt</span>
          </button>
        </div>

        {/* Interactive Git Push Command Generator */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end pt-2 border-t border-white/10">
          <div className="lg:col-span-3">
            <label
              htmlFor="gh-username-input"
              className="block text-xs font-semibold text-slate-200 mb-1.5"
            >
              Identifiant GitHub
            </label>
            <input
              id="gh-username-input"
              type="text"
              value={githubUsername}
              onChange={(e) => setGithubUsername(e.target.value)}
              className="w-full px-3.5 py-2 text-xs font-mono rounded-xl bg-[#0B132B]/90 border border-white/15 text-white focus:outline-none focus:border-[#5D3FD3]"
            />
          </div>

          <div className="lg:col-span-3">
            <label
              htmlFor="gh-repo-input"
              className="block text-xs font-semibold text-slate-200 mb-1.5"
            >
              Nom du Dépôt GitHub
            </label>
            <input
              id="gh-repo-input"
              type="text"
              value={repoName}
              onChange={(e) => setRepoName(e.target.value)}
              className="w-full px-3.5 py-2 text-xs font-mono rounded-xl bg-[#0B132B]/90 border border-white/15 text-white focus:outline-none focus:border-[#5D3FD3]"
            />
          </div>

          <div className="lg:col-span-6 flex items-center justify-between gap-3 glass-subpanel px-4 py-2.5 rounded-xl">
            <div className="flex items-center gap-2.5 min-w-0">
              <GitBranch className="w-4 h-4 text-[#FF6B35] shrink-0" />
              <span className="font-mono text-xs text-slate-200 truncate">
                https://github.com/{githubUsername || 'mendeltemgoua'}/
                {repoName || 'openrouter-agentic-proxy'}.git
              </span>
            </div>
            <button
              type="button"
              onClick={handleCopyGitScript}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#5D3FD3] hover:bg-[#6d4fe3] text-white transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              {copiedGitCmd ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Commandes Copiées</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copier Script Git Push</span>
                </>
              )}
            </button>
          </div>
        </div>

        <pre className="p-4 rounded-xl bg-[#080E21]/95 border border-white/10 text-xs font-mono text-slate-200 overflow-x-auto leading-relaxed">
          <code>{gitPushScript}</code>
        </pre>
      </section>

      {/* File Tree + Code Viewer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-4 rounded-2xl glass-panel p-4 space-y-1.5">
          <div className="px-2 py-1.5 font-display text-xs font-bold text-slate-300 tracking-tight flex items-center justify-between">
            <span>Fichiers du Dépôt ({OPEN_SOURCE_REPO_FILES.length})</span>
            <span className="font-mono text-[11px] text-emerald-400">MIT · v1.0.0</span>
          </div>
          {OPEN_SOURCE_REPO_FILES.map((file) => {
            const isSelected = selectedFile.path === file.path;
            return (
              <button
                key={file.path}
                type="button"
                onClick={() => setSelectedFile(file)}
                className={`w-full text-left px-3.5 py-2.5 rounded-xl transition-all duration-150 flex items-center justify-between gap-2 cursor-pointer ${
                  isSelected
                    ? 'bg-[#5D3FD3] text-white shadow-md shadow-[#5D3FD3]/25'
                    : 'text-slate-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <FileCode className="w-4 h-4 shrink-0" />
                  <span className="font-mono text-xs font-semibold truncate">
                    {file.path}
                  </span>
                </div>
                <span
                  className={`text-[11px] font-mono tabular-nums shrink-0 ${
                    isSelected ? 'text-white/90 font-semibold' : 'text-slate-400'
                  }`}
                >
                  {file.linesCount}L
                </span>
              </button>
            );
          })}

          <div className="mt-4 pt-4 border-t border-white/10 px-2 space-y-2 text-xs text-slate-300">
            <div className="flex items-center gap-2 text-white font-display font-bold">
              <Shield className="w-4 h-4 text-emerald-400" />
              <span>Vérification CI & Tests Unitaires</span>
            </div>
            <div className="flex items-center gap-2 font-mono text-[11px] text-slate-200 bg-[#0B132B] px-3 py-2 rounded-lg border border-white/10">
              <Terminal className="w-3.5 h-3.5 text-[#5D3FD3] shrink-0" />
              <span>npm test && npm run lint</span>
            </div>
          </div>
        </div>

        {/* Code Content Panel */}
        <div
          key={selectedFile.path}
          className="lg:col-span-8 rounded-2xl glass-panel overflow-hidden animate-view-enter"
        >
          <div className="px-6 py-4 border-b border-white/10 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="font-mono text-sm font-bold text-white">
                {selectedFile.path}
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                {selectedFile.description}
              </p>
            </div>

            <button
              type="button"
              onClick={() => handleCopyFile(selectedFile)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-[#0B132B] hover:bg-white/10 text-slate-200 border border-white/15 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              {copiedPath === selectedFile.path ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Code Copié</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copier {selectedFile.path}</span>
                </>
              )}
            </button>
          </div>

          <pre className="p-6 bg-[#080E21]/95 text-xs font-mono text-slate-200 overflow-x-auto leading-relaxed max-h-[540px]">
            <code>{selectedFile.content}</code>
          </pre>
        </div>
      </div>
    </div>
  );
};
