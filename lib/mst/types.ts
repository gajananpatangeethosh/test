// Shared MST types. EIP-1193 = the standard injected-wallet interface
// (MetaMask docs / EIP-1193 + EIP-3326 wallet_switchEthereumChain + EIP-3085 wallet_addEthereumChain).
// BridgeKey publishes no browser-injection API, so we speak generic EIP-1193 and
// prefer a provider that identifies as BridgeKey when present (UNCONFIRMED flag).
export type Eip1193Provider = {
  isBridgeKey?: boolean;
  request: (args: { method: string; params?: unknown }) => Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
};
export type WalletState = {
  address: string; chainId: number | null; isConnected: boolean; isConnecting: boolean;
  balance: string | null; balanceError: string | null; walletLabel: string;
};
export type TxStage = "idle" | "preparing" | "awaiting-approval" | "broadcasting" | "confirming" | "confirmed" | "failed";
export type TxRecord = {
  hash: string; from: string; to?: string; label: string; time: number; chainId: number;
};
export type MstTxRequest = { to: string; value?: string; data?: string; gasLimit?: string };
export type Eip6963ProviderInfo = {
  uuid: string; name: string; icon: string; rdns: string;
};
export type Eip6963ProviderDetail = {
  info: Eip6963ProviderInfo; provider: Eip1193Provider;
};
declare global {
  interface Window { ethereum?: Eip1193Provider | Eip1193Provider[] & { providers?: Eip1193Provider[] }; }
}
