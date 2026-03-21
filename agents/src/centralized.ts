/**
 * Centralized MAS — orchestrator directs n workers hierarchically.
 *
 *   A = {a_orch, a1, ..., an}
 *   C = {(a_orch, ai) ∀i}       star topology, orchestrator hub
 *   Ω = hierarchical             directive → workers → synthesis
 *   Complexity: O(rnk) + O(r)   (r rounds)
 */

import { type CopilotClient } from "@github/copilot-sdk";
import { BaseAgent, type Question } from "./base.js";

const ORCH_DIRECTIVE_SYSTEM =
  "You are the orchestrator of a multi-agent evaluation system. You receive " +
  "questions that may or may not be nonsensical. Your job is to issue a " +
  "directive that tells your worker agents what to look for.\n\n" +
  "Analyse the question and produce a directive with:\n" +
  "1. A brief analysis of what the question is asking.\n" +
  "2. Specific angles each worker should investigate:\n" +
  "   - Worker 1: Check whether the core terminology is applied correctly.\n" +
  "   - Worker 2: Check whether the premise/framework actually exists.\n" +
  "   - Worker 3: Attempt to answer the question at face value.\n" +
  "3. Flag any red flags you notice (invented terms, cross-domain leaps, etc.).\n\n" +
  "Output your directive as plain text. Do NOT answer the question yourself yet.";

const ORCH_SYNTHESIS_SYSTEM =
  "You are the orchestrator. Your workers have analysed a question from " +
  "different angles. Based on their findings, produce the final response.\n\n" +
  "Rules:\n" +
  "- If workers found that terminology is misapplied or frameworks are " +
  "fabricated, the final response MUST flag this clearly.\n" +
  "- Do not ignore worker findings that identify incoherence.\n" +
  "- Respond as if you are directly answering the user.";

const WORKER_ASSIGNMENTS = [
  "Check whether the core terminology in this question is being used " +
    "correctly. Are domain-specific terms applied to the right domain? " +
    "Are there terms being used outside their normal context?",
  "Check whether the framework, methodology, or concept referenced in " +
    "the question actually exists. Is this a real, established concept, " +
    "or does it sound plausible but might be fabricated?",
  "Try to answer this question at face value. As you do, note any " +
    "difficulties — does the question actually make logical sense? " +
    "Can you construct a coherent answer?",
];

function workerSystem(id: number, assignment: string): string {
  return (
    `You are Worker ${id} in a multi-agent evaluation system. You are ` +
    "analysing a question based on a directive from the orchestrator.\n\n" +
    `Your assignment: ${assignment}\n\n` +
    "Provide your analysis. Be specific — cite concrete reasons if you think " +
    "something is wrong. If everything checks out, say so. Do NOT provide a " +
    "full answer to the question; just share your analytical findings."
  );
}

export class CentralizedAgent extends BaseAgent {
  readonly topology = "centralized";
  private numWorkers: number;
  private rounds: number;

  constructor(
    model: string,
    client: CopilotClient,
    numWorkers = 3,
    rounds = 1
  ) {
    super(model, client);
    this.numWorkers = numWorkers;
    this.rounds = rounds;
  }

  async respond(question: Question): Promise<string> {
    const userMsg = question.question;
    let workerFindings: string[] = [];

    for (let r = 0; r < this.rounds; r++) {
      // Phase 1: Orchestrator directive
      const directive = await this.call(ORCH_DIRECTIVE_SYSTEM, [
        { role: "user", content: `Question to analyse:\n${userMsg}` },
      ]);

      // Phase 2: Workers investigate in parallel
      const results = await Promise.allSettled(
        Array.from({ length: this.numWorkers }, (_, i) => {
          const assignment =
            WORKER_ASSIGNMENTS[i] ??
            WORKER_ASSIGNMENTS[WORKER_ASSIGNMENTS.length - 1];
          return this.call(workerSystem(i + 1, assignment), [
            {
              role: "user",
              content:
                `Question:\n${userMsg}\n\n` +
                `Orchestrator directive:\n${directive}`,
            },
          ]);
        })
      );

      workerFindings = results.map((r, i) =>
        r.status === "fulfilled"
          ? `[Worker ${i + 1}] ${r.value}`
          : `[Worker ${i + 1}] FAILED: ${(r as PromiseRejectedResult).reason}`
      );
    }

    // Phase 3: Orchestrator synthesis
    const findingsText = workerFindings.join("\n\n");
    return this.call(ORCH_SYNTHESIS_SYSTEM, [
      {
        role: "user",
        content:
          `Original question:\n${userMsg}\n\n` +
          `Worker findings:\n${findingsText}\n\n` +
          "Produce the final response to the user.",
      },
    ]);
  }
}
