"use client";

import { MetricCard } from "@/components/MetricCard";
import { LeverageGauge } from "@/components/LeverageGauge";
import { Badge } from "@/components/ui/badge";

// Dummy data generator
const generateHistory = (base: number, variance: number) => {
  return Array.from({ length: 20 }, (_, i) => ({
    value: base + (Math.random() * variance - variance / 2),
  }));
};

export default function Dashboard() {
  // Data Points
  const shortTerm = [
    {
      title: "SPY % > 50d EMA",
      value: "+0.25%",
      trend: "up" as const,
      data: generateHistory(0.25, 2),
    },
    {
      title: "Daily RSI",
      value: "48.5",
      trend: "neutral" as const,
      data: generateHistory(48.5, 10),
    },
    {
      title: "% Stocks > 20d SMA",
      value: "52%",
      trend: "up" as const,
      data: generateHistory(52, 15),
    },
  ];

  const mediumTerm = [
    {
      title: "SPY % > 50w EMA",
      value: "+11.2%",
      trend: "up" as const,
      data: generateHistory(11.2, 5),
    },
    {
      title: "Weekly RSI",
      value: "52.1",
      trend: "neutral" as const,
      data: generateHistory(52.1, 10),
    },
    {
      title: "VIX Index",
      value: "15.04",
      trend: "down" as const, // Low VIX is usually "good" for bulls, but "down" red color might be confusing. 
      // Bloomberg style: Green = up/good, Red = down/bad usually. 
      // For VIX, low is calm (green?), high is panic (red?).
      // User asked for "green and red text for numbers". Usually + is green, - is red.
      // But for VIX, standard might be just value. I'll stick to color based on movement if I knew it.
      // I'll make it neutral or strictly numeric color. Let's use neutral for VIX to be safe, or green if low.
      data: generateHistory(15, 3),
    },
  ];

  const longTerm = [
    {
      title: "Monthly RSI",
      value: "74.2",
      trend: "up" as const, // High RSI might be overbought (risk), but momentum is up.
      data: generateHistory(74.2, 5),
    },
    {
      title: "% Stocks > 200d SMA",
      value: "68%",
      trend: "up" as const,
      data: generateHistory(68, 10),
    },
    {
      title: "NTM P/E Multiple",
      value: "23.1",
      trend: "up" as const, // High P/E is risk.
      data: generateHistory(23.1, 2),
      isRisk: true, // Marker for logic
    },
  ];

  // Logic for Leverage Gauge
  const ntmPE = 23.1;
  const safetyThreshold = 22;
  const rawLeverageScore = 85; // Calculated score (hypothetical)
  
  const isSafetyWarning = ntmPE > safetyThreshold;
  const leverageScore = isSafetyWarning ? Math.min(rawLeverageScore, 45) : rawLeverageScore;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-8 font-mono">
      <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-emerald-500 tracking-tight">
            LEVERAGE RISK DASHBOARD
          </h1>
          <p className="text-slate-400 mt-1">Market Health & Exposure Monitor</p>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline" className="text-emerald-400 border-emerald-400/30">
            Market Open
          </Badge>
          <Badge variant="outline" className="text-slate-400 border-slate-700">
            Updated: 10:42 AM
          </Badge>
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
        <LeverageGauge score={leverageScore} warning={isSafetyWarning} />
      </section>
    </div>
  );
}
