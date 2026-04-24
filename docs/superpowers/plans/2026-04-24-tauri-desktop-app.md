# Tauri macOS Desktop App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Tauri 2 macOS desktop app that reuses the existing React pages with a platform adapter pattern — Rust handles SQLite signature lookup/import, JS handles all HTTP calls, both web and desktop stay in one repo.

**Architecture:** Three co-located apps in one repo: `app/` (existing Next.js web, unchanged), `desktop/` (Vite+React Tauri frontend), `src-tauri/` (Rust backend). Pages call a `platform` module; the web adapter calls `/api/*` Next.js routes, the desktop adapter calls Tauri `invoke()` for SQLite and direct `fetch()` for external APIs (Etherscan, RPC, Tenderly). Rust manages only the SQLite database — lookup, CSV import, and weekly delta updates. The `app/utils/decoder.js` module (already written and tested) is imported directly by the desktop platform adapter for ABI decoding.

**Tech Stack:** Tauri 2.x, Rust 1.80+, rusqlite 0.32, csv 1.x, serde/serde_json, Vite 6, React 19, viem 2.x, @tauri-apps/api 2.x, vitest 3.x

---

## File Map

**New files:**
- `app/utils/platform.js` — web adapter (wraps existing `fetch('/api/*')` calls)
- `desktop/platform.js` — Tauri adapter (`invoke` for SQLite, direct fetch for HTTP)
- `desktop/vite.config.js` — Vite config with alias to `app/` source
- `desktop/index.html` — Vite HTML entry
- `desktop/main.jsx` — React app entry
- `desktop/App.jsx` — Root component with sidebar + page routing via state
- `desktop/components/Sidebar.jsx` — macOS-style persistent left nav
- `desktop/components/SetupScreen.jsx` — First-run: prompt user to import the DB file
- `desktop/components/UpdateChecker.jsx` — Weekly delta: check GitHub + prompt import
- `desktop/styles/Layout.module.css` — Desktop layout styles (sidebar + content area)
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`
- `src-tauri/capabilities/default.json`
- `src-tauri/src/main.rs`
- `src-tauri/src/lib.rs`
- `src-tauri/src/db.rs` — SQLite CRUD (lookup, import, stats)
- `src-tauri/src/commands.rs` — Tauri command handlers
- `tests/unit/platform.web.test.js` — Web adapter unit tests
- `tests/unit/platform.tauri.test.js` — Tauri adapter tests (mocked `invoke`)

**Modified files:**
- `app/page.js` — replace `fetch('/api/decode?...')` with `platform.decode()`
- `app/contract-caller/page.js` — replace 4 `fetch('/api/*')` calls with `platform.*`
- `package.json` — add `@tauri-apps/cli`, `@tauri-apps/api`, `@vitejs/plugin-react`

---

## Task 1: Platform adapter web implementation

**Files:**
- Create: `app/utils/platform.js`
- Create: `tests/unit/platform.web.test.js`

- [ ] **Step 1: Write failing tests**

```js
// tests/unit/platform.web.test.js
import { describe, it, expect, vi, afterEach } from 'vitest'

afterEach(() => vi.restoreAllMocks())

describe('platform (web) — decode', () => {
  it('calls /api/decode with the data param', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ msg: 'ok', data: [] }),
    }))
    const { decode } = await import('../../app/utils/platform.js')
    await decode('0xb82e16e3')
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/decode'))
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('data=0xb82e16e3'))
  })

  it('passes multicall, with_abi, with_sign as query params', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ msg: 'ok', data: [] }),
    }))
    const { decode } = await import('../../app/utils/platform.js')
    await decode('0xb82e16e3', { multicall: true, withAbi: true, withSign: true })
    const url = fetch.mock.calls[0][0]
    expect(url).toContain('multicall=true')
    expect(url).toContain('with_abi=true')
    expect(url).toContain('with_sign=true')
  })
})

describe('platform (web) — fetchAbi', () => {
  it('calls /api/fetch-abi with address, chain, apiKey', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ abi: [] }),
    }))
    const { fetchAbi } = await import('../../app/utils/platform.js')
    await fetchAbi('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 'ethereum', 'key123')
    const url = fetch.mock.calls[0][0]
    expect(url).toContain('/api/fetch-abi')
    expect(url).toContain('address=0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48')
    expect(url).toContain('chain=ethereum')
    expect(url).toContain('apiKey=key123')
  })
})

describe('platform (web) — callContract', () => {
  it('POSTs to /api/call-contract with the request body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: '0x' }),
    }))
    const { callContract } = await import('../../app/utils/platform.js')
    const body = { chain: 'ethereum', address: '0x1234', functionName: 'totalSupply', args: [], abi: [] }
    await callContract(body)
    expect(fetch).toHaveBeenCalledWith('/api/call-contract', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify(body),
    }))
  })
})

describe('platform (web) — simulate', () => {
  it('POSTs to /api/simulate with the request body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ simulated: true }),
    }))
    const { simulate } = await import('../../app/utils/platform.js')
    const body = { chain: 'ethereum', address: '0x1234' }
    await simulate(body)
    expect(fetch).toHaveBeenCalledWith('/api/simulate', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify(body),
    }))
  })
})

describe('platform (web) — getLogs', () => {
  it('calls /api/get-logs with serialized params', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ logs: [] }),
    }))
    const { getLogs } = await import('../../app/utils/platform.js')
    await getLogs({ address: '0x1234', fromBlock: '1000', toBlock: 'latest' })
    const url = fetch.mock.calls[0][0]
    expect(url).toContain('/api/get-logs')
    expect(url).toContain('address=0x1234')
    expect(url).toContain('fromBlock=1000')
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```
npm test -- tests/unit/platform.web.test.js
```

Expected: `FAIL` — "Cannot find module '../../app/utils/platform.js'"

- [ ] **Step 3: Implement `app/utils/platform.js`**

```js
// app/utils/platform.js
// Web adapter — delegates to the Next.js API routes.
// The desktop adapter (desktop/platform.js) provides the same interface
// using Tauri invoke() and direct fetch calls.

export async function decode(data, { count = 3, multicall = false, withAbi = false, withSign = false } = {}) {
  const params = new URLSearchParams({
    data,
    count,
    multicall,
    with_abi: withAbi,
    with_sign: withSign,
  })
  const res = await fetch(`/api/decode?${params}`)
  if (!res.ok) throw new Error(`Decode failed: ${res.statusText}`)
  return res.json()
}

export async function fetchAbi(address, chain, apiKey) {
  const params = new URLSearchParams({ address, chain, apiKey })
  const res = await fetch(`/api/fetch-abi?${params}`)
  if (!res.ok) throw new Error(`Fetch ABI failed: ${res.statusText}`)
  return res.json()
}

export async function callContract(body) {
  const res = await fetch('/api/call-contract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Call contract failed: ${res.statusText}`)
  return res.json()
}

export async function simulate(body) {
  const res = await fetch('/api/simulate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Simulate failed: ${res.statusText}`)
  return res.json()
}

export async function getLogs(params) {
  const qs = new URLSearchParams(params)
  const res = await fetch(`/api/get-logs?${qs}`)
  if (!res.ok) throw new Error(`Get logs failed: ${res.statusText}`)
  return res.json()
}
```

- [ ] **Step 4: Run tests — verify they pass**

```
npm test -- tests/unit/platform.web.test.js
```

Expected: 7 passed

- [ ] **Step 5: Commit**

```
git add app/utils/platform.js tests/unit/platform.web.test.js
git commit -m "feat: add web platform adapter wrapping Next.js API routes"
```

---

## Task 2: Refactor pages to use `platform.*`

**Files:**
- Modify: `app/page.js` (1 call site)
- Modify: `app/contract-caller/page.js` (4 call sites)

The goal is each page imports from `platform` instead of `fetch('/api/...')` directly. The web app must continue to work identically after this change.

- [ ] **Step 1: Refactor `app/page.js`**

Find the existing call (line ~260):
```js
const response = await fetch(`/api/decode?${params}`)
```

Add import at the top of the file (after existing imports):
```js
import { decode as platformDecode } from '../utils/platform'
```

Replace the fetch block. The existing code builds `params` as a URLSearchParams — replace the entire fetch + json call:
```js
// Before:
const response = await fetch(`/api/decode?${params}`)
if (!response.ok) { ... }
const result = await response.json()

// After:
const result = await platformDecode(data, {
  count: 3,
  multicall,
  withAbi: withAbi,
  withSign: withSign,
})
```

Keep all surrounding state and error-handling logic unchanged.

- [ ] **Step 2: Run existing tests — verify the decode route tests still pass**

```
npm test -- tests/api/decode.test.js
```

Expected: all pass (the route itself is unchanged; we only changed the page's consumer)

- [ ] **Step 3: Refactor `app/contract-caller/page.js` — four call sites**

Add import at top:
```js
import { fetchAbi as platformFetchAbi, callContract as platformCallContract, simulate as platformSimulate, getLogs as platformGetLogs } from '../utils/platform'
```

**Line ~1529** — fetchAbi call:
```js
// Before:
const response = await fetch(`/api/fetch-abi?${params}`)
const data = await response.json()
if (!response.ok) throw new Error(data.error || ...)

// After:
const data = await platformFetchAbi(address, selectedChain, apiKeysSettings.etherscan)
```

**Line ~1461** — standalone callContract (read-only call outside main execute flow):
```js
// Before:
const response = await fetch('/api/call-contract', { method: 'POST', ... body })
const data = await response.json()

// After:
const data = await platformCallContract(body)
```

**Line ~2169–2229** — combined execute endpoint:
```js
// Before:
const apiEndpoint = isWrite ? '/api/simulate' : '/api/call-contract'
const response = await fetch(apiEndpoint, { method: 'POST', ... body })
data = await response.json()

// After:
data = isWrite ? await platformSimulate(requestBody) : await platformCallContract(requestBody)
```

**Line ~913** — getLogs call:
```js
// Before:
const response = await fetch(`/api/get-logs?${params}`)
const data = await response.json()

// After:
const data = await platformGetLogs(Object.fromEntries(params))
```

- [ ] **Step 4: Start dev server and verify the web app works end-to-end**

```
npm run dev
```

Open http://localhost:3000 — paste a tx hash, verify it decodes. Open /contract-caller, load a contract, verify read call works.

- [ ] **Step 5: Run full test suite**

```
npm test
```

Expected: all 127 tests pass (no regressions)

- [ ] **Step 6: Commit**

```
git add app/page.js app/contract-caller/page.js
git commit -m "refactor: route all API calls through platform adapter"
```

---

## Task 3: Tauri project scaffold

**Files:**
- Create: `package.json` additions
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/capabilities/default.json`
- Create: `src-tauri/src/main.rs`
- Create: `src-tauri/src/lib.rs`
- Create: `src-tauri/src/commands.rs` (stub)
- Create: `src-tauri/src/db.rs` (stub)
- Create: `desktop/vite.config.js`
- Create: `desktop/index.html`
- Create: `desktop/main.jsx` (stub)

Prerequisites (run once, not in the plan steps):
- Install Rust: https://rustup.rs
- Install Xcode Command Line Tools: `xcode-select --install`

- [ ] **Step 1: Add Tauri and Vite dependencies**

```
npm install --save-dev @tauri-apps/cli@^2 @vitejs/plugin-react
npm install @tauri-apps/api@^2
```

Add to `package.json` scripts:
```json
"tauri": "tauri",
"desktop:dev": "tauri dev",
"desktop:build": "tauri build"
```

- [ ] **Step 2: Create `src-tauri/Cargo.toml`**

```toml
[package]
name = "decoder-desktop"
version = "0.1.0"
edition = "2021"

[lib]
name = "decoder_desktop_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-dialog = "2"
tauri-plugin-shell = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
rusqlite = { version = "0.32", features = ["bundled"] }
csv = "1"
reqwest = { version = "0.12", features = ["json", "blocking"] }
tokio = { version = "1", features = ["full"] }
```

- [ ] **Step 3: Create `src-tauri/src/lib.rs`**

```rust
use tauri::Manager;
use std::sync::Mutex;

pub mod commands;
pub mod db;

pub struct AppState {
    pub db: Mutex<rusqlite::Connection>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let db_path = data_dir.join("func_signs.db");
            let conn = rusqlite::Connection::open(&db_path)?;
            db::init_schema(&conn)?;
            app.manage(AppState { db: Mutex::new(conn) });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::lookup_abi,
            commands::lookup_event_abi,
            commands::get_db_stats,
            commands::import_signatures,
            commands::apply_delta,
        ])
        .run(tauri::generate_context!())
        .expect("error running tauri application");
}
```

- [ ] **Step 4: Create `src-tauri/src/main.rs`**

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    decoder_desktop_lib::run()
}
```

- [ ] **Step 5: Create `src-tauri/tauri.conf.json`**

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "EVM Decoder",
  "version": "0.1.0",
  "identifier": "xyz.decoder.desktop",
  "build": {
    "frontendDist": "../desktop/dist",
    "devUrl": "http://localhost:1420",
    "beforeDevCommand": "npm run desktop:vite-dev",
    "beforeBuildCommand": "npm run desktop:vite-build"
  },
  "app": {
    "windows": [
      {
        "title": "EVM Decoder",
        "width": 1280,
        "height": 800,
        "minWidth": 900,
        "minHeight": 600,
        "decorations": true
      }
    ],
    "macOSPrivateApi": true
  },
  "bundle": {
    "active": true,
    "targets": "dmg",
    "icon": ["icons/icon.icns"]
  }
}
```

- [ ] **Step 6: Create `src-tauri/capabilities/default.json`**

```json
{
  "$schema": "https://schema.tauri.app/config/2/capability",
  "identifier": "default",
  "description": "Default capabilities",
  "platforms": ["macOS"],
  "windows": ["main"],
  "permissions": [
    "core:default",
    "dialog:allow-open",
    "shell:allow-open"
  ]
}
```

- [ ] **Step 7: Create `desktop/vite.config.js`**

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

const host = process.env.TAURI_DEV_HOST

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@app': resolve(__dirname, '../app'),
    },
  },
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'index.html'),
    },
  },
  envPrefix: ['VITE_', 'TAURI_'],
})
```

- [ ] **Step 8: Create `desktop/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>EVM Decoder</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 9: Add desktop vite scripts to `package.json`**

```json
"desktop:vite-dev": "vite --config desktop/vite.config.js",
"desktop:vite-build": "vite build --config desktop/vite.config.js"
```

- [ ] **Step 10: Create stub `src-tauri/src/commands.rs` and `src-tauri/src/db.rs`**

```rust
// src-tauri/src/commands.rs
// Stubs — real implementations added in Tasks 4 and 5.

#[tauri::command]
pub fn lookup_abi(_byte_sign: String, _count: Option<usize>) -> Result<Vec<String>, String> {
    Ok(vec![])
}

#[tauri::command]
pub fn lookup_event_abi(_topic0: String, _count: Option<usize>) -> Result<Vec<String>, String> {
    Ok(vec![])
}

#[tauri::command]
pub fn get_db_stats() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({ "row_count": 0 }))
}

#[tauri::command]
pub async fn import_signatures(_file_path: String) -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({ "rows_imported": 0 }))
}

#[tauri::command]
pub async fn apply_delta(_file_path: String) -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({ "rows_imported": 0 }))
}
```

```rust
// src-tauri/src/db.rs
pub fn init_schema(conn: &rusqlite::Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS func_signs (
            pkey      TEXT PRIMARY KEY,
            byte_sign TEXT NOT NULL,
            text_sign TEXT NOT NULL,
            abi       TEXT,
            score     INTEGER DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS func_signs_byte_idx ON func_signs (byte_sign);"
    )
}
```

- [ ] **Step 11: Verify the Tauri project compiles**

```
cd src-tauri && cargo build 2>&1 | tail -5
```

Expected: `Finished dev [unoptimized + debuginfo] target(s)`

- [ ] **Step 12: Commit**

```
git add src-tauri/ desktop/vite.config.js desktop/index.html package.json package-lock.json
git commit -m "feat: scaffold Tauri 2 project and desktop Vite config"
```

---

## Task 4: Rust SQLite lookup commands

**Files:**
- Modify: `src-tauri/src/db.rs`
- Modify: `src-tauri/src/commands.rs`

- [ ] **Step 1: Write Rust tests for `db::lookup_abi` — verify they fail**

Add to the bottom of `src-tauri/src/db.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn setup() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        init_schema(&conn).unwrap();
        conn
    }

    #[test]
    fn lookup_abi_returns_empty_for_unknown_sign() {
        let conn = setup();
        let result = lookup_abi(&conn, "0xdeadbeef", 1).unwrap();
        assert!(result.is_empty());
    }

    #[test]
    fn lookup_abi_returns_entry_for_known_sign() {
        let conn = setup();
        conn.execute(
            "INSERT INTO func_signs VALUES ('pk1', '0xb82e16e3', 'getAdapters()', '{\"name\":\"getAdapters\"}', 1)",
            [],
        ).unwrap();
        let result = lookup_abi(&conn, "0xb82e16e3", 1).unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].text_sign, "getAdapters()");
    }

    #[test]
    fn lookup_abi_returns_results_sorted_by_score_desc() {
        let conn = setup();
        conn.execute(
            "INSERT INTO func_signs VALUES ('pk1', '0xb82e16e3', 'getAdapters()', null, 1)",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO func_signs VALUES ('pk2', '0xb82e16e3', 'getAdapters()', null, 10)",
            [],
        ).unwrap();
        let result = lookup_abi(&conn, "0xb82e16e3", 2).unwrap();
        assert_eq!(result[0].score, 10);
        assert_eq!(result[1].score, 1);
    }

    #[test]
    fn lookup_abi_respects_count_limit() {
        let conn = setup();
        for i in 0..5 {
            conn.execute(
                &format!("INSERT INTO func_signs VALUES ('pk{i}', '0xb82e16e3', 'getAdapters()', null, {i})"),
                [],
            ).unwrap();
        }
        let result = lookup_abi(&conn, "0xb82e16e3", 2).unwrap();
        assert_eq!(result.len(), 2);
    }

    #[test]
    fn get_stats_returns_row_count() {
        let conn = setup();
        conn.execute(
            "INSERT INTO func_signs VALUES ('pk1', '0xb82e16e3', 'getAdapters()', null, 1)",
            [],
        ).unwrap();
        let stats = get_stats(&conn).unwrap();
        assert_eq!(stats.row_count, 1);
    }
}
```

Run:
```
cd src-tauri && cargo test 2>&1 | grep -E "FAILED|error"
```

Expected: compile errors because `lookup_abi` and `get_stats` don't exist yet.

- [ ] **Step 2: Implement `db.rs` lookup functions**

Replace the stubs in `src-tauri/src/db.rs` with full implementations:

```rust
use rusqlite::{Connection, Result, params};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AbiEntry {
    pub text_sign: String,
    pub abi: Option<String>,
    pub score: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DbStats {
    pub row_count: i64,
}

pub fn init_schema(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS func_signs (
            pkey      TEXT PRIMARY KEY,
            byte_sign TEXT NOT NULL,
            text_sign TEXT NOT NULL,
            abi       TEXT,
            score     INTEGER DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS func_signs_byte_idx ON func_signs (byte_sign);"
    )
}

pub fn lookup_abi(conn: &Connection, byte_sign: &str, count: usize) -> Result<Vec<AbiEntry>> {
    let limit = count.min(10) as i64;
    let mut stmt = conn.prepare(
        "SELECT text_sign, abi, score FROM func_signs
         WHERE byte_sign = ?1
         ORDER BY score DESC
         LIMIT ?2"
    )?;
    let entries = stmt.query_map(params![byte_sign, limit], |row| {
        Ok(AbiEntry {
            text_sign: row.get(0)?,
            abi: row.get(1)?,
            score: row.get(2)?,
        })
    })?.collect::<Result<Vec<_>>>()?;
    Ok(entries)
}

pub fn lookup_event_abi(conn: &Connection, topic0: &str, count: usize) -> Result<Vec<AbiEntry>> {
    lookup_abi(conn, topic0, count)
}

pub fn get_stats(conn: &Connection) -> Result<DbStats> {
    let row_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM func_signs",
        [],
        |row| row.get(0),
    )?;
    Ok(DbStats { row_count })
}
```

- [ ] **Step 3: Run Rust tests — verify they pass**

```
cd src-tauri && cargo test db::tests 2>&1 | tail -10
```

Expected: `test result: ok. 5 passed`

- [ ] **Step 4: Implement Tauri commands in `commands.rs`**

Replace the stubs for `lookup_abi`, `lookup_event_abi`, `get_db_stats`:

```rust
use tauri::State;
use crate::{AppState, db::{self, AbiEntry, DbStats}};

#[tauri::command]
pub fn lookup_abi(
    state: State<AppState>,
    byte_sign: String,
    count: Option<usize>,
) -> Result<Vec<AbiEntry>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::lookup_abi(&conn, &byte_sign, count.unwrap_or(1))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn lookup_event_abi(
    state: State<AppState>,
    topic0: String,
    count: Option<usize>,
) -> Result<Vec<AbiEntry>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::lookup_event_abi(&conn, &topic0, count.unwrap_or(1))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_db_stats(state: State<AppState>) -> Result<DbStats, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::get_stats(&conn).map_err(|e| e.to_string())
}

// import_signatures and apply_delta stubs remain — implemented in Task 5
#[tauri::command]
pub async fn import_signatures(_file_path: String) -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({ "rows_imported": 0 }))
}

#[tauri::command]
pub async fn apply_delta(_file_path: String) -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({ "rows_imported": 0 }))
}
```

- [ ] **Step 5: Verify the project compiles with real commands**

```
cd src-tauri && cargo build 2>&1 | tail -5
```

Expected: `Finished`

- [ ] **Step 6: Commit**

```
git add src-tauri/src/db.rs src-tauri/src/commands.rs
git commit -m "feat(rust): implement SQLite lookup commands for ABI signatures"
```

---

## Task 5: CSV import and weekly delta update commands

**Files:**
- Modify: `src-tauri/src/db.rs` (add import functions)
- Modify: `src-tauri/src/commands.rs` (replace import stubs)

The full dataset CSV (~1GB, weekly delta CSV ~smaller) has columns:
`pkey,byte_sign,text_sign,abi,score` (from `evm.func_sign.csv`)

- [ ] **Step 1: Write Rust tests for import — verify they fail**

Add to the `tests` module in `src-tauri/src/db.rs`:

```rust
    #[test]
    fn import_csv_inserts_rows_into_db() {
        use std::io::Write;
        let conn = setup();
        let mut tmp = tempfile::NamedTempFile::new().unwrap();
        writeln!(tmp, "pkey,byte_sign,text_sign,abi,score").unwrap();
        writeln!(tmp, "abc123,0xb82e16e3,getAdapters(),{{\"name\":\"getAdapters\"}},1").unwrap();
        writeln!(tmp, "def456,0xa9059cbb,transfer(address\\,uint256),null,5").unwrap();
        let result = import_csv(&conn, tmp.path().to_str().unwrap()).unwrap();
        assert_eq!(result.rows_imported, 2);
        let stats = get_stats(&conn).unwrap();
        assert_eq!(stats.row_count, 2);
    }

    #[test]
    fn import_csv_skips_duplicate_pkeys() {
        use std::io::Write;
        let conn = setup();
        let mut tmp = tempfile::NamedTempFile::new().unwrap();
        writeln!(tmp, "pkey,byte_sign,text_sign,abi,score").unwrap();
        writeln!(tmp, "abc123,0xb82e16e3,getAdapters(),null,1").unwrap();
        import_csv(&conn, tmp.path().to_str().unwrap()).unwrap();
        // Import the same file again — duplicate pkey should be ignored
        let result = import_csv(&conn, tmp.path().to_str().unwrap()).unwrap();
        assert_eq!(result.rows_imported, 1); // csv rows processed
        assert_eq!(get_stats(&conn).unwrap().row_count, 1); // only 1 row in db
    }
```

Add `tempfile` to `Cargo.toml` dev-dependencies:
```toml
[dev-dependencies]
tempfile = "3"
```

Run:
```
cd src-tauri && cargo test db::tests::import 2>&1 | grep -E "FAILED|error\[E"
```

Expected: compile errors — `import_csv` not defined yet.

- [ ] **Step 2: Implement `import_csv` in `db.rs`**

Add to `src-tauri/src/db.rs`:

```rust
#[derive(Debug, Serialize, Deserialize)]
pub struct ImportResult {
    pub rows_imported: u64,
}

pub fn import_csv(conn: &Connection, file_path: &str) -> Result<ImportResult, Box<dyn std::error::Error>> {
    let mut rdr = csv::Reader::from_path(file_path)?;
    let tx = conn.unchecked_transaction()?;
    let mut count: u64 = 0;
    for record in rdr.records() {
        let r = record?;
        // CSV columns: pkey, byte_sign, text_sign, abi, score
        // Older delta CSVs may omit created_at/updated_at — use get() with fallback
        let pkey     = r.get(0).unwrap_or("");
        let byte_sign = r.get(1).unwrap_or("");
        let text_sign = r.get(2).unwrap_or("");
        let abi      = r.get(3).filter(|s| !s.is_empty() && *s != "null");
        let score: i64 = r.get(4).and_then(|s| s.parse().ok()).unwrap_or(0);
        tx.execute(
            "INSERT OR IGNORE INTO func_signs (pkey, byte_sign, text_sign, abi, score)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![pkey, byte_sign, text_sign, abi, score],
        )?;
        count += 1;
    }
    tx.commit()?;
    Ok(ImportResult { rows_imported: count })
}
```

- [ ] **Step 3: Run import tests — verify they pass**

```
cd src-tauri && cargo test db::tests::import 2>&1 | tail -5
```

Expected: `test result: ok. 2 passed`

- [ ] **Step 4: Implement the `import_signatures` Tauri command**

Replace the stub in `commands.rs`:

```rust
#[tauri::command]
pub async fn import_signatures(
    app: tauri::AppHandle,
    file_path: String,
) -> Result<serde_json::Value, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = data_dir.join("func_signs.db");
    tauri::async_runtime::spawn_blocking(move || {
        let conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;
        db::import_csv(&conn, &file_path)
            .map(|r| serde_json::json!({ "rows_imported": r.rows_imported }))
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn apply_delta(
    app: tauri::AppHandle,
    file_path: String,
) -> Result<serde_json::Value, String> {
    // apply_delta is identical to import_signatures — both use INSERT OR IGNORE
    import_signatures(app, file_path).await
}
```

`apply_delta` reuses `import_signatures` because both do `INSERT OR IGNORE` — delta CSVs are just smaller CSV files with the same schema.

- [ ] **Step 5: Verify build**

```
cd src-tauri && cargo build 2>&1 | tail -5
```

Expected: `Finished`

- [ ] **Step 6: Commit**

```
git add src-tauri/src/db.rs src-tauri/src/commands.rs src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "feat(rust): implement CSV import and delta update for func_signs SQLite DB"
```

---

## Task 6: Desktop Vite frontend — sidebar layout

**Files:**
- Create: `desktop/main.jsx`
- Create: `desktop/App.jsx`
- Create: `desktop/components/Sidebar.jsx`
- Create: `desktop/styles/Layout.module.css`

This task produces the navigation skeleton. Pages are not wired up yet (that's Task 7).

- [ ] **Step 1: Create `desktop/components/Sidebar.jsx`**

```jsx
// desktop/components/Sidebar.jsx
import styles from '../styles/Layout.module.css'

const NAV_ITEMS = [
  { id: 'decoder',         label: 'Decoder',         icon: '⬡' },
  { id: 'contract-caller', label: 'Contract Caller',  icon: '⚙' },
  { id: 'contracts',       label: 'Contracts',        icon: '📄' },
  { id: 'address-book',    label: 'Address Book',     icon: '📖' },
]

export default function Sidebar({ activePage, onNavigate }) {
  return (
    <nav className={styles.sidebar}>
      <div className={styles.sidebarHeader} />
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
    </nav>
  )
}
```

- [ ] **Step 2: Create `desktop/styles/Layout.module.css`**

```css
/* desktop/styles/Layout.module.css */
.root {
  display: flex;
  height: 100vh;
  background: var(--bg, #1a1a1a);
  color: var(--fg, #e0e0e0);
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif;
}

/* Leave space for macOS traffic-light buttons (top-left) */
.sidebar {
  width: 200px;
  min-width: 200px;
  background: rgba(30, 30, 30, 0.85);
  -webkit-backdrop-filter: blur(20px);
  backdrop-filter: blur(20px);
  border-right: 1px solid rgba(255,255,255,0.08);
  display: flex;
  flex-direction: column;
  padding-top: 8px;
}

.sidebarHeader {
  height: 28px; /* traffic light clearance */
  -webkit-app-region: drag;
}

.navItem {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 16px;
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  border-radius: 6px;
  margin: 1px 6px;
  width: calc(100% - 12px);
  text-align: left;
  font-size: 13px;
  transition: background 0.1s;
}

.navItem:hover {
  background: rgba(255,255,255,0.07);
}

.navItemActive {
  background: rgba(255,255,255,0.12);
}

.navIcon { font-size: 15px; width: 20px; text-align: center; }
.navLabel { font-size: 13px; }

.content {
  flex: 1;
  overflow: auto;
  padding: 0;
  /* Push content clear of traffic lights on the top */
  padding-top: 28px;
}
```

- [ ] **Step 3: Create `desktop/App.jsx`**

```jsx
// desktop/App.jsx
import { useState } from 'react'
import Sidebar from './components/Sidebar'
import styles from './styles/Layout.module.css'

// Lazy imports of existing web pages
// 'use client' directives in these files are harmless in a Vite/React context
import DecoderPage from '@app/page.js'
import ContractCallerPage from '@app/contract-caller/page.js'
import ContractsPage from '@app/contracts/page.js'
import AddressBookPage from '@app/address-book/page.js'

const PAGES = {
  'decoder':         DecoderPage,
  'contract-caller': ContractCallerPage,
  'contracts':       ContractsPage,
  'address-book':    AddressBookPage,
}

export default function App() {
  const [activePage, setActivePage] = useState('decoder')
  const PageComponent = PAGES[activePage]

  return (
    <div className={styles.root}>
      <Sidebar activePage={activePage} onNavigate={setActivePage} />
      <main className={styles.content}>
        <PageComponent />
      </main>
    </div>
  )
}
```

- [ ] **Step 4: Create `desktop/main.jsx`**

```jsx
// desktop/main.jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

- [ ] **Step 5: Verify Vite builds the desktop frontend without errors**

```
npm run desktop:vite-build 2>&1 | tail -10
```

Expected: `built in Xs` with no errors. Some warnings about `'use client'` are acceptable.

- [ ] **Step 6: Commit**

```
git add desktop/
git commit -m "feat(desktop): add Vite+React frontend with macOS sidebar layout"
```

---

## Task 7: Desktop platform adapter (Tauri)

**Files:**
- Create: `desktop/platform.js`
- Create: `tests/unit/platform.tauri.test.js`

This is the core of the Tauri frontend — every platform call routes to either a Tauri command (for SQLite) or a direct `fetch()` (for external APIs). The `app/utils/decoder.js` module does ABI decoding locally without any network call.

- [ ] **Step 1: Write failing tests for the Tauri adapter**

```js
// tests/unit/platform.tauri.test.js
import { describe, it, expect, vi, afterEach } from 'vitest'

// Mock @tauri-apps/api/core before importing the adapter
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

afterEach(() => vi.restoreAllMocks())

describe('platform (tauri) — decode', () => {
  it('calls invoke lookup_abi with the 4-byte selector', async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    invoke.mockResolvedValue([]) // no ABI found
    const { decode } = await import('../../desktop/platform.js')
    const result = await decode('0xb82e16e3aabbccdd')
    expect(invoke).toHaveBeenCalledWith('lookup_abi', {
      byte_sign: '0xb82e16e3',
      count: 3,
    })
    expect(result).toEqual({ msg: 'ok', data: [] })
  })

  it('decodes calldata when ABI is found', async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    invoke.mockResolvedValue([{
      text_sign: 'getAdapters()',
      abi: JSON.stringify({ name: 'getAdapters', type: 'function', inputs: [], outputs: [], stateMutability: 'view' }),
      score: 1,
    }])
    const { decode } = await import('../../desktop/platform.js')
    const result = await decode('0xb82e16e3')
    expect(result.msg).toBe('ok')
    expect(result.data[0].func).toBe('getAdapters()')
  })
})

describe('platform (tauri) — fetchAbi', () => {
  it('calls Etherscan V2 API directly', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: '1', result: [{ ABI: '[]', ContractName: 'Test' }] }),
    }))
    const { fetchAbi } = await import('../../desktop/platform.js')
    await fetchAbi('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 'ethereum', 'mykey')
    const url = fetch.mock.calls[0][0]
    expect(url).toContain('api.etherscan.io')
    expect(url).toContain('chainid=1')
  })
})

describe('platform (tauri) — getLogs', () => {
  it('calls Etherscan V2 API directly for logs', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: '1', result: [] }),
    }))
    const { getLogs } = await import('../../desktop/platform.js')
    await getLogs({ address: '0x1234', fromBlock: '0', toBlock: 'latest', chainId: 1, apiKey: 'k' })
    const url = fetch.mock.calls[0][0]
    expect(url).toContain('api.etherscan.io')
  })
})
```

Run:
```
npm test -- tests/unit/platform.tauri.test.js
```

Expected: FAIL — `Cannot find module '../../desktop/platform.js'`

- [ ] **Step 2: Implement `desktop/platform.js`**

```js
// desktop/platform.js
// Tauri adapter — replaces Next.js API routes for the desktop app.
// SQLite lookups go through Tauri invoke(); HTTP calls hit external APIs directly.
import { invoke } from '@tauri-apps/api/core'
import { decodeFunctionCalldata, decodeEventLog, isValidHexData } from '@app/utils/decoder.js'

const ETHERSCAN_V2 = 'https://api.etherscan.io/v2/api'

const CHAIN_IDS = {
  ethereum: 1,
  arbitrum: 42161,
  base: 8453,
  polygon: 137,
  bsc: 56,
}

// ---------------------------------------------------------------------------
// decode — SQLite lookup + viem ABI decoding
// ---------------------------------------------------------------------------
export async function decode(data, { count = 3, withAbi = false, withSign = false } = {}) {
  if (!data.startsWith('0x')) data = '0x' + data
  if (!isValidHexData(data)) throw new Error('Invalid hex data')

  const selector = data.slice(0, 10)
  const candidates = await invoke('lookup_abi', { byte_sign: selector, count })

  const errors = []
  for (const entry of candidates) {
    const abi = entry.abi ? JSON.parse(entry.abi) : null
    if (!abi) continue
    try {
      const decoded = decodeFunctionCalldata(abi, data)
      const item = { func: decoded.func, args: decoded.args }
      if (withSign) item.sign = selector
      if (withAbi) item.abi = abi
      return { msg: 'ok', data: [item] }
    } catch (err) {
      errors.push({ error: err.message, abi })
    }
  }

  if (candidates.length === 0) return { msg: 'ok', data: [] }
  return { msg: 'error', error: errors }
}

// ---------------------------------------------------------------------------
// fetchAbi — Etherscan V2 + Sourcify + proxy detection (runs in WebView JS)
// Mirrors the logic in app/api/fetch-abi/route.js
// ---------------------------------------------------------------------------
export async function fetchAbi(address, chain, apiKey) {
  const chainId = CHAIN_IDS[chain]

  // 1. Try Etherscan
  const params = new URLSearchParams({
    chainid: chainId,
    module: 'contract',
    action: 'getsourcecode',
    address,
    apikey: apiKey || '',
  })
  const res = await fetch(`${ETHERSCAN_V2}?${params}`)
  const json = await res.json()

  if (json.status === '1' && json.result?.[0]?.ABI !== 'Contract source code not verified') {
    const info = json.result[0]
    let abi = JSON.parse(info.ABI)
    const name = info.ContractName

    // Proxy detection: check EIP-1967 implementation slot
    const implAddr = await getProxyImplementation(address, chain)
    if (implAddr) {
      const implResult = await fetchAbi(implAddr, chain, apiKey)
      if (implResult.abi) {
        // Merge: implementation ABI + proxy ABI (deduplicated by name)
        const merged = mergeAbis(abi, implResult.abi)
        return { abi: merged, name, proxyImplementation: implAddr }
      }
    }

    return { abi, name }
  }

  // 2. Fallback to Sourcify
  const sourcifyRes = await fetch(
    `https://repo.sourcify.dev/contracts/full_match/${chainId}/${address}/metadata.json`
  )
  if (sourcifyRes.ok) {
    const meta = await sourcifyRes.json()
    return { abi: meta.output.abi, name: Object.keys(meta.settings.compilationTarget)[0] }
  }

  throw new Error('Contract ABI not found on Etherscan or Sourcify')
}

async function getProxyImplementation(address, chain) {
  // Check EIP-1967 implementation slot via eth_getStorageAt
  const EIP1967_IMPL_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc'
  try {
    const { createPublicClient, http } = await import('viem')
    const { mainnet, arbitrum, base, polygon, bsc } = await import('viem/chains')
    const CHAINS = { ethereum: mainnet, arbitrum, base, polygon, bsc }
    const client = createPublicClient({ chain: CHAINS[chain], transport: http() })
    const val = await client.getStorageAt({ address, slot: EIP1967_IMPL_SLOT })
    if (!val || val === '0x' + '0'.repeat(64)) return null
    return '0x' + val.slice(26) // last 20 bytes
  } catch {
    return null
  }
}

function mergeAbis(proxyAbi, implAbi) {
  const names = new Set(proxyAbi.map(item => item.name))
  return [...proxyAbi, ...implAbi.filter(item => !names.has(item.name))]
}

// ---------------------------------------------------------------------------
// callContract — viem readContract (runs in WebView JS, no proxy needed)
// ---------------------------------------------------------------------------
export async function callContract(body) {
  const { createPublicClient, http, defineChain } = await import('viem')
  const { mainnet, arbitrum, base, polygon, bsc } = await import('viem/chains')

  const CHAINS = { ethereum: mainnet, arbitrum, base, polygon, bsc }
  const chain = body.chainId
    ? defineChain({ id: body.chainId, name: body.chain, nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [body.rpcUrl] } } })
    : CHAINS[body.chain]

  const client = createPublicClient({
    chain,
    transport: http(body.rpcUrl || undefined),
  })

  const result = await client.readContract({
    address: body.address,
    abi: body.abi,
    functionName: body.functionName,
    args: body.args || [],
    blockNumber: body.blockNumber ? BigInt(body.blockNumber) : undefined,
  })

  return { result: JSON.parse(JSON.stringify(result, (_, v) => typeof v === 'bigint' ? v.toString() : v)) }
}

// ---------------------------------------------------------------------------
// simulate — Tenderly (already direct in the web app too)
// ---------------------------------------------------------------------------
export async function simulate(body) {
  const url = `https://api.tenderly.co/api/v1/account/${body.tenderlyAccount}/project/${body.tenderlyProject}/simulate`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Access-Key': body.tenderlyAccessKey,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Tenderly simulation failed: ${res.statusText}`)
  return res.json()
}

// ---------------------------------------------------------------------------
// getLogs — Etherscan V2 (direct)
// ---------------------------------------------------------------------------
export async function getLogs({ address, fromBlock, toBlock, topic0, chainId, apiKey }) {
  const params = new URLSearchParams({
    chainid: chainId,
    module: 'logs',
    action: 'getLogs',
    address: address || '',
    fromBlock: fromBlock || '0',
    toBlock: toBlock || 'latest',
    topic0: topic0 || '',
    apikey: apiKey || '',
  })
  const res = await fetch(`${ETHERSCAN_V2}?${params}`)
  if (!res.ok) throw new Error(`Get logs failed: ${res.statusText}`)
  return res.json()
}
```

- [ ] **Step 3: Run tests — verify they pass**

```
npm test -- tests/unit/platform.tauri.test.js
```

Expected: all pass

- [ ] **Step 4: Run full test suite to check no regressions**

```
npm test
```

Expected: all tests pass

- [ ] **Step 5: Commit**

```
git add desktop/platform.js tests/unit/platform.tauri.test.js
git commit -m "feat(desktop): implement Tauri platform adapter with local decode + direct HTTP"
```

---

## Task 8: First-run setup screen and weekly update checker

**Files:**
- Create: `desktop/components/SetupScreen.jsx`
- Create: `desktop/components/UpdateChecker.jsx`
- Modify: `desktop/App.jsx`

The setup screen appears when the SQLite DB has 0 rows. The update checker runs on startup and prompts if a newer delta is available on GitHub.

- [ ] **Step 1: Create `desktop/components/SetupScreen.jsx`**

```jsx
// desktop/components/SetupScreen.jsx
import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'

export default function SetupScreen({ onComplete }) {
  const [status, setStatus] = useState('idle') // idle | importing | done | error
  const [progress, setProgress] = useState('')
  const [error, setError] = useState(null)

  async function handleImport() {
    try {
      const selected = await open({
        title: 'Select evm_func_signs.csv or .db file',
        filters: [{ name: 'Signatures', extensions: ['csv', 'db'] }],
      })
      if (!selected) return

      setStatus('importing')
      setProgress('Importing signatures… this may take a few minutes for the full dataset.')
      const result = await invoke('import_signatures', { file_path: selected })
      setProgress(`Done — ${result.rows_imported.toLocaleString()} signatures imported.`)
      setStatus('done')
      setTimeout(onComplete, 1500)
    } catch (err) {
      setError(err.message)
      setStatus('error')
    }
  }

  return (
    <div style={{ padding: '60px', maxWidth: '520px', margin: '0 auto', textAlign: 'center' }}>
      <h2>Welcome to EVM Decoder</h2>
      <p>
        To decode transaction calldata offline, download the function signatures database (~1 GB)
        and import it here.
      </p>
      <p style={{ fontSize: 13, color: '#888' }}>
        Download from:{' '}
        <a href="https://github.com/your-org/evm-func-signs/releases/latest" target="_blank" rel="noreferrer">
          GitHub Releases
        </a>
        {' '}(evm_func_signs.csv)
      </p>
      {status === 'idle' && (
        <button onClick={handleImport} style={{ padding: '10px 24px', marginTop: 16 }}>
          Import Signatures File…
        </button>
      )}
      {status === 'importing' && <p>{progress}</p>}
      {status === 'done' && <p style={{ color: '#4caf50' }}>{progress}</p>}
      {status === 'error' && <p style={{ color: '#f44336' }}>Error: {error}</p>}
      <p style={{ marginTop: 24, fontSize: 12, color: '#666' }}>
        You can skip this and use the app without local decoding — ABI lookups from Etherscan will still work.
      </p>
      <button onClick={onComplete} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer' }}>
        Skip for now
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Create `desktop/components/UpdateChecker.jsx`**

```jsx
// desktop/components/UpdateChecker.jsx
// Checks GitHub Releases for a newer evm_func_signs delta CSV.
// Compares the release tag (date-based, e.g. "2026-04-28") against localStorage.
import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'

const RELEASES_URL = 'https://api.github.com/repos/your-org/evm-func-signs/releases/latest'
const LAST_UPDATE_KEY = 'func_signs_last_update'

export default function UpdateChecker() {
  const [update, setUpdate] = useState(null) // { tag, url } | null
  const [status, setStatus] = useState('idle')

  useEffect(() => {
    checkForUpdate()
  }, [])

  async function checkForUpdate() {
    try {
      const res = await fetch(RELEASES_URL)
      if (!res.ok) return
      const release = await res.json()
      const latestTag = release.tag_name
      const lastTag = localStorage.getItem(LAST_UPDATE_KEY)
      if (latestTag !== lastTag) {
        const asset = release.assets?.find(a => a.name.endsWith('.csv'))
        if (asset) setUpdate({ tag: latestTag, url: asset.browser_download_url })
      }
    } catch { /* ignore network errors */ }
  }

  async function handleApply() {
    try {
      const selected = await open({
        title: 'Select downloaded delta CSV',
        filters: [{ name: 'Delta CSV', extensions: ['csv'] }],
      })
      if (!selected) return
      setStatus('applying')
      const result = await invoke('apply_delta', { file_path: selected })
      localStorage.setItem(LAST_UPDATE_KEY, update.tag)
      setStatus('done')
      setUpdate(null)
      console.log(`Delta applied: ${result.rows_imported} new signatures`)
    } catch (err) {
      setStatus('error')
      console.error('Delta apply failed:', err)
    }
  }

  if (!update) return null

  return (
    <div style={{
      position: 'fixed', bottom: 16, right: 16,
      background: '#2a2a2a', border: '1px solid #444',
      borderRadius: 8, padding: '12px 16px',
      maxWidth: 320, zIndex: 1000,
    }}>
      <p style={{ margin: '0 0 8px', fontSize: 13 }}>
        New signatures available ({update.tag}). Download the delta CSV from GitHub and import it.
      </p>
      {status === 'idle' && (
        <button onClick={handleApply} style={{ marginRight: 8 }}>Import Delta…</button>
      )}
      {status === 'applying' && <span style={{ fontSize: 12 }}>Applying…</span>}
      {status === 'done' && <span style={{ fontSize: 12, color: '#4caf50' }}>Updated!</span>}
      {status === 'error' && <span style={{ fontSize: 12, color: '#f44336' }}>Failed</span>}
      <button onClick={() => setUpdate(null)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', float: 'right' }}>
        ✕
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Wire setup screen into `App.jsx`**

Modify `desktop/App.jsx` to check DB stats on startup and show SetupScreen if empty:

```jsx
// desktop/App.jsx
import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import Sidebar from './components/Sidebar'
import SetupScreen from './components/SetupScreen'
import UpdateChecker from './components/UpdateChecker'
import styles from './styles/Layout.module.css'

import DecoderPage from '@app/page.js'
import ContractCallerPage from '@app/contract-caller/page.js'
import ContractsPage from '@app/contracts/page.js'
import AddressBookPage from '@app/address-book/page.js'

const PAGES = {
  'decoder':         DecoderPage,
  'contract-caller': ContractCallerPage,
  'contracts':       ContractsPage,
  'address-book':    AddressBookPage,
}

export default function App() {
  const [activePage, setActivePage] = useState('decoder')
  const [dbReady, setDbReady] = useState(null) // null = loading

  useEffect(() => {
    invoke('get_db_stats')
      .then(stats => setDbReady(stats.row_count > 0))
      .catch(() => setDbReady(false))
  }, [])

  if (dbReady === null) return null // brief loading flash

  if (!dbReady) {
    return <SetupScreen onComplete={() => setDbReady(true)} />
  }

  const PageComponent = PAGES[activePage]

  return (
    <div className={styles.root}>
      <Sidebar activePage={activePage} onNavigate={setActivePage} />
      <main className={styles.content}>
        <PageComponent />
      </main>
      <UpdateChecker />
    </div>
  )
}
```

- [ ] **Step 4: Verify desktop Vite build succeeds**

```
npm run desktop:vite-build 2>&1 | tail -5
```

Expected: `built in Xs` with no errors

- [ ] **Step 5: Commit**

```
git add desktop/components/ desktop/App.jsx
git commit -m "feat(desktop): add first-run setup screen and weekly delta update checker"
```

---

## Task 9: Build, sign, and distribute

**Files:**
- Modify: `src-tauri/tauri.conf.json` (bundle config)
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Add app icons**

Generate a 1024×1024 PNG icon, then run Tauri's icon generator:
```
npx @tauri-apps/cli@^2 icon path/to/icon.png
```

This creates `src-tauri/icons/` with all required sizes including `icon.icns`.

- [ ] **Step 2: Update `src-tauri/tauri.conf.json` bundle section**

```json
{
  "bundle": {
    "active": true,
    "targets": ["dmg", "app"],
    "icon": ["icons/icon.icns", "icons/icon.ico", "icons/icon.png"],
    "macOS": {
      "minimumSystemVersion": "13.0",
      "signingIdentity": null,
      "providerShortName": null
    }
  }
}
```

For notarized production builds, replace `null` values with your Apple Developer credentials (set via environment variables in CI, not hardcoded here).

- [ ] **Step 3: Test local unsigned build**

```
npm run desktop:build 2>&1 | tail -15
```

Expected: `src-tauri/target/release/bundle/dmg/EVM Decoder_0.1.0_aarch64.dmg` created.

- [ ] **Step 4: Create `.github/workflows/release.yml`**

```yaml
name: Release Desktop App

on:
  push:
    tags:
      - 'desktop-v*'

jobs:
  build-macos:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Install dependencies
        run: npm ci

      - name: Import Apple signing certificate
        if: env.APPLE_CERTIFICATE != ''
        env:
          APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}
          APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
        run: |
          echo "$APPLE_CERTIFICATE" | base64 --decode > certificate.p12
          security create-keychain -p "" build.keychain
          security import certificate.p12 -k build.keychain -P "$APPLE_CERTIFICATE_PASSWORD" -T /usr/bin/codesign
          security list-keychains -s build.keychain
          security default-keychain -s build.keychain
          security unlock-keychain -p "" build.keychain
          security set-key-partition-list -S apple-tool:,apple: -s -k "" build.keychain

      - name: Build and sign
        env:
          APPLE_SIGNING_IDENTITY: ${{ secrets.APPLE_SIGNING_IDENTITY }}
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
        run: npm run desktop:build

      - name: Upload DMG to GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          files: src-tauri/target/release/bundle/dmg/*.dmg
```

GitHub secrets needed: `APPLE_CERTIFICATE` (base64 .p12), `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY` (e.g. `Developer ID Application: Your Name (TEAMID)`), `APPLE_ID`, `APPLE_PASSWORD` (app-specific password), `APPLE_TEAM_ID`.

- [ ] **Step 5: Tag and trigger a release**

```
git tag desktop-v0.1.0
git push origin desktop-v0.1.0
```

Watch the Actions tab — the DMG will be attached to the GitHub Release.

- [ ] **Step 6: Verify the DMG installs and runs on macOS**

Mount the DMG, drag the app to `/Applications`, double-click. On first run, macOS Gatekeeper may warn — right-click → Open to bypass on unsigned builds. Notarized builds open without warning.

- [ ] **Step 7: Commit release config**

```
git add src-tauri/tauri.conf.json .github/workflows/release.yml
git commit -m "feat(ci): add GitHub Actions release workflow for macOS DMG"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Offline SQLite signature lookup (~1GB DB, downloaded by user) → Tasks 4, 5, 8
- ✅ Weekly delta auto-update → Task 8 (UpdateChecker)
- ✅ No full rewrite — platform adapter pattern, web app unchanged → Tasks 1, 2
- ✅ No CORS — all HTTP calls direct from WebView (Etherscan/Sourcify/Tenderly already support it; RPC endpoints generally do too) → Task 7
- ✅ Multicall skipped (noted as future TODO in decoder.js) → intentional
- ✅ Tauri 2.x → Tasks 3, 4, 5
- ✅ Direct `.dmg` distribution → Task 9
- ✅ Both web and native maintained in one repo → Tasks 1, 2, 6
- ✅ `app/utils/decoder.js` (already written) reused in desktop adapter → Task 7

**Gaps / notes:**
- The `'use client'` directive in web pages is harmless in Vite but may cause build warnings — suppress with a Vite plugin or remove from pages if it becomes an issue.
- `desktop/platform.js` `callContract` uses dynamic `import('viem')` for simplicity. For bundle size, switch to a static import at the top of the file.
- The GitHub org/repo URL in `SetupScreen` and `UpdateChecker` is a placeholder (`your-org/evm-func-signs`) — replace with the real repo before shipping.
- Proxy detection in `fetchAbi` covers EIP-1967 only; the full web route also checks beacon and OZ legacy slots. Add those if needed.
