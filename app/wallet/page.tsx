"use client";
import { AppShell } from "@/components/shell";
import { Card, Button, Avatar } from "@/components/ui";
import { CoinChart } from "@/components/chart";
import { holdings, coinById } from "@/lib/data";
import { mockMarketCoinById } from "@/lib/markets";
import { useApp } from "@/lib/store";
import { useWallet, shortAddress } from "@/components/mst/wallet-provider";
import { BalanceDisplay, ExplorerLink, NetworkIndicator, NetworkSwitchButton, RefreshBalanceButton } from "@/components/mst/wallet-ui";
import { fmtMst, fmtNum } from "@/lib/utils";
import { Send, Download, Plus, Minus } from "lucide-react";
export default function WalletPage() {
  const { openTrade } = useApp();
  const { address, isConnected, connect, isConnecting, isCorrectNetwork, txs, walletLabel } = useWallet();
  const rows = holdings.map((h) => ({ ...h, coin: coinById(h.coinId) }));
  if (!isConnected) return <AppShell><div className="py-20 text-center px-6">
    <h1 className="text-2xl font-bold">Connect your wallet</h1>
    <p className="muted text-sm mt-2">Non-custodial sign-in via BridgeKey. No seed phrase ever touches Echo.</p>
    <Button disabled={isConnecting} onClick={() => void connect()} className="mt-6">{isConnecting ? "Connecting…" : "Connect BridgeKey"}</Button></div></AppShell>;
  return <AppShell>
    <div className="py-4 px-3 sm:px-0 space-y-3">
      <Card className="p-5">
        <div className="flex items-center gap-2 text-sm">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          <span className="font-mono">{shortAddress(address)}</span>
          <span className="muted text-xs">{walletLabel}</span>
          <span className="ml-auto"><RefreshBalanceButton /></span>
        </div>
        <div className="mt-2"><NetworkIndicator /></div>
        {!isCorrectNetwork && <div className="mt-3"><NetworkSwitchButton /></div>}
        <div className="muted text-sm mt-4">Native balance</div>
        <div className="text-3xl font-bold"><BalanceDisplay /></div>
        <div className="mt-3"><CoinChart spark={coinById("gajanan").spark} height={130} /></div>
        <div className="grid grid-cols-4 gap-2 mt-4">
          {[["Buy", Plus], ["Sell", Minus], ["Send", Send], ["Receive", Download]].map(([label, Icon]) => {
            const I = Icon as typeof Plus;
            return <button key={label as string} onClick={() => { const target = mockMarketCoinById("gajanan"); if (target) openTrade(target, label === "Sell" ? "sell" : "buy"); }}
              className="flex flex-col items-center gap-1.5 rounded-xl border border-white/10 py-3 text-xs hover:border-white/25"><I size={16} />{label as string}</button>;
          })}
        </div>
      </Card>
      <div className="grid grid-cols-3 gap-2">
        {[["Network", isCorrectNetwork ? "MST ✓" : "Wrong"], ["Session txs", `${txs.length}`], ["Watchlist", `${rows.length}`]].map(([k, v]) => (
          <Card key={k} className="p-4"><div className="muted text-xs">{k}</div><div className="font-bold text-lg">{v}</div></Card>))}
      </div>
      <Card className="p-5">
        <div className="font-semibold mb-1">Market watchlist</div>
        <p className="muted text-xs mb-2">Off-chain preview — on-chain token balances unlock with deployed coin contracts.</p>
        {rows.map((r) => { const up = r.coin.price >= r.avgBuy; return (
          <button key={r.coinId} onClick={() => { const target = mockMarketCoinById(r.coinId); if (target) openTrade(target, "sell"); }} className="w-full flex items-center gap-3 py-3 border-b border-white/[.05] last:border-0 hover:bg-white/[.02] rounded-lg px-1">
            <Avatar name={r.coin.name} size={38} />
            <div className="text-left"><div className="font-medium text-sm">{r.coin.symbol}</div><div className="muted text-xs">{fmtMst(r.coin.price)} MST</div></div>
            <div className="ml-auto text-right"><div className={`text-xs ${up ? "tick-up" : "tick-down"}`}>{up ? "+" : ""}{(((r.coin.price - r.avgBuy) / r.avgBuy) * 100).toFixed(1)}% 24h</div></div>
          </button>);})}
      </Card>
      <Card className="p-5">
        <div className="font-semibold mb-2">Session transactions</div>
        {txs.length === 0 && <p className="muted text-sm">No transactions yet in this session.</p>}
        {txs.map((t) => <div key={t.hash} className="py-2.5 border-b border-white/[.05] last:border-0 text-sm">
          <div className="flex items-center gap-2"><span>{t.label}</span>
            <span className="muted text-xs ml-auto">{new Date(t.time).toLocaleTimeString()}</span></div>
          <div className="muted text-xs font-mono break-all">{t.hash}</div>
          <ExplorerLink hash={t.hash} /></div>)}
        {address && <div className="mt-3"><ExplorerLink address={address} label="View address on MST Explorer ↗" /></div>}
      </Card>
    </div>
  </AppShell>;
}
