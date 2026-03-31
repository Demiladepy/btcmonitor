export type AlertChannel = "telegram" | "email" | "both";

export type AlertType = "liquidation_risk" | "health_recovered" | "yield_earned";

export interface AlertEvent {
  type: AlertType;
  healthRatio?: number;
  threshold?: number;
  message?: string;
}

export interface NotificationPrefs {
  channel: AlertChannel;
  telegramChatId: string | null;
  emailAddress: string | null;
  alertTypes: AlertType[];
  linkedAt: number | null;
}

export const DEFAULT_PREFS: NotificationPrefs = {
  channel: "telegram",
  telegramChatId: null,
  emailAddress: null,
  alertTypes: ["liquidation_risk", "health_recovered"],
  linkedAt: null,
};

export const ALERT_LABELS: Record<AlertType, string> = {
  liquidation_risk: "Liquidation Risk",
  health_recovered: "Health Recovered",
  yield_earned: "Yield Earned",
};
