import type { Page } from "playwright";
import { getEffectiveConfig, insertFeedItem, recordAction, recordError, type FeedItemInput } from "../db";
import { ensureLoggedIn, logBrowserAction, openXBrowser, randomDelay } from "./browser";

type BrowserExtractedTweet = {
  author: string;
  handle: string;
  text: string;
  timestamp: string | null;
  metricsLabel: string | null;
  url: string | null;
};

export type ScannedFeedItem = FeedItemInput & {
  dbId: number;
};

function normalizeXUrl(url: string | null): string | null {
  if (!url) return null;
  const absoluteUrl = url.startsWith("http") ? url : url.startsWith("/") ? `https://x.com${url}` : `https://x.com/${url}`;
  const parsed = new URL(absoluteUrl);
  const match = parsed.pathname.match(/^\/([^/]+)\/status\/(\d+)/);

  if (!match) return absoluteUrl;
  return `https://x.com/${match[1]}/status/${match[2]}`;
}

function isUsefulTweet(item: BrowserExtractedTweet): boolean {
  return Boolean(item.text && item.text.length > 8 && item.handle.startsWith("@"));
}

async function extractVisibleTweets(page: Page): Promise<BrowserExtractedTweet[]> {
  const articles = await page.locator('article[data-testid="tweet"]').all();
  const items: BrowserExtractedTweet[] = [];

  for (const article of articles) {
    const extracted = await article
      .evaluate((node) => {
        const text = Array.from(node.querySelectorAll('[data-testid="tweetText"]'))
          .map((el) => el.textContent?.replace(/\s+/g, " ").trim())
          .filter(Boolean)
          .join("\n");

        const userName = node.querySelector('[data-testid="User-Name"]')?.textContent || "";
        const handle = userName.match(/@\w+/)?.[0] || "";
        const author =
          userName
            .split("@")[0]
            ?.replace(/\s+/g, " ")
            .replace(/\u00b7$/, "")
            .trim() || handle;

        const time = node.querySelector("time");
        const timestamp = time?.getAttribute("datetime") || time?.textContent || null;
        const metricsLabel = node.querySelector('[role="group"]')?.getAttribute("aria-label") || null;
        const url =
          Array.from(node.querySelectorAll('a[href*="/status/"]'))
            .map((link) => link.getAttribute("href"))
            .find(Boolean) || null;

        return { author, handle, text, timestamp, metricsLabel, url };
      })
      .catch(() => null);

    if (extracted && isUsefulTweet(extracted)) {
      items.push(extracted);
    }
  }

  return items;
}

export async function scanForYouFeed(maxPosts?: number): Promise<ScannedFeedItem[]> {
  const runtimeConfig = getEffectiveConfig();
  const max = maxPosts ?? runtimeConfig.maxFeedPostsToScan;
  const session = await openXBrowser();
  const seen = new Set<string>();
  const scanned: ScannedFeedItem[] = [];

  try {
    await ensureLoggedIn(session.page);
    await logBrowserAction("Selecting X For You feed");
    await session.page.getByRole("tab", { name: /for you/i }).click().catch(() => undefined);
    await randomDelay();

    for (let scroll = 0; scanned.length < max && scroll < 8; scroll += 1) {
      const visibleTweets = await extractVisibleTweets(session.page);

      for (const tweet of visibleTweets) {
        const key = `${tweet.handle}|${tweet.text}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const item: FeedItemInput = {
          author: tweet.author,
          handle: tweet.handle,
          text: tweet.text,
          timestamp: tweet.timestamp,
          metrics: tweet.metricsLabel ? { ariaLabel: tweet.metricsLabel } : undefined,
          url: normalizeXUrl(tweet.url)
        };
        const dbId = insertFeedItem(item);
        scanned.push({ ...item, dbId });

        if (scanned.length >= max) break;
      }

      if (scanned.length >= max) break;
      await logBrowserAction("Scrolling X feed", { scroll: scroll + 1, scanned: scanned.length });
      await session.page.mouse.wheel(0, 1800);
      await randomDelay(1_500, 3_000);
    }

    recordAction("feed", "scanned", "Scanned X For You feed", {
      scanned: scanned.length,
      max
    });
    return scanned;
  } catch (error) {
    recordError("scanForYouFeed", error);
    recordAction("feed", "failed", "Failed to scan X For You feed", {
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  } finally {
    await session.close();
  }
}
