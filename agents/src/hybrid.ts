/**
 * Hybrid MAS — Orchestrator-Worker with shared memory + re-planning.
 *
 *   A = {a_orch, a1, ..., an}   (n determined dynamically)
 *   C = star via shared memory   (workers write findings, orchestrator reads)
 *   Ω = hierarchical + iterative re-planning
 *
 * Key features vs Centralized:
 *   - Workers are autonomous multi-step agents (can reason in a loop)
 *   - Orchestrator dynamically decides worker count based on complexity
 *   - Shared memory (scratchpad) avoids "game of telephone"
 *   - Orchestrator can re-plan after reviewing findings
 */

import { type CopilotClient } from "@github/copilot-sdk";
import { BaseAgent, type Question } from "./base.js";

// ── Shared Memory ────────────────────────────────────────────────────────────

interface WorkerFinding {
  workerId: number;
  role: string;
  status: "success" | "partial" | "failed";
  finding: string;
  reasoning: string[];
}

class SharedMemory {
  plan: Record<string, unknown> | null = null;
  findings: WorkerFinding[] = [];

  storePlan(plan: Record<string, unknown>): void {
    this.plan = plan;
  }

  storeFinding(finding: WorkerFinding): void {
    this.findings.push(finding);
  }

  getSummary(): string {
    if (this.findings.length === 0) return "No findings yet.";
    return this.findings
      .map(
        (f) =>
          `[Worker ${f.workerId} — ${f.role}]\n` +
          `  Status: ${f.status}\n` +
          `  Finding: ${f.finding}` +
          (f.reasoning.length
            ? "\n  Reasoning:\n" +
              f.reasoning.map((r) => `    → ${r}`).join("\n")
            : "")
      )
      .join("\n\n");
  }
}

// ── Prompts ──────────────────────────────────────────────────────────────────

const ORCH_PLAN_SYSTEM =
  "You are the ORCHESTRATOR of a multi-agent question-evaluation system.\n\n" +
  "Analyse the question and decide how to decompose the work.\n\n" +
  "Complexity guidelines:\n" +
  "- simple (1 worker): Straightforward question, one angle is enough.\n" +
  "- moderate (2 workers): Need terminology check AND existence check.\n" +
  "- complex (3 workers): Multiple suspicious elements, needs deep analysis.\n\n" +
  "You MUST respond with valid JSON only:\n" +
  "{\n" +
  '  "complexity": "simple" | "moderate" | "complex",\n' +
  '  "analysis": "<brief situation analysis>",\n' +
  '  "subtasks": [\n' +
  "    {\n" +
  '      "id": 1,\n' +
  '      "role": "<worker role>",\n' +
  '      "objective": "<what to investigate>",\n' +
  '      "instructions": "<how to investigate>"\n' +
  "    }\n" +
  "  ]\n" +
  "}";

const ORCH_REPLAN_SYSTEM =
  "You are the ORCHESTRATOR reviewing worker findings. Decide whether you " +
  "have enough information, or need additional investigation.\n\n" +
  "Respond with valid JSON only:\n" +
  "{\n" +
  '  "ready": true | false,\n' +
  '  "reasoning": "<why>",\n' +
  '  "additional_subtasks": []\n' +
  "}";

const ORCH_SYNTHESIZE_SYSTEM =
  "You are the ORCHESTRATOR. Based on worker findings, produce the final " +
  "response to the original question.\n\n" +
  "Rules:\n" +
  "- If workers identified fabricated terms, misapplied concepts, or logical " +
  "incoherence, the response MUST clearly flag this.\n" +
  "- Do not soften or hedge clear findings of nonsense.\n" +
  "- Respond as if you are directly answering the user.";

interface Subtask {
  id: number;
  role: string;
  objective: string;
  instructions: string;
}

function workerPrompt(subtask: Subtask): string {
  return (
    `You are a specialised WORKER agent.\n\n` +
    `Role: ${subtask.role}\n` +
    `Objective: ${subtask.objective}\n` +
    `Instructions: ${subtask.instructions}\n\n` +
    "Analyse step by step. Be specific. If you find issues, explain them " +
    "concretely. If everything checks out, say so.\n\n" +
    "End your response with a STATUS line:\n" +
    "STATUS: success | partial | failed\n" +
    "FINDING: <one-sentence summary>"
  );
}

// ── Hybrid Agent ─────────────────────────────────────────────────────────────

export class HybridAgent extends BaseAgent {
  readonly topology = "hybrid";
  private maxWorkerSteps: number;

  constructor(model: string, client: CopilotClient, maxWorkerSteps = 3) {
    super(model, client);
    this.maxWorkerSteps = maxWorkerSteps;
  }

  async respond(question: Question): Promise<string> {
    const userMsg = question.question;
    const memory = new SharedMemory();

    // Phase 1: Orchestrator plans
    const planRaw = await this.call(ORCH_PLAN_SYSTEM, [
      { role: "user", content: `Question to evaluate:\n${userMsg}` },
    ]);

    let plan: Record<string, unknown>;
    try {
      plan = JSON.parse(planRaw);
    } catch {
      // Fallback plan if orchestrator doesn't produce valid JSON
      plan = {
        complexity: "moderate",
        analysis: planRaw,
        subtasks: [
          {
            id: 1,
            role: "general_analyst",
            objective: "Evaluate this question for coherence",
            instructions:
              "Check terminology, frameworks, and logical consistency",
          },
          {
            id: 2,
            role: "fact_checker",
            objective: "Verify referenced concepts exist",
            instructions:
              "Determine if methodologies/frameworks mentioned are real",
          },
        ],
      };
    }
    memory.storePlan(plan);

    const subtasks = (plan.subtasks ?? []) as Subtask[];

    // Phase 2: Autonomous workers execute in parallel
    await this.runWorkers(subtasks, userMsg, memory);

    // Phase 3: Re-plan check
    const replanRaw = await this.call(ORCH_REPLAN_SYSTEM, [
      {
        role: "user",
        content:
          `Original question:\n${userMsg}\n\n` +
          `Worker findings:\n${memory.getSummary()}\n\n` +
          `Original plan:\n${JSON.stringify(plan, null, 2)}`,
      },
    ]);

    try {
      const replan = JSON.parse(replanRaw) as {
        ready: boolean;
        additional_subtasks?: Subtask[];
      };
      if (!replan.ready && replan.additional_subtasks?.length) {
        await this.runWorkers(replan.additional_subtasks, userMsg, memory);
      }
    } catch {
      // If replan parse fails, proceed to synthesis
    }

    // Phase 4: Orchestrator synthesises final response
    return this.call(ORCH_SYNTHESIZE_SYSTEM, [
      {
        role: "user",
        content:
          `Original question:\n${userMsg}\n\n` +
          `All worker findings:\n${memory.getSummary()}\n\n` +
          "Produce the final response to the user.",
      },
    ]);
  }

  private async runWorkers(
    subtasks: Subtask[],
    userMsg: string,
    memory: SharedMemory
  ): Promise<void> {
    await Promise.allSettled(
      subtasks.map(async (subtask) => {
        const system = workerPrompt(subtask);
        const messages: Array<{ role: string; content: string }> = [
          { role: "user", content: `Question:\n${userMsg}` },
        ];

        // Autonomous worker loop (multi-step reasoning)
        let lastResponse = "";
        for (let step = 0; step < this.maxWorkerSteps; step++) {
          lastResponse = await this.call(system, messages);
          messages.push({ role: "assistant", content: lastResponse });

          // Check if worker has reached a conclusion
          if (
            lastResponse.includes("STATUS:") &&
            lastResponse.includes("FINDING:")
          ) {
            break;
          }

          messages.push({
            role: "user",
            content:
              "Continue your analysis. Provide STATUS and FINDING when done.",
          });
        }

        // Parse worker output
        const statusMatch = lastResponse.match(/STATUS:\s*(\w+)/i);
        const findingMatch = lastResponse.match(/FINDING:\s*(.+)/i);

        memory.storeFinding({
          workerId: subtask.id,
          role: subtask.role,
          status: (statusMatch?.[1]?.toLowerCase() ?? "partial") as
            | "success"
            | "partial"
            | "failed",
          finding: findingMatch?.[1] ?? lastResponse.slice(0, 200),
          reasoning: [lastResponse.slice(0, 500)],
        });
      })
    );
  }
}
