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
}

export function MetricCard({ title, value, trend, data, color }: MetricCardProps) {
  const trendColor =
    trend === "up"
      ? "text-green-500"
      : trend === "down"
      ? "text-red-500"
      : "text-slate-400";

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-slate-400">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className={cn("text-2xl font-bold", trendColor)}>{value}</div>
        <div className="h-[120px] mt-4">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <XAxis 
                dataKey="date" 
                tickFormatter={(str) => str.split("-")[0]} // Show Year only
                interval="preserveStartEnd"
                minTickGap={30}
                tick={{ fontSize: 10, fill: "#64748b" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis 
                domain={['auto', 'auto']}
                hide={true} // Keep Y axis hidden for sparkline look, or show it? Prompt says "visible... YAxis domain auto auto". 
                // But usually sparklines don't have axes. Let's make it visible but subtle.
                // Wait, "Add visible XAxis... and YAxis".
              />
               {/* Actually re-reading: "Set the X-Axis to only show years... Add a Tooltip...". 
                   So it seems they want a real chart now, not just a sparkline. 
                   I will make YAxis visible but minimal. 
               */}
              <YAxis 
                domain={['auto', 'auto']}
                width={30}
                tick={{ fontSize: 10, fill: "#64748b" }}
                axisLine={false}
                tickLine={false}
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
