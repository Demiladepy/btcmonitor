import { useState } from "react";
import type { AlertChannel, AlertType } from "../lib/notificationTypes";
import { ALERT_LABELS } from "../lib/notificationTypes";
import type { useNotifications } from "../hooks/useNotifications";

type NotifHook = ReturnType<typeof useNotifications>;

interface Props {
  hook: NotifHook;
}

const ALL_TYPES: AlertType[] = ["liquidation_risk", "health_recovered", "yield_earned"];

const TELEGRAM_HELP =
  "1. Open Telegram and search for @BotFather\n2. Send /newbot and follow prompts\n3. Copy the bot token into .env as TELEGRAM_BOT_TOKEN\n4. Start a chat with your bot, then find your chat ID via @userinfobot";

export function NotificationSetup({ hook }: Props) {
  const { prefs, updatePrefs, isConfigured } = hook;
  const [open, setOpen] = useState(false);
  const [telegramInput, setTelegramInput] = useState(prefs.telegramChatId ?? "");
  const [emailInput, setEmailInput] = useState(prefs.emailAddress ?? "");
  const [showHelp, setShowHelp] = useState(false);

  function saveChannel() {
    updatePrefs({
      telegramChatId: telegramInput.trim() || null,
      emailAddress: emailInput.trim() || null,
      linkedAt: Date.now(),
    });
  }

  function toggleType(type: AlertType) {
    const next = prefs.alertTypes.includes(type)
      ? prefs.alertTypes.filter((t) => t !== type)
      : [...prefs.alertTypes, type];
    updatePrefs({ alertTypes: next });
  }

  return (
    <div className="card" style={{ marginTop: 0 }}>
      {/* Header row */}
      <div
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
        onClick={() => setOpen((o) => !o)}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>🔔</span>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>DM Alerts</div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>
              {isConfigured
                ? `Active via ${prefs.channel === "both" ? "Telegram + Email" : prefs.channel}`
                : "Not configured"}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {isConfigured && (
            <span className="pill pill-green" style={{ fontSize: 11, padding: "2px 8px" }}>Active</span>
          )}
          <span style={{ color: "var(--muted)", fontSize: 12 }}>{open ? "▲" : "▼"}</span>
        </div>
      </div>

      {open && (
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Channel selector */}
          <div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Delivery Channel
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {(["telegram", "email", "both"] as AlertChannel[]).map((ch) => (
                <button
                  key={ch}
                  onClick={() => updatePrefs({ channel: ch })}
                  style={{
                    flex: 1,
                    padding: "8px 0",
                    borderRadius: 8,
                    border: `1px solid ${prefs.channel === ch ? "var(--accent)" : "var(--border)"}`,
                    background: prefs.channel === ch ? "rgba(247,147,26,0.12)" : "var(--surface)",
                    color: prefs.channel === ch ? "var(--accent)" : "var(--muted)",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: prefs.channel === ch ? 600 : 400,
                    transition: "all 0.15s",
                    textTransform: "capitalize",
                  }}
                >
                  {ch === "both" ? "Both" : ch === "telegram" ? "Telegram" : "Email"}
                </button>
              ))}
            </div>
          </div>

          {/* Telegram setup */}
          {(prefs.channel === "telegram" || prefs.channel === "both") && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Telegram Chat ID
                </div>
                <button
                  onClick={() => setShowHelp((h) => !h)}
                  style={{ fontSize: 11, color: "var(--accent)", background: "none", border: "none", cursor: "pointer" }}
                >
                  How to get?
                </button>
              </div>
              {showHelp && (
                <div style={{
                  background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8,
                  padding: "12px 14px", marginBottom: 10, fontSize: 12, color: "var(--muted)",
                  whiteSpace: "pre-line", lineHeight: 1.8,
                }}>
                  {TELEGRAM_HELP}
                </div>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  className="input"
                  type="text"
                  placeholder="e.g. 123456789"
                  value={telegramInput}
                  onChange={(e) => setTelegramInput(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button className="btn-secondary" onClick={saveChannel}>Save</button>
              </div>
              {prefs.telegramChatId && (
                <div style={{ fontSize: 12, color: "var(--green)", marginTop: 6 }}>
                  ✓ Chat ID saved: {prefs.telegramChatId}
                </div>
              )}
            </div>
          )}

          {/* Email setup */}
          {(prefs.channel === "email" || prefs.channel === "both") && (
            <div>
              <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                Email Address
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  className="input"
                  type="email"
                  placeholder="you@example.com"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button className="btn-secondary" onClick={saveChannel}>Save</button>
              </div>
              {prefs.emailAddress && (
                <div style={{ fontSize: 12, color: "var(--green)", marginTop: 6 }}>
                  ✓ Email saved: {prefs.emailAddress}
                </div>
              )}
            </div>
          )}

          {/* Alert type toggles */}
          <div>
            <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
              Alert Types
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {ALL_TYPES.map((type) => (
                <label
                  key={type}
                  style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}
                >
                  <div
                    onClick={() => toggleType(type)}
                    style={{
                      width: 36, height: 20, borderRadius: 10,
                      background: prefs.alertTypes.includes(type) ? "var(--accent)" : "var(--border)",
                      position: "relative", cursor: "pointer", transition: "background 0.2s", flexShrink: 0,
                    }}
                  >
                    <div style={{
                      position: "absolute", top: 2, left: prefs.alertTypes.includes(type) ? 18 : 2,
                      width: 16, height: 16, borderRadius: "50%", background: "#fff",
                      transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
                    }} />
                  </div>
                  <span style={{ fontSize: 13 }}>{ALERT_LABELS[type]}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Clear button */}
          {isConfigured && (
            <button
              className="btn-secondary"
              onClick={() => {
                setTelegramInput("");
                setEmailInput("");
                updatePrefs({ telegramChatId: null, emailAddress: null, linkedAt: null });
              }}
              style={{ color: "var(--red)", borderColor: "var(--red)", fontSize: 13 }}
            >
              Remove Alert Setup
            </button>
          )}
        </div>
      )}
    </div>
  );
}
