"use client";

import { useEffect, useState } from "react";
import { MetricCard } from "@/components/MetricCard";
import { LeverageGauge } from "@/components/LeverageGauge";
import { Badge } from "@/components/ui/badge";
import { getMarketHistory, calculateEMA, calculateRSI, calculateSMA, MarketHistory, HistoryPoint } from "@/lib/marketData";

export default function Dashboard() {
  const [data, setData] = useState<MarketHistory | null>(null);
  const [loading, setLoading] = useState(true);

  // Computed state for charts
  const [shortTermData, setShortTermData] = useState<any[]>([]);
  const [mediumTermData, setMediumTermData] = useState<any[]>([]);
  const [longTermData, setLongTermData] = useState<any[]>([]);

  useEffect(() => {
    async function loadData() {
      // Even if getMarketHistory returns null (due to API limit/missing key), 
      // we still want to render the page structure, just with empty data.
      const history = await getMarketHistory();
      if (history) {
        setData(history);
      } else {
        // Explicitly set null to indicate failure/no data
        setData(null);
      }
      setLoading(false);
    }
    loadData();
  }, []);

  // --- Live/Latest Values Helpers ---
  const getLast = (arr: HistoryPoint[]) => arr && arr.length > 0 ? arr[arr.length - 1].value : 0;
  
  // Data extraction - Default to empty arrays if data is null
  const spyDaily = data?.spyDaily || [];
  const spyWeekly = data?.spyWeekly || [];
  const spyMonthly = data?.spyMonthly || [];
  const vixDaily = data?.vixDaily || [];
  const breadthDaily = data?.breadth || [];
  
  // --- Derived Technicals ---

  // 1. Short Term (Daily)
  // SPY % > 50d EMA
  const ema50d = calculateEMA(spyDaily, 50);
  const diffEma50d = spyDaily.map(p => {
      const ema = ema50d.find(e => e.date === p.date)?.value;
      if(!ema) return { date: p.date, value: 0 };
      // Calculation: ((Price / EMA) - 1) * 100
      return { date: p.date, value: ((p.value / ema) - 1) * 100 };
  });
  
  // Daily RSI (14)
  const rsiDaily = calculateRSI(spyDaily, 14);
  
  // Breadth Proxy
  const breadthSma20 = calculateSMA(breadthDaily, 20);
  const diffBreadthSma20 = breadthDaily.map(p => {
      const sma = breadthSma20.find(s => s.date === p.date)?.value;
      if(!sma) return { date: p.date, value: 0 };
      return { date: p.date, value: ((p.value / sma) - 1) * 100 };
  });

  // 2. Medium Term (Weekly)
  // SPY % > 50w EMA
  const ema50w = calculateEMA(spyWeekly, 50);
  const diffEma50w = spyWeekly.map(p => {
      const ema = ema50w.find(e => e.date === p.date)?.value;
      if(!ema) return { date: p.date, value: 0 };
      return { date: p.date, value: ((p.value / ema) - 1) * 100 };
  });

  // Weekly RSI (14)
  const rsiWeekly = calculateRSI(spyWeekly, 14);

  // 3. Long Term (Monthly)
  // Monthly RSI (14)
  const rsiMonthly = calculateRSI(spyMonthly, 14);

  // SPY % > 50m EMA
  const ema50m = calculateEMA(spyMonthly, 50);
  const diffEma50m = spyMonthly.map(p => {
      const ema = ema50m.find(e => e.date === p.date)?.value;
      if(!ema) return { date: p.date, value: 0 };
      return { date: p.date, value: ((p.value / ema) - 1) * 100 };
  });

  // --- Latest Values for Display ---
  const valEma50d = getLast(diffEma50d);
  const valRsiDaily = getLast(rsiDaily);
  const valBreadth = getLast(diffBreadthSma20); // Proxy value
  
  const valEma50w = getLast(diffEma50w);
  const valRsiWeekly = getLast(rsiWeekly);
  const valVix = getLast(vixDaily);
  
  const valRsiMonthly = getLast(rsiMonthly);
  const valEma50m = getLast(diffEma50m);
  const peRatio = data?.peRatio || 23.1;


  // --- Leverage Score Logic ---
  let rawScore = 50; 
  // Only calculate if we have data
  if (data) {
    if (valEma50d > 0) rawScore += 15; 
    if (valBreadth > 0) rawScore += 15; 
    if (valRsiDaily < 30) rawScore += 20; 
    if (valRsiDaily > 70) rawScore -= 20; 
    if (valVix < 20) rawScore += 10;
    if (valVix > 30) rawScore -= 20;
    rawScore = Math.max(0, Math.min(100, rawScore));
  } else {
      rawScore = 0; // Or keep at 50 neutral? Let's say 0 to indicate issue.
  }

  const isSafetyWarning = peRatio > 22;
  const leverageScore = isSafetyWarning ? Math.min(rawScore, 45) : rawScore;

  // Formatting helpers
  const fmtPct = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;
  const fmtNum = (n: number) => n.toFixed(2);
  const filterSince = (arr: HistoryPoint[], years: number) => {
    if (!arr.length) return [];
    const date = new Date();
    date.setFullYear(date.getFullYear() - years);
    const dateStr = date.toISOString().split("T")[0];
    return arr.filter(p => p.date >= dateStr);
  };
  
  // Status check logic
  const apiKeyExists = typeof process !== 'undefined' && process.env.NEXT_PUBLIC_MARKET_DATA_KEY;
  let statusColor = "bg-green-500";
  let statusText = "System Normal";
  
  if (!apiKeyExists) {
      statusColor = "bg-red-500";
      statusText = "API Key Missing";
  } else if (!data && !loading) {
      // If loading finished but no data -> API probably failed or limit reached
      statusColor = "bg-yellow-500"; // Yellow to indicate fallback mode (individual charts will show error)
      statusText = "Partial / Fallback Mode";
  }

  // --- Chart Configs ---
  const shortTerm = [
    {
      title: "SPY % > 50d EMA",
      subLabel: "Source: AlphaVantage Daily",
      value: data ? fmtPct(valEma50d) : "---",
      trend: valEma50d > 0 ? ("up" as const) : ("down" as const),
      data: filterSince(diffEma50d, 1), 
    },
    {
      title: "Daily RSI (14)",
      subLabel: "Source: AlphaVantage Daily",
      value: data ? fmtNum(valRsiDaily) : "---",
      trend: "neutral" as const,
      data: filterSince(rsiDaily, 1),
    },
    {
      title: "Market Breadth (Proxy)",
      subLabel: "RSP (Eq Wgt) % > 20d SMA",
      value: data ? fmtPct(valBreadth) : "---", 
      trend: valBreadth > 0 ? "up" as const : "down" as const,
      data: filterSince(diffBreadthSma20, 1),
    },
  ];

  const mediumTerm = [
    {
      title: "SPY % > 50w EMA",
      subLabel: "Source: AlphaVantage Weekly",
      value: data ? fmtPct(valEma50w) : "---",
      trend: valEma50w > 0 ? ("up" as const) : ("down" as const),
      data: filterSince(diffEma50w, 3),
    },
    {
      title: "Weekly RSI (14)", 
      subLabel: "Source: AlphaVantage Weekly",
      value: data ? fmtNum(valRsiWeekly) : "---",
      trend: "neutral" as const,
      data: filterSince(rsiWeekly, 3),
    },
    {
      title: "VIX Index",
      subLabel: "Source: AlphaVantage Daily",
      value: data ? fmtNum(valVix) : "---",
      trend: valVix > 20 ? ("down" as const) : ("neutral" as const), 
      data: filterSince(vixDaily, 3),
    },
  ];

  const longTerm = [
    {
      title: "Monthly RSI (14)", 
      subLabel: "Source: AlphaVantage Monthly",
      value: data ? fmtNum(valRsiMonthly) : "---",
      trend: "up" as const,
      data: filterSince(rsiMonthly, 10),
    },
    {
      title: "SPY % > 50m EMA", 
      subLabel: "Source: AlphaVantage Monthly",
      value: data ? fmtPct(valEma50m) : "---",
      trend: valEma50m > 0 ? ("up" as const) : ("down" as const),
      data: filterSince(diffEma50m, 10),
    },
    {
      title: "NTM P/E Multiple",
      subLabel: "Source: AlphaVantage Overview",
      value: data ? fmtNum(peRatio) : "---",
      trend: "up" as const,
      data: [], // No history for P/E
    },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-8 font-mono">
      <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-emerald-500 tracking-tight">
            LEVERAGE RISK DASHBOARD
          </h1>
          <div className="flex items-center gap-3 mt-1">
             <p className="text-slate-400">Market Health & Exposure Monitor</p>
             <div className="flex items-center gap-2 px-2 py-1 bg-slate-900 rounded-md border border-slate-800" title={statusText}>
                <div className={`w-2 h-2 rounded-full ${statusColor} animate-pulse`} />
                <span className="text-xs text-slate-500 hidden md:block">{statusText}</span>
             </div>
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <Badge variant="outline" className="text-emerald-400 border-emerald-400/30">
            Market Open
          </Badge>
          {data?.lastUpdated && (
             <span className="text-xs text-slate-500">
               Data as of Close: {data.lastUpdated}
             </span>
          )}
        </div>
      </header>

      {/* Main Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
         {/* We always render the grid now, passing potentially empty data to cards */}
         
            {/* Short Term */}
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-slate-300 border-b border-slate-800 pb-2">
                Short-Term (1 Year)
              </h2>
              {shortTerm.map((metric, i) => (
                <MetricCard
                  key={i}
                  title={metric.title}
                  subLabel={metric.subLabel}
                  value={metric.value}
                  trend={metric.trend}
                  data={metric.data}
                  color="#34d399" 
                />
              ))}
            </div>

            {/* Medium Term */}
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-slate-300 border-b border-slate-800 pb-2">
                Medium-Term (3 Years)
              </h2>
              {mediumTerm.map((metric, i) => (
                <MetricCard
                  key={i}
                  title={metric.title}
                  subLabel={metric.subLabel}
                  value={metric.value}
                  trend={metric.trend}
                  data={metric.data}
                  color="#60a5fa" 
                />
              ))}
            </div>

            {/* Long Term */}
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-slate-300 border-b border-slate-800 pb-2">
                Long-Term (10 Years)
              </h2>
              {/* Row 1: SPY % > 50m EMA */}
              <MetricCard
                  key="lt-ema"
                  title={longTerm[1].title}
                  subLabel={longTerm[1].subLabel}
                  value={longTerm[1].value}
                  trend={longTerm[1].trend}
                  data={longTerm[1].data}
                  color="#a78bfa" 
              />
              {/* Row 2: Monthly RSI */}
              <MetricCard
                  key="lt-rsi"
                  title={longTerm[0].title}
                  subLabel={longTerm[0].subLabel}
                  value={longTerm[0].value}
                  trend={longTerm[0].trend}
                  data={longTerm[0].data}
                  color="#a78bfa" 
              />
              {/* Row 3: P/E */}
              <MetricCard
                  key="lt-pe"
                  title={longTerm[2].title}
                  subLabel={longTerm[2].subLabel}
                  value={longTerm[2].value}
                  trend={longTerm[2].trend}
                  data={longTerm[2].data}
                  color="#a78bfa" 
              />
            </div>
      </div>

      {/* Leverage Gauge Section - Always show, might show 0 score if failed */}
      <section className="mt-12">
        <h2 className="text-2xl font-semibold text-slate-300 text-center mb-6">
        Recommended Leverage Exposure
        </h2>
        <LeverageGauge score={Math.round(leverageScore)} warning={isSafetyWarning} />
      </section>
    </div>
  );
}
