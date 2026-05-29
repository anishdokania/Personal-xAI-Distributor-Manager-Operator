import { chromium, type BrowserContext, type Page } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import { getEffectiveConfig, recordAction } from "../db";

export type XBrowserSession = {
  context: BrowserContext;
  page: Page;
  close: () => Promise<void>;
};

type OpenXBrowserOptions = {
  headless?: boolean;
  keepOpen?: boolean;
};

type ManagedXBrowserState = {
  session: XBrowserSession;
  context: BrowserContext;
  page: Page;
};

const managedXBrowserKey = "__personalXOperatorManagedBrowser";

type XOperatorGlobal = typeof globalThis & {
  [managedXBrowserKey]?: ManagedXBrowserState | null;
};

function getManagedState(): ManagedXBrowserState | null {
  return ((globalThis as XOperatorGlobal)[managedXBrowserKey] as ManagedXBrowserState | null | undefined) ?? null;
}

function setManagedState(state: ManagedXBrowserState | null): void {
  (globalThis as XOperatorGlobal)[managedXBrowserKey] = state;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function randomDelay(minMs = 900, maxMs = 2200): Promise<void> {
  const wait = Math.floor(minMs + Math.random() * (maxMs - minMs));
  await sleep(wait);
}

export function jitterMs(maxMinutes: number): number {
  return Math.floor(Math.random() * Math.max(0, maxMinutes) * 60_000);
}

export async function logBrowserAction(message: string, metadata?: unknown): Promise<void> {
  recordAction("browser", "info", message, metadata);
  console.log(`[browser] ${message}`);
}

async function profileAppearsLocked(userDataDir: string): Promise<boolean> {
  const lockFiles = ["SingletonLock", "SingletonSocket", "SingletonCookie"];

  for (const fileName of lockFiles) {
    try {
      await fs.lstat(path.join(userDataDir, fileName));
      return true;
    } catch {
      // Missing lock files are expected when no Chromium owns the profile.
    }
  }

  return false;
}

function getManagedSession(): XBrowserSession | null {
  const managedXBrowser = getManagedState();
  if (!managedXBrowser) return null;

  const page = managedXBrowser.context.pages().find((candidate) => candidate.url().includes("x.com"))
    || managedXBrowser.context.pages()[0]
    || managedXBrowser.page;

  page.setDefaultTimeout(15_000);
  page.setDefaultNavigationTimeout(30_000);

  return {
    context: managedXBrowser.context,
    page,
    close: async () => {
      await logBrowserAction("Leaving dashboard X browser session open");
    }
  };
}

export async function openXBrowser(options: OpenXBrowserOptions = {}): Promise<XBrowserSession> {
  const runtimeConfig = getEffectiveConfig();
  await fs.mkdir(runtimeConfig.x.userDataDir, { recursive: true });

  if (!(options.headless ?? runtimeConfig.x.headless)) {
    const existingSession = getManagedSession();
    if (existingSession) {
      await logBrowserAction("Reusing dashboard X browser session");
      return existingSession;
    }

    if (await profileAppearsLocked(runtimeConfig.x.userDataDir)) {
      throw new Error(
        "The X Chromium profile is already open outside the dashboard-managed browser. Close every Chrome for Testing/X window, click Open X browser again, then rerun the agent."
      );
    }
  }

  await logBrowserAction("Launching persistent X browser session", {
    userDataDir: runtimeConfig.x.userDataDir,
    headless: options.headless ?? runtimeConfig.x.headless,
    cdpPort: runtimeConfig.x.cdpPort
  });

  let context: BrowserContext;

  try {
    context = await chromium.launchPersistentContext(runtimeConfig.x.userDataDir, {
      headless: options.headless ?? runtimeConfig.x.headless,
      viewport: { width: 1280, height: 900 },
      locale: "en-US",
      args: [
        "--disable-blink-features=AutomationControlled",
        `--remote-debugging-port=${runtimeConfig.x.cdpPort}`
      ]
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Opening in existing browser session")) {
      throw new Error(
        `The X browser profile is already open but is not reachable on port ${runtimeConfig.x.cdpPort}. Close the existing X Chromium window, then click Open X browser again.`
      );
    }
    throw error;
  }

  const page = context.pages()[0] || (await context.newPage());
  page.setDefaultTimeout(15_000);
  page.setDefaultNavigationTimeout(30_000);

  if (options.keepOpen && !(options.headless ?? runtimeConfig.x.headless)) {
    const session: XBrowserSession = {
      context,
      page,
      close: async () => {
        await logBrowserAction("Leaving dashboard X browser session open");
      }
    };

    setManagedState({ session, context, page });
    context.on("close", () => {
      if (getManagedState()?.context === context) {
        setManagedState(null);
      }
    });

    return session;
  }

  return {
    context,
    page,
    close: async () => {
      await logBrowserAction("Closing X browser session");
      await context.close();
    }
  };
}

export async function isLoggedIn(page: Page): Promise<boolean> {
  const url = page.url();
  if (url.includes("/login") || url.includes("/i/flow/login")) return false;

  const loggedInSignals = [
    '[data-testid="SideNav_NewTweet_Button"]',
    '[data-testid="AppTabBar_Home_Link"]',
    'a[href="/home"]'
  ];

  for (const selector of loggedInSignals) {
    if (await page.locator(selector).first().isVisible().catch(() => false)) {
      return true;
    }
  }

  return false;
}

export async function ensureLoggedIn(page: Page): Promise<void> {
  await logBrowserAction("Opening X home");
  await page.goto("https://x.com/home", { waitUntil: "domcontentloaded" });
  await randomDelay();

  if (!(await isLoggedIn(page))) {
    throw new Error(
      "X is not logged in for this Playwright profile. Run npm run x:login, complete login in the opened browser, then run the agent again."
    );
  }

  await logBrowserAction("Confirmed X login session");
}

export async function waitForManualLogin(page: Page): Promise<void> {
  await logBrowserAction("Opening X for manual login");
  await page.goto("https://x.com/home", { waitUntil: "domcontentloaded" });

  if (await isLoggedIn(page)) {
    await logBrowserAction("X session is already logged in");
    return;
  }

  console.log("Log into X in the opened browser. This script will keep waiting until the session is ready.");
  await page.waitForSelector(
    '[data-testid="SideNav_NewTweet_Button"], [data-testid="AppTabBar_Home_Link"], a[href="/home"]',
    { timeout: 0 }
  );
  await logBrowserAction("Manual X login completed and saved to persistent profile");
}
