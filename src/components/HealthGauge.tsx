import { useMemo } from "react";

interface Props {
  healthRatio: number;
  projectedRatio?: number;
  size?: number;
}

function ratioColor(ratio: number): string {
  if (!isFinite(ratio) || ratio > 1.5) return "#1D9E75";
  if (ratio >= 1.2) return "#EF9F27";
  return "#E24B4A";
}

function ratioLabel(ratio: number): string {
  if (!isFinite(ratio)) return "No debt";
  if (ratio > 1.5) return "Safe";
  if (ratio >= 1.2) return "At Risk";
  return "Danger";
}

function ratioToArc(ratio: number, maxRatio = 3): number {
  if (!isFinite(ratio)) return 1;
  return Math.min(ratio / maxRatio, 1);
}

// SVG arc: 225° start, 270° sweep (going clockwise)
const START_ANGLE = 225;
const SWEEP = 270;

function polarToCart(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  endDeg: number
) {
  const start = polarToCart(cx, cy, r, startDeg);
  const end = polarToCart(cx, cy, r, endDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

export function HealthGauge({ healthRatio, projectedRatio, size = 200 }: Props) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.38;
  const strokeWidth = size * 0.07;

  const fill = ratioToArc(healthRatio);
  const endAngle = useMemo(
    () => START_ANGLE + SWEEP * fill,
    [fill]
  );

  const projFill = projectedRatio !== undefined ? ratioToArc(projectedRatio) : null;
  const projEndAngle = projFill !== null ? START_ANGLE + SWEEP * projFill : null;

  const color = ratioColor(healthRatio);
  const label = isFinite(healthRatio)
    ? `${healthRatio.toFixed(2)}x`
    : "∞";

  return (
    <div className="health-gauge" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Background arc */}
        <path
          d={arcPath(cx, cy, r, START_ANGLE, START_ANGLE + SWEEP)}
          fill="none"
          stroke="#2a2a3a"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* Foreground arc */}
        {fill > 0 && (
          <path
            d={arcPath(cx, cy, r, START_ANGLE, endAngle)}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            style={{ transition: "all 0.4s ease" }}
          />
        )}
        {/* Projected arc */}
        {projEndAngle !== null && projFill !== null && projFill > 0 && (
          <path
            d={arcPath(cx, cy, r, START_ANGLE, projEndAngle)}
            fill="none"
            stroke="#4488ff"
            strokeWidth={strokeWidth * 0.5}
            strokeLinecap="round"
            strokeDasharray="4 4"
            opacity={0.8}
          />
        )}
        {/* Centre text */}
        <text
          x={cx}
          y={cy - 6}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="white"
          fontSize={size * 0.15}
          fontWeight="700"
          fontFamily="system-ui, sans-serif"
        >
          {label}
        </text>
        <text
          x={cx}
          y={cy + size * 0.1}
          textAnchor="middle"
          fill="#888"
          fontSize={size * 0.065}
          fontFamily="system-ui, sans-serif"
        >
          Health ratio
        </text>
        <text
          x={cx}
          y={cy + size * 0.19}
          textAnchor="middle"
          fill={color}
          fontSize={size * 0.065}
          fontFamily="system-ui, sans-serif"
          fontWeight="600"
        >
          {ratioLabel(healthRatio)}
        </text>
      </svg>
    </div>
  );
}
