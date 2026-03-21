/**
 * Decentralized MAS — peer debate with majority vote.
 *
 *   A = {a1, ..., an}
 *   C = {(ai, aj) ∀i,j, i≠j}   fully connected mesh
 *   Ω = consensus                d rounds of debate → majority vote
 *   Complexity: O(dnk) + O(1)
 */

import { type CopilotClient } from "@github/copilot-sdk";
import { BaseAgent, type Question } from "./base.js";

const AGENT_SYSTEM =
  "You are one agent in a peer-debate group. You are evaluating whether a " +
  "question makes sense or is nonsensical. You will see other agents' " +
  "analyses and can update your position.\n\n" +
  "In each round:\n" +
  "1. State your current assessment (coherent / nonsensical / unsure).\n" +
  "2. Give specific reasons.\n" +
  "3. Respond to points raised by other agents if any.\n\n" +
  "Be precise. If you think terminology is misapplied or a framework is " +
  "fabricated, say so explicitly.";

const VOTER_SYSTEM =
  "After a multi-round debate, you must produce a final response to the " +
  "original question based on the debate transcript.\n\n" +
  "Rules:\n" +
  "- The majority assessment (coherent vs nonsensical) wins.\n" +
  "- If the majority found the question nonsensical, the response MUST " +
  "clearly explain why.\n" +
  "- Produce a single final response as if you are directly answering the user.";

interface Turn {
  role: string;
  content: string;
}

export class DecentralizedAgent extends BaseAgent {
  readonly topology = "decentralized";
  private numAgents: number;
  private debateRounds: number;

  constructor(
    model: string,
    client: CopilotClient,
    numAgents = 3,
    debateRounds = 2
  ) {
    super(model, client);
    this.numAgents = numAgents;
    this.debateRounds = debateRounds;
  }

  async respond(question: Question): Promise<string> {
    const userMsg = question.question;

    // Each agent tracks its conversation history for multi-round debate
    const histories: Turn[][] = Array.from(
      { length: this.numAgents },
      () => [
        {
          role: "user",
          content: `Question to evaluate:\n${userMsg}\n\nProvide your initial analysis.`,
        },
      ]
    );

    // Round 0: independent initial assessments
    const assessments: string[] = [];
    const initialResults = await Promise.allSettled(
      histories.map((h) => this.call(AGENT_SYSTEM, h))
    );
    for (let i = 0; i < this.numAgents; i++) {
      const result = initialResults[i];
      const text =
        result.status === "fulfilled"
          ? result.value
          : `[Failed: ${(result as PromiseRejectedResult).reason}]`;
      assessments.push(text);
      histories[i].push({ role: "assistant", content: text });
    }

    // Debate rounds: each agent sees all peers' latest output
    for (let round = 1; round <= this.debateRounds; round++) {
      const newAssessments: string[] = [];

      for (let i = 0; i < this.numAgents; i++) {
        const peerOutputs = assessments
          .filter((_, j) => j !== i)
          .map((a, j) => `[Peer ${j + 1}] ${a}`)
          .join("\n\n");

        histories[i].push({
          role: "user",
          content:
            `Round ${round} — Here are the other agents' assessments:\n\n` +
            `${peerOutputs}\n\n` +
            "Update your analysis. You may change your position if " +
            "persuaded, or reinforce it with new arguments.",
        });

        const reply = await this.call(AGENT_SYSTEM, histories[i]);
        newAssessments.push(reply);
        histories[i].push({ role: "assistant", content: reply });
      }

      assessments.splice(0, assessments.length, ...newAssessments);
    }

    // Final vote: synthesise based on debate
    const transcript = assessments
      .map((a, i) => `=== Agent ${i + 1} (final position) ===\n${a}`)
      .join("\n\n");

    return this.call(VOTER_SYSTEM, [
      {
        role: "user",
        content:
          `Original question:\n${userMsg}\n\n` +
          `Debate transcript (final round):\n${transcript}\n\n` +
          "Produce the final response based on the majority assessment.",
      },
    ]);
  }
}
