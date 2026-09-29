// Contract interaction layer — wired to the deployed CreatorFactory / CreatorCoin /
// Marketplace / PostFactory contracts. Every write requires a deployed address;
// otherwise throws NOT_DEPLOYED so the UI shows "This feature is not deployed yet."
import {
  Contract,
  BrowserProvider,
  JsonRpcProvider,
  parseEther,
  formatUnits,
  type InterfaceAbi,
  type Signer,
} from "ethers";
import { ADDRESSES } from "@/contracts/addresses";
import { CREATOR_COIN_ABI } from "@/contracts/abis/erc20";
import { CREATOR_FACTORY_ABI, POST_FACTORY_ABI, POST_FACTORY_V2_ABI, POST_NFT_ABI, MARKETPLACE_ABI } from "@/contracts/abis/factories";
import { postNftMetadataUrl } from "@/lib/app-url";
import { solidityPackedKeccak256 } from "ethers";
import { isContractDeployed } from "./config";
import { getInjectedProvider } from "./wallet";
import { MstError } from "./errors";
import type { TxStage } from "./types";

function requireAddress(addr: string, what: string): string {
  if (!isContractDeployed(addr)) throw new MstError("NOT_DEPLOYED", `${what}: This feature is not deployed yet.`);
  return addr;
}

async function signerContract(address: string, abi: InterfaceAbi) {
  const injected = getInjectedProvider();
  if (!injected) throw new MstError("NO_WALLET", "BridgeKey wallet was not detected.");
  const signer = await new BrowserProvider(injected as never).getSigner();
  const contract = new Contract(address, abi, signer);
  return { contract, signer };
}

function coinFromReceipt(
  receipt: { logs: Array<{ address: string; topics: readonly string[]; data: string }> },
  factory: Contract,
  expected: string
): string {
  const event = receipt.logs
    .filter((l) => l.address.toLowerCase() === expected.toLowerCase())
    .map((l) => factory.interface.parseLog(l))
    .find((e) => e?.name === "CoinCreated");
  const coin = event?.args?.coin as string | undefined;
  if (!coin) throw new MstError("MINT_FAILED", "Could not read the new coin address.");
  return coin;
}

async function mined(tx: { wait: () => Promise<unknown> }): Promise<{ hash: string; logs: Array<{ address: string; topics: readonly string[]; data: string }> }> {
  const receipt = (await tx.wait()) as { hash: string; logs: Array<{ address: string; topics: readonly string[]; data: string }> } | null;
  if (!receipt) throw new MstError("TIMEOUT", "Transaction was not mined.");
  return receipt;
}

export async function getTokenBalance(token: string, owner: string): Promise<string> {
  const { ACTIVE_NETWORK } = await import("./config");
  const c = new Contract(token, CREATOR_COIN_ABI, new JsonRpcProvider(ACTIVE_NETWORK.rpcUrl));
  const [bal, dec]: [bigint, number] = await Promise.all([c.balanceOf(owner) as Promise<bigint>, c.decimals() as Promise<number>]);
  return formatUnits(bal, dec);
}

/** Read live bonding-curve pool state from a deployed CreatorCoin (post or creator token). */
export async function getCoinPoolOnChain(token: string): Promise<{ reserveMst: number; poolSupply: number; price: number }> {
  const { ACTIVE_NETWORK } = await import("./config");
  const c = new Contract(token, CREATOR_COIN_ABI, new JsonRpcProvider(ACTIVE_NETWORK.rpcUrl));
  const [reserve, poolBal, dec]: [bigint, bigint, number] = await Promise.all([
    c.reserve() as Promise<bigint>,
    c.balanceOf(token) as Promise<bigint>,
    c.decimals() as Promise<number>,
  ]);
  const reserveMst = Number(formatUnits(reserve, 18));
  const poolSupply = Number(formatUnits(poolBal, dec));
  const price = poolSupply > 0 ? reserveMst / poolSupply : 0;
  return { reserveMst, poolSupply, price };
}

// --- Creator coins: Frontend → BridgeKey → CreatorFactory → CreatorCoin
export async function createCreatorCoin(opts: {
  name: string;
  symbol: string;
  owner: string;
  seedMst?: string;
  onStage?: (stage: TxStage) => void;
}): Promise<{ hash: string; coin: string }> {
  const onStage = opts.onStage ?? (() => undefined);
  const addr = requireAddress(ADDRESSES.creatorFactory, "Creator coin factory");
  onStage("preparing");
  const { contract: factory } = await signerContract(addr, CREATOR_FACTORY_ABI);
  onStage("awaiting-approval");
  const tx = await factory.createCreatorCoin(opts.name, opts.symbol, opts.owner, {
    value: opts.seedMst ? parseEther(opts.seedMst) : 0,
  });
  onStage("broadcasting");
  onStage("confirming");
  const receipt = await mined(tx);
  onStage("confirmed");
  return { hash: receipt.hash, coin: coinFromReceipt(receipt, factory, addr) };
}

export async function tradeCreatorCoin(opts: {
  coin: string;
  side: "buy" | "sell";
  amountMst: string;
  onStage?: (stage: TxStage) => void;
}): Promise<string> {
  const onStage = opts.onStage ?? (() => undefined);
  const addr = requireAddress(ADDRESSES.marketplace, "Marketplace");
  onStage("preparing");
  const { contract: marketplace, signer } = await signerContract(addr, MARKETPLACE_ABI);
  const recipient = await (signer as Signer).getAddress();
  onStage("awaiting-approval");
  if (opts.side === "buy") {
    const tx = await marketplace.buy(opts.coin, recipient, { value: parseEther(opts.amountMst) });
    onStage("broadcasting");
    onStage("confirming");
    const receipt = await mined(tx);
    onStage("confirmed");
    return receipt.hash;
  }
  const { contract: coin } = await signerContract(opts.coin, CREATOR_COIN_ABI);
  const units = parseEther(opts.amountMst);
  const approveTx = await coin.approve(addr, units);
  onStage("broadcasting");
  await approveTx.wait();
  onStage("awaiting-approval");
  const tx = await marketplace.sell(opts.coin, units, recipient);
  onStage("broadcasting");
  onStage("confirming");
  const receipt = await mined(tx);
  onStage("confirmed");
  return receipt.hash;
}

export function hasPostNftMinter(): boolean {
  return isContractDeployed(ADDRESSES.postFactoryV2) && isContractDeployed(ADDRESSES.postNft);
}

function postAssetFromReceipt(
  receipt: { logs: Array<{ address: string; topics: readonly string[]; data: string }> },
  factory: Contract,
  expected: string,
): { coin: string; nftTokenId: string } {
  const event = receipt.logs
    .filter((l) => l.address.toLowerCase() === expected.toLowerCase())
    .map((l) => factory.interface.parseLog(l))
    .find((e) => e?.name === "PostAssetCreated");
  const coin = event?.args?.coin as string | undefined;
  const nftTokenId = event?.args?.nftTokenId as bigint | undefined;
  if (!coin || nftTokenId === undefined) throw new MstError("MINT_FAILED", "Could not read post asset from receipt.");
  return { coin, nftTokenId: nftTokenId.toString() };
}

/** Plan C: ERC-721 collectible + ERC-20 tradable coin. Uses PostFactoryV2 when deployed. */
export async function createPostAsset(opts: {
  postId: string;
  name: string;
  symbol: string;
  owner: string;
  seedMst?: string;
  onStage?: (stage: TxStage) => void;
}): Promise<{ hash: string; coin: string; nftTokenId?: string }> {
  const onStage = opts.onStage ?? (() => undefined);
  const postIdHash = solidityPackedKeccak256(["string"], [opts.postId]);
  const tokenURI = postNftMetadataUrl(opts.postId);

  if (hasPostNftMinter()) {
    const addr = requireAddress(ADDRESSES.postFactoryV2, "Post factory v2");
    onStage("preparing");
    const { contract: factory } = await signerContract(addr, POST_FACTORY_V2_ABI);
    onStage("awaiting-approval");
    const tx = await factory.createPostAsset(opts.name, opts.symbol, opts.owner, postIdHash, tokenURI, {
      value: opts.seedMst ? parseEther(opts.seedMst) : 0,
    });
    onStage("broadcasting");
    onStage("confirming");
    const receipt = await mined(tx);
    onStage("confirmed");
    const { coin, nftTokenId } = postAssetFromReceipt(receipt, factory, addr);
    return { hash: receipt.hash, coin, nftTokenId };
  }

  const addr = requireAddress(ADDRESSES.postFactory, "Post coin factory");
  onStage("preparing");
  const { contract: factory } = await signerContract(addr, POST_FACTORY_ABI);
  onStage("awaiting-approval");
  const tx = await factory.createPostCoin(opts.name, opts.symbol, opts.owner, {
    value: opts.seedMst ? parseEther(opts.seedMst) : 0,
  });
  onStage("broadcasting");
  onStage("confirming");
  const receipt = await mined(tx);
  onStage("confirmed");
  return { hash: receipt.hash, coin: coinFromReceipt(receipt, factory, addr) };
}

function nftFromReceipt(
  receipt: { logs: Array<{ address: string; topics: readonly string[]; data: string }> },
  nft: Contract,
  expected: string,
): string {
  const event = receipt.logs
    .filter((l) => l.address.toLowerCase() === expected.toLowerCase())
    .map((l) => nft.interface.parseLog(l))
    .find((e) => e?.name === "PostMinted");
  const tokenId = event?.args?.tokenId as bigint | undefined;
  if (tokenId === undefined) throw new MstError("MINT_FAILED", "Could not read NFT token id from receipt.");
  return tokenId.toString();
}

/** Mint only the ERC-721 collectible for posts that already have an on-chain token (v1 backfill). */
export async function mintPostNftOnly(opts: {
  postId: string;
  owner: string;
  onStage?: (stage: TxStage) => void;
}): Promise<{ hash: string; nftTokenId: string }> {
  const onStage = opts.onStage ?? (() => undefined);
  const factoryAddr = requireAddress(ADDRESSES.postFactoryV2, "Post factory v2");
  const nftAddr = requireAddress(ADDRESSES.postNft, "Post NFT");
  const postIdHash = solidityPackedKeccak256(["string"], [opts.postId]);
  const tokenURI = postNftMetadataUrl(opts.postId);
  onStage("preparing");
  const { contract: factory } = await signerContract(factoryAddr, POST_FACTORY_V2_ABI);
  onStage("awaiting-approval");
  const tx = await factory.mintPostNft(opts.owner, postIdHash, tokenURI);
  onStage("broadcasting");
  onStage("confirming");
  const receipt = await mined(tx);
  onStage("confirmed");
  const nft = new Contract(nftAddr, POST_NFT_ABI);
  return { hash: receipt.hash, nftTokenId: nftFromReceipt(receipt, nft, nftAddr) };
}

/** @deprecated Use createPostAsset — kept for imports that only need the ERC-20 coin. */
export async function createPostCoin(opts: {
  postId: string;
  name: string;
  symbol: string;
  owner: string;
  seedMst?: string;
  onStage?: (stage: TxStage) => void;
}): Promise<{ hash: string; coin: string }> {
  const { hash, coin } = await createPostAsset(opts);
  return { hash, coin };
}

export async function collectPost(_opts: { coin: string }): Promise<string> {
  void _opts;
  throw new MstError("NOT_DEPLOYED", "Collect is not deployed yet.");
}

export { ADDRESSES };
