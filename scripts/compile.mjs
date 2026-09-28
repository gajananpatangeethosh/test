import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import solc from "solc";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const solDir = join(root, "contracts", "solidity");
const outDir = join(root, "contracts", "artifacts");
mkdirSync(outDir, { recursive: true });

const files = readdirSync(solDir).filter((f) => f.endsWith(".sol"));
const sources = {};
for (const f of files) {
  sources[f] = { content: readFileSync(join(solDir, f), "utf8") };
}

const input = {
  language: "Solidity",
  sources,
  settings: {
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));

let hasError = false;
if (output.errors) {
  for (const e of output.errors) {
    console.error(e.formattedMessage);
    if (e.severity === "error") hasError = true;
  }
}
if (hasError) process.exit(1);

for (const [file, contracts] of Object.entries(output.contracts)) {
  for (const [name, data] of Object.entries(contracts)) {
    const out = { abi: data.abi, bytecode: "0x" + data.evm.bytecode.object };
    writeFileSync(join(outDir, `${name}.json`), JSON.stringify(out, null, 2));
    console.log(`Compiled ${name} from ${file}`);
  }
}
console.log(`\nArtifacts written to ${outDir}`);
