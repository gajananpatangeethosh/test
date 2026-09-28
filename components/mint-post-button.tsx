"use client";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "./ui";
import { useWallet } from "./mst/wallet-provider";
import { createPostCoin } from "@/lib/mst/contracts";
import { toMstError } from "@/lib/mst/errors";
import { recordPostCoinMintAction } from "@/app/actions/post-coins";
import { useApp } from "@/lib/store";
import { TransactionStatus } from "./mst/tx-status";
import { NetworkSwitchButton } from "./mst/wallet-ui";
import type { PostCoinInfo } from "@/lib/db/types";
import type { TxStage } from "@/lib/mst/types";

/** Owner-only: mint the post token on MST Testnet via BridgeKey. */
export function MintPostButton({
  postId,
  postCoin,
  onMinted,
}: {
  postId: string;
  postCoin: PostCoinInfo;
  onMinted?: () => void;
}) {
  const { isConnected, isCorrectNetwork, connect, address, chainId, addTx } = useWallet();
  const tradeTick = useApp((s) => s.tradeTick);
  const setTradeTick = useApp((s) => s.setTradeTick);
  const [stage, setStage] = useState<TxStage>("idle");
  const [hash, setHash] = useState("");
  const [error, setError] = useState<string | null>(null);
  const isOwner = isConnected && !!address && address.toLowerCase() === postCoin.ownerWallet.toLowerCase();

  if (!isOwner || postCoin.mintStatus === "minted") return null;

  const mint = async () => {
    setError(null);
    setHash("");
    setStage("preparing");
    try {
      const { hash: txHash, coin: tokenAddress } = await createPostCoin({
        postId,
        name: postCoin.name,
        symbol: postCoin.symbol,
        owner: address!,
        seedMst: "1",
        onStage: setStage,
      });
      setHash(txHash);
      addTx({ hash: txHash, from: address, label: `Mint ${postCoin.symbol}`, time: Date.now(), chainId: chainId ?? 0 });
      await recordPostCoinMintAction({ coinId: postCoin.id, status: "minted", txHash, tokenAddress });
      setTradeTick(tradeTick + 1);
      onMinted?.();
    } catch (e) {
      const message = toMstError(e).message;
      setError(message);
      setStage("failed");
      void recordPostCoinMintAction({ coinId: postCoin.id, status: "failed", error: message });
    }
  };

  const close = () => { setStage("idle"); setHash(""); setError(null); };

  return (
    <div className="w-full">
      {!isConnected && <Button onClick={() => void connect()} className="w-full">Connect BridgeKey to mint</Button>}
      {isConnected && !isCorrectNetwork && <NetworkSwitchButton />}
      {isConnected && isCorrectNetwork && (
        <Button onClick={() => void mint()} disabled={stage !== "idle"} className="w-full">
          {stage !== "idle" ? <><Loader2 size={15} className="animate-spin" />Minting…</> : "Retry mint on MST Testnet"}
        </Button>
      )}
      {error && stage === "idle" && <p className="text-red-400 text-xs mt-2">{error}</p>}
      {stage !== "idle" && (
        <TransactionStatus stage={stage} hash={hash} error={error} onClose={close} title={`Mint ${postCoin.symbol}`} />
      )}
    </div>
  );
}
