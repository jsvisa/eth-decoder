# EthDecodeMac — macOS Native Client

A native macOS app for the eth-decoder web app. Thin client that calls the same `/api/v1/` REST endpoints.

## Features

- **Transaction Decoder** — paste hex calldata, get decoded function + args, multicall inner calls, universal router commands
- **Signature Lookup** — query 4-byte selectors and event topic0s via the API
- **Contract Caller — Read** — fetch ABI, select function, fill args, call via `/api/call-contract`
- **Contract Caller — Simulate** — encode calldata natively (ABI encoder + keccak256), simulate via `/api/simulate-tx`
- **Settings** — configure the API base URL and Etherscan API key

## Build & Run

```bash
cd macos
swift run EthDecodeMac
```

The app will open a window. Point it at your deployed instance (defaults to `http://localhost:3000`).

## API Base URL

By default the app connects to `http://localhost:3000`. Change this in Settings (`Settings` in the sidebar):

- **Local dev**: `http://localhost:3000` (or the port `next dev` gives you)
- **Production**: `https://your-deployment.vercel.app`

## Tests

```bash
cd macos
swift run EthDecodeMacRunTests
```

Tests the keccak-256 implementation, ABI encoder (against known EVM vectors), JSON value model, and API model decoding.

## Architecture

- **`EthDecodeCore`** — library target: models, API client, keccak-256, ABI encoder
- **`EthDecodeMac`** — executable target: SwiftUI views (App.swift + Views/)
- **`EthDecodeMacRunTests`** — executable target: standalone test runner (no XCTest/Testing dependency)

All ABI encoding is done natively in Swift (keccak-256, Solidity ABI head/tail encoding). The app does not depend on any external Swift packages.
