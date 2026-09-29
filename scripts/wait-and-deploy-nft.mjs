import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import { ethers } from "ethers";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const RPC = process.env.MST_RPC_URL || "https://testnetrpc.mstblockchain.com";

function loadKey() {
  if (process.env.DEPLOYER_PRIVATE_KEY) return process.env.DEPLOYER_PRIVATE_KEY;
  const raw = readFileSync(join(root, ".env"), "utf8");
  const line = raw.split("\n").find((l) => l.startsWith("DEPLOYER_PRIVATE_KEY="));
  return line ? line.slice(21).trim() : "";
}

async function main() {
  const key = loadKey();
  if (!key) {
    console.error("DEPLOYER_PRIVATE_KEY missing in .env");
    process.exit(1);
  }

  const wallet = new ethers.Wallet(key);
  const address = wallet.address;
  const provider = new ethers.JsonRpcProvider(RPC);

  console.log(`Deployer: ${address}`);
  console.log("Waiting for testnet tMSTC… Fund at https://faucet.mstblockchain.com\n");

  const min = ethers.parseEther("0.01");

  for (let i = 0; i < 120; i++) {
    const bal = await provider.getBalance(address);
    process.stdout.write(`\rBalance: ${ethers.formatEther(bal)} tMSTC   `);
    if (bal >= min) {
      console.log("\n\nFunded — deploying PostNFT + PostFactoryV2…\n");
      const child = spawn("node", ["scripts/deploy-post-nft.mjs"], { cwd: root, stdio: "inherit", shell: true });
      child.on("exit", (code) => process.exit(code ?? 0));
      return;
    }
    await new Promise((r) => setTimeout(r, 5000));
  }

  console.error("\n\nTimed out after 10 minutes. Fund the wallet and run: npm run contracts:deploy:nft");
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
