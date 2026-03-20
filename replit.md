# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server (recession endpoints)
│   └── recession-dashboard/ # React+Vite frontend dashboard
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (single workspace package)
│   └── src/                # Individual .ts scripts, run via `pnpm --filter @workspace/scripts run <script>`
├── pnpm-workspace.yaml     # pnpm workspace (artifacts/*, lib/*, lib/integrations/*, scripts)
├── tsconfig.base.json      # Shared TS options (composite, bundler resolution, es2022)
├── tsconfig.json           # Root TS project references
└── package.json            # Root package with hoisted devDeps
```

## Recession Risk Dashboard

Full-stack macroeconomic monitoring tool.

### Frontend (`artifacts/recession-dashboard`)
- React + Vite + TypeScript, no Tailwind — uses custom CSS variables (`index.css`)
- Fonts: JetBrains Mono + DM Sans, dark terminal aesthetic
- Dependencies: `react-chartjs-2`, `chart.js`
- Main page: `src/pages/Dashboard.tsx` (single file, ~870 lines)
- Fetches from `/api/fred-bulk`, `/api/fmp-quotes`, `/api/fmp-sector`, `/api/fmp-historical/:ticker`, `/api/fmp-oil-history`
- No React Query / OpenAPI codegen — vanilla fetch with `useEffect`

### Backend (`artifacts/api-server`)
- Recession routes: `src/routes/recession.ts` — mounted at `/api` via `src/routes/index.ts`
- FRED bulk endpoint: fetches 22 series in parallel, 1-hour in-memory cache, filters "." values
- **FRED series IDs** (correct as of 2026):
  - Oil: `DCOILWTICO` (WTI), `DCOILBRENTEU` (Brent) — note `DCOILWTIC` is WRONG (series doesn't exist)
  - Labor: `UNRATE`, `U6RATE`, `PAYEMS`, `ICSA`, `CCSA`, `JTSJOL`, `SAHMREALTIME`
  - Inflation/Rates: `PCEPILFE`, `PCETRIM12M159SFRBDAL`, `DGS2`, `DGS10`, `T10Y2Y`, `BAMLH0A0HYM2`
  - Sentiment/Credit: `UMCSENT`, `PSAVERT`, `DRCCLACBS`
  - Macro: `FEDFUNDS`, `A191RL1Q225SBEA`
  - **NOTE**: `BAMLMOVE` does NOT exist on FRED. Use FMP IVOL ETF as a rate vol proxy.
- FMP endpoints: quotes, sector performance, historical prices, oil futures (synthetic), econ calendar
- FMP tickers: `^GSPC`, `^VIX`, `^VVIX`, sector ETFs (XLK, XLV, XLF, XLE, XLU, XLI, XLY, XLP, XLB, XLRE, XLC), credit (HYG, LQD, TLT, IVOL)
- Cache flush: `POST /api/flush-cache`
- Env secrets: `FRED_API_KEY`, `FMP_API_KEY`

### Data Transforms (Dashboard.tsx)
- `PAYEMS` (Nonfarm Payrolls): raw count in thousands, needs `scale={1/1000}` → display in K
- `ICSA`/`CCSA` (Claims): raw count, needs `scale={1/1000}` → display as `K`
- `PCEPILFE` (Core PCE): is an index level (~128), NOT a percent — compute YoY% via `yoy={true}` prop
- `PCETRIM12M159SFRBDAL` (Trimmed Mean PCE): already reported as YoY%, no transform
- `BAMLH0A0HYM2` (HY OAS): in basis points already

### UI Sections
1. **Risk Gauges** (top): Composite Risk Score, Recession Probability 12MO, Drawdown Risk ≥15%
2. **Labor Market** signal cards: UNRATE, U6RATE, PAYEMS, ICSA, CCSA, JTSJOL, SAHMREALTIME
3. **Inflation & Rates** signal cards: Core PCE YoY, Trimmed Mean PCE, DGS2, DGS10, T10Y2Y, HY OAS, Brent, WTI, UMCSENT, PSAVERT, DRCCLACBS
4. **Leading Indicators** charts (Chart.js): Oil Spot (WTI+Brent 5Y), Oil Futures Forward Curve (synthetic), Sahm Rule 5Y, Initial Claims 5Y, HY OAS 5Y, 2s10s Yield Curve 5Y, S&P 500 vs 200-DMA, Fed Funds vs Core PCE
5. **Sector Rotation** ETF grid: XLK thru XLRE, styled green/red by daily change

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck` (which runs `tsc --build --emitDeclarationOnly`). This builds the full dependency graph so that cross-package imports resolve correctly. Running `tsc` inside a single package will fail if its dependencies haven't been built yet.
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck; actual JS bundling is handled by esbuild/tsx/vite...etc, not `tsc`.
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array. `tsc --build` uses this to determine build order and skip up-to-date packages.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes live in `src/routes/` and use `@workspace/api-zod` for request and response validation and `@workspace/db` for persistence.

- Entry: `src/index.ts` — reads `PORT`, starts Express
- App setup: `src/app.ts` — mounts CORS, JSON/urlencoded parsing, routes at `/api`
- Routes: `src/routes/index.ts` mounts sub-routers; `src/routes/health.ts` exposes `GET /health` (full path: `/api/health`)
- Recession routes: `src/routes/recession.ts`
- Depends on: `@workspace/db`, `@workspace/api-zod`
- `pnpm --filter @workspace/api-server run dev` — run the dev server
- `pnpm --filter @workspace/api-server run build` — production esbuild bundle (`dist/index.cjs`)
- Build bundles an allowlist of deps (express, cors, pg, drizzle-orm, zod, etc.) and externalizes the rest

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL. Exports a Drizzle client instance and schema models.

- `src/index.ts` — creates a `Pool` + Drizzle instance, exports schema
- `src/schema/index.ts` — barrel re-export of all models
- `src/schema/<modelname>.ts` — table definitions with `drizzle-zod` insert schemas (no models definitions exist right now)
- `drizzle.config.ts` — Drizzle Kit config (requires `DATABASE_URL`, automatically provided by Replit)
- Exports: `.` (pool, db, schema), `./schema` (schema only)

Production migrations are handled by Replit when publishing. In development, we just use `pnpm --filter @workspace/db run push`, and we fallback to `pnpm --filter @workspace/db run push-force`.

### `lib/api-spec` (`@workspace/api-spec`)

Owns the OpenAPI 3.1 spec (`openapi.yaml`) and the Orval config (`orval.config.ts`). Running codegen produces output into two sibling packages:

1. `lib/api-client-react/src/generated/` — React Query hooks + fetch client
2. `lib/api-zod/src/generated/` — Zod schemas

Run codegen: `pnpm --filter @workspace/api-spec run codegen`

### `lib/api-zod` (`@workspace/api-zod`)

Generated Zod schemas from the OpenAPI spec (e.g. `HealthCheckResponse`). Used by `api-server` for response validation.

### `lib/api-client-react` (`@workspace/api-client-react`)

Generated React Query hooks and fetch client from the OpenAPI spec (e.g. `useHealthCheck`, `healthCheck`).

### `scripts` (`@workspace/scripts`)

Utility scripts package. Each script is a `.ts` file in `src/` with a corresponding npm script in `package.json`. Run scripts via `pnpm --filter @workspace/scripts run <script>`. Scripts can import any workspace package (e.g., `@workspace/db`) by adding it as a dependency in `scripts/package.json`.
