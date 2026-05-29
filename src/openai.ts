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

function mockPost(): string {
  const posts = [
    "The useful version of a personal AI operator is not flashy. It watches a small workflow, keeps a local trail, and stops cleanly when you ask it to.",
    "I keep coming back to this: automation needs an off switch as much as it needs a clever model.",
    "A good personal agent should feel inspectable. You should know what it saw, what it decided, and what it did before you trust it with more.",
    "Local-first automation makes experimentation calmer. Break something, inspect the logs, reset the state, try again.",
    "The hardest part of useful AI automation is not generating text. It is deciding when doing nothing is the better action."
  ];

  const globalState = globalThis as XOperatorGlobal;
  const nextIndex = ((globalState[mockPostIndexKey] ?? -1) + 1) % posts.length;
  globalState[mockPostIndexKey] = nextIndex;

  return posts[nextIndex];
}

function mockReply(userContent: string): string {
  const postMatch = userContent.match(/Original post:\s*([\s\S]*?)(?:\n\nAuthor:|$)/i);
  const originalPost = postMatch?.[1]?.trim() || "";

  if (originalPost.toLowerCase().includes("local")) {
    return "The local-first part matters. It makes the system easier to inspect, pause, and trust before it gets any real autonomy.";
  }

  return "This is the right shape: keep the automation small, observable, and easy to interrupt before making it more capable.";
}

function mockScore(userContent: string) {
  const lower = userContent.toLowerCase();
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

  const relevantTerms = ["ai", "agent", "automation", "local", "workflow", "operator", "tool"];
  const matches = relevantTerms.filter((term) => lower.includes(term));
  const score = Math.min(9, Math.max(5, 5 + matches.length));

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
