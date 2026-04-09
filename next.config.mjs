import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const peerStub = path.join(__dirname, "stubs", "starkzap-peer-stub.js");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Prevent browser-only packages from being bundled on the server
  serverExternalPackages: ["starknetkit"],

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
