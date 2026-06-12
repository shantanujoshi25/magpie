# 02 — The Guild Agent

**Goal:** a deployed Guild agent that takes a clipboard snippet as text input and returns a JSON blob with `notebook`, `snippet_type`, `key_insight`, and `tokens_estimated`.

**Time budget:** 60 minutes including the first end-to-end thin-slice test.

---

## What you're building

An `llmAgent` (Guild's simplest agent type). Per the SDK, every `llmAgent` has fixed schemas:

```typescript
type Input  = { type: "text"; text: string }
type Output = { type: "text"; text: string }
```

So the watcher will send the snippet as plain text, and the agent will return a **JSON-encoded string** that the watcher parses. We use `mode: "one-shot"` because each snippet is a single classify-and-return call (not a conversation).

---

## Step 1 — Replace `agent.ts` with this

Inside `magpie-agent/`, open `agent.ts` and replace its entire contents with:

```typescript
import { llmAgent, guildTools } from "@guildai/agents-sdk"

const systemPrompt = `
You are Magpie, an ambient study agent. The user is studying from
multiple online sources and copying snippets to their clipboard. You
receive ONE snippet at a time and decide where it belongs.

For each snippet you receive, return a single JSON object — and ONLY
that JSON object, no prose, no markdown fences, no explanation. The
JSON must be on a single line so it can be parsed mechanically.

Schema of the JSON you must return:
{
  "notebook": string,         // a short topic name, 1-3 words, Title Case.
                              //   Examples: "Linear Algebra", "Sliding Window",
                              //   "System Design", "Hindu Astrology".
                              //   Pick from a small, stable set. If the snippet
                              //   clearly extends a previous topic, REUSE that
                              //   topic name verbatim. Only invent a new one
                              //   when nothing fits.
  "snippet_type": string,     // one of: "definition", "example", "formula",
                              //   "quote", "image", "other"
  "key_insight": string,      // ONE sentence (max ~140 chars) capturing why
                              //   this snippet matters. Plain prose, no
                              //   bullet points, no markdown.
  "tokens_estimated": number  // rough token count of the snippet itself.
                              //   Estimate as ceil(chars / 4).
}

Rules:
- Output ONLY the JSON object. No prefix, no suffix.
- Never wrap in backticks.
- If the snippet is an image, set snippet_type="image" and put a brief
  description in key_insight.
- If the snippet is very short or ambiguous, still pick a notebook —
  use "Misc" only as a last resort.
- Reuse notebook names. Consistency matters more than precision.
`

export default llmAgent({
  description: "Classifies a study snippet and assigns it to a notebook.",
  tools: { ...guildTools },
  systemPrompt,
  mode: "one-shot",
})
```

Key things about this code:
- `mode: "one-shot"` — one call in, one response out, session ends.
- `guildTools` is included so the agent can request credentials if needed (none required for this task, but good hygiene).
- The whole reasoning is in the prompt. No TypeScript logic.
- We ask for **JSON-as-text** because `llmAgent` outputs are typed as `text`. The watcher parses it.

---

## Step 2 — Test locally

```bash
guild agent test
```

When the chat opens, paste a sample snippet, for example:

```
In linear algebra, an eigenvector of a linear transformation is a nonzero vector that changes at most by a scalar factor when that linear transformation is applied to it.
```

Expected output (one line of JSON, no prose):

```json
{"notebook":"Linear Algebra","snippet_type":"definition","key_insight":"An eigenvector's direction is preserved under a linear transformation, only its magnitude scales.","tokens_estimated":48}
```

Try 3–5 more snippets across different topics. Verify:
- It returns JSON only, no surrounding text or backticks.
- The same topic gets the same `notebook` name (consistency check).
- `snippet_type` is one of the allowed values.

If it adds prose around the JSON, **strengthen the "ONLY JSON" line in the prompt** and retest. Don't move on until it's clean.

---

## Step 3 — Test the one-shot CLI invocation (the path the watcher will use)

```bash
guild chat --once "In linear algebra, an eigenvector is a nonzero vector..." --agent magpie-agent
```

This should print **just the JSON line** to stdout. If it prints any framing prose, you have two options:

1. Tighten the system prompt.
2. Post-process in Python (extract the first `{...}` block with a regex). This is the safety net the watcher will use anyway.

Either way, confirm `guild chat --once` works because **that's how the watcher invokes the agent**.

---

## Step 4 — Save (don't publish yet)

```bash
guild agent save --message "Magpie agent v1: classify snippets to notebooks"
```

Do NOT pass `--publish` yet. You'll publish in file 04 after the full pipeline is green.

---

## Acceptance check before moving on

All of these must pass:

- [ ] `guild agent test` returns one-line JSON for every snippet, no prose around it
- [ ] The same topic returns the same `notebook` name across 3+ different snippets
- [ ] `guild chat --once "..." --agent magpie-agent` prints JSON to stdout
- [ ] `guild agent save` succeeded with no validation errors

If any of these fail, fix it before opening `03-watcher.md`. The watcher assumes this command works.

---

## Notes for later (file 04)

- We'll add **Langfuse tracing** to the LLM calls in file 04 for the bonus.
- We'll **publish to the Agent Hub** in file 04 for the demo beat.
- If you find yourself wanting tools (web search, GitHub, etc.) — don't add them now. Classification doesn't need them and they slow the response.
