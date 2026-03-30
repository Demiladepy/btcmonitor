import { useMemo } from "react";

interface Props {
  healthRatio: number;
  projectedRatio?: number;
  size?: number;
}

const START = 225;
const SWEEP = 270;

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: +(cx + r * Math.cos(rad)).toFixed(3), y: +(cy + r * Math.sin(rad)).toFixed(3) };
}

function arc(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  if (Math.abs(endDeg - startDeg) < 0.01) return "";
  const s = polar(cx, cy, r, startDeg);
  const e = polar(cx, cy, r, endDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
}

function ratioFill(r: number, max = 3): number {
  if (!isFinite(r) || r <= 0) return 1;
  return Math.min(r / max, 1);
}

function ratioColor(r: number): string {
  if (!isFinite(r) || r > 1.5) return "#00d68f";
  if (r >= 1.2) return "#ffb800";
  return "#ff4560";
}

export function HealthGauge({ healthRatio, projectedRatio, size = 200 }: Props) {
  const cx = size / 2, cy = size / 2;
  const r = size * 0.37;
  const sw = size * 0.072;

  const fill = useMemo(() => ratioFill(healthRatio), [healthRatio]);
  const endDeg = START + SWEEP * fill;
  const color = ratioColor(healthRatio);

  const projFill = projectedRatio !== undefined ? ratioFill(projectedRatio) : null;
  const projEnd = projFill !== null ? START + SWEEP * projFill : null;

  const label = !isFinite(healthRatio) || healthRatio === 0 ? "∞" : healthRatio.toFixed(2) + "x";
  const sublabel = !isFinite(healthRatio) || healthRatio === 0
    ? "No debt"
    : healthRatio > 1.5 ? "Safe"
    : healthRatio >= 1.2 ? "At Risk"
    : "Danger";

  return (
    <svg
      width={size} height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="health-gauge"
      style={{ overflow: "visible" }}
    >
      {/* Glow filter */}
      <defs>
        <filter id="glow">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Track */}
      <path
        d={arc(cx, cy, r, START, START + SWEEP)}
        fill="none" stroke="#ffffff0d" strokeWidth={sw} strokeLinecap="round"
      />

      {/* Projected arc (behind main) */}
      {projEnd !== null && projFill !== null && projFill > 0 && (
        <path
          d={arc(cx, cy, r, START, projEnd)}
          fill="none" stroke="#4488ff" strokeWidth={sw * 0.45}
          strokeLinecap="round" strokeDasharray="5 4" opacity={0.7}
          style={{ transition: "all 0.4s ease" }}
        />
      )}

      {/* Main fill arc */}
      {fill > 0 && (
        <path
          d={arc(cx, cy, r, START, endDeg)}
          fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round"
          filter="url(#glow)"
          style={{ transition: "all 0.4s ease" }}
        />
      )}

      {/* Centre value */}
      <text
        x={cx} y={cy - size * 0.05}
        textAnchor="middle" dominantBaseline="middle"
        fill="white" fontSize={size * 0.155} fontWeight="800"
        fontFamily="system-ui, sans-serif" letterSpacing="-1"
      >
        {label}
      </text>
      <text
        x={cx} y={cy + size * 0.115}
        textAnchor="middle" fill={color}
        fontSize={size * 0.068} fontWeight="600"
        fontFamily="system-ui, sans-serif"
        style={{ transition: "fill 0.4s ease" }}
      >
        {sublabel}
      </text>
      <text
        x={cx} y={cy + size * 0.195}
        textAnchor="middle" fill="#5a5a80"
        fontSize={size * 0.058}
        fontFamily="system-ui, sans-serif"
      >
        health ratio
      </text>
    </svg>
  );
}
