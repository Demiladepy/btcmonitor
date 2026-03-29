import { useState } from "react";

interface Props {
  threshold: number;
  setThreshold: (v: number) => void;
}

export function AlertSettings({ threshold, setThreshold }: Props) {
  const [open, setOpen] = useState(false);
  const [notifPerm, setNotifPerm] = useState(Notification.permission);

  async function requestNotif() {
    const perm = await Notification.requestPermission();
    setNotifPerm(perm);
  }

  return (
    <div className="alert-settings">
      <button className="btn-ghost" onClick={() => setOpen((o) => !o)} title="Alert settings">
        ⚙️
      </button>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 199 }} onClick={() => setOpen(false)} />
          <div className="settings-panel">
            <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>Alert Settings</div>
            <div className="settings-row">
              <span>Alert when health drops below <strong style={{ color: "var(--amber)" }}>{threshold.toFixed(2)}x</strong></span>
              <input
                type="range" min={1.1} max={2.0} step={0.05}
                value={threshold}
                onChange={(e) => setThreshold(parseFloat(e.target.value))}
                className="threshold-slider"
              />
            </div>
            <div className="notif-row">
              <span style={{ flex: 1 }}>Browser notifications</span>
              {notifPerm === "granted" ? (
                <span className="pill pill-green">On</span>
              ) : notifPerm === "denied" ? (
                <span className="pill pill-red">Blocked</span>
              ) : (
                <button className="btn-ghost small" onClick={requestNotif}>Enable</button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
