"use client";

import { PrivyProvider } from "@privy-io/react-auth";

/**
 * PrivyProvider wrapper — must be a client component because Privy uses
 * browser APIs. The appId is the same Privy App ID used server-side; expose
 * it via NEXT_PUBLIC_PRIVY_APP_ID in your environment.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? ""}
      config={{
        loginMethods: ["email"],
        appearance: {
          theme: "light",
          accentColor: "#f59e0b", // amber-500
          logo: undefined,
        },
        // We use Privy server wallets for signing, not browser embedded wallets
        embeddedWallets: {
          ethereum: { createOnLogin: "off" },
          solana: { createOnLogin: "off" },
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
