"use client";

import { useEffect, useState } from "react";
import { MetricCard } from "@/components/MetricCard";
import { LeverageGauge } from "@/components/LeverageGauge";
import { Badge } from "@/components/ui/badge";
import { getMarketData, MarketData } from "@/lib/marketData";

// Dummy data generator for history (keep sparklines visual)
const generateHistory = (base: number, variance: number) => {
  return Array.from({ length: 20 }, (_, i) => ({
    value: base + (Math.random() * variance - variance / 2),
  }));
};

export default function Dashboard() {
  const [data, setData] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      const marketData = await getMarketData();
      if (marketData) {
        setData(marketData);
      }
      setLoading(false);
    }
    loadData();
  }, []);

  // Calculate dynamic values
  const spyPrice = data?.spyPrice || 440; // fallback
  const spyEma50 = data?.spyEma50 || 435; // fallback
  const spyRsi = data?.spyRsi || 48.5; // fallback
  const vix = data?.vix || 15.04; // fallback
  const ntmPE = data?.peRatio || 23.1; // fallback
  
  // Calculate % > 50d EMA
  const pctAboveEma = ((spyPrice - spyEma50) / spyEma50) * 100;

  // Logic for Leverage Gauge
  // If data is real, we might want a real calculation. 
  // For now, let's assume a basic score model derived from these inputs:
  // - High RSI (>70) -> reduce leverage (risk of pullback)
  // - Low VIX (<15) -> increase leverage (calm market)
  // - Price > EMA -> increase leverage (uptrend)
  // - High P/E (>22) -> SAFETY VETO
  
  // Simple scoring (example logic)
  let rawScore = 50; 
  if (pctAboveEma > 0) rawScore += 20; // Uptrend
  if (spyRsi < 30) rawScore += 20; // Oversold (buy dip)
  if (spyRsi > 70) rawScore -= 20; // Overbought (caution)
  if (vix < 20) rawScore += 10;
  if (vix > 30) rawScore -= 20;
  
  // Clamp raw score
  rawScore = Math.max(0, Math.min(100, rawScore));

  const safetyThreshold = 22;
  const isSafetyWarning = ntmPE > safetyThreshold;
  const leverageScore = isSafetyWarning ? Math.min(rawScore, 45) : rawScore;

  // Formatting helpers
  const fmtPct = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;
  const fmtNum = (n: number) => n.toFixed(2);

  // Data Points
  const shortTerm = [
    {
      title: "SPY % > 50d EMA",
      value: fmtPct(pctAboveEma),
      trend: pctAboveEma > 0 ? ("up" as const) : ("down" as const),
      data: generateHistory(pctAboveEma, 0.5), // Simulated history for sparkline
    },
    {
      title: "Daily RSI",
      value: fmtNum(spyRsi),
      trend: "neutral" as const,
      data: generateHistory(spyRsi, 5),
    },
    {
      title: "% Stocks > 20d SMA",
      value: "52%", // Still hardcoded/simulated as requested to focus on specific live data
      trend: "up" as const,
      data: generateHistory(52, 15),
    },
  ];

  const mediumTerm = [
    {
      title: "SPY % > 50w EMA",
      value: "+11.2%", // Keeping hardcoded as we only fetched Daily
      trend: "up" as const,
      data: generateHistory(11.2, 5),
    },
    {
      title: "Weekly RSI",
      value: "52.1", // Keeping hardcoded
      trend: "neutral" as const,
      data: generateHistory(52.1, 10),
    },
    {
      title: "VIX Index",
      value: fmtNum(vix),
      trend: vix > 20 ? ("down" as const) : ("neutral" as const), 
      data: generateHistory(vix, 2),
    },
  ];

  const longTerm = [
    {
      title: "Monthly RSI",
      value: "74.2", // Keeping hardcoded
      trend: "up" as const,
      data: generateHistory(74.2, 5),
    },
    {
      title: "% Stocks > 200d SMA",
      value: "68%", // Keeping hardcoded
      trend: "up" as const,
      data: generateHistory(68, 10),
    },
    {
      title: "NTM P/E Multiple",
      value: fmtNum(ntmPE),
      trend: "up" as const,
      data: generateHistory(ntmPE, 1),
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
            Short-Term (Tactical)
          </h2>
          {shortTerm.map((metric, i) => (
            <MetricCard
              key={i}
              title={metric.title}
              value={metric.value}
              trend={metric.trend}
              data={metric.data}
              color="#34d399" // emerald-400
            />
          ))}
        </div>

        {/* Medium Term */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-slate-300 border-b border-slate-800 pb-2">
            Medium-Term (Swing)
          </h2>
          {mediumTerm.map((metric, i) => (
            <MetricCard
              key={i}
              title={metric.title}
              value={metric.value}
              trend={metric.trend}
              data={metric.data}
              color="#60a5fa" // blue-400
            />
          ))}
        </div>

        {/* Long Term */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-slate-300 border-b border-slate-800 pb-2">
            Long-Term (Strategic)
          </h2>
          {longTerm.map((metric, i) => (
            <MetricCard
              key={i}
              title={metric.title}
              value={metric.value}
              trend={metric.trend}
              data={metric.data}
              color="#a78bfa" // violet-400
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
