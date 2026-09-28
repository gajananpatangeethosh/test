// Transaction lifecycle against MST via the injected wallet.
// Signing happens inside BridgeKey (ethers BrowserProvider wraps the EIP-1193
// provider). Confirmation is awaited through the official SDK provider.
// Stages: idle → preparing → awaiting-approval → broadcasting → confirming → confirmed/failed.
import { BrowserProvider } from "ethers";
import { getInjectedProvider, isOnMstNetwork } from "./wallet";
import { waitForMstTransaction } from "./client";
import { ACTIVE_NETWORK } from "./config";
import { MstError, toMstError } from "./errors";
import type { MstTxRequest, TxStage } from "./types";
export async function sendTransaction(
  req: MstTxRequest,
  opts: { label?: string; onStage?: (s: TxStage) => void } = {},
): Promise<string> {
  const onStage = opts.onStage ?? (() => undefined);
  try {
    onStage("preparing");
    const injected = getInjectedProvider();
    if (!injected) throw new MstError("NO_WALLET", "BridgeKey wallet was not detected.");
    const browser = new BrowserProvider(injected as never);
    const signer = await browser.getSigner();
    const net = await browser.getNetwork();
    if (Number(net.chainId) !== ACTIVE_NETWORK.chainId || !isOnMstNetwork(Number(net.chainId)))
      throw new MstError("WRONG_NETWORK", "Please connect to MST Blockchain.");
    onStage("awaiting-approval");
    const tx = await signer.sendTransaction({
      to: req.to, ...(req.value ? { value: req.value } : {}),
      ...(req.data ? { data: req.data } : {}), ...(req.gasLimit ? { gasLimit: req.gasLimit } : {}),
    });
    onStage("broadcasting");
    onStage("confirming");
    const receipt = await waitForMstTransaction(tx.hash);
    if (receipt && (receipt as { status?: number }).status === 0)
      throw new MstError("REVERTED", "Transaction failed.");
    onStage("confirmed");
    return tx.hash;
  } catch (err) {
    onStage("failed");
    throw toMstError(err);
  }
}
export async function getConnectedAddress(): Promise<string | null> {
  const injected = getInjectedProvider();
  if (!injected) return null;
  try {
    const accounts = (await injected.request({ method: "eth_accounts" })) as string[];
    return accounts?.[0] ?? null;
  } catch { return null; }
}
