import { createRequire } from "node:module";
import { dirname } from "node:path";
import { spawn } from "node:child_process";

const require = createRequire(import.meta.url);
const wasmPackageJson = require.resolve("@next/swc-wasm-nodejs/package.json");
const wasmDir = dirname(wasmPackageJson);
const nextBin = require.resolve("next/dist/bin/next");
const args = process.argv.slice(2);

const child = spawn(process.execPath, [nextBin, ...args], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NEXT_TEST_WASM: "1",
    NEXT_TEST_WASM_DIR: wasmDir
  },
  stdio: "inherit"
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
