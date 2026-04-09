import { ChainId } from "starkzap";

export type BtcHealthNetwork = "sepolia" | "mainnet";

export const BTC_HEALTH_NETWORK_STORAGE_KEY = "btc-health-network";

/** Browser wallet id / wallet address — stable key stored in localStorage. */
export const BTC_MONITOR_WALLET_ID_KEY = "btcmonitor_wallet_id";

export const BTC_MONITOR_WALLET_ADDRESS_KEY = "btcmonitor_wallet_address";

export const BTC_MONITOR_CONNECTION_METHOD_KEY = "btcmonitor_connection_method";

export const BTC_HEALTH_NETWORK_HEADER = "x-btc-health-network";

/** Always mainnet. Sepolia is no longer supported. */
export function defaultBtcHealthNetwork(): BtcHealthNetwork {
  return "mainnet";
}

/** Client: always mainnet. */
export function getEffectiveBtcHealthNetwork(): BtcHealthNetwork {
  return "mainnet";
}

export function networkToChainId(network: BtcHealthNetwork): ChainId {
  return network === "mainnet" ? ChainId.MAINNET : ChainId.SEPOLIA;
}

export function starkZapNetworkName(network: BtcHealthNetwork): "mainnet" | "sepolia" {
  return network === "mainnet" ? "mainnet" : "sepolia";
}

/** Worker / server: always mainnet. */
export function getMonitorWorkerNetwork(): BtcHealthNetwork {
  return "mainnet";
}
