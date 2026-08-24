# AGENTS.md

Next.js 16 (App Router) EVM calldata decoder + contract caller, deployed to Vercel. All code is plain `.js` — there are **no `.jsx`/`.tsx`/`.ts` files**. JSX lives in `.js` files.

## Commands

```bash
npm run dev              # dev server (port 3000)
npm run build            # production build
npm test                 # vitest run (unit + api projects)
npm run test:coverage    # vitest with coverage (app/utils, app/api)
npm run test:e2e         # playwright (needs a running server)
npm run lint             # eslint app tests
npm run format           # prettier --write
```

CI order (must pass in this order): `prettier --check` → `npm run lint` → `npm run test:coverage` → `./scripts/run-e2e.sh`. `prettier --check` is a hard CI gate, so keep formatting consistent or `npm run format` before pushing.

## Tests

- **vitest** has two projects: `unit` (jsdom, `tests/unit/**`) and `api` (node, `tests/api/**`). Run one: `npx vitest run --project unit` or `--project api`. Single file: `npx vitest run tests/api/decode.test.js`.
- `tests/unit/setup.js` shims a broken Node global `localStorage` — required by the `unit` project, don't remove.
- API tests use fixtures in `tests/api/__fixtures__/` (excluded from run). Server-cache tests use `tests/utils/serverCacheTestEnv.js` (temp dirs keyed by pid).
- **E2E** (`tests/e2e/**`, chromium): `playwright.config.js` auto-starts a **dev** server when run directly. CI instead uses `./scripts/run-e2e.sh`, which does `npm run build` then `npm run start` (prod). Local direct `npm run test:e2e` uses dev. Use `scripts/run-e2e.sh` to reproduce CI locally.

## Quirks

- **JSX in `.js` files**: vitest needs the `jsx-in-js` plugin in `vitest.config.js` (already configured) to transform JSX in `app/**/*.js`. ESLint ignores PascalCase component vars via `varsIgnorePattern: '^[A-Z]'` in `app/**/*.js`.
- **tevm pinned**: `tevm` is `1.0.0-next.148` and its entire transitive set is force-pinned via `overrides` in `package.json`. Keep all `@tevm/*` at the same version or the build breaks.
- Node 24 is used in CI. `next.config.mjs` sets `allowedDevOrigins: ["127.0.0.1"]` and injects `NEXT_PUBLIC_APP_VERSION` from git SHA.

## Environment & caches

- `.env.example` → copy to `.env.local`. `BACKEND_URL` is **optional**; without it, `/api/v1/decode` and `/api/v1/decode-event` still work via Sourcify fallback. API keys (Etherscan/Routescan) are stored **client-side in localStorage** (keys `abi-{chain}-{address}` etc.), not env vars.
- Server-side ABI cache lives at `~/.cache/eth-decoder/<chainId>/<address>.json` (Vercel: `/tmp/...`). Override base with `CACHE_DIR`. Delete a file to force a fresh fetch. `ETHERSCAN_API_KEY` / `ROUTESCAN_API_KEY` env vars are server-side fallbacks for `/api/fetch-abi`.
- Simulation result links (`?simulationId=`) use Vercel Blob only when `BLOB_STORE_ENABLED=true`; otherwise filesystem. See README "Shared simulation result storage".

## Conventions

- Styling: CSS Modules (`*.module.css` next to each component).
- ABI/decoding uses `viem`; tevm for in-browser simulation.
- Public versioned API under `app/api/v1/`. Multicall auto-detection is driven by a hardcoded selector table (README lists all selectors) — extend there when adding multicall variants.
- Merging PRs: `/sgtm`/`/lgtm`/`/approve`/`/merge` comment auto-merges (squash); add `/deploy` to trigger production deploy after merge.
