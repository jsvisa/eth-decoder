# EVM Tx.input Decoder App

A simple single-page web application that decodes EVM transaction input data using a backend API. Built with Next.js and designed for deployment on Vercel.

## Features

- Hex string validation and input field for EVM transaction data
- Real-time decoding via proxied API
- JSON and YAML formatted output with syntax highlighting
- Copy to clipboard functionality
- Recent decode history (stores up to 100 items in browser localStorage)
- Click history items to quickly reload previous decodes
- Clean, responsive UI
- Backend endpoint hidden from frontend (security)
- Support for multicall, ABI, and signature decoding options

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

### Method 3: Deploy Button (One-Click)

Click the button below to deploy:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/YOUR_USERNAME/YOUR_REPO&env=BACKEND_URL&envDescription=Backend%20API%20endpoint&envLink=https://github.com/YOUR_USERNAME/YOUR_REPO)

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `BACKEND_URL` | Backend API endpoint URL | Yes |

## How It Works

1. User enters data in the input field
2. Frontend sends request to `/api/decode` (Next.js API route)
3. API route proxies the request to the backend endpoint (hidden from frontend)
4. Response is returned and displayed to the user

This architecture keeps the backend endpoint secure and hidden from the client-side code.

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Runtime**: React 18
- **Deployment**: Vercel
- **Styling**: CSS Modules

## Project Structure

```
decoder/
├── app/
│   ├── api/
│   │   └── decode/
│   │       └── route.js       # API proxy endpoint
│   ├── layout.js              # Root layout
│   ├── page.js                # Main page component
│   ├── page.module.css        # Page styles
│   └── globals.css            # Global styles
├── .env.local                 # Local environment variables (not committed)
├── .env.example               # Example environment variables
├── package.json               # Dependencies
└── README.md                  # This file
```

## License

MIT
