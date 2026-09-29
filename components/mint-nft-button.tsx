"use client";
import { useState } from "react";
import { ImageIcon, Loader2 } from "lucide-react";
import { Button } from "./ui";
import { useWallet } from "./mst/wallet-provider";
import { hasPostNftMinter, mintPostNftOnly } from "@/lib/mst/contracts";
import { toMstError } from "@/lib/mst/errors";
import { recordPostNftMintAction } from "@/app/actions/post-coins";
import { useApp } from "@/lib/store";
import { TransactionStatus } from "./mst/tx-status";
import { NetworkSwitchButton } from "./mst/wallet-ui";
import type { PostCoinInfo } from "@/lib/db/types";
import type { TxStage } from "@/lib/mst/types";

/** Owner-only: mint the ERC-721 collectible for a post that already has the tradable token. */
export function MintNftButton({
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

  if (!hasPostNftMinter() || !isOwner || postCoin.mintStatus !== "minted" || postCoin.nftTokenId) return null;

  const mint = async () => {
    setError(null);
    setHash("");
    setStage("preparing");
    try {
      const { hash: txHash, nftTokenId } = await mintPostNftOnly({
        postId,
        owner: address!,
        onStage: setStage,
      });
      setHash(txHash);
      addTx({ hash: txHash, from: address, label: `Mint NFT #${nftTokenId}`, time: Date.now(), chainId: chainId ?? 0 });
      await recordPostNftMintAction({ coinId: postCoin.id, txHash, tokenId: nftTokenId });
      setTradeTick(tradeTick + 1);
      onMinted?.();
    } catch (e) {
      const message = toMstError(e).message;
      setError(message);
      setStage("failed");
    }
  };

  const close = () => { setStage("idle"); setHash(""); setError(null); };

  return (
    <div className="w-full mt-2">
      {!isConnected && <Button onClick={() => void connect()} className="w-full">Connect BridgeKey to mint NFT</Button>}
      {isConnected && !isCorrectNetwork && <NetworkSwitchButton />}
      {isConnected && isCorrectNetwork && (
        <Button variant="outline" onClick={() => void mint()} disabled={stage !== "idle"} className="w-full">
          {stage !== "idle"
            ? <><Loader2 size={15} className="animate-spin" />Minting NFT…</>
            : <><ImageIcon size={15} />Mint collectible NFT (wallet gallery)</>}
        </Button>
      )}
      {error && stage === "idle" && <p className="text-red-400 text-xs mt-2">{error}</p>}
      {stage !== "idle" && (
        <TransactionStatus stage={stage} hash={hash} error={error} onClose={close} title="Mint post NFT" />
      )}
    </div>
  );
}
