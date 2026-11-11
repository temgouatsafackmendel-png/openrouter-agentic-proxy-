# OpenRouter Agentic Proxy & Dashboard

[![License: MIT](https://img.shields.io/badge/License-MIT-5D3FD3.svg)](./LICENSE)
[![TypeScript Strict](https://img.shields.io/badge/TypeScript-7.0_Strict-0B132B.svg)](./tsconfig.json)
[![OpenRouter API](https://img.shields.io/badge/OpenRouter-v1%2Fchat%2Fcompletions-FF6B35.svg)](https://openrouter.ai)
[![CI Status](https://img.shields.io/badge/CI-Passing-10B981.svg)](./.github/workflows/ci.yml)

Conçu et développé par **Mendel Temgoua** ([mendeltemgouabusiness@gmail.com](mailto:mendeltemgouabusiness@gmail.com)).

> **Passerelle LLM intelligente et résiliente pour OpenRouter**, taillée pour les **agents autonomes et les workflows multi-étapes**.  
> Intercepte les requêtes `/v1/chat/completions`, orchestre automatiquement le *fallback* multi-fournisseurs sur erreurs `429 Rate Limit` / `503 Service Unavailable`, maintient un disjoncteur (*Circuit Breaker*) par fournisseur, impute les coûts à la micro-étape d'agent et intègre un **Dashboard Web temps réel**.

---

## Pourquoi ce projet ?

Lorsqu'un agent autonome exécute une chaîne de 4 à 10 étapes (Planification → Recherche RAG → Génération de code → Audit), un seul `HTTP 429 Too Many Requests` ou `HTTP 503` sur le modèle principal fait échouer l'intégralité du workflow.

**OpenRouter Agentic Proxy & Dashboard** résout ce problème sans modifier la logique métier de vos agents :
1. **Zéro interruption de workflow** : Bascule transparente en moins de 15 ms vers le modèle de secours suivant avec *backoff* exponentiel.
2. **Disjoncteur par fournisseur (*Circuit Breaker*)** : Isolations automatiques des nœuds d'inférence défaillants.
3. **Comptabilité analytique par étape d'agent** : Suivi granulaire via les en-têtes `X-Workflow-Id`, `X-Agent-Id` et `X-Agent-Step`.
4. **Chaos Engineering intégré** : Testez la résilience de vos pipelines d'agents face aux pannes `429`, `503` et `504` directement depuis l'interface ou via l'en-tête `X-Chaos-Mode`.

---

## Architecture Technique

```text
+-------------------------------------------------------------------------+
|                   AGENT AUTONOME / WORKFLOW MULTI-ÉTAPES                |
|  En-têtes : X-Workflow-Id | X-Agent-Id | X-Agent-Step | X-Fallback-Models|
+------------------------------------+------------------------------------+
                                     |
                                     v  POST /v1/chat/completions
+-------------------------------------------------------------------------+
|                     OPENROUTER AGENTIC PROXY (Port 3000)                |
|                                                                         |
|  1. Inspection du Circuit Breaker & Plafond Budgétaire Workflow         |
|  2. Résolution et déduplication de la chaîne de modèles candidats       |
|  3. Exécution avec Backoff Exponentiel Plafonné                         |
|                                                                         |
|     +---> [Essai #1] anthropic/claude-3.7-sonnet  --> 429 Rate Limit    |
|     |     (Bascule automatique + Backoff 400ms)                         |
|     +---> [Essai #2] openai/gpt-4o                --> 200 OK (530ms)    |
|                                                                         |
|  4. Imputation exacte des coûts (Prompt / Completion / Cache Hit)       |
|  5. Journalisation structurée JSON & Diffusion Dashboard Temps Réel     |
+-------------------------------------------------------------------------+
```

---

## Installation & Démarrage Rapide

### Prérequis
- **Node.js** `>= 20.x`
- **npm** `>= 10.x`

### 1. Cloner le dépôt

```bash
git clone https://github.com/mendeltemgoua/openrouter-agentic-proxy.git
cd openrouter-agentic-proxy
cp .env.example .env
npm install
```

### 2. Lancer en mode développement

```bash
npm run dev
# Le proxy et le dashboard sont accessibles sur http://localhost:3000
```

### 3. Exécuter les tests unitaires et la vérification TypeScript

```bash
# Tests unitaires déterministes (node:test)
npm test

# Vérification stricte du typage
npm run lint

# Build de production
npm run build
npm start
```

### 4. Déploiement Docker

```bash
docker build -t openrouter-agentic-proxy:latest .
docker run -p 3000:3000 --env-file .env openrouter-agentic-proxy:latest
```

---

## Référence API

### `POST /v1/chat/completions`

Compatible à 100 % avec le SDK OpenAI et l'API OpenRouter.

#### En-têtes d'orchestration supportés :
| En-tête HTTP | Description | Exemple |
| :--- | :--- | :--- |
| `X-Workflow-Id` | Identifiant du graphe d'exécution multi-étapes | `wf-sec-audit-01` |
| `X-Agent-Id` | Identifiant de l'agent autonome appelant | `sec-auditor-v4` |
| `X-Agent-Step` | Nom de l'étape courante dans le workflow | `2. Analyse CVE` |
| `X-Fallback-Models` | Chaîne prioritaire de modèles de secours | `openai/gpt-4o,deepseek/deepseek-r1` |
| `X-Chaos-Mode` | Simulation d'incident amont (`rate_limit_primary`, `outage_primary_and_secondary`, `timeout_retry`, `none`) | `rate_limit_primary` |

#### Exemple d'appel `cURL` :

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "X-Workflow-Id: wf-sec-audit-01" \
  -H "X-Agent-Id: sec-auditor-v4" \
  -H "X-Agent-Step: 2. Analyse des menaces CVE" \
  -H "X-Fallback-Models: openai/gpt-4o,deepseek/deepseek-r1,google/gemini-2.5-pro" \
  -d '{
    "model": "anthropic/claude-3.7-sonnet",
    "messages": [
      { "role": "system", "content": "Tu es un ingénieur sécurité senior." },
      { "role": "user", "content": "Audite les dépendances et génère le patch." }
    ],
    "temperature": 0.2
  }'
```

---

## Structure du Projet

```text
openrouter-agentic-proxy/
├── .github/workflows/ci.yml   # Pipeline CI GitHub Actions (Lint, Tests, Build)
├── .env.example               # Configuration des clés et seuils de résilience
├── CONTRIBUTING.md            # Guide de contribution Open Source
├── Dockerfile                 # Build multi-stage Node 22 Alpine prêt pour la prod
├── LICENSE                    # Licence MIT (Copyright 2026 Mendel Temgoua)
├── README.md                  # Documentation complète du projet
├── package.json               # Dépendances et scripts npm
├── server.ts                  # Serveur HTTP unifié (Routes Proxy + Dashboard)
└── src/
    ├── index.ts               # Point d'entrée API & normalisation des en-têtes
    ├── proxy.ts               # Moteur de routage, backoff exponentiel & circuit breaker
    ├── proxy.test.ts          # Suite de tests unitaires (node:test)
    ├── types.ts               # Interfaces TypeScript strictes
    ├── logger.ts              # Calculateur de coûts par modèle & logs JSON structurés
    ├── App.tsx                # Dashboard Web temps réel (Style 2026)
    └── components/            # Modules UI (Graphiques SVG, Workflows, Simulateur, Code)
```

---

## Auteur & Licence

- **Auteur :** **Mendel Temgoua** — [mendeltemgouabusiness@gmail.com](mailto:mendeltemgouabusiness@gmail.com)
- **Licence :** Distribué sous licence **MIT**. Consultez le fichier [`LICENSE`](./LICENSE) pour plus de détails.
