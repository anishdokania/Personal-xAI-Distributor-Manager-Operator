import { pathToFileURL } from "node:url";
import { getEffectiveConfig, initDb, recordAction, recordError } from "./db";
import { runPostAgent } from "./agents/postAgent";
import { runReplyAgent } from "./agents/replyAgent";
import { jitterMs, sleep } from "./x/browser";

let postInProgress = false;
let replyInProgress = false;
let lastPostRunAt = 0;
let lastReplyRunAt = 0;
const postRuns = new Set<string>();

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localHourMinute(date: Date): string {
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${hour}:${minute}`;
}

async function runWithJitter(label: string, jitterMinutes: number, task: () => Promise<unknown>): Promise<void> {
  const delay = jitterMs(jitterMinutes);
  recordAction("scheduler", "queued", `${label} queued`, { delayMs: delay });

  if (delay > 0) await sleep(delay);
  await task();
}

async function schedulerTick(): Promise<void> {
  const runtimeConfig = getEffectiveConfig();
  const now = new Date();
  const dateKey = localDateKey(now);
  const hhmm = localHourMinute(now);
  const postIntervalMs = runtimeConfig.scheduler.postIntervalMinutes * 60_000;
  const intervalPostDue =
    runtimeConfig.scheduler.postIntervalMinutes > 0 && Date.now() - lastPostRunAt >= postIntervalMs;

  if (runtimeConfig.autoPostEnabled && (runtimeConfig.postingTimes.includes(hhmm) || intervalPostDue)) {
    const runKey = `${dateKey}:${hhmm}`;

    if ((intervalPostDue || !postRuns.has(runKey)) && !postInProgress) {
      if (!intervalPostDue) postRuns.add(runKey);
      lastPostRunAt = Date.now();
      postInProgress = true;
      runWithJitter("postAgent", runtimeConfig.scheduler.jitterMinutes, async () => {
        for (let index = 0; index < runtimeConfig.scheduler.postsPerRun; index += 1) {
          await runPostAgent();
        }
      })
        .catch((error) => {
          recordError("scheduler.postAgent", error);
        })
        .finally(() => {
          postInProgress = false;
        });
    }
  }

  const replyIntervalMs = runtimeConfig.scheduler.replyIntervalMinutes * 60_000;
  const replyDue = Date.now() - lastReplyRunAt >= replyIntervalMs;

  if (runtimeConfig.autoReplyEnabled && replyDue && !replyInProgress) {
    lastReplyRunAt = Date.now();
    replyInProgress = true;
    runWithJitter("replyAgent", runtimeConfig.scheduler.jitterMinutes, () =>
      runReplyAgent({
        maxReplies: runtimeConfig.scheduler.repliesPerRun,
        priorityConnectionReplies: runtimeConfig.scheduler.priorityConnectionRepliesPerRun
      })
    )
      .catch((error) => {
        recordError("scheduler.replyAgent", error);
      })
      .finally(() => {
        replyInProgress = false;
      });
  }
}

export async function startScheduler(): Promise<void> {
  initDb();
  recordAction("scheduler", "started", "Scheduler started");
  console.log("Scheduler started. Leave this process running.");

  await schedulerTick();
  setInterval(() => {
    schedulerTick().catch((error) => recordError("scheduler.tick", error));
  }, 60_000);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startScheduler().catch((error) => {
    recordError("scheduler", error);
    console.error(error);
    process.exit(1);
  });
}
