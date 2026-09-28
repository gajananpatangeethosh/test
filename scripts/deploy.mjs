import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { ethers } from "ethers";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const RPC_URL = process.env.MST_RPC_URL || "https://testnetrpc.mstblockchain.com";
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
if (!PRIVATE_KEY) {
  console.error("Set DEPLOYER_PRIVATE_KEY first. See scripts/generate-key.mjs.");
  process.exit(1);
}

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

const net = await provider.getNetwork();
console.log(`Network: chainId=${net.chainId} name=${net.name}`);
console.log(`Deployer: ${wallet.address}`);
const bal = await provider.getBalance(wallet.address);
console.log(`Balance: ${ethers.formatEther(bal)} MST\n`);

async function deploy(name, args = []) {
  const artifact = JSON.parse(
    readFileSync(join(root, "contracts", "artifacts", `${name}.json`), "utf8")
  );
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const contract = await factory.deploy(...args);
  await contract.waitForDeployment();
  const addr = await contract.getAddress();
  console.log(`${name}: ${addr}`);
  return addr;
}

const creatorFactory = await deploy("CreatorFactory");
const postFactory = await deploy("PostFactory");
const marketplace = await deploy("Marketplace");

const envPath = join(root, ".env");
const env = readFileSync(envPath, "utf8");
const updated = env
  .replace(/^NEXT_PUBLIC_CREATOR_FACTORY_ADDRESS=.*$/m, `NEXT_PUBLIC_CREATOR_FACTORY_ADDRESS=${creatorFactory}`)
  .replace(/^NEXT_PUBLIC_POST_FACTORY_ADDRESS=.*$/m, `NEXT_PUBLIC_POST_FACTORY_ADDRESS=${postFactory}`)
  .replace(/^NEXT_PUBLIC_MARKETPLACE_ADDRESS=.*$/m, `NEXT_PUBLIC_MARKETPLACE_ADDRESS=${marketplace}`);
writeFileSync(envPath, updated);
console.log(`\nUpdated ${envPath}`);

console.log("\nAdd these to .env (already done by this script):");
console.log(`NEXT_PUBLIC_CREATOR_FACTORY_ADDRESS=${creatorFactory}`);
console.log(`NEXT_PUBLIC_POST_FACTORY_ADDRESS=${postFactory}`);
console.log(`NEXT_PUBLIC_MARKETPLACE_ADDRESS=${marketplace}`);
