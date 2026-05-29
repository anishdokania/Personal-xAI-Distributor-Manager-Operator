import OpenAI from "openai";
import { config } from "./config";
import { getEffectiveConfig } from "./db";

type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

let client: OpenAI | null = null;

const mockPostIndexKey = "__personalXOperatorMockPostIndex";

type XOperatorGlobal = typeof globalThis & {
  [mockPostIndexKey]?: number;
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

function mockPost(): string {
  const curatedPosts = [
    "The useful version of a personal AI operator is not flashy. It watches a small workflow, keeps a local trail, and stops cleanly when you ask it to.",
    "I keep coming back to this: automation needs an off switch as much as it needs a clever model.",
    "A good personal agent should feel inspectable. You should know what it saw, what it decided, and what it did before you trust it with more.",
    "Local-first automation makes experimentation calmer. Break something, inspect the logs, reset the state, try again.",
    "The hardest part of useful AI automation is not generating text. It is deciding when doing nothing is the better action.",
    "A tiny agent that handles one boring workflow reliably is more useful than a big agent that surprises you twice a day.",
    "The best automation logs feel like a receipt. Clear inputs, clear decisions, clear actions, no mystery theater.",
    "I trust automation faster when it admits uncertainty and leaves the final switch easy to reach.",
    "A personal operator should earn autonomy in layers: draft first, suggest next, act only after the boring parts are proven.",
    "The most underrated agent feature is a pause button that actually pauses everything.",
    "Good AI tooling should make the user feel more aware of the system, not less responsible for it.",
    "A practical agent needs memory, but it also needs boundaries. Remember the work, forget the noise.",
    "I like automation that starts narrow enough to debug with a cup of coffee and a log file.",
    "The local-first version of an agent feels less magical, which is exactly why it is easier to trust.",
    "If an agent cannot explain why it acted, it should probably stay in draft mode.",
    "Small workflows are where agents get interesting. Scheduling, scanning, sorting, drafting, nudging.",
    "A useful operator is less like a genius assistant and more like a patient process that does not lose context.",
    "The goal is not to remove the human. The goal is to remove the repetitive tab-opening tax.",
    "I want agents that ask for less attention without asking for blind trust.",
    "A good automation system should make failure boring: logged, recoverable, and obvious.",
    "The first version of any agent should be embarrassingly inspectable.",
    "There is a quiet kind of leverage in tools that just remember what happened yesterday.",
    "The best personal AI products may look unimpressive at first because they are busy being accountable.",
    "Autonomy without observability is just suspense wearing a productivity hat.",
    "A personal AI workflow becomes useful when you can see the whole loop: context, decision, action, result.",
    "The safest agent is often the one that knows when to stop and leave a draft.",
    "I would rather have an agent do three things transparently than thirty things mysteriously.",
    "Local data changes the feel of automation. It becomes a workspace you can inspect, not a service you hope behaved.",
    "The boring parts of agent design are the product: limits, logs, retries, settings, and review states.",
    "The best AI operator is not always the most autonomous one. Sometimes it is the one with the clearest handoff.",
    "Useful automation starts by respecting friction. Some friction is waste, some is judgment.",
    "I keep noticing that the agents people actually use are the ones that fit into existing routines quietly.",
    "A good personal agent should be easy to interrupt, easy to audit, and hard to accidentally unleash.",
    "The magic is not the model call. The magic is the loop around it: memory, policy, browser state, and a clean record.",
    "Every agent should have a paper trail before it gets a longer leash.",
    "The more an automation touches a real account, the more boring its defaults should be.",
    "Agent design gets better when you treat doing nothing as a valid output.",
    "The real test for an operator is not whether it can act. It is whether it can act with restraint.",
    "A clean dashboard with honest status beats a clever system that hides the messy parts.",
    "The best personal automation feels like a second pair of hands, not a second personality.",
    "I am more interested in agents that reduce daily drag than agents that perform intelligence.",
    "The future I want is full of small local operators quietly handling chores I used to reopen tabs for.",
    "A reliable agent is allowed to be boring. In fact, that might be the point.",
    "Before giving an agent more power, I want to see how it behaves when the answer is no."
  ];

  const globalState = globalThis as XOperatorGlobal;
  const nextIndex = (globalState[mockPostIndexKey] ?? -1) + 1;
  globalState[mockPostIndexKey] = nextIndex;

  if (nextIndex < curatedPosts.length) return curatedPosts[nextIndex];

  const subjects = [
    "personal AI operators",
    "local-first automation",
    "browser agents",
    "small workflow tools",
    "agent dashboards",
    "AI-assisted routines",
    "local memory",
    "browser automation"
  ];
  const observations = [
    "work best when the loop is visible",
    "get safer when every action leaves a trail",
    "become useful when they remove one repeated decision",
    "need boring controls more than clever demos",
    "should start with drafts before they earn autonomy",
    "are easier to trust when failure is easy to inspect",
    "feel better when the human can interrupt at any point",
    "should make context easier to carry, not harder to audit"
  ];
  const endings = [
    "That is the difference between automation and surprise.",
    "Small, observable wins compound faster than giant leaps.",
    "I would rather debug a simple loop than admire a mysterious one.",
    "The quiet details are usually the product.",
    "The goal is less tab-opening, not less judgment.",
    "That is where trust starts to become practical."
  ];
  const seed = nextIndex - curatedPosts.length;

  return `${pick(subjects, seed)} ${pick(observations, seed * 3)}. ${pick(endings, seed * 7)}`;
}

function mockReply(userContent: string): string {
  const postMatch = userContent.match(/Original post:\s*([\s\S]*?)(?:\n\nAuthor:|$)/i);
  const originalPost = postMatch?.[1]?.trim() || "";
  const lower = originalPost.toLowerCase();
  const seed = hashText(originalPost);

  if (lower.includes("$20") || lower.includes("20") && (lower.includes("claude") || lower.includes("codex"))) {
    return pick(
      [
        "If I only had $20, I would pick the one that fits the workflow I repeat daily. The model matters, but the feedback loop matters more.",
        "At that price point I would optimize for the tool I actually open every day, not the one with the flashiest benchmark.",
        "I would choose based on where the friction is: planning, editing, review, or shipping. The best $20 depends on the bottleneck."
      ],
      seed
    );
  }

  if (lower.includes("team claude") || lower.includes("team chatgpt")) {
    return pick(
      [
        "I am less loyal to a team than to the loop: fast edits, visible diffs, and enough context that I can still reason about the change.",
        "For me it comes down to the task. Some tools are better thinking partners, others are better at staying inside the code loop.",
        "The winner is usually whichever one helps me keep momentum without losing review discipline."
      ],
      seed
    );
  }

  if (lower.includes("vibe coding")) {
    return pick(
      [
        "For vibe coding, the tool matters less than whether it keeps you in review mode. Fast generation is great until you stop reading the diff.",
        "The best version of vibe coding still has a review loop. The danger starts when the speed makes you stop checking assumptions.",
        "It works best when it feels like fast iteration, not blind acceptance."
      ],
      seed
    );
  }

  if (lower.includes("weekly limit") || lower.includes("limit")) {
    return "The usage limit pain is real. It is one reason local workflows and clear fallback tools become more valuable over time.";
  }

  if (lower.includes("audience") && lower.includes("product")) {
    return "The product compounds if it solves a real problem. The audience compounds if it keeps you honest about which problem matters.";
  }

  if (includesAny(lower, ["local", "github", "gitlab", "bitbucket", "repo", "repository"])) {
    return pick(
      [
        "The local-first part matters. It makes the system easier to inspect, pause, and trust before it gets any real autonomy.",
        "I like keeping the source of truth somewhere boring and inspectable. It makes automation feel much less fragile.",
        "The storage choice matters less than whether the workflow is recoverable when something goes sideways."
      ],
      seed
    );
  }

  if (includesAny(lower, ["claude", "codex", "chatgpt", "gpt", "cursor"])) {
    return pick(
      [
        "I think the honest answer is workflow-specific. The better tool is usually the one that keeps more context without hiding what changed.",
        "The interesting question is not which model is smartest, but which one helps you finish the loop with fewer hidden assumptions.",
        "I keep coming back to context plus control. If a tool gives me both, it usually wins the workflow."
      ],
      seed
    );
  }

  if (lower.includes("building") || lower.includes("build")) {
    return pick(
      [
        "Small practical tools are underrated. The useful ones usually start as one annoying workflow made a little less manual.",
        "The best things to build are often painfully specific at first. That is what makes them easy to test honestly.",
        "I like builds that start with a narrow workflow. You learn faster when the surface area is small."
      ],
      seed
    );
  }

  if (lower.includes("subscription") || lower.includes("price") || lower.includes("cost")) {
    return "This is why I keep getting pulled toward local-first tools. Predictable cost and inspectable state matter more over time.";
  }

  if (lower.includes("engineering") || lower.includes("developer") || lower.includes("code")) {
    return pick(
      [
        "It feels more fun when the tool handles setup and repetition, but less fun when it hides the reasoning you need to learn from.",
        "The sweet spot is when the tool removes drag but still leaves you close enough to understand the system.",
        "Developer tools get better when they preserve judgment instead of only optimizing for speed."
      ],
      seed
    );
  }

  if (lower.includes("ai")) {
    return pick(
      [
        "The useful version is usually narrower than the hype: one clear task, visible tradeoffs, and a human still able to steer.",
        "AI feels most useful to me when it shortens a loop I already understand instead of inventing a vague new one.",
        "The practical edge is not magic. It is faster iteration with enough visibility to keep your judgment involved."
      ],
      seed
    );
  }

  return "This is the right shape: keep the automation small, observable, and easy to interrupt before making it more capable.";
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
    "automation",
    "claude",
    "codex",
    "gpt",
    "local",
    "operator",
    "product",
    "tool",
    "workflow"
  ];
  const matches = relevantTerms.filter((term) => lower.includes(term));
  const score = matches.length > 0 ? Math.min(9, 7 + matches.length) : 5;

  return {
    score,
    reason: `Mock AI score based on local keyword relevance: ${matches.join(", ") || "general builder topic"}.`,
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
