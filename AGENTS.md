# AGENTS.md

Guidance for AI coding agents working in this repository.

See README.md for project overview, features, API keys, public API docs, and ABI resolution details.

## Commands

```bash
npm run dev           # Start dev server (http://localhost:3000)
npm run build         # Production build
npm run start         # Start production build
npm run lint          # ESLint (app + tests)
npm run format        # Prettier format — run after any code changes
npm test              # Vitest unit + API tests (vitest run)
npm run test:watch    # Vitest in watch mode
npm run test:coverage # Vitest with v8 coverage
npm run test:e2e      # Playwright e2e only
./scripts/run-e2e.sh  # Full E2E: builds and starts Next.js, runs Playwright
```

**After any code change, always run:**

```bash
npm run format && npm run lint && npm test && ./scripts/run-e2e.sh
```

## Tech Stack

- **Next.js 16 / React 19** — **JavaScript, no TypeScript**
- **CSS Modules** — no Tailwind, no CSS-in-JS
- **viem** — EVM ABI encoding/decoding, RPC calls, chain definitions
- **tevm** — in-browser EVM simulation (forks chain state client-side)
- **js-yaml** — YAML output formatting

## Test Framework

**Vitest** for unit and API tests; **Playwright** for e2e. Vitest uses two projects (`unit` and `api`), configured in `vitest.config.js`.

```
tests/
  unit/   # jsdom environment — pure utils + React components
  api/    # node environment — Next.js route handlers
  e2e/    # Playwright — full browser flows
```

API tests import route handlers directly and mock `global.fetch` via `vi.stubGlobal` to intercept RPC/external calls — no running server required.

## State

All client state is React `useState` + `localStorage`. No external state library. Keys:

- `evm_decoder_history`, `evm_event_decoder_history`, `contract_caller_history` — recent activity
- `abi-{chain}-{address}` — cached contract ABIs
- `address_book` — saved addresses
- `api_keys_settings`, `rpc_settings`, `simulation_settings`, `custom_chains`, `theme_preference` — user settings

Server-side caches: ABI/signature caches live under `app/utils/serverAbiCache.js` / `serverSigCache.js`; simulation results persist via Vercel Blob in production and the local filesystem in development (`simulationCache.js`, `serverCacheDir.js`).

## Public API

The app exposes a versioned public API under `app/api/v1/` (`decode`, `decode-event`, `fetch-abi`, `query`), documented in README.md. Non-versioned handlers under `app/api/` back the UI.

## Key Patterns (Footguns)

- **Chain configs are consolidated** in `app/utils/chains.js` — exports `CHAINS`, `BUILT_IN_CHAIN_IDS`, `DEFAULT_RPC_URLS`, `VIEM_CHAINS`, `getChainConfig()`, and more. Always import from here; don't redeclare locally.
- **Proxy detection** in `fetch-abi/route.js` checks EIP-1967 implementation slot, EIP-1967 beacon slot, and OpenZeppelin legacy slot via `getStorageAt`.
- **All pages are client components** (`'use client'`). Only the layout and API routes are server components.
- **`contract-caller/page.js` is a thin orchestrator** (~900 lines) that composes hooks and components. Logic lives in `hooks/`, presentational rendering in `components/`. Don't inline state or effects into `page.js`.
- **`contract-caller` layout** uses `main > div.container` (card, max-width 1200px) with `h1 "Contract Caller"` and a `div.form` flex column. First row is `div.row` with `div.networkField` (Network label + selector) and `ContractAddressInput` side by side. Match this pattern for new top-level sections.
- **`ResultPanel`** (`components/ResultPanel.js`, ~1100 lines) handles all simulation result rendering. Don't split without explicit instruction.

## Git Worktrees

Create a worktree on a new branch from `main`:

```bash
git worktree add -b <branch-name> .worktrees/<branch-name> main
```

This creates the branch and worktree at `.worktrees/<branch-name>`. Work inside that directory, then remove it when done:

```bash
git worktree remove .worktrees/<branch-name>
```

The worktree shares `.git` and `node_modules` with the parent repo, so `npm` commands work directly inside it.
