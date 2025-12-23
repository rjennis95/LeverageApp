"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  title: string;
  value: string | number;
  trend?: "up" | "down" | "neutral";
  data: { date: string; value: number }[];
  color?: string;
  subLabel?: string;
}

export function MetricCard({ title, value, trend, data, color, subLabel }: MetricCardProps) {
  const trendColor =
    trend === "up"
      ? "text-green-500"
      : trend === "down"
      ? "text-red-500"
      : "text-slate-400";

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader className="flex flex-col space-y-1 pb-2">
        <CardTitle className="text-sm font-medium text-slate-400">
          {title}
        </CardTitle>
        {subLabel && (
          <span className="text-[10px] uppercase tracking-wider text-slate-600 font-semibold">
            {subLabel}
          </span>
        )}
      </CardHeader>
      <CardContent>
        <div className={cn("text-2xl font-bold", trendColor)}>{value}</div>
        <div className="h-[120px] mt-4 relative">
          {(!data || data.length === 0) && (
              <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-500 bg-slate-900/50 z-10 text-center px-4">
                  API Limit Reached - Please wait 60 seconds.
              </div>
          )}
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <XAxis 
                dataKey="date" 
                tickFormatter={(str) => str.split("-")[0]} // Show Year only
                interval="preserveStartEnd"
                minTickGap={30}
                tick={{ fontSize: 10, fill: "#888888" }}
                axisLine={{ stroke: '#888888', strokeWidth: 1, opacity: 0.2 }}
                tickLine={{ stroke: '#888888', opacity: 0.2 }}
              />
              <YAxis 
                domain={['auto', 'auto']}
                width={30}
                tick={{ fontSize: 10, fill: "#888888" }}
                axisLine={{ stroke: '#888888', strokeWidth: 1, opacity: 0.2 }}
                tickLine={{ stroke: '#888888', opacity: 0.2 }}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke={color || "#8884d8"}
                strokeWidth={2}
                dot={false}
              />
              <Tooltip
                contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155" }}
                itemStyle={{ color: "#e2e8f0" }}
                labelStyle={{ color: "#94a3b8", marginBottom: "0.25rem" }}
                formatter={(val: any) => [Number(val).toFixed(2), title]}
                labelFormatter={(label) => label}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
