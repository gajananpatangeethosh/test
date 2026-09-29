"use client";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from "recharts";

export function CoinChart({ spark, height = 220 }: { spark: number[]; height?: number }) {
  const series = spark.length >= 2 ? spark : spark.length === 1 ? [spark[0], spark[0]] : [0.01, 0.01];
  const data = series.map((v, i) => ({ i, v }));
  const up = series[series.length - 1] >= series[0];
  const stroke = up ? "#34d399" : "#f87171";
  const min = Math.min(...series);
  const max = Math.max(...series);
  const pad = max === min ? min * 0.05 || 0.0005 : (max - min) * 0.15;
  return <div style={{ height }}>
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
        <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity={0.35} /><stop offset="100%" stopColor={stroke} stopOpacity={0} />
        </linearGradient></defs>
        <XAxis dataKey="i" hide />
        <YAxis hide domain={[min - pad, max + pad]} />
        <Tooltip contentStyle={{ background: "#14161a", border: "1px solid rgba(255,255,255,.12)", borderRadius: 12, fontSize: 12 }}
          labelFormatter={() => ""} formatter={(v) => [`${Number(v).toFixed(4)} MST`, "Price"]} />
        <Area type="monotone" dataKey="v" stroke={stroke} strokeWidth={2} fill="url(#g)" dot={series.length <= 6} />
      </AreaChart>
    </ResponsiveContainer>
  </div>;
}
export function Sparkline({ spark }: { spark: number[] }) {
  return <CoinChart spark={spark} height={56} />;
}
