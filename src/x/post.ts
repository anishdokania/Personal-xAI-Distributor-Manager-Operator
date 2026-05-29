import type { Page } from "playwright";
import { recordAction, recordError } from "../db";
import { ensureLoggedIn, logBrowserAction, openXBrowser, randomDelay } from "./browser";

async function clickFirstVisible(page: Page, selectors: string[], label: string): Promise<void> {
  for (const selector of selectors) {
    const target = page.locator(selector).first();
    if (await target.isVisible().catch(() => false)) {
      await logBrowserAction(`Clicking ${label}`, { selector });
      await target.click();
      return;
    }
  }

  throw new Error(`Could not find ${label}. Tried: ${selectors.join(", ")}`);
}

async function fillComposer(page: Page, text: string): Promise<void> {
  const editor = page.locator('[data-testid="tweetTextarea_0"]').last();
  await editor.waitFor({ state: "visible", timeout: 15_000 });
  await logBrowserAction("Filling X composer", { characters: text.length });
  await editor.click();
  await page.keyboard.insertText(text);
  await randomDelay();
}

async function submitComposer(page: Page): Promise<void> {
  const button = page.locator('[data-testid="tweetButton"], [data-testid="tweetButtonInline"]').last();
  await button.waitFor({ state: "visible", timeout: 15_000 });
  await logBrowserAction("Submitting X composer");
  await button.click();
  await randomDelay(2_000, 4_000);
}

export async function publishOriginalPost(content: string): Promise<{ url?: string | null }> {
  const session = await openXBrowser();

  try {
    await ensureLoggedIn(session.page);
    await clickFirstVisible(
      session.page,
      ['[data-testid="SideNav_NewTweet_Button"]', 'a[href="/compose/post"]'],
      "new post button"
    );
    await fillComposer(session.page, content);
    await submitComposer(session.page);

    recordAction("post", "sent", "Published original post to X", { characters: content.length });
    return { url: null };
  } catch (error) {
    recordError("publishOriginalPost", error);
    recordAction("post", "failed", "Failed to publish original post", {
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  } finally {
    await session.close();
  }
}

export async function publishReplyToPost(
  postUrl: string,
  replyText: string
): Promise<{ url?: string | null }> {
  const session = await openXBrowser();

  try {
    await ensureLoggedIn(session.page);
    await logBrowserAction("Opening X post for reply", { postUrl });
    await session.page.goto(postUrl, { waitUntil: "domcontentloaded" });
    await randomDelay();

    await clickFirstVisible(session.page, ['[data-testid="reply"]'], "reply button");
    await fillComposer(session.page, replyText);
    await submitComposer(session.page);

    recordAction("reply", "sent", "Published reply to X", {
      postUrl,
      characters: replyText.length
    });
    return { url: null };
  } catch (error) {
    recordError("publishReplyToPost", error);
    recordAction("reply", "failed", "Failed to publish reply to X", {
      postUrl,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  } finally {
    await session.close();
  }
}
