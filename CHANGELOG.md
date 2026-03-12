# Changelog

All notable benchmark, data, and viewer changes are tracked in this file.

## [2.0.4] - 2026-03-12

### Added
- Added a published full-suite dataset in `data/full/latest/*` for the combined 155-question benchmark.
- Added published full-suite Grok 4.20 results for:
  - `x-ai/grok-4.20-beta@reasoning=low`
  - `x-ai/grok-4.20-beta@reasoning=xhigh`
  - `x-ai/grok-4.20-multi-agent-beta@reasoning=low`
  - `x-ai/grok-4.20-multi-agent-beta@reasoning=xhigh`
- Added `questions.full.155.json` as the published merged question set for the full-suite viewer track.

### Changed
- Extended the viewer version switchers so the published site can load `full` alongside the existing `v1` and `v2` datasets.
- Refreshed published full-suite viewer artifacts and metadata so the new Grok 4.20 run is available on GitHub Pages without altering the standalone v1 or v2 leaderboards.

## [2.0.3] - 2026-03-07

### Added
- Added published v1 and v2 benchmark results for:
  - `meta-llama/llama-4-maverick`
  - `meta-llama/llama-4-scout`
  - `meta-llama/llama-3.1-8b-instruct`
- Added canonical launch-date metadata for the Meta models above so release-date and model-age charts include them.
- Added an MIT license at the repo root and surfaced the license in the README so GitHub detects the project license directly.
- Added canonical model-size metadata in `data/model_metadata/model_params.csv` and published it into the viewer datasets.

### Changed
- Refreshed published viewer datasets in `data/latest/*` and `data/v2/latest/*` so [viewer/index.html](viewer/index.html) and [viewer/index.v2.html](viewer/index.v2.html) surface the new Meta rows.
- Refreshed the GitHub-facing README chart screenshots in `docs/images/*` after publish so the static landing-page visuals match the latest viewer data.
- Added model-size support to the viewers, including a v2 size-vs-detection scatter and a `Model Size` leaderboard column.
- Split the v2 model-size panel into separate side-by-side total-parameter and active-parameter scatters so it matches the existing two-chart layout.

## [2.0.2] - 2026-03-05

### Added
- Added provider-aware benchmark routing so collect/grade flows can target `openrouter` or `openai` per model via `collect.model_providers` and `grade.model_providers`.
- Added published v1 and v2 benchmark results for `openai/gpt-5.4@reasoning=none` and `openai/gpt-5.4@reasoning=xhigh`.

### Changed
- Updated `config.json` and `config.v2.json` to include `openai/gpt-5.4` with a reasoning sweep of `none` and `xhigh`, routed through OpenRouter by default.
- Updated benchmark/docs examples and sample configs to document provider routing and the optional OpenAI project/organization headers.
- Refreshed published viewer datasets in `data/latest/*` and `data/v2/latest/*` so [viewer/index.v2.html](viewer/index.v2.html) shows the new GPT-5.4 rows for both benchmark versions.
- Collection and grading now store raw provider payloads by default to preserve routing/debug metadata in published run artifacts.

## [2.0.1] - 2026-03-04

### Added
- Added benchmark runs for `openai/gpt-5.3-chat` and `google/gemini-3.1-flash-lite-preview`.

### Changed
- Set launch date metadata for both models to `2026-03-04` and synced to:
  - `data/model_metadata/model_launch_dates.csv`
  - `data/latest/model_launch_dates.csv`
  - `data/v2/latest/model_launch_dates.csv`
- Updated `data/latest/leaderboard_with_launch.csv` and `data/v2/latest/leaderboard_with_launch.csv` to show the new launch date and model age (`0`) for both models.
- Updated [viewer/index.v2.html](viewer/index.v2.html) launch metadata loading to merge embedded rows with CSV rows and fetch metadata with `cache: "no-store"` so new model dates reliably appear in all launch charts.

## [2.0.0] - 2026-03-01

### Highlights
- Added `100` new v2 nonsense questions.
- Added domain-specific coverage across `5` domains: `software` (40), `finance` (15), `legal` (15), `medical` (15), `physics` (15).
- Added new v2 visualizations (model detection mix, domain landscape, over-time trends, release-date scatter, and reasoning tokens/cost scatter).

### Added
- New v2 question set in [questions.v2.json](questions.v2.json) with 100 prompts across 5 domain groups and 13 techniques.
- New v2 config in [config.v2.json](config.v2.json) with high-throughput collection defaults and updated technique set.
- Dedicated v2 viewer page at [viewer/index.v2.html](viewer/index.v2.html).
- Dedicated published v2 dataset in `data/v2/latest/*`.
- Question-builder script [scripts/build_questions_v2_from_draft.py](scripts/build_questions_v2_from_draft.py).

### Changed
- Viewer and docs now support side-by-side versioning (`v1` and `v2`) without overwriting older data.
- Pipeline/docs updated for explicit v2 publishing via `--config config.v2.json --viewer-output-dir data/v2/latest`.
- Publish pipeline now scrubs local machine path fragments from published JSONL artifacts.
- Canonical panel policy is now fixed to exactly three judges (`panel_mode=full`) with `mean` aggregation in the main pipeline.
- Viewer categorying now uses published `status` + `consensus_score` as canonical defaults (when all judges are selected), while still allowing subset-judge exploratory views.
- `viewer/index.v2.html` CSV parsing is now quote-aware for launch metadata and other future CSV extensions.
- `viewer/index.v2.html` now includes friendly labels for legacy v1 technique keys.

### Removed / Cleaned
- Removed obsolete `v2_old` drafts and local run-history artifacts.
- Removed local-only temporary/debug files before publish.

## [1.0.0] - 2026-02-25

### Added
- Initial public benchmark release (v1 dataset + viewer).
