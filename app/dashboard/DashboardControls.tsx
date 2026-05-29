"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type DashboardControlsProps = {
  autoPostEnabled: boolean;
  autoReplyEnabled: boolean;
  mockAiEnabled: boolean;
};

async function postJson(url: string, body?: unknown): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || `Request failed with ${response.status}`);
  }

  return data;
}

export default function DashboardControls({
  autoPostEnabled,
  autoReplyEnabled,
  mockAiEnabled
}: DashboardControlsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function run(label: string, task: () => Promise<unknown>, successMessage?: string) {
    setBusy(label);
    setMessage("");

    try {
      await task();
      setMessage(successMessage || `${label} completed.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid">
      <div className="actions">
        <button
          className="primary"
          disabled={Boolean(busy)}
          onClick={() => run("Post agent", () => postJson("/api/agents/post"))}
        >
          Run post agent now
        </button>
        <button
          className="primary"
          disabled={Boolean(busy)}
          onClick={() => run("Reply agent", () => postJson("/api/agents/reply"))}
        >
          Run reply agent now
        </button>
        <button
          disabled={Boolean(busy)}
          onClick={() =>
            run(
              "X browser",
              () => postJson("/api/x/open"),
              "X browser launched. Look for the separate Chromium window."
            )
          }
        >
          Open X browser
        </button>
        <button
          disabled={Boolean(busy)}
          onClick={() =>
            run(mockAiEnabled ? "Local curator disabled" : "Local curator enabled", () =>
              postJson("/api/settings/mock-ai", { enabled: !mockAiEnabled })
            )
          }
        >
          {mockAiEnabled ? "Use OpenAI" : "Use local curator"}
        </button>
        <button
          disabled={Boolean(busy)}
          onClick={() =>
            run(autoPostEnabled ? "Auto-post paused" : "Auto-post resumed", () =>
              postJson("/api/settings/autopost", { enabled: !autoPostEnabled })
            )
          }
        >
          {autoPostEnabled ? "Pause auto-post" : "Resume auto-post"}
        </button>
        <button
          disabled={Boolean(busy)}
          onClick={() =>
            run(autoReplyEnabled ? "Auto-reply paused" : "Auto-reply resumed", () =>
              postJson("/api/settings/autoreply", { enabled: !autoReplyEnabled })
            )
          }
        >
          {autoReplyEnabled ? "Pause auto-reply" : "Resume auto-reply"}
        </button>
      </div>
      <p className={message.toLowerCase().includes("failed") || message.toLowerCase().includes("error") ? "status-text error" : "status-text"}>
        {busy ? `${busy} running...` : message}
      </p>
    </div>
  );
}
