const express = require("express");
const fetch = require("node-fetch");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const FRED_API_KEY = process.env.FRED_API_KEY || "";
const FMP_API_KEY = process.env.FMP_API_KEY || "";

// ── Cache (1hr TTL) ──
const cache = {};
const CACHE_TTL = 60 * 60 * 1000;
function getCached(key) {
  const e = cache[key];
  if (e && Date.now() - e.ts < CACHE_TTL) return e.data;
  return null;
}
function setCache(key, data) { cache[key] = { data, ts: Date.now() }; }

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── FRED Series (5Y = limit ~260 weekly, ~60 monthly, ~1260 daily) ──
const FRED_SERIES = {
  // Labor
  UNRATE: { name: "Unemployment Rate", limit: 60 },
  U6RATE: { name: "U-6 Unemployment", limit: 60 },
  ICSA: { name: "Initial Jobless Claims", limit: 260 },
  CCSA: { name: "Continuing Claims", limit: 260 },
  PAYEMS: { name: "Nonfarm Payrolls", limit: 60 },
  JTSJOL: { name: "JOLTS Job Openings", limit: 60 },
  JTSQUL: { name: "JOLTS Quits", limit: 60 },
  SAHMREALTIME: { name: "Sahm Rule", limit: 60 },
  // Inflation
  PCEPILFE: { name: "Core PCE", limit: 60 },
  PCETRIM12M159SFRBDAL: { name: "Trimmed Mean PCE", limit: 60 },
  CPIAUCSL: { name: "CPI All Urban", limit: 60 },
  // Consumer
  UMCSENT: { name: "UMich Sentiment", limit: 60 },
  PSAVERT: { name: "Personal Savings Rate", limit: 60 },
  DRCCLACBS: { name: "CC Delinquency Rate", limit: 20 },
  // Rates & Spreads
  DGS2: { name: "2Y Treasury", limit: 1260 },
  DGS10: { name: "10Y Treasury", limit: 1260 },
  T10Y2Y: { name: "2s10s Spread", limit: 1260 },
  BAMLH0A0HYM2: { name: "HY OAS Spread", limit: 1260 },
  // Oil
  DCOILWTIC: { name: "WTI Crude", limit: 1260 },
  DCOILBRENTEU: { name: "Brent Crude", limit: 1260 },
  // GDP & Fed
  FEDFUNDS: { name: "Fed Funds Rate", limit: 60 },
  A191RL1Q225SBEA: { name: "Real GDP Growth QoQ", limit: 20 },
};

// ── FRED bulk ──
app.get("/api/fred-bulk", async (req, res) => {
  const cacheKey = "fred_bulk";
  const cached = getCached(cacheKey);
  if (cached) return res.json(cached);

  try {
    const ids = Object.keys(FRED_SERIES);
    const results = {};
    for (let i = 0; i < ids.length; i += 6) {
      const batch = ids.slice(i, i + 6);
      const promises = batch.map(async (id) => {
        try {
          const lim = FRED_SERIES[id].limit || 60;
          const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=${lim}`;
          const data = await fetchJSON(url);
          const obs = (data.observations || [])
            .filter((o) => o.value !== ".")
            .map((o) => ({ date: o.date, value: parseFloat(o.value) }));
          return { id, observations: obs, meta: FRED_SERIES[id] };
        } catch (err) {
          return { id, observations: [], meta: FRED_SERIES[id], error: err.message };
        }
      });
      const batchResults = await Promise.all(promises);
      batchResults.forEach((r) => (results[r.id] = r));
      if (i + 6 < ids.length) await new Promise((r) => setTimeout(r, 200));
    }
    setCache(cacheKey, results);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── FMP quotes (indices, sectors, vol, BDCs) ──
const FMP_TICKERS = {
  indices: ["^GSPC", "^VIX", "^VVIX"],
  sectors: ["XLE", "XLF", "XLK", "XLY", "XLV", "XLI", "XLP", "XLU", "XLRE", "XLC", "XLB"],
  credit: ["HYG", "IVOL"],
};

app.get("/api/fmp/quotes", async (req, res) => {
  const cacheKey = "fmp_quotes";
  const cached = getCached(cacheKey);
  if (cached) return res.json(cached);

  try {
    const all = [...FMP_TICKERS.indices, ...FMP_TICKERS.sectors, ...FMP_TICKERS.credit];
    const url = `https://financialmodelingprep.com/stable/quote?symbol=${all.join(",")}&apikey=${FMP_API_KEY}`;
    const data = await fetchJSON(url);
    const grouped = { indices: {}, sectors: {}, credit: {}, _raw: data };
    (data || []).forEach((q) => {
      const sym = q.symbol;
      const entry = {
        symbol: sym, name: q.name, price: q.price,
        change: q.change, changePct: q.changesPercentage,
        dayHigh: q.dayHigh, dayLow: q.dayLow,
        yearHigh: q.yearHigh, yearLow: q.yearLow,
        volume: q.volume, marketCap: q.marketCap,
        pe: q.pe, previousClose: q.previousClose,
        priceAvg50: q.priceAvg50, priceAvg200: q.priceAvg200,
      };
      if (FMP_TICKERS.indices.includes(sym)) grouped.indices[sym] = entry;
      else if (FMP_TICKERS.sectors.includes(sym)) grouped.sectors[sym] = entry;
      else if (FMP_TICKERS.credit.includes(sym)) grouped.credit[sym] = entry;
    });
    setCache(cacheKey, grouped);
    res.json(grouped);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── FMP historical (5Y for any symbol) ──
app.get("/api/fmp/historical/:symbol", async (req, res) => {
  const { symbol } = req.params;
  const cacheKey = `fmp_hist_${symbol}`;
  const cached = getCached(cacheKey);
  if (cached) return res.json(cached);

  try {
    const url = `https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${encodeURIComponent(symbol)}&apikey=${FMP_API_KEY}`;
    const data = await fetchJSON(url);
    const hist = (Array.isArray(data) ? data : data.historical || []).slice(0, 1260);
    setCache(cacheKey, { symbol, historical: hist });
    res.json({ symbol, historical: hist });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── FMP sector performance (weekly, monthly, YTD) ──
app.get("/api/fmp/sector-performance", async (req, res) => {
  const cacheKey = "fmp_sector_perf";
  const cached = getCached(cacheKey);
  if (cached) return res.json(cached);

  try {
    const url = `https://financialmodelingprep.com/stable/sector-performance?apikey=${FMP_API_KEY}`;
    const data = await fetchJSON(url);
    setCache(cacheKey, data);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── FMP oil commodity historical ──
app.get("/api/fmp/oil-historical", async (req, res) => {
  const cacheKey = "fmp_oil_hist";
  const cached = getCached(cacheKey);
  if (cached) return res.json(cached);

  try {
    const [wti, brent] = await Promise.all([
      fetchJSON(`https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=CLUSD&apikey=${FMP_API_KEY}`),
      fetchJSON(`https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=BZUSD&apikey=${FMP_API_KEY}`),
    ]);
    const result = {
      wti: (Array.isArray(wti) ? wti : wti.historical || []).slice(0, 1260),
      brent: (Array.isArray(brent) ? brent : brent.historical || []).slice(0, 1260),
    };
    setCache(cacheKey, result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── FMP economic calendar ──
app.get("/api/fmp/econ-calendar", async (req, res) => {
  const cacheKey = "fmp_econ_cal";
  const cached = getCached(cacheKey);
  if (cached) return res.json(cached);

  try {
    const now = new Date();
    const from = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
    const to = new Date(now.getTime() + 14 * 86400000).toISOString().slice(0, 10);
    const url = `https://financialmodelingprep.com/stable/economic-calendar?from=${from}&to=${to}&apikey=${FMP_API_KEY}`;
    const data = await fetchJSON(url);
    const usOnly = (data || []).filter((e) => e.country === "US" || e.country === "United States");
    setCache(cacheKey, usOnly);
    res.json(usOnly);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Cache flush ──
app.post("/api/flush-cache", (req, res) => {
  Object.keys(cache).forEach((k) => delete cache[k]);
  res.json({ flushed: true, ts: Date.now() });
});

app.get("/api/cache-status", (req, res) => {
  const entries = Object.entries(cache).map(([key, val]) => ({
    key, age: Math.round((Date.now() - val.ts) / 1000), stale: Date.now() - val.ts > CACHE_TTL,
  }));
  res.json({ entries, ttl: CACHE_TTL / 1000 });
});

app.use(express.static(path.join(__dirname, "public")));
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, () => {
  console.log(`Recession Dashboard on port ${PORT}`);
  if (!FRED_API_KEY) console.warn("⚠️  Set FRED_API_KEY in environment/secrets");
  if (!FMP_API_KEY) console.warn("⚠️  Set FMP_API_KEY in environment/secrets");
});
