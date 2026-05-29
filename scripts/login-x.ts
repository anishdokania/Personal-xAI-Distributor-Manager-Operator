import { openXBrowser, waitForManualLogin } from "../src/x/browser";

const session = await openXBrowser({ headless: false });

try {
  await waitForManualLogin(session.page);
  console.log("X login session saved.");
} finally {
  await session.close();
}
