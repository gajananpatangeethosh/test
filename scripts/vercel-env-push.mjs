/**
 * Push .env vars to linked Vercel project via API (no interactive prompts).
 */
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { homedir } from "os";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env");
const projectPath = join(root, ".vercel", "project.json");
const authPath = join(homedir(), "AppData", "Roaming", "com.vercel.cli", "Data", "auth.json");

if (!existsSync(envPath) || !existsSync(projectPath) || !existsSync(authPath)) {
  console.error("Missing .env, .vercel/project.json, or Vercel auth. Run: npx vercel link");
  process.exit(1);
}

const SKIP = new Set(["DEPLOYER_PRIVATE_KEY", "SUPABASE_SERVICE_ROLE_KEY"]);
const { projectId, orgId } = JSON.parse(readFileSync(projectPath, "utf8"));
const { token } = JSON.parse(readFileSync(authPath, "utf8"));
const vars = [];

for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i < 1) continue;
  const key = t.slice(0, i).trim();
  const val = t.slice(i + 1).trim();
  if (SKIP.has(key) || !val) continue;
  vars.push({ key, val });
}

console.log(`Pushing ${vars.length} env vars to project ${projectId}…\n`);

for (const { key, val } of vars) {
  const type = key.startsWith("NEXT_PUBLIC_") ? "plain" : "encrypted";
  const res = await fetch(`https://api.vercel.com/v10/projects/${projectId}/env?teamId=${orgId}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      key,
      value: val,
      type,
      target: ["production", "preview", "development"],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error(`Failed ${key}: ${res.status} ${err}`);
    process.exit(1);
  }
  console.log(`✓ ${key}`);
}

console.log("\nDone.");
