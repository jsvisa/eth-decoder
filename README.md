# EVM Tx.input Decoder & Contract Caller

A web application for decoding EVM transaction input data and interacting with smart contracts. Built with Next.js and designed for deployment on Vercel.

## Features

### Transaction Decoder

- Hex string validation and input field for EVM transaction data
- Real-time decoding via proxied API
- JSON and YAML formatted output with syntax highlighting
- Copy to clipboard functionality
- Shareable URLs - generate links to share decoded transactions
- Recent decode history (stores up to 100 items in browser localStorage)
- Click history items to quickly reload previous decodes
- Support for multicall, ABI, and signature decoding options

### Contract Caller

- **Multi-chain support**: Ethereum, Arbitrum, Base, Polygon, BSC
- **ABI Management**:
  - Auto-fetch ABI from block explorers (Etherscan, etc.)
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
  - Tenderly integration for transaction simulation
  - Decoded event logs with parameter names and types
  - Call trace tree visualization with nested contract calls
  - Asset/balance changes display
  - State changes (storage diff) display
  - Gas usage estimation
- **History**: Recent calls saved with function name, args, and decoded output
- **API Key Validation**: Test buttons to verify Etherscan and Tenderly API keys

## URL Parameters

You can share decode results by using URL parameters:

```
https://your-domain.vercel.app/?data=0x1234abcd...&multicall=true&with_abi=true&with_sign=true
```

Parameters:
- `data` (required): Hex string to decode
- `multicall` (optional): Set to `true` to enable multicall option
- `with_abi` (optional): Set to `true` to enable ABI option
- `with_sign` (optional): Set to `true` to enable signature option

The app will automatically populate the input and trigger decoding when these parameters are present.

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

### Tenderly API Settings
- Required for simulating write functions
- Get your credentials from [Tenderly Dashboard](https://dashboard.tenderly.co/account/authorization)
- Required fields: Access Key, Account Slug, Project Slug

All API keys are stored locally in your browser and never sent to our servers.

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

| Variable | Description | Required |
|----------|-------------|----------|
| `BACKEND_URL` | Backend API endpoint URL for transaction decoding | Yes |

## How It Works

### Transaction Decoder
1. User enters transaction data in the input field
2. Frontend sends request to `/api/decode` (Next.js API route)
3. API route proxies the request to the backend endpoint (hidden from frontend)
4. Response is returned and displayed to the user

### Contract Caller
1. User enters contract address and selects chain
2. ABI is fetched from block explorer or loaded from cache
3. User selects function and enters arguments
4. For read functions: Direct RPC call via `/api/call-contract`
5. For write functions: Simulation via Tenderly API through `/api/simulate`
6. Results displayed with decoded outputs, logs, and call traces

This architecture keeps the backend endpoints secure and hidden from the client-side code.

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Runtime**: React 18
- **Blockchain**: viem (for ABI encoding/decoding)
- **Deployment**: Vercel
- **Styling**: CSS Modules

## Project Structure

```
decoder/
├── app/
│   ├── api/
│   │   ├── decode/
│   │   │   └── route.js           # Transaction decode API proxy
│   │   ├── call-contract/
│   │   │   └── route.js           # Contract read function calls
│   │   ├── fetch-abi/
│   │   │   └── route.js           # ABI fetching from explorers
│   │   └── simulate/
│   │       └── route.js           # Tenderly simulation API
│   ├── components/
│   │   ├── Nav.js                 # Navigation component
│   │   └── Nav.module.css         # Navigation styles
│   ├── contract-caller/
│   │   ├── page.js                # Contract Caller page
│   │   └── page.module.css        # Contract Caller styles
│   ├── layout.js                  # Root layout
│   ├── page.js                    # Main decoder page
│   ├── page.module.css            # Decoder page styles
│   └── globals.css                # Global styles
├── .env.local                     # Local environment variables (not committed)
├── .env.example                   # Example environment variables
├── package.json                   # Dependencies
└── README.md                      # This file
```

## License

MIT
