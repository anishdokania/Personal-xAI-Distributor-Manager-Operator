import "dotenv/config";
import path from "node:path";

function numberFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function booleanFromEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (!raw) return fallback;

  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

function listFromEnv(name: string, fallback: string[]): string[] {
  const raw = process.env[name];
  if (!raw) return fallback;

  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function resolveFromRoot(value: string): string {
  return path.isAbsolute(value) ? value : path.join(process.cwd(), value);
}

export type OperatorConfig = {
  postsPerDay: number;
  repliesPerDay: number;
  postingTimes: string[];
  maxFeedPostsToScan: number;
  minReplyScore: number;
  autoPostEnabled: boolean;
  autoReplyEnabled: boolean;
  topics: string[];
  forbiddenTopics: string[];
  toneStyle: string;
  mockAiEnabled: boolean;
  openaiApiKey?: string;
  openaiModel: string;
  databasePath: string;
  x: {
    userDataDir: string;
    headless: boolean;
    cdpPort: number;
  };
  scheduler: {
    postIntervalMinutes: number;
    postsPerRun: number;
    replyIntervalMinutes: number;
    jitterMinutes: number;
    repliesPerRun: number;
    priorityConnectionRepliesPerRun: number;
  };
};

export const config: OperatorConfig = {
  postsPerDay: numberFromEnv("POSTS_PER_DAY", 3),
  repliesPerDay: numberFromEnv("REPLIES_PER_DAY", 5),
  postingTimes: listFromEnv("POSTING_TIMES", ["09:00", "14:00", "18:00"]),
  maxFeedPostsToScan: numberFromEnv("MAX_FEED_POSTS_TO_SCAN", 25),
  minReplyScore: numberFromEnv("MIN_REPLY_SCORE", 8),
  autoPostEnabled: booleanFromEnv("AUTO_POST_ENABLED", false),
  autoReplyEnabled: booleanFromEnv("AUTO_REPLY_ENABLED", false),
  topics: listFromEnv("TOPICS", [
    "personal AI operators",
    "local-first automation",
    "practical AI workflows"
  ]),
  forbiddenTopics: listFromEnv("FORBIDDEN_TOPICS", [
    "politics",
    "religion",
    "medical",
    "legal",
    "tragedy",
    "adult",
    "harassment",
    "drama"
  ]),
  toneStyle: process.env.TONE_STYLE?.trim() || "concise, thoughtful, specific, plainspoken",
  mockAiEnabled: booleanFromEnv("MOCK_AI", true),
  openaiApiKey: process.env.OPENAI_API_KEY,
  openaiModel: process.env.OPENAI_MODEL || "gpt-4.1-mini",
  databasePath: resolveFromRoot(process.env.DATABASE_PATH || "./data/operator.sqlite"),
  x: {
    userDataDir: resolveFromRoot(process.env.X_USER_DATA_DIR || "./data/x-session"),
    headless: booleanFromEnv("X_HEADLESS", false),
    cdpPort: numberFromEnv("X_CDP_PORT", 9222)
  },
  scheduler: {
    postIntervalMinutes: numberFromEnv("SCHEDULER_POST_INTERVAL_MINUTES", 0),
    postsPerRun: numberFromEnv("SCHEDULER_POSTS_PER_RUN", 1),
    replyIntervalMinutes: numberFromEnv("SCHEDULER_REPLY_INTERVAL_MINUTES", 180),
    jitterMinutes: numberFromEnv("SCHEDULER_JITTER_MINUTES", 10),
    repliesPerRun: numberFromEnv("SCHEDULER_REPLIES_PER_RUN", 1),
    priorityConnectionRepliesPerRun: numberFromEnv("SCHEDULER_PRIORITY_CONNECTION_REPLIES_PER_RUN", 1)
  }
};
