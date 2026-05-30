import type { Page } from "playwright";
import { recordAction, recordError } from "../db";
import { ensureLoggedIn, logBrowserAction, openXBrowser, randomDelay } from "./browser";

type ComposerKind = "post" | "reply";

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

function composerEditor(page: Page, kind: ComposerKind) {
  const editor = page.locator(
    '[data-testid="tweetTextarea_0"] [contenteditable="true"], [data-testid="tweetTextarea_0"][contenteditable="true"]'
  );

  return kind === "post" ? editor.first() : editor.last();
}

function composerButton(page: Page, kind: ComposerKind) {
  if (kind === "post") {
    return page.locator('[data-testid="tweetButton"]').first();
  }

  return page.locator('[data-testid="tweetButtonInline"], [data-testid="tweetButton"]').last();
}

async function fillComposer(page: Page, text: string, kind: ComposerKind): Promise<void> {
  const editor = composerEditor(page, kind);
  await editor.waitFor({ state: "visible", timeout: 15_000 });
  await logBrowserAction("Filling X composer", { characters: text.length });
  await editor.click({ force: true });
  await editor.fill(text).catch(async () => {
    await editor.click({ force: true });
    await page.keyboard.insertText(text);
  });
  await page.waitForTimeout(500);

  const visibleText = (await editor.textContent().catch(() => ""))?.trim() || "";
  if (!visibleText.includes(text.slice(0, Math.min(20, text.length)))) {
    throw new Error("X composer did not accept inserted text. Close any existing composer/draft modal and try again.");
  }

  await randomDelay();
}

async function composerStillContains(page: Page, text: string, kind: ComposerKind): Promise<boolean> {
  const snippet = text.slice(0, Math.min(20, text.length));

  return composerEditor(page, kind)
    .evaluate((editor, targetSnippet) => (editor.textContent || "").includes(targetSnippet), snippet)
    .catch(() => false);
}

async function waitForComposerSubmitted(page: Page, text: string, kind: ComposerKind): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (!(await composerStillContains(page, text, kind))) {
      await logBrowserAction("Confirmed X composer submitted");
      return;
    }

    await page.waitForTimeout(500);
  }

  throw new Error("X kept the generated text in the composer, so it was not confirmed as posted.");
}

async function submitComposer(page: Page, text: string, kind: ComposerKind): Promise<void> {
  const button = composerButton(page, kind);
  await button.waitFor({ state: "visible", timeout: 15_000 });
  if (!(await button.isEnabled().catch(() => false))) {
    throw new Error("X Post button is disabled because the composer has no accepted text.");
  }

  await logBrowserAction("Submitting X composer with keyboard shortcut");
  await page.keyboard.press(process.platform === "darwin" ? "Meta+Enter" : "Control+Enter");
  await page.waitForTimeout(1_500);

  if (await composerStillContains(page, text, kind)) {
    await logBrowserAction("Keyboard submit did not clear composer, clicking Post button directly");
    await button.evaluate((element) => {
      if (element instanceof HTMLElement) element.click();
    });
    await page.waitForTimeout(1_500);
  }

  if (await composerStillContains(page, text, kind)) {
    await logBrowserAction("Direct click did not clear composer, forcing Post button click");
    await button.click({ force: true });
  }

  await waitForComposerSubmitted(page, text, kind);
  await randomDelay(1_000, 2_000);
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
    await fillComposer(session.page, content, "post");
    await submitComposer(session.page, content, "post");

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
    await logBrowserAction("Opening X post for reply", { postUrl });
    await session.page.goto(postUrl, { waitUntil: "domcontentloaded" });
    await randomDelay();

    await clickFirstVisible(session.page, ['[data-testid="reply"]'], "reply button");
    await fillComposer(session.page, replyText, "reply");
    await submitComposer(session.page, replyText, "reply");

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
