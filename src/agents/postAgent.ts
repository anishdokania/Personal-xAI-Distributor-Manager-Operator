import {
  getEffectiveConfig,
  insertPost,
  markPostFailed,
  markPostPublished,
  postsSentToday,
  recordAction,
  recordError
} from "../db";
import { generateText } from "../openai";
import { readOperatorMemory } from "../localFiles";
import { publishOriginalPost } from "../x/post";
import { findBlockedTopics } from "./scoreAgent";

export type PostAgentResult = {
  status: "drafted" | "published" | "skipped" | "failed";
  postId?: number;
  content?: string;
  reason?: string;
};

function cleanPost(text: string): string {
  return text
    .replace(/^["'\u201c\u201d]+|["'\u201c\u201d]+$/g, "")
    .replace(/^post:\s*/i, "")
    .trim();
}

async function generateOriginalPost(previousFeedback = ""): Promise<string> {
  const runtimeConfig = getEffectiveConfig();
  const memory = await readOperatorMemory();

  const post = await generateText(
    [
      {
        role: "system",
        content:
          "You write original X posts for a thoughtful builder account. Be specific, natural, and low-hype."
      },
      {
        role: "user",
        content: `
Account brain:
${memory.brain}

Ideas:
${memory.ideas}

Style:
${memory.style}

Forbidden:
${memory.forbidden}

Configured topics:
${runtimeConfig.topics.join(", ")}

Tone/style:
${runtimeConfig.toneStyle}

Write one original X post under 260 characters.
Avoid generic AI/startup guru language.
Avoid fake claims, fake metrics, hashtags, engagement bait, and inflated certainty.
Do not post about forbidden topics.
Return only the post text.
${previousFeedback ? `Previous attempt feedback: ${previousFeedback}` : ""}
        `.trim()
      }
    ],
    { temperature: 0.8, maxTokens: 120 }
  );

  return cleanPost(post);
}

export async function runPostAgent(): Promise<PostAgentResult> {
  const runtimeConfig = getEffectiveConfig();

  recordAction("postAgent", "started", "Post agent started", {
    autoPostEnabled: runtimeConfig.autoPostEnabled
  });

  try {
    if (postsSentToday() >= runtimeConfig.postsPerDay) {
      const reason = "Daily post limit reached.";
      recordAction("postAgent", "skipped", reason);
      return { status: "skipped", reason };
    }

    let generated = "";
    let feedback = "";

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      generated = await generateOriginalPost(feedback);
      const blockedTopics = findBlockedTopics(generated);

      if (blockedTopics.length > 0) {
        feedback = `The post touched forbidden topics: ${blockedTopics.join(", ")}. Try a safer practical automation idea.`;
        continue;
      }

      if (generated.length > 280) {
        feedback = "The post was too long. Make it shorter than 260 characters.";
        continue;
      }

      break;
    }

    if (!generated || generated.length > 280 || findBlockedTopics(generated).length > 0) {
      const reason = "Could not generate a safe post within three attempts.";
      const postId = insertPost(generated || "(empty)", "failed", "postAgent", reason);
      recordAction("postAgent", "failed", reason, { postId });
      return { status: "failed", postId, content: generated, reason };
    }

    const postId = insertPost(generated, runtimeConfig.autoPostEnabled ? "pending" : "draft");

    if (!runtimeConfig.autoPostEnabled) {
      recordAction("postAgent", "drafted", "Generated post draft", { postId });
      return { status: "drafted", postId, content: generated };
    }

    try {
      const publishResult = await publishOriginalPost(generated);
      markPostPublished(postId, publishResult.url);
      recordAction("postAgent", "published", "Published generated post", { postId });
      return { status: "published", postId, content: generated };
    } catch (error) {
      markPostFailed(postId, error);
      throw error;
    }
  } catch (error) {
    recordError("runPostAgent", error);
    recordAction("postAgent", "failed", "Post agent failed", {
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}
