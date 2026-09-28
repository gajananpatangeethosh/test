import type { Metadata } from "next";
import "./globals.css";
import { TradeModal, CollectModal } from "@/components/modals";
import { MstWalletProvider } from "@/components/mst/wallet-provider";
import { WalletGate } from "@/components/mst/wallet-gate";
import { TxErrorToast } from "@/components/mst/wallet-ui";
export const metadata: Metadata = { title: "MSTORA — Create, Collect, Trade", description: "Social + creator coins on MST Blockchain" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" className="dark"><body className="min-h-screen">
    <MstWalletProvider><WalletGate>{children}</WalletGate><TradeModal /><CollectModal /><TxErrorToast /></MstWalletProvider>
  </body></html>;
}
