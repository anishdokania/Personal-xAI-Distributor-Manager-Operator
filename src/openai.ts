import OpenAI from "openai";
import { config } from "./config";
import { getEffectiveConfig, recentPosts } from "./db";

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

type LocalReplyTopic =
  | "connection"
  | "tool_choice"
  | "vibe_coding"
  | "source_control"
  | "building"
  | "cost"
  | "dev_workflow"
  | "ai_general";

type LocalPostIntent = "question" | "comparison" | "complaint" | "launch" | "advice" | "opinion";
type LocalReplyStyle = "answer" | "nuance" | "counterpoint" | "principle" | "question";

function hasConnectionSignal(text: string): boolean {
  return /\b(looking to connect|connect with|let['’]?s connect|say hi|say hello|building in|people interested in|builders in)\b/i.test(text);
}

function hasConnectionRelevance(text: string): boolean {
  return /\b(ai|agents?|automation|saas|startup|founders?|builders?|developers?|devs?|indie hackers?|product|shipping|coding|full stack|backend|frontend|devops|tools?)\b/i.test(text);
}

function isBadConnectionPost(text: string): boolean {
  return /\b(follow|drop yours?|let['’]?s grow|grow together|dm me|giveaway|airdrop|follower-to-following|gain followers|crypto|token|traders?|trading)\b/i.test(text);
}

function detectReplyTopic(lower: string): LocalReplyTopic {
  if (hasConnectionSignal(lower) && hasConnectionRelevance(lower)) return "connection";
  if (includesAny(lower, ["subscription", "price", "cost", "$", "plan", "limit"])) return "cost";
  if (includesAny(lower, ["claude", "codex", "chatgpt", "gpt", "cursor", "model"])) return "tool_choice";
  if (lower.includes("vibe coding") || lower.includes("vibecoder")) return "vibe_coding";
  if (includesAny(lower, ["local", "github", "gitlab", "bitbucket", "repo", "repository"])) return "source_control";
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
  const base = `${opening}${shouldUseAnchor ? anchorLine : " "}${insight}`;
  const withEnding = ending ? `${base} ${ending}` : base;

  return withEnding.length <= 230 ? withEnding : trimReply(base);
}

function specificLocalReply(originalPost: string, lower: string, seed: number): string | null {
  if (hasConnectionSignal(lower) && hasConnectionRelevance(lower) && !isBadConnectionPost(lower)) {
    return pick(
      [
        "Good crowd to be around. I’m building in the local AI operator / browser automation lane, especially the boring parts: logs, limits, review, and safe autonomy.",
        "Same orbit here: AI tools, browser automation, and local-first agents. I’m most interested in systems that are useful before they are flashy.",
        "This is my lane too: AI agents, practical automation, and small tools that remove daily friction without becoming black boxes.",
        "I’m in the AI automation corner as well. The work I find most interesting is turning messy browser workflows into inspectable loops."
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
  const usedPosts = new Set(recentPosts(200).map((post) => post.content.trim().toLowerCase()));

  for (let offset = 0; offset < curatedPosts.length; offset += 1) {
    const candidate = curatedPosts[(nextIndex + offset) % curatedPosts.length];
    if (!usedPosts.has(candidate.toLowerCase())) return candidate;
  }

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
  const seed = Math.max(0, nextIndex - curatedPosts.length + usedPosts.size);

  return `${pick(subjects, seed)} ${pick(observations, seed * 3)}. ${pick(endings, seed * 7)}`;
}

function mockReply(userContent: string): string {
  const postMatch = userContent.match(/Original post:\s*([\s\S]*?)(?:\n\nAuthor:|$)/i);
  const originalPost = postMatch?.[1]?.trim() || "";
  const lower = originalPost.toLowerCase();
  const seed = hashText(originalPost);
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
    /\b(looking to connect|connect with|let['’]?s connect|say hi|say hello)\b/i
  ].filter((pattern) => pattern.test(scoredPost));
  const spamSignals = [
    /\b(follow|drop your|let['’]?s grow|grow together|dm me|giveaway|airdrop|follower-to-following|gain followers)\b/i,
    /\$[A-Z]{2,8}\b/,
    /\b(token|crypto|trader|trading)\b/i
  ].filter((pattern) => pattern.test(scoredPost));
  const rawScore = matches.length > 0 ? 6 + matches.length + engagementSignals.length : 4 + engagementSignals.length;
  const spamPenalty = spamSignals.length * 4;
  const connectionOpportunity =
    hasConnectionSignal(scoredPost) && hasConnectionRelevance(scoredPost) && !isBadConnectionPost(scoredPost);
  const boostedScore = connectionOpportunity ? Math.max(rawScore, 8 + Math.min(1, matches.length)) : rawScore;
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
