import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const artDir = join(root, "contracts", "artifacts");
const abiDir = join(root, "contracts", "abis");

function load(name) {
  return JSON.parse(readFileSync(join(artDir, `${name}.json`), "utf8")).abi;
}

const creatorCoin = load("CreatorCoin");
const creatorFactory = load("CreatorFactory");
const postFactory = load("PostFactory");
const postFactoryV2 = load("PostFactoryV2");
const postNft = load("PostNFT");
const marketplace = load("Marketplace");

const erc20 = `// CreatorCoin (MEP-20) ABI — generated from contracts/solidity/CreatorCoin.sol.
// Full ERC-20 surface plus the bonding-curve pool (buy/sell/seed/withdraw).
import type { InterfaceAbi } from "ethers";

export const CREATOR_COIN_ABI: InterfaceAbi = ${JSON.stringify(creatorCoin, null, 2)};

// Backwards-compatible alias for the existing contracts/ shims.
export const ERC20_ABI = CREATOR_COIN_ABI;
`;

const factories = `// Factory + marketplace ABIs — generated from contracts/solidity/*.sol.
import type { InterfaceAbi } from "ethers";

export const CREATOR_FACTORY_ABI: InterfaceAbi = ${JSON.stringify(creatorFactory)};
export const POST_FACTORY_ABI: InterfaceAbi = ${JSON.stringify(postFactory)};
export const POST_FACTORY_V2_ABI: InterfaceAbi = ${JSON.stringify(postFactoryV2)};
export const POST_NFT_ABI: InterfaceAbi = ${JSON.stringify(postNft)};
export const MARKETPLACE_ABI: InterfaceAbi = ${JSON.stringify(marketplace)};
`;

writeFileSync(join(abiDir, "erc20.ts"), erc20);
writeFileSync(join(abiDir, "factories.ts"), factories);
console.log("Wrote contracts/abis/erc20.ts and contracts/abis/factories.ts");
