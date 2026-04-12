import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const peerStub = path.join(__dirname, "stubs", "starkzap-peer-stub.js");

/** Prefer NEXT_PUBLIC_*; fall back to AVNU_API_KEY so one key works in the browser bundle. */
const avnuPaymasterKeyForClient =
  process.env.NEXT_PUBLIC_AVNU_PAYMASTER_API_KEY?.trim() ||
  process.env.NEXT_PUBLIC_PAYMASTER_API_KEY?.trim() ||
  process.env.AVNU_API_KEY?.trim() ||
  "";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Next.js 14 — use experimental key (serverExternalPackages is Next 15+)
  experimental: {
    serverComponentsExternalPackages: ["starknetkit"],
  },

  env: {
    NEXT_PUBLIC_AVNU_PAYMASTER_API_KEY: avnuPaymasterKeyForClient,
  },

  webpack: (config, { isServer }) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      // Unused optional peers of starkzap — stub on both sides
      "@hyperlane-xyz/sdk": peerStub,
      "@hyperlane-xyz/registry": peerStub,
      "@hyperlane-xyz/utils": peerStub,
      "@fatsolutions/tongo-sdk": peerStub,
      // Unused optional peer of @privy-io/react-auth — stub on both sides
      "@farcaster/mini-app-solana": peerStub,

      // @cartridge/controller is a real browser package (installed).
      // Only stub it on the SERVER to prevent SSR crashes.
      // On the CLIENT, the real package is used so Cartridge login works.
      ...(isServer ? { "@cartridge/controller": peerStub } : {}),
    };

    // Prevent starknetkit from being analysed during SSR
    if (isServer) {
      config.resolve.alias["starknetkit"] = peerStub;
    }

    return config;
  },
};

export default nextConfig;
