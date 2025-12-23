"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Label } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";

interface LeverageGaugeProps {
  score: number;
  warning?: boolean;
}

export function LeverageGauge({ score, warning }: LeverageGaugeProps) {
  // Gauge data: value and remainder
  // We want a semi-circle gauge (180 degrees)
  // startAngle 180, endAngle 0
  
  const data = [
    { name: "Score", value: score, color: score > 75 ? "#ef4444" : score > 50 ? "#eab308" : "#22c55e" },
    { name: "Remaining", value: 100 - score, color: "#334155" }, // slate-700
  ];

  return (
    <Card className="bg-slate-900 border-slate-800 w-full max-w-md mx-auto">
      <CardHeader className="text-center pb-0">
        <CardTitle className="text-slate-400">Leverage Score</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center justify-center relative">
        <div className="h-[250px] w-full relative">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="70%"
                startAngle={180}
                endAngle={0}
                innerRadius={80}
                outerRadius={120}
                paddingAngle={0}
                dataKey="value"
                stroke="none"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          {/* Centered Label */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pt-20 pointer-events-none">
            <span className="text-5xl font-bold text-slate-100">{score}</span>
            <span className="text-sm text-slate-500">/ 100</span>
          </div>
        </div>

        {warning && (
          <div className="flex items-center gap-2 text-yellow-500 bg-yellow-950/30 px-4 py-2 rounded-md border border-yellow-900/50 mt-[-40px] mb-4">
            <AlertTriangle className="h-5 w-5" />
            <span className="font-semibold">Safety Warning: High P/E</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
