# macOS Desktop UX Redesign Spec

## Goal

Replace the current web-app-in-a-sidebar with a native-feeling macOS power tool. Target aesthetic: Proxyman / TablePlus / Warp — dark sidebar, split panes, keyboard-first, auto light/dark.

## Design Decisions

| Topic | Decision |
|---|---|
| Direction | Power tool (split panes, dense layout, keyboard shortcuts) |
| Color scheme | Auto — `prefers-color-scheme` only, no JS toggle |
| Scope | Full page redesign — not just chrome |
| Primary keyboard shortcuts | `Cmd+↵` execute, `Cmd+K` command palette, `Cmd+L` focus input, `Cmd+Shift+C` copy result, arrow keys in function list |
| Copy buttons | Required on all four output tabs: Result, Logs, Trace, State Diff |

---

## Design Tokens

A single `desktop/styles/tokens.css` file drives both themes via `prefers-color-scheme`. All desktop components reference these tokens — no hardcoded colours anywhere.

```css
:root {
  /* Surfaces */
  --surface-0: #f5f5f7;    /* window background */
  --surface-1: #e8e8ed;    /* sidebar */
  --surface-2: #ffffff;    /* input / card */
  --surface-hover: rgba(0,0,0,0.05);

  /* Text */
  --text-primary:   #1c1c1e;
  --text-secondary: #6e6e73;
  --text-muted:     #aeaeb2;
  --text-mono:      'SF Mono', 'Menlo', monospace;

  /* Accent */
  --accent:         #007aff;
  --accent-bg:      rgba(0,122,255,0.10);
  --accent-write:   #ff9f0a;
  --accent-write-bg: rgba(255,159,10,0.12);
  --accent-success: #34c759;
  --accent-error:   #ff453a;

  /* Borders */
  --border:         rgba(0,0,0,0.10);
  --border-subtle:  rgba(0,0,0,0.05);

  /* Sidebar */
  --sidebar-bg:     rgba(232,232,237,0.95);
  --sidebar-width:  188px;
  --nav-active-bg:  rgba(0,122,255,0.12);
  --nav-active-text: #007aff;
}

@media (prefers-color-scheme: dark) {
  :root {
    --surface-0: #1c1c1e;
    --surface-1: rgba(28,28,30,0.97);
    --surface-2: rgba(58,58,60,0.60);
    --surface-hover: rgba(255,255,255,0.06);

    --text-primary:   #e5e5ea;
    --text-secondary: #8e8e93;
    --text-muted:     #6e6e73;

    --accent:         #0a84ff;
    --accent-bg:      rgba(10,132,255,0.15);
    --accent-write:   #ff9f0a;
    --accent-write-bg: rgba(255,159,10,0.15);
    --accent-success: #34c759;
    --accent-error:   #ff453a;

    --border:         rgba(255,255,255,0.08);
    --border-subtle:  rgba(255,255,255,0.04);

    --sidebar-bg:     rgba(28,28,30,0.97);
    --nav-active-bg:  rgba(10,132,255,0.18);
    --nav-active-text: #0a84ff;
  }
}
```

---

## Window Chrome

### Sidebar (`desktop/components/Sidebar.jsx` + `Sidebar.module.css`)

- Fixed width: `var(--sidebar-width)` = 188px
- Background: `var(--sidebar-bg)` + `backdrop-filter: blur(20px)` for vibrancy
- Top 44px is drag region (traffic light clearance) — no nav items
- Nav items: icon (18px) + label, 6px border-radius, `var(--nav-active-bg)` when active
- Nav section label above each group: 10px uppercase, `var(--text-muted)`
- **Sections**: Tools (Decoder, Contract Caller, Contracts, Address Book)
- **Footer**: DB signature count badge (green dot + "2.4M signatures") — pulled from `invoke('get_db_stats')`

### Toolbar (`desktop/components/Toolbar.jsx` + `Toolbar.module.css`)

- Height: 44px, drag region except interactive elements
- Background: `var(--surface-1)` with `border-bottom: 0.5px solid var(--border)`
- Contents vary per page (see page sections below)
- Common right-side elements: Settings button, page-specific actions

### Content area

- Fills remaining space, `overflow: hidden` on container, each pane scrolls independently
- `padding-top: 0` — toolbar handles the clearance

---

## Page: Decoder

**File**: `desktop/pages/DecoderPage.jsx` (new file — does not import `@app/page.js`)

### Layout: horizontal split pane

```
┌─────────────────┬──────────────────────────┐
│  Toolbar        │                           │
├────────┬────────┤                           │
│ Input  │ Output │  (toolbar spans full width)│
│ (42%)  │ (58%)  │                           │
└────────┴────────┘
```

### Toolbar content
- Title: "Decoder" (13px semibold)
- Multicall toggle (pill switch, off by default)
- Spacer
- `Cmd+K` quick open hint button
- History button (opens history popover)

### Left pane — Input

- `<textarea>` fills the full pane height, monospace 12px, no border, transparent background
- Placeholder: `Paste hex calldata… (0x…)`
- Pane header label: "INPUT" (10px uppercase, `var(--text-muted)`)
- Footer: Decode button (`Cmd+↵`) full-width + character count on the right
- `Cmd+L` focuses this textarea

### Right pane — Output

Three states:

**Empty**: centred ghost text "Decode a transaction to see results" with a subtle ⬡ icon.

**Success**:
- Header: function signature in `var(--accent)` (e.g. `transfer(address to, uint256 value)`) + optional tag badge ("ERC-20", "ERC-721" etc. derived from known selectors)
- Body: argument table — each row: `name` (blue mono) | `type` (muted mono, fixed width) | `value` (colour by type: address=green, uint=amber, bool=accent, bytes=default)
- Numeric values over 1e15 show a human-readable hint in muted text below (e.g. "1000.0 USDC")
- Footer copy row: **Copy JSON** | **Copy YAML** | **Share** buttons

**Error**: red left-border card with the error message + raw hex still visible.

### Result value colouring
| Type | Colour token |
|---|---|
| `address` | `--accent-success` |
| `uint` / `int` | `--accent-write` (amber) |
| `bool` | `--accent` (blue) |
| `bytes` / `string` | `--text-primary` |

### Keyboard shortcuts
| Key | Action |
|---|---|
| `Cmd+↵` | Decode |
| `Cmd+L` | Focus input |
| `Cmd+Shift+C` | Copy result as JSON |
| `Cmd+K` | Open command palette |

### Sidebar additions
- "Recent" section below nav items: last 5 decoded selectors as `0xXXXXXXXX — funcName` rows, click to reload
- Clicking a history item populates the input and decodes immediately

---

## Page: Contract Caller

**File**: `desktop/pages/ContractCallerPage.jsx` (new file)

### Layout: three-column

```
┌──────────────────────────────────────────────────────┐
│ Toolbar: [address chip] [chain] [spacer] [sim] [⚙] [+ABI] │
├─────────────┬──────────────┬──────────────────────────┤
│ Functions   │  Arguments   │  Result / Logs / Trace   │
│  (210px)    │   (300px)    │     (flex: 1)            │
└─────────────┴──────────────┴──────────────────────────┘
```

### Toolbar content
- **Address chip**: chain badge (e.g. "ETH") + truncated address (first 6 + last 4) + contract name if resolved, full address on hover tooltip, click to edit
- **Chain selector**: dropdown (Ethereum, Arbitrum, Base, Polygon, BSC, + custom)
- Spacer
- **Simulation toggle**: pill button, orange when active ("⚡ Simulation on" / "Simulation off")
- **Settings** (⚙): opens a drawer for RPC URL, Tenderly credentials, block number overrides
- **+ Load ABI**: opens file picker or address import dialog

### Column 1 — Function list

- Search field at top (filters by function name, live)
- Two groups: **Read** (view/pure functions, blue `R` badge) and **Write** (state-changing, orange `W` badge)
- Each item: badge + function name, active item has left blue border + `--nav-active-bg`
- Arrow up/down navigates the list when col 1 is focused
- `Cmd+F` focuses the search field

### Column 2 — Arguments

- Function name (13px semibold) + one-line description if available from ABI `@notice`
- One `<input>` per ABI parameter: label shows param name + type tag (e.g. `address`, `uint256`)
- Address fields show address book autocomplete on focus
- Optional fields (block number, `from` address for simulation, ETH value for payable) collapsed under a "⌃ Advanced" disclosure row
- Footer: **Call** button (blue, read functions) or **Simulate** button (orange, write functions), full-width, `Cmd+↵`

### Column 3 — Output tabs

Four tabs: **Result** · **Logs (N)** · **Trace** · **State Diff**

Each tab has a **Copy** button in its tab-bar header (top-right), copies the full content of that tab as JSON.

**Result tab**:
- Success: green left-border card, decoded return value with human-readable hint
- Error: red left-border card with error message
- Below latest result: persistent call history list (timestamp + function name + args summary), click to restore

**Logs tab**:
- Each event as a card: event name (blue mono) + contract address + timestamp
- Expanded: arg rows same colour coding as Decoder output
- Copy button copies all logs as JSON array

**Trace tab**:
- Call tree with indent, each node: `CONTRACT.function(args) → result`
- Expandable/collapsible nodes
- Copy copies the full trace as JSON

**State Diff tab**:
- Table: contract address | storage slot | before | after
- Addresses link-formatted, values in hex + decimal
- Copy copies as JSON

### Keyboard shortcuts
| Key | Action |
|---|---|
| `Cmd+↵` | Call / Simulate |
| `Cmd+F` | Focus function search |
| `↑` / `↓` | Navigate function list |
| `Cmd+Shift+C` | Copy active tab as JSON |
| `Cmd+K` | Command palette |

---

## Page: Contracts

**File**: `desktop/pages/ContractsPage.jsx` (new file, replaces `@app/contracts/page.js` rendering)

- Simple two-column layout: sidebar (chain filter list) + main (contract table)
- Table columns: Name | Address | Chain | Functions count | Last used
- Click a row → opens Contract Caller pre-loaded with that contract
- Search bar at top filters by name or address
- Right-click context menu: Open in Contract Caller / Copy Address / Remove

---

## Page: Address Book

**File**: `desktop/pages/AddressBookPage.jsx` (new file)

- Full-width table: Label | Address | Chain | Tags | Actions
- Inline edit on double-click
- `+` button in toolbar to add entry
- CSV import/export buttons in toolbar
- Right-click context menu: Copy Address / Open in Contract Caller / Edit / Delete
- Search bar filters by label or address

---

## Setup Screen

**File**: `desktop/components/SetupScreen.jsx` (existing, minor updates)

- Same logic, updated styling to match new tokens
- Centre-aligned, max-width 480px, uses `--surface-0` background
- Progress bar during import (replaces plain text message)
- Link uses `--accent` colour

---

## Command Palette (`Cmd+K`)

**File**: `desktop/components/CommandPalette.jsx` (new)

- Full-screen overlay, centred modal, max-width 560px
- Search input at top
- Results: navigate to page | load recent contract | decode recent tx
- Keyboard: arrow keys to move, `↵` to select, `Esc` to dismiss
- Built with a simple filtered list over static + dynamic items — no external library

---

## File Structure

```
desktop/
  pages/
    DecoderPage.jsx          ← replaces @app/page.js for desktop
    ContractCallerPage.jsx   ← replaces @app/contract-caller/page.js
    ContractsPage.jsx        ← replaces @app/contracts/page.js
    AddressBookPage.jsx      ← replaces @app/address-book/page.js
  components/
    Sidebar.jsx              ← updated
    Toolbar.jsx              ← new shared toolbar component
    CommandPalette.jsx       ← new
    SetupScreen.jsx          ← existing, re-styled
    UpdateChecker.jsx        ← existing, re-styled
  styles/
    tokens.css               ← new: all CSS custom properties
    Layout.module.css        ← updated: references tokens
    Toolbar.module.css       ← new
    CommandPalette.module.css ← new
  App.jsx                    ← updated: imports new pages
  platform.js                ← unchanged
```

### Key architectural change

`App.jsx` imports the new `desktop/pages/*.jsx` files directly — it no longer imports `@app/page.js` etc. The Vite plugin that redirected `@app/utils/platform` to `desktop/platform.js` is still needed for any shared utilities (decoder.js, abiCache.js, etc.) that the new pages import.

---

## What is NOT changing

- `app/utils/platform.js` — web adapter, untouched
- `desktop/platform.js` — Tauri adapter, untouched
- `src-tauri/` — Rust backend, untouched
- All API logic, state management, localStorage keys — untouched
- `app/` Next.js web app — untouched

The redesign is purely `desktop/` frontend: new page components, new CSS tokens, updated layout.
