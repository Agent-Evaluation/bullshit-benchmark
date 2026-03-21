/**
 * Shared Copilot SDK wrapper and base class for all agent topologies.
 * Uses @github/copilot-sdk for LLM calls — no raw API keys needed.
 */

import {
  CopilotClient,
  type CopilotSession,
  approveAll,
  type AssistantMessageEvent,
} from "@github/copilot-sdk";

// ── Types ────────────────────────────────────────────────────────────────────

export interface Question {
  id: string;
  question: string;
  nonsensical_element: string;
  domain: string;
  domain_group: string;
  technique: string;
  is_control: boolean;
  [key: string]: unknown;
}

// ── Copilot helpers ──────────────────────────────────────────────────────────

const MAX_RETRIES = 5;
const INITIAL_RETRY_DELAY = 5_000; // ms
const INTER_REQUEST_DELAY = 2_000; // ms

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Build a single prompt string from a system message + conversation turns.
 * The Copilot SDK session.sendAndWait takes a single prompt string,
 * so we pack the conversation context into it.
 */
function buildPrompt(
  systemPrompt: string,
  messages: Array<{ role: string; content: string }>
): string {
  const parts = [`[System Instructions]\n${systemPrompt}\n`];
  for (const msg of messages) {
    if (msg.role === "user") {
      parts.push(`[User]\n${msg.content}\n`);
    } else if (msg.role === "assistant" || msg.role === "model") {
      parts.push(`[Assistant]\n${msg.content}\n`);
    }
  }
  parts.push("[Your Response]");
  return parts.join("\n");
}

/**
 * Call a model via the Copilot SDK with retry + rate-limiting logic.
 * Mirrors the Python call_copilot_with_retry from plancraft.
 */
export async function callCopilot(
  client: CopilotClient,
  model: string,
  systemPrompt: string,
  messages: Array<{ role: string; content: string }>,
  timeout = 60_000
): Promise<string> {
  await sleep(INTER_REQUEST_DELAY);

  const fullPrompt = buildPrompt(systemPrompt, messages);
  let retries = 0;
  let delay = INITIAL_RETRY_DELAY;
  let lastError: Error | null = null;

  while (retries < MAX_RETRIES) {
    let session: CopilotSession | null = null;
    try {
      session = await client.createSession({
        model,
        onPermissionRequest: approveAll,
        systemMessage: { mode: "replace", content: systemPrompt },
      });

      const response: AssistantMessageEvent | undefined =
        await session.sendAndWait({ prompt: fullPrompt }, timeout);

      if (response?.data?.content) {
        return response.data.content.trim();
      }
      throw new Error("Empty response from Copilot SDK");
    } catch (err) {
      const errStr = String(err);
      if (errStr.includes("429") || errStr.toLowerCase().includes("rate")) {
        console.log(
          `  ⏳ Rate limited. Retrying in ${delay}ms... (attempt ${retries + 1}/${MAX_RETRIES})`
        );
      } else if (err instanceof Error && err.name === "TimeoutError") {
        console.log(
          `  ⏳ Timed out. Retrying in ${delay}ms... (attempt ${retries + 1}/${MAX_RETRIES})`
        );
      } else {
        console.log(
          `  ⚠ Copilot error (attempt ${retries + 1}/${MAX_RETRIES}): ${errStr}`
        );
      }
      lastError = err instanceof Error ? err : new Error(errStr);
    } finally {
      if (session) {
        try {
          await session.disconnect();
        } catch {
          // ignore cleanup errors
        }
      }
    }

    retries++;
    if (retries < MAX_RETRIES) {
      await sleep(delay);
      delay *= 2;
    }
  }

  throw lastError ?? new Error("Copilot call failed after max retries.");
}

// ── Base agent ───────────────────────────────────────────────────────────────

export abstract class BaseAgent {
  abstract readonly topology: string;

  constructor(
    protected model: string,
    protected client: CopilotClient
  ) {}

  /** Single LLM call helper. */
  protected call(
    systemPrompt: string,
    messages: Array<{ role: string; content: string }>,
    opts?: { model?: string; timeout?: number }
  ): Promise<string> {
    return callCopilot(
      this.client,
      opts?.model ?? this.model,
      systemPrompt,
      messages,
      opts?.timeout
    );
  }

  /** Return the final response text for a benchmark question. */
  abstract respond(question: Question): Promise<string>;
}
