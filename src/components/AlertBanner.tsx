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
        Your position health is at{" "}
        <strong>{ratioStr}</strong> — approaching liquidation at 1.0x
      </span>
      <div className="alert-actions">
        <button className="btn-ghost alert-btn" onClick={onDismiss}>
          Dismiss
        </button>
        <button className="btn-danger alert-btn" onClick={onRepay}>
          Repay now →
        </button>
      </div>
    </div>
  );
}
