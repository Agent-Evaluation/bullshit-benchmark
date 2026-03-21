/**
 * Analyze and compare topology results from benchmark runs.
 *
 * Usage:
 *   npm run build && npm run analyze -- --run-dir output/run_2026-03-21T...
 *
 * Options:
 *   --run-dir <path>    Path to a benchmark run directory
 *   --compare <paths>   Comma-separated run dirs to compare
 */

import * as fs from "node:fs";
import * as path from "node:path";

// ── Types ────────────────────────────────────────────────────────────────────

interface TopologySummary {
  topology: string;
  model: string;
  total_questions: number;
  graded: number;
  avg_score: number;
  score_distribution: Record<number, number>;
  detection_rate_score_2: number;
  full_engagement_rate_score_0: number;
  technique_breakdown: Record<string, { avg: number; count: number }>;
  errors: number;
}

interface GradeRecord {
  question_id: string;
  question: string;
  technique: string;
  domain: string;
  topology: string;
  model: string;
  response_text: string;
  judge_score: number | null;
  judge_justification: string;
  error: string;
  judge_error: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseArgs(): {
  runDir: string;
  compare: string[];
} {
  const args = process.argv.slice(2);
  const opts = { runDir: "", compare: [] as string[] };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--run-dir":
        opts.runDir = path.resolve(args[++i]);
        break;
      case "--compare":
        opts.compare = args[++i].split(",").map((s) => path.resolve(s.trim()));
        break;
    }
  }
  return opts;
}

function loadJsonl<T>(filePath: string): T[] {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf-8")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as T);
}

// ── Analysis functions ───────────────────────────────────────────────────────

function analyzeRun(runDir: string): void {
  const aggPath = path.join(runDir, "aggregate.json");
  if (!fs.existsSync(aggPath)) {
    console.error(`No aggregate.json found in ${runDir}`);
    process.exit(1);
  }

  const summaries: TopologySummary[] = JSON.parse(
    fs.readFileSync(aggPath, "utf-8")
  );

  console.log(`\n${"═".repeat(70)}`);
  console.log(`  ANALYSIS: ${runDir}`);
  console.log(`${"═".repeat(70)}\n`);

  // 1. Leaderboard
  console.log("┌─ TOPOLOGY LEADERBOARD ─────────────────────────────────┐");
  console.log(
    "│ Rank │ Topology        │ Avg Score │ Detect% │ Engage% │ N  │"
  );
  console.log(
    "├──────┼─────────────────┼───────────┼─────────┼─────────┼────┤"
  );
  const sorted = [...summaries].sort((a, b) => b.avg_score - a.avg_score);
  sorted.forEach((s, i) => {
    console.log(
      `│ ${String(i + 1).padStart(4)} │ ${s.topology.padEnd(15)} │ ` +
        `${s.avg_score.toFixed(3).padStart(9)} │ ` +
        `${(s.detection_rate_score_2 * 100).toFixed(1).padStart(6)}% │ ` +
        `${(s.full_engagement_rate_score_0 * 100).toFixed(1).padStart(6)}% │ ` +
        `${String(s.graded).padStart(3)}│`
    );
  });
  console.log(
    "└──────┴─────────────────┴───────────┴─────────┴─────────┴────┘"
  );

  // 2. Score distribution comparison
  console.log("\n┌─ SCORE DISTRIBUTION ────────────────────────────────────┐");
  console.log("│ Topology        │ Score 0  │ Score 1  │ Score 2  │");
  console.log("├─────────────────┼──────────┼──────────┼──────────┤");
  for (const s of sorted) {
    const total = s.graded || 1;
    const d = s.score_distribution;
    console.log(
      `│ ${s.topology.padEnd(15)} │ ` +
        `${String(d[0] ?? 0).padStart(4)} ${((d[0] ?? 0) / total * 100).toFixed(0).padStart(3)}% │ ` +
        `${String(d[1] ?? 0).padStart(4)} ${((d[1] ?? 0) / total * 100).toFixed(0).padStart(3)}% │ ` +
        `${String(d[2] ?? 0).padStart(4)} ${((d[2] ?? 0) / total * 100).toFixed(0).padStart(3)}% │`
    );
  }
  console.log("└─────────────────┴──────────┴──────────┴──────────┘");

  // 3. Technique breakdown — which techniques benefit most from multi-agent
  console.log("\n┌─ TECHNIQUE ANALYSIS ───────────────────────────────────┐");
  const allTechniques = new Set<string>();
  for (const s of summaries) {
    for (const t of Object.keys(s.technique_breakdown)) allTechniques.add(t);
  }

  for (const tech of [...allTechniques].sort()) {
    console.log(`\n  ${tech}:`);
    for (const s of sorted) {
      const tb = s.technique_breakdown[tech];
      if (tb) {
        const bar = "█".repeat(Math.round(tb.avg * 5));
        console.log(
          `    ${s.topology.padEnd(15)} ${tb.avg.toFixed(2)} ${bar} (n=${tb.count})`
        );
      }
    }
  }
  console.log(
    "\n└────────────────────────────────────────────────────────┘"
  );

  // 4. Per-topology detailed grade analysis
  const topologies = ["single", "independent", "centralized", "decentralized", "hybrid"];
  for (const topo of topologies) {
    const gradesPath = path.join(runDir, `grades_${topo}.jsonl`);
    const grades = loadJsonl<GradeRecord>(gradesPath);
    if (grades.length === 0) continue;

    const failures = grades.filter(
      (g) => g.judge_score === 0 && !g.error && !g.judge_error
    );
    if (failures.length > 0) {
      console.log(
        `\n┌─ ${topo.toUpperCase()}: TOP FAILURES (score=0) ─────────────────────┐`
      );
      for (const f of failures.slice(0, 5)) {
        console.log(`  ${f.question_id} [${f.technique}]`);
        console.log(`    Q: ${f.question.slice(0, 80)}...`);
        console.log(`    Judge: ${f.judge_justification.slice(0, 100)}`);
      }
      console.log("└──────────────────────────────────────────────────────┘");
    }
  }

  // 5. Multi-agent advantage analysis
  const singleSummary = summaries.find((s) => s.topology === "single");
  if (singleSummary) {
    console.log("\n┌─ MULTI-AGENT ADVANTAGE (vs Single) ────────────────────┐");
    for (const s of sorted) {
      if (s.topology === "single") continue;
      const delta = s.avg_score - singleSummary.avg_score;
      const sign = delta >= 0 ? "+" : "";
      const detDelta =
        (s.detection_rate_score_2 - singleSummary.detection_rate_score_2) * 100;
      const detSign = detDelta >= 0 ? "+" : "";
      console.log(
        `  ${s.topology.padEnd(15)} avg: ${sign}${delta.toFixed(3)}  ` +
          `detect: ${detSign}${detDelta.toFixed(1)}pp`
      );
    }
    console.log("└────────────────────────────────────────────────────────┘");
  }
}

function compareRuns(runDirs: string[]): void {
  console.log(`\n${"═".repeat(70)}`);
  console.log("  CROSS-RUN COMPARISON");
  console.log(`${"═".repeat(70)}\n`);

  const runs: Array<{ dir: string; summaries: TopologySummary[] }> = [];
  for (const dir of runDirs) {
    const aggPath = path.join(dir, "aggregate.json");
    if (!fs.existsSync(aggPath)) {
      console.error(`Skipping ${dir}: no aggregate.json`);
      continue;
    }
    runs.push({
      dir: path.basename(dir),
      summaries: JSON.parse(fs.readFileSync(aggPath, "utf-8")),
    });
  }

  if (runs.length < 2) {
    console.error("Need at least 2 valid run directories to compare.");
    process.exit(1);
  }

  const allTopos = new Set<string>();
  for (const r of runs) {
    for (const s of r.summaries) allTopos.add(s.topology);
  }

  for (const topo of [...allTopos].sort()) {
    console.log(`\n  ${topo.toUpperCase()}:`);
    for (const r of runs) {
      const s = r.summaries.find((s) => s.topology === topo);
      if (s) {
        console.log(
          `    ${r.dir.padEnd(30)} avg=${s.avg_score.toFixed(3)} ` +
            `detect=${(s.detection_rate_score_2 * 100).toFixed(1)}% ` +
            `model=${s.model}`
        );
      }
    }
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main(): void {
  const opts = parseArgs();

  if (opts.compare.length >= 2) {
    compareRuns(opts.compare);
  } else if (opts.runDir) {
    analyzeRun(opts.runDir);
  } else {
    // Auto-detect latest run
    const outputDir = path.resolve("output");
    if (!fs.existsSync(outputDir)) {
      console.error(
        "No output directory found. Run the benchmark first, or use --run-dir."
      );
      process.exit(1);
    }
    const dirs = fs
      .readdirSync(outputDir)
      .filter((d) => d.startsWith("run_"))
      .sort()
      .reverse();
    if (dirs.length === 0) {
      console.error("No run directories found in output/.");
      process.exit(1);
    }
    analyzeRun(path.join(outputDir, dirs[0]));
  }
}

main();
