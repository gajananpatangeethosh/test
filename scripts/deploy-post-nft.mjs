import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { ethers } from "ethers";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const RPC_URL = process.env.MST_RPC_URL || "https://testnetrpc.mstblockchain.com";

function loadEnvKey() {
  if (process.env.DEPLOYER_PRIVATE_KEY) return process.env.DEPLOYER_PRIVATE_KEY;
  try {
    const raw = readFileSync(join(root, ".env"), "utf8");
    const line = raw.split("\n").find((l) => l.startsWith("DEPLOYER_PRIVATE_KEY="));
    if (line) return line.slice("DEPLOYER_PRIVATE_KEY=".length).trim().replace(/^["']|["']$/g, "");
  } catch { /* no .env */ }
  return "";
}

const PRIVATE_KEY = loadEnvKey();
if (!PRIVATE_KEY) {
  console.error("Set DEPLOYER_PRIVATE_KEY in .env or env. See scripts/generate-key.mjs.");
  process.exit(1);
}

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

const net = await provider.getNetwork();
console.log(`Network: chainId=${net.chainId}`);
console.log(`Deployer: ${wallet.address}\n`);

async function deploy(name, args = []) {
  const artifact = JSON.parse(readFileSync(join(root, "contracts", "artifacts", `${name}.json`), "utf8"));
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const contract = await factory.deploy(...args);
  await contract.waitForDeployment();
  const addr = await contract.getAddress();
  console.log(`${name}: ${addr}`);
  return contract;
}

const postNft = await deploy("PostNFT");
const postFactoryV2 = await deploy("PostFactoryV2", [await postNft.getAddress()]);
const minterTx = await postNft.setMinter(await postFactoryV2.getAddress());
await minterTx.wait();
console.log("PostNFT minter set to PostFactoryV2");

const envPath = join(root, ".env");
let env = readFileSync(envPath, "utf8");
const upsert = (key, value) => {
  const re = new RegExp(`^${key}=.*$`, "m");
  env = re.test(env) ? env.replace(re, `${key}=${value}`) : `${env.trimEnd()}\n${key}=${value}\n`;
};
upsert("NEXT_PUBLIC_POST_NFT_ADDRESS", await postNft.getAddress());
upsert("NEXT_PUBLIC_POST_FACTORY_V2_ADDRESS", await postFactoryV2.getAddress());
writeFileSync(envPath, env);

console.log("\nAdd to .env (updated by this script):");
console.log(`NEXT_PUBLIC_POST_NFT_ADDRESS=${await postNft.getAddress()}`);
console.log(`NEXT_PUBLIC_POST_FACTORY_V2_ADDRESS=${await postFactoryV2.getAddress()}`);
console.log("\nSet NEXT_PUBLIC_APP_URL to your public HTTPS origin so BridgeKey can load NFT images.");
console.log("Example: NEXT_PUBLIC_APP_URL=https://your-echo-app.vercel.app");
