import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ReferenceLine, ResponsiveContainer, CartesianGrid,
} from "recharts";
import type { HealthEntry } from "../hooks/useHealthHistory";

interface Props {
  history: HealthEntry[];
  alertThreshold: number;
}

function fmt(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function HealthHistoryChart({ history, alertThreshold }: Props) {
  if (history.length < 2) {
    return (
      <div className="card chart-card">
        <div className="card-title">Health History</div>
        <div style={{ textAlign: "center", padding: "32px 0", color: "var(--muted)", fontSize: 13 }}>
          Collecting data — updates every 15 seconds
        </div>
      </div>
    );
  }

  // Keep last 12h only
  const cutoff = Date.now() - 12 * 60 * 60 * 1000;
  const data = history
    .filter((e) => e.timestamp >= cutoff)
    .map((e) => ({
      time: fmt(e.timestamp),
      ts: e.timestamp,
      ratio: parseFloat(Math.min(e.healthRatio, 5).toFixed(3)),
    }));

  const minRatio = Math.max(0.8, Math.min(...data.map((d) => d.ratio)) - 0.1);
  const maxRatio = Math.min(5, Math.max(...data.map((d) => d.ratio)) + 0.3);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const v = payload[0].value as number;
    const color = v > 1.5 ? "var(--green)" : v >= 1.2 ? "var(--amber)" : "var(--red)";
    return (
      <div style={{
        background: "var(--surface2)", border: "1px solid var(--border)",
        borderRadius: 8, padding: "8px 12px", fontSize: 12,
      }}>
        <div style={{ color: "var(--muted)", marginBottom: 4 }}>{label}</div>
        <div style={{ color, fontWeight: 700, fontSize: 15 }}>
          {isFinite(v) ? v.toFixed(3) + "x" : "∞"}
        </div>
      </div>
    );
  };

  return (
    <div className="card chart-card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div className="card-title" style={{ marginBottom: 0 }}>Health History</div>
        <span style={{ fontSize: 11, color: "var(--muted)" }}>Last 12h · {data.length} points</span>
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={data} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
          <defs>
            <linearGradient id="healthGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#00d68f" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#00d68f" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" vertical={false} />
          <XAxis
            dataKey="time"
            tick={{ fill: "#5a5a80", fontSize: 10 }}
            axisLine={false} tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[minRatio, maxRatio]}
            tick={{ fill: "#5a5a80", fontSize: 10 }}
            axisLine={false} tickLine={false}
            width={32}
            tickFormatter={(v) => v.toFixed(1)}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine
            y={1.0} stroke="#ff4560" strokeDasharray="4 3" strokeWidth={1.5}
            label={{ value: "Liq.", fill: "#ff4560", fontSize: 10, position: "right" }}
          />
          <ReferenceLine
            y={alertThreshold} stroke="#ffb800" strokeDasharray="4 3" strokeWidth={1}
            label={{ value: "Alert", fill: "#ffb800", fontSize: 10, position: "right" }}
          />
          <Area
            type="monotone" dataKey="ratio"
            stroke="#00d68f" strokeWidth={2}
            fill="url(#healthGrad)"
            dot={false}
            activeDot={{ r: 4, fill: "#00d68f", strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
