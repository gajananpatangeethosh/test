import type { Metadata } from "next";
import "./globals.css";
import { TradeModal, CollectModal } from "@/components/modals";
import { MstWalletProvider } from "@/components/mst/wallet-provider";
import { WalletGate } from "@/components/mst/wallet-gate";
import { TxErrorToast } from "@/components/mst/wallet-ui";
import { APP_NAME, APP_DESCRIPTION, APP_TAGLINE } from "@/lib/brand";
export const metadata: Metadata = { title: `${APP_NAME} — ${APP_TAGLINE}`, description: APP_DESCRIPTION };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" className="dark"><body className="min-h-screen">
    <MstWalletProvider><WalletGate>{children}</WalletGate><TradeModal /><CollectModal /><TxErrorToast /></MstWalletProvider>
  </body></html>;
}
