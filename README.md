# jev-watch

CLI tool that loads test cases from JSON, calls the TypeSafe Jev API, and flags
when answers drift after a model update — a choice flips, a score moves, or
confidence drops below tolerance.

## Setup

```bash
npm install
npm run build
```

Set credentials in `.env.local` (or the shell environment):

```
OPEN_ROUTE_KEY=sk-or-...
OPEN_ROUTE_MODEL=~typesafe/jev-latest   # optional, this is the default
```

Link the CLI locally if you want the bare `jev-watch` command:

```bash
npm link
```

## API contract

`jev-watch` calls the TypeSafe Jev API through OpenRouter's alpha decisions
endpoint (`@openrouter/sdk`, `openrouter.alpha.decisions.create`), passing
each test case's `state` and `questions` and getting back one typed answer
per question:

```json
{
  "answers": {
    "<id>": { "type": "choice", "choice": "technical", "confidence": 0.93 }
  }
}
```

Swap the model via `OPEN_ROUTE_MODEL`, or edit `src/client.ts` if you're
pointed at a different Jev deployment.

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
confidence threshold, score tolerance boundaries, missing answers) plus
`runTestCase` against a mocked client, using Node's built-in test runner —
no extra test framework dependency:

```bash
npm test
```

```
# tests 12
# pass 12
# fail 0
```

## Benchmarking

Two benchmarks, run separately since one costs real API calls:

```bash
npm run bench        # synthetic, offline, no API calls
npm run bench:live   # hits the real Jev model via OPEN_ROUTE_KEY
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
- `src/client.ts` — Jev API client, built on `@openrouter/sdk`
- `src/runner.ts` — loads test cases, calls the API, evaluates drift
- `src/report.ts` — terminal output
- `src/index.ts` — CLI entrypoint
- `bin/jev-watch.js` — executable shim
- `examples/` — four sample test cases
- `test/` — unit tests (`npm test`)
- `bench/` — synthetic and live benchmarks (`npm run bench`, `npm run bench:live`)
