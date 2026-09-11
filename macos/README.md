# EthDecodeMac — macOS Native Client

A native macOS app for the eth-decoder web app. Thin client that calls the same `/api/v1/` REST endpoints.

## Features

- **Transaction Decoder** — paste hex calldata, get decoded function + args, multicall inner calls, universal router commands; switch result view between highlighted JSON and YAML
- **Signature Lookup** — query 4-byte selectors and event topic0s via the API
- **Contract Caller — Read** — fetch ABI, select function, fill args, call via `/api/call-contract`
- **Contract Caller — Simulate** — encode calldata natively (ABI encoder + keccak256), simulate via `/api/simulate-tx`; status header with gas/block metrics, event logs, balance-change table and recursive call trace
- **History** — "Recent Decodes" / "Recent Calls" sections docked under each tool with search, hide/show and clear-all
- **Settings** (`⌘,`) — configure the API base URL and Etherscan API key in a standard settings window

Requires **macOS 14 (Sonoma) or newer**.

## Build & Run

```bash
cd macos
swift run EthDecodeMac          # dev build
make macos-run                  # from repo root (same thing)
make macos-build                # release .app bundle → macos/EthDecodeMac.app
```

Point it at your deployed instance (defaults to `https://eth-decoder.vercel.app`, change in Settings).

## History Storage

History persists to **SQLite** at:

```
~/Library/Application Support/EthDecode/history.sqlite
```

Two tables (`decoder_history`, `caller_history`) hold the same JSON-shaped entries as the web app's localStorage. WAL journaling is enabled. The app keeps arrays in memory and writes them back in one transaction per mutation (≤100 decoder / ≤50 caller rows). History written by older UserDefaults-based builds is imported once on first launch and then removed from UserDefaults. Delete `history.sqlite` to reset history.

If Application Support is unwritable the app degrades gracefully to session-only history.

## Tests

```bash
cd macos
swift run EthDecodeMacRunTests
```

Covers keccak-256, the ABI encoder (against known EVM vectors), the JSON value model, API model decoding, and SQLite history round-trips (decoder/caller rows, null columns, arg arrays, session bundles, schema idempotency).

## Architecture

- **`EthDecodeCore`** — library target: models, API client, keccak-256, ABI encoder, history models + `HistoryDatabase` (system libsqlite3 via `import SQLite3`, no external dependencies)
- **`EthDecodeMac`** — executable target: SwiftUI views (`App.swift` shell + `Views/`), code-panel design system (`Components.swift`), JSON syntax highlighter + YAML writer (`SyntaxHighlight.swift`), inline history strips (`HistoryStrip.swift`)
- **`EthDecodeMacRunTests`** — executable target: standalone test runner (no XCTest/Testing dependency)
