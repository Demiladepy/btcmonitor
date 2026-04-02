import { ChainId } from "starkzap";

export type BtcHealthNetwork = "sepolia" | "mainnet";

export const BTC_HEALTH_NETWORK_STORAGE_KEY = "btc-health-network";

/** Browser wallet id (existing app key; keep stable for stored users). */
export const BTC_MONITOR_WALLET_ID_KEY = "btcmonitor_wallet_id";

export const BTC_MONITOR_WALLET_ADDRESS_KEY = "btcmonitor_wallet_address";

export const BTC_HEALTH_NETWORK_HEADER = "x-btc-health-network";

/** Dev → Sepolia; production build → Mainnet (override with localStorage on the client). */
export function defaultBtcHealthNetwork(): BtcHealthNetwork {
  return process.env.NODE_ENV === "production" ? "mainnet" : "sepolia";
}

/** Client: effective network from localStorage override or build default. */
export function getEffectiveBtcHealthNetwork(): BtcHealthNetwork {
  if (typeof window === "undefined") return defaultBtcHealthNetwork();
  try {
    const raw = window.localStorage.getItem(BTC_HEALTH_NETWORK_STORAGE_KEY);
    if (raw === "mainnet" || raw === "sepolia") return raw;
  } catch {
    /* ignore */
  }
  return defaultBtcHealthNetwork();
}

export function networkToChainId(network: BtcHealthNetwork): ChainId {
  return network === "mainnet" ? ChainId.MAINNET : ChainId.SEPOLIA;
}

export function starkZapNetworkName(network: BtcHealthNetwork): "mainnet" | "sepolia" {
  return network === "mainnet" ? "mainnet" : "sepolia";
}

/** Worker / server: env MONITOR_STARKNET_NETWORK=mainnet|sepolia overrides NODE_ENV default. */
export function getMonitorWorkerNetwork(): BtcHealthNetwork {
  const raw = process.env.MONITOR_STARKNET_NETWORK?.trim().toLowerCase();
  if (raw === "mainnet" || raw === "sepolia") return raw;
  return defaultBtcHealthNetwork();
}
