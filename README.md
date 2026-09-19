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
OPEN_ROUTE_MODEL=openai/gpt-4o-mini   # optional, this is the default
```

Link the CLI locally if you want the bare `jev-watch` command:

```bash
npm link
```

## API contract

`jev-watch` turns each test case's `state` and `questions` into a prompt and
calls OpenRouter's chat completions API (`https://openrouter.ai/api/v1/chat/completions`),
instructing the model to answer with strict JSON:

```json
{
  "answers": {
    "<id>": { "type": "choice", "choice": "technical", "confidence": 0.93 }
  }
}
```

This is what "the TypeSafe Jev API" resolves to for jev-watch's purposes — a
model call behind OpenRouter, which is what actually drifts between model
updates. Swap the model via `OPEN_ROUTE_MODEL`, or edit `src/client.ts` if you
have a bespoke Jev endpoint instead of going through OpenRouter.

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

```
$ jev-watch examples
PASS CRAToolkit refund eligibility
FAIL CRAToolkit sales lead qualification
  drift [department] choice: expected sales, got (missing) (tolerance 0.1)
  drift [leadQuality] choice: expected 0.850, got (missing) (tolerance 0.1)
FAIL CRAToolkit support routing
  drift [department] choice: expected technical, got billing (tolerance 0.1)
  drift [department] confidence: expected 0.900, got 0.550 (tolerance 0.1)

1/4 tests passed
```

Exit code is `0` when every test passes, `1` otherwise — wire it into CI to
catch drift on every model deploy.

## Project layout

- `src/types.ts` — test case, API response, and result types
- `src/client.ts` — thin axios wrapper around the Jev API
- `src/runner.ts` — loads test cases, calls the API, evaluates drift
- `src/report.ts` — terminal output
- `src/index.ts` — CLI entrypoint
- `bin/jev-watch.js` — executable shim
- `examples/` — four sample test cases
