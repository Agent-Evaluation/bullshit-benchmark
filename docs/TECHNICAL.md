# BullshitBench Technical Guide

This guide is for maintainers and contributors working on benchmark operations and data publishing.

## Pipeline Overview

The end-to-end flow is:

1. `collect`
2. `grade` (primary judge, usually Claude)
3. optional `grade-panel` for additional judges
4. `publish_latest_to_viewer.sh` (when additional judges are run)

Run stage 1 (collect + primary judge) with:

```bash
./scripts/run_end_to_end.sh
```

Run stage 2 later (remaining judges + publish) with:

```bash
./scripts/run_end_to_end.sh --skip-collect --skip-primary-judge --with-additional-judges --run-id <run_id> --panel-id <panel_id>
```

Run both stages in one go with:

```bash
./scripts/run_end_to_end.sh --with-additional-judges
```

Serve locally after publish:

```bash
./scripts/run_end_to_end.sh --with-additional-judges --serve --port 8877
```

Then open `http://localhost:8877/viewer/index.html`.

### Grade Panel Policy

Canonical publish pipeline policy:

- Exactly `3` judges must be configured in `grade_panel.judge_models`.
- `panel_mode` is fixed to `full` (every judge runs on every row).
- `consensus_method` is fixed to `mean`.
- Legacy disagreement-tiebreak/alternate consensus modes are not supported in the main pipeline.

### Run v2 Without Overwriting v1

Use the v2 config and publish to `data/v2/latest`:

```bash
./scripts/run_end_to_end.sh --config config.v2.json --viewer-output-dir data/v2/latest --with-additional-judges
```

The viewer can switch between versions using the `Benchmark Version` dropdown.

### Publish a Full-Suite 155-Question Run

Publish combined v1+v2 runs to the dedicated full-suite track:

```bash
./scripts/publish_latest_to_viewer.sh --output-dir data/full/latest ...
```

### v1 to v2 Release Best Practices

Use this checklist before pushing to GitHub/GitHub Pages:

1. Keep versioned published datasets side-by-side:
   - v1: `data/latest/*`
   - v2: `data/v2/latest/*`
   - full suite: `data/full/latest/*`
2. Do not commit local run history (`runs/*`) or ad hoc temp artifacts.
3. Rebuild v2 question JSON from draft source when question content changes:
   - source: `drafts/new-questions.md`
   - builder: `scripts/build_questions_v2_from_draft.py`
4. Publish datasets only via `scripts/publish_latest_to_viewer.sh` (or `run_end_to_end.sh` wrapper) so artifact normalization stays consistent.
5. Smoke-test both viewer entry points before publish:
   - `viewer/index.html` (stable / version-switching)
   - `viewer/index.v2.html` (v2-focused view)

### High-Throughput Collection Knobs (30k+ Queries)

Collection now supports model-aware scheduling and durable checkpoints:

- `parallelism`: global concurrent requests
- `max_inflight_per_model`: cap per-model concurrency so one provider bucket cannot starve others
- `rate_limit_requeue`: when true, HTTP 429 rows are requeued with model cooldown instead of immediately failing
- `rate_limit_cooldown_seconds`, `rate_limit_cooldown_max_seconds`, `rate_limit_cooldown_jitter_seconds`: cooldown controls for rate-limited models
- `rate_limit_max_attempts`: max total attempts per `sample_id` before final failure
- `checkpoint_fsync_every`: fsync cadence for `responses.partial.jsonl` and `collect_events.jsonl` durability

Operational guidance for speed:

- For very large runs, set `retries=1` so workers do not sleep on backoff internally; let scheduler-level requeue handle cooldown.
- Increase `parallelism` aggressively (for example 48–96) and tune `max_inflight_per_model` (for example 1–3) based on observed 429 rates.
- Keep `shuffle_tasks=true` to spread models/questions and smooth bursty limits.

## Publish Existing Run Artifacts

Use this when you already have run outputs and only want to refresh a viewer dataset:

```bash
./scripts/publish_latest_to_viewer.sh \
  --responses-file <path/to/responses.jsonl> \
  --collection-stats <path/to/collection_stats.json> \
  --panel-summary <path/to/panel_summary.json> \
  --aggregate-summary <path/to/aggregate_summary.json> \
  --aggregate-rows <path/to/aggregate.jsonl> \
  --output-dir <data/latest-or-data/v2/latest-or-data/full/latest>
```

Publish behavior:

- Default `--publish-mode auto` is safety-first: if output already exists, publish is supplemental (merge by `sample_id`); if output does not exist, publish is replace.
- To force merge: add `--supplemental` (or `--publish-mode supplemental`).
- To intentionally overwrite with only incoming artifacts: add `--replace` (or `--publish-mode replace`).

The publish step strips local-machine path fields from public artifacts.
It also sanitizes local path fragments from published JSONL text fields.

## Launch-Date Metadata Pipeline

Build model launch-date inventory/buckets and export review/candidate/canonical launch datasets:

```bash
./scripts/model_launch_pipeline.py run
```

This writes:

- `data/model_metadata/tested_models_inventory.csv`
- `data/model_metadata/model_buckets.csv`
- `data/model_metadata/model_launch_sources.csv` (template if missing)
- `data/model_metadata/model_launch_collection.csv`
- `data/model_metadata/model_launch_judged.csv`
- `data/model_metadata/model_launch_attempts.csv`
- `data/model_metadata/model_launch_dates_review.csv`
- `data/model_metadata/model_launch_dates_candidates.csv`
- `data/model_metadata/model_launch_dates.csv` (canonical accepted rows)
- `data/model_metadata/model_params.csv` (canonical tracked size/licensing metadata for models with public parameter disclosures)

Publishing also exports:

- `data/latest/model_launch_dates.csv`
- `data/latest/leaderboard_with_launch.csv`
- `data/latest/model_params.csv`

## Current Config Notes

- Main config (v1): `config.json`
- Main config (v2): `config.v2.json`
- Question set (v1): `questions.json`
- Question set (v2): `questions.v2.json` (generated from `drafts/new-questions.md` via `scripts/build_questions_v2_from_draft.py`)
- Provider routing is controlled by `collect.model_providers` and `grade.model_providers` (`openrouter` or `openai`; supports `*` and `<org>/*` patterns, e.g. `{"*":"openrouter","gpt-5.3":"openai"}`).
- Configs include `openai/gpt-5.2-codex` and `openai/gpt-5.3-codex` with reasoning sweeps (`low`, `high`, `xhigh`).
- Config model lists are aligned to `data/model_metadata/tested_models_inventory.csv` run history, including legacy OpenAI IDs (`openai/gpt-4.1`, `openai/gpt-4o*`, `openai/o3`).

## Repository Layout

- `scripts/openrouter_benchmark.py`: core CLI (`collect`, `grade`, `grade-panel`, `aggregate`, `report`)
- `scripts/run_end_to_end.sh`: one-command pipeline runner
- `scripts/publish_latest_to_viewer.sh`: publish run outputs into a selected viewer dataset dir (`data/latest`, `data/v2/latest`, or `data/full/latest`)
- `scripts/build_questions_v2_from_draft.py`: build `questions.v2.json` from markdown draft
- `scripts/cleanup_generated_outputs.sh`: remove generated local artifacts
- `scripts/model_launch_pipeline.py`: launch-date collection/judging pipeline
- `viewer/index.html`: canonical interactive viewer
- `viewer/index.v2.html`: v2-focused interactive viewer
- `data/latest/*`: benchmark v1 published dataset
- `data/v2/latest/*`: benchmark v2 published dataset
- `data/full/latest/*`: benchmark full-suite published dataset
- `runs/*`: local run history

## Published Dataset Files

Each published dataset directory (`data/latest`, `data/v2/latest`, or `data/full/latest`) contains:

- `responses.jsonl`
- `collection_stats.json`
- `panel_summary.json`
- `aggregate_summary.json`
- `aggregate.jsonl`
- `leaderboard.csv`
- `leaderboard_with_launch.csv`
- `model_launch_dates.csv`
- `model_params.csv`
- `manifest.json`

Collection run artifacts under `runs/<run_id>/` now also include flattened per-row usage metrics in `responses.jsonl` and `responses_review.csv`:

- token counts (`response_prompt_tokens`, `response_completion_tokens`, `response_total_tokens`, `response_reasoning_tokens`)
- cache details (`response_cached_prompt_tokens`, `response_cache_write_tokens`)
- cost fields (`response_cost_usd` and upstream cost breakdown fields)
- derived metrics (`response_char_count`, `response_tokens_per_second`)

And `collection_stats.json` includes `usage_summary` with totals/averages overall and by model.

## Environment

Required:

- `OPENROUTER_API_KEY`

Optional:

- `OPENROUTER_REFERER`
- `OPENROUTER_APP_NAME`
- `OPENAI_API_KEY` (required when any model is routed to provider `openai`)
- `OPENAI_PROJECT` or `OPENAI_PROJECT_ID` (optional OpenAI project header override)
- `OPENAI_ORGANIZATION` or `OPENAI_ORG` or `OPENAI_ORG_ID` (optional OpenAI org header override)
