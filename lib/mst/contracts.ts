// Contract interaction layer — prepared, deployment-gated.
// Every write requires a deployed address; otherwise throws NOT_DEPLOYED so the
// UI shows "This feature is not deployed yet." — never a fake success hash.
import { Contract } from "ethers";
import { BrowserProvider } from "ethers";
import { ADDRESSES } from "@/contracts/addresses";
import { ERC20_ABI } from "@/contracts/abis/erc20";
import { CREATOR_FACTORY_ABI, POST_FACTORY_ABI } from "@/contracts/abis/factories";
import { isContractDeployed } from "./config";
import { getInjectedProvider } from "./wallet";
import { MstError } from "./errors";
function requireAddress(addr: string, what: string): string {
  if (!isContractDeployed(addr)) throw new MstError("NOT_DEPLOYED", `${what}: This feature is not deployed yet.`);
  return addr;
}
async function signerContract(address: string, abi: readonly string[] | string[]) {
  const injected = getInjectedProvider();
  if (!injected) throw new MstError("NO_WALLET", "BridgeKey wallet was not detected.");
  const signer = await new BrowserProvider(injected as never).getSigner();
  return new Contract(address, abi as string[], signer);
}
export async function getTokenBalance(token: string, owner: string): Promise<string> {
  const { JsonRpcProvider, formatUnits } = await import("ethers");
  const { ACTIVE_NETWORK } = await import("./config");
  const c = new Contract(token, ERC20_ABI as unknown as string[], new JsonRpcProvider(ACTIVE_NETWORK.rpcUrl));
  const [bal, dec]: [bigint, number] = await Promise.all([c.balanceOf(owner) as Promise<bigint>, c.decimals() as Promise<number>]);
  return formatUnits(bal, dec);
}
// --- Creator coins: Frontend → Vibe Kit/SDK → BridgeKey → CreatorFactory → CreatorCoin
export async function createCreatorCoin(_opts: { name: string; symbol: string }): Promise<string> {
  const addr = requireAddress(ADDRESSES.creatorFactory, "Creator coin factory");
  void CREATOR_FACTORY_ABI; void signerContract; void addr; void _opts;
  throw new MstError("NOT_DEPLOYED", "Creator factory ABI is not finalized. This feature is not deployed yet.");
}
export async function tradeCreatorCoin(_opts: { coin: string; side: "buy" | "sell"; amountMst: string }): Promise<string> {
  const addr = requireAddress(ADDRESSES.marketplace, "Marketplace");
  void addr; void _opts;
  throw new MstError("NOT_DEPLOYED", "Marketplace is not deployed. This feature is not deployed yet.");
}
// --- Post coins: same path via PostFactory
export async function createPostCoin(_opts: { postId: string; name: string; symbol: string }): Promise<string> {
  const addr = requireAddress(ADDRESSES.postFactory, "Post coin factory");
  void POST_FACTORY_ABI; void addr; void _opts;
  throw new MstError("NOT_DEPLOYED", "Post factory ABI is not finalized. This feature is not deployed yet.");
}
export async function collectPost(_opts: { coin: string }): Promise<string> {
  const addr = requireAddress(ADDRESSES.marketplace, "Marketplace");
  void addr; void _opts;
  throw new MstError("NOT_DEPLOYED", "Marketplace is not deployed. This feature is not deployed yet.");
}
export { ADDRESSES };
