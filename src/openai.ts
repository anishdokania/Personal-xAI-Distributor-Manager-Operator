import OpenAI from "openai";
import { config } from "./config";

type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

let client: OpenAI | null = null;

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
