interface Props {
  alertActive: boolean;
  healthRatio: number;
  threshold: number;
  onDismiss: () => void;
  onRepay: () => void;
}

export function AlertBanner({ alertActive, healthRatio, onDismiss, onRepay }: Props) {
  if (!alertActive) return null;
  const ratioStr = isFinite(healthRatio) ? healthRatio.toFixed(2) + "x" : "∞";

  return (
    <div className="alert-banner">
      <span className="alert-icon">⚠️</span>
      <span className="alert-message">
        Position health at <strong>{ratioStr}</strong> — approaching liquidation threshold of 1.0x
      </span>
      <div className="alert-actions">
        <button className="btn-ghost small" onClick={onDismiss}>Dismiss</button>
        <button className="btn-danger" style={{ fontSize: 13, padding: "6px 14px" }} onClick={onRepay}>
          Repay now →
        </button>
      </div>
    </div>
  );
}
