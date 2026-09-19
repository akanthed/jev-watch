# jev-watch

CLI tool that loads test cases from JSON, calls the TypeSafe Jev API, and flags
when answers drift after a model update — a choice flips, a score moves, or
confidence drops below tolerance.

## Setup

```bash
npm install
npm run build
```

Set credentials in `.env.local` (or the shell environment) — either a
TypeSafe API key, to call `https://api.typesafe.ai` directly:

```
JEV_API_KEY=sk-...
JEV_API_URL=https://your-dedicated-endpoint.example.com   # optional, for enterprise/custom deployments
JEV_MODEL=jev-latest                                      # optional, this is the default
```

or an OpenRouter API key, to call TypeSafe's Jev model through OpenRouter
instead (no TypeSafe account needed):

```
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_MODEL=~typesafe/jev-latest   # optional, this is the default
```

`JEV_API_KEY` takes precedence when both are set.

Link the CLI locally if you want the bare `jev-watch` command:

```bash
npm link
```

## API contract

`jev-watch` speaks TypeSafe's System One wire format (`src/systemOne.ts`),
shared by both transports:

- **Direct** (`JEV_API_KEY`) — `src/client.ts` POSTs to
  `${JEV_API_URL:-https://api.typesafe.ai}/v1/systemone`.
- **OpenRouter** (`OPENROUTER_API_KEY`) — `src/openrouterClient.ts` POSTs to
  `https://openrouter.ai/api/alpha/decisions`, which normalizes to the same
  request/response shape.

Both send `{ "state": ..., "model": ..., "questions": { "<id>": { "type": "choice" | "score", "instructions": "...", "criteria": {...} } } }`
and get back `{ "answers": { "<id>": { "type": "choice" | "score", "choice"/"score": ..., "probabilities": {...}, "confidence": 0.82 } } }`.

`jev-watch`'s own test-case format only has `choice` and `score` question
types (see below); `src/systemOne.ts` maps between them and the wire format
1:1 — `choice` questions carry their `options` as `criteria`, `score`
questions carry `[min, max]` as `criteria` — and both answer types come back
with a `confidence`, which feeds the confidence-drift check below.

> An earlier version of this adapter mapped `score` questions onto Jev's
> `noul` (yes/no probability) type instead of its native `score` type. That
> silently dropped confidence data and returned worse answers — verified by
> probing the raw endpoint. Fixed; `score` now maps straight across.

## Test case format

```json
{
  "testName": "CRAToolkit support routing",
  "state": "Customer says: I can't log in",
  "questions": {
    "department": {
      "type": "choice",
      "instruction": "Which team?",
      "options": { "billing": "...", "technical": "...", "sales": "..." }
    }
  },
  "expected": { "department": "technical" },
  "tolerance": 0.1
}
```

- `type: "choice"` — fails if the returned choice doesn't match `expected`, or
  if `confidence` drops more than `tolerance` below 1.0 (e.g. `tolerance: 0.1`
  requires confidence >= 0.9).
- `type: "score"` — fails if `|actual.score - expected| > tolerance`, or on
  the same confidence check as above.
- Comparisons carry a small epsilon so exact-boundary values (e.g.
  `confidence: 0.7` at `tolerance: 0.3`) don't get false-flagged by float
  rounding (`1 - 0.7 === 0.30000000000000004` in JS).
- Score-type confidence tends to run lower and noisier than choice-type
  confidence (the model is scoring a continuous judgment, not picking from a
  fixed list) — size `tolerance` accordingly per test rather than reusing a
  choice-question tolerance.

## Running

```bash
# single test case
node bin/jev-watch.js examples/support-routing.json

# a whole directory
node bin/jev-watch.js examples

# after npm link
jev-watch examples
```

## Example run

Example `expected` values are calibrated to the live model's current
answers, so a clean checkout passes end to end — this is the baseline you'd
commit, then re-run after every model update to catch drift:

```
$ jev-watch examples
PASS CRAToolkit refund eligibility
PASS CRAToolkit sales lead qualification
PASS CRAToolkit angry customer detection
PASS CRAToolkit support routing

4/4 tests passed
```

Break one of `examples/*.json` on purpose (e.g. change an `expected` choice)
and jev-watch catches it immediately:

```
$ jev-watch examples/support-routing.json
FAIL CRAToolkit support routing
  drift [department] choice: expected sales, got technical (tolerance 0.1)

0/1 tests passed
```

Exit code is `0` when every test passes, `1` otherwise — wire it into CI to
catch drift on every model deploy.

## Testing

Unit tests cover the drift-evaluation logic directly (choice match/mismatch,
confidence threshold, score tolerance boundaries, float-rounding boundary
cases, missing answers) plus `runTestCase` against a mocked client, using
Node's built-in test runner — no extra test framework dependency:

```bash
npm test
```

```
# tests 13
# pass 13
# fail 0
```

## Benchmarking

Two benchmarks, run separately since one costs real API calls:

```bash
npm run bench        # synthetic, offline, no API calls
npm run bench:live   # hits the real Jev model via JEV_API_KEY or OPENROUTER_API_KEY
```

`bench` generates thousands of synthetic choice/score cases with a known,
independently-computed ground truth (did we *intend* to inject drift or
not), runs them through the same `evaluateQuestion` the CLI uses, and checks
the tool's verdict against that ground truth — plus a raw throughput number:

```
Drift-detection accuracy over 20000 synthetic cases
  true positive  (drift caught):        11210
  true negative  (stable, no false alarm): 8790
  false positive (false alarm):         0
  false negative (drift missed):        0
  accuracy:  100.00%
  precision: 100.00%
  recall:    100.00%

Throughput: 200000 evaluations in 27.51ms (7269925/sec)
PASS: drift-detection logic matches ground truth on synthetic cases.
```

`bench:live` runs `examples/` against the real model `BENCH_RUNS` times
(default 3) and reports the pass-rate consistency per test case — flags any
test whose verdict isn't identical across runs, which is a live model being
non-deterministic in exactly the way jev-watch exists to catch.

## Project layout

- `src/types.ts` — test case, API response, and result types
- `src/systemOne.ts` — shared TypeSafe System One wire format + adapter
- `src/client.ts` — direct TypeSafe API client (`api.typesafe.ai`)
- `src/openrouterClient.ts` — client that calls Jev via OpenRouter's Decisions API
- `src/runner.ts` — loads test cases, calls the API, evaluates drift
- `src/report.ts` — terminal output
- `src/index.ts` — CLI entrypoint
- `bin/jev-watch.js` — executable shim
- `examples/` — four sample test cases
- `test/` — unit tests (`npm test`)
- `bench/` — synthetic and live benchmarks (`npm run bench`, `npm run bench:live`)
