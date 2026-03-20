import { Router, type IRouter } from "express";

const router: IRouter = Router();

const FRED_API_KEY = process.env.FRED_API_KEY ?? "";
const FMP_API_KEY = process.env.FMP_API_KEY ?? "";

const cache: Record<string, { data: unknown; ts: number }> = {};
const CACHE_TTL = 60 * 60 * 1000;

function getCached(key: string): unknown | null {
  const e = cache[key];
  if (e && Date.now() - e.ts < CACHE_TTL) return e.data;
  return null;
}
function setCache(key: string, data: unknown): void {
  cache[key] = { data, ts: Date.now() };
}

async function fetchJSON(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

const FRED_SERIES: Record<string, { name: string; limit: number }> = {
  UNRATE: { name: "Unemployment Rate", limit: 60 },
  U6RATE: { name: "U-6 Unemployment", limit: 60 },
  ICSA: { name: "Initial Jobless Claims", limit: 260 },
  CCSA: { name: "Continuing Claims", limit: 260 },
  PAYEMS: { name: "Nonfarm Payrolls", limit: 60 },
  JTSJOL: { name: "JOLTS Job Openings", limit: 60 },
  JTSQUL: { name: "JOLTS Quits", limit: 60 },
  SAHMREALTIME: { name: "Sahm Rule", limit: 60 },
  PCEPILFE: { name: "Core PCE", limit: 60 },
  PCETRIM12M159SFRBDAL: { name: "Trimmed Mean PCE", limit: 60 },
  CPIAUCSL: { name: "CPI All Urban", limit: 60 },
  UMCSENT: { name: "UMich Sentiment", limit: 60 },
  PSAVERT: { name: "Personal Savings Rate", limit: 60 },
  DRCCLACBS: { name: "CC Delinquency Rate", limit: 20 },
  DGS2: { name: "2Y Treasury", limit: 1260 },
  DGS10: { name: "10Y Treasury", limit: 1260 },
  T10Y2Y: { name: "2s10s Spread", limit: 1260 },
  BAMLH0A0HYM2: { name: "HY OAS Spread", limit: 1260 },
  DCOILWTICO: { name: "WTI Crude", limit: 1260 },
  DCOILBRENTEU: { name: "Brent Crude", limit: 1260 },
  FEDFUNDS: { name: "Fed Funds Rate", limit: 60 },
  A191RL1Q225SBEA: { name: "Real GDP Growth QoQ", limit: 20 },
};

const FMP_TICKERS = {
  indices: ["^GSPC", "^VIX", "^VVIX"],
  sectors: ["XLE", "XLF", "XLK", "XLY", "XLV", "XLI", "XLP", "XLU", "XLRE", "XLC", "XLB"],
  credit: ["HYG", "IVOL"],
};

router.get("/fred-bulk", async (req, res) => {
  const cacheKey = "fred_bulk";
  const cached = getCached(cacheKey);
  if (cached) { res.json(cached); return; }

  if (!FRED_API_KEY) {
    res.status(500).json({ error: "FRED_API_KEY not set" });
    return;
  }

  try {
    const ids = Object.keys(FRED_SERIES);
    const results: Record<string, unknown> = {};
    for (let i = 0; i < ids.length; i += 6) {
      const batch = ids.slice(i, i + 6);
      const promises = batch.map(async (id) => {
        try {
          const lim = FRED_SERIES[id]?.limit ?? 60;
          const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=${lim}`;
          const data = await fetchJSON(url) as { observations?: Array<{ date: string; value: string }> };
          const obs = (data.observations ?? [])
            .filter((o) => o.value !== ".")
            .map((o) => ({ date: o.date, value: parseFloat(o.value) }));
          return { id, observations: obs, meta: FRED_SERIES[id] };
        } catch (err) {
          return { id, observations: [], meta: FRED_SERIES[id], error: (err as Error).message };
        }
      });
      const batchResults = await Promise.all(promises);
      batchResults.forEach((r) => { results[r.id] = r; });
      if (i + 6 < ids.length) await new Promise((r) => setTimeout(r, 200));
    }
    setCache(cacheKey, results);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get("/fmp/quotes", async (req, res) => {
  const cacheKey = "fmp_quotes";
  const cached = getCached(cacheKey);
  if (cached) { res.json(cached); return; }

  if (!FMP_API_KEY) {
    res.status(500).json({ error: "FMP_API_KEY not set" });
    return;
  }

  try {
    const all = [...FMP_TICKERS.indices, ...FMP_TICKERS.sectors, ...FMP_TICKERS.credit];
    const url = `https://financialmodelingprep.com/stable/quote?symbol=${all.join(",")}&apikey=${FMP_API_KEY}`;
    const data = await fetchJSON(url) as Array<{
      symbol: string; name: string; price: number; change: number;
      changesPercentage: number; dayHigh: number; dayLow: number;
      yearHigh: number; yearLow: number; volume: number; marketCap: number;
      pe: number; previousClose: number; priceAvg50: number; priceAvg200: number;
    }>;
    const grouped: Record<string, Record<string, unknown>> = { indices: {}, sectors: {}, credit: {}, _raw: {} };
    (data ?? []).forEach((q) => {
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
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get("/fmp/historical/:symbol", async (req, res) => {
  const { symbol } = req.params as { symbol: string };
  const cacheKey = `fmp_hist_${symbol}`;
  const cached = getCached(cacheKey);
  if (cached) { res.json(cached); return; }

  try {
    const url = `https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${encodeURIComponent(symbol)}&apikey=${FMP_API_KEY}`;
    const data = await fetchJSON(url) as Array<unknown> | { historical?: Array<unknown> };
    const hist = (Array.isArray(data) ? data : (data as { historical?: Array<unknown> }).historical ?? []).slice(0, 1260);
    setCache(cacheKey, { symbol, historical: hist });
    res.json({ symbol, historical: hist });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get("/fmp/sector-performance", async (req, res) => {
  const cacheKey = "fmp_sector_perf";
  const cached = getCached(cacheKey);
  if (cached) { res.json(cached); return; }

  try {
    const url = `https://financialmodelingprep.com/stable/sector-performance?apikey=${FMP_API_KEY}`;
    const data = await fetchJSON(url);
    setCache(cacheKey, data);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get("/fmp/oil-historical", async (req, res) => {
  const cacheKey = "fmp_oil_hist";
  const cached = getCached(cacheKey);
  if (cached) { res.json(cached); return; }

  try {
    const [wti, brent] = await Promise.all([
      fetchJSON(`https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=CLUSD&apikey=${FMP_API_KEY}`),
      fetchJSON(`https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=BZUSD&apikey=${FMP_API_KEY}`),
    ]) as [unknown, unknown];
    const result = {
      wti: (Array.isArray(wti) ? wti : ((wti as { historical?: unknown[] }).historical ?? [])).slice(0, 1260),
      brent: (Array.isArray(brent) ? brent : ((brent as { historical?: unknown[] }).historical ?? [])).slice(0, 1260),
    };
    setCache(cacheKey, result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get("/fmp/econ-calendar", async (req, res) => {
  const cacheKey = "fmp_econ_cal";
  const cached = getCached(cacheKey);
  if (cached) { res.json(cached); return; }

  try {
    const now = new Date();
    const from = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
    const to = new Date(now.getTime() + 14 * 86400000).toISOString().slice(0, 10);
    const url = `https://financialmodelingprep.com/stable/economic-calendar?from=${from}&to=${to}&apikey=${FMP_API_KEY}`;
    const data = await fetchJSON(url) as Array<{ country?: string }>;
    const usOnly = (data ?? []).filter((e) => e.country === "US" || e.country === "United States");
    setCache(cacheKey, usOnly);
    res.json(usOnly);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get("/cache-status", (req, res) => {
  const entries = Object.entries(cache).map(([key, val]) => ({
    key,
    age: Math.round((Date.now() - val.ts) / 1000),
    stale: Date.now() - val.ts > CACHE_TTL,
  }));
  res.json({ entries, ttl: CACHE_TTL / 1000 });
});

router.post("/flush-cache", (req, res) => {
  Object.keys(cache).forEach((k) => { delete cache[k]; });
  res.json({ flushed: true, ts: Date.now() });
});

export default router;
