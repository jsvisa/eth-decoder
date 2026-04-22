# Testing & CI Design

**Date:** 2026-04-22  
**Project:** EVM Transaction Decoder (Next.js 15, React 19, JavaScript)

## Goals

- Catch regressions in business logic (validation, ABI caching, address book)
- Catch regressions in API route behavior (proxy detection, fallback logic, error handling)
- Catch UI/flow regressions on the main pages
- Run automatically on every push and pull request via GitHub Actions

## Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Unit/API test runner | Vitest | ESM-native, no Babel config needed, fast |
| E2E runner | Playwright | Already in devDependencies |
| External HTTP in API tests | Record & replay (JSON fixtures) | Deterministic, no live API keys in CI |
| CI blocking strategy | Unit + API integration block; E2E advisory | E2E flakiness without live backend/keys |

## Directory Structure

```
decoder/
├── tests/
│   ├── unit/
│   │   ├── validation.test.js
│   │   ├── abiCache.test.js
│   │   └── addressBook.test.js
│   ├── api/
│   │   ├── __fixtures__/
│   │   │   ├── etherscan-erc20.json
│   │   │   ├── etherscan-proxy.json
│   │   │   └── sourcify-fallback.json
│   │   ├── fetch-abi.test.js
│   │   ├── decode.test.js
│   │   └── call-contract.test.js
│   └── e2e/
│       ├── decoder.spec.js
│       ├── contract-caller.spec.js
│       └── address-book.spec.js
├── vitest.config.js
└── playwright.config.js
```

## New npm Scripts

```json
"test":          "vitest run",
"test:watch":    "vitest",
"test:coverage": "vitest run --coverage",
"test:e2e":      "playwright test"
```

## New Dependencies

```
vitest                  — test runner
@vitest/coverage-v8     — coverage reports
jsdom                   — DOM environment for localStorage-dependent tests
wait-on                 — wait for localhost:3000 before running E2E in CI
```

Playwright (`@playwright/test`) is already in devDependencies.

## Layer 1: Unit Tests

Environment: `jsdom` (needed for `localStorage` in abiCache and addressBook).

### `tests/unit/validation.test.js`

Tests `isValidEthAddress`, `isValidForkBlock`, `isValidNumber`, `isValidPositiveInteger` from `app/utils/validation.js`.

Cases:
- `isValidEthAddress`: valid lowercase, valid checksummed, missing `0x`, too short, empty string, null
- `isValidForkBlock`: empty string (valid), `"latest"` (valid), digit string (valid), negative number (invalid), non-numeric string (invalid)
- `isValidNumber`: empty (valid), integer, decimal, negative, non-numeric string
- `isValidPositiveInteger`: empty (valid), positive integer, negative, decimal, string

### `tests/unit/abiCache.test.js`

Tests cache key generation and localStorage round-trips from `app/utils/abiCache.js`.

Cases:
- `getAbiCacheKey` produces correct `abi-{chain}-{address}` format with lowercased address
- `setCachedAbi` + `getCachedAbi` round-trip returns stored ABI and metadata
- `getCachedAbi` returns null for missing keys
- `buildAbiCacheFromStorage` returns only entries matching the requested chain
- `buildAbiCacheFromStorage` skips malformed/unparseable entries

### `tests/unit/addressBook.test.js`

Tests CRUD and CSV import/export from `app/utils/addressBook.js`.

Cases:
- `addToAddressBook`: adds a valid entry, rejects duplicate address, rejects invalid address
- `getAddressBook`: returns empty array when localStorage is empty
- `removeFromAddressBook`: removes by entry id, no-op on unknown id
- CSV export: produces correct header row and data rows
- CSV import: parses valid CSV, skips rows with invalid addresses, handles empty file

## Layer 2: API Integration Tests

Environment: Node (no DOM). Each test imports the route handler function directly and stubs `global.fetch` with `vi.fn()` returning fixture JSON loaded from `tests/api/__fixtures__/`.

### Fixtures

| File | Content |
|------|---------|
| `etherscan-erc20.json` | Etherscan V2 `getsourcecode` response for a standard ERC-20 (verified, not proxy) |
| `etherscan-proxy.json` | Etherscan V2 response for an EIP-1967 proxy contract |
| `sourcify-fallback.json` | Sourcify `/files/any/{chainId}/{address}` response |

Fixtures are recorded once from live APIs and committed. Re-record when API response shapes change.

### `tests/api/fetch-abi.test.js`

Tests `app/api/fetch-abi/route.js`.

Cases:
- Returns 400 when `address` param is missing
- Returns 400 when `address` is not a valid Ethereum address
- Returns ABI from Etherscan for a verified non-proxy contract
- Falls back to Sourcify when Etherscan returns unverified (`ABI === 'Contract source code not verified'`)
- Detects EIP-1967 proxy: fetches implementation slot via `getStorageAt`, fetches implementation ABI, merges and returns combined ABI with `isProxy: true`
- Returns 500 when both Etherscan and Sourcify fail

### `tests/api/decode.test.js`

Tests `app/api/decode/route.js`.

Cases:
- Returns 400 when `data` param is missing
- Returns 500 when `BACKEND_URL` env var is not set
- Forwards `data`, `multicall`, `with_abi`, `with_sign` params to the backend URL
- Returns parsed JSON from backend on success
- Returns 500 with error message when backend returns non-OK status

### `tests/api/call-contract.test.js`

Tests `app/api/call-contract/route.js`.

Cases:
- Resolves chain by name (`ethereum`, `base`, etc.)
- Resolves chain by numeric chain ID
- Returns 400 for missing required params (address, abi, functionName, chain)
- Returns decoded result on successful RPC call
- Returns 500 on RPC error

## Layer 3: E2E Tests

Environment: Chromium via Playwright. Runs against `npm run build && npm run start` (production build on localhost:3000). No `BACKEND_URL` is set in CI — the decode page will show an error state, which is itself tested.

E2E tests that require live API keys (Etherscan, Tenderly) use `test.skip` when `process.env.CI === 'true'`.

### `tests/e2e/decoder.spec.js`

- Page loads and shows the decode input form
- Entering valid hex data and submitting shows a result container or a meaningful error (not a crash)
- Entering invalid data shows a validation error

### `tests/e2e/contract-caller.spec.js`

- Page loads and shows the chain selector
- Chain selector contains the built-in chains (Ethereum, Arbitrum, Base, Polygon, BSC)
- Address input field accepts a valid Ethereum address

### `tests/e2e/address-book.spec.js`

- Page loads and shows the address book UI
- Adding an address + label causes the entry to appear in the list
- Deleting the entry removes it from the list

## CI Workflow

File: `.github/workflows/ci.yml`

```yaml
on:
  push:
  pull_request:

jobs:
  test:
    name: Unit & API Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run test:coverage
      - uses: actions/upload-artifact@v4
        with:
          name: coverage
          path: coverage/

  e2e:
    name: E2E Tests (advisory)
    runs-on: ubuntu-latest
    needs: test
    continue-on-error: true
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run build
      - run: npm run start &
      - run: npx wait-on http://localhost:3000
      - run: npm run test:e2e
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
```

`wait-on` is used to wait for the dev server before running Playwright. It will be added as a devDependency.

## Out of Scope

- `tevmSimulator.js` — ~36KB of in-browser EVM logic; integration testing requires a forked chain state and is not included in this phase
- `simulate/route.js` — depends on live Tenderly API; not included
- `get-logs/route.js` — depends on live Etherscan; not included in this phase
