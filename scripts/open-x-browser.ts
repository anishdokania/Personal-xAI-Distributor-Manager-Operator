import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { config } from "../src/config";
import { recordAction, recordError } from "../src/db";

const executablePath = chromium.executablePath();
const args = [
  `--user-data-dir=${config.x.userDataDir}`,
  "--new-window",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-search-engine-choice-screen",
  "https://x.com/home"
];

try {
  const child = spawn(executablePath, args, {
    detached: true,
    stdio: "ignore"
  });

  child.unref();

  recordAction("xBrowser", "opened", "Opened X browser window", {
    executablePath,
    userDataDir: config.x.userDataDir,
    url: "https://x.com/home"
  });

  console.log("X browser launch requested for https://x.com/home.");
} catch (error) {
  recordError("open-x-browser", error);
  throw error;
}
