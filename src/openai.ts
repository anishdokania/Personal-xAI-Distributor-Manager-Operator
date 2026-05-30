import OpenAI from "openai";
import { config } from "./config";
import {
  feedItemsScannedToday,
  getDb,
  getEffectiveConfig,
  postsSentToday,
  recentActions,
  recentFeedItems,
  recentPosts,
  repliesSentToday
} from "./db";

type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

let client: OpenAI | null = null;

const mockPostIndexKey = "__personalXOperatorMockPostIndex";
const mockReplyIndexKey = "__personalXOperatorMockReplyIndex";

type XOperatorGlobal = typeof globalThis & {
  [mockPostIndexKey]?: number;
  [mockReplyIndexKey]?: number;
};

function latestUserContent(messages: ChatMessage[]): string {
  return [...messages].reverse().find((message) => message.role === "user")?.content || "";
}

function hashText(text: string): number {
  let hash = 0;

  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function pick<T>(items: T[], seed: number): T {
  return items[Math.abs(seed) % items.length];
}

function includesAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}

function containsTerm(text: string, term: string): boolean {
  return new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text);
}

function cleanAnchor(text: string): string {
  return text
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[@#][\w_]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractAnchor(text: string): string {
  const cleaned = cleanAnchor(text);
  const quoted = cleaned.match(/[“"]([^”"]{8,80})[”"]/);
  if (quoted?.[1]) return quoted[1];

  const question = cleaned.match(/([^.!?]{8,90}\?)/);
  if (question?.[1]) return question[1].trim();

  const sentence = cleaned
    .split(/[.!?]\s+/)
    .map((part) => part.trim())
    .find((part) => part.length >= 8);
  if (sentence && sentence.length <= 80) return sentence;
  if (sentence) return sentence.split(" ").slice(0, 9).join(" ");

  const words = cleaned.split(" ").filter(Boolean);
  return words.slice(0, 9).join(" ");
}

function trimReply(text: string, maxLength = 230): string {
  if (text.length <= maxLength) return text;

  const trimmed = text.slice(0, maxLength).replace(/\s+\S*$/, "").replace(/[.,;:!?-]+$/, "");
  return `${trimmed}.`;
}

function capitalizeFirst(text: string): string {
  return text.length > 0 ? `${text[0].toUpperCase()}${text.slice(1)}` : text;
}

type LocalReplyTopic =
  | "connection"
  | "tool_choice"
  | "vibe_coding"
  | "source_control"
  | "distribution"
  | "building"
  | "cost"
  | "dev_workflow"
  | "ai_general";

type LocalPostIntent = "question" | "comparison" | "complaint" | "launch" | "advice" | "opinion";
type LocalReplyStyle = "answer" | "nuance" | "counterpoint" | "principle" | "question";
type LocalReplyFormat =
  | "plain"
  | "short"
  | "question"
  | "connection"
  | "practical"
  | "watch"
  | "counter";

export function hasConnectionSignal(text: string): boolean {
  return /\b(looking to connect|connect with|let['’]?s connect|say hi|say hello|building in|people interested in|builders in|ambitious people|grow together|buildinpublic|building in public)\b/i.test(text);
}

export function hasConnectionRelevance(text: string): boolean {
  return /\b(ai|agents?|automation|saas|startup|startups|founders?|builders?|developers?|devs?|indie hackers?|product|shipping|coding|data science|vibe coding|buildinpublic|growing in public|full stack|backend|frontend|devops|tools?)\b/i.test(text);
}

function isBadConnectionPost(text: string): boolean {
  return /\b(follow for follow|drop yours?|dm me|giveaway|airdrop|follower-to-following|gain followers|crypto|token|traders?|trading)\b/i.test(text);
}

export function isPriorityConnectionPost(text: string): boolean {
  return hasConnectionSignal(text) && hasConnectionRelevance(text) && !isBadConnectionPost(text);
}

function detectReplyTopic(lower: string): LocalReplyTopic {
  if (isPriorityConnectionPost(lower)) return "connection";
  if (includesAny(lower, ["subscription", "price", "cost", "$", "plan", "limit"])) return "cost";
  if (includesAny(lower, ["claude", "codex", "chatgpt", "gpt", "cursor", "model"])) return "tool_choice";
  if (lower.includes("vibe coding") || lower.includes("vibecoder")) return "vibe_coding";
  if (includesAny(lower, ["local", "github", "gitlab", "bitbucket", "repo", "repository"])) return "source_control";
  if (includesAny(lower, ["distribution", "audience", "followers", "growth", "reach", "network"])) return "distribution";
  if (includesAny(lower, ["building", "build", "product", "ship", "startup", "audience"])) return "building";
  if (includesAny(lower, ["engineering", "developer", "code", "coding", "deploy", "stack"])) return "dev_workflow";
  return "ai_general";
}

function detectPostIntent(text: string, lower: string): LocalPostIntent {
  if (text.includes("?")) return "question";
  if (/\b(vs|versus|or|which|better|best)\b/i.test(text)) return "comparison";
  if (includesAny(lower, ["frustrating", "annoying", "hate", "miss", "limit", "expensive", "hard"])) return "complaint";
  if (includesAny(lower, ["launch", "launched", "shipping", "released", "new", "introducing"])) return "launch";
  if (includesAny(lower, ["should", "need to", "stop", "start", "lesson", "advice"])) return "advice";
  return "opinion";
}

function detectReplyStyle(intent: LocalPostIntent, seed: number): LocalReplyStyle {
  const stylesByIntent: Record<LocalPostIntent, LocalReplyStyle[]> = {
    question: ["answer", "nuance", "question"],
    comparison: ["nuance", "answer", "counterpoint"],
    complaint: ["nuance", "principle", "question"],
    launch: ["principle", "nuance", "question"],
    advice: ["principle", "counterpoint", "nuance"],
    opinion: ["nuance", "counterpoint", "principle"]
  };

  return pick(stylesByIntent[intent], seed);
}

function localReplyFromParts(
  topic: LocalReplyTopic,
  intent: LocalPostIntent,
  style: LocalReplyStyle,
  anchor: string,
  seed: number
): string {
  const openings: Record<LocalReplyTopic, string[]> = {
    connection: [
      "Good crowd to be around.",
      "This is the corner of X I keep coming back to.",
      "That is exactly the lane I am interested in."
    ],
    tool_choice: [
      "I would decide this by workflow, not brand.",
      "The honest answer is probably task-specific.",
      "The model matters, but the loop matters more."
    ],
    vibe_coding: [
      "Vibe coding works best when review stays in the loop.",
      "The speed is useful, but the review habit is the real guardrail.",
      "I like the fast iteration part, as long as the diff still gets read."
    ],
    source_control: [
      "I like keeping the source of truth somewhere boring and inspectable.",
      "The storage choice matters less than whether recovery is easy.",
      "Local-first only works if the workflow stays easy to audit."
    ],
    distribution: [
      "Distribution gets easier when showing up becomes a system.",
      "Audience growth feels less random when the feedback loop is visible.",
      "The underrated part is making connection habits repeatable without making them fake."
    ],
    building: [
      "Small practical tools are underrated.",
      "I like builds that start painfully specific.",
      "The best product signal is usually a repeated annoyance getting smaller."
    ],
    cost: [
      "Cost starts to matter once a tool becomes part of the daily loop.",
      "I would judge the spend by repeated workflow value.",
      "The best subscription is the one that removes real drag every week."
    ],
    dev_workflow: [
      "Developer tools are best when they preserve judgment.",
      "The sweet spot is less setup and more understanding.",
      "A good dev workflow should make review easier, not optional."
    ],
    ai_general: [
      "The useful version is usually narrower than the hype.",
      "AI gets interesting when it shortens a loop you already understand.",
      "The practical edge is not magic, it is faster iteration with visibility."
    ]
  };

  const insights: Record<LocalReplyTopic, string[]> = {
    connection: [
      "I am focused on local AI operators, browser automation, and the boring parts that make agents trustworthy.",
      "The useful overlap for me is AI tools that turn repeated workflows into visible, inspectable systems.",
      "I am most interested in builders making small tools that solve real workflow drag before they try to look big."
    ],
    tool_choice: [
      "I care most about context, visible changes, and how quickly I can correct it.",
      "The winner is the one that keeps momentum without hiding assumptions.",
      "Benchmarks matter less to me than whether I can finish the loop cleanly."
    ],
    vibe_coding: [
      "Fast generation becomes risky when it turns into blind acceptance.",
      "The danger is not using AI, it is skipping the part where you understand the change.",
      "It should feel like acceleration, not outsourcing your judgment."
    ],
    source_control: [
      "If something breaks, I want logs, history, and a simple path back.",
      "Automation feels safer when state is visible and boring to inspect.",
      "Trust comes from knowing where the work lives and what changed."
    ],
    distribution: [
      "The useful move is consistent, specific participation in the right conversations.",
      "The goal is not more noise, it is more relevant surface area with people who already care.",
      "A small number of thoughtful replies can beat a lot of generic posting if the targeting is right."
    ],
    building: [
      "You learn faster when the surface area is small enough to test honestly.",
      "A narrow workflow is easier to validate than a broad promise.",
      "The first version should prove the problem before it tries to impress anyone."
    ],
    cost: [
      "Predictable cost and clear fallback paths become underrated very quickly.",
      "The question is whether it saves attention, not just whether it looks powerful.",
      "If it earns a daily slot, the price is easier to reason about."
    ],
    dev_workflow: [
      "Less friction is great, but not if the reasoning disappears with it.",
      "The best tools remove repetitive steps while keeping the system legible.",
      "Speed is only useful if you can still explain what shipped."
    ],
    ai_general: [
      "One clear task, visible tradeoffs, and an easy stop button beat vague autonomy.",
      "It works better as a small loop around real work than as a giant abstraction.",
      "The more visible the loop, the easier it is to trust the output."
    ]
  };

  const endings = [
    "Curious how you are weighing that tradeoff.",
    "That is the part I would watch closely.",
    "That is where the workflow usually reveals the truth.",
    "The interesting part is what happens after the first week.",
    "That is the bit most teams under-measure."
  ];
  const styleOpeners: Record<LocalReplyStyle, string[]> = {
    answer: [
      pick(openings[topic], seed),
      "My short answer would be: it depends where the loop breaks.",
      "I would answer this by looking at the repeated workflow."
    ],
    nuance: [
      pick(openings[topic], seed + 1),
      "The nuance is that speed and control are not the same thing.",
      "I think the useful split is between output quality and workflow quality."
    ],
    counterpoint: [
      "I slightly disagree with the obvious take here.",
      "The part I would push on is the hidden assumption.",
      "The counterpoint is that faster is not automatically better."
    ],
    principle: [
      pick(openings[topic], seed + 2),
      "A useful rule of thumb: optimize the loop, not the demo.",
      "The principle I keep coming back to is visibility before autonomy."
    ],
    question: [
      pick(openings[topic], seed + 3),
      "The thing I would want to know is where the friction actually shows up.",
      "The follow-up question is whether this changes the daily workflow or just the headline."
    ]
  };
  const styleInsights: Record<LocalReplyStyle, string[]> = {
    answer: [
      pick(insights[topic], seed * 3),
      "The better choice is usually the one that makes the next correction easier.",
      "I would pick the option that reduces repeated manual decisions without hiding context."
    ],
    nuance: [
      pick(insights[topic], seed * 5),
      "A tool can feel powerful and still make the system harder to reason about.",
      "The real test is whether it improves judgment, not only throughput."
    ],
    counterpoint: [
      pick(insights[topic], seed * 7),
      "The part that matters most is often what happens when the tool is wrong.",
      "The risk is optimizing for the impressive moment instead of the repeatable process."
    ],
    principle: [
      pick(insights[topic], seed * 11),
      "If the loop is inspectable, you can safely make it faster over time.",
      "A narrow workflow with clear state beats a broad promise with fuzzy ownership."
    ],
    question: [
      pick(insights[topic], seed * 13),
      "I would be curious whether people keep using it after the novelty wears off.",
      "The signal I would watch is whether it changes what someone does tomorrow."
    ]
  };
  const opening = pick(styleOpeners[style], seed);
  const insight = pick(styleInsights[style], seed * 3);
  const ending = intent === "question" && style !== "question" ? "" : pick(endings, seed * 7);
  const anchorLine = anchor.length > 0 && anchor.length <= 56 ? ` On \"${anchor}\": ` : " ";
  const shouldUseAnchor = style !== "question" && anchor.length > 0 && anchor.length <= 56;
  const format = pick<LocalReplyFormat>(
    ["plain", "short", "question", "connection", "practical", "watch", "counter"],
    seed * 17 + anchor.length
  );
  const anchorPrefix = shouldUseAnchor ? `On "${anchor}": ` : "";
  const formatReplies: Record<LocalReplyFormat, string> = {
    plain: `${opening}${shouldUseAnchor ? anchorLine : " "}${insight}`,
    short: `${anchorPrefix}${insight}`,
    question: `${pick(styleOpeners.question, seed + 19)} ${pick(styleInsights.question, seed + 23)}`,
    connection:
      topic === "connection"
        ? `${pick(openings.connection, seed + 29)} ${pick(insights.connection, seed + 31)}`
        : `${insight} I am looking at this through the lens of practical AI operators and distribution workflows.`,
    practical: `${anchorPrefix}${pick(insights[topic], seed + 37)} That is the practical signal I would care about.`,
    watch: `${pick(["The thing I would watch:", "The real signal:", "What matters after the first impression:"], seed + 41)} ${pick(insights[topic], seed + 43)}`,
    counter: `${pick(styleOpeners.counterpoint, seed + 47)} ${pick(styleInsights.counterpoint, seed + 53)}`
  };
  const base = formatReplies[format];
  const withEnding = ending && !["short", "watch"].includes(format) ? `${base} ${ending}` : base;

  return withEnding.length <= 230 ? withEnding : trimReply(base);
}

function specificLocalReply(originalPost: string, lower: string, seed: number): string | null {
  if (isPriorityConnectionPost(lower)) {
    return pick(
      [
        "This is exactly the circle I’m looking for. I’m building a local X operator that scans my feed, finds builders, replies selectively, and logs every action.\n\nLet’s #connect.",
        "Definitely my lane. I’m building an AI operator for X distribution: feed scanning, natural replies, lab-journal posts, and a local audit trail.\n\nWould love to #connect.",
        "Same orbit here: startups, coding, AI agents, and building in public. I’m experimenting with a local operator that helps me meet relevant builders consistently.\n\nLet’s #connect.",
        "I’m in. My current build is a local X operator that finds useful conversations, replies thoughtfully, posts progress updates, and keeps everything inspectable.\n\nLet’s #connect.",
        "This is the builder corner I’m trying to grow in. I’m building AI automation for distribution without fake engagement or follow/unfollow games.\n\nWould be great to #connect.",
        "Relevant to me. I’m building an AI-powered X workflow for finding the right builders, joining conversations, and tracking what actually works.\n\nLet’s #connect.",
        "Count me in. I’m working on the unsexy but useful parts of personal AI operators: limits, logs, review, scheduling, and consistent distribution.\n\nLet’s #connect.",
        "I’m building right in this lane: AI automation, X distribution, and small operator loops that help builders meet the right people without spamming.\n\nLet’s #connect.",
        "This is the exact network I’m trying to build. I’m documenting an experiment where my X account grows through useful replies and transparent automation.\n\nWould love to #connect.",
        "I’m experimenting with a local AI operator that scans builder posts, replies with context, and posts lab notes as it improves.\n\nLet’s #connect.",
        "I’m in the same world: AI tools, SaaS experiments, dev workflows, and distribution systems. Currently building one for my own X account.\n\nLet’s #connect.",
        "This is my corner of X too. I’m building a personal distribution operator around AI agents, browser automation, reply scoring, and local logs.\n\nWould be great to #connect."
      ],
      seed + originalPost.length
    );
  }

  if (lower.includes("one language") && includesAny(lower, ["python", "javascript", "typescript", "rust"])) {
    return pick(
      [
        "I would bet on TypeScript if the goal is shipping useful products, and Python if the goal is AI/data workflows. The safer career bet is knowing when to use each.",
        "For pure opportunity, I would pick TypeScript plus enough Python to work with AI systems. The language matters less than being able to ship end to end.",
        "I would choose JavaScript/TS for distribution and Python for leverage. The real edge is being dangerous enough in both to turn ideas into tools."
      ],
      seed
    );
  }

  if (lower.includes("dark mode") && lower.includes("white mode")) {
    return pick(
      [
        "Dark mode for long sessions, light mode for reviewing dense UI and screenshots. Visibility depends less on taste and more on the kind of work in front of you.",
        "Dark mode when I am building, light mode when I am checking contrast or reviewing details. The best setup changes with the task.",
        "For coding I prefer dark mode, but light mode catches certain UI and contrast issues faster. I would not make it a personality trait."
      ],
      seed
    );
  }

  if (lower.includes("agi") && includesAny(lower, ["finally", "here", "released"])) {
    return pick(
      [
        "I do not think a model release is the AGI line. The more interesting question is whether it changes reliable workflows people trust every day.",
        "Probably not AGI, but maybe another step toward tools that feel less like chat and more like dependable workflows.",
        "I would judge it less by the launch label and more by whether it makes real work loops shorter, safer, and easier to inspect."
      ],
      seed
    );
  }

  if (lower.includes("10 agents") || lower.includes("agents in parallel")) {
    return pick(
      [
        "Running 10 agents only helps if the handoff layer is strong. Without shared state, logs, and review, it just turns one messy workflow into ten.",
        "Parallel agents sound powerful, but the bottleneck becomes coordination. I would start with one reliable loop before adding more workers.",
        "The hard part is not launching 10 agents. It is knowing which one did what, why, and whether the final state is trustworthy."
      ],
      seed
    );
  }

  if (lower.includes("what creates the most opportunities") && lower.includes("fast execution")) {
    return pick(
      [
        "I would pick fast execution, but only if it is aimed at a real problem. Building in public and network help more once there is proof the work compounds.",
        "Fast execution is the lever, but strong taste decides where it points. A network amplifies the work after the signal is already there.",
        "AI expertise helps, but fast execution with a tight feedback loop probably creates the most opportunities. The loop matters more than the label."
      ],
      seed
    );
  }

  if (lower.includes("claude code") && lower.includes("codex") && lower.includes("switch")) {
    return pick(
      [
        "I would not switch just for novelty. I would switch if Codex gives me a cleaner review loop and fewer moments where I have to reconstruct context.",
        "The switch only makes sense if it changes the daily loop: faster edits, clearer diffs, and fewer hidden assumptions. Otherwise it is just tool churn.",
        "I would compare them on recovery, not peak output. Which one makes it easier to catch and correct a bad direction?"
      ],
      seed
    );
  }

  if (lower.includes("future-proof career") && lower.includes("ai")) {
    return "The future-proof part is not a title. It is being the person who can turn messy workflows into systems other people can actually trust.";
  }

  return null;
}

function mockPost(): string {
  const globalState = globalThis as XOperatorGlobal;
  const nextIndex = (globalState[mockPostIndexKey] ?? -1) + 1;
  globalState[mockPostIndexKey] = nextIndex;
  const seed = nextIndex + Date.now();
  const runtimeConfig = getEffectiveConfig();
  const scannedToday = feedItemsScannedToday();
  const repliesToday = repliesSentToday();
  const postsToday = postsSentToday();
  const replyStats = getDb()
    .prepare("SELECT status, COUNT(*) AS count FROM replies GROUP BY status")
    .all() as { status: string; count: number }[];
  const sentTotal = replyStats.find((row) => row.status === "sent")?.count ?? 0;
  const skippedTotal = replyStats.find((row) => row.status === "skipped")?.count ?? 0;
  const priorityRows = getDb()
    .prepare(
      `
      SELECT post_text, reply_text, author, handle
      FROM replies
      WHERE status = 'sent'
        AND reply_text LIKE '%#connect%'
      ORDER BY replied_at DESC
      LIMIT 4
    `
    )
    .all() as { post_text: string | null; reply_text: string | null; author: string | null; handle: string | null }[];
  const recentFeed = recentFeedItems(20);
  const recentFeedText = recentFeed.map((item) => item.text.toLowerCase()).join(" ");
  const connectionSignals = recentFeed.filter((item) => isPriorityConnectionPost(item.text)).length;
  const recentActionsText = recentActions(8).map((action) => `${action.type}:${action.status}`).join(", ");
  const latestConnection = priorityRows[0];
  const latestAnchor = latestConnection?.post_text ? extractAnchor(latestConnection.post_text) : "";
  const usedPosts = new Set(recentPosts(200).map((post) => post.content.trim().toLowerCase()));
  const cadence =
    runtimeConfig.scheduler.postIntervalMinutes > 0
      ? `posting every ${runtimeConfig.scheduler.postIntervalMinutes} minutes`
      : "posting on a fixed schedule";
  const replyCadence =
    runtimeConfig.scheduler.replyIntervalMinutes > 0
      ? `${runtimeConfig.scheduler.repliesPerRun} replies every ${runtimeConfig.scheduler.replyIntervalMinutes} minutes`
      : "manual reply runs";
  const dominantTopic = includesAny(recentFeedText, ["saas", "startup", "founder"])
    ? "SaaS/startup builders"
    : includesAny(recentFeedText, ["devops", "cloud", "developer", "coding"])
      ? "developer/building posts"
      : includesAny(recentFeedText, ["ai", "agent", "automation"])
        ? "AI and automation builders"
        : "builder conversations";

  const hooks = [
    "Lab journal:",
    "Build note:",
    "Current experiment:",
    "Operator log:",
    "Distribution note:"
  ];
  const metrics = [
    `today the operator scanned ${scannedToday} posts, sent ${repliesToday} replies, and published ${postsToday} updates`,
    `the local trail now has ${sentTotal} sent replies and ${skippedTotal} decisions to skip`,
    `the loop is running at ${replyCadence}, with ${cadence}`,
    `the latest scan found ${connectionSignals} priority connection signals around ${dominantTopic}`,
    latestAnchor
      ? `the last useful connection signal was around "${latestAnchor}"`
      : `the latest dashboard trail shows ${recentActionsText || "a quiet system"}`
  ];
  const lessons = [
    "Distribution feels more like a system when every action leaves a receipt",
    "The hard part is not replying more, it is replying where there is real context",
    "Growth gets less mysterious when scanning, scoring, posting, and skipping are visible",
    "Automation becomes easier to trust when the defaults are small and inspectable",
    "The useful constraint is simple: meet builders without turning into noise",
    "The dashboard matters because it shows what the agent did and what it refused to do"
  ];
  const closers = [
    "Small loops, clear logs, better conversations.",
    "Trying to make consistency feel less random.",
    "This is the kind of distribution experiment I can actually inspect.",
    "The goal is more relevant conversations, not louder posting.",
    "Still tuning the line between useful automation and too much autonomy."
  ];
  const metric = pick(metrics, seed * 3);
  const formats = [
    `${pick(hooks, seed)} ${capitalizeFirst(metric)}.\n\n${pick(lessons, seed * 5)}.`,
    `${pick(hooks, seed)} ${pick(lessons, seed * 7)}.\n\nToday: ${pick(metrics, seed * 11)}.`,
    `${pick(hooks, seed)} ${capitalizeFirst(pick(metrics, seed * 13))}.\n\n${pick(closers, seed * 17)}`,
    `${pick(hooks, seed)} I am treating X growth like a local workflow: scan, score, reply, log, review.\n\n${capitalizeFirst(pick(metrics, seed * 19))}.`,
    `${pick(hooks, seed)} ${dominantTopic} keep showing up in the feed.\n\n${pick(lessons, seed * 23)}.`
  ].map((format) => format.replace("Today: today", "Today"));

  for (let offset = 0; offset < formats.length; offset += 1) {
    const candidate = trimReply(formats[(nextIndex + offset) % formats.length], 270);
    if (!usedPosts.has(candidate.toLowerCase())) return candidate;
  }

  return trimReply(`${pick(hooks, seed)} ${pick(metrics, seed * 29)}. ${pick(lessons, seed * 31)}.`, 270);
}

function mockReply(userContent: string): string {
  const postMatch = userContent.match(/Original post:\s*([\s\S]*?)(?:\n\nAuthor:|$)/i);
  const originalPost = postMatch?.[1]?.trim() || "";
  const lower = originalPost.toLowerCase();
  const globalState = globalThis as XOperatorGlobal;
  const replyIndex = (globalState[mockReplyIndexKey] ?? -1) + 1;
  globalState[mockReplyIndexKey] = replyIndex;
  const seed = hashText(originalPost) + replyIndex * 97;
  const specificReply = specificLocalReply(originalPost, lower, seed);
  if (specificReply) return specificReply;

  const topic = detectReplyTopic(lower);
  const intent = detectPostIntent(originalPost, lower);
  const style = detectReplyStyle(intent, seed);
  const anchor = extractAnchor(originalPost);

  return localReplyFromParts(topic, intent, style, anchor, seed);
}

function mockScore(userContent: string) {
  const scoredPost =
    userContent.match(/Text:\s*([\s\S]*?)\nMetrics:/i)?.[1]?.trim() ||
    userContent.match(/Post:\s*([\s\S]*?)(?:\n\nReturn JSON|$)/i)?.[1]?.trim() ||
    userContent;
  const lower = scoredPost.toLowerCase();
  const risky = [
    "politics",
    "religion",
    "medical",
    "legal",
    "tragedy",
    "adult",
    "harassment",
    "drama"
  ].filter((topic) => lower.includes(topic));

  if (risky.length > 0) {
    return {
      score: 1,
      reason: `Mock AI skipped this because it appears to touch forbidden topics: ${risky.join(", ")}.`,
      risk_flags: risky
    };
  }

  const relevantTerms = [
    "ai",
    "agent",
    "agents",
    "automation",
    "builder",
    "build",
    "claude",
    "codex",
    "coding",
    "developer",
    "gpt",
    "local",
    "operator",
    "product",
    "tool",
    "workflow"
  ];
  const matches = relevantTerms.filter((term) => containsTerm(scoredPost, term));
  const engagementSignals = [
    /\?/,
    /\b(which|what|why|how|thoughts|honest|team|vs|or)\b/i,
    /\b(building|shipping|launched|coding|developer|founder|product)\b/i,
    /\b(looking to connect|connect with|let['’]?s connect|say hi|say hello|grow together|buildinpublic|building in public)\b/i
  ].filter((pattern) => pattern.test(scoredPost));
  const spamSignals = [
    /\b(follow for follow|drop your|dm me|giveaway|airdrop|follower-to-following|gain followers)\b/i,
    /\$[A-Z]{2,8}\b/,
    /\b(token|crypto|trader|trading)\b/i
  ].filter((pattern) => pattern.test(scoredPost));
  const rawScore = matches.length > 0 ? 6 + matches.length + engagementSignals.length : 4 + engagementSignals.length;
  const spamPenalty = spamSignals.length * 4;
  const connectionOpportunity = isPriorityConnectionPost(scoredPost);
  const boostedScore = connectionOpportunity ? Math.max(rawScore, 9) : rawScore;
  const cappedScore = spamSignals.length > 0 ? Math.min(7, boostedScore - spamPenalty) : boostedScore;
  const score = Math.min(9, Math.max(1, cappedScore));

  return {
    score,
    reason: `Local score from relevance (${matches.join(", ") || "general builder topic"}), engagement signals (${engagementSignals.length}), connection opportunity (${connectionOpportunity ? "yes" : "no"}).`,
    risk_flags: []
  };
}

function mockText(messages: ChatMessage[]): string {
  const system = messages.find((message) => message.role === "system")?.content.toLowerCase() || "";
  const userContent = latestUserContent(messages);

  if (system.includes("replies")) return mockReply(userContent);
  return mockPost();
}

function getClient(): OpenAI {
  if (!config.openaiApiKey) {
    throw new Error("OPENAI_API_KEY is missing. Add it to .env before running an agent.");
  }

  if (!client) {
    client = new OpenAI({ apiKey: config.openaiApiKey });
  }

  return client;
}

export async function generateText(
  messages: ChatMessage[],
  options: { temperature?: number; maxTokens?: number } = {}
): Promise<string> {
  if (getEffectiveConfig().mockAiEnabled) return mockText(messages);

  const completion = await getClient().chat.completions.create({
    model: config.openaiModel,
    messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 300
  });

  const content = completion.choices[0]?.message?.content?.trim();
  if (!content) throw new Error("OpenAI returned an empty response.");

  return content;
}

function extractJson(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;

  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`OpenAI response did not contain JSON: ${trimmed.slice(0, 200)}`);

  return match[0];
}

export async function generateJson<T>(
  messages: ChatMessage[],
  options: { temperature?: number; maxTokens?: number } = {}
): Promise<T> {
  if (getEffectiveConfig().mockAiEnabled) return mockScore(latestUserContent(messages)) as T;

  const completion = await getClient().chat.completions.create({
    model: config.openaiModel,
    messages,
    temperature: options.temperature ?? 0.2,
    max_tokens: options.maxTokens ?? 400,
    response_format: { type: "json_object" }
  });

  const content = completion.choices[0]?.message?.content?.trim();
  if (!content) throw new Error("OpenAI returned an empty JSON response.");

  return JSON.parse(extractJson(content)) as T;
}
