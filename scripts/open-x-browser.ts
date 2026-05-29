import { openXBrowser } from "../src/x/browser";

const session = await openXBrowser({ headless: false });

let closed = false;

async function closeSession() {
  if (closed) return;
  closed = true;
  await session.close().catch(() => undefined);
}

process.on("SIGINT", () => {
  closeSession().finally(() => process.exit(0));
});

process.on("SIGTERM", () => {
  closeSession().finally(() => process.exit(0));
});

await session.page.goto("https://x.com/home", { waitUntil: "domcontentloaded" });
await session.page.bringToFront().catch(() => undefined);
console.log("X browser is open. Log in if needed, then close the browser window when done.");

await new Promise<void>((resolve) => {
  session.context.on("close", () => resolve());
});
await closeSession();
