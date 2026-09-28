// MST network configuration — env-driven, defaults from official MST docs.
// Sources:
// - Vibe Kit docs: testnet chain 91562037 / https://testnetrpc.mstblockchain.com,
//   mainnet chain 4646 / https://mariorpc.mstblockchain.com
// - Testnet docs: explorer https://testnet.mstscan.com, currency tMSTC, faucet https://faucet.mstblockchain.com
// NOTE: mainnet explorer URL is NOT confirmed in official docs → env-only, no default.
export type MstNetworkName = "testnet" | "mainnet";
export type MstNetwork = {
  name: MstNetworkName; label: string; chainId: number; chainIdHex: string;
  rpcUrl: string; explorerUrl: string; currencySymbol: string; currencyDecimals: number;
};
const num = (v: string | undefined, fallback: number) => {
  const n = Number(v); return Number.isFinite(n) && n > 0 ? n : fallback;
};
export const MST_NETWORKS: Record<MstNetworkName, MstNetwork> = {
  testnet: {
    name: "testnet", label: "MST Testnet",
    chainId: num(process.env.NEXT_PUBLIC_MST_TESTNET_CHAIN_ID, 91562037),
    chainIdHex: "", rpcUrl: process.env.NEXT_PUBLIC_MST_TESTNET_RPC_URL || "https://testnetrpc.mstblockchain.com",
    explorerUrl: process.env.NEXT_PUBLIC_MST_TESTNET_EXPLORER_URL || "https://testnet.mstscan.com",
    currencySymbol: process.env.NEXT_PUBLIC_MST_CURRENCY_SYMBOL || "tMSTC", currencyDecimals: 18,
  },
  mainnet: {
    name: "mainnet", label: "MST Mainnet",
    chainId: num(process.env.NEXT_PUBLIC_MST_MAINNET_CHAIN_ID, 4646),
    chainIdHex: "", rpcUrl: process.env.NEXT_PUBLIC_MST_MAINNET_RPC_URL || "https://mariorpc.mstblockchain.com",
    explorerUrl: process.env.NEXT_PUBLIC_MST_MAINNET_EXPLORER_URL || "",
    currencySymbol: process.env.NEXT_PUBLIC_MST_CURRENCY_SYMBOL || "MSTC", currencyDecimals: 18,
  },
};
for (const n of Object.values(MST_NETWORKS)) n.chainIdHex = `0x${n.chainId.toString(16)}`;
const wanted = (process.env.NEXT_PUBLIC_MST_NETWORK || "testnet").toLowerCase();
export const ACTIVE_NETWORK: MstNetwork = MST_NETWORKS[wanted === "mainnet" ? "mainnet" : "testnet"];
// Back-compat single vars (take precedence if set)
if (process.env.NEXT_PUBLIC_MST_RPC_URL) ACTIVE_NETWORK.rpcUrl = process.env.NEXT_PUBLIC_MST_RPC_URL!;
if (process.env.NEXT_PUBLIC_MST_CHAIN_ID) {
  ACTIVE_NETWORK.chainId = num(process.env.NEXT_PUBLIC_MST_CHAIN_ID, ACTIVE_NETWORK.chainId);
  ACTIVE_NETWORK.chainIdHex = `0x${ACTIVE_NETWORK.chainId.toString(16)}`;
}
if (process.env.NEXT_PUBLIC_MST_EXPLORER_URL) ACTIVE_NETWORK.explorerUrl = process.env.NEXT_PUBLIC_MST_EXPLORER_URL!;
export const CONTRACT_ADDRESSES = {
  creatorFactory: process.env.NEXT_PUBLIC_CREATOR_FACTORY_ADDRESS || "",
  postFactory: process.env.NEXT_PUBLIC_POST_FACTORY_ADDRESS || "",
  marketplace: process.env.NEXT_PUBLIC_MARKETPLACE_ADDRESS || "",
};
export const isContractDeployed = (addr: string) => /^0x[0-9a-fA-F]{40}$/.test(addr);
export const getExplorerTxUrl = (hash: string) =>
  ACTIVE_NETWORK.explorerUrl ? `${ACTIVE_NETWORK.explorerUrl.replace(/\/$/, "")}/tx/${hash}` : "";
export const getExplorerAddressUrl = (address: string) =>
  ACTIVE_NETWORK.explorerUrl ? `${ACTIVE_NETWORK.explorerUrl.replace(/\/$/, "")}/address/${address}` : "";
