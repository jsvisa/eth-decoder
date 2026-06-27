# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

See README.md for project overview, features, API keys, and ABI resolution details.

## Commands

```bash
npm run dev           # Start dev server (http://localhost:3000)
npm run build         # Production build
npm run lint          # ESLint
npm run format        # Prettier format — run after any code changes
npm test              # Vitest unit + API tests (vitest run)
npm run test:watch    # Vitest in watch mode
npm run test:coverage # Vitest with v8 coverage
./scripts/run-e2e.sh  # Full E2E: sets up abi_server, builds, runs Playwright
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

**Vitest** for unit and API tests; **Playwright** for e2e.

```
tests/
  unit/   # jsdom environment — pure utils
  api/    # node environment — Next.js route handlers
  e2e/    # Playwright — full browser flows
```

API tests import route handlers directly and mock `global.fetch` via `vi.stubGlobal` to intercept RPC/external calls — no running server required.

## State

All state is React `useState` + `localStorage`. No external state library. Keys:

- `evm_decoder_history`, `contract_caller_history` — recent activity
- `abi-{chain}-{address}` — cached contract ABIs
- `address_book` — saved addresses
- `tenderly_settings`, `api_keys_settings`, `rpc_settings`, `simulation_settings`, `custom_chains` — user settings

## Key Patterns (Footguns)

- **Chain configs are consolidated** in `app/utils/chains.js` — exports `CHAINS`, `BUILT_IN_CHAIN_IDS`, `DEFAULT_RPC_URLS`, `VIEM_CHAINS`, `getChainConfig()`, and more. Always import from here; don't redeclare locally.
- **Proxy detection** in `fetch-abi/route.js` checks EIP-1967 implementation slot, beacon slot, and OZ legacy slot via `getStorageAt`.
- **All pages are client components** (`'use client'`). Only the layout and API routes are server components.
- **`contract-caller/page.js` is a thin orchestrator** (~400 lines) that composes hooks and components. Logic lives in `hooks/`, presentational rendering in `components/`. Don't inline state or effects into `page.js`.
- **`contract-caller` layout** uses `main > div.container` (card, max-width 1200px) with `h1 "Contract Caller"` and a `div.form` flex column. First row is `div.row` with `div.networkField` (Network label + selector) and `ContractAddressInput` side by side. Match this pattern for new top-level sections.
- **`ResultPanel`** (`components/ResultPanel.js`, ~1200 lines) handles all simulation result rendering. Don't split without explicit instruction.
