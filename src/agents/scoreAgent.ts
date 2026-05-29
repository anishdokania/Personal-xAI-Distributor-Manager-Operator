import { getEffectiveConfig, updateFeedItemScore } from "../db";
import { generateJson } from "../openai";
import { readOperatorMemory } from "../localFiles";
import type { ScannedFeedItem } from "../x/feed";

export type ScoreResult = {
  score: number;
  reason: string;
  risk_flags: string[];
};

const riskPatterns: Array<{ flag: string; pattern: RegExp }> = [
  { flag: "politics", pattern: /\b(election|senate|congress|president|democrat|republican|trump\w*|biden\w*|vote|campaign)\b/i },
  { flag: "religion", pattern: /\b(religion|church|pastor|prayer|christian|muslim|islam|jewish|hindu|god)\b/i },
  { flag: "medical", pattern: /\b(medical|doctor|diagnosis|cancers?|vaccine|medicine|therapy|depression|anxiety|surgery)\b/i },
  { flag: "legal", pattern: /\b(legal|lawsuit|attorney|lawyer|court|contract|sue|settlement)\b/i },
  { flag: "tragedy", pattern: /\b(death|killed|shooting|war|disaster|victim|attack|tragedy|mourning)\b/i },
  { flag: "adult", pattern: /\b(nsfw|porn|sex|sexual|onlyfans)\b/i },
  { flag: "harassment", pattern: /\b(idiot|fraud|scam|cancel|expose|ratio|clown)\b/i },
  { flag: "drama", pattern: /\b(drama|beef|callout|controversy|receipts)\b/i }
];

export function findBlockedTopics(text: string): string[] {
  const runtimeConfig = getEffectiveConfig();
  const lowerText = text.toLowerCase();
  const configFlags = runtimeConfig.forbiddenTopics.filter((topic) => lowerText.includes(topic.toLowerCase()));
  const patternFlags = riskPatterns.filter(({ pattern }) => pattern.test(text)).map(({ flag }) => flag);

  return Array.from(new Set([...configFlags, ...patternFlags]));
}

function normalizeScoreResult(result: Partial<ScoreResult>): ScoreResult {
  const score = Math.max(1, Math.min(10, Math.round(Number(result.score || 1))));

  return {
    score,
    reason: result.reason || "No reason provided.",
    risk_flags: Array.isArray(result.risk_flags) ? result.risk_flags.map(String) : []
  };
}

export async function scoreFeedItem(item: ScannedFeedItem): Promise<ScoreResult> {
  const blockedTopics = findBlockedTopics(item.text);

  if (blockedTopics.length > 0) {
    const result = {
      score: 1,
      reason: `Skipped because the post appears to touch forbidden topics: ${blockedTopics.join(", ")}.`,
      risk_flags: blockedTopics
    };
    updateFeedItemScore(item.dbId, result.score, result.reason, result.risk_flags);
    return result;
  }

  const runtimeConfig = getEffectiveConfig();
  const memory = await readOperatorMemory();

  const result = await generateJson<ScoreResult>(
    [
      {
        role: "system",
        content:
          "You score X posts for a personal AI operator. Be conservative. Return JSON only with score, reason, and risk_flags."
      },
      {
        role: "user",
        content: `
Account brain:
${memory.brain}

Targets:
${memory.targets}

Forbidden:
${memory.forbidden}

Configured topics:
${runtimeConfig.topics.join(", ")}

Score this post from 1-10 using:
- relevance to the account
- whether a reply can add value
- whether the author seems relevant
- whether a reply would sound natural
- any safety or reputational risk

Never recommend replying to politics, religion, medical, legal, tragedy, adult, harassment, or drama topics.

Post:
Author: ${item.author}
Handle: ${item.handle}
Text: ${item.text}
Metrics: ${item.metrics ? JSON.stringify(item.metrics) : "unknown"}

Return JSON like:
{"score":7,"reason":"short reason","risk_flags":[]}
        `.trim()
      }
    ],
    { temperature: 0.1, maxTokens: 350 }
  );

  const normalized = normalizeScoreResult(result);
  updateFeedItemScore(item.dbId, normalized.score, normalized.reason, normalized.risk_flags);
  return normalized;
}
