import { useEffect, useRef, useState, useCallback } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  type ChartOptions,
  type Plugin,
} from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

ChartJS.defaults.color = "#55556a";
ChartJS.defaults.borderColor = "#1a1a2a";

const crosshairPlugin: Plugin = {
  id: "xhair",
  afterEvent(ch, args) {
    const e = args.event;
    (ch as any)._xh = e.type === "mouseout" ? null : { x: e.x, y: e.y };
  },
  afterDraw(ch) {
    const cr = (ch as any)._xh;
    if (!cr) return;
    const { ctx, chartArea: a } = ch;
    if (cr.x < a.left || cr.x > a.right || cr.y < a.top || cr.y > a.bottom) {
      (ch as any)._xh = null;
      return;
    }
    ctx.save();
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 0.7;
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.beginPath();
    ctx.moveTo(cr.x, a.top);
    ctx.lineTo(cr.x, a.bottom);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(a.left, cr.y);
    ctx.lineTo(a.right, cr.y);
    ctx.stroke();
    ctx.setLineDash([]);

    const xScale = ch.scales["x"];
    const xIdx = Math.round(xScale.getValueForPixel(cr.x) ?? 0);
    const labels = ch.data.labels as string[];
    const ds = ch.data.datasets;
    const pad = 8, bh = 18, gap = 2;
    const visible = ds.filter((d) => !d.hidden && d.data[xIdx] != null);
    const totalH = visible.length * (bh + gap);
    let startY = cr.y - totalH / 2;
    if (startY < a.top) startY = a.top;
    if (startY + totalH > a.bottom) startY = a.bottom - totalH;
    let vi = 0;
    ds.forEach((d) => {
      if (d.hidden) return;
      const val = xIdx >= 0 && xIdx < d.data.length ? d.data[xIdx] : null;
      if (val == null) return;
      const color = (d.borderColor as string) || "#fff";
      const num = typeof val === "number" ? val : 0;
      const txt =
        Math.abs(num) > 1000
          ? num.toFixed(0)
          : Math.abs(num) > 10
          ? num.toFixed(1)
          : num.toFixed(2);
      ctx.font = "600 10px JetBrains Mono,monospace";
      const tw = ctx.measureText(txt).width;
      const bw = tw + 22;
      let bx = cr.x + pad;
      if (bx + bw > a.right) bx = cr.x - pad - bw;
      const by = startY + vi * (bh + gap);
      ctx.fillStyle = "rgba(10,10,15,0.92)";
      ctx.strokeStyle = color + "66";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(bx + 8, by + bh / 2, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#e8e8ed";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(txt, bx + 16, by + bh / 2);
      vi++;
    });

    if (xIdx >= 0 && xIdx < labels.length) {
      const dtxt = labels[xIdx];
      ctx.font = "500 8px JetBrains Mono,monospace";
      const dtw = ctx.measureText(dtxt).width;
      const dbw = dtw + 12, dbh = 16;
      let dbx = cr.x - dbw / 2;
      if (dbx < a.left) dbx = a.left;
      if (dbx + dbw > a.right) dbx = a.right - dbw;
      ctx.fillStyle = "rgba(10,10,15,0.92)";
      ctx.strokeStyle = "rgba(64,150,255,0.25)";
      ctx.beginPath();
      ctx.roundRect(dbx, a.bottom + 3, dbw, dbh, 3);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#8888a0";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(dtxt, dbx + dbw / 2, a.bottom + 3 + dbh / 2);
    }
    ctx.restore();
  },
};

ChartJS.register(crosshairPlugin);

interface Observation {
  date: string;
  value: number;
}

interface FredSeries {
  observations: Observation[];
  meta: { name: string; limit: number };
}

interface FmpQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
  yearHigh: number;
  yearLow: number;
  pe: number;
  priceAvg50: number;
  priceAvg200: number;
  previousClose: number;
}

interface FmpData {
  indices: Record<string, FmpQuote>;
  sectors: Record<string, FmpQuote>;
  credit: Record<string, FmpQuote>;
}

type FredData = Record<string, FredSeries>;

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function fmt(n: number | null | undefined, d = 1): string {
  if (n == null) return "—";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}

function rc(v: number): string {
  return v >= 65 ? "#ff4d4f" : v >= 40 ? "#faad14" : "#52c41a";
}
function rl(v: number): string {
  return v >= 65 ? "ELEVATED" : v >= 40 ? "CAUTIOUS" : "CONTAINED";
}
function sc2(v: number, l: number, h: number): number {
  return Math.min(100, Math.max(0, ((v - l) / (h - l)) * 100));
}

function gL(fredData: FredData, id: string) {
  const s = fredData[id];
  if (!s || !s.observations || !s.observations.length)
    return { v: null, p: null, obs: [] as Observation[] };
  return {
    v: s.observations[0].value,
    p: s.observations.length > 1 ? s.observations[1].value : null,
    obs: s.observations,
  };
}

function obsChronological(fredData: FredData, id: string): Observation[] {
  const s = fredData[id];
  if (!s || !s.observations) return [];
  return [...s.observations].reverse();
}

function computeScore(fredData: FredData): { comp: number; rS: number; dS: number } {
  const sahm = gL(fredData, "SAHMREALTIME").v ?? 0;
  const ue = gL(fredData, "UNRATE").v ?? 0;
  const hy = gL(fredData, "BAMLH0A0HYM2").v ?? 0;
  const brent = gL(fredData, "DCOILBRENTEU").v ?? gL(fredData, "DCOILWTICO").v ?? 0;
  const pce = gL(fredData, "PCEPILFE").v ?? 0;
  const sent = gL(fredData, "UMCSENT").v ?? 100;
  const spread = gL(fredData, "T10Y2Y").v ?? 0;
  const sc: Record<string, number> = {
    sahm: sc2(sahm, 0, 0.5),
    ue: sc2(ue, 3.5, 5),
    hy: sc2(hy, 300, 700),
    oil: sc2(brent, 70, 130),
    inf: sc2(pce, 2, 4),
    sent: sc2(80 - sent, 0, 40),
    crv: spread < 0 ? 80 : Math.max(0, 40 - spread * 40),
  };
  const W: Record<string, number> = { sahm: 0.2, ue: 0.15, hy: 0.15, oil: 0.2, inf: 0.15, sent: 0.1, crv: 0.05 };
  let comp = 0;
  Object.keys(sc).forEach((k) => { comp += (sc[k] ?? 0) * (W[k] ?? 0); });
  comp = Math.round(comp);
  const rS = Math.round(sc.sahm * 0.25 + sc.ue * 0.25 + sc.oil * 0.25 + sc.hy * 0.25);
  const dS = Math.round(sc.oil * 0.3 + sc.hy * 0.2 + sc.inf * 0.2 + sc.sent * 0.15 + sc.ue * 0.15);
  return { comp, rS, dS };
}

function threatClass(v: number | null, threshFn?: (v: number) => string): string {
  if (v == null || !threshFn) return "";
  return threshFn(v);
}

const CHART_BASE_OPTS: ChartOptions<"line"> = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 400 },
  interaction: { mode: "index", intersect: false },
  plugins: {
    legend: { display: false },
    tooltip: { enabled: false },
  },
  scales: {
    x: {
      grid: { display: false },
      ticks: { maxTicksLimit: 8, font: { size: 8 } },
    },
    y: {
      grid: { color: "#1a1a2a" },
      ticks: { font: { size: 8 } },
    },
  },
};

function mkOpts(showLegend = false): ChartOptions<"line"> {
  const o = JSON.parse(JSON.stringify(CHART_BASE_OPTS)) as ChartOptions<"line">;
  if (showLegend && o.plugins) {
    o.plugins.legend = {
      display: true,
      labels: { boxWidth: 8, font: { size: 9 } },
    };
  }
  return o;
}

function compute200DMA(data: Array<{ date: string; close: number }>) {
  const result: (number | null)[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < 199) {
      result.push(null);
    } else {
      const slice = data.slice(i - 199, i + 1);
      const avg = slice.reduce((s, d) => s + d.close, 0) / 200;
      result.push(avg);
    }
  }
  return result;
}

export default function Dashboard() {
  const [fredData, setFredData] = useState<FredData>({});
  const [fmpData, setFmpData] = useState<FmpData>({ indices: {}, sectors: {}, credit: {} });
  const [spHistory, setSpHistory] = useState<Array<{ date: string; close: number }>>([]);
  const [status, setStatus] = useState<"loading" | "live" | "error">("loading");
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [refreshing, setRefreshing] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setStatus("loading");
    try {
      const [fredRes, fmpRes, spRes] = await Promise.all([
        fetch(`${BASE}/api/fred-bulk`).then((r) => r.json()),
        fetch(`${BASE}/api/fmp/quotes`).then((r) => r.json()),
        fetch(`${BASE}/api/fmp/historical/%5EGSPC`).then((r) => r.json()),
      ]);
      setFredData(fredRes);
      setFmpData(fmpRes);
      if (spRes?.historical) {
        const hist = [...spRes.historical]
          .reverse()
          .map((d: { date: string; close: number }) => ({ date: d.date, close: d.close }));
        setSpHistory(hist);
      }
      setStatus("live");
      setLastUpdated(new Date().toLocaleTimeString());
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const timer = setInterval(fetchAll, 60 * 60 * 1000);
    return () => clearInterval(timer);
  }, [fetchAll]);

  const handleManualRefresh = async () => {
    setRefreshing(true);
    try {
      await fetch(`${BASE}/api/flush-cache`, { method: "POST" });
      await fetchAll();
    } finally {
      setRefreshing(false);
    }
  };

  const scores = Object.keys(fredData).length > 0 ? computeScore(fredData) : null;

  function FredSignalCard({
    id,
    label,
    freq,
    unit,
    dec,
    inv,
    threshFn,
    scale,
    yoy,
  }: {
    id: string;
    label: string;
    freq: string;
    unit: string;
    dec: number;
    inv: boolean;
    threshFn?: (v: number) => string;
    scale?: number;
    yoy?: boolean;
  }) {
    const { v: vRaw, p: pRaw, obs: rawObs } = gL(fredData, id);
    const isActive = drawerOpen === id;

    const sc = scale ?? 1;
    const v = vRaw != null ? vRaw * sc : null;
    const p = pRaw != null ? pRaw * sc : null;

    let displayV = v;
    let displayP = p;
    if (yoy && rawObs.length >= 12) {
      const recent = rawObs[0]?.value ?? 0;
      const year = rawObs[12]?.value ?? rawObs[rawObs.length - 1]?.value ?? recent;
      displayV = year !== 0 ? ((recent - year) / year) * 100 : null;
      const recent2 = rawObs[1]?.value ?? 0;
      const year2 = rawObs[13]?.value ?? rawObs[rawObs.length - 1]?.value ?? recent2;
      displayP = year2 !== 0 ? ((recent2 - year2) / year2) * 100 : null;
    }

    const valStr =
      displayV != null
        ? unit === "$"
          ? "$" + fmt(displayV, dec)
          : fmt(displayV, dec) + unit
        : "—";

    let chgT: string | null = null;
    let chgC = "cfl";
    if (displayV != null && displayP != null) {
      const d = displayV - displayP;
      const sign = d > 0 ? "+" : "";
      chgT = sign + d.toFixed(dec);
      chgC = inv
        ? d > 0
          ? "cdn"
          : d < 0
          ? "cup"
          : "cfl"
        : d > 0
        ? "cup"
        : d < 0
        ? "cdn"
        : "cfl";
    }

    const thr = displayV != null && threshFn ? threshFn(displayV) : "";

    const series = fredData[id];
    const hasHistory = series && series.observations && series.observations.length >= 3;

    return (
      <>
        <div
          className={`sc ${thr} ${isActive ? "act" : ""} ${!hasHistory ? "nc" : ""}`}
          onClick={() => {
            if (!hasHistory) return;
            setDrawerOpen(isActive ? null : id);
          }}
        >
          <div className="sl">
            <span>{label}</span>
            {hasHistory && <span className="eh">▼</span>}
          </div>
          <div className="sv">{valStr}</div>
          <div className={`sx ${chgC}`}>
            {chgT && <span>{chgT}</span>}
            {freq && <span className="fq">{freq}</span>}
          </div>
        </div>
        {isActive && hasHistory && (
          <div className="drw" style={{ gridColumn: "1/-1" }}>
            <div className="dh">
              <div className="dt">
                {series?.meta?.name || id} — {series.observations.length} pts
              </div>
              <button className="dc" onClick={() => setDrawerOpen(null)}>
                ✕
              </button>
            </div>
            <div className="ch">
              <Line
                data={{
                  labels: obsChronological(fredData, id).map((o) => o.date),
                  datasets: [
                    {
                      label: fredData[id]?.meta?.name || id,
                      data: obsChronological(fredData, id).map((o) => o.value),
                      borderColor: "#4096ff",
                      backgroundColor: "#4096ff18",
                      borderWidth: 1.5,
                      pointRadius: 0,
                      tension: 0.3,
                      fill: true,
                    },
                  ],
                }}
                options={mkOpts(false)}
              />
            </div>
          </div>
        )}
      </>
    );
  }

  const spDMA = compute200DMA(spHistory);
  const sp500ChartData = {
    labels: spHistory.map((d) => d.date),
    datasets: [
      {
        label: "S&P 500",
        data: spHistory.map((d) => d.close),
        borderColor: "#4096ff",
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0.2,
        fill: false,
      },
      {
        label: "200-DMA",
        data: spDMA,
        borderColor: "#ff4d4f",
        borderWidth: 1.5,
        borderDash: [5, 3],
        pointRadius: 0,
        tension: 0.2,
        fill: false,
      },
    ],
  };

  const ivolQuote = fmpData.credit?.["IVOL"];
  const moveCurrent = ivolQuote?.price ?? null;
  const moveChangePct = ivolQuote?.changePct ?? null;

  const wtiObs = obsChronological(fredData, "DCOILWTICO");
  const brentObs = obsChronological(fredData, "DCOILBRENTEU");
  const wtiSpot = gL(fredData, "DCOILWTICO").v ?? 80;
  const brentSpot = gL(fredData, "DCOILBRENTEU").v ?? 85;

  const fwdMo = ["Spot", "May 26", "Jun 26", "Jul 26", "Sep 26", "Dec 26", "Mar 27", "Jun 27", "Dec 27"];
  const decay = [1, 0.985, 0.97, 0.955, 0.93, 0.89, 0.86, 0.835, 0.8];
  const wtiFwd = decay.map((d) => wtiSpot * d);
  const brentFwd = decay.map((d) => brentSpot * d);

  const sahmObs = obsChronological(fredData, "SAHMREALTIME");
  const claimsObs = obsChronological(fredData, "ICSA");
  const hyObs = obsChronological(fredData, "BAMLH0A0HYM2");
  const ycObs = obsChronological(fredData, "T10Y2Y");
  const ffObs = obsChronological(fredData, "FEDFUNDS");
  const pceObs = obsChronological(fredData, "PCEPILFE");

  const q = fmpData.indices;
  const sectors = fmpData.sectors;
  const credit = fmpData.credit;

  const sectorNames: Record<string, string> = {
    XLE: "Energy", XLF: "Financials", XLK: "Technology",
    XLY: "Cons. Discretionary", XLV: "Healthcare", XLI: "Industrials",
    XLP: "Cons. Staples", XLU: "Utilities", XLRE: "Real Estate",
    XLC: "Communication", XLB: "Materials",
  };

  return (
    <>
      {status === "loading" && Object.keys(fredData).length === 0 && (
        <div className="load-ov" id="loadOv">
          <div className="spinner" />
          <div className="load-txt">Fetching macro data...</div>
        </div>
      )}

      <div className="hdr">
        <div className="hdr-l">
          <h1>
            Recession <span>Risk</span> Monitor
          </h1>
          <div
            className={`pill ${
              status === "loading" ? "loading" : status === "live" ? "live" : "err"
            }`}
          >
            {status === "loading" ? "Loading" : status === "live" ? "Live" : "Error"}
          </div>
        </div>
        <div className="hdr-r">
          <span className="lu">{lastUpdated ? `Updated ${lastUpdated}` : "—"}</span>
          <button
            className="rbtn"
            onClick={handleManualRefresh}
            disabled={refreshing}
          >
            ⟳ {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      <div className="dash">
        {/* Risk Gauges */}
        <div className="rrow">
          {scores ? (
            [
              { l: "Composite Risk Score", v: scores.comp },
              { l: "Recession Probability (12mo)", v: scores.rS },
              { l: "Drawdown Risk (≥15%)", v: scores.dS },
            ].map((g) => (
              <div className="ga" key={g.l}>
                <div className="gl">{g.l}</div>
                <div className="gv" style={{ color: rc(g.v) }}>
                  {g.v}
                </div>
                <div className="gs">{rl(g.v)}</div>
                <div className="bar">
                  <div
                    className="bf"
                    style={{ width: `${g.v}%`, background: rc(g.v) }}
                  />
                </div>
              </div>
            ))
          ) : (
            <>
              {[1, 2, 3].map((i) => (
                <div className="ga" key={i}>
                  <div className="gl">Loading...</div>
                  <div className="gv" style={{ color: "#55556a" }}>—</div>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Labor Market */}
        <div className="st">Labor Market</div>
        <div className="sg">
          <FredSignalCard id="UNRATE" label="Unemployment" freq="MoM" unit="%" dec={1} inv={true} threshFn={(v) => v >= 4.5 ? "th" : v >= 4.2 ? "tm" : "tl"} />
          <FredSignalCard id="U6RATE" label="U-6 Rate" freq="MoM" unit="%" dec={1} inv={true} threshFn={(v) => v >= 8.5 ? "th" : v >= 7.5 ? "tm" : "tl"} />
          <FredSignalCard id="PAYEMS" label="NFP Change" freq="MoM" unit="K" dec={0} inv={false} scale={1/1000} threshFn={(v) => v < 0 ? "th" : v < 100 ? "tm" : "tl"} />
          <FredSignalCard id="ICSA" label="Initial Claims" freq="WoW" unit="K" dec={0} inv={true} scale={1/1000} threshFn={(v) => v >= 250 ? "th" : v >= 220 ? "tm" : "tl"} />
          <FredSignalCard id="CCSA" label="Continuing Claims" freq="WoW" unit="K" dec={0} inv={true} scale={1/1000} threshFn={(v) => v >= 2200 ? "th" : v >= 1900 ? "tm" : "tl"} />
          <FredSignalCard id="JTSJOL" label="JOLTS Openings" freq="MoM" unit="K" dec={0} inv={false} threshFn={() => "tl"} />
          <FredSignalCard id="SAHMREALTIME" label="Sahm Rule" freq="MoM" unit="" dec={2} inv={true} threshFn={(v) => v >= 0.5 ? "th" : v >= 0.3 ? "tm" : "tl"} />
        </div>

        {/* Inflation & Rates */}
        <div className="st">Inflation & Rates</div>
        <div className="sg">
          <FredSignalCard id="PCEPILFE" label="Core PCE YoY" freq="MoM" unit="%" dec={1} inv={true} yoy={true} threshFn={(v) => v >= 3 ? "th" : v >= 2.5 ? "tm" : "tl"} />
          <FredSignalCard id="PCETRIM12M159SFRBDAL" label="Trimmed Mean PCE" freq="MoM" unit="%" dec={2} inv={true} threshFn={(v) => v >= 3 ? "th" : v >= 2.5 ? "tm" : "tl"} />
          <FredSignalCard id="DGS2" label="2Y Treasury" freq="WoW" unit="%" dec={2} inv={false} threshFn={() => ""} />
          <FredSignalCard id="DGS10" label="10Y Treasury" freq="WoW" unit="%" dec={2} inv={false} threshFn={() => ""} />
          <FredSignalCard id="T10Y2Y" label="2s10s Spread" freq="WoW" unit="bp" dec={2} inv={false} threshFn={(v) => v <= -0.2 ? "th" : v <= 0 ? "tm" : "tl"} />
          <FredSignalCard id="BAMLH0A0HYM2" label="HY OAS Spread" freq="WoW" unit="bp" dec={0} inv={true} threshFn={(v) => v >= 500 ? "th" : v >= 400 ? "tm" : "tl"} />
          <FredSignalCard id="DCOILBRENTEU" label="Brent Crude" freq="WoW" unit="$" dec={2} inv={true} threshFn={(v) => v >= 100 ? "th" : v >= 85 ? "tm" : "tl"} />
          <FredSignalCard id="DCOILWTICO" label="WTI Crude" freq="WoW" unit="$" dec={2} inv={true} threshFn={(v) => v >= 90 ? "th" : v >= 80 ? "tm" : "tl"} />
          <FredSignalCard id="UMCSENT" label="Consumer Sentiment" freq="MoM" unit="" dec={1} inv={false} threshFn={(v) => v <= 55 ? "th" : v <= 65 ? "tm" : "tl"} />
          <FredSignalCard id="PSAVERT" label="Savings Rate" freq="MoM" unit="%" dec={1} inv={false} threshFn={(v) => v <= 3 ? "th" : v <= 4 ? "tm" : "tl"} />
          <FredSignalCard id="DRCCLACBS" label="CC Delinquencies" freq="QoQ" unit="%" dec={2} inv={true} threshFn={(v) => v >= 3.5 ? "th" : v >= 2.8 ? "tm" : "tl"} />
        </div>

        {/* Leading Indicators — Charts */}
        <div className="st">Leading Indicators</div>

        <div className="cg">
          <div className="cc">
            <div className="ct">Oil — Spot (WTI & Brent) · 5Y</div>
            <div className="ch">
              {wtiObs.length > 0 ? (
                <Line
                  data={{
                    labels: wtiObs.map((o) => o.date),
                    datasets: [
                      { label: "WTI", data: wtiObs.map((o) => o.value), borderColor: "#faad14", borderWidth: 1.5, pointRadius: 0, tension: 0.3 },
                      { label: "Brent", data: brentObs.map((o) => o.value), borderColor: "#eb2f96", borderWidth: 1.5, pointRadius: 0, tension: 0.3 },
                    ],
                  }}
                  options={mkOpts(true)}
                />
              ) : <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#55556a" }}>Loading...</div>}
            </div>
          </div>
          <div className="cc">
            <div className="ct">Oil — Futures Forward Curve (Estimated)</div>
            <div className="ch">
              <Line
                data={{
                  labels: fwdMo,
                  datasets: [
                    { label: "WTI Fwd", data: wtiFwd, borderColor: "#faad14", backgroundColor: "#faad1415", borderWidth: 2, pointRadius: 4, pointBackgroundColor: "#faad14", tension: 0.3, fill: true },
                    { label: "Brent Fwd", data: brentFwd, borderColor: "#eb2f96", backgroundColor: "#eb2f9615", borderWidth: 2, pointRadius: 4, pointBackgroundColor: "#eb2f96", tension: 0.3, fill: true },
                  ],
                }}
                options={mkOpts(true)}
              />
            </div>
          </div>
        </div>

        <div className="cg">
          <div className="cc">
            <div className="ct">Sahm Rule · 5Y</div>
            <div className="ch">
              {sahmObs.length > 0 ? (
                <Line
                  data={{
                    labels: sahmObs.map((o) => o.date),
                    datasets: [
                      { label: "Sahm Rule", data: sahmObs.map((o) => o.value), borderColor: "#36cfc9", backgroundColor: "#36cfc918", borderWidth: 1.5, pointRadius: 0, tension: 0.3, fill: true },
                      { label: "Threshold (0.50)", data: sahmObs.map(() => 0.5), borderColor: "#ff4d4f88", borderWidth: 1, borderDash: [4, 4], pointRadius: 0, fill: false },
                    ],
                  }}
                  options={mkOpts(true)}
                />
              ) : <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#55556a" }}>Loading...</div>}
            </div>
          </div>
          <div className="cc">
            <div className="ct">Initial Claims (K) · 5Y</div>
            <div className="ch">
              {claimsObs.length > 0 ? (
                <Line
                  data={{
                    labels: claimsObs.map((o) => o.date),
                    datasets: [
                      { label: "Claims (K)", data: claimsObs.map((o) => o.value / 1000), borderColor: "#faad14", backgroundColor: "#faad1415", borderWidth: 1.5, pointRadius: 0, tension: 0.3, fill: true },
                      { label: "Warning (250K)", data: claimsObs.map(() => 250), borderColor: "#ff4d4f88", borderWidth: 1, borderDash: [4, 4], pointRadius: 0, fill: false },
                    ],
                  }}
                  options={mkOpts(true)}
                />
              ) : <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#55556a" }}>Loading...</div>}
            </div>
          </div>
        </div>

        <div className="cg">
          <div className="cc">
            <div className="ct">HY OAS Spread · 5Y</div>
            <div className="ch">
              {hyObs.length > 0 ? (
                <Line
                  data={{
                    labels: hyObs.map((o) => o.date),
                    datasets: [
                      { label: "HY OAS (bp)", data: hyObs.map((o) => o.value), borderColor: "#9254de", backgroundColor: "#9254de15", borderWidth: 1.5, pointRadius: 0, tension: 0.3, fill: true },
                      { label: "Stress (500bp)", data: hyObs.map(() => 500), borderColor: "#ff4d4f88", borderWidth: 1, borderDash: [4, 4], pointRadius: 0, fill: false },
                    ],
                  }}
                  options={mkOpts(true)}
                />
              ) : <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#55556a" }}>Loading...</div>}
            </div>
          </div>
          <div className="cc">
            <div className="ct">2s10s Yield Curve · 5Y</div>
            <div className="ch">
              {ycObs.length > 0 ? (
                <Line
                  data={{
                    labels: ycObs.map((o) => o.date),
                    datasets: [
                      { label: "2s10s", data: ycObs.map((o) => o.value), borderColor: "#4096ff", backgroundColor: "#4096ff15", borderWidth: 1.5, pointRadius: 0, tension: 0.3, fill: true },
                      { label: "Inversion (0)", data: ycObs.map(() => 0), borderColor: "#ff4d4f66", borderWidth: 1, borderDash: [4, 4], pointRadius: 0, fill: false },
                    ],
                  }}
                  options={mkOpts(true)}
                />
              ) : <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#55556a" }}>Loading...</div>}
            </div>
          </div>
        </div>

        <div className="cg">
          <div className="cc">
            <div className="ct">S&P 500 vs 200-DMA · 5Y</div>
            <div className="ch">
              {spHistory.length > 0 ? (
                <Line
                  data={sp500ChartData}
                  options={mkOpts(true)}
                />
              ) : <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#55556a" }}>Loading...</div>}
            </div>
          </div>
          <div className="cc">
            <div className="ct">Fed Funds vs Core PCE · 5Y</div>
            <div className="ch">
              {ffObs.length > 0 ? (
                <Line
                  data={{
                    labels: ffObs.map((o) => o.date),
                    datasets: [
                      { label: "Fed Funds", data: ffObs.map((o) => o.value), borderColor: "#faad14", borderWidth: 1.5, pointRadius: 0, tension: 0.2, fill: false },
                      { label: "Core PCE", data: pceObs.map((o) => o.value), borderColor: "#ff4d4f", borderWidth: 1.5, pointRadius: 0, tension: 0.3, fill: false },
                      { label: "2% Target", data: ffObs.map(() => 2), borderColor: "#52c41a55", borderWidth: 1, borderDash: [4, 4], pointRadius: 0, fill: false },
                    ],
                  }}
                  options={mkOpts(true)}
                />
              ) : <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#55556a" }}>Loading...</div>}
            </div>
          </div>
        </div>

        {/* Market & Volatility */}
        <div className="st">Market & Volatility</div>
        <div className="sg">
          {q["^GSPC"] && (() => {
            const sp = q["^GSPC"];
            const cls = sp.changePct >= 0 ? "cup" : "cdn";
            const thr = sp.changePct < -1 ? "th" : sp.changePct < 0 ? "tm" : "tl";
            return (
              <div className={`sc nc ${thr}`}>
                <div className="sl"><span>S&P 500</span></div>
                <div className="sv">{fmt(sp.price, 1)}</div>
                <div className={`sx ${cls}`}>
                  <span>{sp.changePct >= 0 ? "+" : ""}{fmt(sp.changePct, 2)}%</span>
                  <span className="fq">DoD</span>
                </div>
              </div>
            );
          })()}

          {q["^VIX"] && (() => {
            const vix = q["^VIX"];
            const cls = vix.changePct >= 0 ? "cdn" : "cup";
            const thr = vix.price > 30 ? "th" : vix.price > 20 ? "tm" : "tl";
            return (
              <div className={`sc nc ${thr}`}>
                <div className="sl"><span>VIX</span></div>
                <div className="sv">{fmt(vix.price, 2)}</div>
                <div className={`sx ${cls}`}>
                  <span>{vix.changePct >= 0 ? "+" : ""}{fmt(vix.changePct, 2)}%</span>
                  <span className="fq">DoD</span>
                </div>
              </div>
            );
          })()}

          {q["^VVIX"] && (() => {
            const vvix = q["^VVIX"];
            const cls = vvix.changePct >= 0 ? "cdn" : "cup";
            const thr = vvix.price > 140 ? "th" : vvix.price > 110 ? "tm" : "tl";
            return (
              <div className={`sc nc ${thr}`}>
                <div className="sl"><span>VVIX</span></div>
                <div className="sv">{fmt(vvix.price, 1)}</div>
                <div className={`sx ${cls}`}>
                  <span>{vvix.changePct >= 0 ? "+" : ""}{fmt(vvix.changePct, 2)}%</span>
                  <span className="fq">DoD</span>
                </div>
              </div>
            );
          })()}

          <div className={`sc nc ${moveCurrent != null ? (moveCurrent > 25 ? "th" : moveCurrent > 20 ? "tm" : "tl") : ""}`}>
            <div className="sl"><span>Rate Vol (IVOL)</span></div>
            <div className="sv">{moveCurrent != null ? "$" + fmt(moveCurrent, 2) : "—"}</div>
            <div className={`sx ${moveChangePct != null ? (moveChangePct >= 0 ? "cdn" : "cup") : "cfl"}`}>
              {moveChangePct != null && <span>{moveChangePct >= 0 ? "+" : ""}{fmt(moveChangePct, 2)}%</span>}
              <span className="fq">DoD</span>
            </div>
          </div>

          {credit["HYG"] && (() => {
            const hyg = credit["HYG"];
            const cls = hyg.changePct >= 0 ? "cup" : "cdn";
            const thr = hyg.price < 76 ? "th" : hyg.price < 79 ? "tm" : "tl";
            return (
              <div className={`sc nc ${thr}`}>
                <div className="sl"><span>HYG (Credit Proxy)</span></div>
                <div className="sv">${fmt(hyg.price, 2)}</div>
                <div className={`sx ${cls}`}>
                  <span>{hyg.changePct >= 0 ? "+" : ""}{fmt(hyg.changePct, 2)}%</span>
                  <span className="fq">DoD</span>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Sector Rotation */}
        <div className="st">Sector Rotation</div>
        <div className="sec-grid">
          {Object.entries(sectorNames).map(([sym, name]) => {
            const s = sectors[sym];
            if (!s) return null;
            const wk = s.changePct ?? 0;
            const wkC = wk >= 0 ? "cup" : "cdn";
            const pe = s.pe ? fmt(s.pe, 1) : "—";
            return (
              <div className="sec-card" key={sym}>
                <div className="sec-name">
                  <span>{name}</span>
                  <span style={{ color: "var(--t2)" }}>{sym}</span>
                </div>
                <div className="sec-price">${fmt(s.price, 2)}</div>
                <div className="sec-row">
                  <div className="sec-metric">
                    <span className="ml">DoD</span>
                    <span className={wkC}>{wk >= 0 ? "+" : ""}{fmt(wk, 2)}%</span>
                  </div>
                  <div className="sec-metric">
                    <span className="ml">P/E</span>
                    <span>{pe}</span>
                  </div>
                  <div className="sec-metric">
                    <span className="ml">52w Hi</span>
                    <span>${s.yearHigh ? fmt(s.yearHigh, 0) : "—"}</span>
                  </div>
                  <div className="sec-metric">
                    <span className="ml">52w Lo</span>
                    <span>${s.yearLow ? fmt(s.yearLow, 0) : "—"}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
