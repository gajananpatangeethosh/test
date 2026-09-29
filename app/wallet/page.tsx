"use client";
import { AppShell } from "@/components/shell";
import { Button } from "@/components/ui";
import { ActivityTimeline } from "@/components/wallet";
import { useWallet, shortAddress } from "@/components/mst/wallet-provider";
import { ExplorerLink, NetworkIndicator, NetworkSwitchButton } from "@/components/mst/wallet-ui";

export default function WalletPage() {
  const { address, isConnected, connect, isConnecting, isCorrectNetwork, walletLabel } = useWallet();

  if (!isConnected) {
    return <AppShell>
      <div className="py-20 text-center px-6">
        <h1 className="text-2xl font-bold">Connect your wallet</h1>
        <p className="muted text-sm mt-2">Non-custodial sign-in via BridgeKey. No seed phrase ever touches Echo.</p>
        <Button disabled={isConnecting} onClick={() => void connect()} className="mt-6">
          {isConnecting ? "Connecting…" : "Connect BridgeKey"}
        </Button>
      </div>
    </AppShell>;
  }

  return <AppShell>
    <div className="py-4 px-3 sm:px-0 space-y-3">
      <div className="flex items-center gap-2 text-sm px-1">
        <span className="h-2 w-2 rounded-full bg-emerald-400" />
        <span className="font-mono">{shortAddress(address)}</span>
        <span className="muted text-xs">{walletLabel}</span>
      </div>
      <div className="px-1"><NetworkIndicator /></div>
      {!isCorrectNetwork && <div className="px-1"><NetworkSwitchButton /></div>}
      <ActivityTimeline />
      {address && (
        <div className="px-1">
          <ExplorerLink address={address} label="View address on MST Explorer ↗" />
        </div>
      )}
    </div>
  </AppShell>;
}
