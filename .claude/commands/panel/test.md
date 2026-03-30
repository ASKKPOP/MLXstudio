# /panel/test — Panel: Run Tests

Run the Electron/React test suite (Vitest).

## Usage
`/panel/test $ARGUMENTS`

## Commands
```bash
cd panel

# Run all tests once
npm run test

# Watch mode (re-runs on file changes)
npm run test:watch

# TypeScript type check (no emit)
npm run typecheck

# Linting
npm run lint

# Code formatting
npm run format
```

## Test Framework
- **Vitest** — Vite-native test runner
- Config: `panel/vitest.config.ts`
- 1545+ TypeScript tests

## Test Location
```
panel/src/renderer/src/__tests__/    Unit tests for React components
panel/src/main/__tests__/            Main process tests
panel/src/shared/__tests__/          Shared utility tests
```

## Running Specific Tests
```bash
# Single file
npx vitest run src/renderer/src/__tests__/ChatInterface.test.tsx

# Pattern match
npx vitest run --reporter=verbose --testNamePattern="chat"

# With coverage
npx vitest run --coverage
```

## Key Things to Test
| Component | Test File |
|-----------|-----------|
| Chat interface | `__tests__/ChatInterface.test.tsx` |
| Session management | `__tests__/SessionDashboard.test.tsx` |
| IPC handlers | `__tests__/ipc/chat.test.ts` |
| Model config | `__tests__/model-config-registry.test.ts` |
| Database | `__tests__/database.test.ts` |
| API utilities | `__tests__/lib/utils.test.ts` |

## TypeScript Checks
```bash
# Check for type errors without building
npm run typecheck
# Equivalent to: tsc --noEmit
```

## Linting Rules
- ESLint with TypeScript plugin
- React hooks rules
- Config: `panel/.eslintrc.js` or `panel/eslint.config.js`
