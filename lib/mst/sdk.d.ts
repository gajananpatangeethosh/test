// Type declarations for @mstblockchain/mst-sdk v1.0.0 (ships no .d.ts).
// Shapes verified against the published package source (src/core/*.js, src/utils/*.js).
declare module "@mstblockchain/mst-sdk" {
  export class ProviderError extends Error { code: "PROVIDER_ERROR"; }
  export class TransactionError extends Error { code: "TRANSACTION_ERROR"; }
  export class WalletError extends Error { code: "WALLET_ERROR"; }
  export class Provider {
    constructor(rpcUrl: string);
    rpcUrl: string;
    getBlockNumber(): Promise<number>;
    getBalance(address: string): Promise<bigint>;
    getTransactionReceipt(hash: string): Promise<{ status?: number; contractAddress?: string } | null>;
    waitForTransaction(hash: string): Promise<{ status?: number; contractAddress?: string } | null>;
    estimateGas(transaction: object): Promise<number>;
  }
  export class Signer {
    constructor(privateKey: string, provider: Provider);
    address: string;
    static createRandom(provider: Provider): Signer;
    getPrivateKey(): string;
    getAddress(): Promise<string>;
    sendTransaction(tx: object): Promise<string>;
    sendNative(to: string, amount: string): Promise<string>;
    sendToken(tokenAddress: string, to: string, amount: string): Promise<string>;
    deploy(abi: unknown[], bytecode: string, args?: unknown[]): Promise<string>;
    estimateGas(method: string, args: unknown[]): Promise<number>;
  }
  export class Client {
    constructor(rpcUrl: string, privateKey?: string | null);
    provider: Provider;
    signer?: Signer;
    static createRandom(rpcUrl: string): Client;
  }
  export const Constants: { CHAINS: { MAINNET: number; TESTNET: number }; DEFAULT_RPC_URL: string; GAS_LIMIT: number };
  export const Errors: { ProviderError: typeof ProviderError; TransactionError: typeof TransactionError; WalletError: typeof WalletError };
}
