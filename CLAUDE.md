# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

EVM transaction decoder and smart contract interaction tool. Built with Next.js (App Router) and deployed on Vercel. The frontend decodes EVM tx input data via a backend proxy and allows calling/simulating smart contract functions across multiple EVM chains.

## Commands

```bash
npm run dev      # Start dev server (http://localhost:3000)
npm run build    # Production build
npm run start    # Start production server
npm run lint     # ESLint via next lint
npm test         # Vitest unit + API tests (vitest run)
npm run test:watch    # Vitest in watch mode
npm run test:coverage # Vitest with v8 coverage
npm run test:e2e      # Playwright end-to-end tests
```

## Test Framework

**Vitest** for unit and API tests; **Playwright** for e2e.

```
tests/
  unit/   # jsdom environment — pure utils (abiCache, addressBook, normalizeArg, tevmSimulator, validation, ...)
  api/    # node environment — Next.js route handlers (call-contract, simulate, decode, fetch-abi, ...)
  e2e/    # Playwright — full browser flows (decoder, contract-caller, address-book)
```

API tests import route handlers directly and mock `global.fetch` via `vi.stubGlobal` to intercept RPC/external calls without a running server.

## Environment Variables

Copy `.env.example` to `.env.local`. Required:

- `BACKEND_URL` - Backend API endpoint for transaction decoding (proxied through `/api/decode`)

User-provided API keys (stored in browser localStorage, not in env):

- Etherscan API key (for ABI fetching from block explorers)
- Tenderly credentials (access key, account slug, project slug) for write function simulation

## Architecture

### Tech Stack

- **Next.js 15 / React 19** (JavaScript, no TypeScript)
- **viem** - EVM ABI encoding/decoding, RPC calls, chain definitions
- **tevm** - Local EVM simulation (in-browser fork of chain state)
- **js-yaml** - YAML output formatting
- **CSS Modules** - All styling (no Tailwind, no CSS-in-JS)

### Routing (App Router)

| Route              | Page                          | Purpose                                                 |
| ------------------ | ----------------------------- | ------------------------------------------------------- |
| `/`                | `app/page.js`                 | Transaction decoder - hex input, decode via backend API |
| `/contract-caller` | `app/contract-caller/page.js` | Contract interaction UI (~1500 lines, largest file)     |
| `/address-book`    | `app/address-book/page.js`    | Manage saved addresses with CSV import/export           |
| `/contracts`       | `app/contracts/page.js`       | Browse cached contract ABIs across chains               |

### API Routes (server-side, under `app/api/`)

| Route                | Method | Purpose                                                                                                                                        |
| -------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/decode`        | GET    | Proxies to `BACKEND_URL/api/v1/decode` - hides backend from client                                                                             |
| `/api/fetch-abi`     | GET    | Fetches ABI from Etherscan V2 API, falls back to Sourcify. Detects proxy contracts (EIP-1967, beacon, OZ legacy) and merges implementation ABI |
| `/api/call-contract` | POST   | Executes read-only contract calls via RPC using viem                                                                                           |
| `/api/simulate`      | POST   | Simulates write functions via Tenderly API, returns decoded logs/traces/state changes                                                          |
| `/api/get-logs`      | GET    | Fetches event logs from Etherscan V2 API                                                                                                       |

### Client-side Simulation (tevm)

`app/utils/tevmSimulator.js` provides an alternative to Tenderly simulation using tevm's in-browser EVM. Creates a memory client that forks chain state at a specific block, supports cheatcodes (deal, prank, warp), and decodes event logs using cached ABIs from multiple contracts.

### State Management

All state is React `useState` hooks + `localStorage`. No external state library. Key localStorage keys:

- `evm_decoder_history` - Recent decode history
- `contract_caller_history` - Recent contract call history
- `abi-{chain}-{address}` - Cached contract ABIs
- `address_book` - Saved addresses
- `tenderly_settings`, `api_keys_settings`, `rpc_settings`, `simulation_settings`, `custom_chains` - User settings

### Shared Utilities (`app/utils/`)

- **`validation.js`** - Ethereum address and number validators
- **`addressBook.js`** - localStorage CRUD for address book with CSV import/export
- **`abiCache.js`** - ABI caching layer over localStorage; batch-fetch ABIs for multiple addresses
- **`tevmSimulator.js`** - In-browser EVM simulation with tevm, including log decoding across multiple contracts

### Supported Chains

Built-in: Ethereum (1), Arbitrum (42161), Base (8453), Polygon (137), BSC (56). Custom chains can be added by users with an RPC URL and chain ID.

### Key Patterns

- Chain configs are duplicated across files (`fetch-abi/route.js`, `call-contract/route.js`, `simulate/route.js`, `tevmSimulator.js`, `contract-caller/page.js`, `contracts/page.js`). Each has its own `CHAINS`/`RPC_URLS`/`CHAIN_IDS` mapping.
- Proxy detection in `fetch-abi/route.js` checks EIP-1967 implementation slot, beacon slot, and OZ legacy slot via `getStorageAt`.
- All pages are client components (`'use client'`). The only server components are the layout and API routes.
- The `contract-caller/page.js` is a monolithic component handling ABI display, function selection, argument input, read/write execution, result display, event log rendering, call trace visualization, and history management.
