import { ethers } from "ethers";

const wallet = ethers.Wallet.createRandom();
console.log("Address:     " + wallet.address);
console.log("Private key:  " + wallet.privateKey);
console.log("\nFund this address from https://faucet.mstblockchain.com");
console.log("Then deploy with:");
console.log('  $env:DEPLOYER_PRIVATE_KEY="0x..."; node scripts/deploy.mjs');
