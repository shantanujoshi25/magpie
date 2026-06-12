import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const GUILD_API = "https://app.guild.ai";
const WORKSPACE_ID = "019ebda2-9be4-3bb9-0000-c555b07ccd18";
const OWNER_PREFIX = "shanjoshi25~";

let cachedToken: string | null = null;

/**
 * Bearer token for the Guild HTTP API. Prefers GUILD_TOKEN env var (fast,
 * deterministic for the demo); falls back to `guild auth token` subprocess.
 * Cached in-process; cleared on a 401 so the next call refetches.
 */
async function getToken(): Promise<string> {
  if (process.env.GUILD_TOKEN) return process.env.GUILD_TOKEN;
  if (cachedToken) return cachedToken;
  const { stdout } = await execFileAsync("guild", ["auth", "token"]);
  cachedToken = stdout.trim();
  return cachedToken;
}

interface AgentEvent {
  type?: string;
  content?: unknown;
}

/**
 * Walk the session events and return the agent's final reply text, or null if
 * the run hasn't finished. The final answer is the last `runtime_done` event
 * carrying a non-empty `content.text`.
 */
export function extractAgentReply(items: AgentEvent[]): string | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const e = items[i];
    if (e.type !== "runtime_done") continue;
    const c = e.content;
    if (c && typeof c === "object" && "text" in c) {
      const text = (c as { text?: unknown }).text;
      if (typeof text === "string" && text.trim()) return text.trim();
    }
  }
  return null;
}

export interface AskOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
}

/**
 * Invoke a published Guild agent over HTTP and return its reply text.
 * Creates a chat session with the prompt, then polls events until the agent's
 * final `runtime_done` reply appears.
 */
export async function askGuildAgent(
  agentName: string,
  prompt: string,
  opts: AskOptions = {}
): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? 45000;
  const pollIntervalMs = opts.pollIntervalMs ?? 1000;
  const agentId = agentName.includes("~") ? agentName : OWNER_PREFIX + agentName;

  const token = await getToken();
  const authHeaders = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const createRes = await fetch(
    `${GUILD_API}/api/workspaces/${WORKSPACE_ID}/sessions`,
    {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        initial_prompt: prompt,
        session_type: "chat",
        agent_id: agentId,
      }),
    }
  );

  if (createRes.status === 401) {
    cachedToken = null;
    throw new Error(
      "Guild auth failed (401). Refresh the token: run `guild auth token` and set GUILD_TOKEN."
    );
  }
  if (!createRes.ok) {
    throw new Error(
      `Guild session create failed: ${createRes.status} ${await createRes.text()}`
    );
  }

  const { id: sessionId } = (await createRes.json()) as { id: string };

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollIntervalMs));
    const evRes = await fetch(`${GUILD_API}/api/sessions/${sessionId}/events`, {
      headers: authHeaders,
    });
    if (!evRes.ok) continue;
    const { items } = (await evRes.json()) as { items: AgentEvent[] };
    const reply = extractAgentReply(items ?? []);
    if (reply) return reply;
  }

  throw new Error(`Guild agent ${agentName} timed out after ${timeoutMs}ms`);
}

/**
 * Parse an agent reply as JSON, tolerating accidental prose/fences and the
 * agent's habit of dropping underscores in keys (snippettype -> snippet_type).
 */
export function parseAgentJson<T = Record<string, unknown>>(reply: string): T {
  let s = reply.trim();
  // strip markdown fences if present
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  // extract the first {...} block
  const block = s.match(/\{[\s\S]*\}/);
  if (block) s = block[0];

  const raw = JSON.parse(s) as Record<string, unknown>;
  const normalized: Record<string, unknown> = {};
  const aliases: Record<string, string> = {
    snippettype: "snippet_type",
    keyinsight: "key_insight",
    tokensestimated: "tokens_estimated",
  };
  for (const [k, v] of Object.entries(raw)) {
    normalized[aliases[k] ?? k] = v;
  }
  return normalized as T;
}
