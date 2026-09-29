"use client";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "./ui";
import { useWallet } from "./mst/wallet-provider";
import { createCreatorCoin } from "@/lib/mst/contracts";
import { toMstError } from "@/lib/mst/errors";
import { recordCoinMintAction } from "@/app/actions/coins";
import { useApp } from "@/lib/store";
import { TransactionStatus } from "./mst/tx-status";
import { NetworkSwitchButton } from "./mst/wallet-ui";
import type { TxStage } from "@/lib/mst/types";

/**
 * Owner-only on-chain mint. Signs CreatorFactory.createCreatorCoin via BridgeKey,
 * then records mint_status='minted' with the tx hash + token address.
 */
export function MintButton({
  coinId,
  name,
  symbol,
  owner,
  onMinted,
}: {
  coinId: string;
  name: string;
  symbol: string;
  owner: string;
  onMinted?: () => void;
}) {
  const { isConnected, isCorrectNetwork, connect, address, chainId, addTx } = useWallet();
  const tradeTick = useApp((s) => s.tradeTick);
  const setTradeTick = useApp((s) => s.setTradeTick);
  const [stage, setStage] = useState<TxStage>("idle");
  const [hash, setHash] = useState("");
  const [error, setError] = useState<string | null>(null);
  const isOwner = isConnected && !!address && address.toLowerCase() === owner.toLowerCase();

  if (!isOwner) return null;

  const mint = async () => {
    setError(null);
    setHash("");
    setStage("preparing");
    try {
      await recordCoinMintAction({ coinId, status: "minting" });
      const { hash: txHash, coin: tokenAddress } = await createCreatorCoin({
        name,
        symbol,
        owner: address!,
        seedMst: "1",
        onStage: setStage,
      });
      setHash(txHash);
      addTx({ hash: txHash, from: address, label: `Mint ${symbol}`, time: Date.now(), chainId: chainId ?? 0 });
      await recordCoinMintAction({ coinId, status: "minted", txHash, tokenAddress });
      setTradeTick(tradeTick + 1);
      onMinted?.();
    } catch (e) {
      const message = toMstError(e).message;
      setError(message);
      setStage("failed");
      void recordCoinMintAction({ coinId, status: "failed", error: message });
    }
  };

  const close = () => { setStage("idle"); setHash(""); setError(null); };

  return (
    <div className="w-full">
      {!isConnected && <Button onClick={() => void connect()} className="w-full">Connect BridgeKey to mint</Button>}
      {isConnected && !isCorrectNetwork && <NetworkSwitchButton />}
      {isConnected && isCorrectNetwork && (
        <Button onClick={() => void mint()} disabled={stage !== "idle"} className="w-full">
          {stage !== "idle" ? <><Loader2 size={15} className="animate-spin" />Minting…</> : "Mint on MST via BridgeKey"}
        </Button>
      )}
      {error && stage === "idle" && <p className="text-red-400 text-xs mt-2">{error}</p>}
      {stage !== "idle" && (
        <TransactionStatus stage={stage} hash={hash} error={error} onClose={close} title={`Mint ${symbol}`} />
      )}
    </div>
  );
}
