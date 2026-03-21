/**
 * Independent MAS — n parallel agents + synthesis-only aggregation.
 *
 *   A = {a1, ..., an, a_agg}
 *   C = {(ai, a_agg)}           agent → aggregator only, no peer links
 *   Ω = synthesis_only           concatenate all, then one aggregation call
 *   Complexity: O(nk) + O(1)
 */

import { type CopilotClient } from "@github/copilot-sdk";
import { BaseAgent, type Question } from "./base.js";

const AGENT_SYSTEM = "You are a helpful assistant.";

const AGGREGATOR_SYSTEM =
  "You are an aggregator. You receive multiple independent analyses of the " +
  "same question. Synthesise them into a single, coherent response.\n\n" +
  "Rules:\n" +
  "- If ANY agent flagged the question as nonsensical with specific reasoning, " +
  "give that signal strong weight.\n" +
  "- Do not water down clear pushback into hedging.\n" +
  "- Produce a single final response as if you were directly answering the user.";

export class IndependentAgent extends BaseAgent {
  readonly topology = "independent";
  private numAgents: number;

  constructor(model: string, client: CopilotClient, numAgents = 3) {
    super(model, client);
    this.numAgents = numAgents;
  }

  async respond(question: Question): Promise<string> {
    const userMsg = question.question;

    // Phase 1: n independent calls in parallel
    const proposals = await Promise.allSettled(
      Array.from({ length: this.numAgents }, () =>
        this.call(AGENT_SYSTEM, [{ role: "user", content: userMsg }])
      )
    );

    const texts = proposals.map((p, i) =>
      p.status === "fulfilled"
        ? p.value
        : `[Agent ${i + 1} failed: ${(p as PromiseRejectedResult).reason}]`
    );

    if (texts.every((t) => t.startsWith("[Agent"))) {
      return texts[0] ?? "[All agents failed]";
    }

    // Phase 2: synthesis_only aggregation
    const synthesis = texts
      .map((t, i) => `=== Agent ${i + 1} ===\n${t}`)
      .join("\n\n");

    return this.call(AGGREGATOR_SYSTEM, [
      {
        role: "user",
        content:
          `Original question:\n${userMsg}\n\n` +
          `Agent responses:\n${synthesis}\n\n` +
          "Synthesise these into a single final response.",
      },
    ]);
  }
}
