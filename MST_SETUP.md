# Echo × MST Blockchain — Setup Guide

## What was verified (official sources, Sep 2026)

| Fact | Source |
|---|---|
| Vibe Kit = CLI scaffolder: `npm i @mstblockchain/mst-vibe-kit` + `npx create-mst-app` | [vibe-kit docs](https://docs.mstblockchain.com/developer-docs/foundation/vibe-kit) + npm registry (`bin: create-mst-app`, deps: picocolors/prompts only) |
| Frontend SDK: `npm install @mstblockchain/mst-sdk` — `Client(rpcUrl, privateKey=null)`, `provider.{getBlockNumber,getBalance,getTransactionReceipt,waitForTransaction,estimateGas}`, private-key `Signer.{sendTransaction,sendNative,sendToken,deploy}`, errors `ProviderError/TransactionError/WalletError` | [JS SDK docs](https://docs.mstblockchain.com/developer-docs/foundation/mst-blockchain-sdks/javascript-sdk) + package source (`src/core/*.js`) |
| Testnet: chain `91562037`, RPC `https://testnetrpc.mstblockchain.com`, explorer `https://testnet.mstscan.com`, currency `tMSTC`, faucet `https://faucet.mstblockchain.com` | [testnet docs](https://docs.mstblockchain.com/developer-docs/foundation/development-networks-mst-testnet) |
| Mainnet: chain `4646`, RPC `https://mariorpc.mstblockchain.com` | [vibe-kit docs](https://docs.mstblockchain.com/developer-docs/foundation/vibe-kit) |
| Wallet: "MST-compatible wallet (e.g. MST Wallet, MetaMask with custom RPC)". BridgeKey = non-custodial mobile wallet, 95+ chains, **no documented browser-injection API** | [testnet docs](https://docs.mstblockchain.com/developer-docs/foundation/development-networks-mst-testnet) + [bridgekey.io](https://bridgekey.io) |

### Known discrepancies / UNCONFIRMED items
- SDK `Constants.CHAINS.MAINNET = 1` contradicts vibe-kit docs (`4646`). We follow the docs (`4646`) and ignore that constant.
- No `isBridgeKey` injected-provider flag is documented. Code prefers it if present, else uses any EIP-1193 wallet (documented standard).
- Mainnet explorer URL is not in the docs → `NEXT_PUBLIC_MST_MAINNET_EXPLORER_URL` left empty.
- No factory/marketplace contract ABIs exist yet → placeholders; functions throw `NOT_DEPLOYED`.

## Installation (exact commands used)

```bash
npm i @mstblockchain/mst-sdk@1.0.0 ethers@^6.16.0
```
(`ethers` v6 is the SDK's own dependency; we import it directly for `BrowserProvider` + `formatEther`.
`@mstblockchain/mst-vibe-kit` was NOT installed — it is a scaffolder CLI, not a runtime SDK.)

## Environment

Copy `.env.example` → `.env.local` (gitignored via `.env*`). Active network: `NEXT_PUBLIC_MST_NETWORK=testnet|mainnet`.
Contract addresses stay empty until deployment.

## Architecture

```
UI → lib/mst/* → @mstblockchain/mst-sdk (reads) → MST RPC
              ↘ EIP-1193 injected wallet (BridgeKey/MST-compatible) → signing
```
- Reads/balance/receipts: official SDK `Client` (no private key — `new Client(rpcUrl)`).
- Signing: `ethers.BrowserProvider(window.ethereum)` — the SDK `Signer` is private-key based and is NEVER used with user keys.
- `lib/mst/`: `config.ts` (networks, explorer links, contract gates), `types.ts` (EIP-1193, wallet/tx types), `errors.ts` (→ friendly messages), `client.ts` (SDK wrapper), `wallet.ts` (connect/switch/events), `transactions.ts` (lifecycle), `contracts.ts` (+ `contracts/` wrappers, deployment-gated).
- Global state: `components/mst/wallet-provider.tsx` (`useWallet`: address, chainId, balance, connect/disconnect/refreshBalance/switchNetwork, session txs).

## Wallet flow
Connect BridgeKey → `eth_requestAccounts` → `eth_chainId` → verify vs `ACTIVE_NETWORK.chainId` → "Switch to MST" via `wallet_switchEthereumChain` (fallback `wallet_addEthereumChain`) → `getMSTBalance` via SDK → subscribe `accountsChanged`/`chainChanged`. Disconnect = local session clear (EIP-1193 has no disconnect method).

## Transactions
`preparing → awaiting-approval → broadcasting → confirming → confirmed/failed`, rendered by `TransactionStatus`. Success is only shown after the SDK `waitForTransaction` returns a non-reverted receipt. Errors map to friendly copy (rejection, funds, network, RPC, timeout, revert).

## Contracts
`NEXT_PUBLIC_{CREATOR,POST,MARKETPLACE}_ADDRESS` empty → UI shows "This feature is not deployed yet." After deploy: paste addresses + generated ABIs into `contracts/abis/factories.ts` and wire `lib/mst/contracts.ts`.

## Local dev
```bash
npm run dev   # wallet works against MST testnet with any injected wallet; no contracts needed
```
Get `tMSTC` at https://faucet.mstblockchain.com. Add MST Testnet to MetaMask with the values above.

## Troubleshooting
- "BridgeKey extension not detected" → the app now discovers wallets via **EIP-6963 announcements** (`lib/mst/discovery.ts`) with `window.ethereum` + `window.bridgekey`-style globals as fallback, tolerating ~2.5s of late injection. If still undetected: extension installed + pinned? Site access allowed (puzzle-piece → site access)? Wallet created + unlocked? Reload the page. No proprietary BridgeKey injection API is documented, so anything beyond EIP-1193 shape (`request` function) cannot be assumed.
- "Wrong network" → use Switch to MST (adds the chain automatically on code 4902).
- "Unable to load balance" → RPC unreachable; Retry.
- Stuck "Confirming" → timed out after 120s; check the hash on the explorer.
