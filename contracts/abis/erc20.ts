// Minimal ERC-20 read ABI (standard interface — safe to ship pre-deployment).
// Factory/marketplace ABIs will be generated from deployed contracts
// (see MST_SETUP.md) — placeholders live in ./factories.ts until then.
export const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function transfer(address to, uint256 amount) returns (bool)",
] as const;
