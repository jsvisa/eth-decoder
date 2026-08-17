# EVM Tx.input Decoder & Contract Caller

A web application for decoding EVM transaction input data and interacting with smart contracts. Built with Next.js and designed for deployment on Vercel.

## Features

### Transaction Decoder

- Hex string validation and input field for EVM transaction data
- Real-time decoding via proxied API
- **Auto multicall detection**: recognises all standard multicall selectors by their 4-byte signature — no manual toggle needed
- **Deep inner-call decoding**: for `tuple_array`, `bytes_array`, and Universal Router variants, each inner call's `data` field is decoded and shown as `inner_calls[].decoded`
- **Universal Router support**: commands byte is split into named sub-commands (`V3_SWAP_EXACT_IN`, `WRAP_ETH`, `SWEEP`, …) with their decoded arguments
- JSON and YAML formatted output with syntax highlighting
- Copy to clipboard functionality
- Shareable URLs — generate links to share decoded transactions
- Recent decode history (stores up to 100 items in browser localStorage)
- Click history items to quickly reload previous decodes
- ABI and signature decoding options

### Contract Caller

- **Multi-chain support**: Ethereum, Arbitrum, Base, Polygon, BSC
- **ABI Management**:
  - Auto-fetch ABI via Sourcify → Etherscan → Routescan fallback chain
  - Automatic proxy contract detection and implementation ABI fetching
  - ABI caching in localStorage for faster subsequent loads
  - Contract address autocomplete from cached ABIs
  - Compact ABI display format
- **Function Interaction**:
  - Searchable function dropdown with R/W badges
  - Function selector (4-byte signature) display with copy functionality
  - Full function signature display with copy functionality
  - Support for all Solidity types including arrays and tuples
  - ETH value input for payable functions
- **Read Functions**: Direct RPC calls to read contract state
- **Write Functions (Simulation)**:
  - **Local simulation (tevm)** — in-browser transaction simulation using forked chain state
  - Decoded event logs with parameter names and types
  - Call trace tree visualization with nested contract calls
  - Asset/balance changes display
  - State changes (storage diff) display
  - Gas usage estimation
- **History**: Recent calls saved with function name, args, and decoded output
- **API Key Validation**: Test buttons to verify Etherscan API keys

## URL Parameters

### Transaction Decoder

```
https://your-domain.vercel.app/tx-decoder?data=0x1234abcd...&with_abi=true&with_sign=true
```

- `data` (required): Hex string to decode
- `with_abi` (optional): Set to `true` to include the matched ABI in the response
- `with_sign` (optional): Set to `true` to include the 4-byte selector in the response

Multicall is detected automatically from the function selector — no parameter needed.

The app will automatically populate the input and trigger decoding when these parameters are present.

### Contract Caller

```
https://your-domain.vercel.app/?simulationId=<uuid>
```

- `simulationId` (required): UUID returned by `/api/simulate-tx` or generated when saving a simulation result via the Share URL button. Loads a previously-saved simulation result from the server-side cache (Vercel Blob in production, local filesystem in development), restores the network, contract address, from address, function + arguments, and token prices.

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Configure environment variables:
   - Copy `.env.example` to `.env.local`
   - For full functionality, set `BACKEND_URL` to your backend API endpoint (optional — signature lookups work via Sourcify alone)

3. Run the development server:

```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser

## API Keys Configuration

The app requires API keys for full functionality:

### Etherscan API Key

- Required for fetching contract ABIs from block explorers
- Get your free API key from [Etherscan](https://etherscan.io/myapikey)
- Works across all supported chains (Etherscan, Arbiscan, Basescan, etc.)

### Routescan API Key

- Optional fallback for ABI fetching when Etherscan doesn't cover a chain
- Get your API key from [Routescan](https://routescan.io/api-key)

All API keys are stored locally in your browser and never sent to our servers.

## Public API

The app exposes a versioned public API at `/api/v1/` that can be used by external tools and scripts.

### `GET /api/v1/decode`

Decode EVM transaction calldata. For known multicall selectors the response always includes `inner_calls` — no extra parameter needed.

| Parameter   | Required | Description                                           |
| ----------- | -------- | ----------------------------------------------------- |
| `data`      | Yes      | Hex-encoded calldata (with or without `0x` prefix)    |
| `with_abi`  | No       | `true` to include the matched ABI in the response     |
| `with_sign` | No       | `true` to include the 4-byte selector in the response |

```
GET /api/v1/decode?data=0xa9059cbb000000000000000000000000...
```

**Multicall auto-detection.** The following selectors are recognised automatically and the response includes an `inner_calls` array. The outer item exposes a `multicall_type` field (one of `bytes_array`, `tuple_array`, `parallel_arrays`, `universal_router`) so consumers can branch without sniffing selectors:

| Selector     | Function                                                           | Type             | `multicall_type`   |
| ------------ | ------------------------------------------------------------------ | ---------------- | ------------------ |
| `0xac9650d8` | `multicall(bytes[])`                                               | bytes_array      | `bytes_array`      |
| `0x5ae401dc` | `multicall(uint256,bytes[])`                                       | bytes_array      | `bytes_array`      |
| `0x1e859a05` | `multicall(uint256,bytes[],address[],address[],uint256[],address)` | bytes_array      | `bytes_array`      |
| `0x60fc8466` | `multicall((bool,bytes)[])`                                        | tuple_array      | `tuple_array`      |
| `0x374f435d` | `multicall((address,bytes,uint256,bool,bytes32)[])`                | tuple_array      | `tuple_array`      |
| `0x82ad56cb` | `aggregate3((address,bool,bytes)[])`                               | tuple_array      | `tuple_array`      |
| `0x571d3dc7` | `execute((address,uint256,bytes)[],bytes32)`                       | tuple_array      | `tuple_array`      |
| `0x69340beb` | `multicall((address,uint256,bytes)[],bool)`                        | tuple_array      | `tuple_array`      |
| `0xcaa5c23f` | `multicall((address,bytes)[])`                                     | tuple_array      | `tuple_array`      |
| `0x63fb0b96` | `multicall(address[],bytes[])`                                     | parallel_arrays  | `parallel_arrays`  |
| `0x61f9a531` | `multicall(address[],bytes[],uint256[],address)`                   | parallel_arrays  | `parallel_arrays`  |
| `0x2656227d` | `execute(address[],uint256[],bytes[],bytes32)`                     | parallel_arrays  | `parallel_arrays`  |
| `0x24856bc3` | `execute(bytes,bytes[])`                                           | Universal Router | `universal_router` |
| `0x3593564c` | `execute(bytes,bytes[],uint256)`                                   | Universal Router | `universal_router` |

Each element of `inner_calls` carries a `type` discriminator: `call` for multicall inner calls (with `index`, `selector`, and `data`) and `command` for Universal Router commands (with `name` such as `V3_SWAP_EXACT_IN`, `allow_revert`, and decoded `args`). For `tuple_array` variants the target address and extra fields (`value`, `skipRevert`, …) are included. For `parallel_arrays` variants the target address and value are zipped from the parallel arrays. When the inner selector is known to OpenChain, a `decoded` object with `func` and `args` is attached.

### `GET /api/v1/query`

Look up a function selector or event topic0 by its hex signature. Queries **Sourcify (4byte.directory) first**, then falls back to `BACKEND_URL` if configured.

| Parameter | Required | Description                                                         |
| --------- | -------- | ------------------------------------------------------------------- |
| `sign`    | Yes      | 4-byte function selector (e.g. `0xa9059cbb`) or 32-byte event topic |

```
GET /api/v1/query?sign=0xa9059cbb
```

**Response:**

```json
{
  "msg": "ok",
  "data": {
    "text_sign": "transfer(address,uint256)",
    "output": null,
    "abi": null
  }
}
```

Unlike `/api/v1/decode` and `/api/v1/decode-event`, this endpoint does **not** require `BACKEND_URL` — Sourcify alone is sufficient. The backend is only consulted when Sourcify has no match.

**Response shape:** `data` is a single object when there is exactly one match (Sourcify matches always return one; backend single-element lists are collapsed to a dict), and a list of objects when the backend returns multiple matches.

### `GET /api/v1/decode-event`

Decode an EVM event log. Proxies to the configured `BACKEND_URL`, with a Sourcify fallback for unknown signatures.

| Parameter | Required | Description                                                  |
| --------- | -------- | ------------------------------------------------------------ |
| `sign`    | Yes      | `topic0` — the 32-byte keccak256 hash of the event signature |
| `topics`  | No       | Comma-separated list of all log topics (including `topic0`)  |
| `data`    | No       | Hex-encoded log data (defaults to `0x`)                      |

```
GET /api/v1/decode-event?sign=0xddf252ad...&topics=0xddf252ad...,0x000...&data=0x000...
```

### `GET /api/v1/fetch-abi`

Fetch the verified ABI for a contract. Tries Sourcify first, then Etherscan, then Routescan. Automatically detects proxy contracts and merges the implementation ABI.

| Parameter     | Required | Description                                                            |
| ------------- | -------- | ---------------------------------------------------------------------- |
| `address`     | Yes      | Contract address                                                       |
| `chain`       | No       | Chain name: `ethereum` (default), `arbitrum`, `base`, `polygon`, `bsc` |
| `apiKey`      | No       | Etherscan API key (falls back to `ETHERSCAN_API_KEY` env var)          |
| `detectProxy` | No       | `true` to force on-chain proxy detection via storage slots             |

```
GET /api/v1/fetch-abi?address=0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48&chain=ethereum&apiKey=YOUR_KEY
```

> `/api/v1/decode` and `/api/v1/decode-event` require `BACKEND_URL` to be set. `/api/v1/query` and `/api/v1/fetch-abi` work without it (Sourcify-only or self-contained).

### `POST /api/simulate-tx`

Simulate a raw transaction against forked chain state and return decoded results. Fetches and caches the contract ABI server-side at `~/.cache/eth-decoder/<chainId>/<address>.json` outside Vercel, or `/tmp/eth-decoder/<chainId>/<address>.json` on Vercel.

**Request body:**

| Field              | Required | Description                                                                                                                      |
| ------------------ | -------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `chainId`          | Yes      | Numeric chain ID (1 = Ethereum, 42161 = Arbitrum, 8453 = Base, 137 = Polygon, 56 = BSC)                                          |
| `to`               | Yes      | Contract address                                                                                                                 |
| `data`             | Yes      | Hex-encoded calldata                                                                                                             |
| `from`             | Yes      | Sender address — used as `msg.sender` in simulation                                                                              |
| `value`            | No       | Hex-encoded ETH value (default `"0x0"`)                                                                                          |
| `blockNumber`      | No       | Hex block number or `"latest"` (default `"latest"`)                                                                              |
| `gas`              | No       | Hex gas limit (passed through; tevm estimates if omitted)                                                                        |
| `apiKeys`          | No       | `{ "etherscan": "...", "routescan": "..." }` — falls back to `ETHERSCAN_API_KEY` / `ROUTESCAN_API_KEY` env vars                  |
| `rpcUrl`           | No       | Custom RPC URL for forking chain state. Falls back to default public node if omitted.                                            |
| `balanceOverrides` | No       | Array of `{address, balance}` — sets native ETH balance for addresses before simulation (same as `vm.deal`)                      |
| `storageOverrides` | No       | Array of `{address, slot, value}` — sets contract storage slots before simulation                                                |
| `cheatcodes`       | No       | Object with `deal`, `warp`, or `prank` keys. See cheatcodes details below.                                                       |
| `price`            | No       | `true` (default) to enrich `balanceChanges` with token symbols, decimals, and USD prices. Pass `false` to skip.                  |
| `rpcBatchSize`     | No       | JSON-RPC batch size for state-fetch requests during prefetch (default `20`).                                                     |
| `includeMetrics`   | No       | `true` to include the `metrics` field (timing + RPC call counters) in the response. Omitted by default.                          |
| `save`             | No       | `true` to store the result and return `simulationId` / `simulationLink` for later restore via `?simulationId=`. Default `false`. |

**Cheatcodes:**

| Field              | Description                                                                       |
| ------------------ | --------------------------------------------------------------------------------- |
| `cheatcodes.deal`  | `{address, amount}` — sets ETH balance (same as balanceOverrides, single address) |
| `cheatcodes.warp`  | `{timestamp}` — sets block timestamp (Unix seconds, number)                       |
| `cheatcodes.prank` | `{address}` — impersonates `msg.sender` (overrides `from`)                        |

**Example:**

```bash
curl -X POST http://localhost:3000/api/simulate-tx \
  -H "Content-Type: application/json" \
  -d '{
    "chainId": 1,
    "to": "0x99161BA892ECae335616624c84FAA418F64FF9A6",
    "data": "0x5e7db13d000000000000000000000000e556aba6fe6036275ec1f87eda296be72c811bce0000000000000000000000000000000000000000000000000000000000000001",
    "from": "0xd719fc03782E9617e81D138a3e9B1875da4D6a03",
    "value": "0x0"
  }'
```

**Response fields:**

| Field                | Type           | Description                                                                                                               |
| -------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `success`            | `boolean`      | `false` if the transaction reverted                                                                                       |
| `simulated`          | `boolean`      | Always `true` for simulated results                                                                                       |
| `blockNumber`        | `string`       | Block height the simulation ran against                                                                                   |
| `gasUsed`            | `number`       | Gas consumed by the execution                                                                                             |
| `logs`               | `Array`        | Decoded event logs (name, topics, data, inputs)                                                                           |
| `callTrace`          | `object\|null` | Tree of call frames with decoded inputs/outputs                                                                           |
| `balanceChanges`     | `Array`        | Token + native ETH balance changes extracted from logs and trace                                                          |
| `stateChanges`       | `Array`        | Storage slot changes (currently always `[]`)                                                                              |
| `metrics`            | `object`       | Timing and RPC call counters. Only present when the request sets `includeMetrics: true`                                   |
| `rawData`            | `string`       | Hex-encoded raw return data from the contract call. `"0x"` for void functions (e.g. `transfer`) or when the call reverted |
| `decoded`            | `Array`        | Decoded function return values `[{name, type, value}]`. Empty `[]` for void functions or when the ABI has no outputs      |
| `error`              | `string\|null` | Human-readable revert reason or `null`                                                                                    |
| `accessList`         | `Array`        | Addresses and storage keys accessed                                                                                       |
| `undecodedAddresses` | `Array`        | Log-emitting addresses whose ABI wasn't available                                                                         |
| `requestBody`        | `object`       | Input params used (`chainId`, `to`, `from`, `value`, `data`, `gas`, `blockNumber`, `functionName`, `args`)                |
| `simulationId`       | `string\|null` | UUID for retrieving a saved result via `?simulationId=`. Only set when the request had `save: true`                       |

**Example with cheatcodes:**

```bash
curl -X POST http://localhost:3000/api/simulate-tx \
  -H "Content-Type: application/json" \
  -d '{
    "chainId": 1,
    "to": "0x99161BA892ECae335616624c84FAA418F64FF9A6",
    "data": "0x5e7db13d...",
    "from": "0xd719fc03782E9617e81D138a3e9B1875da4D6a03",
    "cheatcodes": {
      "deal": { "address": "0xabc", "amount": "100" },
      "warp": { "timestamp": 1700000000 },
      "prank": { "address": "0xdef" }
    }
  }'
```

**Error responses:**

| Status                   | Condition                                                                |
| ------------------------ | ------------------------------------------------------------------------ |
| `400`                    | Missing required field, invalid address format, or unsupported `chainId` |
| `422`                    | Contract ABI not found (unverified) or calldata could not be decoded     |
| `200` (`success: false`) | EVM revert or execution error — `error` field is set                     |
| `500`                    | Unexpected server error                                                  |

**ABI cache:** Fetched ABIs are cached at `~/.cache/eth-decoder/<chainId>/<address>.json` outside Vercel, or `/tmp/eth-decoder/<chainId>/<address>.json` on Vercel. Set `CACHE_DIR` to override the base directory. Delete a file to force a fresh fetch.

**Shared simulation result storage:** Simulation result links use short result IDs. On Vercel, configure Vercel Blob so results are stored as private blobs and can be read across function instances and deployments. Without Blob credentials, Vercel falls back to `/tmp`, which is only a temporary instance-local cache. Outside Vercel, results are stored in `~/.cache/eth-decoder/simulations` unless `SIMULATION_CACHE_DIR` or `CACHE_DIR` overrides the path.

Required Vercel Blob environment:

- `BLOB_STORE_ENABLED=true`, and
- `BLOB_READ_WRITE_TOKEN`, or
- `BLOB_STORE_ID` with `VERCEL_OIDC_TOKEN`

Blob storage is only used when `BLOB_STORE_ENABLED=true` is set; unset it (or set to anything other than `true`/`1`) to force the filesystem cache instead.

### Session mode

Pass a `calls` array instead of single `to`/`data`/`from` to simulate a sequence of transactions against a single shared forked state. Each call commits its state changes, so later calls see the effects of earlier ones.

**Request:**

```bash
curl -X POST http://localhost:3000/api/simulate-tx \
  -H "Content-Type: application/json" \
  -d '{
    "chainId": 8453,
    "blockNumber": "latest",
    "save": true,
    "calls": [
      {
        "to": "0x11dC28D01984079b7efE7763b533e6ed9E3722B9",
        "data": "0x095ea7b3000000000000000000000000000000000022d473030f116ddee9f6b43ac78ba3ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
        "value": "0x00",
        "from": "0x00eF17D98Ca5AcF523379CFdf006B739cCF46297"
      },
      {
        "to": "0x000000000022D473030F116dDEE9F6B43aC78BA3",
        "data": "0x87517c4500000000000000000000000011dc28d01984079b7efe7763b533e6ed9e3722b9000000000000000000000000fdf682f51fe81aa4898f0ae2163d8a55c127fbc7000000000000000000000000ffffffffffffffffffffffffffffffffffffffff000000000000000000000000000000000000000000000000000000006aa6a541",
        "value": "0x00",
        "from": "0x00eF17D98Ca5AcF523379CFdf006B739cCF46297"
      },
      {
        "to": "0xFdf682F51FE81Aa4898F0AE2163d8A55c127fbC7",
        "data": "0x3593564c0000000000000000000000000000000000000000000000000000000000000060...756e697800000000000c",
        "value": "0x00",
        "from": "0x00eF17D98Ca5AcF523379CFdf006B739cCF46297"
      }
    ]
  }'
```

The example above is a real 3-call flow on Base (chain `8453`) from the EOA `0x00eF...6297`:

1. **Call 1 — approve SYND to the Universal Router** (`0x095ea7b3`): approves the router contract (`0xFdf6...fbC7`) via the Permit2 token approval path, spending the SYND token (`0x11dC...2B9`) up to `uint256.max`.
2. **Call 2 — approve the SYND/USDC pool on Permit2** (`0x87517c45`): calls the Permit2 contract (`0x0000...a78BA3`) to approve the SYND token for the router's token spender, with a `uint160.max` amount and a set expiration.
3. **Call 3 — execute the swap** (`0x3593564c`): invokes the Universal Router's `execute` to swap SYND → USDC (and ETH → WETH) through the pools, using the approvals granted in calls 1–2.

The sequence matters: the swap (call 3) only succeeds because the two approvals run first, which is why a session — not three separate simulations — is the correct way to model it.

**Session inputs:**

| Field              | Required | Description                                                                                                                                                                       |
| ------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `calls`            | Yes      | Array of per-call request objects (min 1). Each call supports the single-call fields: `to`, `data`, `from`, `value`, `gas`, `balanceOverrides`, `storageOverrides`, `cheatcodes`. |
| `to`               | Yes      | Contract address the call targets.                                                                                                                                                |
| `data`             | Yes      | Hex-encoded calldata for the call.                                                                                                                                                |
| `from`             | Yes      | Sender address — used as `msg.sender` for the call.                                                                                                                               |
| `value`            | No       | Hex-encoded ETH value sent with the call (default `"0x0"`).                                                                                                                       |
| `gas`              | No       | Hex gas limit for the call (tevm estimates if omitted).                                                                                                                           |
| `balanceOverrides` | No       | Per-call balance overrides; merged over session-level ones (later keys win).                                                                                                      |
| `storageOverrides` | No       | Per-call storage overrides; merged over session-level ones.                                                                                                                       |
| `cheatcodes`       | No       | Per-call cheatcodes; merged over session-level ones.                                                                                                                              |

Session-level `value`, `gas`, `balanceOverrides`, `storageOverrides`, `cheatcodes`, `rpcUrl`, and `price` act as defaults for every call; a call may override any of them per-call. Calls run sequentially in order — each call's state changes are committed before the next one executes.

**Session response:**

<details>
<summary>Click to expand the session response example</summary>

```json
{
  "session": true,
  "chainId": 8453,
  "blockNumber": "latest",
  "results": [
    {
      "success": true,
      "simulated": true,
      "gasUsed": 24611,
      "callTrace": {
        "functionName": "approve",
        "to": "0x11dc28d01984079b7efe7763b533e6ed9e3722b9",
        "decodedInputs": [
          {
            "name": "spender",
            "type": "address",
            "value": "0x000000000022D473030F116dDEE9F6B43aC78BA3"
          },
          {
            "name": "amount",
            "type": "uint256",
            "value": "115792089237316195423570985008687907853269984665640564039457584007913129639935"
          }
        ],
        "decodedOutputs": [{ "name": "result", "type": "bool", "value": true }],
        "logs": []
      },
      "logs": [
        {
          "name": "Approval",
          "address": "0x11dc28d01984079b7efe7763b533e6ed9e3722b9",
          "inputs": []
        }
      ],
      "requestBody": {
        "chainId": 8453,
        "to": "0x11dC28D01984079b7efE7763b533e6ed9E3722B9",
        "from": "0x00eF17D98Ca5AcF523379CFdf006B739cCF46297",
        "data": "0x095ea7b3000000000000000000000000000000000022d473030f116ddee9f6b43ac78ba3ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
        "functionName": "approve"
      }
    },
    {
      "success": true,
      "simulated": true,
      "gasUsed": 25450,
      "callTrace": {
        "functionName": "approve",
        "to": "0x000000000022d473030f116ddee9f6b43ac78ba3",
        "decodedInputs": [
          {
            "name": "token",
            "type": "address",
            "value": "0x11dC28D01984079b7efE7763b533e6ed9E3722B9"
          },
          {
            "name": "spender",
            "type": "address",
            "value": "0xFdf682F51FE81Aa4898F0AE2163d8A55c127fbC7"
          },
          {
            "name": "amount",
            "type": "uint160",
            "value": "1461501637330902918203684832716283019655932542975"
          },
          { "name": "expiration", "type": "uint48", "value": 1789306177 }
        ],
        "decodedOutputs": [],
        "logs": []
      },
      "logs": [
        {
          "name": "Approval",
          "address": "0x000000000022d473030f116ddee9f6b43ac78ba3",
          "inputs": []
        }
      ],
      "requestBody": {
        "chainId": 8453,
        "to": "0x000000000022D473030F116dDEE9F6B43aC78BA3",
        "from": "0x00eF17D98Ca5AcF523379CFdf006B739cCF46297",
        "data": "0x87517c4500000000000000000000000011dc28d01984079b7efe7763b533e6ed9e3722b9000000000000000000000000fdf682f51fe81aa4898f0ae2163d8a55c127fbc7000000000000000000000000ffffffffffffffffffffffffffffffffffffffff000000000000000000000000000000000000000000000000000000006aa6a541",
        "functionName": "approve"
      }
    },
    {
      "_tokenMeta": {
        "tokenSymbols": {
          "0x11dc28d01984079b7efe7763b533e6ed9e3722b9": "SYND",
          "0x4200000000000000000000000000000000000006": "WETH",
          "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": "USDC"
        },
        "tokenDecimals": {
          "0x11dc28d01984079b7efe7763b533e6ed9e3722b9": 18,
          "0x4200000000000000000000000000000000000006": 18,
          "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": 6
        },
        "tokenPrices": {
          "0x0000000000000000000000000000000000000000": 1869.5,
          "0x11dc28d01984079b7efe7763b533e6ed9e3722b9": 0.00826309,
          "0x4200000000000000000000000000000000000006": 1867.67,
          "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": 0.999626
        }
      },
      "success": true,
      "simulated": true,
      "gasUsed": 445553,
      "callTrace": {
        "functionName": "execute",
        "to": "0xfdf682f51fe81aa4898f0ae2163d8a55c127fbc7",
        "calls": [
          {
            "functionName": "unlockCallback",
            "to": "0x498581ff718922c3f8e6a244956af099b2652b2b",
            "calls": []
          }
        ]
      },
      "balanceChanges": [
        {
          "address": "0x00ef17d98ca5acf523379cfdf006b739ccf46297",
          "amount": "-0.053340",
          "decimals": 18,
          "name": "SYND",
          "price": 0.00826309,
          "symbol": "SYND",
          "tokenAddress": "0x11dc28d01984079b7efe7763b533e6ed9e3722b9",
          "value": "-53340583743236474",
          "valueUsd": -0.0004407580441228999
        },
        {
          "address": "0x00ef17d98ca5acf523379cfdf006b739ccf46297",
          "amount": "0.000439",
          "decimals": 6,
          "name": "USDC",
          "price": 0.999626,
          "symbol": "USDC",
          "tokenAddress": "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
          "value": "439",
          "valueUsd": 0.000438835814
        }
      ],
      "logs": [
        {
          "name": "Swap",
          "address": "0x498581ff718922c3f8e6a244956af099b2652b2b",
          "inputs": []
        }
      ],
      "requestBody": {
        "chainId": 8453,
        "to": "0xFdf682F51FE81Aa4898F0AE2163d8A55c127fbC7",
        "from": "0x00eF17D98Ca5AcF523379CFdf006B739cCF46297",
        "data": "0x3593564c0000000000000000000000000000000000000000000000000000000000000060...756e697800000000000c",
        "functionName": "execute"
      }
    }
  ],
  "simulationId": "e31a1c0f-cb0b-4f27-8f45-92be4c3ab7f1"
}
```

</details>

**Session response fields:**

| Field          | Type      | Description                                                                                               |
| -------------- | --------- | --------------------------------------------------------------------------------------------------------- |
| `session`      | `boolean` | Always `true`                                                                                             |
| `chainId`      | `number`  | Chain the session ran on                                                                                  |
| `blockNumber`  | `string`  | Block the session forked from                                                                             |
| `results`      | `Array`   | One result per call, in order — each shaped like a single-call response (including its own `requestBody`) |
| `simulationId` | `string`  | Present when `save: true` — restores the whole session via `?simulationId=`                               |

**Restoring a saved session:** With `save: true`, the entire session (all calls) is stored under a single `simulationId`. Open the returned `simulationLink` (or append `?simulationId=<id>` to the Contract Caller URL) to restore the whole session. The page renders every call's result as its own panel and repopulates the form with the last call's `requestBody`.

Restoring the saved result in the Contract Caller UI looks like:

![Restored session result](./docs/simulate-session.png)

## Deploy to Vercel

### Method 1: Deploy via Vercel CLI

1. Install Vercel CLI:

```bash
npm install -g vercel
```

2. Deploy:

```bash
vercel
```

3. (Optional) Set the backend environment variable:

```bash
vercel env add BACKEND_URL
```

When prompted, enter your backend API URL. Without this, signature lookups still work via Sourcify (4byte.directory), but transaction decode and event decode will use the fallback path.

4. Redeploy to use the environment variable:

```bash
vercel --prod
```

### Method 2: Deploy via Vercel Dashboard

1. Push your code to GitHub

2. Go to [vercel.com](https://vercel.com) and import your repository

3. In the project settings, add optional environment variables:
   - **Name**: `BACKEND_URL`
   - **Value**: Your backend API URL
   - **Environment**: Production (and Preview if needed)

4. Deploy

## Environment Variables

| Variable      | Description                                       | Required |
| ------------- | ------------------------------------------------- | -------- |
| `BACKEND_URL` | Backend API endpoint URL for transaction decoding | Yes¹     |

> ¹ Required by `/api/v1/decode` and `/api/v1/decode-event`. The `/api/v1/query` endpoint (signature lookup) works without it — Sourcify is tried first, with the backend as an optional fallback.

## How It Works

### Transaction Decoder

1. User pastes calldata into the input field
2. The 4-byte selector is checked against known multicall signatures — if matched, inner-call decoding is enabled automatically
3. Frontend sends a request to `/api/decode`
4. The route queries the backend; if the backend has the contract in its DB it returns the decoded outer call, otherwise the route decodes client-side using Sourcify (4byte.directory) signature lookup as a fallback
5. For recognised multicall selectors the route decodes inner calls client-side (no extra round-trip): Universal Router commands use hardcoded command ABIs; `bytes_array` / `tuple_array` / `parallel_arrays` variants look up each inner selector via Sourcify first, then the configured backend
6. The fully decoded response — outer `func`/`args` plus `inner_calls` — is returned to the browser

### Contract Caller

1. User enters contract address and selects chain
2. ABI is fetched via the resolution sequence below, or loaded from localStorage cache
3. User selects function and enters arguments
4. For read functions: Direct RPC call via `/api/call-contract`
5. For write functions: Local simulation via tevm
6. Results displayed with decoded outputs, logs, and call traces

This architecture keeps the backend endpoints secure and hidden from the client-side code.

### Resolution Order

#### Signature lookup (`/api/v1/query`)

Used by the transaction decoder to resolve function selectors and event topics. Order:

1. **Sourcify (4byte.directory)** — tried first, no API key required
2. **Backend** (`BACKEND_URL`) — fallback only when Sourcify returns no match

#### Main contract ABI (`/api/v1/fetch-abi`)

Used when loading a contract in the Contract Caller. Tries each source in order and stops at the first hit:

1. **Sourcify** — fully decentralised, no API key required
2. **Etherscan** (V2 API, covers all supported chains) — requires an Etherscan API key
3. **Routescan** — fallback for chains not well-covered by Etherscan

For proxy contracts (EIP-1967, beacon, OZ legacy), the proxy's implementation address is resolved via `eth_getStorageAt` and its ABI is merged on top.

The result is cached in `localStorage` under `abi-{chain}-{address}`.

#### Simulation result logs & call traces

After a simulation runs, logs and call-trace frames are decoded in three passes:

| Pass | Source                                                     | Trigger                                                                                 |
| ---- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 1    | **Cached ABIs** (`localStorage`)                           | Always — uses whatever ABIs are already in cache                                        |
| 2    | **Sourcify → Etherscan → Routescan**                       | For any `undecodedAddresses` returned by the simulation backend that are not yet cached |
| 3    | **Decode server API** (`/api/decode-event`, topic0 lookup) | Fallback for logs still undecoded after passes 1 & 2 (e.g. unverified contracts)        |

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Runtime**: React 19
- **Blockchain**: viem (for ABI encoding/decoding)
- **Deployment**: Vercel
- **Styling**: CSS Modules

## Project Structure

```
decoder/
├── app/
│   ├── api/
│   │   ├── v1/
│   │   │   ├── decode/route.js        # Public API: tx calldata decode
│   │   │   ├── decode-event/route.js  # Public API: event log decode
│   │   │   └── fetch-abi/route.js     # Public API: ABI fetch
│   │   ├── decode/
│   │   │   └── route.js           # Transaction decode API proxy
│   │   ├── call-contract/
│   │   │   └── route.js           # Contract read function calls
│   │   ├── fetch-abi/
│   │   │   └── route.js           # ABI fetching from explorers
│   ├── components/
│   │   ├── Nav.js                 # Navigation component
│   │   └── Nav.module.css         # Navigation styles
│   ├── contract-caller/
│   │   ├── page.js                # Contract Caller page
│   │   └── page.module.css        # Contract Caller styles
│   ├── tx-decoder/
│   │   ├── page.js                # Transaction decoder page
│   │   └── page.module.css        # Transaction decoder styles
│   ├── layout.js                  # Root layout
│   ├── page.js                    # Home page (Contract Caller)
│   ├── page.module.css            # Home page wrapper styles
│   └── globals.css                # Global styles
├── .env.local                     # Local environment variables (not committed)
├── .env.example                   # Example environment variables
├── package.json                   # Dependencies
└── README.md                      # This file
```

## License

MIT
