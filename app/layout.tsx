import "./globals.css";
import { Plus_Jakarta_Sans } from "next/font/google";
import { WalletProvider } from "@/lib/wallet-context";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${plusJakarta.className} bg-white text-gray-900`}>
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}
