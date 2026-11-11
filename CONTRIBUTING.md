# Guide de Contribution — OpenRouter Agentic Proxy & Dashboard

Merci de votre intérêt pour **OpenRouter Agentic Proxy & Dashboard**, un projet open source créé et maintenu par **Mendel Temgoua**.

## Processus de Contribution

1. **Forkez** le dépôt sur GitHub.
2. Créez une branche dédiée pour votre fonctionnalité ou correctif :
   ```bash
   git checkout -b feat/nom-de-votre-fonctionnalite
   ```
3. Assurez-vous que les tests unitaires et le linter TypeScript passent :
   ```bash
   npm test
   npm run lint
   npm run build
   ```
4. Commitez vos changements en suivant la convention *Conventional Commits* (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`).
5. Ouvrez une **Pull Request** détaillée décrivant le scénario testé.

## Standards de Qualité
- **TypeScript Strict** : Aucun type `any` implicite ; toutes les interfaces de routage et de télémétrie résident dans `src/types.ts`.
- **Tests déterministes** : Toute modification de `src/proxy.ts` ou `src/logger.ts` doit être couverte dans `src/proxy.test.ts` via `node:test`.
