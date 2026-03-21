/**
 * Single Agent System (SAS) — baseline topology.
 *
 *   A = {a}
 *   C = ∅
 *   Ω = direct
 *   Complexity: O(k)
 */

import { BaseAgent, type Question } from "./base.js";

const SYSTEM_PROMPT = "You are a helpful assistant.";

export class SingleAgent extends BaseAgent {
  readonly topology = "single";

  async respond(question: Question): Promise<string> {
    return this.call(SYSTEM_PROMPT, [
      { role: "user", content: question.question },
    ]);
  }
}
