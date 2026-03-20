# Replit Agent Prompt — Recession Risk Dashboard

## What this is

A real-time macro recession risk monitoring dashboard. The codebase has an Express backend (`server.js`) that proxies FRED and FMP APIs with 1-hour server-side caching, and a single-page frontend (`public/index.html`) that renders signal cards, risk gauges, and Chart.js time-series charts.

The code is functional but needs the following wiring and fixes to be production-ready on Replit.

## Environment Secrets (set these in Replit Secrets)

```
FRED_API_KEY = <get free at https://fred.stlouisfed.org/docs/api/api_key.html>
FMP_API_KEY = LljIK8qSxt2ifkGBgJQ9lKK4LmfKFkcE
```

## What needs to be done

### 1. Install & Run
- Run `npm install` to install `express` and `node-fetch` (v2, CommonJS).
- The app should start with `npm start` and serve on port 3000.
- Verify the `.replit` file is wiring port 3000 → external port 80.

### 2. FRED API Key Validation
- On startup, if `FRED_API_KEY` is missing or empty, log a clear warning.
- Test one FRED call (e.g., `UNRATE`) on first load. If it returns a 400/401, surface the error in the frontend status pill.

### 3. S&P 500 vs 200-DMA Chart
- The chart `cSP` (S&P 500 vs 200-DMA) is currently a placeholder in the frontend.
- Wire it to pull 5 years of S&P 500 daily close data from `GET /api/fmp/historical/^GSPC`.
- In the frontend, after fetching, compute a 200-point simple moving average over the close prices.
- Plot both the raw close and the 200-DMA as two datasets on the `cSP` canvas.
- The 200-DMA line should be dashed red (`#ff4d4f`, `borderDash: [5, 3]`).

### 4. MOVE Index
- The MOVE index (ICE BofA MOVE) is not available on FMP. Options:
  - **Option A (preferred):** Add it as a FRED series. The FRED series ID is `BAMLMOVE`. Add it to the `FRED_SERIES` config in `server.js` with `limit: 1260`. Then in the frontend, render it as a signal card in the Market & Volatility section, pulling from `fredData["BAMLMOVE"]`. Current value should show with WoW change.
  - **Option B (fallback):** If `BAMLMOVE` doesn't resolve on FRED, use `IVOL` (ETF that tracks rate volatility) from FMP as a proxy. It's already in the `FMP_TICKERS.credit` array.
- The card should show: label "MOVE Index", value, WoW change, and threat thresholds: `>120` = red, `>100` = amber, else green.

### 5. Sector Rotation — Add Performance Timeframes
- The sector cards currently only show WoW change from the FMP quote `changesPercentage` field (which is actually DoD).
- To get true WoW, MoM, and YTD performance, use the FMP endpoint `GET /api/fmp/sector-performance` (already wired in `server.js`).
- If FMP's sector performance endpoint returns data, map it into the sector cards to show WoW, MoM, and YTD columns.
- If the endpoint doesn't return weekly/monthly granularity, compute approximate WoW from the `priceAvg50` field (current price vs 50-day avg gives a rough monthly proxy) and use `changesPercentage` as DoD → multiply by 5 for a rough WoW.

### 6. Oil Futures Forward Curve
- The forward curve chart currently uses hardcoded backwardation estimates.
- FMP has `CLUSD` (WTI front month) and `BZUSD` (Brent front month) as commodity symbols but does NOT have individual contract months.
- For now, keep the current approach: take the live spot price from FRED (`DCOILWTIC`, `DCOILBRENTEU`) and generate a synthetic backwardation curve by applying a decay function: each subsequent month = previous × 0.985. This is labeled "Estimated" in the chart title.
- If you find a way to source actual CME futures prices via any available API, replace the synthetic curve with real data.

### 7. Auto-Refresh & Manual Refresh
- The frontend already has a 1-hour `setInterval` for auto-refresh and a manual refresh button that calls `POST /api/flush-cache` then re-fetches.
- Verify this works end-to-end. The server cache should flush all keys on `POST /api/flush-cache`, and the frontend should show the "Fetching" state in the status pill during refresh.

### 8. Error Handling
- If any FRED series fails (e.g., series doesn't exist), the server should return `observations: []` for that series, not crash.
- The frontend should gracefully show "—" for any missing data.
- If the entire FRED bulk call fails (e.g., bad API key), the frontend status pill should show "Error" in red.

### 9. Deployment
- Make sure the app deploys cleanly on Replit with the "Run" button.
- The app should be accessible via the Replit webview URL.
- No build step required — it's vanilla HTML + Express.

## Architecture Overview

```
recession-final/
├── .replit              # Replit config
├── package.json         # express + node-fetch
├── server.js            # Express backend — API proxy + 1hr cache
└── public/
    └── index.html       # Single-page dashboard (vanilla JS + Chart.js)
```

**Data flow:**
1. Frontend calls `/api/fred-bulk` → server fetches all FRED series in parallel (batches of 6) → caches 1hr → returns JSON
2. Frontend calls `/api/fmp/quotes` → server fetches FMP quotes for indices, sectors, credit ETFs → caches 1hr → returns JSON
3. Frontend renders signal cards, risk gauges, and charts from the combined data
4. Manual refresh: `POST /api/flush-cache` clears server cache → frontend re-fetches everything

**Key design decisions:**
- All API keys are server-side only (never exposed to browser)
- Server-side caching prevents hitting API rate limits
- Charts use a custom Chart.js plugin for crosshair tooltips (already registered in the frontend)
- Signal cards are clickable — clicking opens an inline chart drawer showing the full time series for that indicator
- All change metrics are WoW minimum (weekly delta for daily/weekly series, monthly delta for monthly series, quarterly for quarterly)
- Threat borders: red = elevated risk, amber = caution, green = contained

## Don't change
- The visual design, color scheme, typography, or layout
- The Chart.js crosshair tooltip plugin
- The risk score calculation methodology
- The signal card click-to-expand drawer behavior
