import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import type { HealthEntry } from "../hooks/useHealthHistory";

interface Props {
  history: HealthEntry[];
  alertThreshold: number;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function HealthHistoryChart({ history, alertThreshold }: Props) {
  if (history.length < 2) {
    return (
      <div className="card chart-card">
        <h3 className="card-title">24h Health History</h3>
        <p className="muted center">Collecting data… check back after the first refresh.</p>
      </div>
    );
  }

  const data = history.map((e) => ({
    time: formatTime(e.timestamp),
    ratio: parseFloat(e.healthRatio.toFixed(3)),
  }));

  return (
    <div className="card chart-card">
      <h3 className="card-title">24h Health History</h3>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" />
          <XAxis
            dataKey="time"
            tick={{ fill: "#888", fontSize: 11 }}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[1.0, 3.0]}
            tick={{ fill: "#888", fontSize: 11 }}
            width={36}
          />
          <Tooltip
            contentStyle={{ background: "#1a1a2e", border: "1px solid #333", borderRadius: 8 }}
            labelStyle={{ color: "#888" }}
            itemStyle={{ color: "#fff" }}
            formatter={(v) => [`${Number(v).toFixed(3)}x`, "Health"]}
          />
          <ReferenceLine y={1.0} stroke="#E24B4A" strokeDasharray="4 4" label={{ value: "Liquidation", fill: "#E24B4A", fontSize: 11 }} />
          <ReferenceLine y={alertThreshold} stroke="#EF9F27" strokeDasharray="4 4" label={{ value: "Alert", fill: "#EF9F27", fontSize: 11 }} />
          <Line
            type="monotone"
            dataKey="ratio"
            stroke="#1D9E75"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: "#1D9E75" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
