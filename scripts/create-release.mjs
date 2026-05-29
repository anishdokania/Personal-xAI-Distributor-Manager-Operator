import { mkdirSync } from "node:fs";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const version = packageJson.version || "0.1.0";
const productName = "personal-x-operator";
const outputDir = "dist";
const outputFile = join(outputDir, `${productName}-v${version}.zip`);

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: "pipe"
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed:\n${result.stderr || result.stdout}`);
  }

  return result.stdout.trim();
}

mkdirSync(outputDir, { recursive: true });

const status = run("git", ["status", "--porcelain"]);
if (status) {
  console.warn("Warning: the working tree has uncommitted changes. Release ZIP will use HEAD only.");
}

run("git", [
  "archive",
  "--format=zip",
  "--output",
  outputFile,
  "HEAD"
]);

console.log(`Created ${outputFile}`);
console.log("Review the ZIP before uploading it to your payment provider.");
