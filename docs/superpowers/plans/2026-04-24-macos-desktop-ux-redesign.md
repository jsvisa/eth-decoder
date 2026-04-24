# macOS Desktop UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current web-app-in-a-sidebar desktop UI with a native-feeling macOS power tool — design tokens, split panes, three-column Contract Caller, keyboard shortcuts, and auto light/dark mode.

**Architecture:** New `desktop/pages/*.jsx` files replace the current `@app/page.js` imports in App.jsx. Shared pure utilities (valueFormat, argParser, functionGroup) live in `desktop/utils/` and are unit-tested. All page components import from `@app/utils/` (abiCache, addressBook, decoder) and `desktop/platform.js` via the existing Vite alias. No changes to `app/`, `src-tauri/`, or `desktop/platform.js`.

**Tech Stack:** React 19, Vite 6, CSS Modules, `@tauri-apps/api/core` for invoke, vitest 3.x for pure utility tests

---

## File Map

**New files:**
- `desktop/styles/tokens.css` — all CSS custom properties, light + dark via `prefers-color-scheme`
- `desktop/utils/valueFormat.js` — `valueColorClass`, `formatNumericHint`, `shortenAddress`
- `desktop/utils/functionGroup.js` — `groupFunctions`, `filterFunctions`
- `desktop/utils/argParser.js` — `parseArg(value, type)` — string → viem-compatible value
- `desktop/components/Toolbar.jsx` + `Toolbar.module.css`
- `desktop/pages/DecoderPage.jsx` + `DecoderPage.module.css`
- `desktop/pages/contract-caller/FunctionList.jsx` + `FunctionList.module.css`
- `desktop/pages/contract-caller/ArgumentsPanel.jsx` + `ArgumentsPanel.module.css`
- `desktop/pages/contract-caller/ResultPanel.jsx` + `ResultPanel.module.css`
- `desktop/pages/ContractCallerPage.jsx` + `ContractCallerPage.module.css`
- `desktop/pages/ContractsPage.jsx` + `ContractsPage.module.css`
- `desktop/pages/AddressBookPage.jsx` + `AddressBookPage.module.css`
- `desktop/components/CommandPalette.jsx` + `CommandPalette.module.css`
- `tests/unit/valueFormat.test.js`
- `tests/unit/functionGroup.test.js`
- `tests/unit/argParser.test.js`

**Modified files:**
- `desktop/index.html` — import `tokens.css`
- `desktop/styles/Layout.module.css` — reference tokens
- `desktop/components/Sidebar.jsx` + new `Sidebar.module.css` — tokens, DB stats footer, `recentItems` prop
- `desktop/App.jsx` — import `desktop/pages/` instead of `@app/page.js`

---

## Task 1: Design tokens

**Files:**
- Create: `desktop/styles/tokens.css`
- Modify: `desktop/index.html`
- Modify: `desktop/styles/Layout.module.css`

- [ ] **Step 1: Create `desktop/styles/tokens.css`**

```css
/* desktop/styles/tokens.css */
/* Light theme (default) */
:root {
  --surface-0: #f5f5f7;
  --surface-1: #e8e8ed;
  --surface-2: #ffffff;
  --surface-hover: rgba(0, 0, 0, 0.05);

  --text-primary:   #1c1c1e;
  --text-secondary: #6e6e73;
  --text-muted:     #aeaeb2;

  --accent:          #007aff;
  --accent-bg:       rgba(0, 122, 255, 0.10);
  --accent-write:    #ff9f0a;
  --accent-write-bg: rgba(255, 159, 10, 0.12);
  --accent-success:  #34c759;
  --accent-error:    #ff453a;

  --border:        rgba(0, 0, 0, 0.10);
  --border-subtle: rgba(0, 0, 0, 0.05);

  --sidebar-bg:       rgba(232, 232, 237, 0.95);
  --sidebar-width:    188px;
  --nav-active-bg:    rgba(0, 122, 255, 0.12);
  --nav-active-text:  #007aff;

  /* Code / value colours */
  --color-address: #2e7d32;
  --color-uint:    #a05000;
  --color-bool:    #007aff;
  --color-default: #1c1c1e;
}

@media (prefers-color-scheme: dark) {
  :root {
    --surface-0: #1c1c1e;
    --surface-1: rgba(28, 28, 30, 0.97);
    --surface-2: rgba(58, 58, 60, 0.60);
    --surface-hover: rgba(255, 255, 255, 0.06);

    --text-primary:   #e5e5ea;
    --text-secondary: #8e8e93;
    --text-muted:     #6e6e73;

    --accent:          #0a84ff;
    --accent-bg:       rgba(10, 132, 255, 0.15);
    --accent-write:    #ff9f0a;
    --accent-write-bg: rgba(255, 159, 10, 0.15);
    --accent-success:  #34c759;
    --accent-error:    #ff453a;

    --border:        rgba(255, 255, 255, 0.08);
    --border-subtle: rgba(255, 255, 255, 0.04);

    --sidebar-bg:      rgba(28, 28, 30, 0.97);
    --nav-active-bg:   rgba(10, 132, 255, 0.18);
    --nav-active-text: #0a84ff;

    --color-address: #34c759;
    --color-uint:    #ff9f0a;
    --color-bool:    #0a84ff;
    --color-default: #e5e5ea;
  }
}
```

- [ ] **Step 2: Import tokens in `desktop/index.html`**

Add before the closing `</head>` tag:
```html
    <link rel="stylesheet" href="/styles/tokens.css" />
```

The full `<head>` should look like:
```html
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>EVM Decoder</title>
  <link rel="stylesheet" href="/styles/tokens.css" />
</head>
```

- [ ] **Step 3: Update `desktop/styles/Layout.module.css` to use tokens**

Replace the entire file:
```css
/* desktop/styles/Layout.module.css */
.root {
  display: flex;
  height: 100vh;
  background: var(--surface-0);
  color: var(--text-primary);
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif;
  -webkit-font-smoothing: antialiased;
}

.content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
```

- [ ] **Step 4: Verify Vite build**

```
cd /path/to/worktree && npm run desktop:vite-build 2>&1 | tail -5
```

Expected: `✓ built in Xs`

- [ ] **Step 5: Commit**

```
git add desktop/styles/tokens.css desktop/index.html desktop/styles/Layout.module.css
git commit -m "feat(desktop): add CSS design tokens with auto light/dark mode"
```

---

## Task 2: Pure utility functions + tests

**Files:**
- Create: `desktop/utils/valueFormat.js`
- Create: `desktop/utils/functionGroup.js`
- Create: `desktop/utils/argParser.js`
- Create: `tests/unit/valueFormat.test.js`
- Create: `tests/unit/functionGroup.test.js`
- Create: `tests/unit/argParser.test.js`

- [ ] **Step 1: Write failing tests for `valueFormat.js`**

```js
// tests/unit/valueFormat.test.js
import { describe, it, expect } from 'vitest'
import { valueColorClass, formatNumericHint, shortenAddress } from '../../desktop/utils/valueFormat.js'

describe('valueColorClass', () => {
  it('returns colorAddress for address type', () => {
    expect(valueColorClass('address')).toBe('colorAddress')
  })
  it('returns colorUint for uint256', () => {
    expect(valueColorClass('uint256')).toBe('colorUint')
  })
  it('returns colorUint for int128', () => {
    expect(valueColorClass('int128')).toBe('colorUint')
  })
  it('returns colorBool for bool', () => {
    expect(valueColorClass('bool')).toBe('colorBool')
  })
  it('returns colorDefault for string and bytes', () => {
    expect(valueColorClass('string')).toBe('colorDefault')
    expect(valueColorClass('bytes32')).toBe('colorDefault')
  })
})

describe('formatNumericHint', () => {
  it('returns ETH hint for values >= 1e18', () => {
    expect(formatNumericHint('1000000000000000000', 'uint256')).toBe('1.0 ETH')
  })
  it('returns null for non-numeric types', () => {
    expect(formatNumericHint('hello', 'string')).toBeNull()
  })
  it('returns null for small values', () => {
    expect(formatNumericHint('1000', 'uint256')).toBeNull()
  })
  it('returns null for address type', () => {
    expect(formatNumericHint('123', 'address')).toBeNull()
  })
})

describe('shortenAddress', () => {
  it('shortens a full address to first6…last4', () => {
    expect(shortenAddress('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48')).toBe('0xA0b8…eB48')
  })
  it('returns short strings unchanged', () => {
    expect(shortenAddress('0x1234')).toBe('0x1234')
  })
  it('returns empty string for falsy input', () => {
    expect(shortenAddress('')).toBe('')
  })
})
```

- [ ] **Step 2: Run to verify RED**

```
npm test -- tests/unit/valueFormat.test.js 2>&1 | tail -5
```

Expected: FAIL — `Cannot find module '../../desktop/utils/valueFormat.js'`

- [ ] **Step 3: Implement `desktop/utils/valueFormat.js`**

```js
// desktop/utils/valueFormat.js

export function valueColorClass(type) {
  if (type === 'address') return 'colorAddress'
  if (type.startsWith('uint') || type.startsWith('int')) return 'colorUint'
  if (type === 'bool') return 'colorBool'
  return 'colorDefault'
}

export function formatNumericHint(value, type) {
  if (!type.startsWith('uint') && !type.startsWith('int')) return null
  try {
    const n = BigInt(value)
    if (n >= 10n ** 18n) {
      const eth = Number(n * 1000n / 10n ** 18n) / 1000
      return `${eth} ETH`
    }
    if (n >= 10n ** 9n) {
      const gwei = Number(n * 1000n / 10n ** 9n) / 1000
      return `${gwei} Gwei`
    }
    return null
  } catch {
    return null
  }
}

export function shortenAddress(addr) {
  if (!addr || addr.length < 10) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}
```

- [ ] **Step 4: Run to verify GREEN**

```
npm test -- tests/unit/valueFormat.test.js 2>&1 | tail -5
```

Expected: all 9 tests pass.

- [ ] **Step 5: Write failing tests for `functionGroup.js`**

```js
// tests/unit/functionGroup.test.js
import { describe, it, expect } from 'vitest'
import { groupFunctions, filterFunctions } from '../../desktop/utils/functionGroup.js'

const ABI = [
  { type: 'function', name: 'balanceOf',   stateMutability: 'view'        },
  { type: 'function', name: 'totalSupply', stateMutability: 'pure'        },
  { type: 'function', name: 'transfer',    stateMutability: 'nonpayable'  },
  { type: 'function', name: 'approve',     stateMutability: 'nonpayable'  },
  { type: 'function', name: 'deposit',     stateMutability: 'payable'     },
  { type: 'event',    name: 'Transfer'                                     },
]

describe('groupFunctions', () => {
  it('puts view and pure into read group', () => {
    const { read } = groupFunctions(ABI)
    expect(read.map(f => f.name)).toEqual(['balanceOf', 'totalSupply'])
  })
  it('puts nonpayable and payable into write group', () => {
    const { write } = groupFunctions(ABI)
    expect(write.map(f => f.name)).toEqual(['transfer', 'approve', 'deposit'])
  })
  it('ignores events and other non-function items', () => {
    const { read, write } = groupFunctions(ABI)
    expect(read.length + write.length).toBe(5)
  })
})

describe('filterFunctions', () => {
  const fns = [{ name: 'balanceOf' }, { name: 'transfer' }, { name: 'totalSupply' }]
  it('returns all when query is empty', () => {
    expect(filterFunctions(fns, '')).toEqual(fns)
  })
  it('filters case-insensitively', () => {
    expect(filterFunctions(fns, 'BALANCE')).toEqual([{ name: 'balanceOf' }])
  })
  it('returns empty array when no match', () => {
    expect(filterFunctions(fns, 'xyz')).toEqual([])
  })
})
```

- [ ] **Step 6: Implement `desktop/utils/functionGroup.js`**

```js
// desktop/utils/functionGroup.js
const READ_MUTABILITIES = new Set(['view', 'pure'])

export function groupFunctions(abi) {
  const read = []
  const write = []
  for (const item of abi) {
    if (item.type !== 'function') continue
    if (READ_MUTABILITIES.has(item.stateMutability)) {
      read.push(item)
    } else {
      write.push(item)
    }
  }
  return { read, write }
}

export function filterFunctions(fns, query) {
  if (!query) return fns
  const q = query.toLowerCase()
  return fns.filter(fn => fn.name.toLowerCase().includes(q))
}
```

- [ ] **Step 7: Write failing tests for `argParser.js`**

```js
// tests/unit/argParser.test.js
import { describe, it, expect } from 'vitest'
import { parseArg } from '../../desktop/utils/argParser.js'

describe('parseArg', () => {
  it('returns address strings as-is', () => {
    const addr = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
    expect(parseArg(addr, 'address')).toBe(addr)
  })
  it('parses uint256 as BigInt', () => {
    expect(parseArg('1000000', 'uint256')).toBe(1000000n)
  })
  it('parses int128 as BigInt', () => {
    expect(parseArg('-42', 'int128')).toBe(-42n)
  })
  it('parses bool true', () => {
    expect(parseArg('true', 'bool')).toBe(true)
  })
  it('parses bool false', () => {
    expect(parseArg('false', 'bool')).toBe(false)
  })
  it('parses bool 1 as true', () => {
    expect(parseArg('1', 'bool')).toBe(true)
  })
  it('returns string as-is', () => {
    expect(parseArg('hello', 'string')).toBe('hello')
  })
  it('returns bytes32 hex as-is', () => {
    expect(parseArg('0xabc123', 'bytes32')).toBe('0xabc123')
  })
  it('splits address[] by comma', () => {
    const result = parseArg('0x1111,0x2222', 'address[]')
    expect(result).toEqual(['0x1111', '0x2222'])
  })
  it('splits uint256[] as BigInt array', () => {
    expect(parseArg('1,2,3', 'uint256[]')).toEqual([1n, 2n, 3n])
  })
  it('returns undefined for empty string', () => {
    expect(parseArg('', 'uint256')).toBeUndefined()
  })
})
```

- [ ] **Step 8: Implement `desktop/utils/argParser.js`**

```js
// desktop/utils/argParser.js

export function parseArg(value, type) {
  if (value === '' || value === undefined || value === null) return undefined

  // Dynamic arrays: address[], uint256[], etc.
  if (type.endsWith('[]')) {
    const baseType = type.slice(0, -2)
    return value.split(',').map(v => parseArg(v.trim(), baseType))
  }

  // Fixed-size arrays: address[3], bytes32[2], etc.
  const fixedMatch = type.match(/^(.+)\[(\d+)\]$/)
  if (fixedMatch) {
    const baseType = fixedMatch[1]
    return value.split(',').map(v => parseArg(v.trim(), baseType))
  }

  if (type === 'address') return value
  if (type === 'bool') return value.toLowerCase() === 'true' || value === '1'
  if (type === 'string') return value
  if (type.startsWith('bytes')) return value  // hex string, passed as-is
  if (type.startsWith('uint') || type.startsWith('int')) return BigInt(value)
  if (type === 'tuple') {
    try { return JSON.parse(value) } catch { return value }
  }
  return value
}
```

- [ ] **Step 9: Run full utility test suite**

```
npm test -- tests/unit/valueFormat.test.js tests/unit/functionGroup.test.js tests/unit/argParser.test.js 2>&1 | tail -8
```

Expected: all 23 tests pass.

- [ ] **Step 10: Run full suite for regressions**

```
npm test 2>&1 | tail -5
```

Expected: all existing tests still pass.

- [ ] **Step 11: Commit**

```
git add desktop/utils/ tests/unit/valueFormat.test.js tests/unit/functionGroup.test.js tests/unit/argParser.test.js
git commit -m "feat(desktop): add valueFormat, functionGroup, argParser utilities with tests"
```

---

## Task 3: Shared chrome components

**Files:**
- Create: `desktop/components/Toolbar.jsx`
- Create: `desktop/components/Toolbar.module.css`
- Modify: `desktop/components/Sidebar.jsx`
- Create: `desktop/components/Sidebar.module.css`

- [ ] **Step 1: Create `desktop/components/Toolbar.jsx`**

```jsx
// desktop/components/Toolbar.jsx
import styles from './Toolbar.module.css'

export default function Toolbar({ children }) {
  return (
    <div className={styles.toolbar}>
      {children}
    </div>
  )
}

export function ToolbarSpacer() {
  return <div className={styles.spacer} />
}

export function ToolbarButton({ onClick, children, variant }) {
  return (
    <button
      className={`${styles.btn} ${variant === 'active' ? styles.btnActive : ''}`}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

export function ToolbarSep() {
  return <div className={styles.sep} />
}
```

- [ ] **Step 2: Create `desktop/components/Toolbar.module.css`**

```css
/* desktop/components/Toolbar.module.css */
.toolbar {
  height: 44px;
  min-height: 44px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 14px;
  background: var(--surface-1);
  border-bottom: 0.5px solid var(--border);
  -webkit-app-region: drag;
}

.spacer {
  flex: 1;
}

.btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 5px;
  background: var(--surface-hover);
  border: none;
  font-size: 11px;
  color: var(--text-secondary);
  cursor: pointer;
  -webkit-app-region: no-drag;
  white-space: nowrap;
}

.btn:hover {
  color: var(--text-primary);
  background: var(--surface-hover);
  filter: brightness(1.15);
}

.btnActive {
  background: var(--accent-write-bg);
  color: var(--accent-write);
}

.sep {
  width: 0.5px;
  height: 18px;
  background: var(--border);
  flex-shrink: 0;
}

kbd {
  background: var(--surface-hover);
  filter: brightness(0.85);
  border-radius: 3px;
  padding: 1px 4px;
  font-size: 10px;
  font-family: inherit;
}
```

- [ ] **Step 3: Replace `desktop/components/Sidebar.jsx`**

```jsx
// desktop/components/Sidebar.jsx
import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import styles from './Sidebar.module.css'

const NAV_ITEMS = [
  { id: 'decoder',         label: 'Decoder',        icon: '⬡' },
  { id: 'contract-caller', label: 'Contract Caller', icon: '⚙' },
  { id: 'contracts',       label: 'Contracts',       icon: '📄' },
  { id: 'address-book',    label: 'Address Book',    icon: '📖' },
]

export default function Sidebar({ activePage, onNavigate, recentItems = [] }) {
  const [dbCount, setDbCount] = useState(null)

  useEffect(() => {
    invoke('get_db_stats')
      .then(stats => setDbCount(stats.row_count))
      .catch(() => {})
  }, [])

  return (
    <nav className={styles.sidebar}>
      {/* Traffic light clearance — drag region */}
      <div className={styles.trafficLights} />

      <div className={styles.section}>
        <div className={styles.sectionLabel}>Tools</div>
        {NAV_ITEMS.map(item => (
          <button
            key={item.id}
            className={`${styles.navItem} ${activePage === item.id ? styles.navItemActive : ''}`}
            onClick={() => onNavigate(item.id)}
          >
            <span className={styles.navIcon}>{item.icon}</span>
            <span className={styles.navLabel}>{item.label}</span>
          </button>
        ))}
      </div>

      {recentItems.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Recent</div>
          {recentItems.map((item, i) => (
            <button key={i} className={styles.recentItem} onClick={item.onClick} title={item.data}>
              {item.label}
            </button>
          ))}
        </div>
      )}

      <div className={styles.footer}>
        {dbCount !== null && (
          <div className={styles.dbBadge}>
            <span className={styles.dbDot} />
            {dbCount.toLocaleString()} signatures
          </div>
        )}
      </div>
    </nav>
  )
}
```

- [ ] **Step 4: Create `desktop/components/Sidebar.module.css`**

```css
/* desktop/components/Sidebar.module.css */
.sidebar {
  width: var(--sidebar-width);
  min-width: var(--sidebar-width);
  background: var(--sidebar-bg);
  -webkit-backdrop-filter: blur(20px);
  backdrop-filter: blur(20px);
  border-right: 0.5px solid var(--border);
  display: flex;
  flex-direction: column;
}

.trafficLights {
  height: 44px;
  -webkit-app-region: drag;
  flex-shrink: 0;
}

.section {
  padding: 4px 8px;
}

.sectionLabel {
  font-size: 10px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.6px;
  padding: 6px 8px 4px;
}

.navItem {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 6px 8px;
  border-radius: 6px;
  width: 100%;
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  text-align: left;
  transition: background 0.1s;
}

.navItem:hover {
  background: var(--surface-hover);
  color: var(--text-primary);
}

.navItemActive {
  background: var(--nav-active-bg);
  color: var(--nav-active-text);
  font-weight: 500;
}

.navIcon {
  font-size: 14px;
  width: 18px;
  text-align: center;
}

.navLabel {
  font-size: 13px;
}

.recentItem {
  display: block;
  width: 100%;
  padding: 4px 8px;
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 11px;
  font-family: 'SF Mono', 'Menlo', monospace;
  text-align: left;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  border-radius: 4px;
}

.recentItem:hover {
  color: var(--text-primary);
  background: var(--surface-hover);
}

.footer {
  margin-top: auto;
  padding: 10px 8px;
  border-top: 0.5px solid var(--border-subtle);
}

.dbBadge {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border-radius: 5px;
  background: rgba(52, 199, 89, 0.10);
  font-size: 11px;
  color: var(--accent-success);
}

.dbDot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent-success);
  flex-shrink: 0;
}
```

- [ ] **Step 5: Verify build**

```
npm run desktop:vite-build 2>&1 | tail -5
```

- [ ] **Step 6: Commit**

```
git add desktop/components/Toolbar.jsx desktop/components/Toolbar.module.css desktop/components/Sidebar.jsx desktop/components/Sidebar.module.css
git commit -m "feat(desktop): add Toolbar component and update Sidebar with tokens and DB badge"
```

---

## Task 4: DecoderPage.jsx

**Files:**
- Create: `desktop/pages/DecoderPage.jsx`
- Create: `desktop/pages/DecoderPage.module.css`
- Modify: `desktop/App.jsx`

- [ ] **Step 1: Create `desktop/pages/DecoderPage.module.css`**

```css
/* desktop/pages/DecoderPage.module.css */
.root {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ── Toolbar ── */
.toolbar {
  height: 44px;
  min-height: 44px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 14px;
  background: var(--surface-1);
  border-bottom: 0.5px solid var(--border);
  -webkit-app-region: drag;
}

.toolbarTitle {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.toggleLabel {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--text-muted);
  cursor: pointer;
  -webkit-app-region: no-drag;
}

.toggleLabel input { display: none; }

.togglePill {
  width: 28px;
  height: 16px;
  border-radius: 8px;
  background: var(--surface-hover);
  filter: brightness(0.7);
  position: relative;
  transition: background 0.15s;
}

.togglePill::after {
  content: '';
  position: absolute;
  width: 12px;
  height: 12px;
  top: 2px;
  left: 2px;
  background: var(--text-muted);
  border-radius: 50%;
  transition: transform 0.15s, background 0.15s;
}

.toggleLabel input:checked + .togglePill {
  background: var(--accent-bg);
}

.toggleLabel input:checked + .togglePill::after {
  transform: translateX(12px);
  background: var(--accent);
}

.spacer { flex: 1; }

.hintBtn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 9px;
  border-radius: 5px;
  background: var(--surface-hover);
  filter: brightness(0.85);
  border: none;
  font-size: 11px;
  color: var(--text-muted);
  cursor: pointer;
  -webkit-app-region: no-drag;
}

kbd {
  background: var(--surface-hover);
  filter: brightness(0.7);
  border-radius: 3px;
  padding: 1px 4px;
  font-size: 10px;
  font-family: inherit;
}

/* ── Split pane ── */
.split {
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* ── Input pane ── */
.paneInput {
  width: 42%;
  min-width: 200px;
  display: flex;
  flex-direction: column;
  border-right: 0.5px solid var(--border);
}

.paneLabel {
  padding: 7px 14px 5px;
  font-size: 10px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 0.5px solid var(--border-subtle);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.hexInput {
  flex: 1;
  background: transparent;
  border: none;
  resize: none;
  outline: none;
  font-family: 'SF Mono', 'Menlo', monospace;
  font-size: 12px;
  color: var(--text-primary);
  padding: 12px 14px;
  line-height: 1.7;
}

.inputFooter {
  padding: 8px 12px;
  border-top: 0.5px solid var(--border-subtle);
  display: flex;
  align-items: center;
  gap: 8px;
}

.decodeBtn {
  flex: 1;
  padding: 7px 0;
  background: var(--accent);
  border: none;
  border-radius: 6px;
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.decodeBtn:hover { filter: brightness(1.1); }
.decodeBtn:disabled { opacity: 0.5; cursor: not-allowed; }

.charCount {
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
}

/* ── Output pane ── */
.paneOutput {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.emptyState {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  gap: 8px;
  font-size: 13px;
}

.emptyIcon { font-size: 32px; opacity: 0.3; }

.errorCard {
  margin: 16px;
  padding: 12px 14px;
  background: rgba(255, 69, 58, 0.08);
  border-left: 3px solid var(--accent-error);
  border-radius: 6px;
  font-size: 12px;
  color: var(--accent-error);
  font-family: 'SF Mono', 'Menlo', monospace;
}

/* ── Result display ── */
.result {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
}

.resultHeader {
  padding: 10px 14px 8px;
  border-bottom: 0.5px solid var(--border-subtle);
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.funcSig {
  font-family: 'SF Mono', 'Menlo', monospace;
  font-size: 13px;
  font-weight: 600;
  color: var(--accent);
}

.argList {
  flex: 1;
  overflow-y: auto;
}

.argRow {
  display: flex;
  align-items: baseline;
  padding: 5px 14px;
  border-bottom: 0.5px solid var(--border-subtle);
  font-size: 12px;
  gap: 0;
}

.argRow:hover { background: var(--surface-hover); }

.argName {
  font-family: 'SF Mono', 'Menlo', monospace;
  min-width: 110px;
}

.argType {
  font-family: 'SF Mono', 'Menlo', monospace;
  font-size: 11px;
  color: var(--text-muted);
  min-width: 90px;
  padding: 0 6px;
}

.argValueWrap { flex: 1; }

.argValue {
  font-family: 'SF Mono', 'Menlo', monospace;
  word-break: break-all;
}

.argHint {
  font-size: 10px;
  color: var(--text-muted);
  margin-top: 1px;
}

/* Value colour classes — referenced by valueColorClass() */
.colorAddress { color: var(--color-address); }
.colorUint    { color: var(--color-uint);    }
.colorBool    { color: var(--color-bool);    }
.colorDefault { color: var(--text-primary);  }

.copyRow {
  padding: 8px 12px;
  border-top: 0.5px solid var(--border-subtle);
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.copyBtn {
  padding: 4px 10px;
  border-radius: 5px;
  background: var(--surface-hover);
  filter: brightness(0.85);
  border: none;
  font-size: 11px;
  color: var(--text-secondary);
  cursor: pointer;
}

.copyBtn:hover { color: var(--text-primary); filter: brightness(1); }
```

- [ ] **Step 2: Create `desktop/pages/DecoderPage.jsx`**

```jsx
// desktop/pages/DecoderPage.jsx
import { useState, useEffect, useCallback } from 'react'
import { decode } from '../platform'
import { valueColorClass, formatNumericHint } from '../utils/valueFormat'
import styles from './DecoderPage.module.css'

const HISTORY_KEY = 'evm_decoder_history'
const MAX_HISTORY = 5

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') }
  catch { return [] }
}

function addToHistory(entry, current) {
  const next = [entry, ...current.filter(h => h.data !== entry.data)].slice(0, MAX_HISTORY)
  localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
  return next
}

export default function DecoderPage({ onRecentChange }) {
  const [inputData, setInputData] = useState('')
  const [result, setResult] = useState(null)   // { func, args, abi }
  const [error, setError] = useState(null)
  const [isDecoding, setIsDecoding] = useState(false)
  const [multicall, setMulticall] = useState(false)
  const [history, setHistory] = useState(loadHistory)

  // Notify parent of recent items so Sidebar can display them
  useEffect(() => {
    onRecentChange?.(history.map(h => ({
      label: `${h.selector} — ${h.func?.split('(')[0] ?? '?'}`,
      data: h.data,
      onClick: () => {
        setInputData(h.data)
        handleDecode(h.data)
      },
    })))
  }, [history]) // eslint-disable-line

  const handleDecode = useCallback(async (data) => {
    const d = (data ?? inputData).trim()
    if (!d) return
    setIsDecoding(true)
    setError(null)
    setResult(null)
    try {
      const res = await decode(d, { count: 3, multicall, withAbi: true })
      if (res.msg === 'ok' && res.data?.length > 0) {
        const item = res.data[0]
        setResult(item)
        setHistory(prev => addToHistory({
          data: d,
          selector: d.slice(0, 10),
          func: item.func,
        }, prev))
      } else {
        setError('Unknown selector — not found in local database')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setIsDecoding(false)
    }
  }, [inputData, multicall])

  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault(); handleDecode()
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'l') {
        e.preventDefault()
        document.getElementById('decoder-input')?.focus()
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'C') {
        e.preventDefault()
        if (result) navigator.clipboard.writeText(JSON.stringify(result, null, 2))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleDecode, result])

  return (
    <div className={styles.root}>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <span className={styles.toolbarTitle}>Decoder</span>
        <label className={styles.toggleLabel}>
          <input type="checkbox" checked={multicall} onChange={e => setMulticall(e.target.checked)} />
          <span className={styles.togglePill} />
          Multicall
        </label>
        <div className={styles.spacer} />
        <button className={styles.hintBtn}><kbd>⌘K</kbd> Quick open</button>
      </div>

      {/* Split pane */}
      <div className={styles.split}>
        {/* Left: input */}
        <div className={styles.paneInput}>
          <div className={styles.paneLabel}>
            <span>Input</span>
            <span>hex calldata</span>
          </div>
          <textarea
            id="decoder-input"
            className={styles.hexInput}
            value={inputData}
            onChange={e => setInputData(e.target.value)}
            placeholder="Paste hex calldata… (0x…)"
            spellCheck={false}
          />
          <div className={styles.inputFooter}>
            <button
              className={styles.decodeBtn}
              onClick={() => handleDecode()}
              disabled={isDecoding}
            >
              {isDecoding ? 'Decoding…' : 'Decode'} <kbd>⌘↵</kbd>
            </button>
            <span className={styles.charCount}>{inputData.length} chars</span>
          </div>
        </div>

        {/* Right: output */}
        <div className={styles.paneOutput}>
          {!result && !error && !isDecoding && (
            <div className={styles.emptyState}>
              <span className={styles.emptyIcon}>⬡</span>
              <span>Decode a transaction to see results</span>
            </div>
          )}
          {isDecoding && (
            <div className={styles.emptyState}><span>Decoding…</span></div>
          )}
          {error && <div className={styles.errorCard}>{error}</div>}
          {result && <ResultOutput result={result} styles={styles} />}
        </div>
      </div>
    </div>
  )
}

function ResultOutput({ result, styles }) {
  const inputs = result.abi?.inputs || []
  const typeMap = Object.fromEntries(inputs.map(inp => [inp.name, inp.type]))

  function copyJSON() {
    navigator.clipboard.writeText(JSON.stringify({ func: result.func, args: result.args }, null, 2))
  }
  function copyYAML() {
    const lines = [`func: ${result.func}`, 'args:',
      ...Object.entries(result.args || {}).map(([k, v]) => `  ${k}: ${v}`)]
    navigator.clipboard.writeText(lines.join('\n'))
  }

  return (
    <div className={styles.result}>
      <div className={styles.resultHeader}>
        <span className={styles.funcSig}>{result.func}</span>
      </div>
      <div className={styles.argList}>
        {Object.entries(result.args || {}).map(([name, value]) => {
          const type = typeMap[name] || 'unknown'
          const hint = formatNumericHint(String(value), type)
          return (
            <div key={name} className={styles.argRow}>
              <span className={`${styles.argName} ${styles[valueColorClass(type)]}`}>{name}</span>
              <span className={styles.argType}>{type}</span>
              <div className={styles.argValueWrap}>
                <div className={styles.argValue}>{String(value)}</div>
                {hint && <div className={styles.argHint}>{hint}</div>}
              </div>
            </div>
          )
        })}
      </div>
      <div className={styles.copyRow}>
        <button className={styles.copyBtn} onClick={copyJSON}>Copy JSON</button>
        <button className={styles.copyBtn} onClick={copyYAML}>Copy YAML</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Update `desktop/App.jsx` to import new pages**

Replace the four `@app/` page imports and add `recentItems` state:

```jsx
// desktop/App.jsx
import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import Sidebar from './components/Sidebar'
import SetupScreen from './components/SetupScreen'
import UpdateChecker from './components/UpdateChecker'
import styles from './styles/Layout.module.css'

import DecoderPage from './pages/DecoderPage'
import ContractCallerPage from './pages/ContractCallerPage'
import ContractsPage from './pages/ContractsPage'
import AddressBookPage from './pages/AddressBookPage'

const PAGES = {
  'decoder':         DecoderPage,
  'contract-caller': ContractCallerPage,
  'contracts':       ContractsPage,
  'address-book':    AddressBookPage,
}

export default function App() {
  const [activePage, setActivePage] = useState('decoder')
  const [dbReady, setDbReady] = useState(null)
  const [recentItems, setRecentItems] = useState([])

  useEffect(() => {
    invoke('get_db_stats')
      .then(stats => setDbReady(stats.row_count > 0))
      .catch(() => setDbReady(false))
  }, [])

  if (dbReady === null) return null

  if (!dbReady) {
    return <SetupScreen onComplete={() => setDbReady(true)} />
  }

  const PageComponent = PAGES[activePage]

  return (
    <div className={styles.root}>
      <Sidebar
        activePage={activePage}
        onNavigate={setActivePage}
        recentItems={recentItems}
      />
      <main className={styles.content}>
        <PageComponent onRecentChange={setRecentItems} />
      </main>
      <UpdateChecker />
    </div>
  )
}
```

Note: `ContractCallerPage`, `ContractsPage`, `AddressBookPage` are created in later tasks. For now, create stub files so the build doesn't fail:

```jsx
// desktop/pages/ContractCallerPage.jsx
export default function ContractCallerPage() {
  return <div style={{ padding: 40, color: 'var(--text-primary)' }}>Contract Caller — coming soon</div>
}
```

```jsx
// desktop/pages/ContractsPage.jsx
export default function ContractsPage() {
  return <div style={{ padding: 40, color: 'var(--text-primary)' }}>Contracts — coming soon</div>
}
```

```jsx
// desktop/pages/AddressBookPage.jsx
export default function AddressBookPage() {
  return <div style={{ padding: 40, color: 'var(--text-primary)' }}>Address Book — coming soon</div>
}
```

- [ ] **Step 4: Verify build**

```
npm run desktop:vite-build 2>&1 | tail -5
```

Expected: `✓ built in Xs`

- [ ] **Step 5: Run tests (no regressions)**

```
npm test 2>&1 | tail -5
```

- [ ] **Step 6: Commit**

```
git add desktop/pages/ desktop/App.jsx
git commit -m "feat(desktop): add DecoderPage with split pane and keyboard shortcuts"
```

---

## Task 5: ContractCallerPage — FunctionList column

**Files:**
- Create: `desktop/pages/contract-caller/FunctionList.jsx`
- Create: `desktop/pages/contract-caller/FunctionList.module.css`

- [ ] **Step 1: Create `desktop/pages/contract-caller/FunctionList.module.css`**

```css
/* desktop/pages/contract-caller/FunctionList.module.css */
.root {
  width: 210px;
  min-width: 210px;
  border-right: 0.5px solid var(--border);
  display: flex;
  flex-direction: column;
}

.searchWrap {
  padding: 8px;
  border-bottom: 0.5px solid var(--border-subtle);
}

.search {
  width: 100%;
  background: var(--surface-hover);
  border: 0.5px solid var(--border);
  border-radius: 5px;
  padding: 5px 8px;
  font-size: 12px;
  color: var(--text-primary);
  outline: none;
}

.search::placeholder { color: var(--text-muted); }
.search:focus { border-color: var(--accent); }

.list {
  flex: 1;
  overflow-y: auto;
}

.groupLabel {
  font-size: 10px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 8px 10px 4px;
}

.fnItem {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 6px 10px;
  cursor: pointer;
  border: none;
  background: none;
  width: 100%;
  text-align: left;
  border-left: 2px solid transparent;
  color: var(--text-primary);
  font-size: 12px;
}

.fnItem:hover { background: var(--surface-hover); }

.fnItemActive {
  background: var(--accent-bg);
  border-left-color: var(--accent);
}

.badge {
  font-size: 9px;
  padding: 1px 5px;
  border-radius: 3px;
  font-weight: 700;
  text-transform: uppercase;
  flex-shrink: 0;
}

.badgeRead  { background: var(--accent-bg);       color: var(--accent); }
.badgeWrite { background: var(--accent-write-bg); color: var(--accent-write); }

.empty {
  padding: 16px 10px;
  font-size: 12px;
  color: var(--text-muted);
  text-align: center;
}
```

- [ ] **Step 2: Create `desktop/pages/contract-caller/FunctionList.jsx`**

```jsx
// desktop/pages/contract-caller/FunctionList.jsx
import { useState, useEffect, useRef } from 'react'
import { groupFunctions, filterFunctions } from '../../utils/functionGroup'
import styles from './FunctionList.module.css'

export default function FunctionList({ abi, selectedFunction, onSelect }) {
  const [query, setQuery] = useState('')
  const searchRef = useRef(null)
  const { read, write } = groupFunctions(abi)
  const filteredRead  = filterFunctions(read, query)
  const filteredWrite = filterFunctions(write, query)

  // Cmd+F focuses search
  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function renderItem(fn) {
    const isRead = ['view', 'pure'].includes(fn.stateMutability)
    const isActive = selectedFunction?.name === fn.name
    return (
      <button
        key={fn.name}
        className={`${styles.fnItem} ${isActive ? styles.fnItemActive : ''}`}
        onClick={() => onSelect(fn)}
      >
        <span className={`${styles.badge} ${isRead ? styles.badgeRead : styles.badgeWrite}`}>
          {isRead ? 'R' : 'W'}
        </span>
        {fn.name}
      </button>
    )
  }

  return (
    <div className={styles.root}>
      <div className={styles.searchWrap}>
        <input
          ref={searchRef}
          className={styles.search}
          placeholder="Filter functions…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>
      <div className={styles.list}>
        {filteredRead.length > 0 && (
          <>
            <div className={styles.groupLabel}>Read</div>
            {filteredRead.map(renderItem)}
          </>
        )}
        {filteredWrite.length > 0 && (
          <>
            <div className={styles.groupLabel}>Write</div>
            {filteredWrite.map(renderItem)}
          </>
        )}
        {filteredRead.length === 0 && filteredWrite.length === 0 && (
          <div className={styles.empty}>No functions match "{query}"</div>
        )}
        {abi.length === 0 && !query && (
          <div className={styles.empty}>Load an ABI to see functions</div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify build**

```
npm run desktop:vite-build 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```
git add desktop/pages/contract-caller/
git commit -m "feat(desktop): add FunctionList column for Contract Caller"
```

---

## Task 6: ContractCallerPage — ArgumentsPanel column

**Files:**
- Create: `desktop/pages/contract-caller/ArgumentsPanel.jsx`
- Create: `desktop/pages/contract-caller/ArgumentsPanel.module.css`

- [ ] **Step 1: Create `desktop/pages/contract-caller/ArgumentsPanel.module.css`**

```css
/* desktop/pages/contract-caller/ArgumentsPanel.module.css */
.root {
  width: 300px;
  min-width: 260px;
  border-right: 0.5px solid var(--border);
  display: flex;
  flex-direction: column;
}

.scroll {
  flex: 1;
  overflow-y: auto;
  padding: 14px 12px;
}

.fnTitle {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 2px;
}

.fnDesc {
  font-size: 11px;
  color: var(--text-muted);
  margin-bottom: 14px;
  line-height: 1.4;
}

.field { margin-bottom: 12px; }

.fieldLabel {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.typeTag {
  font-family: 'SF Mono', 'Menlo', monospace;
  font-size: 10px;
  color: var(--text-muted);
  background: var(--surface-hover);
  filter: brightness(0.85);
  padding: 1px 5px;
  border-radius: 3px;
}

.input {
  width: 100%;
  background: var(--surface-hover);
  filter: brightness(0.9);
  border: 0.5px solid var(--border);
  border-radius: 6px;
  padding: 6px 9px;
  font-size: 12px;
  font-family: 'SF Mono', 'Menlo', monospace;
  color: var(--text-primary);
  outline: none;
}

.input:focus {
  border-color: var(--accent);
  background: var(--accent-bg);
}

.disclosure {
  background: none;
  border: none;
  font-size: 11px;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px 0;
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 8px;
}

.disclosure:hover { color: var(--text-primary); }

.footer {
  padding: 10px 12px;
  border-top: 0.5px solid var(--border-subtle);
  flex-shrink: 0;
}

.callBtn {
  width: 100%;
  padding: 8px 0;
  border: none;
  border-radius: 7px;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.callBtn.read  { background: var(--accent); }
.callBtn.write { background: var(--accent-write); }
.callBtn:hover { filter: brightness(1.08); }
.callBtn:disabled { opacity: 0.5; cursor: not-allowed; }

kbd {
  font-size: 11px;
  opacity: 0.7;
  font-family: inherit;
}

.noFn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  font-size: 13px;
  padding: 20px;
  text-align: center;
}
```

- [ ] **Step 2: Create `desktop/pages/contract-caller/ArgumentsPanel.jsx`**

```jsx
// desktop/pages/contract-caller/ArgumentsPanel.jsx
import { useState } from 'react'
import { isAddress } from 'viem'
import styles from './ArgumentsPanel.module.css'

export default function ArgumentsPanel({ selectedFunction, args, onChange, onCall, isLoading }) {
  const [showAdvanced, setShowAdvanced] = useState(false)

  if (!selectedFunction) {
    return (
      <div className={styles.root}>
        <div className={styles.noFn}>Select a function from the list</div>
      </div>
    )
  }

  const isRead = ['view', 'pure'].includes(selectedFunction.stateMutability)
  const isPayable = selectedFunction.stateMutability === 'payable'
  const mainInputs = selectedFunction.inputs || []

  return (
    <div className={styles.root}>
      <div className={styles.scroll}>
        <div className={styles.fnTitle}>{selectedFunction.name}</div>
        {selectedFunction.stateMutability && (
          <div className={styles.fnDesc}>
            {isRead ? 'Read-only call' : 'Write / simulation required'}
          </div>
        )}

        {mainInputs.map(inp => (
          <div key={inp.name} className={styles.field}>
            <div className={styles.fieldLabel}>
              {inp.name || 'value'}
              <span className={styles.typeTag}>{inp.type}</span>
            </div>
            <input
              className={styles.input}
              placeholder={inp.type === 'address' ? '0x…' : inp.type}
              value={args[inp.name] ?? ''}
              onChange={e => onChange({ ...args, [inp.name]: e.target.value })}
            />
          </div>
        ))}

        <button className={styles.disclosure} onClick={() => setShowAdvanced(v => !v)}>
          {showAdvanced ? '⌄' : '›'} Advanced
        </button>

        {showAdvanced && (
          <>
            <div className={styles.field}>
              <div className={styles.fieldLabel}>Block number <span className={styles.typeTag}>optional</span></div>
              <input className={styles.input} placeholder="latest" value={args._blockNumber ?? ''} onChange={e => onChange({ ...args, _blockNumber: e.target.value })} />
            </div>
            {!isRead && (
              <div className={styles.field}>
                <div className={styles.fieldLabel}>From address <span className={styles.typeTag}>optional</span></div>
                <input className={styles.input} placeholder="0x… (sender for simulation)" value={args._from ?? ''} onChange={e => onChange({ ...args, _from: e.target.value })} />
              </div>
            )}
            {isPayable && (
              <div className={styles.field}>
                <div className={styles.fieldLabel}>ETH value <span className={styles.typeTag}>optional</span></div>
                <input className={styles.input} placeholder="0 (wei)" value={args._value ?? ''} onChange={e => onChange({ ...args, _value: e.target.value })} />
              </div>
            )}
          </>
        )}
      </div>

      <div className={styles.footer}>
        <button
          className={`${styles.callBtn} ${isRead ? styles.read : styles.write}`}
          onClick={onCall}
          disabled={isLoading}
        >
          {isLoading ? 'Running…' : (isRead ? 'Call' : 'Simulate')}
          {!isLoading && <kbd>⌘↵</kbd>}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify build**

```
npm run desktop:vite-build 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```
git add desktop/pages/contract-caller/ArgumentsPanel.jsx desktop/pages/contract-caller/ArgumentsPanel.module.css
git commit -m "feat(desktop): add ArgumentsPanel column for Contract Caller"
```

---

## Task 7: ContractCallerPage — ResultPanel column

**Files:**
- Create: `desktop/pages/contract-caller/ResultPanel.jsx`
- Create: `desktop/pages/contract-caller/ResultPanel.module.css`

- [ ] **Step 1: Create `desktop/pages/contract-caller/ResultPanel.module.css`**

```css
/* desktop/pages/contract-caller/ResultPanel.module.css */
.root {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.tabBar {
  display: flex;
  align-items: center;
  border-bottom: 0.5px solid var(--border);
  padding: 0 2px;
  flex-shrink: 0;
}

.tab {
  padding: 10px 12px;
  font-size: 12px;
  color: var(--text-muted);
  cursor: pointer;
  border: none;
  background: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
}

.tab:hover { color: var(--text-secondary); }
.tabActive { color: var(--accent); border-bottom-color: var(--accent); }

.copyTabBtn {
  margin-left: auto;
  margin-right: 8px;
  padding: 3px 8px;
  background: var(--surface-hover);
  filter: brightness(0.85);
  border: none;
  border-radius: 4px;
  font-size: 11px;
  color: var(--text-muted);
  cursor: pointer;
}
.copyTabBtn:hover { color: var(--text-primary); }

.scroll {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

/* Result */
.successCard {
  padding: 12px 14px;
  background: rgba(52, 199, 89, 0.08);
  border-left: 3px solid var(--accent-success);
  border-radius: 6px;
  margin-bottom: 12px;
  font-family: 'SF Mono', 'Menlo', monospace;
}

.resultValue { font-size: 14px; color: var(--accent-success); font-weight: 500; }
.resultHint  { font-size: 11px; color: var(--text-muted); margin-top: 2px; }

.errorCard {
  padding: 12px 14px;
  background: rgba(255, 69, 58, 0.08);
  border-left: 3px solid var(--accent-error);
  border-radius: 6px;
  font-family: 'SF Mono', 'Menlo', monospace;
  font-size: 12px;
  color: var(--accent-error);
}

/* Logs */
.logCard {
  border: 0.5px solid var(--border);
  border-radius: 6px;
  margin-bottom: 8px;
  overflow: hidden;
}

.logHeader {
  padding: 7px 10px;
  background: var(--surface-hover);
  filter: brightness(0.9);
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
}

.logEvent    { font-family: monospace; font-weight: 600; color: var(--accent); }
.logContract { font-family: monospace; font-size: 10px; color: var(--text-muted); }
.logTime     { margin-left: auto; font-size: 10px; color: var(--text-muted); }

.logArgs { padding: 6px 10px; }
.logArg  { display: flex; gap: 8px; font-size: 11px; padding: 2px 0; font-family: monospace; }
.logArgName  { color: var(--accent); min-width: 80px; }
.logArgValue { color: var(--color-uint); word-break: break-all; }

/* Trace */
.traceNode {
  font-family: 'SF Mono', 'Menlo', monospace;
  font-size: 11px;
  padding: 3px 0;
  color: var(--text-secondary);
  cursor: pointer;
}
.traceNode:hover { color: var(--text-primary); }

/* State diff */
.diffTable { width: 100%; border-collapse: collapse; font-size: 11px; }
.diffTable th {
  text-align: left;
  color: var(--text-muted);
  font-weight: 500;
  padding: 5px 8px;
  border-bottom: 0.5px solid var(--border);
  font-size: 10px;
  text-transform: uppercase;
}
.diffTable td {
  padding: 5px 8px;
  border-bottom: 0.5px solid var(--border-subtle);
  font-family: monospace;
  font-size: 11px;
  color: var(--text-primary);
  word-break: break-all;
}

.emptyTab {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100px;
  color: var(--text-muted);
  font-size: 13px;
}
```

- [ ] **Step 2: Create `desktop/pages/contract-caller/ResultPanel.jsx`**

```jsx
// desktop/pages/contract-caller/ResultPanel.jsx
import { useState } from 'react'
import styles from './ResultPanel.module.css'

const TABS = ['result', 'logs', 'trace', 'state']

export default function ResultPanel({ result, logs, trace, stateDiff, error, isLoading }) {
  const [activeTab, setActiveTab] = useState('result')

  function copyTab() {
    const data = {
      result: result,
      logs: logs,
      trace: trace,
      state: stateDiff,
    }[activeTab]
    navigator.clipboard.writeText(JSON.stringify(data ?? null, null, 2))
  }

  const tabLabels = {
    result: 'Result',
    logs:   `Logs${logs?.length ? ` (${logs.length})` : ''}`,
    trace:  'Trace',
    state:  'State Diff',
  }

  return (
    <div className={styles.root}>
      <div className={styles.tabBar}>
        {TABS.map(t => (
          <button
            key={t}
            className={`${styles.tab} ${activeTab === t ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(t)}
          >
            {tabLabels[t]}
          </button>
        ))}
        <button className={styles.copyTabBtn} onClick={copyTab}>Copy JSON</button>
      </div>

      <div className={styles.scroll}>
        {isLoading && <div className={styles.emptyTab}>Running…</div>}

        {!isLoading && activeTab === 'result' && (
          <>
            {error && <div className={styles.errorCard}>{error}</div>}
            {result != null && !error && (
              <div className={styles.successCard}>
                <div className={styles.resultValue}>{JSON.stringify(result)}</div>
              </div>
            )}
            {result == null && !error && (
              <div className={styles.emptyTab}>Call a function to see results</div>
            )}
          </>
        )}

        {!isLoading && activeTab === 'logs' && (
          <>
            {(!logs || logs.length === 0) && <div className={styles.emptyTab}>No logs</div>}
            {logs?.map((log, i) => (
              <div key={i} className={styles.logCard}>
                <div className={styles.logHeader}>
                  <span className={styles.logEvent}>{log.event || log.name || 'Event'}</span>
                  <span className={styles.logContract}>{log.address ? `${log.address.slice(0,6)}…${log.address.slice(-4)}` : ''}</span>
                </div>
                {log.args && (
                  <div className={styles.logArgs}>
                    {Object.entries(log.args).map(([k, v]) => (
                      <div key={k} className={styles.logArg}>
                        <span className={styles.logArgName}>{k}</span>
                        <span className={styles.logArgValue}>{String(v)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </>
        )}

        {!isLoading && activeTab === 'trace' && (
          <>
            {!trace && <div className={styles.emptyTab}>No trace available</div>}
            {trace && <TraceTree node={trace} depth={0} styles={styles} />}
          </>
        )}

        {!isLoading && activeTab === 'state' && (
          <>
            {(!stateDiff || stateDiff.length === 0) && <div className={styles.emptyTab}>No state changes</div>}
            {stateDiff?.length > 0 && (
              <table className={styles.diffTable}>
                <thead>
                  <tr><th>Contract</th><th>Slot</th><th>Before</th><th>After</th></tr>
                </thead>
                <tbody>
                  {stateDiff.map((row, i) => (
                    <tr key={i}>
                      <td>{row.address ? `${row.address.slice(0,6)}…${row.address.slice(-4)}` : '—'}</td>
                      <td>{row.slot}</td>
                      <td>{row.before}</td>
                      <td>{row.after}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function TraceTree({ node, depth, styles }) {
  const [open, setOpen] = useState(depth < 2)
  if (!node) return null
  const label = `${'  '.repeat(depth)}${node.type || 'CALL'} ${node.to || ''}.${node.function || ''}()`
  return (
    <div>
      <div className={styles.traceNode} onClick={() => setOpen(v => !v)}>
        {node.calls?.length ? (open ? '▼ ' : '▶ ') : '  '}{label}
      </div>
      {open && node.calls?.map((child, i) => (
        <TraceTree key={i} node={child} depth={depth + 1} styles={styles} />
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Verify build**

```
npm run desktop:vite-build 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```
git add desktop/pages/contract-caller/ResultPanel.jsx desktop/pages/contract-caller/ResultPanel.module.css
git commit -m "feat(desktop): add ResultPanel with tabbed output and copy buttons"
```

---

## Task 8: ContractCallerPage — parent component

**Files:**
- Create: `desktop/pages/ContractCallerPage.jsx`
- Create: `desktop/pages/ContractCallerPage.module.css`

- [ ] **Step 1: Create `desktop/pages/ContractCallerPage.module.css`**

```css
/* desktop/pages/ContractCallerPage.module.css */
.root {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.toolbar {
  height: 44px;
  min-height: 44px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 14px;
  background: var(--surface-1);
  border-bottom: 0.5px solid var(--border);
  -webkit-app-region: drag;
}

.addrChip {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--surface-hover);
  filter: brightness(0.85);
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 12px;
  color: var(--text-primary);
  cursor: pointer;
  -webkit-app-region: no-drag;
  border: none;
}

.chainBadge {
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--accent-bg);
  color: var(--accent);
  font-size: 10px;
  font-weight: 600;
}

.addrMono {
  font-family: 'SF Mono', 'Menlo', monospace;
  font-size: 11px;
  color: var(--text-secondary);
}

.spacer { flex: 1; }

.simBtn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 5px;
  background: var(--surface-hover);
  filter: brightness(0.85);
  border: none;
  font-size: 11px;
  color: var(--text-muted);
  cursor: pointer;
  -webkit-app-region: no-drag;
}

.simBtnActive {
  background: var(--accent-write-bg);
  color: var(--accent-write);
}

.tbarBtn {
  padding: 4px 10px;
  border-radius: 5px;
  background: var(--surface-hover);
  filter: brightness(0.85);
  border: none;
  font-size: 11px;
  color: var(--text-secondary);
  cursor: pointer;
  -webkit-app-region: no-drag;
}
.tbarBtn:hover { color: var(--text-primary); filter: brightness(1); }

.columns {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.addrEditWrap {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 0 6px;
  -webkit-app-region: no-drag;
}

.addrInput {
  background: var(--surface-hover);
  border: 0.5px solid var(--accent);
  border-radius: 5px;
  padding: 4px 8px;
  font-size: 12px;
  font-family: 'SF Mono', 'Menlo', monospace;
  color: var(--text-primary);
  outline: none;
  width: 300px;
}

.chainSelect {
  background: var(--surface-hover);
  filter: brightness(0.85);
  border: 0.5px solid var(--border);
  border-radius: 5px;
  padding: 4px 8px;
  font-size: 12px;
  color: var(--text-primary);
  outline: none;
}
```

- [ ] **Step 2: Create `desktop/pages/ContractCallerPage.jsx`**

```jsx
// desktop/pages/ContractCallerPage.jsx
import { useState, useCallback, useEffect } from 'react'
import { callContract, simulate, fetchAbi, getLogs } from '../platform'
import { parseArg } from '../utils/argParser'
import { getCachedAbi, setCachedAbi } from '@app/utils/abiCache'
import { shortenAddress } from '../utils/valueFormat'
import FunctionList from './contract-caller/FunctionList'
import ArgumentsPanel from './contract-caller/ArgumentsPanel'
import ResultPanel from './contract-caller/ResultPanel'
import styles from './ContractCallerPage.module.css'

const CHAINS = ['ethereum', 'arbitrum', 'base', 'polygon', 'bsc']

function getApiKeys() {
  try { return JSON.parse(localStorage.getItem('api_keys_settings') || '{}') } catch { return {} }
}
function getRpcSettings() {
  try { return JSON.parse(localStorage.getItem('rpc_settings') || '{}') } catch { return {} }
}
function getTenderlySettings() {
  try { return JSON.parse(localStorage.getItem('tenderly_settings') || '{}') } catch { return {} }
}

export default function ContractCallerPage() {
  const [address, setAddress]           = useState('')
  const [addressInput, setAddressInput] = useState('')
  const [editingAddr, setEditingAddr]   = useState(false)
  const [chain, setChain]               = useState('ethereum')
  const [abi, setAbi]                   = useState([])
  const [contractName, setContractName] = useState('')
  const [selectedFn, setSelectedFn]     = useState(null)
  const [args, setArgs]                 = useState({})
  const [simulationOn, setSimulationOn] = useState(false)
  const [isLoading, setIsLoading]       = useState(false)
  const [result, setResult]             = useState(null)
  const [error, setError]               = useState(null)
  const [logs, setLogs]                 = useState([])
  const [trace, setTrace]               = useState(null)
  const [stateDiff, setStateDiff]       = useState(null)

  // Load cached ABI when address + chain change
  useEffect(() => {
    if (!address) return
    const cached = getCachedAbi(chain, address)
    if (cached) {
      setAbi(cached.abi || [])
      setContractName(cached.contractName || '')
    }
  }, [address, chain])

  // Cmd+Enter shortcut
  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault(); handleCall()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }) // intentionally no dep array — always uses latest handleCall

  async function handleLoadAbi() {
    if (!address) return
    setError(null)
    try {
      const apiKeys = getApiKeys()
      const rpcSettings = getRpcSettings()
      const data = await fetchAbi(address, chain, apiKeys.etherscan, {
        rpcUrl: rpcSettings[chain],
        detectProxy: true,
      })
      setAbi(data.abi || [])
      setContractName(data.name || '')
      setCachedAbi(chain, address, data.abi, data.proxyImplementation != null, data.proxyImplementation, data.name)
    } catch (err) {
      setError(`Failed to load ABI: ${err.message}`)
    }
  }

  const handleCall = useCallback(async () => {
    if (!selectedFn || !address) return
    setIsLoading(true)
    setError(null)
    setResult(null)
    setLogs([])
    setTrace(null)
    setStateDiff(null)

    try {
      const parsedArgs = (selectedFn.inputs || []).map(inp =>
        parseArg(args[inp.name] ?? '', inp.type)
      ).filter(v => v !== undefined)

      const isWrite = !['view', 'pure'].includes(selectedFn.stateMutability)
      const apiKeys = getApiKeys()
      const rpcSettings = getRpcSettings()

      if (!isWrite || !simulationOn) {
        const resp = await callContract({
          chain,
          address,
          functionName: selectedFn.name,
          args: parsedArgs,
          abi,
          rpcUrl: rpcSettings[chain],
          blockNumber: args._blockNumber || undefined,
        })
        setResult(resp.result ?? resp)
      } else {
        const tenderly = getTenderlySettings()
        const resp = await simulate({
          chain,
          address,
          functionName: selectedFn.name,
          args: parsedArgs,
          abi,
          tenderlyAccessKey: tenderly.accessKey,
          tenderlyAccount: tenderly.account,
          tenderlyProject: tenderly.project,
          fromAddress: args._from,
          blockNumber: args._blockNumber,
        })
        setResult(resp.result ?? null)
        setLogs(resp.logs || [])
        setTrace(resp.callTrace || null)
        setStateDiff(resp.stateChanges || null)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }, [selectedFn, address, chain, abi, args, simulationOn])

  function commitAddress() {
    setAddress(addressInput)
    setEditingAddr(false)
    setSelectedFn(null)
    setArgs({})
    setResult(null)
    setError(null)
  }

  return (
    <div className={styles.root}>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        {editingAddr ? (
          <div className={styles.addrEditWrap}>
            <input
              className={styles.addrInput}
              autoFocus
              value={addressInput}
              onChange={e => setAddressInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') commitAddress(); if (e.key === 'Escape') setEditingAddr(false) }}
              placeholder="0x… contract address"
            />
            <select className={styles.chainSelect} value={chain} onChange={e => setChain(e.target.value)}>
              {CHAINS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <button className={styles.tbarBtn} onClick={commitAddress}>Go</button>
          </div>
        ) : (
          <button className={styles.addrChip} onClick={() => { setAddressInput(address); setEditingAddr(true) }}>
            <span className={styles.chainBadge}>{chain.slice(0,3).toUpperCase()}</span>
            <span className={styles.addrMono}>
              {address ? shortenAddress(address) : 'Enter address…'}
            </span>
            {contractName && <span style={{ fontSize: 11, color: 'var(--accent)' }}>{contractName}</span>}
          </button>
        )}

        <div className={styles.spacer} />

        <button
          className={`${styles.simBtn} ${simulationOn ? styles.simBtnActive : ''}`}
          onClick={() => setSimulationOn(v => !v)}
        >
          ⚡ {simulationOn ? 'Simulation on' : 'Simulation off'}
        </button>
        <button className={styles.tbarBtn} onClick={handleLoadAbi}>+ Load ABI</button>
      </div>

      {/* Three columns */}
      <div className={styles.columns}>
        <FunctionList
          abi={abi}
          selectedFunction={selectedFn}
          onSelect={fn => { setSelectedFn(fn); setArgs({}) }}
        />
        <ArgumentsPanel
          selectedFunction={selectedFn}
          args={args}
          onChange={setArgs}
          onCall={handleCall}
          isLoading={isLoading}
        />
        <ResultPanel
          result={result}
          logs={logs}
          trace={trace}
          stateDiff={stateDiff}
          error={error}
          isLoading={isLoading}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Delete the stub `ContractCallerPage.jsx` created in Task 4 and replace with this file**

The stub was a placeholder — it is replaced by the full implementation above.

- [ ] **Step 4: Verify build**

```
npm run desktop:vite-build 2>&1 | tail -5
```

- [ ] **Step 5: Run full test suite**

```
npm test 2>&1 | tail -5
```

- [ ] **Step 6: Commit**

```
git add desktop/pages/ContractCallerPage.jsx desktop/pages/ContractCallerPage.module.css
git commit -m "feat(desktop): add three-column ContractCallerPage with ABI loading and simulation"
```

---

## Task 9: ContractsPage + AddressBookPage

**Files:**
- Create: `desktop/pages/ContractsPage.jsx` + `ContractsPage.module.css`
- Create: `desktop/pages/AddressBookPage.jsx` + `AddressBookPage.module.css`

- [ ] **Step 1: Create `desktop/pages/ContractsPage.module.css`**

```css
/* desktop/pages/ContractsPage.module.css */
.root { flex: 1; display: flex; flex-direction: column; overflow: hidden; }

.toolbar {
  height: 44px; min-height: 44px;
  display: flex; align-items: center; gap: 8px; padding: 0 14px;
  background: var(--surface-1); border-bottom: 0.5px solid var(--border);
  -webkit-app-region: drag;
}

.toolbarTitle { font-size: 13px; font-weight: 600; color: var(--text-primary); }
.spacer { flex: 1; }

.search {
  background: var(--surface-hover); filter: brightness(0.85);
  border: 0.5px solid var(--border); border-radius: 5px;
  padding: 4px 8px; font-size: 12px; color: var(--text-primary);
  outline: none; width: 200px; -webkit-app-region: no-drag;
}
.search:focus { border-color: var(--accent); }

.content { flex: 1; overflow-y: auto; }

.table { width: 100%; border-collapse: collapse; }
.table th {
  text-align: left; padding: 8px 14px;
  font-size: 10px; text-transform: uppercase; letter-spacing: .5px;
  color: var(--text-muted); font-weight: 500;
  border-bottom: 0.5px solid var(--border);
  position: sticky; top: 0; background: var(--surface-0);
}
.table td {
  padding: 8px 14px; border-bottom: 0.5px solid var(--border-subtle);
  font-size: 12px; color: var(--text-primary);
}
.table tr:hover td { background: var(--surface-hover); cursor: pointer; }

.chainTag {
  display: inline-block; padding: 1px 6px; border-radius: 4px;
  background: var(--accent-bg); color: var(--accent);
  font-size: 10px; font-weight: 600;
}
.mono { font-family: 'SF Mono', 'Menlo', monospace; font-size: 11px; color: var(--text-muted); }

.empty {
  display: flex; align-items: center; justify-content: center;
  height: 200px; color: var(--text-muted); font-size: 13px;
}
```

- [ ] **Step 2: Create `desktop/pages/ContractsPage.jsx`**

```jsx
// desktop/pages/ContractsPage.jsx
import { useState, useEffect, useMemo } from 'react'
import { buildAbiCacheFromStorage } from '@app/utils/abiCache'
import { shortenAddress } from '../utils/valueFormat'
import styles from './ContractsPage.module.css'

const CHAINS = ['ethereum', 'arbitrum', 'base', 'polygon', 'bsc']

export default function ContractsPage({ onNavigate }) {
  const [query, setQuery] = useState('')
  const [contracts, setContracts] = useState([])

  useEffect(() => {
    const all = []
    for (const chain of CHAINS) {
      const cache = buildAbiCacheFromStorage(chain)
      for (const [addr, entry] of Object.entries(cache)) {
        all.push({ chain, address: addr, name: entry.contractName || '—', fnCount: (entry.abi || []).filter(i => i.type === 'function').length })
      }
    }
    setContracts(all)
  }, [])

  const filtered = useMemo(() => {
    if (!query) return contracts
    const q = query.toLowerCase()
    return contracts.filter(c =>
      c.address.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)
    )
  }, [contracts, query])

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <span className={styles.toolbarTitle}>Contracts</span>
        <div className={styles.spacer} />
        <input
          className={styles.search}
          placeholder="Search by name or address…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>
      <div className={styles.content}>
        {filtered.length === 0 ? (
          <div className={styles.empty}>
            {contracts.length === 0 ? 'No cached contracts yet' : `No results for "${query}"`}
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Address</th>
                <th>Chain</th>
                <th>Functions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, i) => (
                <tr key={i} onClick={() => onNavigate?.('contract-caller', c)}>
                  <td>{c.name}</td>
                  <td><span className={styles.mono}>{shortenAddress(c.address)}</span></td>
                  <td><span className={styles.chainTag}>{c.chain.slice(0,3).toUpperCase()}</span></td>
                  <td>{c.fnCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create `desktop/pages/AddressBookPage.module.css`**

```css
/* desktop/pages/AddressBookPage.module.css */
.root { flex: 1; display: flex; flex-direction: column; overflow: hidden; }

.toolbar {
  height: 44px; min-height: 44px;
  display: flex; align-items: center; gap: 6px; padding: 0 14px;
  background: var(--surface-1); border-bottom: 0.5px solid var(--border);
  -webkit-app-region: drag;
}

.toolbarTitle { font-size: 13px; font-weight: 600; color: var(--text-primary); }
.spacer { flex: 1; }

.tbarBtn {
  padding: 4px 10px; border-radius: 5px;
  background: var(--surface-hover); filter: brightness(0.85);
  border: none; font-size: 11px; color: var(--text-secondary);
  cursor: pointer; -webkit-app-region: no-drag;
}
.tbarBtn:hover { color: var(--text-primary); filter: brightness(1); }

.search {
  background: var(--surface-hover); filter: brightness(0.85);
  border: 0.5px solid var(--border); border-radius: 5px;
  padding: 4px 8px; font-size: 12px; color: var(--text-primary);
  outline: none; width: 200px; -webkit-app-region: no-drag;
}
.search:focus { border-color: var(--accent); }

.content { flex: 1; overflow-y: auto; }

.table { width: 100%; border-collapse: collapse; }
.table th {
  text-align: left; padding: 8px 14px;
  font-size: 10px; text-transform: uppercase; letter-spacing: .5px;
  color: var(--text-muted); font-weight: 500;
  border-bottom: 0.5px solid var(--border);
  position: sticky; top: 0; background: var(--surface-0);
}
.table td {
  padding: 8px 14px; border-bottom: 0.5px solid var(--border-subtle);
  font-size: 12px; color: var(--text-primary);
}
.table tr:hover td { background: var(--surface-hover); }

.mono { font-family: 'SF Mono', 'Menlo', monospace; font-size: 11px; color: var(--text-muted); }

.editInput {
  background: var(--accent-bg); border: 0.5px solid var(--accent);
  border-radius: 4px; padding: 2px 6px; font-size: 12px;
  color: var(--text-primary); outline: none; width: 100%;
}

.actionBtn {
  padding: 2px 7px; border-radius: 4px;
  background: none; border: 0.5px solid var(--border);
  font-size: 11px; color: var(--text-muted); cursor: pointer;
  margin-right: 4px;
}
.actionBtn:hover { color: var(--accent-error); border-color: var(--accent-error); }

.empty {
  display: flex; align-items: center; justify-content: center;
  height: 200px; color: var(--text-muted); font-size: 13px;
}
```

- [ ] **Step 4: Create `desktop/pages/AddressBookPage.jsx`**

```jsx
// desktop/pages/AddressBookPage.jsx
import { useState, useMemo } from 'react'
import {
  getAddressBook, addToAddressBook, updateAddressBookEntry,
  removeFromAddressBook, exportToCSV, importFromCSV, mergeAddressBook, saveAddressBook,
} from '@app/utils/addressBook'
import styles from './AddressBookPage.module.css'

export default function AddressBookPage() {
  const [entries, setEntries] = useState(getAddressBook)
  const [query, setQuery] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editLabel, setEditLabel] = useState('')

  const filtered = useMemo(() => {
    if (!query) return entries
    const q = query.toLowerCase()
    return entries.filter(e =>
      e.address?.toLowerCase().includes(q) || e.label?.toLowerCase().includes(q)
    )
  }, [entries, query])

  function refresh() { setEntries(getAddressBook()) }

  function handleAdd() {
    const label = prompt('Label:')
    const address = prompt('Address (0x…):')
    if (label && address) { addToAddressBook({ label, address }); refresh() }
  }

  function commitEdit(id) {
    updateAddressBookEntry(id, { label: editLabel })
    setEditingId(null)
    refresh()
  }

  function handleDelete(id) {
    removeFromAddressBook(id)
    refresh()
  }

  function handleExport() {
    const csv = exportToCSV(entries)
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = 'address-book.csv'
    a.click()
  }

  function handleImport() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.csv'
    input.onchange = async () => {
      const text = await input.files[0].text()
      const imported = importFromCSV(text)
      const merged = mergeAddressBook(entries, imported, false)
      saveAddressBook(merged)
      refresh()
    }
    input.click()
  }

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <span className={styles.toolbarTitle}>Address Book</span>
        <div className={styles.spacer} />
        <input
          className={styles.search}
          placeholder="Search…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <button className={styles.tbarBtn} onClick={handleAdd}>+ Add</button>
        <button className={styles.tbarBtn} onClick={handleImport}>Import CSV</button>
        <button className={styles.tbarBtn} onClick={handleExport}>Export CSV</button>
      </div>

      <div className={styles.content}>
        {filtered.length === 0 ? (
          <div className={styles.empty}>
            {entries.length === 0 ? 'No saved addresses yet' : `No results for "${query}"`}
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr><th>Label</th><th>Address</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {filtered.map(e => (
                <tr key={e.id}>
                  <td onDoubleClick={() => { setEditingId(e.id); setEditLabel(e.label) }}>
                    {editingId === e.id ? (
                      <input
                        autoFocus
                        className={styles.editInput}
                        value={editLabel}
                        onChange={ev => setEditLabel(ev.target.value)}
                        onBlur={() => commitEdit(e.id)}
                        onKeyDown={ev => { if (ev.key === 'Enter') commitEdit(e.id); if (ev.key === 'Escape') setEditingId(null) }}
                      />
                    ) : (e.label || '—')}
                  </td>
                  <td><span className={styles.mono}>{e.address}</span></td>
                  <td>
                    <button className={styles.actionBtn} onClick={() => navigator.clipboard.writeText(e.address)}>Copy</button>
                    <button className={styles.actionBtn} onClick={() => handleDelete(e.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Update `desktop/App.jsx` to pass `onNavigate` to ContractsPage**

In `App.jsx`, change the `<PageComponent>` render to:
```jsx
<PageComponent onRecentChange={setRecentItems} onNavigate={setActivePage} />
```

- [ ] **Step 6: Verify build**

```
npm run desktop:vite-build 2>&1 | tail -5
```

- [ ] **Step 7: Commit**

```
git add desktop/pages/ContractsPage.jsx desktop/pages/ContractsPage.module.css desktop/pages/AddressBookPage.jsx desktop/pages/AddressBookPage.module.css desktop/App.jsx
git commit -m "feat(desktop): add ContractsPage and AddressBookPage"
```

---

## Task 10: CommandPalette + keyboard wiring

**Files:**
- Create: `desktop/components/CommandPalette.jsx`
- Create: `desktop/components/CommandPalette.module.css`
- Modify: `desktop/App.jsx`

- [ ] **Step 1: Create `desktop/components/CommandPalette.module.css`**

```css
/* desktop/components/CommandPalette.module.css */
.overlay {
  position: fixed; inset: 0; z-index: 9999;
  background: rgba(0, 0, 0, 0.5);
  display: flex; align-items: flex-start; justify-content: center;
  padding-top: 15vh;
  backdrop-filter: blur(4px);
}

.modal {
  width: 560px; max-height: 400px;
  background: var(--surface-1);
  border-radius: 12px;
  box-shadow: 0 24px 80px rgba(0,0,0,0.5), 0 0 0 0.5px var(--border);
  display: flex; flex-direction: column;
  overflow: hidden;
}

.inputWrap {
  padding: 12px 16px;
  border-bottom: 0.5px solid var(--border);
  display: flex; align-items: center; gap: 8px;
}

.searchIcon { font-size: 14px; color: var(--text-muted); flex-shrink: 0; }

.input {
  flex: 1; background: none; border: none; outline: none;
  font-size: 15px; color: var(--text-primary);
}
.input::placeholder { color: var(--text-muted); }

.results { overflow-y: auto; padding: 6px 0; }

.item {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 16px; cursor: pointer; font-size: 13px;
  color: var(--text-primary); border: none; background: none; width: 100%; text-align: left;
}
.item:hover, .itemActive { background: var(--accent-bg); }

.itemIcon { font-size: 14px; width: 20px; text-align: center; color: var(--text-muted); }
.itemLabel { flex: 1; }
.itemHint { font-size: 11px; color: var(--text-muted); }

.groupLabel {
  font-size: 10px; color: var(--text-muted);
  text-transform: uppercase; letter-spacing: .5px;
  padding: 8px 16px 4px;
}

.empty {
  padding: 24px 16px; text-align: center;
  font-size: 13px; color: var(--text-muted);
}
```

- [ ] **Step 2: Create `desktop/components/CommandPalette.jsx`**

```jsx
// desktop/components/CommandPalette.jsx
import { useState, useEffect, useRef } from 'react'
import styles from './CommandPalette.module.css'

function buildCommands(onNavigate) {
  return [
    { id: 'go-decoder',         label: 'Go to Decoder',        icon: '⬡', action: () => onNavigate('decoder') },
    { id: 'go-contract-caller', label: 'Go to Contract Caller', icon: '⚙', action: () => onNavigate('contract-caller') },
    { id: 'go-contracts',       label: 'Go to Contracts',       icon: '📄', action: () => onNavigate('contracts') },
    { id: 'go-address-book',    label: 'Go to Address Book',    icon: '📖', action: () => onNavigate('address-book') },
  ]
}

export default function CommandPalette({ onNavigate, onClose }) {
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef(null)
  const commands = buildCommands(onNavigate)

  const filtered = query
    ? commands.filter(c => c.label.toLowerCase().includes(query.toLowerCase()))
    : commands

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    setActiveIdx(0)
  }, [query])

  function handleKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); onClose() }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, filtered.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)) }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[activeIdx]) { filtered[activeIdx].action(); onClose() }
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.inputWrap}>
          <span className={styles.searchIcon}>⌘</span>
          <input
            ref={inputRef}
            className={styles.input}
            placeholder="Jump to page, load contract, decode tx…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKey}
          />
        </div>
        <div className={styles.results}>
          {filtered.length === 0 && (
            <div className={styles.empty}>No results for "{query}"</div>
          )}
          {filtered.map((cmd, i) => (
            <button
              key={cmd.id}
              className={`${styles.item} ${i === activeIdx ? styles.itemActive : ''}`}
              onClick={() => { cmd.action(); onClose() }}
              onMouseEnter={() => setActiveIdx(i)}
            >
              <span className={styles.itemIcon}>{cmd.icon}</span>
              <span className={styles.itemLabel}>{cmd.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Wire CommandPalette into `desktop/App.jsx`**

Add to the existing `App.jsx`:

```jsx
import CommandPalette from './components/CommandPalette'
```

Add state after the existing state declarations:
```jsx
const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false)
```

Add a global Cmd+K listener in a `useEffect` after the existing ones:
```jsx
useEffect(() => {
  function onKey(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault()
      setCmdPaletteOpen(v => !v)
    }
  }
  window.addEventListener('keydown', onKey)
  return () => window.removeEventListener('keydown', onKey)
}, [])
```

Add the palette just before the closing `</div>` of the root element:
```jsx
{cmdPaletteOpen && (
  <CommandPalette
    onNavigate={(page) => { setActivePage(page); setCmdPaletteOpen(false) }}
    onClose={() => setCmdPaletteOpen(false)}
  />
)}
```

- [ ] **Step 4: Verify final build**

```
npm run desktop:vite-build 2>&1 | tail -5
```

Expected: `✓ built in Xs`, no errors.

- [ ] **Step 5: Run all tests**

```
npm test 2>&1 | tail -8
```

Expected: all tests pass (the 23 new utility tests + all existing tests).

- [ ] **Step 6: Commit**

```
git add desktop/components/CommandPalette.jsx desktop/components/CommandPalette.module.css desktop/App.jsx
git commit -m "feat(desktop): add CommandPalette with Cmd+K global shortcut"
```

---

## Self-Review

**Spec coverage:**
- ✅ Design tokens (auto light/dark) — Task 1
- ✅ Sidebar with DB stats badge and Recent history — Tasks 3, 4
- ✅ Toolbar component — Task 3
- ✅ DecoderPage split pane — Task 4
- ✅ Cmd+↵ decode, Cmd+L focus, Cmd+Shift+C copy — Task 4
- ✅ ContractCallerPage three columns — Tasks 5–8
- ✅ FunctionList with search and R/W grouping — Task 5
- ✅ ArgumentsPanel with Advanced disclosure — Task 6
- ✅ ResultPanel with Result/Logs/Trace/State Diff tabs — Task 7
- ✅ Copy JSON button on each tab — Task 7
- ✅ ContractsPage table — Task 9
- ✅ AddressBookPage with inline edit + CSV import/export — Task 9
- ✅ CommandPalette Cmd+K — Task 10
- ✅ App.jsx rewired to desktop/pages — Task 4
- ✅ `app/`, `src-tauri/`, `desktop/platform.js` untouched — confirmed throughout

**Placeholder scan:** No TBDs or incomplete steps found.

**Type consistency:** All prop names consistent — `onNavigate`, `onRecentChange`, `selectedFunction`, `onSelect`, `onCall` used identically across tasks.
