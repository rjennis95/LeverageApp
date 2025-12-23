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
  const [vixData, setVixData] = useState<HistoryPoint[]>([]);

  useEffect(() => {
    async function loadData() {
      const history = await getMarketHistory();
      if (history) {
        setData(history);
        
        // --- Process Data ---
        // SPY Arrays
        const spyPrices = history.spy;
        const spyEma50 = calculateEMA(spyPrices, 50);
        const spyRsi14 = calculateRSI(spyPrices, 14);
        const spySma20 = calculateSMA(spyPrices, 20); // Using SMA20 of price as proxy for "% Stocks > 20d SMA" (which we can't get)
        // Note: Real "% Stocks > 20d SMA" is market breadth. We are substituting with "SPY vs 20d SMA" or similar for the chart, 
        // OR we just show SPY price history in that box but labeled correctly? 
        // The prompt says "replace... with single useEffect... TIME_SERIES_DAILY... Map...". 
        // It implies using the SPY data for these charts. 
        // I will map SPY Price history to the "Short Term" charts, but maybe overlay the indicator?
        // MetricCard only takes `data`. I'll pass the indicator history if available.
        
        // Dates
        const today = new Date();
        const oneYearAgo = new Date(today.setFullYear(today.getFullYear() - 1)).toISOString().split("T")[0];
        const threeYearsAgo = new Date(today.setFullYear(today.getFullYear() - 2)).toISOString().split("T")[0]; // Resetting... wait
        const tenYearsAgo = new Date(today.setFullYear(today.getFullYear() - 7)).toISOString().split("T")[0]; // -7 more (total 10)

        // Filter Helpers
        const filterSince = (arr: HistoryPoint[], dateStr: string) => arr.filter(p => p.date >= dateStr);

        // Slice Data
        setShortTermData(filterSince(spyPrices, oneYearAgo));
        setMediumTermData(filterSince(spyPrices, threeYearsAgo));
        setLongTermData(filterSince(spyPrices, tenYearsAgo));
        setVixData(history.vix);
      }
      setLoading(false);
    }
    loadData();
  }, []);

  // --- Live/Latest Values ---
  const latestSpy = data?.spy && data.spy.length > 0 ? data.spy[data.spy.length - 1].value : 0;
  
  // Need latest indicators for the text values
  const spyPrices = data?.spy || [];
  const rsiArr = calculateRSI(spyPrices, 14);
  const latestRsi = rsiArr.length > 0 ? rsiArr[rsiArr.length - 1].value : 50;

  const ema50Arr = calculateEMA(spyPrices, 50);
  const latestEma50 = ema50Arr.length > 0 ? ema50Arr[ema50Arr.length - 1].value : latestSpy;

  const sma20Arr = calculateSMA(spyPrices, 20);
  const latestSma20 = sma20Arr.length > 0 ? sma20Arr[sma20Arr.length - 1].value : latestSpy;
  
  const latestVix = data?.vix && data.vix.length > 0 ? data.vix[data.vix.length - 1].value : 15;
  const peRatio = data?.peRatio || 23.1;

  const pctAboveEma = latestSpy && latestEma50 ? ((latestSpy - latestEma50) / latestEma50) * 100 : 0;
  const pctAboveSma20 = latestSpy && latestSma20 ? ((latestSpy - latestSma20) / latestSma20) * 100 : 0; // Proxy

  // --- Leverage Score Logic ---
  // Simple scoring
  let rawScore = 50; 
  if (pctAboveEma > 0) rawScore += 20; 
  if (latestRsi < 30) rawScore += 20; 
  if (latestRsi > 70) rawScore -= 20; 
  if (latestVix < 20) rawScore += 10;
  if (latestVix > 30) rawScore -= 20;
  rawScore = Math.max(0, Math.min(100, rawScore));

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
  
  // Specific Indicator Arrays for Charts
  // We need to re-calculate these for the full history then slice, to ensure accuracy
  const fullRsi = calculateRSI(spyPrices, 14);
  const fullEma50 = calculateEMA(spyPrices, 50); // For % > EMA chart? Or just Price? 
  // Visuals: The cards are titled "SPY % > 50d EMA". A line chart of that % would be best.
  // Let's create derived arrays.
  
  const diffEma50 = spyPrices.map((p, i) => {
      // Find matching EMA (dates align if we are careful, but safer to lookup)
      // Since calculateEMA returns aligned dates if passed same array? 
      // calculateEMA starts from index 0 of input.
      const ema = fullEma50.find(e => e.date === p.date)?.value;
      if (!ema) return { date: p.date, value: 0 };
      return { date: p.date, value: ((p.value - ema) / ema) * 100 };
  });

  const diffSma20 = spyPrices.map((p) => {
      const sma = calculateSMA(spyPrices, 20).find(s => s.date === p.date)?.value;
      if (!sma) return { date: p.date, value: 0 };
      return { date: p.date, value: ((p.value - sma) / sma) * 100 }; // Proxy
  });

  // Short Term (1Y)
  const shortTerm = [
    {
      title: "SPY % > 50d EMA",
      value: fmtPct(pctAboveEma),
      trend: pctAboveEma > 0 ? ("up" as const) : ("down" as const),
      data: filterSince(diffEma50, 1), 
    },
    {
      title: "Daily RSI",
      value: fmtNum(latestRsi),
      trend: "neutral" as const,
      data: filterSince(fullRsi, 1),
    },
    {
      title: "% Stocks > 20d SMA (Proxy: SPY vs SMA20)", // Renamed to be honest about proxy
      value: fmtPct(pctAboveSma20), // "52%" was hardcoded. Now using proxy.
      trend: "up" as const,
      data: filterSince(diffSma20, 1),
    },
  ];

  // Medium Term (3Y)
  // Need Weekly RSI? Calculating Daily RSI over 3 years is fine visualization.
  const mediumTerm = [
    {
      title: "SPY % > 50d EMA (3Y)", // Using 50d instead of 50w for simplicity of "single useEffect"
      value: fmtPct(pctAboveEma),
      trend: "up" as const,
      data: filterSince(diffEma50, 3),
    },
    {
      title: "Daily RSI (3Y)", // Using Daily instead of Weekly
      value: fmtNum(latestRsi),
      trend: "neutral" as const,
      data: filterSince(fullRsi, 3),
    },
    {
      title: "VIX Index",
      value: fmtNum(latestVix),
      trend: latestVix > 20 ? ("down" as const) : ("neutral" as const), 
      data: filterSince(data?.vix || [], 3),
    },
  ];

  // Long Term (10Y)
  const longTerm = [
    {
      title: "Daily RSI (10Y)", // Using Daily instead of Monthly
      value: fmtNum(latestRsi),
      trend: "up" as const,
      data: filterSince(fullRsi, 10),
    },
    {
      title: "SPY Price (10Y)", // Replaced "Stocks > 200d SMA" with Price since we don't have breadth data
      value: fmtNum(latestSpy),
      trend: "up" as const,
      data: filterSince(spyPrices, 10),
    },
    {
      title: "NTM P/E Multiple",
      value: fmtNum(peRatio),
      trend: "up" as const,
      data: [], // No history for P/E from this API
    },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-8 font-mono">
      <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-emerald-500 tracking-tight">
            LEVERAGE RISK DASHBOARD
          </h1>
          <p className="text-slate-400 mt-1">Market Health & Exposure Monitor</p>
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
        {/* Short Term */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-slate-300 border-b border-slate-800 pb-2">
            Short-Term (1 Year)
          </h2>
          {shortTerm.map((metric, i) => (
            <MetricCard
              key={i}
              title={metric.title}
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
          {longTerm.map((metric, i) => (
            <MetricCard
              key={i}
              title={metric.title}
              value={metric.value}
              trend={metric.trend}
              data={metric.data}
              color="#a78bfa" 
            />
          ))}
        </div>
      </div>

      {/* Leverage Gauge Section */}
      <section className="mt-12">
        <h2 className="text-2xl font-semibold text-slate-300 text-center mb-6">
          Recommended Leverage Exposure
        </h2>
        <LeverageGauge score={Math.round(leverageScore)} warning={isSafetyWarning} />
      </section>
    </div>
  );
}
