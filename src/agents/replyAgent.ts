import {
  getEffectiveConfig,
  insertReply,
  markReplyFailed,
  markReplySent,
  recordAction,
  recordError,
  repliesSentToday,
  repliesToHandleSince,
  replyTextExists
} from "../db";
import { generateText, isPriorityConnectionPost } from "../openai";
import { readOperatorMemory } from "../localFiles";
import { publishReplyToPost } from "../x/post";
import { scanForYouFeed, type ScannedFeedItem } from "../x/feed";
import { scoreFeedItem } from "./scoreAgent";

export type ReplyAgentResult = {
  scanned: number;
  scored: number;
  drafted: number;
  sent: number;
  skipped: number;
  failed: number;
};

export type ReplyAgentOptions = {
  maxReplies?: number;
  priorityConnectionReplies?: number;
};

function todayStartIso(): string {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return start.toISOString();
}

function cleanReply(text: string): string {
  return text
    .replace(/^["'\u201c\u201d]+|["'\u201c\u201d]+$/g, "")
    .replace(/^reply:\s*/i, "")
    .trim();
}

async function generateReply(item: ScannedFeedItem, scoreReason: string): Promise<string> {
  const memory = await readOperatorMemory();
  const runtimeConfig = getEffectiveConfig();

  const reply = await generateText(
    [
      {
        role: "system",
        content:
          "You write concise, natural X replies for a personal account. Avoid spam, generic praise, mass-tagging, CTAs, and product promotion."
      },
      {
        role: "user",
        content: `
Account brain:
${memory.brain}

Style:
${memory.style}

Forbidden:
${memory.forbidden}

Configured tone:
${runtimeConfig.toneStyle}

Original post:
${item.text}

Author: ${item.author} (${item.handle})
Why this scored well:
${scoreReason}

Write one reply under 240 characters.
Make it sound like a real person adding a useful thought.
Do not include hashtags unless clearly useful.
Do not ask people to follow, DM, click, or check anything out.
Do not mention that you are an AI.
Return only the reply text.
        `.trim()
      }
    ],
    { temperature: 0.75, maxTokens: 120 }
  );

  return cleanReply(reply);
}

export async function runReplyAgent(options: ReplyAgentOptions = {}): Promise<ReplyAgentResult> {
  const runtimeConfig = getEffectiveConfig();
  const result: ReplyAgentResult = {
    scanned: 0,
    scored: 0,
    drafted: 0,
    sent: 0,
    skipped: 0,
    failed: 0
  };

  recordAction("replyAgent", "started", "Reply agent started", {
    autoReplyEnabled: runtimeConfig.autoReplyEnabled,
    minReplyScore: runtimeConfig.minReplyScore
  });

  try {
    const dailyRemaining = Math.max(0, runtimeConfig.repliesPerDay - repliesSentToday());
    const remainingAtStart =
      typeof options.maxReplies === "number" ? Math.min(dailyRemaining, options.maxReplies) : dailyRemaining;
    let remaining = remainingAtStart;
    const items = await scanForYouFeed(runtimeConfig.maxFeedPostsToScan);
    result.scanned = items.length;
    const scoredItems = [];

    for (const item of items) {
      const score = await scoreFeedItem(item);
      result.scored += 1;
      scoredItems.push({
        item,
        score,
        isPriorityConnection: isPriorityConnectionPost(item.text)
      });
    }

    const priorityConnectionLimit = Math.max(0, options.priorityConnectionReplies ?? 0);
    const priorityConnections = scoredItems
      .filter((entry) => entry.isPriorityConnection)
      .slice(0, priorityConnectionLimit);
    const priorityIds = new Set(priorityConnections.map((entry) => entry.item.dbId));
    const orderedItems = [
      ...priorityConnections,
      ...scoredItems.filter((entry) => !priorityIds.has(entry.item.dbId))
    ];

    for (const { item, score } of orderedItems) {

      if (score.score < runtimeConfig.minReplyScore) {
        insertReply({
          feedItemId: item.dbId,
          author: item.author,
          handle: item.handle,
          postText: item.text,
          score: score.score,
          status: "skipped",
          error: score.reason
        });
        result.skipped += 1;
        continue;
      }

      if (remaining <= 0) {
        insertReply({
          feedItemId: item.dbId,
          author: item.author,
          handle: item.handle,
          postText: item.text,
          score: score.score,
          status: "skipped",
          error: options.maxReplies ? "Scheduled reply limit reached." : "Daily reply limit reached."
        });
        result.skipped += 1;
        continue;
      }

      if (!item.url) {
        insertReply({
          feedItemId: item.dbId,
          author: item.author,
          handle: item.handle,
          postText: item.text,
          score: score.score,
          status: "skipped",
          error: "No stable X post URL found."
        });
        result.skipped += 1;
        continue;
      }

      if (repliesToHandleSince(item.handle, todayStartIso()) >= 2) {
        insertReply({
          feedItemId: item.dbId,
          author: item.author,
          handle: item.handle,
          postText: item.text,
          score: score.score,
          status: "skipped",
          error: "Per-author daily reply limit reached."
        });
        result.skipped += 1;
        continue;
      }

      let replyText = "";
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        replyText = await generateReply(item, score.reason);
        if (!replyTextExists(replyText)) break;
      }

      if (replyTextExists(replyText)) {
        insertReply({
          feedItemId: item.dbId,
          author: item.author,
          handle: item.handle,
          postText: item.text,
          replyText,
          score: score.score,
          status: "skipped",
          error: "Duplicate reply text."
        });
        result.skipped += 1;
        continue;
      }

      if (!runtimeConfig.autoReplyEnabled) {
        insertReply({
          feedItemId: item.dbId,
          author: item.author,
          handle: item.handle,
          postText: item.text,
          replyText,
          score: score.score,
          status: "draft"
        });
        result.drafted += 1;
        remaining -= 1;
        continue;
      }

      const replyId = insertReply({
        feedItemId: item.dbId,
        author: item.author,
        handle: item.handle,
        postText: item.text,
        replyText,
        score: score.score,
        status: "pending"
      });

      try {
        const publishResult = await publishReplyToPost(item.url, replyText);
        markReplySent(replyId, publishResult.url);
        result.sent += 1;
        remaining -= 1;
      } catch (error) {
        markReplyFailed(replyId, error);
        recordError("runReplyAgent.publish", error);
        result.failed += 1;
      }
    }

    recordAction("replyAgent", "completed", "Reply agent completed", result);
    return result;
  } catch (error) {
    recordError("runReplyAgent", error);
    recordAction("replyAgent", "failed", "Reply agent failed", {
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}
