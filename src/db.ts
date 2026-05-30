import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config, type OperatorConfig } from "./config";

let sqlite: DatabaseSync | null = null;

export type FeedItemInput = {
  author: string;
  handle: string;
  text: string;
  timestamp?: string | null;
  metrics?: Record<string, string | number | null>;
  url?: string | null;
};

export type FeedItemRow = {
  id: number;
  dedupe_key: string;
  author: string;
  handle: string;
  text: string;
  timestamp: string | null;
  metrics_json: string | null;
  url: string | null;
  score: number | null;
  score_reason: string | null;
  risk_flags: string | null;
  scanned_at: string;
};

export type PostRow = {
  id: number;
  content: string;
  status: string;
  x_url: string | null;
  error: string | null;
  source: string;
  created_at: string;
  posted_at: string | null;
};

export type ReplyRow = {
  id: number;
  feed_item_id: number | null;
  author: string | null;
  handle: string | null;
  post_text: string | null;
  reply_text: string | null;
  score: number | null;
  status: string;
  x_url: string | null;
  error: string | null;
  created_at: string;
  replied_at: string | null;
};

export type ActionRow = {
  id: number;
  type: string;
  status: string;
  message: string;
  metadata_json: string | null;
  created_at: string;
};

export type ErrorRow = {
  id: number;
  scope: string;
  message: string;
  stack: string | null;
  created_at: string;
};

type CountRow = { count: number };
type IdRow = { id: number };

function nowIso(): string {
  return new Date().toISOString();
}

function todayBounds(): { start: string; end: string } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return { start: start.toISOString(), end: end.toISOString() };
}

function dedupeKeyForFeedItem(item: FeedItemInput): string {
  const raw = `${item.handle}|${item.text}`.toLowerCase().trim();
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export function getDb(): DatabaseSync {
  if (sqlite) return sqlite;

  fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });
  sqlite = new DatabaseSync(config.databasePath);
  initDb(sqlite);

  return sqlite;
}

export function initDb(db?: DatabaseSync): void {
  fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });
  const activeDb = db ?? sqlite ?? new DatabaseSync(config.databasePath);
  activeDb.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
  `);

  activeDb.exec(`
    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      status TEXT NOT NULL,
      x_url TEXT,
      error TEXT,
      source TEXT NOT NULL DEFAULT 'postAgent',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      posted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS feed_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dedupe_key TEXT NOT NULL UNIQUE,
      author TEXT NOT NULL,
      handle TEXT NOT NULL,
      text TEXT NOT NULL,
      timestamp TEXT,
      metrics_json TEXT,
      url TEXT,
      score INTEGER,
      score_reason TEXT,
      risk_flags TEXT,
      scanned_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_feed_items_scanned_at ON feed_items(scanned_at);
    CREATE INDEX IF NOT EXISTS idx_feed_items_handle ON feed_items(handle);

    CREATE TABLE IF NOT EXISTS replies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      feed_item_id INTEGER REFERENCES feed_items(id) ON DELETE SET NULL,
      author TEXT,
      handle TEXT,
      post_text TEXT,
      reply_text TEXT,
      score INTEGER,
      status TEXT NOT NULL,
      x_url TEXT,
      error TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      replied_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_replies_status ON replies(status);
    CREATE INDEX IF NOT EXISTS idx_replies_replied_at ON replies(replied_at);
    CREATE INDEX IF NOT EXISTS idx_replies_handle ON replies(handle);

    CREATE TABLE IF NOT EXISTS actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      message TEXT NOT NULL,
      metadata_json TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_actions_created_at ON actions(created_at);

    CREATE TABLE IF NOT EXISTS errors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scope TEXT NOT NULL,
      message TEXT NOT NULL,
      stack TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_errors_created_at ON errors(created_at);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
  `);

  sqlite = activeDb;
}

export function recordAction(
  type: string,
  status: string,
  message: string,
  metadata?: unknown
): void {
  getDb()
    .prepare(
      "INSERT INTO actions (type, status, message, metadata_json, created_at) VALUES (?, ?, ?, ?, ?)"
    )
    .run(type, status, message, metadata ? JSON.stringify(metadata) : null, nowIso());
}

export function recordError(scope: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack || null : null;

  getDb()
    .prepare("INSERT INTO errors (scope, message, stack, created_at) VALUES (?, ?, ?, ?)")
    .run(scope, message, stack, nowIso());
}

export function insertPost(content: string, status: string, source = "postAgent", error?: string): number {
  const result = getDb()
    .prepare("INSERT INTO posts (content, status, source, error, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(content, status, source, error || null, nowIso());

  return Number(result.lastInsertRowid);
}

export function markPostPublished(id: number, xUrl?: string | null): void {
  getDb()
    .prepare("UPDATE posts SET status = 'published', x_url = ?, posted_at = ? WHERE id = ?")
    .run(xUrl || null, nowIso(), id);
}

export function markPostFailed(id: number, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);

  getDb()
    .prepare("UPDATE posts SET status = 'failed', error = ? WHERE id = ?")
    .run(message, id);
}

export function insertFeedItem(item: FeedItemInput): number {
  const row = getDb()
    .prepare(
      `
      INSERT INTO feed_items (
        dedupe_key,
        author,
        handle,
        text,
        timestamp,
        metrics_json,
        url,
        scanned_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(dedupe_key) DO UPDATE SET
        author = excluded.author,
        handle = excluded.handle,
        text = excluded.text,
        timestamp = COALESCE(excluded.timestamp, feed_items.timestamp),
        metrics_json = excluded.metrics_json,
        url = COALESCE(excluded.url, feed_items.url),
        scanned_at = excluded.scanned_at
      RETURNING id
    `
    )
    .get(
      dedupeKeyForFeedItem(item),
      item.author,
      item.handle,
      item.text,
      item.timestamp || null,
      item.metrics ? JSON.stringify(item.metrics) : null,
      item.url || null,
      nowIso()
    ) as IdRow;

  return row.id;
}

export function updateFeedItemScore(
  id: number,
  score: number,
  reason: string,
  riskFlags: string[] = []
): void {
  getDb()
    .prepare("UPDATE feed_items SET score = ?, score_reason = ?, risk_flags = ? WHERE id = ?")
    .run(score, reason, riskFlags.join(","), id);
}

export function getFeedItem(id: number): FeedItemRow | undefined {
  return getDb().prepare("SELECT * FROM feed_items WHERE id = ?").get(id) as FeedItemRow | undefined;
}

export function insertReply(input: {
  feedItemId?: number | null;
  author?: string | null;
  handle?: string | null;
  postText?: string | null;
  replyText?: string | null;
  score?: number | null;
  status: string;
  xUrl?: string | null;
  error?: string | null;
}): number {
  const result = getDb()
    .prepare(
      `
      INSERT INTO replies (
        feed_item_id,
        author,
        handle,
        post_text,
        reply_text,
        score,
        status,
        x_url,
        error,
        created_at,
        replied_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    )
    .run(
      input.feedItemId || null,
      input.author || null,
      input.handle || null,
      input.postText || null,
      input.replyText || null,
      input.score ?? null,
      input.status,
      input.xUrl || null,
      input.error || null,
      nowIso(),
      input.status === "sent" ? nowIso() : null
    );

  return Number(result.lastInsertRowid);
}

export function markReplySent(id: number, xUrl?: string | null): void {
  getDb()
    .prepare("UPDATE replies SET status = 'sent', x_url = ?, replied_at = ? WHERE id = ?")
    .run(xUrl || null, nowIso(), id);
}

export function markReplyFailed(id: number, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);

  getDb()
    .prepare("UPDATE replies SET status = 'failed', error = ? WHERE id = ?")
    .run(message, id);
}

export function postsSentToday(): number {
  const { start, end } = todayBounds();
  const row = getDb()
    .prepare("SELECT COUNT(*) AS count FROM posts WHERE status = 'published' AND posted_at >= ? AND posted_at < ?")
    .get(start, end) as CountRow;

  return row.count;
}

export function repliesSentToday(): number {
  const { start, end } = todayBounds();
  const row = getDb()
    .prepare("SELECT COUNT(*) AS count FROM replies WHERE status = 'sent' AND replied_at >= ? AND replied_at < ?")
    .get(start, end) as CountRow;

  return row.count;
}

export function feedItemsScannedToday(): number {
  const { start, end } = todayBounds();
  const row = getDb()
    .prepare("SELECT COUNT(*) AS count FROM feed_items WHERE scanned_at >= ? AND scanned_at < ?")
    .get(start, end) as CountRow;

  return row.count;
}

export function repliesToHandleSince(handle: string, sinceIso: string): number {
  const row = getDb()
    .prepare(
      "SELECT COUNT(*) AS count FROM replies WHERE status = 'sent' AND lower(handle) = lower(?) AND replied_at >= ?"
    )
    .get(handle, sinceIso) as CountRow;

  return row.count;
}

export function replyTextExists(replyText: string): boolean {
  const row = getDb()
    .prepare("SELECT COUNT(*) AS count FROM replies WHERE lower(reply_text) = lower(?)")
    .get(replyText.trim()) as CountRow;

  return row.count > 0;
}

export function recentPosts(limit = 10): PostRow[] {
  return getDb()
    .prepare("SELECT * FROM posts ORDER BY created_at DESC LIMIT ?")
    .all(limit) as PostRow[];
}

export function recentReplies(limit = 10): ReplyRow[] {
  return getDb()
    .prepare("SELECT * FROM replies ORDER BY created_at DESC LIMIT ?")
    .all(limit) as ReplyRow[];
}

export function recentFeedItems(limit = 20): FeedItemRow[] {
  return getDb()
    .prepare("SELECT * FROM feed_items ORDER BY scanned_at DESC LIMIT ?")
    .all(limit) as FeedItemRow[];
}

export function recentActions(limit = 30): ActionRow[] {
  return getDb()
    .prepare("SELECT * FROM actions ORDER BY created_at DESC LIMIT ?")
    .all(limit) as ActionRow[];
}

export function recentErrors(limit = 20): ErrorRow[] {
  return getDb()
    .prepare("SELECT * FROM errors ORDER BY created_at DESC LIMIT ?")
    .all(limit) as ErrorRow[];
}

export function setSetting(key: string, value: string | number | boolean | string[]): void {
  const serialized = Array.isArray(value) ? value.join(",") : String(value);

  getDb()
    .prepare(
      `
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `
    )
    .run(key, serialized, nowIso());
}

export function getSetting(key: string): string | undefined {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;

  return row?.value;
}

function numberSetting(key: string, fallback: number): number {
  const raw = getSetting(key);
  if (!raw) return fallback;

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function booleanSetting(key: string, fallback: boolean): boolean {
  const raw = getSetting(key);
  if (!raw) return fallback;

  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

function listSetting(key: string, fallback: string[]): string[] {
  const raw = getSetting(key);
  if (!raw) return fallback;

  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function getEffectiveConfig(): OperatorConfig {
  return {
    ...config,
    postsPerDay: numberSetting("posts_per_day", config.postsPerDay),
    repliesPerDay: numberSetting("replies_per_day", config.repliesPerDay),
    postingTimes: listSetting("posting_times", config.postingTimes),
    maxFeedPostsToScan: numberSetting("max_feed_posts_to_scan", config.maxFeedPostsToScan),
    minReplyScore: numberSetting("min_reply_score", config.minReplyScore),
    autoPostEnabled: booleanSetting("auto_post_enabled", config.autoPostEnabled),
    autoReplyEnabled: booleanSetting("auto_reply_enabled", config.autoReplyEnabled),
    topics: listSetting("topics", config.topics),
    forbiddenTopics: listSetting("forbidden_topics", config.forbiddenTopics),
    toneStyle: getSetting("tone_style") || config.toneStyle,
    mockAiEnabled: booleanSetting("mock_ai", config.mockAiEnabled),
    scheduler: {
      ...config.scheduler,
      postIntervalMinutes: numberSetting(
        "scheduler_post_interval_minutes",
        config.scheduler.postIntervalMinutes
      ),
      postsPerRun: numberSetting("scheduler_posts_per_run", config.scheduler.postsPerRun),
      replyIntervalMinutes: numberSetting(
        "scheduler_reply_interval_minutes",
        config.scheduler.replyIntervalMinutes
      ),
      jitterMinutes: numberSetting("scheduler_jitter_minutes", config.scheduler.jitterMinutes),
      repliesPerRun: numberSetting("scheduler_replies_per_run", config.scheduler.repliesPerRun)
    }
  };
}

export function dashboardData() {
  const settings = getEffectiveConfig();

  return {
    settings,
    counts: {
      postsSentToday: postsSentToday(),
      repliesSentToday: repliesSentToday(),
      feedItemsScannedToday: feedItemsScannedToday()
    },
    recentPosts: recentPosts(8),
    recentReplies: recentReplies(8),
    recentFeedItems: recentFeedItems(10),
    recentActions: recentActions(15),
    recentErrors: recentErrors(10)
  };
}
