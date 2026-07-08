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
   - Update `BACKEND_URL` with your backend API endpoint

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

**Multicall auto-detection.** The following selectors are recognised automatically and the response includes an `inner_calls` array:

| Selector     | Function                                            | Type             |
| ------------ | --------------------------------------------------- | ---------------- |
| `0xac9650d8` | `multicall(bytes[])`                                | bytes_array      |
| `0x60fc8466` | `multicall((bool,bytes)[])`                         | tuple_array      |
| `0x374f435d` | `multicall((address,bytes,uint256,bool,bytes32)[])` | tuple_array      |
| `0x82ad56cb` | `aggregate3((address,bool,bytes)[])`                | tuple_array      |
| `0x24856bc3` | `execute(bytes,bytes[])`                            | Universal Router |
| `0x3593564c` | `execute(bytes,bytes[],uint256)`                    | Universal Router |

Each element of `inner_calls` contains at minimum `index`, `selector`, and `data`. For `tuple_array` variants the target address and extra fields (`value`, `skipRevert`, …) are included. For Universal Router commands, `name` (e.g. `V3_SWAP_EXACT_IN`) and decoded `args` are included instead. When the inner selector is known to OpenChain, a `decoded` object with `func` and `args` is attached.

### `GET /api/v1/decode-event`

Decode an EVM event log. Proxies to the configured `BACKEND_URL`.

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

> `/api/v1/decode` and `/api/v1/decode-event` require `BACKEND_URL` to be set. `/api/v1/fetch-abi` is self-contained.

### `POST /api/simulate-tx`

Simulate a raw transaction against forked chain state and return decoded results. Fetches and caches the contract ABI server-side at `~/.cache/eth-decoder/<chainId>/<address>.json` outside Vercel, or `/tmp/eth-decoder/<chainId>/<address>.json` on Vercel.

**Request body:**

| Field              | Required | Description                                                                                                     |
| ------------------ | -------- | --------------------------------------------------------------------------------------------------------------- |
| `chainId`          | Yes      | Numeric chain ID (1 = Ethereum, 42161 = Arbitrum, 8453 = Base, 137 = Polygon, 56 = BSC)                         |
| `to`               | Yes      | Contract address                                                                                                |
| `data`             | Yes      | Hex-encoded calldata                                                                                            |
| `from`             | Yes      | Sender address — used as `msg.sender` in simulation                                                             |
| `value`            | No       | Hex-encoded ETH value (default `"0x0"`)                                                                         |
| `blockNumber`      | No       | Hex block number or `"latest"` (default `"latest"`)                                                             |
| `gas`              | No       | Hex gas limit (passed through; tevm estimates if omitted)                                                       |
| `apiKeys`          | No       | `{ "etherscan": "...", "routescan": "..." }` — falls back to `ETHERSCAN_API_KEY` / `ROUTESCAN_API_KEY` env vars |
| `rpcUrl`           | No       | Custom RPC URL for forking chain state. Falls back to default public node if omitted.                           |
| `balanceOverrides` | No  | Array of `{address, balance}` — sets native ETH balance for addresses before simulation (same as `vm.deal`)    |
| `storageOverrides` | No  | Array of `{address, slot, value}` — sets contract storage slots before simulation                              |
| `cheatcodes`       | No  | Object with `deal`, `warp`, or `prank` keys. See cheatcodes details below.                                     |

**Cheatcodes:**

| Field                    | Description                                                                       |
| ------------------------ | --------------------------------------------------------------------------------- |
| `cheatcodes.deal`        | `{address, amount}` — sets ETH balance (same as balanceOverrides, single address) |
| `cheatcodes.warp`        | `{timestamp}` — sets block timestamp (Unix seconds, number)                       |
| `cheatcodes.prank`       | `{address}` — impersonates `msg.sender` (overrides `from`)                       |

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

**Response:** Same JSON shape as the browser simulation result — `success`, `simulated`, `blockNumber`, `gasUsed`, `logs` (decoded), `callTrace` (decoded with inputs/outputs), `assetChanges`, `stateChanges`, `metrics`, plus `simulationId` (UUID for retrieving the cached result later) and `requestBody` (the input parameters used for the simulation — `chainId`, `to`, `data`, `from`, `value`, `gas`, `blockNumber`, `functionName` — restored when loading via `?simulationId=`).

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

- `BLOB_READ_WRITE_TOKEN`, or
- `BLOB_STORE_ID` with `VERCEL_OIDC_TOKEN`

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

3. Set environment variable:

```bash
vercel env add BACKEND_URL
```

When prompted, enter your backend API URL

4. Redeploy to use the environment variable:

```bash
vercel --prod
```

### Method 2: Deploy via Vercel Dashboard

1. Push your code to GitHub

2. Go to [vercel.com](https://vercel.com) and import your repository

3. In the project settings, add the environment variable:
   - **Name**: `BACKEND_URL`
   - **Value**: Your backend API URL
   - **Environment**: Production (and Preview if needed)

4. Deploy

## Environment Variables

| Variable      | Description                                       | Required |
| ------------- | ------------------------------------------------- | -------- |
| `BACKEND_URL` | Backend API endpoint URL for transaction decoding | Yes      |

## How It Works

### Transaction Decoder

1. User pastes calldata into the input field
2. The 4-byte selector is checked against known multicall signatures — if matched, inner-call decoding is enabled automatically
3. Frontend sends a request to `/api/decode`
4. The route queries the backend; if the backend has the contract in its DB it returns the decoded outer call, otherwise OpenChain is used as a fallback
5. For recognised multicall selectors the route decodes inner calls client-side (no extra round-trip): Universal Router commands use hardcoded command ABIs; `bytes_array` / `tuple_array` variants look up each inner selector via OpenChain
6. The fully decoded response — outer `func`/`args` plus `inner_calls` — is returned to the browser

### Contract Caller

1. User enters contract address and selects chain
2. ABI is fetched via the resolution sequence below, or loaded from localStorage cache
3. User selects function and enters arguments
4. For read functions: Direct RPC call via `/api/call-contract`
5. For write functions: Local simulation via tevm
6. Results displayed with decoded outputs, logs, and call traces

This architecture keeps the backend endpoints secure and hidden from the client-side code.

### ABI Resolution Order

#### Main contract ABI (`/api/fetch-abi`)

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
