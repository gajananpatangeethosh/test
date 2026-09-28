// Read-only MST chain access via the official SDK (@mstblockchain/mst-sdk v1.0.0).
// Confirmed API (from package source): new Client(rpcUrl, privateKey=null),
// client.provider.{getBlockNumber,getBalance,getTransactionReceipt,waitForTransaction,estimateGas}.
// NOTE: the SDK Signer is private-key based (server/burner-wallet pattern).
// Browser signing NEVER uses it — all user signing goes through the injected
// wallet (BridgeKey / MST-compatible) via ethers BrowserProvider.
import { Client } from "@mstblockchain/mst-sdk";
import { formatEther } from "ethers";
import { ACTIVE_NETWORK } from "./config";
let _client: Client | null = null;
export function getMstClient(): Client {
  if (!_client) _client = new Client(ACTIVE_NETWORK.rpcUrl);
  return _client;
}
export async function getMSTBalance(address: string): Promise<string> {
  const raw = await getMstClient().provider.getBalance(address);
  return formatEther(raw);
}
export async function getMstBlockNumber(): Promise<number> {
  return getMstClient().provider.getBlockNumber();
}
export async function waitForMstTransaction(hash: string, timeoutMs = 120_000) {
  const receipt = await Promise.race([
    getMstClient().provider.waitForTransaction(hash),
    new Promise((_, reject) => setTimeout(() => reject(new Error("Transaction confirmation timed out.")), timeoutMs)),
  ]);
  return receipt as Awaited<ReturnType<Client["provider"]["waitForTransaction"]>>;
}
export { Client };
