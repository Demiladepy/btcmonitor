import "./globals.css";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Providers } from "./providers";
import { WalletProvider } from "@/lib/wallet-context";

export const metadata: Metadata = {
  icons: {
    icon: "/favicon.ico",
  },
};

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${plusJakarta.className} bg-white text-gray-900`}>
        {/* PrivyProvider must wrap WalletProvider so usePrivy() works inside it */}
        <Providers>
          <WalletProvider>{children}</WalletProvider>
        </Providers>
      </body>
    </html>
  );
}
