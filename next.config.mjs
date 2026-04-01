import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const peerStub = path.join(__dirname, "stubs", "starkzap-peer-stub.js");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@hyperlane-xyz/sdk": peerStub,
      "@hyperlane-xyz/registry": peerStub,
      "@hyperlane-xyz/utils": peerStub,
      "@fatsolutions/tongo-sdk": peerStub,
      "@cartridge/controller": peerStub,
    };
    return config;
  },
};

export default nextConfig;
