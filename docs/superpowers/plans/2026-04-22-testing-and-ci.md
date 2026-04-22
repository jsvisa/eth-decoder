# Testing & CI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a layered test suite (unit + API integration + E2E) and a GitHub Actions CI workflow that blocks PRs on unit/API failures and runs E2E as advisory.

**Architecture:** Vitest handles unit and API integration tests with jsdom for localStorage-dependent code and JSON fixtures for external HTTP mocking. Playwright (already installed) handles E2E against a built production server. GitHub Actions runs both in sequence with E2E marked `continue-on-error: true`.

**Tech Stack:** Vitest, @vitest/coverage-v8, jsdom, wait-on, Playwright, GitHub Actions

---

## File Map

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `vitest.config.js` | Vitest config — jsdom for unit, node for api |
| Modify | `package.json` | Add test scripts and devDependencies |
| Create | `tests/unit/validation.test.js` | Unit tests for `app/utils/validation.js` |
| Create | `tests/unit/abiCache.test.js` | Unit tests for `app/utils/abiCache.js` |
| Create | `tests/unit/addressBook.test.js` | Unit tests for `app/utils/addressBook.js` |
| Create | `tests/api/__fixtures__/etherscan-erc20.json` | Etherscan response: verified non-proxy ERC-20 |
| Create | `tests/api/__fixtures__/etherscan-unverified.json` | Etherscan response: unverified contract |
| Create | `tests/api/__fixtures__/etherscan-proxy.json` | Etherscan response: proxy contract (Proxy=1) |
| Create | `tests/api/__fixtures__/etherscan-impl.json` | Etherscan response: implementation contract |
| Create | `tests/api/__fixtures__/sourcify-check.json` | Sourcify check-by-addresses response |
| Create | `tests/api/__fixtures__/sourcify-files.json` | Sourcify files response with metadata.json |
| Create | `tests/api/decode.test.js` | API integration tests for `/api/decode` |
| Create | `tests/api/fetch-abi.test.js` | API integration tests for `/api/fetch-abi` |
| Create | `tests/api/call-contract.test.js` | API integration tests for `/api/call-contract` |
| Create | `playwright.config.js` | Playwright E2E config |
| Create | `tests/e2e/decoder.spec.js` | E2E: homepage decode flow |
| Create | `tests/e2e/contract-caller.spec.js` | E2E: contract-caller page |
| Create | `tests/e2e/address-book.spec.js` | E2E: address book CRUD |
| Create | `.github/workflows/ci.yml` | GitHub Actions: unit+api blocking, e2e advisory |

---

### Task 1: Install dependencies and create Vitest config

**Files:**
- Modify: `package.json`
- Create: `vitest.config.js`

- [ ] **Step 1: Install Vitest and related devDependencies**

```bash
npm install --save-dev vitest @vitest/coverage-v8 jsdom wait-on
```

Expected: `package.json` devDependencies now includes `vitest`, `@vitest/coverage-v8`, `jsdom`, `wait-on`.

- [ ] **Step 2: Add test scripts to package.json**

In `package.json`, add to the `"scripts"` block:

```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage",
"test:e2e": "playwright test"
```

The full scripts block should look like:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage",
  "test:e2e": "playwright test"
}
```

- [ ] **Step 3: Create vitest.config.js**

```js
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    passWithNoTests: true,
    environmentMatchGlobs: [
      ['tests/unit/**', 'jsdom'],
      ['tests/api/**', 'node'],
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['app/utils/**', 'app/api/**'],
    },
  },
})
```

- [ ] **Step 4: Verify Vitest starts without errors**

```bash
npm test
```

Expected output ends with something like:
```
Test Files  0 passed (0)
Tests       0 passed (0)
```
Exit code 0 (passWithNoTests: true).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.js
git commit -m "chore(test): install vitest and configure test runner"
```

---

### Task 2: Unit tests — validation.js

**Files:**
- Create: `tests/unit/validation.test.js`
- Read: `app/utils/validation.js` (source under test)

- [ ] **Step 1: Create the test file**

```bash
mkdir -p tests/unit
```

Write `tests/unit/validation.test.js`:

```js
import { describe, it, expect } from 'vitest'
import {
  isValidEthAddress,
  isValidForkBlock,
  isValidNumber,
  isValidPositiveInteger,
} from '../../app/utils/validation.js'

describe('isValidEthAddress', () => {
  it('accepts a valid lowercase address', () => {
    expect(isValidEthAddress('0xabcdef1234567890abcdef1234567890abcdef12')).toBe(true)
  })

  it('accepts a checksummed address', () => {
    expect(isValidEthAddress('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48')).toBe(true)
  })

  it('rejects an address missing the 0x prefix', () => {
    expect(isValidEthAddress('abcdef1234567890abcdef1234567890abcdef12')).toBe(false)
  })

  it('rejects an address that is too short', () => {
    expect(isValidEthAddress('0x1234')).toBe(false)
  })

  it('rejects an empty string', () => {
    expect(isValidEthAddress('')).toBe(false)
  })

  it('rejects null', () => {
    expect(isValidEthAddress(null)).toBe(false)
  })
})

describe('isValidForkBlock', () => {
  it('accepts an empty string (means latest)', () => {
    expect(isValidForkBlock('')).toBe(true)
  })

  it('accepts null and undefined', () => {
    expect(isValidForkBlock(null)).toBe(true)
    expect(isValidForkBlock(undefined)).toBe(true)
  })

  it('accepts "latest" (case-insensitive)', () => {
    expect(isValidForkBlock('latest')).toBe(true)
    expect(isValidForkBlock('LATEST')).toBe(true)
  })

  it('accepts a positive integer string', () => {
    expect(isValidForkBlock('12345678')).toBe(true)
  })

  it('rejects a negative number string', () => {
    expect(isValidForkBlock('-1')).toBe(false)
  })

  it('rejects a non-numeric string', () => {
    expect(isValidForkBlock('abc')).toBe(false)
  })
})

describe('isValidNumber', () => {
  it('accepts an empty string', () => {
    expect(isValidNumber('')).toBe(true)
  })

  it('accepts an integer string', () => {
    expect(isValidNumber('42')).toBe(true)
  })

  it('accepts a decimal string', () => {
    expect(isValidNumber('3.14')).toBe(true)
  })

  it('accepts a negative number string', () => {
    expect(isValidNumber('-7.5')).toBe(true)
  })

  it('rejects a non-numeric string', () => {
    expect(isValidNumber('abc')).toBe(false)
  })
})

describe('isValidPositiveInteger', () => {
  it('accepts an empty string', () => {
    expect(isValidPositiveInteger('')).toBe(true)
  })

  it('accepts a positive integer string', () => {
    expect(isValidPositiveInteger('100')).toBe(true)
  })

  it('rejects a negative string', () => {
    expect(isValidPositiveInteger('-1')).toBe(false)
  })

  it('rejects a decimal string', () => {
    expect(isValidPositiveInteger('1.5')).toBe(false)
  })

  it('rejects a non-numeric string', () => {
    expect(isValidPositiveInteger('abc')).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests and verify all pass**

```bash
npm test
```

Expected:
```
✓ tests/unit/validation.test.js (14)
Test Files  1 passed (1)
Tests       14 passed (14)
```

- [ ] **Step 3: Commit**

```bash
git add tests/unit/validation.test.js
git commit -m "test(unit): add validation utility tests"
```

---

### Task 3: Unit tests — abiCache.js

**Files:**
- Create: `tests/unit/abiCache.test.js`
- Read: `app/utils/abiCache.js` (source under test)

Key behavior to know:
- `getAbiCacheKey(chain, address)` → `"abi-{chain}-{address.toLowerCase()}"`
- `setCachedAbi` / `getCachedAbi` round-trip through `localStorage`
- `buildAbiCacheFromStorage(chain)` scans all `abi-*` keys and filters by chain prefix

- [ ] **Step 1: Create the test file**

Write `tests/unit/abiCache.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest'
import {
  getAbiCacheKey,
  getCachedAbi,
  setCachedAbi,
  buildAbiCacheFromStorage,
} from '../../app/utils/abiCache.js'

// jsdom provides localStorage. Clear between tests.
beforeEach(() => {
  localStorage.clear()
})

describe('getAbiCacheKey', () => {
  it('produces the correct abi-{chain}-{address} format', () => {
    expect(getAbiCacheKey('ethereum', '0xAbCd')).toBe('abi-ethereum-0xabcd')
  })

  it('lowercases the address', () => {
    expect(getAbiCacheKey('base', '0xDEADBEEF')).toBe('abi-base-0xdeadbeef')
  })
})

describe('setCachedAbi / getCachedAbi', () => {
  const abi = [{ type: 'function', name: 'transfer' }]

  it('round-trips ABI through localStorage', () => {
    setCachedAbi('ethereum', '0x1234', abi)
    const result = getCachedAbi('ethereum', '0x1234')
    expect(result.abi).toEqual(abi)
  })

  it('stores proxy metadata fields', () => {
    setCachedAbi('base', '0xabcd', abi, true, '0ximpl', 'Proxy', 'Implementation')
    const result = getCachedAbi('base', '0xabcd')
    expect(result.isProxy).toBe(true)
    expect(result.implAddress).toBe('0ximpl')
    expect(result.contractName).toBe('Proxy')
    expect(result.implContractName).toBe('Implementation')
  })

  it('stores a timestamp', () => {
    const before = Date.now()
    setCachedAbi('ethereum', '0x1234', abi)
    const result = getCachedAbi('ethereum', '0x1234')
    expect(result.timestamp).toBeGreaterThanOrEqual(before)
  })

  it('returns null for a missing key', () => {
    expect(getCachedAbi('ethereum', '0xunknown')).toBeNull()
  })
})

describe('buildAbiCacheFromStorage', () => {
  const abi = [{ type: 'function', name: 'balanceOf' }]

  it('returns only entries for the requested chain', () => {
    setCachedAbi('ethereum', '0x1111111111111111111111111111111111111111', abi)
    setCachedAbi('base', '0x2222222222222222222222222222222222222222', abi)
    const cache = buildAbiCacheFromStorage('ethereum')
    expect(cache.has('0x1111111111111111111111111111111111111111')).toBe(true)
    expect(cache.has('0x2222222222222222222222222222222222222222')).toBe(false)
  })

  it('returns an empty Map when no entries exist for the chain', () => {
    expect(buildAbiCacheFromStorage('polygon').size).toBe(0)
  })

  it('does not throw on malformed JSON entries', () => {
    localStorage.setItem('abi-ethereum-0xbad', 'not-valid-json{{{')
    expect(() => buildAbiCacheFromStorage('ethereum')).not.toThrow()
  })
})
```

- [ ] **Step 2: Run tests and verify all pass**

```bash
npm test
```

Expected:
```
✓ tests/unit/abiCache.test.js (9)
✓ tests/unit/validation.test.js (14)
Test Files  2 passed (2)
Tests       23 passed (23)
```

- [ ] **Step 3: Commit**

```bash
git add tests/unit/abiCache.test.js
git commit -m "test(unit): add abiCache utility tests"
```

---

### Task 4: Unit tests — addressBook.js

**Files:**
- Create: `tests/unit/addressBook.test.js`
- Read: `app/utils/addressBook.js` (source under test)

Key behaviors to know:
- `addToAddressBook(entry)` — adds new, or updates if same address (case-insensitive). Does NOT validate address format.
- `removeFromAddressBook(id)` — removes by numeric entry `id`, not by address string.
- `exportToCSV(addressBook)` — CSV with header `label,address,contractName,notes,createdAt`.
- `importFromCSV(csvContent)` — **throws** `Error` if address is invalid (does not skip).

- [ ] **Step 1: Create the test file**

Write `tests/unit/addressBook.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest'
import {
  getAddressBook,
  addToAddressBook,
  removeFromAddressBook,
  exportToCSV,
  importFromCSV,
} from '../../app/utils/addressBook.js'

const VALID_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const VALID_ADDRESS_2 = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'

beforeEach(() => {
  localStorage.clear()
})

describe('getAddressBook', () => {
  it('returns an empty array when localStorage is empty', () => {
    expect(getAddressBook()).toEqual([])
  })
})

describe('addToAddressBook', () => {
  it('adds a new entry with id, createdAt, updatedAt fields', () => {
    const result = addToAddressBook({ address: VALID_ADDRESS, label: 'USDC' })
    expect(result).toHaveLength(1)
    expect(result[0].label).toBe('USDC')
    expect(result[0].address).toBe(VALID_ADDRESS)
    expect(result[0].id).toBeDefined()
    expect(result[0].createdAt).toBeDefined()
    expect(result[0].updatedAt).toBeDefined()
  })

  it('updates the existing entry when the same address is added again (case-insensitive)', () => {
    addToAddressBook({ address: VALID_ADDRESS, label: 'Old Label' })
    const result = addToAddressBook({
      address: VALID_ADDRESS.toLowerCase(),
      label: 'New Label',
    })
    expect(result).toHaveLength(1)
    expect(result[0].label).toBe('New Label')
  })

  it('adds multiple distinct addresses', () => {
    addToAddressBook({ address: VALID_ADDRESS, label: 'First' })
    const result = addToAddressBook({ address: VALID_ADDRESS_2, label: 'Second' })
    expect(result).toHaveLength(2)
  })
})

describe('removeFromAddressBook', () => {
  it('removes the entry with the matching id', () => {
    addToAddressBook({ address: VALID_ADDRESS, label: 'USDC' })
    const book = getAddressBook()
    const id = book[0].id
    const result = removeFromAddressBook(id)
    expect(result).toHaveLength(0)
  })

  it('is a no-op when the id does not exist', () => {
    addToAddressBook({ address: VALID_ADDRESS, label: 'USDC' })
    const result = removeFromAddressBook(999999999)
    expect(result).toHaveLength(1)
  })
})

describe('exportToCSV', () => {
  it('produces the correct header row', () => {
    const csv = exportToCSV([])
    expect(csv.split('\n')[0]).toBe('label,address,contractName,notes,createdAt')
  })

  it('includes entry data in subsequent rows', () => {
    const book = [{
      id: 1,
      label: 'USDC',
      address: VALID_ADDRESS,
      contractName: 'ERC20',
      notes: '',
      createdAt: '2024-01-01T00:00:00.000Z',
    }]
    const csv = exportToCSV(book)
    const lines = csv.split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[1]).toContain(VALID_ADDRESS)
    expect(lines[1]).toContain('USDC')
  })

  it('wraps values containing commas in double quotes', () => {
    const book = [{
      id: 1,
      label: 'Token, Stable',
      address: VALID_ADDRESS,
      contractName: '',
      notes: '',
      createdAt: '',
    }]
    const csv = exportToCSV(book)
    expect(csv).toContain('"Token, Stable"')
  })
})

describe('importFromCSV', () => {
  it('parses a valid CSV and returns structured entries', () => {
    const csv = `label,address\nUSDC,${VALID_ADDRESS}`
    const entries = importFromCSV(csv)
    expect(entries).toHaveLength(1)
    expect(entries[0].address).toBe(VALID_ADDRESS)
    expect(entries[0].label).toBe('USDC')
    expect(entries[0].id).toBeDefined()
  })

  it('throws for a CSV with an invalid Ethereum address', () => {
    const csv = `label,address\nBad Token,not-an-address`
    expect(() => importFromCSV(csv)).toThrow(/Invalid address format/)
  })

  it('throws for an empty string', () => {
    expect(() => importFromCSV('')).toThrow(/empty/)
  })

  it('throws when the required address column is missing', () => {
    const csv = `label,notes\nUSDC,a stablecoin`
    expect(() => importFromCSV(csv)).toThrow(/Missing required columns/)
  })
})
```

- [ ] **Step 2: Run tests and verify all pass**

```bash
npm test
```

Expected:
```
✓ tests/unit/addressBook.test.js (13)
✓ tests/unit/abiCache.test.js (9)
✓ tests/unit/validation.test.js (14)
Test Files  3 passed (3)
Tests       36 passed (36)
```

- [ ] **Step 3: Commit**

```bash
git add tests/unit/addressBook.test.js
git commit -m "test(unit): add addressBook utility tests"
```

---

### Task 5: Create API fixture files

**Files:**
- Create: `tests/api/__fixtures__/etherscan-erc20.json`
- Create: `tests/api/__fixtures__/etherscan-unverified.json`
- Create: `tests/api/__fixtures__/etherscan-proxy.json`
- Create: `tests/api/__fixtures__/etherscan-impl.json`
- Create: `tests/api/__fixtures__/sourcify-check.json`
- Create: `tests/api/__fixtures__/sourcify-files.json`

These fixtures represent the shapes of real API responses. They are used in tests to stub `global.fetch` without making live network calls.

- [ ] **Step 1: Create the fixtures directory**

```bash
mkdir -p tests/api/__fixtures__
```

- [ ] **Step 2: Create etherscan-erc20.json**

Represents a verified, non-proxy ERC-20 contract on Etherscan V2.

Write `tests/api/__fixtures__/etherscan-erc20.json`:

```json
{
  "status": "1",
  "message": "OK",
  "result": [
    {
      "ABI": "[{\"type\":\"function\",\"name\":\"balanceOf\",\"inputs\":[{\"name\":\"account\",\"type\":\"address\"}],\"outputs\":[{\"name\":\"\",\"type\":\"uint256\"}],\"stateMutability\":\"view\"},{\"type\":\"function\",\"name\":\"transfer\",\"inputs\":[{\"name\":\"to\",\"type\":\"address\"},{\"name\":\"amount\",\"type\":\"uint256\"}],\"outputs\":[{\"name\":\"\",\"type\":\"bool\"}],\"stateMutability\":\"nonpayable\"}]",
      "ContractName": "ERC20",
      "CompilerVersion": "v0.8.20+commit.a1b79de6",
      "Proxy": "0",
      "Implementation": ""
    }
  ]
}
```

- [ ] **Step 3: Create etherscan-unverified.json**

Represents an unverified contract — Etherscan returns the sentinel string instead of an ABI.

Write `tests/api/__fixtures__/etherscan-unverified.json`:

```json
{
  "status": "1",
  "message": "OK",
  "result": [
    {
      "ABI": "Contract source code not verified",
      "ContractName": "",
      "CompilerVersion": "",
      "Proxy": "0",
      "Implementation": ""
    }
  ]
}
```

- [ ] **Step 4: Create etherscan-proxy.json**

Represents a transparent proxy with a known implementation address.

Write `tests/api/__fixtures__/etherscan-proxy.json`:

```json
{
  "status": "1",
  "message": "OK",
  "result": [
    {
      "ABI": "[{\"type\":\"function\",\"name\":\"upgradeTo\",\"inputs\":[{\"name\":\"newImplementation\",\"type\":\"address\"}],\"outputs\":[],\"stateMutability\":\"nonpayable\"}]",
      "ContractName": "TransparentUpgradeableProxy",
      "CompilerVersion": "v0.8.20+commit.a1b79de6",
      "Proxy": "1",
      "Implementation": "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC"
    }
  ]
}
```

- [ ] **Step 5: Create etherscan-impl.json**

Represents the implementation contract fetched after discovering the proxy.

Write `tests/api/__fixtures__/etherscan-impl.json`:

```json
{
  "status": "1",
  "message": "OK",
  "result": [
    {
      "ABI": "[{\"type\":\"function\",\"name\":\"transfer\",\"inputs\":[{\"name\":\"to\",\"type\":\"address\"},{\"name\":\"amount\",\"type\":\"uint256\"}],\"outputs\":[{\"name\":\"\",\"type\":\"bool\"}],\"stateMutability\":\"nonpayable\"},{\"type\":\"function\",\"name\":\"balanceOf\",\"inputs\":[{\"name\":\"account\",\"type\":\"address\"}],\"outputs\":[{\"name\":\"\",\"type\":\"uint256\"}],\"stateMutability\":\"view\"}]",
      "ContractName": "ERC20Implementation",
      "CompilerVersion": "v0.8.20+commit.a1b79de6",
      "Proxy": "0",
      "Implementation": ""
    }
  ]
}
```

- [ ] **Step 6: Create sourcify-check.json**

Represents the Sourcify `check-by-addresses` response for a verified contract.

Write `tests/api/__fixtures__/sourcify-check.json`:

```json
[
  {
    "address": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    "chainIds": [
      { "chainId": "1", "status": "perfect" }
    ]
  }
]
```

- [ ] **Step 7: Create sourcify-files.json**

Represents the Sourcify `files/{chainId}/{address}` response containing `metadata.json`.

Write `tests/api/__fixtures__/sourcify-files.json`:

```json
{
  "files": [
    {
      "name": "metadata.json",
      "content": "{\"output\":{\"abi\":[{\"type\":\"function\",\"name\":\"decimals\",\"inputs\":[],\"outputs\":[{\"name\":\"\",\"type\":\"uint8\"}],\"stateMutability\":\"view\"}]},\"settings\":{\"compilationTarget\":{\"contracts/Token.sol\":\"SourcifyToken\"}}}"
    }
  ]
}
```

- [ ] **Step 8: Commit**

```bash
git add tests/api/__fixtures__/
git commit -m "test(fixtures): add API response fixtures for Etherscan and Sourcify"
```

---

### Task 6: API integration test — /api/decode

**Files:**
- Create: `tests/api/decode.test.js`
- Read: `app/api/decode/route.js` (route under test — exports `GET`)

The route reads `request.url` for params. We pass a minimal `{ url: string }` object. It calls `global.fetch` to reach the backend. We stub fetch with `vi.fn()`. The route uses `process.env.BACKEND_URL`.

- [ ] **Step 1: Create the test file**

```bash
mkdir -p tests/api
```

Write `tests/api/decode.test.js`:

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GET } from '../../app/api/decode/route.js'

function makeRequest(params) {
  const url = new URL('http://localhost/api/decode')
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v))
  }
  return { url: url.toString() }
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
  delete process.env.BACKEND_URL
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('GET /api/decode', () => {
  it('returns 400 when the data param is missing', async () => {
    const res = await GET(makeRequest({}))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/missing data/i)
  })

  it('returns 500 when BACKEND_URL env var is not set', async () => {
    const res = await GET(makeRequest({ data: '0x12345678' }))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toMatch(/backend url/i)
  })

  it('forwards data, multicall, with_abi, with_sign params to the backend', async () => {
    process.env.BACKEND_URL = 'https://backend.test'
    const mockResult = { function: 'transfer', params: [] }
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResult,
    })

    const res = await GET(makeRequest({
      data: '0x12345678',
      multicall: 'true',
      with_abi: 'true',
      with_sign: 'false',
    }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual(mockResult)

    const calledUrl = global.fetch.mock.calls[0][0]
    expect(calledUrl).toContain('data=0x12345678')
    expect(calledUrl).toContain('multicall=true')
    expect(calledUrl).toContain('with_abi=true')
  })

  it('returns 500 with an error message when the backend returns a non-OK status', async () => {
    process.env.BACKEND_URL = 'https://backend.test'
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
    })

    const res = await GET(makeRequest({ data: '0x12345678' }))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBeDefined()
  })
})
```

- [ ] **Step 2: Run tests and verify all pass**

```bash
npm test
```

Expected:
```
✓ tests/api/decode.test.js (4)
✓ tests/unit/addressBook.test.js (13)
✓ tests/unit/abiCache.test.js (9)
✓ tests/unit/validation.test.js (14)
Test Files  4 passed (4)
Tests       40 passed (40)
```

- [ ] **Step 3: Commit**

```bash
git add tests/api/decode.test.js
git commit -m "test(api): add /api/decode integration tests"
```

---

### Task 7: API integration test — /api/fetch-abi

**Files:**
- Create: `tests/api/fetch-abi.test.js`
- Read: `app/api/fetch-abi/route.js` (route under test — exports `GET`)

The route makes fetch calls to Etherscan and/or Sourcify. We stub `global.fetch` with `vi.fn()` and chain `mockResolvedValueOnce` calls for multi-call tests. The route requires either an `apiKey` query param or `ETHERSCAN_API_KEY` env var.

For the proxy test: the first fetch returns `etherscan-proxy.json` (with `Proxy: "1"` and an `Implementation` address). The route then fetches the implementation ABI as a second call, returning `etherscan-impl.json`.

For the Sourcify fallback test: the first fetch returns `etherscan-unverified.json`. The route then calls Sourcify `check-by-addresses` (second fetch) and `files/{chainId}/{address}` (third fetch).

- [ ] **Step 1: Create the test file**

Write `tests/api/fetch-abi.test.js`:

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GET } from '../../app/api/fetch-abi/route.js'
import etherscanErc20 from './__fixtures__/etherscan-erc20.json'
import etherscanUnverified from './__fixtures__/etherscan-unverified.json'
import etherscanProxy from './__fixtures__/etherscan-proxy.json'
import etherscanImpl from './__fixtures__/etherscan-impl.json'
import sourcifyCheck from './__fixtures__/sourcify-check.json'
import sourcifyFiles from './__fixtures__/sourcify-files.json'

const VALID_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'

function makeRequest(params) {
  const url = new URL('http://localhost/api/fetch-abi')
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v))
  }
  return { url: url.toString() }
}

function mockFetch(responses) {
  const mock = vi.fn()
  for (const r of responses) {
    mock.mockResolvedValueOnce({ ok: true, json: async () => r })
  }
  vi.stubGlobal('fetch', mock)
  return mock
}

beforeEach(() => {
  delete process.env.ETHERSCAN_API_KEY
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('GET /api/fetch-abi', () => {
  it('returns 400 when the address param is missing', async () => {
    vi.stubGlobal('fetch', vi.fn())
    const res = await GET(makeRequest({ apiKey: 'test-key' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/missing address/i)
  })

  it('returns 400 when the address is not a valid Ethereum address', async () => {
    vi.stubGlobal('fetch', vi.fn())
    const res = await GET(makeRequest({ address: 'not-an-address', apiKey: 'test-key' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/invalid address/i)
  })

  it('returns 400 when no API key is provided and env var is not set', async () => {
    vi.stubGlobal('fetch', vi.fn())
    const res = await GET(makeRequest({ address: VALID_ADDRESS }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/api key/i)
  })

  it('returns ABI from Etherscan for a verified non-proxy contract', async () => {
    mockFetch([etherscanErc20])

    const res = await GET(makeRequest({ address: VALID_ADDRESS, apiKey: 'test-key' }))
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.abi).toBeDefined()
    expect(body.abi.length).toBeGreaterThan(0)
    expect(body.isProxy).toBe(false)
    expect(body.contractName).toBe('ERC20')
  })

  it('falls back to Sourcify when Etherscan returns an unverified ABI', async () => {
    mockFetch([etherscanUnverified, sourcifyCheck, sourcifyFiles])

    const res = await GET(makeRequest({ address: VALID_ADDRESS, apiKey: 'test-key' }))
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.abi).toBeDefined()
    expect(body.abi.length).toBeGreaterThan(0)
    // ABI from sourcify-files.json fixture has the 'decimals' function
    expect(body.abi.some(item => item.name === 'decimals')).toBe(true)
  })

  it('detects a proxy via Etherscan and returns merged proxy + implementation ABI', async () => {
    // Call 1: fetch proxy contract info → Proxy: "1" with Implementation address
    // Call 2: fetch implementation contract info
    mockFetch([etherscanProxy, etherscanImpl])

    const res = await GET(makeRequest({ address: VALID_ADDRESS, apiKey: 'test-key' }))
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.isProxy).toBe(true)
    expect(body.implAddress).toBe('0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC')
    expect(body.contractName).toBe('TransparentUpgradeableProxy')

    const fnNames = body.abi.map(item => item.name)
    expect(fnNames).toContain('upgradeTo') // from proxy ABI
    expect(fnNames).toContain('transfer')  // from implementation ABI
  })

  it('returns 400 when both Etherscan and Sourcify fail', async () => {
    const failFetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Error' })  // Etherscan
      .mockResolvedValueOnce({ ok: false, status: 404, statusText: 'Not Found' }) // Sourcify check
    vi.stubGlobal('fetch', failFetch)

    const res = await GET(makeRequest({ address: VALID_ADDRESS, apiKey: 'test-key' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/failed to fetch abi/i)
  })
})
```

- [ ] **Step 2: Run tests and verify all pass**

```bash
npm test
```

Expected:
```
✓ tests/api/fetch-abi.test.js (6)
✓ tests/api/decode.test.js (4)
✓ tests/unit/addressBook.test.js (13)
✓ tests/unit/abiCache.test.js (9)
✓ tests/unit/validation.test.js (14)
Test Files  5 passed (5)
Tests       46 passed (46)
```

- [ ] **Step 3: Commit**

```bash
git add tests/api/fetch-abi.test.js
git commit -m "test(api): add /api/fetch-abi integration tests"
```

---

### Task 8: API integration test — /api/call-contract

**Files:**
- Create: `tests/api/call-contract.test.js`
- Read: `app/api/call-contract/route.js` (route under test — exports `POST`)

The route is a POST handler that reads `request.json()`. We mock it with `{ json: async () => body }`. For RPC calls, viem's http transport uses `global.fetch`. The mock handles both single JSON-RPC objects and batched arrays (viem may send either format).

The route calls `client.call()` which triggers an `eth_call` JSON-RPC request. For the success test, we use a minimal `balanceOf(address)(uint256)` ABI and return a padded hex uint256 result. The route decodes this and serializes BigInt to string.

- [ ] **Step 1: Create the test file**

Write `tests/api/call-contract.test.js`:

```js
import { describe, it, expect, vi, afterEach } from 'vitest'
import { POST } from '../../app/api/call-contract/route.js'

const VALID_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'

const BALANCE_OF_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
]

function makeRequest(body) {
  return { json: async () => body }
}

// Stub global.fetch to respond to JSON-RPC requests from viem.
// Viem may send a single object or a batched array; this handles both.
function stubRpc(methodHandlers) {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_url, options) => {
    const body = JSON.parse(options.body)
    const reqs = Array.isArray(body) ? body : [body]
    const responses = reqs.map(req => {
      const handler = methodHandlers[req.method]
      if (handler) return { jsonrpc: '2.0', id: req.id, result: handler(req) }
      return { jsonrpc: '2.0', id: req.id, error: { code: -32601, message: 'Method not found' } }
    })
    return {
      ok: true,
      json: async () => Array.isArray(body) ? responses : responses[0],
    }
  }))
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('POST /api/call-contract', () => {
  it('returns 400 when required params are missing', async () => {
    const res = await POST(makeRequest({ chain: 'ethereum' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/missing required/i)
  })

  it('returns 400 when address format is invalid', async () => {
    const res = await POST(makeRequest({
      chain: 'ethereum',
      address: 'not-an-address',
      functionName: 'balanceOf',
      abi: BALANCE_OF_ABI,
      args: [VALID_ADDRESS],
    }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/invalid address/i)
  })

  it('returns 400 when the chain is not supported and no custom chainId/rpcUrl provided', async () => {
    const res = await POST(makeRequest({
      chain: 'unsupported-chain-xyz',
      address: VALID_ADDRESS,
      functionName: 'balanceOf',
      abi: BALANCE_OF_ABI,
      args: [VALID_ADDRESS],
    }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/unsupported chain/i)
  })

  it('returns 400 when the function name is not found in the ABI', async () => {
    const res = await POST(makeRequest({
      chain: 'ethereum',
      address: VALID_ADDRESS,
      functionName: 'nonExistentFunction',
      abi: BALANCE_OF_ABI,
      args: [],
    }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/not found in abi/i)
  })

  it('returns 500 when the RPC call fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')))
    const res = await POST(makeRequest({
      chain: 'ethereum',
      address: VALID_ADDRESS,
      functionName: 'balanceOf',
      abi: BALANCE_OF_ABI,
      args: [VALID_ADDRESS],
    }))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBeDefined()
  })

  it('resolves a built-in chain by name and returns a decoded result', async () => {
    // uint256 1000000 (0xF4240) padded to 32 bytes
    stubRpc({
      eth_call: () => '0x00000000000000000000000000000000000000000000000000000000000f4240',
      eth_chainId: () => '0x1',
    })

    const res = await POST(makeRequest({
      chain: 'ethereum',
      address: VALID_ADDRESS,
      functionName: 'balanceOf',
      abi: BALANCE_OF_ABI,
      args: [VALID_ADDRESS],
    }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.decoded).toHaveLength(1)
    expect(body.decoded[0].type).toBe('uint256')
    // BigInts are serialized to strings by the route
    expect(body.decoded[0].value).toBe('1000000')
  })

  it('resolves a custom chain by numeric chainId and rpcUrl', async () => {
    stubRpc({
      eth_call: () => '0x00000000000000000000000000000000000000000000000000000000000f4240',
      eth_chainId: () => '0x64',
    })

    const res = await POST(makeRequest({
      chain: 'custom-gnosis',
      chainId: 100,
      rpcUrl: 'https://rpc.gnosis.gateway.fm',
      address: VALID_ADDRESS,
      functionName: 'balanceOf',
      abi: BALANCE_OF_ABI,
      args: [VALID_ADDRESS],
    }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.decoded[0].value).toBe('1000000')
  })
})
```

- [ ] **Step 2: Run tests and verify all pass**

```bash
npm test
```

Expected:
```
✓ tests/api/call-contract.test.js (7)
✓ tests/api/fetch-abi.test.js (6)
✓ tests/api/decode.test.js (4)
✓ tests/unit/addressBook.test.js (13)
✓ tests/unit/abiCache.test.js (9)
✓ tests/unit/validation.test.js (14)
Test Files  6 passed (6)
Tests       53 passed (53)
```

- [ ] **Step 3: Commit**

```bash
git add tests/api/call-contract.test.js
git commit -m "test(api): add /api/call-contract integration tests"
```

---

### Task 9: E2E tests and Playwright config

**Files:**
- Create: `playwright.config.js`
- Create: `tests/e2e/decoder.spec.js`
- Create: `tests/e2e/contract-caller.spec.js`
- Create: `tests/e2e/address-book.spec.js`

E2E tests run against a real browser (Chromium). When running locally, the Playwright `webServer` option starts `npm run dev` automatically. In CI, the server is started separately (see Task 10).

**Note on BACKEND_URL in E2E:** In CI there is no `BACKEND_URL`, so the `/api/decode` route returns 500. The decode E2E test checks that the page shows a meaningful error state (not a crash), which is valid and testable.

- [ ] **Step 1: Create playwright.config.js**

```js
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'html' : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Start dev server only when not in CI (CI starts prod server separately)
  webServer: process.env.CI
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:3000',
        reuseExistingServer: true,
      },
})
```

- [ ] **Step 2: Create the E2E directory**

```bash
mkdir -p tests/e2e
```

- [ ] **Step 3: Create tests/e2e/decoder.spec.js**

```js
import { test, expect } from '@playwright/test'

test.describe('Decoder page', () => {
  test('loads and shows the decode input form', async ({ page }) => {
    await page.goto('/')
    await expect(
      page.getByPlaceholder('Enter hex data to decode (e.g., 0x1234abcd...)')
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Decode' })).toBeVisible()
  })

  test('shows an error when submitting without a BACKEND_URL configured', async ({ page }) => {
    await page.goto('/')
    const input = page.getByPlaceholder('Enter hex data to decode (e.g., 0x1234abcd...)')
    await input.fill('0x12345678')
    await page.getByRole('button', { name: 'Decode' }).click()
    // The page must show some error — either the route error or a UI error
    await expect(page.locator('text=/error/i').first()).toBeVisible({ timeout: 10000 })
  })

  test('shows a validation error when submitting whitespace-only input', async ({ page }) => {
    await page.goto('/')
    const input = page.getByPlaceholder('Enter hex data to decode (e.g., 0x1234abcd...)')
    await input.fill('   ')
    await page.getByRole('button', { name: 'Decode' }).click()
    // The page should catch empty input before hitting the API
    await expect(page.locator('text=/enter/i, text=/valid/i, text=/required/i').first())
      .toBeVisible({ timeout: 5000 })
  })
})
```

- [ ] **Step 4: Create tests/e2e/contract-caller.spec.js**

```js
import { test, expect } from '@playwright/test'

test.describe('Contract Caller page', () => {
  test('loads and shows the chain selector', async ({ page }) => {
    await page.goto('/contract-caller')
    // The page renders a list of chain buttons/options
    await expect(page.getByText('Ethereum')).toBeVisible()
  })

  test('shows all built-in chains', async ({ page }) => {
    await page.goto('/contract-caller')
    for (const chain of ['Ethereum', 'Arbitrum', 'Base', 'Polygon', 'BSC']) {
      await expect(page.getByText(chain)).toBeVisible()
    }
  })

  test('shows an address input field', async ({ page }) => {
    await page.goto('/contract-caller')
    // Contract address input — look for a text input that accepts 0x addresses
    const addressInput = page.getByRole('textbox').first()
    await expect(addressInput).toBeVisible()
    await addressInput.fill('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48')
    await expect(addressInput).toHaveValue('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48')
  })
})
```

- [ ] **Step 5: Create tests/e2e/address-book.spec.js**

```js
import { test, expect } from '@playwright/test'

const TEST_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const TEST_LABEL = 'USDC E2E Test'

test.describe('Address Book page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/address-book')
    // Clear any existing entries from a prior run by reloading with clean localStorage
    await page.evaluate(() => localStorage.removeItem('address_book'))
    await page.reload()
  })

  test('loads and shows the address book UI', async ({ page }) => {
    await expect(page.getByPlaceholder('0x...')).toBeVisible()
  })

  test('adding a valid address makes it appear in the list', async ({ page }) => {
    await page.getByPlaceholder('0x...').fill(TEST_ADDRESS)
    await page.getByPlaceholder(/USDC Token|Uniswap Router/i).fill(TEST_LABEL)
    // Click the Add/Save button
    await page.getByRole('button', { name: /add|save/i }).first().click()
    await expect(page.getByText(TEST_LABEL)).toBeVisible({ timeout: 5000 })
  })

  test('deleting an entry removes it from the list', async ({ page }) => {
    // Add first
    await page.getByPlaceholder('0x...').fill(TEST_ADDRESS)
    await page.getByPlaceholder(/USDC Token|Uniswap Router/i).fill(TEST_LABEL)
    await page.getByRole('button', { name: /add|save/i }).first().click()
    await expect(page.getByText(TEST_LABEL)).toBeVisible()

    // Delete
    await page.getByRole('button', { name: /delete|remove/i }).first().click()
    await expect(page.getByText(TEST_LABEL)).not.toBeVisible({ timeout: 5000 })
  })
})
```

- [ ] **Step 6: Verify Playwright runs (locally)**

First ensure a local dev server is not already running (or let Playwright start one):

```bash
npm run test:e2e
```

Expected: Tests run in Chromium. Some may fail on delete/add if selectors need adjustment — that's fine to fix inline. All three test files should be discovered and run.

- [ ] **Step 7: Commit**

```bash
git add playwright.config.js tests/e2e/
git commit -m "test(e2e): add Playwright config and E2E tests for decoder, contract-caller, address-book"
```

---

### Task 10: GitHub Actions CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

Two jobs:
- `test` — runs `npm test` (Vitest unit + API). **Blocking** (no `continue-on-error`).
- `e2e` — builds the app, starts it, runs Playwright. **Advisory** (`continue-on-error: true`, `needs: test`).

- [ ] **Step 1: Create the workflow file**

```bash
mkdir -p .github/workflows
```

Write `.github/workflows/ci.yml`:

```yaml
name: CI

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

      - name: Install dependencies
        run: npm ci

      - name: Run unit and API integration tests
        run: npm test

      - name: Collect coverage
        run: npm run test:coverage

      - uses: actions/upload-artifact@v4
        if: always()
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

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright Chromium
        run: npx playwright install --with-deps chromium

      - name: Build production app
        run: npm run build

      - name: Start production server
        run: npm run start &

      - name: Wait for server to be ready
        run: npx wait-on http://localhost:3000 --timeout 30000

      - name: Run E2E tests
        run: npm run test:e2e
        env:
          CI: true

      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
```

- [ ] **Step 2: Verify the workflow file parses cleanly**

```bash
cat .github/workflows/ci.yml
```

Check there are no YAML syntax errors (proper indentation, no tabs).

- [ ] **Step 3: Commit and push to trigger CI**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add GitHub Actions workflow with blocking unit/API tests and advisory E2E"
git push origin main
```

- [ ] **Step 4: Verify CI runs on GitHub**

Go to the repository's Actions tab on GitHub. Confirm:
- The `CI` workflow triggered on the push
- The `Unit & API Tests` job passes (green)
- The `E2E Tests (advisory)` job runs after it (yellow/green — failures here don't block)

---

## Self-Review Notes

- **Spec coverage:** All spec requirements have tasks: unit tests ✓, API integration ✓, E2E ✓, CI workflow ✓, fixtures ✓, npm scripts ✓, new dependencies ✓.
- **addressBook importFromCSV:** Spec said "skips rows with invalid addresses" but the actual code throws. Tests reflect actual behavior (throws).
- **fetch-abi apiKey:** The route requires an API key (param or env var); tests pass `apiKey: 'test-key'` in query params.
- **call-contract RPC mock:** Handles both single and batched JSON-RPC request formats from viem.
- **E2E selectors:** Use `getByPlaceholder` and `getByRole` based on existing UI text — no `data-testid` attributes needed.
